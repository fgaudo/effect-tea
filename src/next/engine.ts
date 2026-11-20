// The engine of `docs/records/synchronous-dispatch.md`, written beside `src/engine.ts` until the swap of its stage 4: a
// message is applied in the call that sends it. The pure half of a step, `update`, the option that hears it, the new
// state and the keys of that state, is one synchronous thunk, called by a dispatch, a command's answer and a
// subscription's message alike, from whatever fiber or callback sends it. What the step does of effects, its
// subscriptions stopped and started, its commands started and its logs, is a job for one fiber of effects, which takes
// the jobs in the order of the states.
import * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import type * as Fiber from "effect/Fiber"
import * as FiberMap from "effect/FiberMap"
import * as FiberSet from "effect/FiberSet"
import * as LogLevel from "effect/LogLevel"
import * as Opt from "effect/Option"
import * as Queue from "effect/Queue"
import type * as Scope from "effect/Scope"
import type { RunCommand } from "../command.ts"
import * as Core from "../core.ts"
import type { DefectSite } from "../defect.ts"
import type { Applied, Ignored, Origin, RunOptions } from "../engine.ts"
import { describeByTag } from "../log.ts"
import {
  type Deaths,
  diesIn,
  makeDeaths,
  rootedIn,
  runSubscription,
  scopedIn,
  stopping,
  withExternalSpan
} from "../shell.ts"
import type { Subscription, Subscriptions } from "../subscription.ts"
import type { Step, Update } from "../update.ts"

const originOf = <K>(source: Core.Source<K>): Origin =>
  source._tag === "Subscription" ? { _tag: "Subscription", key: source.key } : source

/** What a step leaves to the fiber of effects, in the order it is done. */
type Job<Message, Command, R, K> = Readonly<{
  /** The run's own debug logs of the message, written first, as the loop of `src/engine.ts` writes them. */
  logs: Opt.Option<Effect.Effect<void>>
  gone: ReadonlyArray<readonly [K, Core.Generation]>
  fresh: ReadonlyArray<readonly [K, Subscription<Message, R>, Core.Generation]>
  commands: ReadonlyArray<Command>
}>

/** The engine applies each message as it is sent, and runs the effects of its steps in a fiber of its own. */
export interface Engine<State, Message> {
  /** The current state: the one the last message applied made, at once. */
  readonly current: () => Core.Revisioned<State>
  /**
   * Hears each new state, once it is the current one: never for a rejected message, nor for the very same state.
   * Returns what stops it.
   */
  readonly subscribe: (listener: () => void) => () => void
  /**
   * Applies a message at once: when it returns, `update` has heard it, and so has `onApplied` or `onIgnored`. One sent
   * while another is being applied, as a listener sends one, is applied right after it, before the outer call returns.
   * Returns nothing: a defect is recorded, never thrown to the caller.
   */
  readonly dispatch: (message: Message) => void
  /** Succeeds once a fiber of the run, or a function of the program called in the thunk, has recorded a defect. */
  readonly died: Effect.Effect<void>
  /** Dies with every defect not reported yet, in the order they died; succeeds when there is none. */
  readonly report: Effect.Effect<void>
  /**
   * Applies nothing sent from now on, then interrupts the fiber of effects and waits for it to end. The end of the run
   * does it first, before whoever runs the engine stops what sends to it.
   */
  readonly stop: Effect.Effect<void>
}

/**
 * Records what a function of the program threw where plain code called it, in `where`, wrapped in a `ProgramDefect` as
 * `diesIn` wraps a defect (`Core.wrapDefects`), but for one `wrapped` accepts, which is recorded as it is; and returns
 * what it recorded, the same object each time it is recorded again. No fiber is made for it.
 */
export const recordThrown = (
  deaths: Deaths,
  where: DefectSite,
  thrown: unknown,
  details: () => Readonly<{ key?: unknown; on?: unknown }> = () => ({}),
  wrapped: (defect: unknown) => boolean = () => false
): unknown => {
  const cause = Core.wrapDefects(Cause.die(thrown), where, details(), wrapped)
  deaths.record(cause)
  const [reason] = cause.reasons
  return reason !== undefined && Cause.isDieReason(reason) ? reason.defect : thrown
}

