// `drive` starts the program and runs it: it is told of every state, and reads the model of each one.
import * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Deferred from "effect/Deferred"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Opt from "effect/Option"
import type * as Scope from "effect/Scope"
import { endedWith } from "../core.ts"
import type { Dispatch } from "../dispatch.ts"
import type { RunOptions } from "../engine.ts"
import type { FlagsOption, Program } from "../program.ts"
import { type App, readEach, type Started, startWith } from "../run.ts"
import { type Deaths, makeDeaths } from "../shell.ts"

/**
 * The user of a program that `drive` runs: it waits for what the models show, and sends what they show.
 *
 * @example
 * ```ts
 * yield* driver.send((model) => Opt.some(model.increment))
 * const count = yield* driver.waitFor((model) => (model.count === 1 ? Opt.some(model.count) : Opt.none()))
 * ```
 *
 * @see The guide, "Testing tools", "drive".
 */
export type Driver<Model, Message> = {
  /** Waits for a model that `select` maps to `Some`, the current one or a later one, and returns that value. */
  readonly waitFor: <A>(select: (model: Model) => Opt.Option<A>) => Effect.Effect<A>
  /**
   * Waits for a model on which `select` finds a message, the current one or a later one, and sends it at once, as a
   * control drawn from that model would: when it returns, `update` has seen the message.
   */
  readonly send: (select: (model: Model) => Opt.Option<Message>) => Effect.Effect<void>
  /** The model of the current state. After a defect of the program, it fails with the defect. */
  readonly model: Effect.Effect<Model>
  /** The run's own dispatch: for a tap on a model that the state has moved past since. */
  readonly dispatch: Dispatch<Message>
}

/**
 * The options of `drive`: those of `start`, and how long a wait lasts.
 *
 * @example
 * ```ts
 * drive(program, scenario, { patience: '5 seconds' })
 * ```
 */
export interface DriveOptions<State, Message, Command = unknown> extends RunOptions<State, Message, Command> {
  /** How long a wait of the scenario lasts before it fails: 2 seconds by default, measured with the real clock. */
  readonly patience?: Duration.Input
}

// What `drive` keeps of the program it reads: the model it read last, of the current state, a place among the models
// read for a wait, and what the waits wait on until the next state is current.
type Shown<Model, Message> = Readonly<{
  app: App<Model, Message>
  latest: () => Model
  place: () => Place<Model>
  changed: () => Deferred.Deferred<void>
}>

// A wait's place among the models read, from the current one: `read` gives each in order, then `None` until the next
// state. A place is let go once its wait ends, however it ends, so that the models it would read are no longer kept.
type Place<Model> = Readonly<{
  read: () => Opt.Option<Model>
  release: () => void
}>

// Plain code: the program started, the handle there before any fiber, so that the driver's dispatch is the program's
// from the scenario's first step, and `init` has been called before it begins, as in `rehearse`. Told of every state,
// `drive` reads the model of each one, in the listener, on whatever stack made the state, and wakes the waits only once
// the call that applied it has returned, its step done, as the engine offers its jobs: so a wait it wakes runs outside
// the step, wherever Effect resumes it, and a `send` it makes is applied before it returns. A model that throws is
// recorded once, in `'render'`, where it is read (`readEach`, as `rehearse` reads them).
const driven = <Model, Message, R>(
  starting: (deaths: Deaths, began: () => void, settled: () => void) => Started<Model, Message, R>
) => {
  // What the program's fibers die of, the defects of `makeModel` a read meets included, as `drive` ends with it.
  const deaths = makeDeaths(() => true)
  const running = Deferred.makeUnsafe<void>()
  // The models read, in order, the latest last: `models[0]` is the one at `oldest`, counted from the first. Those
  // before the latest are kept only while a wait has still to read them: a wait woken by a state may run after another
  // wait woken by it has sent, and so made a later state, and it still looks at the model that woke it.
  const models: Array<Model> = []
  let oldest = 0
  // Where each wait has read to: the place of the next model it reads.
  const places = new Set<{ at: number }>()
  const trim = () => {
    let kept = oldest + models.length - 1
    for (const place of places) kept = Math.min(kept, place.at)
    if (kept <= oldest) return
    models.splice(0, kept - oldest)
    oldest = kept
  }
  const place = (): Place<Model> => {
    const held = { at: oldest + models.length - 1 }
    places.add(held)
    return {
      read: () => {
        if (held.at >= oldest + models.length) return Opt.none()
        const model = models[held.at - oldest] as Model
        held.at++
        return Opt.some(model)
      },
      release: () => {
        places.delete(held)
        trim()
      }
    }
  }
  let changed = Deferred.makeUnsafe<void>()
  // Whether a state was made since the waits were last woken.
  let told = false
  const settled = () => {
    if (!told) return
    told = false
    const woken = changed
    changed = Deferred.makeUnsafe<void>()
    Deferred.doneUnsafe(woken, Effect.void)
  }
  // Said once the run has started the effects of the first state, unless the program has died by then: of `init`, of
  // its first keys, of its first model, or of what the first state started. The check and the notice are one thunk.
  const { app, run } = starting(deaths, () => {
    if (!deaths.dead()) Deferred.doneUnsafe(running, Effect.void)
  }, settled)
  const { first, unsubscribe } = readEach(app, (model) => {
    models.push(model)
    told = true
    trim()
  })
  if (Opt.isSome(first)) models.push(first.value)
  const now: Shown<Model, Message> = {
    app,
    latest: () => models[models.length - 1] as Model,
    place,
    changed: () => changed
  }
  return { deaths, began: Deferred.await(running), now, run, unsubscribe }
}

