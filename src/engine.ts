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
import { commandFiber, type Deaths, rootedIn, startFiber, stopping, withExternalSpan } from "./shell.ts"
import type { Listen, Subscriptions } from "./subscription.ts"
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
 * When `update` returns the very state it was given, `after` is `before`.
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
   * const main = Effect.gen(function*() {
   *   const heard = yield* Queue.unbounded<Applied<State, Message, Command>>()
   *   const report = Queue.take(heard).pipe(Effect.flatMap(sendToDevtools), Effect.forever)
   *   const { app, run } = start(program, {
   *     onApplied: (applied) => {
   *       Queue.offerUnsafe(heard, applied)
   *     }
   *   })
   *   drawInto(root, { app, view })
   *   yield* Effect.raceFirst(run, report)
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

/**
 * What a step leaves to the fiber of effects, in the order it is done. A job that only tells (`after`) has `done`, and
 * nothing else to do.
 */
type Job<Command, K> = Readonly<{
  gone: ReadonlyArray<readonly [K, Core.Generation]>
  fresh: ReadonlyArray<readonly [K, Core.Generation]>
  commands: ReadonlyArray<Command>
  done?: () => void
}>

/**
 * What the thunk tells a testing tool of a step, as it stands (`stepped`). `Arrived` for each message: dropped or dead
 * at once, ignored once `onIgnored` has heard it, applied once `onApplied` has heard it and its state is current; never
 * for one whose step a defect stopped before. `Listened` once the keys of a new state are the active ones, the first
 * state's as the engine is made, with the starts that went and those that came.
 */
export type Stepped<State, Command, K, Event = unknown> =
  | Readonly<{ _tag: "Arrived"; arrived: Core.Arrived<State, Command, Event> }>
  | Readonly<{
    _tag: "Listened"
    gone: ReadonlyArray<readonly [K, Core.Generation]>
    fresh: ReadonlyArray<readonly [K, Core.Generation]>
  }>

/**
 * The engine applies each message as it is sent, and leaves the effects of its steps to a fiber that `effects` starts.
 * It is made by plain code, outside any fiber: `init`'s step, the first state and its keys. Until `effects` runs, a
 * message is applied all the same, and the jobs wait.
 */
export interface Engine<State, Message, R = never, K = never> {
  /** The current state: the one the last message applied made, at once. */
  readonly current: () => State
  /**
   * Hears each new state, once it is the current one: never for a rejected message, nor for the very same state.
   * Returns what stops it, at once: a listener stopped during a notice is not told of it, and one added during a notice
   * is told from the next.
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
   * the fiber of effects, which does the later ones. The scope's end stops the engine, interrupts its fibers and waits
   * for them, whose defects are in the register. Run once.
   */
  readonly effects: Effect.Effect<void, never, Exclude<R, Scope.Scope> | Scope.Scope>
  /** Succeeds once a fiber of the run, or a function of the program called in the thunk, has recorded a defect. */
  readonly died: Effect.Effect<void>
  /**
   * Applies nothing sent from now on, then interrupts the fiber of effects and waits for it to end. The end of the run
   * does it first, before whoever runs the engine stops what sends to it.
   */
  readonly stop: Effect.Effect<void>
  // What a testing tool is given, and the run does not use.
  /** Applies a message at once, as `source` sends it, as `dispatch` applies one of a dispatch. */
  readonly send: (message: Message, source: Core.Source<K>) => void
  /** The keys of the current state, each with its start. */
  readonly active: () => Core.Active<K>
  /**
   * A job that only tells: the fiber of effects calls `done` once it has done every job before it. Asked in a step, it
   * comes after that step's job, and waits with it until the outermost call returns. `done` throws nothing.
   */
  readonly after: (done: () => void) => void
  /** Marks the end with no effect, as `stop` does first: from now on nothing sent is applied. */
  readonly end: () => void
  /** Whether the end is marked. */
  readonly ended: () => boolean
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

type Config<State, Message, Command, R, K, Event = unknown> =
  & Readonly<{
    /** Where the fibers of the run, and the thunk, record what they die of, shared with whoever runs the engine. */
    deaths: Deaths
  }>
  & Parts<State, Message, Command, R, K, Event>

type Parts<State, Message, Command, R, K, Event = unknown> =
  & Readonly<{
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
    update: Update<State, Message, Command, Event>
    subscriptions: Subscriptions<State, K>
  }>
  & Told<State, Command, K, Event>
  & Fibers<Message, Command, R, K>
  & RunOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>>

/** What a testing tool is told of the steps and the releases. The run is told nothing. */
export type Told<State, Command, K, Event = unknown> = Readonly<{
  /** Told in the thunk as each step stands, the first keys' as the engine is made (`Stepped`). It throws nothing. */
  stepped?: (step: Stepped<State, Command, K, Event>) => void
  /** Told by the fiber of effects once the stops of a job have ended, before its starts. It throws nothing. */
  released?: (gone: ReadonlyArray<readonly [K, Core.Generation]>) => void
}>

/**
 * What the fibers of a start and of a command run: the program's `listen` and `runCommand`, in the bodies of
 * `startFiber` and `commandFiber`, or a testing tool's own, never both, so that nothing given is left uncalled.
 */
export type Fibers<Message, Command, R, K> =
  | Readonly<{
    runCommand: RunCommand<Command, Message, R>
    listen: Listen<K, Message, R>
    listening?: never
    answering?: never
  }>
  | (ToolFibers<Message, Command, R, K> & Readonly<{ runCommand?: never; listen?: never }>)

type ToolFibers<Message, Command, R, K> = Readonly<{
  /**
   * What the fiber of a start runs, inside its root and in the run's context, given what sends a message as that
   * start: called by the job of its step, where the fiber is forked. A testing tool runs `startFiber` in it.
   */
  listening: (
    key: K,
    generation: Core.Generation,
    send: (message: Message) => Effect.Effect<void>
  ) => Effect.Effect<void, never, Exclude<R, Scope.Scope>>
  /**
   * What the fiber of a command runs, inside its root and in the run's context, given what sends its answer: called by
   * the job of its step, where the fiber is forked. A testing tool runs `commandFiber` in it.
   */
  answering: (
    command: Command,
    send: (message: Message) => Effect.Effect<void>
  ) => Effect.Effect<void, never, Exclude<R, Scope.Scope>>
}>

// What the fiber of a start and that of a command run, unless a testing tool gives its own: `listen` and the
// interpreter called inside the fiber, so that a defect in them is the subscription's, with its key, or the command's.
const fibersOf = <Message, Command, R, K>(
  deaths: Deaths,
  fibers: Fibers<Message, Command, R, K>
): ToolFibers<Message, Command, R, K> => {
  if (fibers.runCommand === undefined) return fibers
  const { runCommand, listen } = fibers
  return {
    listening: (key, _generation, send) => startFiber(deaths, key, () => listen(key), send, send),
    answering: (command, send) => commandFiber(deaths, Effect.suspend(() => runCommand(command)), send)
  }
}

/**
 * Makes the engine, with no fiber and no effect: what the thunk reads and writes, the keys of the first state, and
 * the first job, which waits with every later one until `effects` runs.
 */
export const build = <State, Message, Command, R, K, Event = unknown>(
  config: Config<State, Message, Command, R, K, Event>
): Engine<State, Message, R, K> => {
  const {
    deaths,
    rendered = () => false,
    settled = () => undefined,
    stepped = () => undefined,
    released = () => undefined,
    init: first,
    update,
    subscriptions,
    onApplied = () => undefined,
    onIgnored = () => undefined
  } = config
  const { recorded, died, dead } = deaths
  const { listening, answering } = fibersOf(deaths, config)
  // What the thunk reads and writes, on the caller's stack: no fiber runs between its operations.
  const started = Core.init(first)
  let current = started.state
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
  let waiting: Array<Job<Command, K>> = []
  let jobs: Queue.Queue<Job<Command, K>> | undefined
  // Stopped first as the run ends, and awaited: nothing forks a fiber while the end reads those to interrupt.
  let effects: Fiber.Fiber<unknown, never> | undefined
  const end = () => {
    stopped = true
  }
  const stop = Effect.suspend(() => {
    end()
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
  const queue = (job: Job<Command, K>) => {
    if (job.gone.length > 0 || job.fresh.length > 0 || job.commands.length > 0) waiting.push(job)
  }
  // A listener that throws is a defect of the renderer's; the others are still told. The copy keeps a listener added
  // during a notice for the next one, so one that subscribes on every notice cannot loop; the check skips one that an
  // earlier listener stopped, which may have torn down what it draws.
  const tell = () => {
    for (const listener of Array.from(listeners)) {
      if (listeners.has(listener)) attempt("render", listener, undefined, rendered)
    }
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
        return stepped({ _tag: "Arrived", arrived: step })
      case "Ignored": {
        const ignored: Ignored<State, Message> = { message, origin: originOf(source), state: before }
        if (Opt.isNone(attempt("onIgnored", () => onIgnored(ignored)))) return
        return stepped({ _tag: "Arrived", arrived: step })
      }
      case "Applied": {
        const { next, changed, commands } = step
        const applied: Applied<State, Message, Command> = {
          message,
          origin: originOf(source),
          before,
          after: next,
          commands
        }
        if (Opt.isNone(attempt("onApplied", () => onApplied(applied)))) return
        // The very same state is the current one already, and has the keys it had.
        if (!changed) {
          stepped({ _tag: "Arrived", arrived: step })
          return queue({ gone: [], fresh: [], commands })
        }
        // The keys are the program's, and so are their `Equal` and `Hash`: compared here, in `subscriptions`, and
        // nowhere else in the run.
        const reconciled = attempt("subscriptions", () => Core.reconcile(active, subscriptions(next)))
        // A state whose keys are a defect is never current, as one that `onApplied` died of: no listener is told of it.
        if (Opt.isNone(reconciled)) return
        const { gone, fresh, active: keys } = reconciled.value
        current = next
        active = keys
        stepped({ _tag: "Arrived", arrived: step })
        stepped({ _tag: "Listened", gone, fresh })
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
  const firstKeys = attempt("subscriptions", () => Core.reconcile(Core.noneActive, subscriptions(current)))
  if (Opt.isSome(firstKeys)) {
    active = firstKeys.value.active
    stepped({ _tag: "Listened", gone: [], fresh: firstKeys.value.fresh })
    queue({ gone: [], fresh: firstKeys.value.fresh, commands: started.commands })
  }
  // Untraced: a span of its own would be the one its fibers log into (see `withExternalSpan`).
  const effectsIn = Effect.gen(function*() {
    // The run's context, its scope included: what a command or a subscription acquires goes into a scope of its own,
    // which `scopedIn` puts in front of this one.
    const context = withExternalSpan(yield* Effect.context<Exclude<R, Scope.Scope>>())
    const queued = yield* Effect.acquireRelease(Queue.unbounded<Job<Command, K>>(), Queue.shutdown)
    // The fiber of effects and the commands.
    const fibers = yield* FiberSet.make<unknown, never>()
    // Kept by their start, never by their key: `FiberMap` compares its keys, in a fiber's observer too, where nothing
    // could tell the defect of a key's `Equal` that throws.
    const subscriptionFibers = yield* FiberMap.make<Core.Generation, void, never>()
    // Added after the queue and the sets, so run before they close, as a scope runs its finalizers in the reverse order
    // they were added (`Scope.close`): the end of the run stops the fiber of effects, interrupts its other fibers
    // itself, all at once, and waits for them to release what they hold. What they die of is in the register, which
    // whoever runs the engine reads once it has ended.
    yield* Effect.addFinalizer(() =>
      Effect.andThen(
        stop,
        Effect.suspend(() => {
          const running: ReadonlyArray<Fiber.Fiber<unknown, never>> = [
            ...fibers,
            ...Arr.map(Arr.fromIterable(subscriptionFibers), ([, fiber]) => fiber)
          ]
          return Effect.forEach(running, stopping, { concurrency: "unbounded", discard: true })
        })
      )
    )
    // What the fiber runs is asked for by the job, where the fiber is forked.
    const runCommand = (command: Command) =>
      answering(command, sending(Core.fromCommand)).pipe(
        rootedIn("command"),
        Effect.provideContext(context),
        recorded,
        FiberSet.run(fibers)
      )
    // The stops of a job are awaited together, before any start of that job or a later one: a key that comes back
    // finds its old subscription released. The next message does not wait for them: the effects of the next state do.
    const perform = Effect.fnUntraced(function*({ gone, fresh, commands, done }: Job<Command, K>) {
      yield* Effect.forEach(
        gone,
        ([, generation]) =>
          FiberMap.get(subscriptionFibers, generation).pipe(
            Effect.flatMap(Opt.match({ onNone: () => Effect.void, onSome: stopping }))
          ),
        { concurrency: "unbounded", discard: true }
      )
      if (gone.length > 0) released(gone)
      for (const [key, generation] of fresh) {
        yield* listening(key, generation, sending({ _tag: "Subscription", key, generation })).pipe(
          rootedIn("subscription", { key }),
          Effect.provideContext(context),
          recorded,
          FiberMap.run(subscriptionFibers, generation)
        )
      }
      yield* Effect.forEach(commands, runCommand, { discard: true })
      if (done !== undefined) done()
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
    // (`FiberSet.run`). A job that came after the last of those that waited is offered first.
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
    stop,
    send: apply,
    active: () => active,
    after: (done) => {
      waiting.push({ gone: [], fresh: [], commands: [], done })
      // In a step, the outermost call offers it as it returns, as it offers the jobs of its steps.
      if (!applying) offer()
    },
    end,
    ended: () => stopped
  }
}

/**
 * The engine as the tests of the engine make it, in a scope: built, and its effects started at once. Only the tests
 * call it, and read the register they give it once the scope has closed, as the run does.
 */
export const make = <State, Message, Command, R, K>(
  config: Config<State, Message, Command, R, K>
): Effect.Effect<Engine<State, Message, R, K>, never, Exclude<R, Scope.Scope> | Scope.Scope> =>
  Effect.suspend(() => {
    const engine = build<State, Message, Command, R, K>(config)
    return Effect.as(engine.effects, engine)
  })
