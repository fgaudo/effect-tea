import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import type * as Fiber from "effect/Fiber"
import * as FiberMap from "effect/FiberMap"
import * as FiberSet from "effect/FiberSet"
import * as LogLevel from "effect/LogLevel"
import * as Opt from "effect/Option"
import * as Queue from "effect/Queue"
import type * as Scope from "effect/Scope"
import type * as Stream from "effect/Stream"
import * as SubscriptionRef from "effect/SubscriptionRef"
import type { RunCommand } from "./command.ts"
import * as Core from "./core.ts"
import type { DefectSite } from "./defect.ts"
import { describeByTag } from "./log.ts"
import {
  type Deaths,
  diesIn,
  makeDeaths,
  rootedIn,
  runSubscription,
  scopedIn,
  stopping,
  withExternalSpan
} from "./shell.ts"
import type { Subscriptions } from "./subscription.ts"
import type { Step, Update } from "./update.ts"

export type { Revision, Revisioned } from "./core.ts"

/**
 * Where a message came from: a dispatch, a command, or a subscription.
 *
 * `onApplied` and `onIgnored` hear it with each message.
 *
 * @see The guide, "Running", "`onApplied`".
 * @see The guide, "Running", "`onIgnored`".
 */
export type Origin =
  | { readonly _tag: "Dispatch" }
  | { readonly _tag: "Command" }
  | {
    readonly _tag: "Subscription"
    /** The key of the subscription that sent the message. */
    readonly key: unknown
  }

/**
 * A message that `update` accepted, as `onApplied` hears it.
 *
 * A program without commands leaves `Command` as `never`.
 *
 * The first state is revision 0, and each new one the next. When `update` returns the same object it was given, the
 * revision stays as it was.
 *
 * @example
 * ```ts
 * const session: Array<Message> = []
 * const onApplied = ({ message }: Applied<State, Message, Command>): undefined => {
 *   session.push(message)
 * }
 * ```
 *
 * @see The guide, "Running", "`onApplied`".
 */
export type Applied<State, Message, Command = never> = {
  /** The message. */
  readonly message: Message
  /** Where it came from. */
  readonly origin: Origin
  /** The state it was applied in. */
  readonly before: State
  /** The state it came to. */
  readonly after: State
  /** The revision of `after`. */
  readonly revision: number
  /** The commands it decided. */
  readonly commands: ReadonlyArray<Command>
}

/**
 * A message that `update` rejected, as `onIgnored` hears it.
 *
 * @example
 * ```ts
 * let taps = 0
 * const onIgnored = ({ origin }: Ignored<State, Message>): undefined => {
 *   if (origin._tag === 'Dispatch') taps += 1
 * }
 * ```
 *
 * @see The guide, "Running", "`onIgnored`".
 */
export type Ignored<State, Message> = {
  /** The message. */
  readonly message: Message
  /** Where it came from. */
  readonly origin: Origin
  /** The state it did not apply in. */
  readonly state: State
}

/**
 * The options of a run: how messages and commands appear in the logs, and what hears each message.
 *
 * `run` and `drive` take them.
 *
 * @example
 * ```ts
 * run(program, render, { describeMessage: (message) => (message._tag === 'Searched' ? message : message._tag) })
 * ```
 *
 * @see The guide, "Running", "Options".
 */
