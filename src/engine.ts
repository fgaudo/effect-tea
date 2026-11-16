import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import type * as Fiber from 'effect/Fiber'
import * as FiberMap from 'effect/FiberMap'
import * as FiberSet from 'effect/FiberSet'
import * as LogLevel from 'effect/LogLevel'
import * as Opt from 'effect/Option'
import * as Queue from 'effect/Queue'
import type * as Scope from 'effect/Scope'
import type * as Stream from 'effect/Stream'
import * as SubscriptionRef from 'effect/SubscriptionRef'
import type { RunCommand } from './command.ts'
import * as Core from './core.ts'
import type { DefectSite } from './defect.ts'
import { describeByTag } from './log.ts'
import { type Deaths, diesIn, makeDeaths, runSubscription, scopedIn, stopping, withExternalSpan } from './shell.ts'
import type { Subscriptions } from './subscription.ts'
import type { Step, Update } from './update.ts'

export type { Revision, Revisioned } from './core.ts'

/** Where a message came from: a dispatch, a command, or a subscription, with its key. */
export type Origin =
  | Readonly<{ _tag: 'Dispatch' }>
  | Readonly<{ _tag: 'Command' }>
  | Readonly<{ _tag: 'Subscription'; key: unknown }>

/**
 * A message that `update` accepted: where it came from, the state before and after it, the revision of `after`
 * (unchanged when the state is the same), and the commands it decided.
 */
