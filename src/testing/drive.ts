import * as Clock from 'effect/Clock'
import type * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import type * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import * as SubscriptionRef from 'effect/SubscriptionRef'
import type { RunOptions } from '../engine.ts'
import type { Shape } from '../program.ts'
import { type FlagsOption, type Frame, run } from '../run.ts'
import type { Action } from './action.ts'

/** A user of a program that `drive` runs: it waits for what the frames show, and does what they offer. */
export type Driver<Model> = Readonly<{
  /** Waits for a frame whose model `select` maps to `Some`, and returns that value. */
  waitFor: <A>(select: (model: Model) => Opt.Option<A>) => Effect.Effect<A>
  /** Waits for a frame on which `select` finds an action, and does it on that frame. */
  send: (select: (model: Model) => Opt.Option<Action>) => Effect.Effect<void>
  /** The latest frame, once there is one. */
  latest: Effect.Effect<Frame<Model>>
}>

/**
 * How `drive` runs a program: `run`'s options a test may want, and how long a wait lasts before it fails
 * (2 seconds). There is no `onRejectedInput`: in a test, a rejected input is always fatal.
 */
export type DriveOptions<Message, State = unknown, Command = unknown> =
  & Omit<RunOptions<Message, State, Command>, 'onRejectedInput'>
  & Readonly<{ patience?: Duration.Input }>

/**
 * Runs `program` with `run`, from its `flags` when it has them, its commands and subscriptions included, with a
 * renderer that keeps only the latest frame, and runs `scenario` against that frame. Returns what `scenario`
 * returns, then stops the program. A defect of the program fails it, and so does a typed value the model offered
 * and `update` rejected (`onRejectedInput: 'die'`), or a wait that lasts longer than `patience`.
 */
export const drive = Effect.fnUntraced(function*<
  State,
  Model,
  Message,
  Command,
  R,
  A,
  E,
  RS,
  Flags = never,
>(
  program: Shape<State, Model, Message, Command, R, never, unknown, Flags>,
  scenario: (driver: Driver<Model>) => Effect.Effect<A, E, RS>,
  ...[{ patience = '2 seconds', ...options } = {}]: [Flags] extends [never]
    ? [options?: DriveOptions<NoInfer<Message>, NoInfer<State>, NoInfer<Command>>]
    : [options: DriveOptions<NoInfer<Message>, NoInfer<State>, NoInfer<Command>> & FlagsOption<NoInfer<Flags>>]
): Effect.fn.Return<A, E, Exclude<R, Scope.Scope> | RS> {
  const frames = yield* SubscriptionRef.make<Opt.Option<Frame<Model>>>(Opt.none())
  const first = <B>(select: (frame: Frame<Model>) => Opt.Option<B>): Effect.Effect<B> =>
    SubscriptionRef.changes(frames).pipe(
      Stream.map(Opt.flatMap(select)),
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
              new Error(`No frame showed what the test waits for within ${String(patience)}`, {
                cause: Opt.map(latest, (frame) => frame.model),
              }),
            )),
        onSome: Effect.succeed,
      })),
      // The frames never end, so a frame always comes before the stream ends.
      Effect.orDie,
    )
  const driver: Driver<Model> = {
    waitFor: (select) => first((frame) => select(frame.model)),
    send: (select) =>
      Effect.flatten(first((frame) => Opt.map(select(frame.model), (action) => action(frame.dispatch)))),
    latest: first(Opt.some),
  }
  const running = run(
    program,
    (rendered) => Stream.runForEach(rendered, (frame) => SubscriptionRef.set(frames, Opt.some(frame))),
    // The rest of the options keeps the flags the parameter's type requires.
    { ...options, onRejectedInput: 'die' } as RunOptions<Message, State, Command> & FlagsOption<Flags>,
  ).pipe(Effect.andThen(Effect.die(new Error('The program ended before the scenario'))))
  return yield* Effect.raceFirst(scenario(driver), running)
})
