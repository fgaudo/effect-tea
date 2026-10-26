import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FiberMap from 'effect/FiberMap'
import * as FiberSet from 'effect/FiberSet'
import * as HashMap from 'effect/HashMap'
import * as LogLevel from 'effect/LogLevel'
import * as Opt from 'effect/Option'
import * as Queue from 'effect/Queue'
import type * as Scope from 'effect/Scope'
import type * as Stream from 'effect/Stream'
import * as SubscriptionRef from 'effect/SubscriptionRef'
import * as Tracer from 'effect/Tracer'
import type { RunCommand } from './command.ts'
import { type DefectSite, ProgramDefect } from './defect.ts'
import { describeByTag } from './log.ts'
import type { Subscriptions } from './subscription.ts'
import { isRejected, type Step, type Update } from './update.ts'

/** Counts the states a run produces: every message that changes the state creates a new revision. */
export type Revision = number

export type Revisioned<State> = Readonly<{ state: State; revision: Revision }>

/** Where a message came from: the view, a command, or a subscription, with its key. */
export type Origin =
  | Readonly<{ _tag: 'View' }>
  | Readonly<{ _tag: 'Command' }>
  | Readonly<{ _tag: 'Subscription'; key: unknown }>

/**
 * A message that `update` accepted: where it came from, the state before and after it, the revision of `after`
 * (unchanged when the state is the same), and the commands it started.
 */
export type Applied<State, Message, Command> = Readonly<{
  message: Message
  origin: Origin
  before: State
  after: State
  revision: Revision
  commands: ReadonlyArray<Command>
}>

/** A message that `update` rejected, and the run ignored: where it came from, and the state it did not apply in. */
export type Ignored<State, Message> = Readonly<{
  message: Message
  origin: Origin
  state: State
}>

/** How a program runs: how messages and commands appear in the logs, and who observes the transitions. */
export interface RunOptions<Message, State = unknown, Command = unknown> {
  /**
   * How a message appears in the logs; by default its `_tag`, never its data. Called only while debug logs are
   * enabled.
   */
  readonly describeMessage?: (message: Message) => unknown
  /**
   * How a command appears in the logs; by default its `_tag`, never its data. Called only while debug logs are
   * enabled.
   */
  readonly describeCommand?: (command: Command) => unknown
  /**
   * Hears every message `update` accepts, in order, with the state before and after it and the commands it
   * started (e.g. for devtools, or to record a session), before its frame is drawn and its commands start.
   * The program waits for it, so it should be quick; a defect in it ends the run like any other.
   */
  readonly onApplied?: (applied: Applied<State, Message, Command>) => Effect.Effect<void>
  /**
   * Hears every message `update` rejects, which the run ignores, with where it came from and the state it did
   * not apply in (e.g. for devtools, or to count the taps that did nothing). It only watches: the message stays
   * ignored, and the state as it was. The program waits for it, so it should be quick; a defect in it ends the
   * run like any other.
   */
  readonly onIgnored?: (ignored: Ignored<State, Message>) => Effect.Effect<void>
}

/**
 * Where a defect happened is known only where it is caught: the run dies with it, and with where, and leaves
 * reporting it to whoever runs the program. Every defect of the cause is wrapped, with its stack and span, and
 * the rest of the cause is kept as it is: `Effect.catchDefect` would keep only the first defect.
 */
// The details are made only when there is a defect to carry them: a message is described on every call otherwise.
export const diesIn =
  (where: DefectSite, details: () => Readonly<{ key?: unknown; on?: unknown }> = () => ({})) =>
  <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.catchCauseIf(self, Cause.hasDies, (cause) =>
      Effect.failCause(Cause.fromReasons(cause.reasons.flatMap((reason): ReadonlyArray<Cause.Reason<E>> =>
        Cause.isDieReason(reason)
          ? Cause.annotate(
            Cause.die(new ProgramDefect({ where, cause: reason.defect, ...details() })),
            Cause.reasonAnnotations(reason),
          ).reasons
          : [reason]
      ))))

/** Counts the starts of subscriptions: each start of a key gets a new one. */
type Generation = number

/**
 * Where a message comes from, as the engine knows it: a subscription's message carries the start it comes from,
 * so that once its key goes away, what it left in the queue is dropped.
 */
type Source<K> =
  | Readonly<{ _tag: 'View' }>
  | Readonly<{ _tag: 'Command' }>
  | Readonly<{ _tag: 'Subscription'; key: K; generation: Generation }>