export interface RunOptions<State, Message, Command = unknown> {
  /**
   * How a message appears in the logs.
   *
   * By default only its tags appear, never its data: `Home › Products › Deleted`. A message that is a string appears
   * whole. It is called only while debug logs are enabled.
   *
   * @see The guide, "Running", "`describeMessage`".
   * @see The guide, "Running", "How messages and commands appear in the logs".
   */
  readonly describeMessage?: (message: Message) => unknown
  /**
   * How a command appears in the logs.
   *
   * By default only its tags appear, never its data. A command that is a string appears whole. It is called only while
   * debug logs are enabled.
   *
   * @see The guide, "Running", "`describeMessage`".
   * @see The guide, "Running", "How messages and commands appear in the logs".
   */
  readonly describeCommand?: (command: Command) => unknown
  /**
   * Hears each message `update` accepts.
   *
   * - It is a function, not an effect, and returns nothing. The types refuse one that returns a value.
   *   Declared apart, it needs the return type `undefined`: TypeScript gives it `void` otherwise, which they refuse.
   * - The run calls it before the next message, the message's frame and its commands. A slow one holds up the whole
   *   program: offer what it hears to an unbounded queue, and do the slow work in a fiber raced with the run.
   * - A defect in it ends the run.
   * - From a defect on, the run applies no message. So it hears, at the latest, the step under way at the defect.
   *
   * @example
   * ```ts
   * const app = Effect.gen(function*() {
   *   const heard = yield* Queue.unbounded<Applied<State, Message, Command>>()
   *   const report = Queue.take(heard).pipe(Effect.flatMap(sendToDevtools), Effect.forever)
   *   const running = run(program, render, {
   *     onApplied: (applied) => {
   *       Queue.offerUnsafe(heard, applied)
   *     }
   *   })
   *   yield* Effect.raceFirst(running, report)
   * })
   * ```
   *
   * @see The guide, "Running", "`onApplied`".
   * @see The guide, "Running", "`onApplied` and `onIgnored` are functions, not effects".
   * @see The guide, "Running", "The run calls `onApplied` and `onIgnored` in order".
   * @see The guide, "Running", "Give slow work to a queue".
   * @see The guide, "Running", "What the run still does after a defect".
   */
  readonly onApplied?: (applied: Applied<State, Message, Command>) => undefined
  /**
   * Hears each message `update` rejects, which the run ignores.
   *
   * - It only watches: the message stays ignored.
   * - It is a function, not an effect, and returns nothing. The types refuse one that returns a value.
   *   Declared apart, it needs the return type `undefined`: TypeScript gives it `void` otherwise, which they refuse.
   * - The run calls it before the next message. A slow one holds up the whole program: offer what it hears to an
   *   unbounded queue, and do the slow work in a fiber raced with the run.
   * - A defect in it ends the run.
   *
   * @see The guide, "Running", "`onIgnored`".
   * @see The guide, "Running", "`onApplied` and `onIgnored` are functions, not effects".
   * @see The guide, "Running", "The run calls `onApplied` and `onIgnored` in order".
   * @see The guide, "Running", "Give slow work to a queue".
   */
  readonly onIgnored?: (ignored: Ignored<State, Message>) => undefined
}

// A subscription's message carries the start it comes from, so that once its key goes away, what it left in the queue
// is dropped.
type Envelope<Message, K> = Readonly<{ message: Message; source: Core.Source<K> }>

