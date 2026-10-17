import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import * as FiberMap from 'effect/FiberMap'
import * as FiberSet from 'effect/FiberSet'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Queue from 'effect/Queue'
import type * as Stream from 'effect/Stream'
import * as SubscriptionRef from 'effect/SubscriptionRef'
import { describeByTag, type OnRejected, RejectedMessage } from './bug.ts'
import type { RunCommand } from './command.ts'
import type { Subscribe } from './subscription.ts'
import { isRejected, type Step, type Update } from './update.ts'

/** Counts the states produced by the engine: every message that changes the state creates a new revision. */
export type Revision = number

export type Revisioned<State> = Readonly<{ state: State; revision: Revision }>

/**
 * A message that `update` accepted: the state before and after it, the revision of `after` (unchanged when
 * the state is the same), and the commands it started.
 */
export type Applied<State, Message, Command> = Readonly<{
  message: Message
  before: State
  after: State
  revision: Revision
  commands: ReadonlyArray<Command>
}>

/** Counts the starts of subscriptions: each start of a key gets a new one. */
type Generation = number

/**
 * Where a message comes from. A view message carries the state its frame was drawn from, to tell a bug from a
 * stale message; a subscription's message carries the start it comes from, so that once its key goes away,
 * what it left in the queue is dropped.
 */
type Origin<State, K> =
  | Readonly<{ _tag: 'View'; frame: Revisioned<State> }>
  | Readonly<{ _tag: 'Command' }>
  | Readonly<{ _tag: 'Subscription'; key: K; generation: Generation }>

type Envelope<State, Message, K> = Readonly<{ message: Message; origin: Origin<State, K> }>

const fromCommand: Origin<never, never> = { _tag: 'Command' }

/** The engine owns its message loop: it runs as long as the scope `make` was called in. */
export interface Engine<State, Message> {
  readonly state$: Stream.Stream<Revisioned<State>>
  /**
   * Returns the dispatch for a view rendered from `frame`: the frame travels
   * with every message it enqueues, so that a rejected message can be told
   * apart as a bug or as stale.
   */
  readonly dispatchFrom: (frame: Revisioned<State>) => (message: Message) => Effect.Effect<void>
  /**
   * Never succeeds. Fails with the first defect raised by `update`, a command
   * or a subscription, or with `RejectedMessage`, so whoever runs the program
   * can let it crash.
   */
  readonly await: Effect.Effect<never>
}

