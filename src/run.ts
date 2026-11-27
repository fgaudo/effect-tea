// The run: a program started by plain code, and the effect that runs its effects (`docs/records/store-and-effects.md`).
import type * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"
import type * as Scope from "effect/Scope"
import * as Core from "./core.ts"
import type { Dispatch } from "./dispatch.ts"
import type { RunOptions } from "./engine.ts"
import * as Engine from "./engine.ts"
import { type FlagsOption, listenOf, type Program, runCommandOf, startOf } from "./program.ts"
import * as Shell from "./shell.ts"
import type { Step } from "./update.ts"

/**
 * A handle on a program that was started, which a renderer reads.
 *
 * A renderer reads the model when it draws, and is told of each new state in the call that made it. One that draws
 * later reads the latest model when it draws.
 *
 * @example
 * ```ts
 * const draw = (app: App<Model, Message>) => {
 *   console.log(app.model().count)
 *   app.dispatch(app.model().increment)
 * }
 * ```
 *
 * @see The guide, "Running".
 * @see The guide, "Writing a bridge".
 */
export interface App<Model, Message> {
  /**
   * The model of the current state. It is made when it is read, once while that state is the current one, so every
   * read then gives the very same model. When `makeModel` throws, the defect is a defect in `'render'`, recorded once
   * while that state is the current one, and `model()` throws it.
   *
   * @see The guide, "Guarantees".
   */
  readonly model: () => Model
  /**
   * Tells `listener` of each new state, once it is the current one, in the call that made it, and returns what stops
   * it. No listener is told of a rejected message, nor of the very same state. A stop takes effect at once: a listener
   * stopped during a notice is not told of it. One added during a notice is told from the next state. A listener that
   * throws is a defect in `'render'`, and the others are still told of that state.
   *
   * @see The guide, "Running".
   */
  readonly subscribe: (listener: () => void) => () => void
  /**
   * The program's dispatch: it applies the message before it returns. It is the very same function for the whole run.
   *
   * @see The guide, "Running".
   * @see The guide, "View".
   */
  readonly dispatch: Dispatch<Message>
  /**
   * Takes what a renderer threw as it drew, for a defect in `'render'`: from then on the program applies no message,
   * and its run dies of it. It is for a renderer that draws outside a listener, as in a microtask, where nothing of the
   * run calls it. A defect that `model()` threw, of `makeModel` or of `init`, is taken as it is, and stays one defect.
   * Once the run has ended, it throws back what the run's cause does not hold.
   *
   * @see The guide, "Running".
   */
  readonly die: (thrown: unknown) => void
}

/**
 * A program started: `app`, the handle a renderer reads, and `run`, the effect that runs the program's effects.
 *
 * - The handle is made by plain code, with no fiber: `init`, the first state and its keys. A message sent before `run`
 *   starts is applied all the same, and its effects wait for `run`.
 * - `run` starts the subscriptions and the commands of the states, in their order, and dies with the defects of the
 *   program. It never succeeds: whoever runs the program ends it by interrupting `run`.
 * - A program started is run once: a second `run` dies. One whose `run` is interrupted before it begins is as one
 *   never run: its messages are applied with no effect, it reports no defect, and it may still be run.
 * - Nothing checks that `run` runs. Until it does, no defect is reported: from a defect on, the program applies no
 *   message, and `run` dies of it once it runs.
 * - An `init` that takes flags and throws is a defect in `'init'`: the handle is made all the same, `model()` throws
 *   the defect, and `run` dies of it. The `init` of a parent without flags runs as `make` makes the parent. A defect
 *   in `subscriptions` on the first state is recorded as the program starts too, and `run` dies of it.
 *
 * @example
 * ```ts
 * const { app, run }: Started<Model, Message> = start(counter)
 * drawInto(root, { app, view })
 * Effect.runFork(run)
 * ```
 *
 * @see The guide, "Running".
 * @see The guide, "Guarantees".
 */
