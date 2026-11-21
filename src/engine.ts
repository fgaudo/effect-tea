// The engine: a message is applied in the call that sends it. The pure half of a step, `update`, the option that
// hears it, the new state and the keys of that state, is one synchronous thunk, called by a dispatch, a command's
// answer and a subscription's message alike, from whatever fiber or callback sends it. What the step does of effects,
// its subscriptions stopped and started and its commands started, is a job for one fiber of effects, which takes the
// jobs in the order of the states. A step that does none of these makes no job. The engine is made by plain code
// (`build`), and its effects start once `effects` runs: until then a message is applied all the same, and its job
// waits.
import * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import type * as Fiber from "effect/Fiber"
import * as FiberMap from "effect/FiberMap"
import * as FiberSet from "effect/FiberSet"
import * as Opt from "effect/Option"
import * as Queue from "effect/Queue"
import type * as Scope from "effect/Scope"
import type { RunCommand } from "./command.ts"
import * as Core from "./core.ts"
import type { DefectSite } from "./defect.ts"
import { describeByTag } from "./log.ts"
import { type Deaths, makeDeaths, rootedIn, runSubscription, scopedIn, stopping, withExternalSpan } from "./shell.ts"
import type { Subscription, Subscriptions } from "./subscription.ts"
import type { Step, Update } from "./update.ts"

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
 * The options of a run: what hears each message.
 *
 * `start` and `drive` take them.
 *
 * @example
 * ```ts
 * start(program, {
 *   onApplied: ({ message }) => {
 *     session.push(message)
 *   }
 * })
 * ```
 *
 * @see The guide, "Running", "Options".
 */
export interface RunOptions<State, Message, Command = unknown> {
  /**
   * Hears each message `update` accepts.
   *
   * - It is a function, not an effect, and returns nothing. The types refuse one that returns a value.
   *   Declared apart, it needs the return type `undefined`: TypeScript gives it `void` otherwise, which they refuse.
   * - The run calls it in the step of each message, before the next one, before the listeners are told, and before the
   *   message's commands start. A slow one holds up the whole program, and the call that sent the message: offer what
   *   it hears to an unbounded queue, and do the slow work in a fiber raced with the run.
   * - A defect in it ends the run.
   * - From a defect on, the run applies no message. So it hears, at the latest, the step under way at the defect.
   *
   * @example
   * ```ts
   * const app = Effect.gen(function*() {
   *   const heard = yield* Queue.unbounded<Applied<State, Message, Command>>()
   *   const report = Queue.take(heard).pipe(Effect.flatMap(sendToDevtools), Effect.forever)
   *   const started = start(program, {
   *     onApplied: (applied) => {
   *       Queue.offerUnsafe(heard, applied)
   *     }
   *   })
   *   yield* Effect.raceFirst(started.run, report)
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
   * - The run calls it in the step of each message, before the next one. A slow one holds up the whole program, and
   *   the call that sent the message: offer what it hears to an unbounded queue, and do the slow work in a fiber raced
   *   with the run.
   * - A defect in it ends the run.
   *
   * @see The guide, "Running", "`onIgnored`".
   * @see The guide, "Running", "`onApplied` and `onIgnored` are functions, not effects".
   * @see The guide, "Running", "The run calls `onApplied` and `onIgnored` in order".
   * @see The guide, "Running", "Give slow work to a queue".
   */
  readonly onIgnored?: (ignored: Ignored<State, Message>) => undefined
}

const originOf = <K>(source: Core.Source<K>): Origin =>
  source._tag === "Subscription" ? { _tag: "Subscription", key: source.key } : source

/** What a step leaves to the fiber of effects, in the order it is done. */
type Job<Message, Command, R, K> = Readonly<{
  gone: ReadonlyArray<readonly [K, Core.Generation]>
  fresh: ReadonlyArray<readonly [K, Subscription<Message, R>, Core.Generation]>
  commands: ReadonlyArray<Command>
}>

/**
 * The engine applies each message as it is sent, and leaves the effects of its steps to a fiber that `effects` starts.
 * It is made by plain code, outside any fiber: `init`'s step, the first state and its keys. Until `effects` runs, a
 * message is applied all the same, and the jobs wait.
 */
