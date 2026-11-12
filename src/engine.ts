import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Context from 'effect/Context'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as FiberMap from 'effect/FiberMap'
import * as FiberSet from 'effect/FiberSet'
import * as HashMap from 'effect/HashMap'
import * as LogLevel from 'effect/LogLevel'
import * as Opt from 'effect/Option'
import * as Pull from 'effect/Pull'
import * as Queue from 'effect/Queue'
import type * as Scope from 'effect/Scope'
import type * as Stream from 'effect/Stream'
import * as SubscriptionRef from 'effect/SubscriptionRef'
import * as Tracer from 'effect/Tracer'
import type { RunCommand } from './command.ts'
import { type DefectSite, ProgramDefect } from './defect.ts'
import { describeByTag } from './log.ts'
import type { Subscription, Subscriptions } from './subscription.ts'
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
   * The next message waits for it, so a slow one holds the program: it hands slow work off to a queue (the
   * README's "Running" shows how). A defect in it ends the run like any other.
   */
  readonly onApplied?: (applied: Applied<State, Message, Command>) => Effect.Effect<void>
  /**
   * Hears every message `update` rejects, which the run ignores, with where it came from and the state it did
   * not apply in (e.g. for devtools, or to count the taps that did nothing). It only watches: the message stays
   * ignored, and the state as it was. The next message waits for it, so a slow one holds the program: it hands
   * slow work off to a queue, as `onApplied` does. A defect in it ends the run like any other.
   */
  readonly onIgnored?: (ignored: Ignored<State, Message>) => Effect.Effect<void>
}

/**
 * Where a defect happened is known only where it is caught: the run dies with it, and with where, and leaves
 * reporting it to whoever runs the program. Every defect of the cause is wrapped, with its stack and span, and
 * the rest of the cause is kept as it is: `Effect.catchDefect` would keep only the first defect. An effect that
 * interrupts itself (`Effect.interrupt`, or the join of an interrupted fiber) is a defect too: the fibers of a
 * run ignore their interruptions, which would leave a command without its answer, or a subscription ended in
 * silence. So is any other failure, which the types rule out (an empty cause, a failure a cast let through): it would
 * end the run with no defect to report. Either is a defect beside the defects of the cause too, in the place it
 * happened: a release that interrupts itself after its effect died. An interruption by the run, or by whoever runs
 * it, is never taken for one: an interrupted fiber runs no handler while it is interruptible, as it is where the
 * effect runs. The defects are wrapped where it is not, so that those of an interrupted effect are too: what a
 * subscription the run stopped dies with while it releases what it holds.
 */
const diesOnly = (cause: Cause.Cause<unknown>) => Cause.hasDies(cause) && cause.reasons.every(Cause.isDieReason)

// The details are made only when there is a defect to carry them: a message is described on every call otherwise.
export const diesIn =
  (
    where: DefectSite,
    details: () => Readonly<{ key?: unknown; on?: unknown }> = () => ({}),
    wrapped: (defect: unknown) => boolean = () => false,
  ) =>
  <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.uninterruptibleMask((restore) =>
      restore(
        // Beside a defect too: a release that interrupts itself after its effect died is a second defect.
        Effect.catchCauseIf(self, (cause) => !diesOnly(cause), (cause) => {
          const others = Cause.fromReasons(cause.reasons.filter((reason) => !Cause.isDieReason(reason)))
          const defect = Cause.die(
            new Error(
              Cause.hasInterruptsOnly(others)
                ? 'It interrupted itself, which only the run may do'
                : 'It failed, which its type rules out',
              { cause: others },
            ),
          ).reasons
          // In the place of the first of them, so that the defects stay in the order they happened.
          const first = cause.reasons.findIndex((reason) => !Cause.isDieReason(reason))
          return Effect.failCause(Cause.fromReasons<never>(
            first === -1 ? defect : cause.reasons.flatMap((reason, index) =>
              Cause.isDieReason(reason) ? [reason] : index === first ? defect : []
            ),
          ))
        }),
      ).pipe(
        Effect.catchCauseIf(Cause.hasDies, (cause) =>
          Effect.failCause(Cause.fromReasons(cause.reasons.flatMap((reason): ReadonlyArray<Cause.Reason<E>> =>
            Cause.isDieReason(reason) && !wrapped(reason.defect)
              ? Cause.annotate(
                Cause.die(new ProgramDefect({ where, cause: reason.defect, ...details() })),
                Cause.reasonAnnotations(reason),
              ).reasons
              : [reason]
          )))),
      )
    )