type Envelope<Message, K> = Readonly<{ message: Message; source: Source<K> }>

const fromView: Source<never> = { _tag: 'View' }

const fromCommand: Source<never> = { _tag: 'Command' }

const originOf = <K>(source: Source<K>): Origin =>
  source._tag === 'Subscription' ? { _tag: 'Subscription', key: source.key } : source

/**
 * What the fibers of a run get from the context of whoever ran it: the same, but for its span, seen by them as
 * an external one. Every log is also an event of the current span, kept in memory until the span is exported:
 * a fiber that lives as long as the run (the loop, a subscription, the renderer), or one of its many
 * commands, would add to it for as long as the run lasts. An external span takes no events, and the spans
 * that commands and subscriptions open (`Effect.fn`) are still its children in the trace.
 */
export const withExternalSpan = <R>(context: Context.Context<R>): Context.Context<R> => {
  const span = Context.getOrUndefined(context, Tracer.ParentSpan)
  if (span === undefined || span._tag === 'ExternalSpan') return context
  const { spanId, traceId, sampled } = span
  return Context.add(context, Tracer.ParentSpan, Tracer.externalSpan({ spanId, traceId, sampled }))
}

/** The engine owns its message loop: it runs as long as the scope `make` was called in. */
export interface Engine<State, Message> {
  readonly states: Stream.Stream<Revisioned<State>>
  /** Enqueues a message sent by the view. */
  readonly dispatch: (message: Message) => Effect.Effect<void>
  /**
   * Never succeeds. Dies with the first defect raised by `update`, a command or a subscription, as a
   * `ProgramDefect`, so whoever runs the program can let it crash.
   */
  readonly await: Effect.Effect<never>
}

