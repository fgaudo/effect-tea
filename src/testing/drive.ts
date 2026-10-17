import * as Clock from 'effect/Clock'
import type * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import * as Stream from 'effect/Stream'
import * as SubscriptionRef from 'effect/SubscriptionRef'
import type { RunOptions } from '../engine.ts'
import type { Dispatch, Offered } from '../offer.ts'
import type { Program } from '../program.ts'
import { type Frame, run } from '../run.ts'

/** What a user does on a frame: sends a message through the frame's dispatch, as a view's handler would. */
export type Action<Message> = (dispatch: Dispatch<Message>) => Effect.Effect<void>

/** The action that sends an offered message, as a click on its control does. */
export const tap = <Message>(message: Offered<Message>): Action<Message> => (dispatch) => dispatch(message)

/** The action that enters `value` into the input that `offerInput` made `toMessage` for. */
export const input = <Value, Message>(
  toMessage: (value: Value) => Offered<Message>,
  value: Value,
): Action<Message> =>
(dispatch) => dispatch(toMessage(value))

/** A user of a program that `drive` runs: it waits for what the frames show, and does what they offer. */
export type Driver<Model, Message> = Readonly<{
  /** Waits for a frame whose model `select` maps to `Some`, and returns that value. */
  waitFor: <A>(select: (model: Model) => Opt.Option<A>) => Effect.Effect<A>
  /** Waits for a frame on which `select` finds an action, and does it on that frame. */
  send: (select: (model: Model) => Opt.Option<Action<Message>>) => Effect.Effect<void>
  /** The latest frame, once there is one. */
  latest: Effect.Effect<Frame<Model, Message>>
}>

/**
 * How `drive` runs a program: `run`'s options a test may want, and how long a wait lasts before it fails
 * (2 seconds). There is no `onRejected`: in a test, a rejected message is always fatal.
 */
export type DriveOptions<Message, State = unknown, Command = unknown> =
  & Omit<RunOptions<Message, State, Command>, 'onRejected'>
  & Readonly<{ patience?: Duration.Input }>

/**
 * Runs `program` with `run`, its commands and subscriptions included, with a renderer that keeps only the
 * latest frame, and runs `scenario` against that frame. Returns what `scenario` returns, then stops the
 * program. A defect of the program fails it, and so does a message the program offered and then rejected
 * (`onRejected: 'die'`), or a wait that lasts longer than `patience`.
 */
export const drive = <State, Model, Message, Command, R, K, A, E, RS>(
  program: Program<State, Model, Message, Command, R, never, K>,
  scenario: (driver: Driver<Model, Message>) => Effect.Effect<A, E, RS>,
  { patience = '2 seconds', ...options }: DriveOptions<NoInfer<Message>, NoInfer<State>, NoInfer<Command>> = {},
): Effect.Effect<A, E, R | RS> =>
  Effect.gen(function*() {
    const frames = yield* SubscriptionRef.make<Opt.Option<Frame<Model, Message>>>(Opt.none())
    const first = <B>(select: (frame: Frame<Model, Message>) => Opt.Option<B>): Effect.Effect<B> =>
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
    const driver: Driver<Model, Message> = {
      waitFor: (select) => first((frame) => select(frame.model)),
      send: (select) =>
        Effect.flatten(first((frame) => Opt.map(select(frame.model), (action) => action(frame.dispatch)))),
      latest: first(Opt.some),
    }
    const running = run(
      program,
      (rendered) => Stream.runForEach(rendered, (frame) => SubscriptionRef.set(frames, Opt.some(frame))),
      { ...options, onRejected: 'die' },
    ).pipe(Effect.andThen(Effect.die(new Error('The program ended before the scenario'))))
    return yield* Effect.raceFirst(scenario(driver), running)
  })
