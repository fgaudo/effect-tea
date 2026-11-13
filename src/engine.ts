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
import * as LogLevel from 'effect/LogLevel'
import * as Opt from 'effect/Option'
import * as Pull from 'effect/Pull'
import * as Queue from 'effect/Queue'
import type * as Scope from 'effect/Scope'
import type * as Stream from 'effect/Stream'
import * as SubscriptionRef from 'effect/SubscriptionRef'
import * as Tracer from 'effect/Tracer'
import type { RunCommand } from './command.ts'
import * as Core from './core.ts'
import type { DefectSite } from './defect.ts'
import { describeByTag } from './log.ts'
import type { Subscription, Subscriptions } from './subscription.ts'
import type { Step, Update } from './update.ts'

export type { Revision, Revisioned } from './core.ts'

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
  revision: Core.Revision
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
 * reporting it to whoever runs the program. Every defect of the cause is wrapped (`wrapDefects`), and a
 * self-interruption, or a failure the types rule out, is a defect too (`otherwiseDefect`). An interruption by the
 * run, or by whoever runs it, is never taken for one: the fiber is asked, where it is uninterruptible, which
 * interruptions it received, and those are kept as they are. An effect that interrupts itself as the run interrupts
 * it ends with both in its cause (Effect adds what the fiber received to a failure that skips its handlers), and its
 * own is still a defect, as a defect would be. The defects are wrapped there too, so that those of an interrupted
 * effect are: what a subscription the run stopped dies with while it releases what it holds.
 */
// The details are made only when there is a defect to carry them: a message is described on every call otherwise.
export const diesIn =
  (
    where: DefectSite,
    details: () => Readonly<{ key?: unknown; on?: unknown }> = () => ({}),
    wrapped: (defect: unknown) => boolean = () => false,
  ) =>
  <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.uninterruptibleMask((restore) =>
      restore(self).pipe(
        Effect.catchCause((cause) =>
          Effect.exit(Effect.interruptible(Effect.void)).pipe(Effect.flatMap((received) => {
            const own = Core.otherwiseDefect(cause, Exit.isFailure(received) ? received.cause : Cause.empty)
            return Effect.failCause(Cause.hasDies(own) ? Core.wrapDefects(own, where, details(), wrapped) : own)
          }))
        ),
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
 * Calls `f` unless the run has died: `None`, with `f` not called, once `dead` says so. The check and the call are
 * one synchronous function, where no other fiber can run, so that no yield of the scheduler lets one die in between,
 * as in `Core.arrive`, which calls `update` with the same check.
 */
export const alive = <A>(dead: () => boolean, f: () => A): Opt.Option<A> => dead() ? Opt.none() : Opt.some(f())

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
  /** Whether a defect has been recorded. */
  readonly dead: () => boolean
  /** Whether `defect` has been recorded, by its identity, never by `Equal`. */
  readonly has: (defect: unknown) => boolean
  /** Dies with the defects recorded since it last ran, in the order they died; succeeds when there is none. */
  readonly report: Effect.Effect<void>
}

export const makeDeaths = Effect.fnUntraced(function*(keeps: (defect: unknown) => boolean) {
  let register = Core.noDeaths
  const died = yield* Deferred.make<void>()
  return {
    recorded: (self) =>
      Effect.onExit(self, (exit) =>
        Effect.suspend(() => {
          if (Exit.isSuccess(exit)) return Effect.void
          const before = register
          register = Core.record(register, exit.cause, keeps)
          return register !== before ? Deferred.succeed(died, undefined) : Effect.void
        })),
    died: Deferred.await(died),
    all: () => register.deaths,
    dead: () => register.deaths.length > 0,
    has: (defect) => Core.hasDied(register, defect),
    report: Effect.suspend(() => {
      const [dies, after] = Core.report(register)
      register = after
      return Opt.match(dies, { onNone: () => Effect.void, onSome: Effect.failCause })
    }),
  } satisfies Deaths
})

// A subscription's message carries the start it comes from, so that once its key goes away, what it left in the queue
// is dropped.
type Envelope<Message, K> = Readonly<{ message: Message; source: Core.Source<K> }>

const fromView: Core.Source<never> = { _tag: 'View' }

const fromCommand: Core.Source<never> = { _tag: 'Command' }

const originOf = <K>(source: Core.Source<K>): Origin =>
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
  readonly states: Stream.Stream<Core.Revisioned<State>>
  /** Enqueues a message sent by the view. */
  readonly dispatch: (message: Message) => Effect.Effect<void>
  /** Succeeds once a fiber of the run has died: of `update`, a command, a subscription, an option or a log. */
  readonly died: Effect.Effect<void>
  /**
   * Dies with every defect the fibers of the run have died of and that it has not reported yet, each a
   * `ProgramDefect`, in the order they died; succeeds when there is none. The end of the run reports the rest.
   */
  readonly report: Effect.Effect<void>
  /**
   * Interrupts the loop and waits for it to end: from then on the run applies no message. The end of the run does it
   * first, before whoever runs the engine stops what sends to it.
   */
  readonly stop: Effect.Effect<void>
  /** Never succeeds: waits until a fiber of the run has died, and dies as `report` does. */
  readonly await: Effect.Effect<never>
}

