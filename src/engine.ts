import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import * as FiberMap from 'effect/FiberMap'
import * as FiberSet from 'effect/FiberSet'
import * as HashMap from 'effect/HashMap'
import * as HashSet from 'effect/HashSet'
import * as Opt from 'effect/Option'
import * as Queue from 'effect/Queue'
import type * as Stream from 'effect/Stream'
import * as SubscriptionRef from 'effect/SubscriptionRef'
import { type DefectSource, describeByTag, RejectedMessage, type RejectionOptions } from './bug.ts'
import type { Command } from './command.ts'
import type { Subscribe } from './subscription.ts'
import { isRejected, type Step, type Update } from './update.ts'

/** Counts the states produced by the engine: every message that changes the state creates a new revision. */
export type Revision = number

export type Revisioned<State> = Readonly<{ state: State; revision: Revision }>

// A view message carries the state its frame was drawn from, to tell a bug from a stale message.
type Origin<State> = Readonly<{ _tag: 'View'; frame: Revisioned<State> }> | Readonly<{ _tag: 'Program' }>

type Envelope<State, Message> = Readonly<{ message: Message; origin: Origin<State> }>

const fromProgram: Origin<never> = { _tag: 'Program' }

/** The engine owns its message loop: it runs as long as the scope `make` was called in. */
export interface Engine<State, Message> {
  readonly state$: Stream.Stream<Revisioned<State>>
  /**
   * Returns the dispatch for a view rendered from `frame`: the frame travels
   * with every message it enqueues, so that a rejected message can be told
   * apart as a bug or as stale.
   */
  readonly dispatchFrom: (frame: Revisioned<State>) => (message: Message) => void
  /**
   * Never succeeds. Fails with the first defect raised by `update`, a command
   * or a subscription, or with `RejectedMessage`, so whoever runs the program
   * can let it crash.
   */
  readonly await: Effect.Effect<never>
}

export const make = Effect.fn('Engine.make')(function*<State, Message, R, S, K>({
  init: { state: initState, commands: initCommands = [] },
  update,
  subscriptions,
  onBug = () => Effect.void,
  describeMessage = describeByTag,
  onRejected,
}:
  & {
    init: Step<State, Message, R>
    update: Update<State, Message, R>
    subscriptions: Subscribe<State, Message, S, K>
    /** How a message appears in the logs, e.g. its tags only, without its data. */
    describeMessage?: (message: NoInfer<Message>) => unknown
  }
  & RejectionOptions<NoInfer<Message>, NoInfer<K>>)
{
  const context = yield* Effect.context<R | S>()
  const queue = yield* Effect.acquireRelease(
    Queue.unbounded<Envelope<State, Message>>(),
    Queue.shutdown,
  )
  // The loop and the commands. A defect in any of them fails `join`.
  const fibers = yield* FiberSet.make<unknown, never>()
  const subscriptionFibers = yield* FiberMap.make<K, void, never>()
  const stateRef = yield* SubscriptionRef.make<Revisioned<State>>({ state: initState, revision: 0 })
  const offer = (message: Message) => Queue.offer(queue, { message, origin: fromProgram })
  const reportDefect = (defect: unknown, where: DefectSource<K>) =>
    Effect.logError(`A defect in ${where._tag === 'Subscription' ? 'a subscription' : where._tag}`, where, defect).pipe(
      Effect.andThen(onBug({ _tag: 'Defect', cause: defect, where })),
    )
  const apply = (message: Message, state: State) =>
    Effect.sync(() => update(message)(state)).pipe(
      Effect.tapDefect((defect) => reportDefect(defect, { _tag: 'Update' })),
    )
  const runCommand = (command: Command<Message, R>) =>
    command.pipe(
      Effect.tapDefect((defect) => reportDefect(defect, { _tag: 'Command' })),
      Effect.flatMap(Opt.match({ onNone: () => Effect.void, onSome: offer })),
      Effect.provideContext(context),
      FiberSet.run(fibers),
    )
  /**
   * Starts the subscriptions whose key appeared and interrupts the ones whose
   * key disappeared. Subscriptions whose key is unchanged keep running; one that
   * has ended keeps its key among the active ones, so it does not start again
   * until its key goes away and comes back.
   */
  const reconcile = Effect.fnUntraced(function*(
    active: HashSet.HashSet<K>,
    state: State,
  ) {
    const next = subscriptions(state)
    const nextKeys = HashSet.fromIterable(HashMap.keys(next))
    for (const key of HashSet.difference(active, nextKeys)) {
      yield* Effect.logDebug('Subscription stopped', key)
      yield* FiberMap.remove(subscriptionFibers, key)
    }
    for (const [key, subscription] of next) {
      if (HashSet.has(active, key)) {
        continue
      }
      yield* Effect.logDebug('Subscription started', key)
      yield* Channel.runForEach(subscription, (message) => Effect.asVoid(offer(message))).pipe(
        Effect.flatMap((last) =>
          Effect.logDebug('Subscription ended', key).pipe(Effect.andThen(offer(last)), Effect.asVoid)
        ),
        Effect.tapDefect((defect) => reportDefect(defect, { _tag: 'Subscription', key })),
        Effect.provideContext(context),
        FiberMap.run(subscriptionFibers, key),
      )
    }
    return nextKeys
  })
  const step = Effect.fnUntraced(function*(
    active: HashSet.HashSet<K>,
    { message, origin }: Envelope<State, Message>,
  ) {
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
        yield* onBug({ _tag: 'Rejected', message, revision: frameRevision })
        return onRejected === 'die'
          ? yield* Effect.die(new RejectedMessage({ message, revision: frameRevision }))
          : active
      }
      yield* Effect.logDebug('Ignored a stale message', describeMessage(message))
      return active
    }
    const { state: newState, commands = [] } = result
    // The same state needs no new frame and no new subscriptions: only its commands, if any, run.
    if (newState === state) {
      if (commands.length > 0) {
        yield* Effect.logDebug('Message', describeMessage(message), { revision, commands: commands.length })
      }
      yield* Effect.forEach(commands, runCommand, { discard: true })
      return active
    }
    yield* Effect.logDebug('Message', describeMessage(message), { revision: revision + 1, commands: commands.length })
    yield* SubscriptionRef.set(stateRef, { state: newState, revision: revision + 1 })
    const nextActive = yield* reconcile(active, newState)
    yield* Effect.forEach(commands, runCommand, { discard: true })
    return nextActive
  })
  const initialActive = yield* reconcile(HashSet.empty(), initState)
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
    dispatchFrom: (frame) => (message) => {
      Queue.offerUnsafe(queue, { message, origin: { _tag: 'View', frame } })
    },
    state$: SubscriptionRef.changes(stateRef),
  } satisfies Engine<State, Message>
})