export interface Started<Model, Message, R = never> {
  /** The handle a renderer reads. */
  readonly app: App<Model, Message>
  /** Runs the effects of the program, until it is interrupted or a defect ends it. */
  readonly run: Effect.Effect<never, never, R>
}

type Made<State, Model> =
  | Readonly<{ state: State; made: true; model: Model }>
  | Readonly<{ state: State; made: false; defect: unknown }>

// What a handle is made of: the engine is missing when `init` threw, and there is no state. `end` is given the
// defects of the run's cause, in the thunk where the run reads them from its register.
type Parts<State, Model, Message, R, Key> = Readonly<{
  app: App<Model, Message>
  engine: Engine.Engine<State, Message, R, Key> | undefined
  end: (deaths: ReadonlyArray<Cause.Die>) => void
}>

/**
 * The handle and the engine, by plain code, outside any fiber: `init`, the engine, and the model of the current state,
 * made when it is read. The run gives the engine the program's `runCommand` and `listen` (`startWith`); a testing tool
 * that runs the engine itself gives what its fibers run and what it is told, and reads its models through the handle,
 * as a renderer does.
 */
export const partsOf = <State, Model, Message, Command, CommandServices, SubscriptionServices, Flags, Key, Event, R>(
  program: Program<{
    state: State
    model: Model
    message: Message
    command: Command
    commandServices: CommandServices
    subscriptionServices: SubscriptionServices
    event: Event
    flags: Flags
    key: Key
  }>,
  options: RunOptions<State, Message, Command> & Readonly<{ flags?: unknown }>,
  deaths: Shell.Deaths,
  settled: () => void,
  fibers: Engine.Fibers<Message, Command, R, Key> & Engine.Told<State, Command, Key, Event>
): Parts<State, Model, Message, R, Key> => {
  const { flags, ...runOptions } = options
  // The defects the handle threw to a reader, recorded where they were thrown: those of `makeModel`, and that of an
  // `init` that threw. A listener's site and `die` take them as they are, so that a defect a renderer gives back is one
  // defect, wherever it read it.
  const thrownToReaders = new Set<unknown>()
  const isThrown = (defect: unknown) => thrownToReaders.has(defect)
  // The defects of the run's cause, once the run has read them. A defect given to `die` that they lack is in no cause:
  // it is thrown back to the renderer, never kept in silence. The record and the check are one thunk, the record
  // first, since it may end the run on its stack; and so are the end and the read.
  let ended: ReadonlyArray<Cause.Die> | undefined
  const die = (thrown: unknown) => {
    const defect = Engine.recordThrown(deaths, "render", thrown, undefined, isThrown)
    if (ended !== undefined && !ended.some((death) => death.defect === defect)) throw defect
  }
  const end = (read: ReadonlyArray<Cause.Die>) => {
    ended = read
  }
  // A step is data: only an `init` that makes it from the flags can throw.
  let init: Step<State, Command>
  try {
    init = startOf(program.init, flags)
  } catch (thrown) {
    const defect = Engine.recordThrown(deaths, "init", thrown)
    thrownToReaders.add(defect)
    const dead: App<Model, Message> = {
      model: () => {
        throw defect
      },
      subscribe: () => () => undefined,
      dispatch: () => undefined,
      die
    }
    return { app: dead, engine: undefined, end }
  }
  const engine = Engine.build<State, Message, Command, R, Key, Event>({
    ...runOptions,
    ...fibers,
    deaths,
    rendered: isThrown,
    settled,
    init,
    update: program.update,
    subscriptions: program.subscriptions
  })
  // The last state a model was made of, with its model or the defect `makeModel` threw: a model is made only when it
  // is read, and once for each state, by its identity, a failed one too. An option, since any value may be a state.
  const make = (state: State): Made<State, Model> => {
    try {
      return { state, made: true, model: program.makeModel(state) }
    } catch (thrown) {
      // Recorded here, wherever the model is read: in a listener, or outside any fiber.
      const defect = Engine.recordThrown(deaths, "render", thrown)
      thrownToReaders.add(defect)
      return { state, made: false, defect }
    }
  }
  let last: Opt.Option<Made<State, Model>> = Opt.none()
  const model = (): Model => {
    const state = engine.current()
    const current = Opt.isSome(last) && Object.is(last.value.state, state) ? last.value : make(state)
    last = Opt.some(current)
    if (current.made) return current.model
    throw current.defect
  }
  return { app: { model, subscribe: engine.subscribe, dispatch: engine.dispatch, die }, engine, end }
}