/**
 * `Effect.scoped`, for a fiber of the run with a scope of its own, whose defects die in `where`: what `self` dies of
 * is recorded as it dies, before its scope releases what it holds, and what the release dies of as it ends. A
 * defect is in the order it happened, though the release of what died first lets another fiber die before it ends.
 */
export const scopedIn =
  (deaths: Deaths, where: DefectSite, details?: () => Readonly<{ key?: unknown; on?: unknown }>) =>
  <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, Exclude<R, Scope.Scope>> =>
    Effect.scoped(self.pipe(diesIn(where, details), deaths.recorded)).pipe(
      diesIn(where, details, deaths.has),
      deaths.recorded,
    )

/**
 * Runs a subscription, sending each of its messages, in the scope of the fiber that runs it, and returns its last
 * message: what the channel acquires in scopes of its own is released as that scope closes, after `scopedIn` has
 * recorded what the subscription died of. `Channel.runForEach` closes a scope of its own first, so that a defect would
 * wait for that release, while the loop goes on applying messages.
 */
export const runSubscription = <Message, R, RS>(
  subscription: Subscription<Message, R>,
  send: (message: Message) => Effect.Effect<void, never, RS>,
): Effect.Effect<Message, never, R | RS | Scope.Scope> =>
  Channel.toPull(subscription).pipe(
    Effect.flatMap((pull) => Effect.forever(Effect.flatMap(pull, send), { disableYield: true })),
    Pull.catchDone(Effect.succeed),
  )

// Described by its tags alone, whatever `describeMessage` says: a report must not run the program's code while the
// run is dying, nor carry the message's data. The testing tools apply a message the same way.
export const applyIn = <State, Message, Command, Event>(
  update: Update<State, Message, Command, Event>,
  message: Message,
  state: State,
) => Effect.sync(() => update(message)(state)).pipe(diesIn('update', () => ({ on: describeByTag(message) })))

/**
 * Where the fibers of a run, or of a rehearsal, record what they die of, as they end, however they end: nothing is
 * lost to a `join` that nobody awaits any more, or to a `FiberSet` or a `FiberMap` that discards the exits of the
 * fibers it interrupts as it closes. Each defect is kept once, by its identity, in the order the fibers died: a
 * fiber that joins one that died dies of the same defect.
 */
export interface Deaths {
  /** Records the defects that `self` dies of, those `keeps` accepts, however it ends. */
  readonly recorded: <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  /** Succeeds once a defect has been recorded. */
  readonly died: Effect.Effect<void>
  /** The defects recorded so far, in the order they died. */
  readonly all: () => ReadonlyArray<Cause.Die>
  /** Whether `defect` has been recorded, by its identity, never by `Equal`. */
  readonly has: (defect: unknown) => boolean
  /** Dies with the defects recorded since it last ran, in the order they died; succeeds when there is none. */
  readonly report: Effect.Effect<void>
}

export const makeDeaths = Effect.fnUntraced(function*(keeps: (defect: unknown) => boolean) {
  const deaths: Array<Cause.Die> = []
  let reported = 0
  const died = yield* Deferred.make<void>()
  const has = (defect: unknown) => deaths.some((death) => death.defect === defect)
  return {
    recorded: (self) =>
      Effect.onExit(self, (exit) =>
        Effect.suspend(() => {
          if (Exit.isSuccess(exit)) return Effect.void
          const before = deaths.length
          for (const reason of exit.cause.reasons) {
            if (Cause.isDieReason(reason) && keeps(reason.defect) && !has(reason.defect)) deaths.push(reason)
          }
          return deaths.length > before ? Deferred.succeed(died, undefined) : Effect.void
        })),
    died: Deferred.await(died),
    all: () => deaths,
    has,
    report: Effect.suspend(() => {
      const dies = deaths.slice(reported)
      reported = deaths.length
      return Arr.isArrayNonEmpty(dies) ? Effect.failCause(Cause.fromReasons<never>(dies)) : Effect.void
    }),
  } satisfies Deaths
})

/** Counts the starts of subscriptions: each start of a key gets a new one. */
type Generation = number

/**
 * The keys a run listens to, each with its start, and those starts: a subscription's message applies exactly when
 * its start is among them, which takes no comparison of keys.
 */