export interface Engine<State, Message, R = never> {
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
  /**
   * Starts the effects in the scope it is run in: it does the jobs that waited, in the order of the states, then forks
   * the fiber of effects, which does the later ones. The scope's end stops the engine, interrupts its fibers and dies
   * of what they died of. Run once.
   */
  readonly effects: Effect.Effect<void, never, Exclude<R, Scope.Scope> | Scope.Scope>
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
 *
 * The defect is recorded before what `details` throws, which is then thrown: a message whose tag throws as it is read
 * again, to say what a defect was on, loses neither of the two.
 */
export const recordThrown = (
  deaths: Deaths,
  where: DefectSite,
  thrown: unknown,
  details: () => Readonly<{ key?: unknown; on?: unknown }> = () => ({}),
  wrapped: (defect: unknown) => boolean = () => false
): unknown => {
  let said: Readonly<{ key?: unknown; on?: unknown }>
  try {
    said = details()
  } catch (failed) {
    deaths.record(Core.wrapDefects(Cause.die(thrown), where, {}, wrapped))
    throw failed
  }
  const cause = Core.wrapDefects(Cause.die(thrown), where, said, wrapped)
  deaths.record(cause)
  const [reason] = cause.reasons
  return reason !== undefined && Cause.isDieReason(reason) ? reason.defect : thrown
}

type Config<State, Message, Command, R, K> =
  & Readonly<{
    /** Where the fibers of the run, and the thunk, record what they die of, shared with whoever runs the engine. */
    deaths: Deaths
    /**
     * The defects a listener may throw that are the renderer's already, recorded in `'render'` where they were thrown,
     * and taken as they are: those of a model, which `start` records where it is read. By default, none.
     */
    rendered?: (defect: unknown) => boolean
    /**
     * Called last as the outermost `apply` returns, once its jobs are offered and the register released: where a
     * testing tool wakes what waits on a new state, so that nothing it wakes runs inside a step. It throws nothing.
     */
    settled?: () => void
    init: Step<State, Command>
    update: Update<State, Message, Command>
    runCommand: RunCommand<Command, Message, R>
    subscriptions: Subscriptions<State, Message, R, K>
  }>
  & RunOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>>

/**
 * Makes the engine, with no fiber and no effect: what the thunk reads and writes, the keys of the first state, and
 * the first job, which waits with every later one until `effects` runs.
 */
export const build = <State, Message, Command, R, K>({
  deaths,
  rendered = () => false,
  settled = () => undefined,
  init: first,
  update,
  runCommand: interpret,
  subscriptions,
  onApplied = () => undefined,
  onIgnored = () => undefined
}: Config<State, Message, Command, R, K>): Engine<State, Message, R> => {
  const { recorded, died, report, dead } = deaths
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
  // The jobs not offered yet, in the order of the states, and the queue the fiber of effects takes them from, once
  // `effects` has made it. The thunk only adds to `waiting`: they are offered once, as the outermost `apply` returns.
  // Unbounded, and offered with a call that never waits: a bounded queue would refuse a job when full.
  let waiting: Array<Job<Message, Command, R, K>> = []
  let jobs: Queue.Queue<Job<Message, Command, R, K>> | undefined
  // Stopped first as the run ends, and awaited: nothing forks a fiber while the end reads those to interrupt.
  let effects: Fiber.Fiber<unknown, never> | undefined
  const stop = Effect.suspend(() => {
    stopped = true
    return effects === undefined ? Effect.void : stopping(effects)
  })
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
  // Decided from the step alone: a step that stops, starts and commands nothing leaves the fiber of effects nothing to
  // do, and costs no job.
  const queue = (job: Job<Message, Command, R, K>) => {
    if (job.gone.length > 0 || job.fresh.length > 0 || job.commands.length > 0) waiting.push(job)
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
      case "Dropped":
        return
      case "Ignored": {
        const ignored: Ignored<State, Message> = { message, origin: originOf(source), state: before.state }
        attempt("onIgnored", () => onIgnored(ignored))
        return
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
        if (!changed) return queue({ gone: [], fresh: [], commands })
        // The keys are the program's, and so are their `Equal` and `Hash`: compared here, in `subscriptions`, and
        // nowhere else in the run.
        const reconciled = attempt("subscriptions", () => Core.reconcile(active, subscriptions(next.state)))
        if (Opt.isNone(reconciled)) return
        const { gone, fresh, active: keys } = reconciled.value
        active = keys
        queue({ gone, fresh, commands })
        return tell()
      }
    }
  }
  // The jobs that wait go to the fiber of effects, once there is one.
  const offer = () => {
    if (jobs === undefined || waiting.length === 0) return
    const taken = waiting
    waiting = []
    Queue.offerAllUnsafe(jobs, taken)
  }
  const apply = (message: Message, source: Core.Source<K>) => {
    pending.push({ message, source })
    if (applying) return
    applying = true
    deaths.hold()
    try {
      // The one check of the end is here, before each message, a message sent after the end included: what is left
      // once it has stopped the engine is dropped.
      while (!stopped && pending.length > 0) {
        const next = pending.shift()
        if (next !== undefined) applyOne(next.message, next.source)
      }
    } catch (thrown) {
      // What the program throws, `attempt` records, so what reaches here was thrown outside it: by the engine's own
      // code, or by what it reads of a message to say what a defect was on. It is recorded as it is, with no site,
      // never thrown to whoever sent the message, and the run dies of it.
      deaths.record(Cause.die(thrown))
    } finally {
      pending.length = 0
      applying = false
      // What the outermost call owes as it returns, once every message sent during it is applied and every listener
      // told: one offer of its jobs, then the end, when a defect was recorded meanwhile. So neither the fiber of effects
      // nor the end begins inside a step, wherever a fiber that waits is resumed.
      offer()
      deaths.release()
      settled()
    }
  }
  const sending = (source: Core.Source<K>) => (message: Message) => Effect.sync(() => apply(message, source))
  // The keys of the first state, and its job, the first one done. A defect of `subscriptions` here is recorded as one in
  // a step: the engine applies nothing, and the run dies of it.
  const firstKeys = attempt("subscriptions", () => Core.reconcile(Core.noneActive, subscriptions(current.state)))
  if (Opt.isSome(firstKeys)) {
    active = firstKeys.value.active
    queue({ gone: [], fresh: firstKeys.value.fresh, commands: started.commands })
  }
  // Untraced: a span of its own would be the one its fibers log into (see `withExternalSpan`).
  const effectsIn = Effect.gen(function*() {
    // The run's context, its scope included: what a command or a subscription acquires goes into a scope of its own,
    // which `scopedIn` puts in front of this one.
    const context = withExternalSpan(yield* Effect.context<Exclude<R, Scope.Scope>>())
    const queued = yield* Effect.acquireRelease(Queue.unbounded<Job<Message, Command, R, K>>(), Queue.shutdown)
    // The fiber of effects and the commands.
    const fibers = yield* FiberSet.make<unknown, never>()
    // Kept by their start, never by their key: `FiberMap` compares its keys, in a fiber's observer too, where nothing
    // could tell the defect of a key's `Equal` that throws.
    const subscriptionFibers = yield* FiberMap.make<Core.Generation, void, never>()
    // Added after the queue and the sets, so run before they close, as a scope runs its finalizers in the reverse order
    // they were added (`docs/premises.md`): the end of the run stops the fiber of effects, interrupts its other fibers
    // itself, all at once, waits for them to release what they hold, and dies of what they have died of and nobody has
    // reported, which `diesIn` already says where.
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
    // The stops of a job are awaited together, before any start of that job or a later one: a key that comes back
    // finds its old subscription released. The next message does not wait for them: the effects of the next state do.
    const perform = Effect.fnUntraced(function*({ gone, fresh, commands }: Job<Message, Command, R, K>) {
      yield* Effect.forEach(
        gone,
        ([, generation]) =>
          FiberMap.get(subscriptionFibers, generation).pipe(
            Effect.flatMap(Opt.match({ onNone: () => Effect.void, onSome: stopping }))
          ),
        { concurrency: "unbounded", discard: true }
      )
      for (const [key, subscription, generation] of fresh) {
        const send = sending({ _tag: "Subscription", key, generation })
        yield* runSubscription(subscription, send).pipe(
          scopedIn(deaths, "subscription", () => ({ key })),
          Effect.flatMap(send),
          rootedIn("subscription", () => ({ key })),
          Effect.provideContext(context),
          recorded,
          FiberMap.run(subscriptionFibers, generation)
        )
      }
      yield* Effect.forEach(commands, runCommand, { discard: true })
    })
    // The jobs that waited, the first state's and those of the messages sent before, in the fiber that starts the
    // effects, which records what it dies of here, among what the subscriptions it starts die of meanwhile. A message
    // they send adds its job to those that wait, done in turn. So they start on the stack of whoever starts the
    // effects, until the first of them waits.
    const waited: Effect.Effect<void> = Effect.suspend(() => {
      if (waiting.length === 0) return Effect.void
      const taken = waiting
      waiting = []
      return Effect.forEach(taken, perform, { discard: true }).pipe(Effect.andThen(waited))
    })
    yield* waited.pipe(Effect.provideContext(context), recorded)
    // The queue, the fork and its assignment are one step nothing interrupts: interrupted between the fork and the
    // assignment, the fiber that starts the effects would close its scope with a fiber of effects `stop` does not know
    // of. The fiber of effects is interruptible all the same, as a fiber forked where nothing interrupts is
    // (`docs/premises.md`). A job that came after the last of those that waited is offered first.
    yield* Effect.suspend(() => {
      jobs = queued
      offer()
      return Effect.gen(function*() {
        while (true) yield* perform(yield* Queue.take(queued))
      }).pipe(
        Effect.provideContext(context),
        recorded,
        FiberSet.run(fibers),
        Effect.map((fiber) => {
          effects = fiber
        })
      )
    }).pipe(Effect.uninterruptible)
  })
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
    effects: effectsIn,
    died,
    report,
    stop
  }
}

/**
 * The engine as the tests of the engine make it, in a scope: built, and its effects started at once, with a register of
 * its own when none is given. Only the tests call it.
 */
export const make = <State, Message, Command, R, K>(
  config: Omit<Config<State, Message, Command, R, K>, "deaths"> & Readonly<{ deaths?: Deaths }>
): Effect.Effect<Engine<State, Message, R>, never, Exclude<R, Scope.Scope> | Scope.Scope> =>
  Effect.suspend(() => {
    const engine = build<State, Message, Command, R, K>({ ...config, deaths: config.deaths ?? makeDeaths(() => true) })
    return Effect.as(engine.effects, engine)
  })