/**
 * `start`, with its options as one value, recording what the program dies of in `deaths`: for a testing tool, which
 * passes the options on as it got them, and reads what the fibers died of. `began` is called once the run has started
 * the effects of the first state, on the run's own stack: a fiber forked for the run starts when the scheduler says,
 * and one interrupted before it begins leaves the program as it was, not stopped. `settled` is called as each call
 * that applies messages returns, once its step is done (`Engine.build`).
 */
export const startWith = <State, Model, Message, Command, CommandServices, SubscriptionServices, Flags, Key>(
  program: Program<{
    state: State
    model: Model
    message: Message
    command: Command
    commandServices: CommandServices
    subscriptionServices: SubscriptionServices
    flags: Flags
    key: Key
  }>,
  options: RunOptions<State, Message, Command> & Readonly<{ flags?: unknown }>,
  deaths: Shell.Deaths,
  began: () => void = () => undefined,
  settled: () => void = () => undefined
): Started<Model, Message, Needed<Command, CommandServices, Key, SubscriptionServices>> => {
  const fibers: Engine.Fibers<Message, Command, CommandServices | SubscriptionServices, Key> = {
    runCommand: runCommandOf(program),
    listen: listenOf(program)
  }
  const { app, engine, end } = partsOf(program, options, deaths, settled, fibers)
  // The effects of the states, until a defect: the scope's end stops the engine, interrupts its fibers and waits for
  // them, and what they die of is in the register. With no engine, `init` threw, and the register holds its defect.
  const effects: Effect.Effect<void, never, Exclude<CommandServices | SubscriptionServices, Scope.Scope>> =
    engine === undefined
      ? Effect.void
      : engine.effects.pipe(Effect.andThen(Effect.sync(began)), Effect.andThen(engine.died), Effect.scoped)
  let begun = false
  // Not an `Effect.fn`: a span of its own would be the one the run's fibers log into (see `Shell.withExternalSpan`).
  // The region nothing interrupts is the first operation of the run, and holds the check of `begun`, its mark, and the
  // end: a fiber interrupted before it leaves the handle as it was, and one that has marked it always stops the engine,
  // though interrupted at a yield of the scheduler before the scope of the effects has added the engine's own stop.
  const run = Effect.uninterruptibleMask((restore) =>
    Effect.suspend(() => {
      if (begun) return Effect.die(new Error("A program that was started is run once: start it again to run it again"))
      begun = true
      // The fiber of the run, the engine's fibers and its thunk record what they die of in one place: the defects come
      // first in the cause, in the order they died, then the rest of what the run ended with (an interruption by
      // whoever runs it), but for the defects already among them, by their identity. The read is the end of the run.
      return Effect.exit(restore(effects)).pipe(Effect.flatMap((exit) => {
        engine?.end()
        const read = deaths.all()
        end(read)
        return Core.endedWith(read, exit)
      }))
    })
  )
  // What `Needed` leaves out is never asked: a program without commands calls no `runCommand`, one without keys no
  // `listen`. And the run never succeeds: its effects succeed only once the register holds a defect, which the read
  // puts in what it fails with.
  return { app, run: run as Effect.Effect<never, never, Needed<Command, CommandServices, Key, SubscriptionServices>> }
}