// Untraced: a span of its own would be the one its fibers log into (see `withExternalSpan`).
export const make = Effect.fnUntraced(function*<State, Message, Command, R, K>({
  init: { state: initState, commands: initCommands = [] },
  update,
  runCommand: interpret,
  subscriptions,
  describeMessage = describeByTag,
  describeCommand = describeByTag,
  onApplied = () => Effect.void,
  onIgnored = () => Effect.void,
}:
  & Readonly<{
    init: Step<State, Command>
    update: Update<State, Message, Command>
    runCommand: RunCommand<Command, Message, R>
    subscriptions: Subscriptions<State, Message, R, K>
  }>
  & RunOptions<NoInfer<Message>, NoInfer<State>, NoInfer<Command>>)
{
  // Captured in the run's scope, which no command or subscription gets: each has its own (`Effect.scoped`
  // below), or what they acquire would stay open until the run ends, and be released before their fibers
  // are interrupted.
  const context = withExternalSpan(yield* Effect.context<Exclude<R, Scope.Scope>>())
  const queue = yield* Effect.acquireRelease(
    Queue.unbounded<Envelope<Message, K>>(),
    Queue.shutdown,
  )
  // The loop and the commands. A defect in any of them fails `join`.
  const fibers = yield* FiberSet.make<unknown, never>()
  const subscriptionFibers = yield* FiberMap.make<K, void, never>()
  const stateRef = yield* SubscriptionRef.make<Revisioned<State>>({ state: initState, revision: 0 })
  const enqueue = (source: Source<K>) => (message: Message) => Effect.asVoid(Queue.offer(queue, { message, source }))
  // Only the loop starts subscriptions, one step at a time.
  let started: Generation = 0
  // Each function of the program or of the options, called where its defect can be told apart from the others'.
  const call = <A>(where: DefectSite, f: () => A) => Effect.sync(f).pipe(diesIn(where))
  // Described by its tags alone, whatever `describeMessage` says: a report must not run the program's code while
  // the run is dying, nor carry the message's data.
  const apply = (message: Message, state: State) =>
    Effect.sync(() => update(message)(state)).pipe(diesIn('update', () => ({ on: describeByTag(message) })))
  const described = (message: Message) => call('describeMessage', () => describeMessage(message))
  const observe = (applied: Applied<State, Message, Command>) =>
    onApplied(applied).pipe(diesIn('onApplied'))
  const observeIgnored = (ignored: Ignored<State, Message>) => onIgnored(ignored).pipe(diesIn('onIgnored'))
  // The interpreter runs inside the command's fiber, so a defect in it is the command's. Its scope closes
  // before its message is queued, so that `update` never learns of a command whose resources are still open.
  const runCommand = (command: Command) =>
    Effect.suspend(() => interpret(command)).pipe(
      Effect.scoped,
      diesIn('command'),
      Effect.flatMap(Opt.match({ onNone: () => Effect.void, onSome: enqueue(fromCommand) })),
      Effect.provideContext(context),
      FiberSet.run(fibers),
    )
  /**
   * Interrupts the subscriptions whose key disappeared, all at once, then starts the ones whose key appeared, and
   * returns the active keys with the start of each. Subscriptions whose key is unchanged keep running; one that
   * has ended keeps its key and its start among the active ones, so that it does not start again until its key
   * goes away and comes back, and its last message still arrives. The stops are awaited together, so that the
   * next message waits for the slowest release rather than for all of them, and still before any start: a key
   * that comes back finds its old subscription released.
   */
  const reconcile = Effect.fnUntraced(function*(
    active: HashMap.HashMap<K, Generation>,
    state: State,
  ) {
    const next = yield* call('subscriptions', () => subscriptions(state))
    let nextActive = HashMap.empty<K, Generation>()
    const gone = Arr.filter(Arr.fromIterable(HashMap.keys(active)), (key) => !HashMap.has(next, key))
    yield* Effect.forEach(
      gone,
      (key) =>
        Effect.logDebug('Subscription stopped', key).pipe(Effect.andThen(FiberMap.remove(subscriptionFibers, key))),
      { concurrency: 'unbounded', discard: true },
    )
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
        Effect.scoped,
        Effect.flatMap((last) => Effect.logDebug('Subscription ended', key).pipe(Effect.andThen(send(last)))),
        diesIn('subscription', () => ({ key })),
        Effect.provideContext(context),
        FiberMap.run(subscriptionFibers, key),
      )
    }
    return nextActive
  })
  const step = Effect.fnUntraced(function*(
    active: HashMap.HashMap<K, Generation>,
    { message, source }: Envelope<Message, K>,
  ) {
    // `describeMessage` and `describeCommand` run for every message, and only to be logged.
    const debugging = yield* LogLevel.isEnabled('Debug')
    // Left in the queue by a subscription whose key has gone away since: it was produced after the program
    // stopped listening, so it does not reach `update`.
    if (
      source._tag === 'Subscription'
      && !Opt.contains(HashMap.get(active, source.key), source.generation)
    ) {
      if (debugging) {
        yield* Effect.logDebug('Dropped a message of a stopped subscription', source.key, yield* described(message))
      }
      return active
    }
    const { state, revision } = yield* SubscriptionRef.get(stateRef)
    const result = yield* apply(message, state)
    const origin = originOf(source)
    // The state the message was meant for is gone (a late answer, a second click), or it never applied.
    if (isRejected(result)) {
      if (debugging) {
        yield* Effect.logDebug('Ignored a rejected message', yield* described(message), { origin: origin._tag })
      }
      yield* observeIgnored({ message, origin, state })
      return active
    }
    const { state: next, commands = [] } = result
    // The same state needs no new revision, frame or subscriptions: only its commands, if any, run.
    const changed = next !== state
    const nextRevision = changed ? revision + 1 : revision
    if (debugging) {
      yield* Effect.logDebug('Message', yield* described(message), {
        revision: nextRevision,
        commands: yield* call('describeCommand', () => commands.map(describeCommand)),
      })
    }
    yield* observe({ message, origin, before: state, after: next, revision: nextRevision, commands })
    if (changed) yield* SubscriptionRef.set(stateRef, { state: next, revision: nextRevision })
    const nextActive = changed ? yield* reconcile(active, next) : active
    yield* Effect.forEach(commands, runCommand, { discard: true })
    return nextActive
  })
  const initialActive = yield* reconcile(HashMap.empty(), initState).pipe(Effect.provideContext(context))
  yield* Effect.forEach(initCommands, runCommand, { discard: true })
  yield* Effect.gen(function*() {
    let active = initialActive
    while (true) {
      active = yield* step(active, yield* Queue.take(queue))
    }
  }).pipe(Effect.provideContext(context), FiberSet.run(fibers))
  return {
    await: Effect.raceFirst(
      FiberSet.join(fibers),
      FiberMap.join(subscriptionFibers),
    ).pipe(Effect.andThen(Effect.never)),
    dispatch: enqueue(fromView),
    states: SubscriptionRef.changes(stateRef),
  } satisfies Engine<State, Message>
})