// Untraced: a span of its own would be the one its fibers log into (see `withExternalSpan`).
export const make = Effect.fnUntraced(function*<State, Message, Command, R, K>({
  deaths: given,
  init: first,
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
  const { recorded, died, report, dead } = deaths
  // A run that died applies no message, until whoever runs it stops the loop, which may run before the fiber that
  // stops it: checked in the thunk that calls `update` (`Core.arrive`), where no other fiber can run, since the
  // scheduler may yield at any other operation. It is the only check: a step whose `update` was called before the
  // death goes on whole until then, so it may still start its commands and the subscriptions of its new keys. One
  // check in the middle of it would leave a state whose commands never started. What the program's effects do once
  // started is theirs, until the end of the run interrupts them.
  // The loop and the commands.
  const fibers = yield* FiberSet.make<unknown, never>()
  // Kept by their start, never by their key: `FiberMap` compares its keys, in a fiber's observer too, where
  // nothing could tell the defect of a key's `Equal` that throws.
  const subscriptionFibers = yield* FiberMap.make<Core.Generation, void, never>()
  // The loop, once it runs. Stopped first as the run ends, and awaited: what is sent meanwhile is not applied, and
  // nothing forks a fiber while the end reads those to interrupt.
  let loop: Fiber.Fiber<unknown, never> | undefined
  const stop = Effect.suspend(() => loop === undefined ? Effect.void : Fiber.interrupt(loop))
  // Run before they close: the end of the run stops the loop, interrupts its other fibers itself, all at once, waits
  // for them to release what they hold, and dies of what they have died of and nobody has reported, which `diesIn`
  // already says where.
  yield* Effect.addFinalizer(() =>
    Effect.andThen(
      stop,
      Effect.suspend(() => {
        const running: ReadonlyArray<Fiber.Fiber<unknown, never>> = [
          ...fibers,
          ...Arr.map(Arr.fromIterable(subscriptionFibers), ([, fiber]) => fiber),
        ]
        return Fiber.interruptAll(running).pipe(
          Effect.andThen(Effect.forEach(running, Fiber.await, { discard: true })),
          Effect.andThen(report),
        )
      }),
    )
  )
  const started = Core.init(first)
  const stateRef = yield* SubscriptionRef.make(started.current)
  const enqueue = (source: Core.Source<K>) => (message: Message) =>
    Effect.asVoid(Queue.offer(queue, { message, source }))
  // Each function of the program or of the options, called where its defect can be told apart from the others'.
  const call = <A>(where: DefectSite, f: () => A) => Effect.sync(f).pipe(diesIn(where))
  // The run's own logs belong to no function of the program: a `Logger` that throws, or that cannot format what
  // it is given, dies in them, and never in the subscription or the loop that logs.
  const log = (...message: ReadonlyArray<unknown>) => Effect.logDebug(...message).pipe(diesIn('log'))
  const described = (message: Message) => call('describeMessage', () => describeMessage(message))
  // Suspended, as the interpreter is below: an option that throws before it returns its effect dies there too.
  const observe = (applied: Applied<State, Message, Command>) =>
    Effect.suspend(() => onApplied(applied)).pipe(diesIn('onApplied'))
  const observeIgnored = (ignored: Ignored<State, Message>) =>
    Effect.suspend(() => onIgnored(ignored)).pipe(diesIn('onIgnored'))
  // The interpreter runs inside the command's fiber, so a defect in it is the command's. Its scope closes
  // before its message is queued, so that `update` never learns of a command whose resources are still open.
  const runCommand = (command: Command) =>
    Effect.suspend(() => interpret(command)).pipe(
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
  const reconcile = Effect.fnUntraced(function*(active: Core.Active<K>, state: State) {
    // The keys are the program's, and so are their `Equal` and `Hash`: they are compared here, in `subscriptions`,
    // and nowhere else in the run.
    const { gone, fresh, active: next } = yield* call(
      'subscriptions',
      () => Core.reconcile(active, subscriptions(state)),
    )
    yield* Effect.forEach(
      gone,
      ([key, generation]) =>
        log('Subscription stopped', key).pipe(Effect.andThen(FiberMap.remove(subscriptionFibers, generation))),
      { concurrency: 'unbounded', discard: true },
    )
    for (const [key, subscription, generation] of fresh) {
      const send = enqueue({ _tag: 'Subscription', key, generation })
      yield* log('Subscription started', key)
      yield* runSubscription(subscription, send).pipe(
        scopedIn(deaths, 'subscription', () => ({ key })),
        Effect.flatMap((last) => log('Subscription ended', key).pipe(Effect.andThen(send(last)))),
        Effect.provideContext(context),
        recorded,
        FiberMap.run(subscriptionFibers, generation),
      )
    }
    return next
  })
  const step = Effect.fnUntraced(function*(active: Core.Active<K>, { message, source }: Envelope<Message, K>) {
    // `describeMessage` and `describeCommand` run for every message, and only to be logged.
    const debugging = yield* LogLevel.isEnabled('Debug')
    const current = yield* SubscriptionRef.get(stateRef)
    const arrived = yield* Effect.sync(() => Core.arrive(update, current, active, source, message, dead)).pipe(
      diesIn('update', () => ({ on: describeByTag(message) })),
    )
    switch (arrived._tag) {
      // Left in the queue by a subscription whose key has gone away since: it was produced after the program
      // stopped listening, so it does not reach `update`.
      case 'Dropped': {
        // The loop takes messages after a death too, and calls nothing of the program on them.
        const description = debugging
          ? yield* call('describeMessage', () => alive(dead, () => describeMessage(message)))
          : Opt.none()
        if (Opt.isSome(description) && source._tag === 'Subscription') {
          yield* log('Dropped a message of a stopped subscription', source.key, description.value)
        }
        return active
      }
      // A fiber died since the loop took the message: it is not applied, and the loop takes no other.
      case 'Dead':
        return active
      // The state the message was meant for is gone (a late answer, a second click), or it never applied.
      case 'Ignored': {
        const origin = originOf(source)
        if (debugging) {
          yield* log('Ignored a rejected message', yield* described(message), { origin: origin._tag })
        }
        yield* observeIgnored({ message, origin, state: current.state })
        return active
      }
      case 'Applied': {
        // The same state needs no new revision, frame or subscriptions: only its commands, if any, run.
        const { next, changed, commands } = arrived
        if (debugging) {
          yield* log('Message', yield* described(message), {
            revision: next.revision,
            commands: yield* call('describeCommand', () => commands.map(describeCommand)),
          })
        }
        yield* observe({
          message,
          origin: originOf(source),
          before: current.state,
          after: next.state,
          revision: next.revision,
          commands,
        })
        if (changed) yield* SubscriptionRef.set(stateRef, next)
        const nextActive = changed ? yield* reconcile(active, next.state) : active
        yield* Effect.forEach(commands, runCommand, { discard: true })
        return nextActive
      }
    }
  })
  // Run in the fiber that makes the engine, which records what it dies of here, among what the subscriptions it starts
  // die of meanwhile.
  const initialActive = yield* reconcile(Core.noneActive, started.current.state).pipe(
    Effect.tap(() => Effect.forEach(started.commands, runCommand, { discard: true })),
    Effect.provideContext(context),
    recorded,
  )
  loop = yield* Effect.gen(function*() {
    let active = initialActive
    while (true) {
      active = yield* step(active, yield* Queue.take(queue))
    }
  }).pipe(Effect.provideContext(context), recorded, FiberSet.run(fibers))
  return {
    await: died.pipe(Effect.andThen(report), Effect.andThen(Effect.never)),
    died,
    report,
    stop,
    dispatch: enqueue(fromView),
    states: SubscriptionRef.changes(stateRef),
  } satisfies Engine<State, Message>
})