const originOf = <K>(source: Core.Source<K>): Origin =>
  source._tag === "Subscription" ? { _tag: "Subscription", key: source.key } : source

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
  onApplied = () => undefined,
  onIgnored = () => undefined
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
  & RunOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>>)
{
  // The run's context, its scope included: what a command or a subscription acquires goes into a scope of its own,
  // which `scopedIn` puts in front of this one ("Each command, each subscription and the renderer has a scope of its
  // own", `docs/invariants.md`).
  const context = withExternalSpan(yield* Effect.context<Exclude<R, Scope.Scope>>())
  const queue = yield* Effect.acquireRelease(Queue.unbounded<Envelope<Message, K>>(), Queue.shutdown)
  const deaths = given ?? (yield* makeDeaths(() => true))
  const { recorded, died, report, dead } = deaths
  // A death is checked once, in `Core.arrive`, and a step that passed it goes on whole: no check is added in the middle
  // of one ("Defects always die", `docs/invariants.md`).
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
          ...Arr.map(Arr.fromIterable(subscriptionFibers), ([, fiber]) => fiber)
        ]
        return Effect.forEach(running, stopping, { concurrency: "unbounded", discard: true }).pipe(
          Effect.andThen(report)
        )
      })
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
  const log = (...message: ReadonlyArray<unknown>) => Effect.logDebug(...message).pipe(diesIn("log"))
  const described = (message: Message) => call("describeMessage", () => describeMessage(message))
  // The options run no effect, so that the loop runs none of the program's, which could reach the loop's fiber.
  const observe = (applied: Applied<State, Message, Command>) => call("onApplied", () => onApplied(applied))
  const observeIgnored = (ignored: Ignored<State, Message>) => call("onIgnored", () => onIgnored(ignored))
  // The interpreter runs inside the command's fiber, so a defect in it is the command's. Its scope closes
  // before its message is queued, so that `update` never learns of a command whose resources are still open.
  const runCommand = (command: Command) =>
    Effect.suspend(() => interpret(command)).pipe(
      scopedIn(deaths, "command"),
      Effect.flatMap(Opt.match({ onNone: () => Effect.void, onSome: enqueue(Core.fromCommand) })),
      rootedIn("command"),
      Effect.provideContext(context),
      recorded,
      FiberSet.run(fibers)
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
      "subscriptions",
      () => Core.reconcile(active, subscriptions(state))
    )
    yield* Effect.forEach(
      gone,
      ([key, generation]) =>
        log("Subscription stopped", key).pipe(
          Effect.andThen(FiberMap.get(subscriptionFibers, generation)),
          Effect.flatMap(Opt.match({ onNone: () => Effect.void, onSome: stopping }))
        ),
      { concurrency: "unbounded", discard: true }
    )
    for (const [key, subscription, generation] of fresh) {
      const send = enqueue({ _tag: "Subscription", key, generation })
      yield* log("Subscription started", key)
      yield* runSubscription(subscription, send).pipe(
        scopedIn(deaths, "subscription", () => ({ key })),
        Effect.flatMap((last) => log("Subscription ended", key).pipe(Effect.andThen(send(last)))),
        rootedIn("subscription", () => ({ key })),
        Effect.provideContext(context),
        recorded,
        FiberMap.run(subscriptionFibers, generation)
      )
    }
    return next
  })
  const step = Effect.fnUntraced(function*(active: Core.Active<K>, { message, source }: Envelope<Message, K>) {
    // `describeMessage` and `describeCommand` run for every message, and only to be logged.
    const debugging = yield* LogLevel.isEnabled("Debug")
    if (source._tag === "Dispatch") seen += 1
    const current = yield* SubscriptionRef.get(stateRef)
    // Described by its tags alone, whatever `describeMessage` says: a report must not run the program's code while the
    // run is dying, nor carry the message's data. The testing tools apply a message the same way.
    const arrived = yield* Effect.sync(() => Core.arrive(update, current, active, source, message, dead)).pipe(
      diesIn("update", () => ({ on: describeByTag(message) }))
    )
    switch (arrived._tag) {
      // Left in the queue by a subscription whose key has gone away since: it was produced after the program
      // stopped listening, so it does not reach `update`. None taken once a fiber has died is dropped (`Core.arrive`),
      // so `describeMessage` is called on none of those; one dropped before the death is still described, since the
      // step goes on whole (as said under `deaths`).
      case "Dropped": {
        if (debugging && source._tag === "Subscription") {
          yield* log("Dropped a message of a stopped subscription", source.key, yield* described(message))
        }
        return active
      }
      // A fiber had died when `Core.arrive` checked: the message is not applied.
      case "Dead":
        return active
      // The state the message was meant for is gone (a late answer, a second click), or it never applied.
      case "Ignored": {
        const origin = originOf(source)
        if (debugging) {
          yield* log("Ignored a rejected message", yield* described(message), { origin: origin._tag })
        }
        yield* observeIgnored({ message, origin, state: current.state })
        return active
      }
      case "Applied": {
        // The same state needs no new revision, frame or subscriptions: only its commands, if any, run.
        const { next, changed, commands } = arrived
        if (debugging) {
          yield* log("Message", yield* described(message), {
            revision: next.revision,
            commands: yield* call("describeCommand", () => commands.map(describeCommand))
          })
        }
        yield* observe({
          message,
          origin: originOf(source),
          before: current.state,
          after: next.state,
          revision: next.revision,
          commands
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
    recorded
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
    Effect.uninterruptible
  )
  return {
    died,
    report,
    stop,
    dispatch: send,
    states: SubscriptionRef.changes(stateRef)
  } satisfies Engine<State, Message>
})
