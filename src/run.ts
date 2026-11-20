// The run: a program started by plain code, and the effect that runs its effects (`docs/records/store-and-effects.md`);
// and, composed of the two, `run`, which hands a renderer a handle on the running program.
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import type * as Scope from "effect/Scope"
import * as Core from "./core.ts"
import type { Dispatch } from "./dispatch.ts"
import type { RunOptions } from "./engine.ts"
import * as Engine from "./engine.ts"
import { type FlagsOption, runCommandOf, type Shape, startOf } from "./program.ts"
import * as Shell from "./shell.ts"
import type { Step } from "./update.ts"

/**
 * What `run` hands the renderer: a handle on the running program.
 *
 * A renderer reads the model when it draws, and is told of each new state in the call that made it. One that draws
 * later reads the latest model when it draws.
 *
 * @example
 * ```ts
 * const render = (app: App<Model, Message>) =>
 *   Effect.sync(() => {
 *     console.log(app.model().count)
 *     app.dispatch(app.model().increment)
 *   })
 * ```
 *
 * @see The guide, "Running", "The renderer gets an `App`".
 * @see The guide, "Running", "A renderer reads the model when it draws".
 * @see The guide, "Writing a bridge", "The handle".
 */
export interface App<Model, Message> {
  /**
   * The model of the current state. It is made when it is read, once for each state, by the state's identity, so the
   * very same state has the very same model. When `makeModel` throws, the defect is a defect in `'render'`, recorded
   * once for each state, and `model()` throws it.
   *
   * @see The guide, "Guarantees", "A model is made only when it is read".
   */
  readonly model: () => Model
  /**
   * Tells `listener` of each new state, once it is the current one, in the call that made it, and returns what stops
   * it. No listener is told of a rejected message, nor of the very same state. A listener that throws is a defect in
   * `'render'`.
   *
   * @see The guide, "Running", "The renderer gets an `App`".
   */
  readonly subscribe: (listener: () => void) => () => void
  /**
   * The program's dispatch: it applies the message before it returns. It is the very same function for the whole run.
   *
   * @see The guide, "Running", "The `dispatch` of the `App` is the very same function for the whole run".
   * @see The guide, "View", "Sending applies the message".
   */
  readonly dispatch: Dispatch<Message>
  /**
   * Takes what a renderer threw as it drew, for a defect in `'render'`: from then on the program applies no message,
   * and its run dies of it. It is for a renderer that draws outside a listener, as in a microtask, where nothing of the
   * run calls it. A defect of `makeModel` that `model()` threw is taken as it is, and stays one defect.
   */
  readonly die: (thrown: unknown) => void
}

/**
 * A program started: the handle a renderer reads, and `run`, the effect that runs the program's effects.
 *
 * - The handle is made by plain code, with no fiber: `init`, the first state and its keys. A message sent before `run`
 *   starts is applied all the same, and its effects wait for `run`.
 * - `run` starts the subscriptions and the commands of the states, in their order, and dies with the defects of the
 *   program. It never succeeds: whoever runs the program ends it by interrupting `run`.
 * - A program started is run once: a second `run` dies. One whose `run` is interrupted before it begins is left as it
 *   was, and is never stopped.
 * - An `init` that throws is a defect in `'init'`: the handle is made all the same, `model()` throws the defect, and
 *   `run` dies of it.
 *
 * @example
 * ```ts
 * const app: Started<Model, Message> = start(counter)
 * Effect.runFork(app.run)
 * ```
 */
export interface Started<Model, Message, R = never> extends App<Model, Message> {
  /** Runs the effects of the program, until it is interrupted or a defect ends it. */
  readonly run: Effect.Effect<never, never, R>
}

type Made<State, Model> =
  | Readonly<{ state: State; made: true; model: Model }>
  | Readonly<{ state: State; made: false; defect: unknown }>

// What a handle is made of: the engine is missing when `init` threw, and there is no state.
type Parts<State, Model, Message, R> = Readonly<{
  app: App<Model, Message>
  engine: Engine.Engine<State, Message, R> | undefined
  isModels: (defect: unknown) => boolean
}>

