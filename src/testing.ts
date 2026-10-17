import * as Arr from 'effect/Array'
import * as Clock from 'effect/Clock'
import type * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Equal from 'effect/Equal'
import * as Opt from 'effect/Option'
import * as Stream from 'effect/Stream'
import * as SubscriptionRef from 'effect/SubscriptionRef'
import { describeByTag } from './bug.ts'
import type { RunCommand } from './command.ts'
import type { InputOffer, Offer } from './offer.ts'
import type { Program } from './program.ts'
import { type Frame, run, type RunOptions } from './run.ts'
import { isRejected, type Step, type Update } from './update.ts'
import type { Dispatch } from './view.ts'

/** Applies `messages` in order from `from`, collecting the commands and the events; a rejection fails the test. */
export const applyAll =
  <State, Message, Command, Event>(update: Update<State, Message, Command, Event>) =>
  (messages: ReadonlyArray<Message>, from: State) =>
    messages.reduce(
      ({ state, commands, events }, message, index) => {
        const result = update(message)(state)
        if (isRejected(result)) {
          throw new Error(`update rejected message ${index} (${String(describeByTag(message))})`)
        }
        return {
          state: result.state,
          commands: [...commands, ...(result.commands ?? [])],
          events: [...events, ...(result.events ?? [])],
        }
      },
      {
        state: from,
        commands: [] as ReadonlyArray<Command>,
        events: [] as ReadonlyArray<Event>,
      },
    )

/**
 * Where a simulation ends: the last state, every message `update` accepted and every command it started, in
 * order, and every event.
 */
export type Simulation<State, Message, Command, Event> = Readonly<{
  state: State
  messages: ReadonlyArray<Message>
  commands: ReadonlyArray<Command>
  events: ReadonlyArray<Event>
}>

/**
 * Runs a program's flow without a runtime: from `from` (e.g. the program's `init`), runs its commands, then
 * applies `messages` in order. Every command runs through `runCommand` as soon as its message is applied, and
 * the message it produces is applied before anything else, as if each command completed at once. Pass the
 * program's own `runCommand` with its services provided, or one of the test's that answers each command
 * without any. Subscriptions do not run: pass the messages they would send in `messages`. A rejection of one
 * of `messages` fails the test with a defect; a command's message that `update` rejects is stale and ignored,
 * as when the program runs.
 */
export const simulate = <State, Message, Command, R, Event>(
  { update, runCommand }: Readonly<{
    update: Update<State, Message, Command, Event>
    runCommand: RunCommand<Command, Message, R>
  }>,
) =>
(
  messages: ReadonlyArray<Message>,
  from: Step<State, Command>,
): Effect.Effect<Simulation<State, Message, Command, Event>, never, R> => {
  type Current = Simulation<State, Message, Command, Event>
  const runCommands = (
    commands: ReadonlyArray<Command>,
    simulation: Current,
  ): Effect.Effect<Current, never, R> =>
    Effect.gen(function*() {
      let current: Current = { ...simulation, commands: [...simulation.commands, ...commands] }
      for (const command of commands) {
        const message = yield* runCommand(command)
        if (Opt.isSome(message)) {
          current = yield* apply(message.value, current, Effect.succeed)
        }
      }
      return current
    })
  const apply = (
    message: Message,
    simulation: Current,
    onRejected: (unchanged: Current) => Effect.Effect<Current>,
  ): Effect.Effect<Current, never, R> =>
    Effect.suspend(() => {
      const result = update(message)(simulation.state)
      return isRejected(result) ? onRejected(simulation) : runCommands(result.commands ?? [], {
        state: result.state,
        messages: [...simulation.messages, message],
        commands: simulation.commands,
        events: [...simulation.events, ...(result.events ?? [])],
      })
    })
  return Effect.gen(function*() {
    let current = yield* runCommands(from.commands ?? [], {
      state: from.state,
      messages: [],
      commands: [],
      events: [],
    })
    for (const [index, message] of messages.entries()) {
      current = yield* apply(
        message,
        current,
        () => Effect.die(new Error(`update rejected message ${index} (${String(describeByTag(message))})`)),
      )
    }
    return current
  })
}

/**
 * How a message a view can send breaks its agreement with `update`:
 * - `Rejected`: `update` rejects it in the state the view was drawn from, so the model offered too much;
 * - `ActsTwice`: sent twice from the same frame (a double tap), it acts again, so a one-shot action would
 *   happen twice.
 */
export type DispatchViolation<Message> = Readonly<{ _tag: 'Rejected' | 'ActsTwice'; message: Message }>

/**
 * Checks the messages a view can send from `state`, as collected from what the renderer draws for
 * `modelOf(program)(state)`: `update` must accept each one, and the same message sent again from that frame must be
 * rejected (so it is ignored as stale) or change nothing (same state by `Equal`, no commands, no events).
 * Actions meant to repeat (a "+1") are excluded with `repeatable`. Returns every violation, so that a test
 * can assert there are none, e.g. for arbitrary states.
 */
export const dispatchViolations = <State, Message, Command, Event>(
  update: Update<State, Message, Command, Event>,
  { repeatable = () => false }: Readonly<{ repeatable?: (message: Message) => boolean }> = {},
) =>
(state: State, messages: Iterable<Message>): ReadonlyArray<DispatchViolation<Message>> =>
  Arr.flatMap(Arr.fromIterable(messages), (message): ReadonlyArray<DispatchViolation<Message>> => {
    const first = update(message)(state)
    if (isRejected(first)) return [{ _tag: 'Rejected', message }]
    if (repeatable(message)) return []
    const second = update(message)(first.state)
    const actsAgain = !isRejected(second)
      && (!Equal.equals(second.state, first.state)
        || (second.commands?.length ?? 0) > 0
        || (second.events?.length ?? 0) > 0)
    return actsAgain ? [{ _tag: 'ActsTwice', message }] : []
  })

/** What a user does on a frame: sends a message through the frame's dispatch, as a view's handler would. */
export type Action<Message> = (dispatch: Dispatch<Message>) => Effect.Effect<void>

/** The action that sends what `offer` offers, while it is offered. */
export const tap = <Message>(offer: Offer<Message>): Opt.Option<Action<Message>> =>
  Opt.map(offer, (message) => (dispatch) => dispatch(message))

/** The action that enters `value` into the input `offer` stands for, while it is offered. */
export const input = <Value, Message>(
  offer: InputOffer<Value, Message>,
  value: Value,
): Opt.Option<Action<Message>> => Opt.map(offer, (toMessage) => (dispatch) => dispatch(toMessage(value)))

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
export type DriveOptions<Message, State = unknown, Command = unknown> = Readonly<{
  describeMessage?: NonNullable<RunOptions<Message, State, Command>['describeMessage']>
  describeCommand?: NonNullable<RunOptions<Message, State, Command>['describeCommand']>
  onApplied?: NonNullable<RunOptions<Message, State, Command>['onApplied']>
  patience?: Duration.Input
}>

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