// Untraced: a span of its own would be the one its fibers log into (see `withExternalSpan`).
export const make = Effect.fnUntraced(function*<State, Message, Command, R, K>({
  deaths: given,
  rendered = () => false,
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
     * Where the fibers of the run, and the thunk, record what they die of, shared with whoever runs the engine. By
     * default, one of its own.
     */
    deaths?: Deaths
    /**
     * The defects a listener may throw that are the renderer's already, recorded in `'render'` where they were thrown,
     * and taken as they are: those of a model, which `run` records where it is read. By default, none.
     */
    rendered?: (defect: unknown) => boolean
    init: Step<State, Command>
    update: Update<State, Message, Command>
    runCommand: RunCommand<Command, Message, R>
    subscriptions: Subscriptions<State, Message, R, K>
  }>
  & RunOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>>)
{
  // The run's context, its scope included: what a command or a subscription acquires goes into a scope of its own,
  // which `scopedIn` puts in front of this one.
  const context = withExternalSpan(yield* Effect.context<Exclude<R, Scope.Scope>>())
  const jobs = yield* Effect.acquireRelease(Queue.unbounded<Job<Message, Command, R, K>>(), Queue.shutdown)
  const deaths = given ?? (yield* makeDeaths(() => true))
  const { recorded, died, report, dead } = deaths
  // The fiber of effects and the commands.
  const fibers = yield* FiberSet.make<unknown, never>()
  // Kept by their start, never by their key, as in `src/engine.ts`.
  const subscriptionFibers = yield* FiberMap.make<Core.Generation, void, never>()
  // What the thunk reads and writes, on the caller's stack: no fiber runs between its operations.
  const started = Core.init(first)
  let current = started.current
  // The keys of the current state, made true of it in the thunk that makes it: a subscription's message is dropped as
  // soon as its key is gone, though the fiber of effects has not stopped it yet, or not started it.
  let active: Core.Active<K> = Core.noneActive
  // Set by the end, in its first operation: from then on nothing sent is applied. The one check of it is in `apply`.
  let stopped = false
  // The messages sent while one is being applied, applied after it, in the order they were sent.
  const pending: Array<Readonly<{ message: Message; source: Core.Source<K> }>> = []
  let applying = false
  const listeners = new Set<() => void>()
  // Stopped first as the run ends, and awaited: nothing forks a fiber while the end reads those to interrupt.
  let effects: Fiber.Fiber<unknown, never> | undefined
  const stop = Effect.suspend(() => {
    stopped = true
    return effects === undefined ? Effect.void : stopping(effects)
  })
  // Added after the queue and the sets, so run before they close, as a scope runs its finalizers in the reverse order
  // they were added (`docs/premises.md`), as in `src/engine.ts`.
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
  // A function of the program, called in the thunk: what it throws is recorded where it happened, and the step stops
  // there. It is never thrown to whoever sent the message, whose fiber would take it for its own.
  const attempt = <A>(
    where: DefectSite,
    f: () => A,
    details?: () => Readonly<{ on?: unknown }>,
    wrapped?: (defect: unknown) => boolean
  ): Opt.Option<A> => {
    try {
      return Opt.some(f())
    } catch (thrown) {
      recordThrown(deaths, where, thrown, details, wrapped)
      return Opt.none()
    }
  }
  // The run's own logs belong to no function of the program: a `Logger` that throws dies in them.
  const log = (...message: ReadonlyArray<unknown>) => Effect.logDebug(...message).pipe(diesIn("log"))
  const call = <A>(where: DefectSite, f: () => A) => Effect.sync(f).pipe(diesIn(where))
  const described = (message: Message) => call("describeMessage", () => describeMessage(message))
  // Decided in the fiber of effects, as it writes them, so that `describeMessage` and `describeCommand` are called only
  // while debug logs are enabled there.
  const logsOf = (arrived: Core.Arrived<State, Command, unknown>, message: Message, source: Core.Source<K>) =>
    Effect.gen(function*() {
      if (!(yield* LogLevel.isEnabled("Debug"))) return
      switch (arrived._tag) {
        case "Dropped":
          if (source._tag === "Subscription") {
            yield* log("Dropped a message of a stopped subscription", source.key, yield* described(message))
          }
          return
        case "Dead":
          return
        case "Ignored":
          return yield* log("Ignored a rejected message", yield* described(message), { origin: source._tag })
        case "Applied":
          return yield* log("Message", yield* described(message), {
            revision: arrived.next.revision,
            commands: yield* call("describeCommand", () => arrived.commands.map(describeCommand))
          })
      }
    })
  const queue = (job: Job<Message, Command, R, K>) => {
    Queue.offerUnsafe(jobs, job)
  }
  // A listener that throws is a defect of the renderer's; the others are still told.
  const tell = () => {
    for (const listener of Array.from(listeners)) attempt("render", listener, undefined, rendered)
  }
  // The pure half of a step, in one synchronous thunk: the check of a death and of the message's start, `update`, the
  // option that hears it, the new state and its keys. Then its job, and the listeners, once the state is current.
  const applyOne = (message: Message, source: Core.Source<K>) => {
    const before = current
    const arrived = attempt(
      "update",
      () => Core.arrive(update, before, active, source, message, dead),
      () => ({ on: describeByTag(message) })
    )
    if (Opt.isNone(arrived)) return
    const step = arrived.value
    switch (step._tag) {
      case "Dead":
        return
      case "Dropped":
        return queue({ logs: Opt.some(logsOf(step, message, source)), gone: [], fresh: [], commands: [] })
      case "Ignored": {
        const ignored: Ignored<State, Message> = { message, origin: originOf(source), state: before.state }
        if (Opt.isNone(attempt("onIgnored", () => onIgnored(ignored)))) return
        return queue({ logs: Opt.some(logsOf(step, message, source)), gone: [], fresh: [], commands: [] })
      }
      case "Applied": {
        const { next, changed, commands } = step
        const applied: Applied<State, Message, Command> = {
          message,
          origin: originOf(source),
          before: before.state,
          after: next.state,
          revision: next.revision,
          commands
        }
        if (Opt.isNone(attempt("onApplied", () => onApplied(applied)))) return
        current = next
        if (!changed) return queue({ logs: Opt.some(logsOf(step, message, source)), gone: [], fresh: [], commands })
        // The keys are the program's, and so are their `Equal` and `Hash`: compared here, in `subscriptions`, and
        // nowhere else in the run.
        const reconciled = attempt("subscriptions", () => Core.reconcile(active, subscriptions(next.state)))
        if (Opt.isNone(reconciled)) return
        const { gone, fresh, active: keys } = reconciled.value
        active = keys
        queue({ logs: Opt.some(logsOf(step, message, source)), gone, fresh, commands })
        return tell()
      }
    }
  }
  const apply = (message: Message, source: Core.Source<K>) => {
    pending.push({ message, source })
    if (applying) return
    applying = true
    // Nothing here throws: what the program throws, `attempt` records. The one check of the end is here, before each
    // message, a message sent after the end included: what is left once it has stopped the engine is dropped.
    while (!stopped && pending.length > 0) {
      const next = pending.shift()
      if (next !== undefined) applyOne(next.message, next.source)
    }
    pending.length = 0
    applying = false
  }
  const sending = (source: Core.Source<K>) => (message: Message) => Effect.sync(() => apply(message, source))
  // The interpreter runs inside the command's fiber, so a defect in it is the command's. Its scope closes before its
  // message is applied, so that `update` never learns of a command whose resources are still open.
  const runCommand = (command: Command) =>
    Effect.suspend(() => interpret(command)).pipe(
      scopedIn(deaths, "command"),
      Effect.flatMap(Opt.match({ onNone: () => Effect.void, onSome: sending(Core.fromCommand) })),
      rootedIn("command"),
      Effect.provideContext(context),
      recorded,
      FiberSet.run(fibers)
    )
  // The stops of a job are awaited together, before any start of that job or a later one: a key that comes back finds
  // its old subscription released. The next message does not wait for them: the effects of the next state do.
  const perform = Effect.fnUntraced(function*({ logs, gone, fresh, commands }: Job<Message, Command, R, K>) {
    if (Opt.isSome(logs)) yield* logs.value
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
      const send = sending({ _tag: "Subscription", key, generation })
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
    yield* Effect.forEach(commands, runCommand, { discard: true })
  })
  // The keys of the first state, and its job, in the fiber that makes the engine, which records what it dies of here,
  // as `src/engine.ts` does: no message can be sent before the engine is made.
  yield* call("subscriptions", () => Core.reconcile(Core.noneActive, subscriptions(started.current.state))).pipe(
    Effect.flatMap(({ fresh, active: keys }) => {
      active = keys
      return perform({ logs: Opt.none(), gone: [], fresh, commands: started.commands })
    }),
    Effect.provideContext(context),
    recorded
  )
  // The fork and its assignment are one step nothing interrupts, as the loop's are in `src/engine.ts`. The fiber of
  // effects is interruptible all the same, as a fiber forked where nothing interrupts is (`docs/premises.md`).
  yield* Effect.gen(function*() {
    while (true) yield* perform(yield* Queue.take(jobs))
  }).pipe(
    Effect.provideContext(context),
    recorded,
    FiberSet.run(fibers),
    Effect.map((fiber) => {
      effects = fiber
    }),
    Effect.uninterruptible
  )
  return {
    current: () => current,
    subscribe: (listener) => {
      // A function of its own for each call, so that the same listener subscribed twice is stopped once each time.
      const entry = () => listener()
      listeners.add(entry)
      return () => {
        listeners.delete(entry)
      }
    },
    dispatch: (message) => apply(message, Core.fromDispatch),
    died,
    report,
    stop
  } satisfies Engine<State, Message>
})