// Plain code, outside any fiber: `init`, the engine, and the model of the current state, made when it is read.
const partsOf = <State, Model, Message, Command, RC, RS, Flags>(
  program: Shape<State, Model, Message, Command, RC, RS, never, never, Flags>,
  options: RunOptions<State, Message, Command> & Readonly<{ flags?: unknown }>,
  deaths: Shell.Deaths
): Parts<State, Model, Message, RC | RS> => {
  const { flags, ...runOptions } = options
  // The defects of `makeModel` recorded where a model was read: the renderer's own site takes them as they are, in
  // its fiber, in a listener and in `die` alike, so that a model that throws is one defect, wherever it is read.
  const ofModels = new Set<unknown>()
  const isModels = (defect: unknown) => ofModels.has(defect)
  const die = (thrown: unknown) => void Engine.recordThrown(deaths, "render", thrown, undefined, isModels)
  // A step is data: only an `init` that makes it from the flags can throw.
  let init: Step<State, Command>
  try {
    init = startOf(program.init, flags)
  } catch (thrown) {
    const defect = Engine.recordThrown(deaths, "init", thrown)
    const dead: App<Model, Message> = {
      model: () => {
        throw defect
      },
      subscribe: () => () => undefined,
      dispatch: () => undefined,
      die
    }
    return { app: dead, engine: undefined, isModels }
  }
  const engine = Engine.build<State, Message, Command, RC | RS, unknown>({
    ...runOptions,
    deaths,
    rendered: isModels,
    init,
    update: program.update,
    runCommand: runCommandOf(program),
    subscriptions: program.subscriptions
  })
  // The last state a model was made of, with its model or the defect `makeModel` threw: a model is made only when it
  // is read, and once for each state, by its identity, a failed one too.
  let last: Made<State, Model> | undefined
  const model = (): Model => {
    const { state } = engine.current()
    if (last?.state !== state) {
      try {
        last = { state, made: true, model: program.makeModel(state) }
      } catch (thrown) {
        // Recorded here, wherever the model is read: in a listener, in the renderer's fiber, or outside any fiber.
        const defect = Engine.recordThrown(deaths, "render", thrown)
        ofModels.add(defect)
        last = { state, made: false, defect }
      }
    }
    if (last.made) return last.model
    throw last.defect
  }
  return { app: { model, subscribe: engine.subscribe, dispatch: engine.dispatch, die }, engine, isModels }
}

/**
 * `start`, with its options as one value, recording what the program dies of in `deaths`: for a testing tool, which
 * passes the options on as it got them, and reads what the fibers died of. `began` is called once the run has started
 * the effects of the first state, on the run's own stack: a fiber forked for the run starts when the scheduler says,
 * and one interrupted before it begins leaves the program as it was, not stopped.
 */
export const startWith = <State, Model, Message, Command, RC, RS, Flags>(
  program: Shape<State, Model, Message, Command, RC, RS, never, never, Flags>,
  options: RunOptions<State, Message, Command> & Readonly<{ flags?: unknown }>,
  deaths: Shell.Deaths,
  began: () => void = () => undefined
): Started<Model, Message, Exclude<RC | RS, Scope.Scope>> => {
  const { app, engine } = partsOf(program, options, deaths)
  // The effects of the states, until a defect: the scope's end stops the engine, interrupts its fibers and dies of
  // what they died of. With no engine, `init` threw, and the run dies of that at once.
  const effects: Effect.Effect<never, never, Exclude<RC | RS, Scope.Scope>> = engine === undefined
    ? Effect.andThen(deaths.report, Effect.never)
    : engine.effects.pipe(
      Effect.andThen(Effect.sync(began)),
      Effect.andThen(engine.died),
      Effect.andThen(engine.report),
      Effect.andThen(Effect.never),
      Effect.scoped
    )
  let begun = false
  // Not an `Effect.fn`: a span of its own would be the one the run's fibers log into (see `Shell.withExternalSpan`).
  const run = Effect.suspend(() => {
    // One thunk with the first operation of the run: a fiber interrupted before it leaves the handle as it was.
    if (begun) return Effect.die(new Error("A program that was started is run once: start it again to run it again"))
    begun = true
    // The fiber of the run, the engine's fibers and its thunk record what they die of in one place: the defects come
    // first in the cause, in the order they died, then the rest of what the run ended with (an interruption by
    // whoever runs it), but for the defects already among them, by their identity.
    return Effect.uninterruptibleMask((restore) =>
      Effect.exit(restore(effects)).pipe(Effect.flatMap((exit) => Core.endedWith(deaths.all(), exit)))
    )
  })
  return { ...app, run }
}

/**
 * Starts a program, by plain code, with no fiber and no effect: it calls `init`, and makes the first state and its
 * keys. It gives the handle a renderer reads, and `run`, the effect that runs the program's effects.
 *
 * - A message sent before `run` starts is applied all the same, and its effects wait for `run`.
 * - A program started is run once. Whoever runs it ends it by interrupting `run`.
 * - An `init` that throws gives a handle whose `model()` throws the defect, and whose `run` dies of it.
 *
 * @param program - The program to start, one without events.
 * @param options - `flags`, when the program has them, and the options of {@link RunOptions}.
 *
 * @example
 * ```ts
 * const app = start(counter)
 * console.log(app.model().count)
 * Effect.runFork(app.run)
 * ```
 */
export const start = <State, Model, Message, Command = never, RC = never, RS = never, Flags = never>(
  program: Shape<State, Model, Message, Command, RC, RS, never, never, Flags>,
  ...[options = {}]: [Flags] extends [never]
    ? [options?: RunOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>>]
    : [options: RunOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>> & FlagsOption<NoInfer<Flags>>]
): Started<Model, Message, Exclude<RC | RS, Scope.Scope>> => startWith(program, options, Shell.makeDeaths(() => true))

/**
 * `run`, with its options as one value, recording what its fibers die of in `deaths`: for a testing tool, which passes
 * the options on as it got them, and ends with what they died of.
 */