// The services that the run `startWith` gives needs, as `run.ts` says where it writes them.
type Needed<Command, RC, Key, RS> = Exclude<
  ([Command] extends [never] ? never : RC) | ([Key] extends [never] ? never : RS),
  Scope.Scope
>

/**
 * Runs a program and plays a scenario on its models, as a user would.
 *
 * It takes the program to run, one without events; the scenario, what the user does through the {@link Driver} it is
 * given; and its options: `flags`, when the program has them, `patience`, and the options of `RunOptions`.
 *
 * - It sends what the models show, through the run's dispatch. The program's subscriptions run.
 * - A wait that lasts longer than `patience` fails. `patience` is 2 seconds by default, measured with the real clock.
 *   The error's `cause` is the latest model.
 * - Time in `drive` is real. A model may be past when its message arrives, so a rejected message is ignored, as in a
 *   run.
 * - A wait looks at the current model and at later ones. One that ends once a model shows a step does not wait for
 *   the step's commands: they start after it, and a scenario that ends there may end the run before they start.
 * - The program's commands run as soon as they start. To hold a command, give the program a service that waits on a
 *   `Deferred` that the scenario completes.
 * - A model shows neither that a command has started nor that a subscription has. To wait for one, give the program a
 *   service that completes a `Deferred` when it is called, and await it in the scenario.
 * - To start from another state, give it the program with another `init`.
 * - When the scenario ends, or when whoever runs `drive` interrupts it, `drive` interrupts the run and waits for it.
 * - A defect of the program fails `drive` with the `ProgramDefect` the run dies with. The defect comes first in the
 *   cause, before what the scenario ended with.
 *
 * @returns What `scenario` returns, once the program has stopped.
 *
 * @example
 * ```ts
 * const count = yield* drive(
 *   counter,
 *   Effect.fnUntraced(function*(driver) {
 *     yield* driver.send((model) => Opt.some(model.increment))
 *     return yield* driver.waitFor((model) => (model.count === 1 ? Opt.some(model.count) : Opt.none()))
 *   }),
 * )
 * ```
 *
 * @see The guide, "Testing tools", "drive".
 * @see The guide, "Testing tools", "How `drive` ends".
 * @see The guide, "Testing tools", "Defects of the program".
 * @see The guide, "Running".
 */