export type Applied<State, Message, Command> = Readonly<{
  message: Message
  origin: Origin
  before: State
  after: State
  revision: number
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
   * How a message appears in the logs; by default its `_tag`, never its data, and one that is a string whole.
   * Called only while debug logs are enabled.
   */
  readonly describeMessage?: (message: Message) => unknown
  /**
   * How a command appears in the logs; by default its `_tag`, never its data, and one that is a string whole.
   * Called only while debug logs are enabled.
   */
  readonly describeCommand?: (command: Command) => unknown
  /**
   * Hears every message `update` accepts, in order, with the state before and after it and the commands it
   * decided (e.g. for devtools, or to record a session), before its frame is drawn and its commands start: a
   * run that ends meanwhile may do neither. The next message waits for it, so a slow one holds the program: it
   * hands slow work off to a queue (the README's "Running" shows how). A defect in it ends the run like any
   * other.
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

// A subscription's message carries the start it comes from, so that once its key goes away, what it left in the queue
// is dropped.
type Envelope<Message, K> = Readonly<{ message: Message; source: Core.Source<K> }>

const originOf = <K>(source: Core.Source<K>): Origin =>
  source._tag === 'Subscription' ? { _tag: 'Subscription', key: source.key } : source

/** The engine owns its message loop: it runs as long as the scope `make` was called in. */
export interface Engine<State, Message> {
  /** Each state, with `seen`, how many dispatched messages the loop had taken when it was made. */
  readonly states: Stream.Stream<Core.Revisioned<State> & Readonly<{ seen: number }>>
  /** Enqueues a message, and returns its number among those dispatched, from 1. */
  readonly dispatch: (message: Message) => Effect.Effect<number>
  /**
   * Succeeds once a fiber of the run has died: of `update`, `subscriptions`, a command, a subscription, an option
   * (`describeMessage`, `describeCommand`, `onApplied`, `onIgnored`) or a log, or of what whoever runs the engine
   * records in the `deaths` it shares with it (`run`'s `init` and renderer).
   */
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
  const queue = yield* Effect.acquireRelease(Queue.unbounded<Envelope<Message, K>>(), Queue.shutdown)
  const deaths = given ?? (yield* makeDeaths(() => true))
  const { recorded, died, report, dead } = deaths
  // A death is checked once, in `Core.arrive`. A step that passed the check goes on whole until the end of the run
  // stops the loop, so it may still start its commands and the subscriptions of its new keys: one more check in the
  // middle of it would leave a state whose commands never started. What the program's effects do once started is
  // theirs, until the end of the run interrupts them.
  // The loop and the commands.
  const fibers = yield* FiberSet.make<unknown, never>()
  // Kept by their start, never by their key: `FiberMap` compares its keys, in a fiber's observer too, where nothing
  // could tell the defect of a key's `Equal` that throws.
  const subscriptionFibers = yield* FiberMap.make<Core.Generation, void, never>()
  // The loop, once it runs. Stopped first as the run ends, and awaited: what is sent meanwhile is not applied, and
  // nothing forks a fiber while the end reads those to interrupt.
  let loop: Fiber.Fiber<unknown, never> | undefined
  const stop = Effect.suspend(() => loop === undefined ? Effect.void : stopping(loop))
  // Added after the queue and the sets, so run before they close, as a scope runs its finalizers in the reverse order
  // they were added (`docs/premises.md`): the end of the run stops the loop, interrupts its other fibers itself, all
  // at once, waits for them to release what they hold, and dies of what they have died of and nobody has reported,
  // which `diesIn` already says where.
  yield* Effect.addFinalizer(() =>
    Effect.andThen(
      stop,
      Effect.suspend(() => {
        const running: ReadonlyArray<Fiber.Fiber<unknown, never>> = [
          ...fibers,
          ...Arr.map(Arr.fromIterable(subscriptionFibers), ([, fiber]) => fiber),
        ]
        return Effect.forEach(running, stopping, { concurrency: 'unbounded', discard: true }).pipe(
          Effect.andThen(report),
        )
      }),
    )
  )
  const started = Core.init(first)
  // Dispatched messages are numbered as they are queued, in the thunk that offers them, so that their numbers follow
  // the order of the queue, and counted as the loop takes them: a frame's `seen` is the count of its own state's step.
  let sent = 0
  let seen = 0
  const send = (message: Message) =>
    Effect.sync(() => {
      sent += 1
      Queue.offerUnsafe(queue, { message, source: Core.fromDispatch })
      return sent
    })
  const stateRef = yield* SubscriptionRef.make({ ...started.current, seen })
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
      Effect.flatMap(Opt.match({ onNone: () => Effect.void, onSome: enqueue(Core.fromCommand) })),
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
        log('Subscription stopped', key).pipe(
          Effect.andThen(FiberMap.get(subscriptionFibers, generation)),
          Effect.flatMap(Opt.match({ onNone: () => Effect.void, onSome: stopping })),
        ),
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
    if (source._tag === 'Dispatch') seen += 1
    const current = yield* SubscriptionRef.get(stateRef)
    // Described by its tags alone, whatever `describeMessage` says: a report must not run the program's code while the
    // run is dying, nor carry the message's data. The testing tools apply a message the same way.
    const arrived = yield* Effect.sync(() => Core.arrive(update, current, active, source, message, dead)).pipe(
      diesIn('update', () => ({ on: describeByTag(message) })),
    )
    switch (arrived._tag) {
      // Left in the queue by a subscription whose key has gone away since: it was produced after the program
      // stopped listening, so it does not reach `update`. None taken once a fiber has died is dropped (`Core.arrive`),
      // so `describeMessage` is called on none of those; one dropped before the death is still described, since the
      // step goes on whole (as said under `deaths`).
      case 'Dropped': {
        if (debugging && source._tag === 'Subscription') {
          yield* log('Dropped a message of a stopped subscription', source.key, yield* described(message))
        }
        return active
      }
      // A fiber had died when `Core.arrive` checked: the message is not applied.
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
        if (changed) yield* SubscriptionRef.set(stateRef, { ...next, seen })
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
  // The fork and its assignment are one step nothing interrupts: interrupted between them, the fiber that makes the
  // engine would close its scope with a loop `stop` does not know of. The loop is interruptible all the same, as a
  // fiber forked where nothing interrupts is (`docs/premises.md`).
  yield* Effect.gen(function*() {
    let active = initialActive
    while (true) {
      active = yield* step(active, yield* Queue.take(queue))
    }
  }).pipe(
    Effect.provideContext(context),
    recorded,
    FiberSet.run(fibers),
    Effect.map((fiber) => {
      loop = fiber
    }),
    Effect.uninterruptible,
  )
  return {
    died,
    report,
    stop,
    dispatch: send,
    states: SubscriptionRef.changes(stateRef),
  } satisfies Engine<State, Message>
})