/**
 * Reads the model of every state through the handle, for a testing tool told of each one: that of each new state in a
 * listener, on whatever stack made the state, given to `read`, and the first one, returned, whatever the first keys
 * did, as a renderer reads it to draw. A model that throws is recorded once, in `'render'`, where it is read, as the
 * handle records it, and the step goes on whole: the first is then `None`, and `read` is not called for a later one.
 * Returns what stops the listener too.
 */
export const readEach = <Model, Message>(
  app: App<Model, Message>,
  read: (model: Model) => void
): Readonly<{ first: Opt.Option<Model>; unsubscribe: () => void }> => {
  // Subscribed before the first read, so that no state is missed.
  const unsubscribe = app.subscribe(() => read(app.model()))
  try {
    return { first: Opt.some(app.model()), unsubscribe }
  } catch {
    // Recorded where the model was read, or by `init`: the run dies of it.
    return { first: Opt.none(), unsubscribe }
  }
}

/**
 * Starts a program, by plain code, with no fiber and no effect: it makes the first state and its keys, and calls
 * `init` with the flags for a program that has them. It gives the handle a renderer reads, and `run`, the effect that
 * runs the program's effects.
 *
 * - A message sent before `run` starts is applied all the same, and its effects wait for `run`. So does the report of
 *   a defect: from the defect on, the program applies no message.
 * - A program started is run once. Whoever runs it ends it by interrupting `run`. Nothing checks that it is run.
 * - An `init` that takes flags and throws gives a handle whose `model()` throws the defect, and whose `run` dies of
 *   it. The `init` of a parent without flags runs as `make` makes the parent.
 * - One message at a time, in the order they were sent. A message is applied in the call that sends it. The
 *   subscriptions it stops and starts, and the start of its commands, follow in the run, in the order of the states.
 *   So the state is ahead of its effects.
 * - The run writes no log of its own.
 * - A message that `update` rejects is ignored, and the state stays as it was.
 * - Each command and each subscription has a scope of its own. What one acquires is released when it ends, never
 *   while it still runs. The next message does not wait for a release, but the effects of the next state do. So keep
 *   releases quick.
 * - The span of whoever runs it does not keep what the run's fibers log.
 * - A defect anywhere in the program ends the run, which dies with a `ProgramDefect`. A command or a subscription that
 *   the program interrupts is a defect too. Reporting the crash is the job of the app around the run.
 *
 * @param program - The program to start, one without events.
 * @param options - `flags`, when the program has them, and the options of {@link RunOptions}.
 *
 * @example
 * ```ts
 * const { app, run } = start(counter)
 * drawInto(root, { app, view })
 * Effect.runFork(run)
 * ```
 *
 * @see The guide, "Running".
 * @see The guide, "Guarantees".
 */
export const start = <
  State,
  Model,
  Message,
  Command = never,
  CommandServices = never,
  SubscriptionServices = never,
  Flags = never,
  Key = never,
  External = never,
  Output = never
>(
  program: Program<{
    state: State
    model: Model
    message: Message
    command: Command
    commandServices: CommandServices
    subscriptionServices: SubscriptionServices
    flags: Flags
    key: Key
    external: External
    output: Output
  }>,
  ...[options = {}]: [Flags] extends [never]
    ? [options?: RunOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>>]
    : [options: RunOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>> & FlagsOption<NoInfer<Flags>>]
): Started<Model, Message, Needed<Command, CommandServices, Key, SubscriptionServices>> =>
  startWith(program, options, Shell.makeDeaths(() => true))

// What a run needs of the services a program names: none of a program without commands, nor without keys, which runs
// no `runCommand`, or no `listen`. A program typed `Program<{ …; commandServices: Db }>` without commands gives
// `CommandServices` from the arguments of the alias, where `CommandServicesOf` reads none. Kept to this module, so
// that a consumer's declarations spell it out, and written again in `testing/drive.ts`.
type Needed<Command, CommandServices, Key, SubscriptionServices> = Exclude<
  ([Command] extends [never] ? never : CommandServices) | ([Key] extends [never] ? never : SubscriptionServices),
  Scope.Scope
>