// Not an `Effect.fn`: a span of its own would be the one the renderer logs into (see `Shell.withExternalSpan`).
export const runWith = <State, Model, Message, Command, RC, RS, RR, Flags>(
  program: Shape<State, Model, Message, Command, RC, RS, never, never, Flags>,
  render: (app: App<Model, Message>) => Effect.Effect<void, never, RR>,
  options: RunOptions<State, Message, Command> & Readonly<{ flags?: unknown }>,
  deaths: Shell.Deaths
): Effect.Effect<void, never, Exclude<RC | RS | RR, Scope.Scope>> =>
  // The renderer, the fiber of the run as it starts the effects, the engine's fibers and its thunk record what they
  // die of in one place: the defects come first in the cause, in the order they died, then the rest of what the run
  // ended with (an interruption by whoever runs it), but for the defects already among them, by their identity.
  Effect.uninterruptibleMask((restore) =>
    Effect.exit(restore(running(program, render, options, deaths))).pipe(
      Effect.flatMap((exit) => Core.endedWith(deaths.all(), exit))
    )
  )

// The two halves composed with a renderer that is an effect: the program started, its effects, and the renderer as a
// fiber of the run, with a scope and a site of its own.
const running = Effect.fnUntraced(
  function*<State, Model, Message, Command, RC, RS, RR, Flags>(
    program: Shape<State, Model, Message, Command, RC, RS, never, never, Flags>,
    render: (app: App<Model, Message>) => Effect.Effect<void, never, RR>,
    options: RunOptions<State, Message, Command> & Readonly<{ flags?: unknown }>,
    deaths: Shell.Deaths
  ): Effect.fn.Return<void, never, RC | RS | RR | Scope.Scope> {
    const { app, engine, isModels } = partsOf(program, options, deaths)
    if (engine === undefined) return yield* deaths.report
    yield* engine.effects
    // Called at most once, in a run that died as it started too, as a subscription of `init` may die while the effects
    // start: the end of the run interrupts it, as it does any effect of the program (`docs/invariants.md`).
    const rendering = Effect.suspend(() => render(app)).pipe(
      Shell.scopedIn(deaths, "render", undefined, isModels),
      Shell.rootedIn("render"),
      deaths.recorded,
      Effect.updateContext(Shell.withExternalSpan<Exclude<RR, Scope.Scope>>)
    )
    // However the run ends, it stops the engine first, so that nothing the renderer sends as it
    // releases is applied, then the renderer, before the engine's other fibers. The fork and how the run stops it are
    // one acquisition, which nothing interrupts in between.
    const renderer = yield* Effect.acquireRelease(
      Effect.forkChild(rendering),
      (renderer) => engine.stop.pipe(Effect.andThen(Shell.stopping(renderer)))
    )
    yield* Effect.raceFirst(engine.died, Fiber.await(renderer)).pipe(Effect.andThen(engine.report))
  },
  Effect.scoped
)

/**
 * Runs a program, and hands its renderer an {@link App}: the model of the current state, a notice of each new state,
 * and a dispatch that applies its message before it returns.
 *
 * - The run ends when the renderer ends.
 * - One message at a time, in the order they were sent. A message is applied in the call that sends it. The
 *   subscriptions it stops and starts, and the start of its commands, follow in the run's own fiber, in the order of
 *   the states. So the state is ahead of its effects.
 * - The run writes no log of its own.
 * - A message that `update` rejects is ignored, and the state stays as it was.
 * - Each command, each subscription and the renderer has a scope of its own. What one acquires is released when it
 *   ends, never while it still runs. The next message does not wait for a release, but the effects of the next state
 *   do. So keep releases quick.
 * - The span of whoever runs it does not keep what the run's fibers log.
 * - A defect anywhere ends the run, which dies with a `ProgramDefect`. A command, a subscription, the renderer or an
 *   option that interrupts itself is a defect too. Reporting the crash is the job of the app around the run.
 *
 * @param program - The program to run, one without events.
 * @param render - Draws the model of the {@link App} it is given.
 * @param options - `flags`, when the program has them, and the options of {@link RunOptions}.
 *
 * @example
 * ```ts
 * Effect.runFork(run(counter, renderInto(root, view)))
 * ```
 *
 * @see The guide, "Running", "In short".
 * @see The guide, "Guarantees", "One message at a time, in the order they were sent".
 * @see The guide, "Guarantees", "Outdated clicks are harmless".
 * @see The guide, "Guarantees", "Nothing outlives what acquired it".
 * @see The guide, "Guarantees", "Logs do not pile up in a span".
 * @see The guide, "Guarantees", "Nothing ends in silence".
 * @see The guide, "Running", "Logs".
 */
export const run = <State, Model, Message, Command = never, RC = never, RS = never, RR = never, Flags = never>(
  program: Shape<State, Model, Message, Command, RC, RS, never, never, Flags>,
  render: (app: App<Model, Message>) => Effect.Effect<void, never, RR>,
  ...[options = {}]: [Flags] extends [never]
    ? [options?: RunOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>>]
    : [options: RunOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>> & FlagsOption<NoInfer<Flags>>]
): Effect.Effect<void, never, Exclude<RC | RS | RR, Scope.Scope>> =>
  Effect.suspend(() => runWith(program, render, options, Shell.makeDeaths(() => true)))
