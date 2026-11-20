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
import * as Core from "../core.ts"
import type { Dispatch } from "../dispatch.ts"
import type { RunOptions } from "../engine.ts"
import type { FlagsOption, Shape } from "../program.ts"
import { type App, type Started, startWith } from "../run.ts"
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
 * The options of `drive`: those of `run`, and how long a wait lasts.
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

// What `drive` keeps of the program it reads: the model it read last, of the current state, and what the waits wait on until
// the next state is current.
type Shown<Model, Message> = Readonly<{
  app: App<Model, Message>
  latest: () => Model
  changed: () => Deferred.Deferred<void>
}>

// Plain code: the program started, the handle there before any fiber, so that the driver's dispatch is the program's
// from the scenario's first step, and `init` has been called before it begins, as in `rehearse`. Told of every state,
// `drive` reads the model of each one, in the listener, on whatever stack made the state, and wakes the waits last, so
// that a wait it wakes on that stack finds the model read. A read of the model may wake, on this stack, a fiber that
// makes a newer state, and the read of that one ends first: only the read of the latest notice is kept. A model that
// throws is recorded once, in `'render'`, where it is read.
const driven = <Model, Message, R>(
  starting: (deaths: Deaths, began: () => void) => Started<Model, Message, R>
) => {
  // What the program's fibers die of, the defects of `makeModel` a read meets included, as `drive` ends with it.
  const deaths = makeDeaths(() => true)
  const running = Deferred.makeUnsafe<void>()
  // Said once the run has started the effects of the first state, unless the program has died by then: of `init`, of
  // its first keys, of its first model, or of what the first state started. The check and the notice are one thunk.
  const app = starting(deaths, () => {
    if (!deaths.dead()) Deferred.doneUnsafe(running, Effect.void)
  })
  let notices = 0
  let latest: Model | undefined
  let changed = Deferred.makeUnsafe<void>()
  const read = () => {
    const notice = ++notices
    const model = app.model()
    if (notice === notices) latest = model
  }
  // Subscribed before the first read, so that no state is missed.
  const unsubscribe = app.subscribe(() => {
    read()
    const woken = changed
    changed = Deferred.makeUnsafe<void>()
    Deferred.doneUnsafe(woken, Effect.void)
  })
  try {
    read()
  } catch {
    // Recorded where the model was read, or by `init`: the run dies of it.
  }
  const now: Shown<Model, Message> = { app, latest: () => latest as Model, changed: () => changed }
  return { deaths, began: Deferred.await(running), now, run: app.run, unsubscribe }
}

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
 * @see The guide, "Running", "Starting from another state".
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
  Flags = never
>(
  program: Shape<State, Model, Message, Command, RC, RS, never, never, Flags>,
  scenario: (driver: Driver<Model, Message>) => Effect.Effect<A, E, RT>,
  ...[{ patience = "2 seconds", ...options } = {}]: [Flags] extends [never]
    ? [options?: DriveOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>>]
    : [options: DriveOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>> & FlagsOption<NoInfer<Flags>>]
): Effect.fn.Return<A, E, Exclude<RC | RS, Scope.Scope> | RT> {
  const { deaths, began, now, run, unsubscribe } = driven<Model, Message, Exclude<RC | RS, Scope.Scope>>((
    deaths,
    began
  ) =>
    startWith(
      program,
      // The rest of the options keeps the flags the parameter's type requires.
      options as RunOptions<State, Message, Command>,
      deaths,
      began
    )
  )
  // The first model `select` maps to `Some`, the current one or a later one: what the waits wait on is taken before
  // the model is read, in one step, so that no state made in between is missed.
  const first = <B>({ latest, changed }: Shown<Model, Message>, select: (model: Model) => Opt.Option<B>) => {
    const look: Effect.Effect<B> = Effect.suspend(() => {
      const next = changed()
      const found = select(latest())
      return Opt.isSome(found) ? Effect.succeed(found.value) : Effect.andThen(Deferred.await(next), look)
    })
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
    // Not `restore(app.run)`: it would give the run the region of whoever runs `drive`, uninterruptible where that is,
    // when a fiber forked here is interruptible all the same (`docs/premises.md`).
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
    return yield* Core.endedWith(deaths.all(), Opt.getOrElse(outcome, () => stopped))
  }))
})