export const drive = Effect.fnUntraced(function*<
  State,
  Model,
  Message,
  Command = never,
  RC = never,
  RS = never,
  A = unknown,
  E = never,
  RT = never,
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
    commandServices: RC
    subscriptionServices: RS
    flags: Flags
    key: Key
    external: External
    output: Output
  }>,
  scenario: (driver: Driver<Model, Message>) => Effect.Effect<A, E, RT>,
  ...[{ patience = "2 seconds", ...options } = {}]: [Flags] extends [never]
    ? [options?: DriveOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>>]
    : [options: DriveOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>> & FlagsOption<NoInfer<Flags>>]
): Effect.fn.Return<A, E, Needed<Command, RC, Key, RS> | RT> {
  const { deaths, began, now, run, unsubscribe } = driven<Model, Message, Needed<Command, RC, Key, RS>>((
    deaths,
    began,
    settled
  ) =>
    startWith(
      program,
      // The rest of the options keeps the flags the parameter's type requires.
      options as RunOptions<State, Message, Command>,
      deaths,
      began,
      settled
    )
  )
  // The first model `select` maps to `Some`, the current one or a later one, each read in order from the wait's place:
  // what the waits wait on is taken before the models are read, in one step, so that no state made in between is
  // missed. The place is taken where nothing interrupts, so that a wait that runs out of patience at once still lets
  // it go.
  const first = <B>({ latest, place, changed }: Shown<Model, Message>, select: (model: Model) => Opt.Option<B>) => {
    const look = Effect.acquireUseRelease(Effect.sync(place), (at) => {
      const scan: Effect.Effect<B> = Effect.suspend(() => {
        const next = changed()
        for (let model = at.read(); Opt.isSome(model); model = at.read()) {
          const found = select(model.value)
          if (Opt.isSome(found)) return Effect.succeed(found.value)
        }
        return Effect.andThen(Deferred.await(next), scan)
      })
      return scan
    }, (at) => Effect.sync(at.release))
    return look.pipe(
      Effect.timeoutOption(patience),
      // Measured with the real clock: under a `TestClock` that nobody adjusts, a wait would never end.
      Effect.provideService(Clock.Clock, Clock.Clock.defaultValue()),
      Effect.flatMap(Opt.match({
        onNone: () =>
          Effect.die(
            new Error(
              `No model showed what the test waits for within ${Duration.format(Duration.fromInputUnsafe(patience))}`,
              { cause: latest() }
            )
          ),
        onSome: Effect.succeed
      }))
    )
  }
  const driverOf = (now: Shown<Model, Message>): Driver<Model, Message> => ({
    waitFor: (select) => first(now, select),
    // Selected and sent in one step, in the thunk that looks at the model, as a handler drawn from that model sends it:
    // sent once the wait has returned, past its race with the patience, it could find a later state.
    send: (select) => first(now, (model) => Opt.map(select(model), now.app.dispatch)),
    model: Effect.suspend(() => {
      const dies = deaths.all()
      return Arr.isReadonlyArrayNonEmpty(dies)
        ? Effect.failCause(Cause.fromReasons<never>(dies))
        : Effect.succeed(now.latest())
    }),
    dispatch: now.app.dispatch
  })
  // Stopped and awaited however `drive` ends, interrupted by whoever runs it too: its exit holds what the program
  // dies of as it releases what it holds.
  return yield* Effect.uninterruptibleMask(Effect.fnUntraced(function*(restore) {
    // Not `restore(run)`: it would give the run the region of whoever runs `drive`, uninterruptible where that is,
    // when a fiber forked here is interruptible all the same (`Effect.forkChild`).
    const fiber = yield* Effect.forkChild(run)
    // A run that ends first, of a defect, ends `drive`, whatever the scenario was doing.
    const ended = yield* Effect.exit(restore(Effect.raceFirst(
      // The scenario begins once the run has started the effects of the first state, as a user meets a program that
      // runs: a run that ends first ends `drive`, the scenario never begun.
      Effect.flatMap(began, () =>
        // Suspended, so that a scenario that throws before it returns its effect fails here, past nothing of the end.
        Effect.asSome(Effect.exit(Effect.suspend(() => scenario(driverOf(now)))))),
      Effect.as(Fiber.await(fiber), Opt.none())
    )))
    yield* Fiber.interrupt(fiber)
    const stopped = yield* Fiber.await(fiber)
    unsubscribe()
    // What the scenario ended with, or how `drive` was interrupted. Once the run has ended, of a defect as of
    // anything else, what the scenario ended with is dropped. Interrupted, the run dies of what its fibers die of as
    // they release what they hold, as when whoever runs it interrupts it: the defects first, in the order they died.
    const outcome = Exit.isSuccess(ended) ? ended.value : Opt.some(Exit.failCause(ended.cause))
    return yield* endedWith(deaths.all(), Opt.getOrElse(outcome, () => stopped))
  }))
})