export const make = Effect.fn('Engine.make')(function*<State, Message, Command, R, S, K>({
  init: { state: initState, commands: initCommands = [] },
  update,
  runCommand: interpret,
  subscriptions,
  describeMessage = describeByTag,
  describeCommand = describeByTag,
  onApplied = () => Effect.void,
  onRejected,
}: {
  init: Step<State, Command>
  update: Update<State, Message, Command>
  runCommand: RunCommand<Command, Message, R>
  subscriptions: Subscribe<State, Message, S, K>
  /** What a frame's message that `update` rejects in the frame's own state does. */
  onRejected: OnRejected<NoInfer<Message>>
  /** How a message appears in the logs, e.g. its tags only, without its data. */
  describeMessage?: (message: NoInfer<Message>) => unknown
  /** How a command appears in the logs, e.g. its tags only, without its data. */
  describeCommand?: (command: NoInfer<Command>) => unknown
  /** Hears every message `update` accepts, in order, before its frame is drawn and its commands start. */
  onApplied?: (applied: Applied<NoInfer<State>, NoInfer<Message>, NoInfer<Command>>) => Effect.Effect<void>
}) {
  const context = yield* Effect.context<R | S>()
  const queue = yield* Effect.acquireRelease(
    Queue.unbounded<Envelope<State, Message, K>>(),
    Queue.shutdown,
  )
  // The loop and the commands. A defect in any of them fails `join`.
  const fibers = yield* FiberSet.make<unknown, never>()
  const subscriptionFibers = yield* FiberMap.make<K, void, never>()
  const stateRef = yield* SubscriptionRef.make<Revisioned<State>>({ state: initState, revision: 0 })
  const enqueue = (origin: Origin<State, K>) => (message: Message) =>
    Effect.asVoid(Queue.offer(queue, { message, origin }))
  // Only the loop starts subscriptions, one step at a time.
  let started: Generation = 0
  // Where a defect happened is known only here, so it goes to the log; the run then fails with the defect.
  const logDefect = (where: string, ...details: ReadonlyArray<unknown>) => (defect: unknown) =>
    Effect.logError(`A defect in ${where}`, ...details, defect)
  const apply = (message: Message, state: State) =>
    Effect.sync(() => update(message)(state)).pipe(Effect.tapDefect(logDefect('update')))
  const observe = (applied: Applied<State, Message, Command>) =>
    onApplied(applied).pipe(Effect.tapDefect(logDefect('onApplied')))
  // The interpreter runs inside the command's fiber, so a defect in it is the command's.
  const runCommand = (command: Command) =>
    Effect.suspend(() => interpret(command)).pipe(
      Effect.tapDefect(logDefect('a command')),
      Effect.flatMap(Opt.match({ onNone: () => Effect.void, onSome: enqueue(fromCommand) })),
      Effect.provideContext(context),
      FiberSet.run(fibers),
    )
  /**
   * Starts the subscriptions whose key appeared and interrupts the ones whose key disappeared, and returns the
   * active keys with the start of each. Subscriptions whose key is unchanged keep running; one that has ended
   * keeps its key and its start among the active ones, so that it does not start again until its key goes
   * away and comes back, and its last message still arrives.
   */
  const reconcile = Effect.fnUntraced(function*(
    active: HashMap.HashMap<K, Generation>,
    state: State,
  ) {
    const next = subscriptions(state)
    let nextActive = HashMap.empty<K, Generation>()
    for (const key of HashMap.keys(active)) {
      if (HashMap.has(next, key)) continue
      yield* Effect.logDebug('Subscription stopped', key)
      yield* FiberMap.remove(subscriptionFibers, key)
    }
    for (const [key, subscription] of next) {
      const running = HashMap.get(active, key)
      if (Opt.isSome(running)) {
        nextActive = HashMap.set(nextActive, key, running.value)
        continue
      }
      started += 1
      nextActive = HashMap.set(nextActive, key, started)
      const send = enqueue({ _tag: 'Subscription', key, generation: started })
      yield* Effect.logDebug('Subscription started', key)
      yield* Channel.runForEach(subscription, send).pipe(
        Effect.flatMap((last) => Effect.logDebug('Subscription ended', key).pipe(Effect.andThen(send(last)))),
        Effect.tapDefect(logDefect('a subscription', key)),
        Effect.provideContext(context),
        FiberMap.run(subscriptionFibers, key),
      )
    }
    return nextActive
  })
  const step = Effect.fnUntraced(function*(
    active: HashMap.HashMap<K, Generation>,
    { message, origin }: Envelope<State, Message, K>,
  ) {
    // Left in the queue by a subscription whose key has gone away since: it was produced after the program
    // stopped listening, so it does not reach `update`.
    if (
      origin._tag === 'Subscription'
      && !Opt.contains(HashMap.get(active, origin.key), origin.generation)
    ) {
      yield* Effect.logDebug('Dropped a message of a stopped subscription', origin.key, describeMessage(message))
      return active
    }
    const { state, revision } = yield* SubscriptionRef.get(stateRef)
    const result = yield* apply(message, state)
    if (isRejected(result)) {
      if (origin._tag === 'View' && isRejected(yield* apply(message, origin.frame.state))) {
        const frameRevision = origin.frame.revision
        yield* Effect.logError(
          'A frame sent a message that update rejects in its own state: the model offered it, so the two disagree',
          describeMessage(message),
          { revision: frameRevision },
        )
        if (onRejected === 'die') return yield* Effect.die(new RejectedMessage({ message, revision: frameRevision }))
        yield* onRejected({ message, revision: frameRevision })
        return active
      }
      yield* Effect.logDebug('Ignored a stale message', describeMessage(message))
      return active
    }
    const { state: newState, commands = [] } = result
    const described = commands.map(describeCommand)
    // The same state needs no new frame and no new subscriptions: only its commands, if any, run.
    if (newState === state) {
      if (commands.length > 0) {
        yield* Effect.logDebug('Message', describeMessage(message), { revision, commands: described })
      }
      yield* observe({ message, before: state, after: state, revision, commands })
      yield* Effect.forEach(commands, runCommand, { discard: true })
      return active
    }
    yield* Effect.logDebug('Message', describeMessage(message), { revision: revision + 1, commands: described })
    yield* observe({ message, before: state, after: newState, revision: revision + 1, commands })
    yield* SubscriptionRef.set(stateRef, { state: newState, revision: revision + 1 })
    const nextActive = yield* reconcile(active, newState)
    yield* Effect.forEach(commands, runCommand, { discard: true })
    return nextActive
  })
  const initialActive = yield* reconcile(HashMap.empty(), initState)
  yield* Effect.forEach(initCommands, runCommand, { discard: true })
  yield* Effect.gen(function*() {
    let active = initialActive
    while (true) {
      active = yield* step(active, yield* Queue.take(queue))
    }
  }).pipe(FiberSet.run(fibers))
  return {
    await: Effect.raceFirst(
      FiberSet.join(fibers),
      FiberMap.join(subscriptionFibers),
    ).pipe(Effect.andThen(Effect.never)),
    dispatchFrom: (frame) => enqueue({ _tag: 'View', frame }),
    state$: SubscriptionRef.changes(stateRef),
  } satisfies Engine<State, Message>
})
