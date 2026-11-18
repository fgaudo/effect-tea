import * as Clock from 'effect/Clock'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Opt from 'effect/Option'
import type * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import * as SubscriptionRef from 'effect/SubscriptionRef'
import * as Core from '../core.ts'
import type { RunOptions } from '../engine.ts'
import type { FlagsOption, Shape } from '../program.ts'
import { type Frame, runWith } from '../run.ts'
import { makeDeaths } from '../shell.ts'

/**
 * The user of a program that `drive` runs: it waits for what the frames show, and sends what they show.
 *
 * @example
 * ```ts
 * yield* driver.send((model) => Opt.some(model.increment))
 * const count = yield* driver.waitFor((model) => (model.count === 1 ? Opt.some(model.count) : Opt.none()))
 * ```
 */
export type Driver<Model, Message> = {
  /** Waits for a frame whose model `select` maps to `Some`, and returns that value. */
  readonly waitFor: <A>(select: (model: Model) => Opt.Option<A>) => Effect.Effect<A>
  /**
   * Waits for a frame on which `select` finds a message, and sends it through that frame's dispatch, as a control drawn
   * from that model would.
   */
  readonly send: (select: (model: Model) => Opt.Option<Message>) => Effect.Effect<void>
  /** Waits for the first frame, and returns the latest. */
  readonly latest: Effect.Effect<Frame<Model, Message>>
}

/**
 * The options of `drive`: those of `run`, and how long a wait lasts.
 *
 * @example
 * ```ts
 * drive(program, scenario, { patience: '5 seconds' })
 * ```
 */
export type DriveOptions<Message, State = unknown, Command = unknown> =
  & RunOptions<Message, State, Command>
  & {
    /** How long a wait of the scenario lasts before it fails: 2 seconds by default, measured with the real clock. */
    readonly patience?: Duration.Input
  }

/**
 * Runs a program and plays a scenario on its frames, as a user would.
 *
 * It takes the program to run, one without events; the scenario, what the user does through the {@link Driver} it is
 * given; and its options: `flags`, when the program has them, `patience`, and the options of `RunOptions`.
 *
 * - It sends what the frames show, through the run's dispatch. The program's subscriptions run.
 * - A wait that lasts longer than `patience` fails. `patience` is 2 seconds by default, measured with the real clock.
 * - Time in `drive` is real. A frame may be past when its message arrives, so a rejected message is ignored, as in a
 *   run.
 * - A wait looks at the latest frame and at later ones.
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
  Flags = never,
>(
  program: Shape<State, Model, Message, Command, RC, RS, never, never, Flags>,
  scenario: (driver: Driver<Model, Message>) => Effect.Effect<A, E, RT>,
  ...[{ patience = '2 seconds', ...options } = {}]: [Flags] extends [never]
    ? [options?: DriveOptions<NoInfer<Message>, NoInfer<State>, NoInfer<Command>>]
    : [options: DriveOptions<NoInfer<Message>, NoInfer<State>, NoInfer<Command>> & FlagsOption<NoInfer<Flags>>]
): Effect.fn.Return<A, E, Exclude<RC | RS, Scope.Scope> | RT> {
  const frames = yield* SubscriptionRef.make<Opt.Option<Frame<Model, Message>>>(Opt.none())
  const first = <B>(select: (frame: Frame<Model, Message>) => Effect.Effect<Opt.Option<B>>): Effect.Effect<B> =>
    SubscriptionRef.changes(frames).pipe(
      Stream.mapEffect(Opt.match({ onNone: () => Effect.succeedNone, onSome: select })),
      Stream.filter(Opt.isSome),
      Stream.runHead,
      Effect.flatMap(Effect.fromOption),
      Effect.map((found) => found.value),
      Effect.timeoutOption(patience),
      // Measured with the real clock: under a `TestClock` that nobody adjusts, a wait would never end.
      Effect.provideService(Clock.Clock, Clock.Clock.defaultValue()),
      Effect.flatMap(Opt.match({
        onNone: () =>
          Effect.flatMap(SubscriptionRef.get(frames), (latest) =>
            Effect.die(
              new Error(
                `No frame showed what the test waits for within ${Duration.format(Duration.fromInputUnsafe(patience))}`,
                { cause: Opt.map(latest, (frame) => frame.model) },
              ),
            )),
        onSome: Effect.succeed,
      })),
      // The frames never end, so a frame always comes before the stream ends.
      Effect.orDie,
    )
  // What the run's fibers die of, the renderer's `makeModel` included, as `drive` ends with it.
  const deaths = yield* makeDeaths(() => true)
  const driver: Driver<Model, Message> = {
    waitFor: (select) => first((frame) => Effect.sync(() => select(frame.model))),
    send: (select) => Effect.flatten(first((frame) => Effect.sync(() => Opt.map(select(frame.model), frame.dispatch)))),
    latest: first(Effect.succeedSome),
  }
  const running = runWith(
    program,
    (rendered) => Stream.runForEach(rendered, (frame) => SubscriptionRef.set(frames, Opt.some(frame))),
    // The rest of the options keeps the flags the parameter's type requires.
    options as RunOptions<Message, State, Command>,
    deaths,
  ).pipe(Effect.andThen(Effect.die(new Error('The program ended before the scenario'))))
  // Stopped and awaited however `drive` ends, interrupted by whoever runs it too: its exit holds what the program
  // dies of as it releases what it holds.
  return yield* Effect.uninterruptibleMask(Effect.fnUntraced(function*(restore) {
    // Not `restore(running)`: it would give the run the region of whoever runs `drive`, uninterruptible where that is,
    // when a fiber forked here is interruptible all the same (`docs/premises.md`).
    const fiber = yield* Effect.forkChild(running)
    const ended = yield* Effect.exit(restore(Effect.raceFirst(
      // Suspended, so that a scenario that throws before it returns its effect fails here, past nothing of the end.
      Effect.asSome(Effect.exit(Effect.suspend(() => scenario(driver)))),
      Effect.as(Fiber.await(fiber), Opt.none()),
    )))
    yield* Fiber.interrupt(fiber)
    const stopped = yield* Fiber.await(fiber)
    // What the scenario ended with, or how `drive` was interrupted. Once the run has ended, of a defect as of
    // anything else, what the scenario ended with is dropped. Interrupted, the run dies of what its fibers die of as
    // they release what they hold, as when whoever runs it interrupts it: the defects first, in the order they died.
    const outcome = Exit.isSuccess(ended) ? ended.value : Opt.some(Exit.failCause(ended.cause))
    return yield* Core.endedWith(deaths.all(), Opt.getOrElse(outcome, () => stopped))
  }))
})