type Active<K> = Readonly<{ keys: HashMap.HashMap<K, Generation>; starts: ReadonlySet<Generation> }>

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
  /** Succeeds once a fiber of the run has died: of `update`, a command, a subscription, an option or a log. */
  readonly died: Effect.Effect<void>
  /**
   * Dies with every defect the fibers of the run have died of and that it has not reported yet, each a
   * `ProgramDefect`, in the order they died; succeeds when there is none. The end of the run reports the rest.
   */
  readonly report: Effect.Effect<void>
  /** Never succeeds: waits until a fiber of the run has died, and dies as `report` does. */
  readonly await: Effect.Effect<never>
}

// Untraced: a span of its own would be the one its fibers log into (see `withExternalSpan`).
export const make = Effect.fnUntraced(function*<State, Message, Command, R, K>({
  deaths: given,
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
    /**
     * Where the fibers of the run record what they die of, shared with whoever runs the engine, so that what its own
     * fibers die of is in the same order: every defect a `ProgramDefect`, which `diesIn` has made each, but for the
     * engine's own, which the run dies of all the same. By default, one of its own.
     */
    deaths?: Deaths
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
  const deaths = given ?? (yield* makeDeaths(() => true))
  const { recorded, died, report, all } = deaths
  // A run that died applies no message, and starts no command and no subscription, as nothing happens in a run that
  // died, while whoever runs it stops it: the renderer, which it stops first, may take a while to release what it
  // holds. A step under way when another fiber dies goes on, as it may wait for a release or an option: what it would
  // start is checked in the fiber that starts it, as it starts, since another fiber may die before it does.
  const dead = () => all().length > 0
  // The loop and the commands.
  const fibers = yield* FiberSet.make<unknown, never>()
  // Kept by their start, never by their key: `FiberMap` compares its keys, in a fiber's observer too, where
  // nothing could tell the defect of a key's `Equal` that throws.
  const subscriptionFibers = yield* FiberMap.make<Generation, void, never>()
  // Run before they close: the end of the run interrupts its fibers itself, all at once, waits for them to release
  // what they hold, and dies of what they have died of and nobody has reported, which `diesIn` already says where.
  yield* Effect.addFinalizer(() =>
    Effect.suspend(() => {
      const running: ReadonlyArray<Fiber.Fiber<unknown, never>> = [
        ...fibers,
        ...Arr.map(Arr.fromIterable(subscriptionFibers), ([, fiber]) => fiber),
      ]
      return Fiber.interruptAll(running).pipe(
        Effect.andThen(Effect.forEach(running, Fiber.await, { discard: true })),
        Effect.andThen(report),
      )
    })
  )
  const stateRef = yield* SubscriptionRef.make<Revisioned<State>>({ state: initState, revision: 0 })
  const enqueue = (source: Source<K>) => (message: Message) => Effect.asVoid(Queue.offer(queue, { message, source }))
  // Only the loop starts subscriptions, one step at a time.
  let started: Generation = 0
  // Each function of the program or of the options, called where its defect can be told apart from the others'.
  const call = <A>(where: DefectSite, f: () => A) => Effect.sync(f).pipe(diesIn(where))
  // The run's own logs belong to no function of the program: a `Logger` that throws, or that cannot format what
  // it is given, dies in them, and never in the subscription or the loop that logs.
  const log = (...message: ReadonlyArray<unknown>) => Effect.logDebug(...message).pipe(diesIn('log'))
  const apply = (message: Message, state: State) => applyIn(update, message, state)
  const described = (message: Message) => call('describeMessage', () => describeMessage(message))
  // Suspended, as the interpreter is below: an option that throws before it returns its effect dies there too.
  const observe = (applied: Applied<State, Message, Command>) =>
    Effect.suspend(() => onApplied(applied)).pipe(diesIn('onApplied'))
  const observeIgnored = (ignored: Ignored<State, Message>) =>
    Effect.suspend(() => onIgnored(ignored)).pipe(diesIn('onIgnored'))
  // The interpreter runs inside the command's fiber, so a defect in it is the command's. Its scope closes
  // before its message is queued, so that `update` never learns of a command whose resources are still open.
  const runCommand = (command: Command) =>
    Effect.suspend(() => dead() ? Effect.succeedNone : interpret(command)).pipe(
      scopedIn(deaths, 'command'),
      Effect.flatMap(Opt.match({ onNone: () => Effect.void, onSome: enqueue(fromCommand) })),
      Effect.provideContext(context),
      recorded,
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
  const reconcile = Effect.fnUntraced(function*(active: Active<K>, state: State) {
    // The keys are the program's, and so are their `Equal` and `Hash`: they are compared here, in `subscriptions`,
    // and nowhere else in the run.
    const { gone, fresh, next } = yield* call('subscriptions', () => {
      const listed = subscriptions(state)
      const gone = Arr.filter(Arr.fromIterable(active.keys), ([key]) => !HashMap.has(listed, key))
      const fresh: Array<readonly [K, Subscription<Message, R>, Generation]> = []
      let keys = HashMap.empty<K, Generation>()
      for (const [key, subscription] of listed) {
        const running = HashMap.get(active.keys, key)
        if (Opt.isSome(running)) {
          keys = HashMap.set(keys, key, running.value)
          continue
        }
        started += 1
        keys = HashMap.set(keys, key, started)
        fresh.push([key, subscription, started])
      }
      const next: Active<K> = { keys, starts: new Set(HashMap.values(keys)) }
      return { gone, fresh, next }
    })
    yield* Effect.forEach(
      gone,
      ([key, generation]) =>
        log('Subscription stopped', key).pipe(Effect.andThen(FiberMap.remove(subscriptionFibers, generation))),
      { concurrency: 'unbounded', discard: true },
    )
    for (const [key, subscription, generation] of fresh) {
      if (dead()) break
      const send = enqueue({ _tag: 'Subscription', key, generation })
      yield* log('Subscription started', key)
      // Checked again as its fiber starts, so that nothing rests on when a forked fiber first runs, which Effect does
      // not document: today it runs before the loop goes on, and no test reaches a death in between.
      yield* Effect.suspend(() =>
        dead() ? Effect.void : runSubscription(subscription, send).pipe(
          scopedIn(deaths, 'subscription', () => ({ key })),
          Effect.flatMap((last) => log('Subscription ended', key).pipe(Effect.andThen(send(last)))),
        )
      ).pipe(
        Effect.provideContext(context),
        recorded,
        FiberMap.run(subscriptionFibers, generation),
      )
    }
    return next
  })
  const step = Effect.fnUntraced(function*(active: Active<K>, { message, source }: Envelope<Message, K>) {
    // `describeMessage` and `describeCommand` run for every message, and only to be logged.
    const debugging = yield* LogLevel.isEnabled('Debug')
    // Left in the queue by a subscription whose key has gone away since: it was produced after the program
    // stopped listening, so it does not reach `update`.
    if (source._tag === 'Subscription' && !active.starts.has(source.generation)) {
      if (debugging) {
        yield* log('Dropped a message of a stopped subscription', source.key, yield* described(message))
      }
      return active
    }
    const { state, revision } = yield* SubscriptionRef.get(stateRef)
    const result = yield* apply(message, state)
    const origin = originOf(source)
    // The state the message was meant for is gone (a late answer, a second click), or it never applied.
    if (isRejected(result)) {
      if (debugging) {
        yield* log('Ignored a rejected message', yield* described(message), { origin: origin._tag })
      }
      yield* observeIgnored({ message, origin, state })
      return active
    }
    const { state: next, commands = [] } = result
    // The same state needs no new revision, frame or subscriptions: only its commands, if any, run.
    const changed = next !== state
    const nextRevision = changed ? revision + 1 : revision
    if (debugging) {
      yield* log('Message', yield* described(message), {
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
  // Run in the fiber that makes the engine, which records what it dies of here, among what the subscriptions it starts
  // die of meanwhile.
  const initialActive = yield* reconcile({ keys: HashMap.empty(), starts: new Set() }, initState).pipe(
    Effect.tap(() => Effect.forEach(initCommands, runCommand, { discard: true })),
    Effect.provideContext(context),
    recorded,
  )
  yield* Effect.gen(function*() {
    let active = initialActive
    while (true) {
      const envelope = yield* Queue.take(queue)
      if (dead()) return
      active = yield* step(active, envelope)
    }
  }).pipe(Effect.provideContext(context), recorded, FiberSet.run(fibers))
  return {
    await: died.pipe(Effect.andThen(report), Effect.andThen(Effect.never)),
    died,
    report,
    dispatch: enqueue(fromView),
    states: SubscriptionRef.changes(stateRef),
  } satisfies Engine<State, Message>
})
