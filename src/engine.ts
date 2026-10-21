import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import * as FiberMap from 'effect/FiberMap'
import * as FiberSet from 'effect/FiberSet'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Queue from 'effect/Queue'
import type * as Stream from 'effect/Stream'
import * as SubscriptionRef from 'effect/SubscriptionRef'
import type { RunCommand } from './command.ts'
import { describeByTag } from './log.ts'
import { type OnRejected, RejectedMessage, type Revision } from './rejection.ts'
import type { Subscriptions } from './subscription.ts'
import { isRejected, type Step, type Update } from './update.ts'

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

/**
 * How a program runs: what a rejected message from a frame does (with no default), how messages and commands
 * appear in the logs, and who observes the transitions.
 */
export type RunOptions<Message, State = unknown, Command = unknown> = Readonly<{
  /** `'die'`, or a function that reports the rejection while the program goes on (see `OnRejected`). */
  onRejected: OnRejected<Message>
  /** How a message appears in the logs; by default its `_tag`, never its data. */
  describeMessage?: (message: Message) => unknown
  /** How a command appears in the logs; by default its `_tag`, never its data. */
  describeCommand?: (command: Command) => unknown
  /**
   * Hears every message `update` accepts, in order, with the state before and after it and the commands it
   * started (e.g. for devtools, or to record a session), before its frame is drawn and its commands start.
   * The program waits for it, so it should be quick; a defect in it ends the run like any other.
   */
  onApplied?: (applied: Applied<State, Message, Command>) => Effect.Effect<void>
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
  // Prototype (`src/next`): a message an offer carries, verified when the offer was made. `violation` marks
  // a typed value that `update` rejected in that very state; `run` is the run that made the offer.
  | Readonly<{ _tag: 'Offer'; violation: boolean; revision: Revision; run: object }>
  | Readonly<{ _tag: 'Command' }>
  | Readonly<{ _tag: 'Subscription'; key: K; generation: Generation }>

type Envelope<State, Message, K> = Readonly<{ message: Message; origin: Origin<State, K> }>

const fromCommand: Origin<never, never> = { _tag: 'Command' }

/** The engine owns its message loop: it runs as long as the scope `make` was called in. */
export interface Engine<State, Message> {
  readonly states: Stream.Stream<Revisioned<State>>
  /**
   * Returns the dispatch for a view rendered from `frame`: the frame travels
   * with every message it enqueues, so that a rejected message can be told
   * apart as a bug or as stale.
   */
  readonly dispatchFrom: (frame: Revisioned<State>) => (message: Message) => Effect.Effect<void>
  /** Prototype (`src/next`): enqueues the message of an offer made by the run `run`. */
  readonly dispatchOffer: (
    offer: Readonly<{ message: Message; violation: boolean; revision: Revision; run: object }>,
  ) => Effect.Effect<void>
  /** Prototype (`src/next`): who this engine's offers belong to. */
  readonly run: object
  /**
   * Never succeeds. Fails with the first defect raised by `update`, a command
   * or a subscription, or with `RejectedMessage`, so whoever runs the program
   * can let it crash.
   */
  readonly await: Effect.Effect<never>
}

export const make = Effect.fn('Engine.make')(function*<State, Message, Command, R, K>({
  init: { state: initState, commands: initCommands = [] },
  update,
  runCommand: interpret,
  subscriptions,
  describeMessage = describeByTag,
  describeCommand = describeByTag,
  onApplied = () => Effect.void,
  onRejected,
}:
  & Readonly<{
    init: Step<State, Command>
    update: Update<State, Message, Command>
    runCommand: RunCommand<Command, Message, R>
    subscriptions: Subscriptions<State, Message, R, K>
  }>
  & RunOptions<NoInfer<Message>, NoInfer<State>, NoInfer<Command>>)
{
  const context = yield* Effect.context<R>()
  const run = {}
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
    // An offer of another run was drawn by the wrong renderer: its message was verified against another state.
    if (origin._tag === 'Offer' && origin.run !== run) {
      return yield* Effect.die(new Error('An offer made by another run was dispatched to this one'))
    }
    const { state, revision } = yield* SubscriptionRef.get(stateRef)
    const result = yield* apply(message, state)
    if (isRejected(result)) {
      const isBug = origin._tag === 'View'
        ? isRejected(yield* apply(message, origin.frame.state))
        // An offer was verified when it was made, so its rejection is stale, but for a typed value that was
        // already rejected then.
        : origin._tag === 'Offer' && origin.violation
      if (isBug) {
        const frameRevision = origin._tag === 'View' ? origin.frame.revision : origin._tag === 'Offer'
          ? origin.revision
          : revision
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
    const { state: next, commands = [] } = result
    // The same state needs no new revision, frame or subscriptions: only its commands, if any, run.
    const changed = next !== state
    const nextRevision = changed ? revision + 1 : revision
    yield* Effect.logDebug('Message', describeMessage(message), {
      revision: nextRevision,
      commands: commands.map(describeCommand),
    })
    yield* observe({ message, before: state, after: next, revision: nextRevision, commands })
    if (changed) yield* SubscriptionRef.set(stateRef, { state: next, revision: nextRevision })
    const nextActive = changed ? yield* reconcile(active, next) : active
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
    dispatchOffer: ({ message, violation, revision, run }) => enqueue({ _tag: 'Offer', violation, revision, run })(message),
    run,
    states: SubscriptionRef.changes(stateRef),
  } satisfies Engine<State, Message>
})
