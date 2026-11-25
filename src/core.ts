import * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Exit from "effect/Exit"
import * as HashMap from "effect/HashMap"
import * as Opt from "effect/Option"
import { type DefectSite, programDefect } from "./defect.ts"
import { reject, type Step, type Update } from "./update.ts"

// The semantics shared by the run and the testing tools, as pure functions of data (`docs/records/shared-core.md`): the
// shells, `engine.ts` and `src/testing/`, decide when they run and perform what they return.

/**
 * The mark of an interruption the run makes (`Shell.stopping`), one for each, among the annotations of its reason. A
 * fiber id tells no interruption of the run's from one the program makes: `FiberMap`, `FiberSet` and `FiberHandle`
 * interrupt as the fiber -1, and a fiber of the program learns the id of the fiber that stops it from the interruption
 * it receives (`Cause.interruptors`), and can interrupt another fiber as that id, then join it. The program cannot
 * make the mark: the key is the library's, and so is each value, made anew for each stop.
 */
export class Stopped extends Context.Service<Stopped, object>()("@fgaudo/effect-tea/Stopped") {}

const markOf = (reason: Cause.Reason<unknown>): object | undefined =>
  Context.getOrUndefined(Cause.reasonAnnotations(reason), Stopped)

/**
 * The interruptions of `received` that the run made, told by its mark: all that a fiber the run forks may receive.
 * Only the run stops such a fiber, so an interruption without the mark is one the program made, by whatever fiber.
 */
export const byTheRun = (received: Cause.Cause<never>): Cause.Cause<never> =>
  Cause.fromReasons(
    received.reasons.filter((reason) => Cause.isInterruptReason(reason) && markOf(reason) !== undefined)
  )

/**
 * The cause with what is not a defect turned into one, in the place of the first of them, so that the defects stay
 * in the order they happened: an interruption the fiber made itself (`Effect.interrupt`, or the join of an
 * interrupted fiber), since the fibers of a run ignore their interruptions, which would leave a command without its
 * answer, or a subscription ended in silence; or any other failure, which the types rule out (an empty cause, a
 * failure a cast let through), which would end the run with no defect to report. Beside the defects of the cause
 * too: a release that interrupts itself after its effect died is a second defect.
 *
 * `received` holds the interruptions the fiber received from outside, by the run or by whoever runs it: those of
 * the cause made by the same fiber, with the same mark of the run's (`Stopped`) or with none, are kept as they are,
 * beside the defect, and are no defect themselves. A cause with nothing else is returned as it is.
 */
export const otherwiseDefect = (
  cause: Cause.Cause<unknown>,
  received: Cause.Cause<never> = Cause.empty
): Cause.Cause<never> => {
  const interrupters = received.reasons.flatMap((reason) =>
    Cause.isInterruptReason(reason) ? [{ fiberId: reason.fiberId, mark: markOf(reason) }] : []
  )
  const own = (reason: Cause.Reason<unknown>) =>
    !Cause.isDieReason(reason)
    && !(Cause.isInterruptReason(reason)
      && interrupters.some(({ fiberId, mark }) => fiberId === reason.fiberId && mark === markOf(reason)))
  const others = Cause.fromReasons(cause.reasons.filter(own))
  if (others.reasons.length === 0 && cause.reasons.length > 0) return cause as Cause.Cause<never>
  const defect = Cause.die(
    new Error(
      Cause.hasInterruptsOnly(others)
        ? "It was interrupted by the program, which only the run may do"
        : "It failed, which its type rules out",
      { cause: others }
    )
  ).reasons
  const first = cause.reasons.findIndex(own)
  return Cause.fromReasons<never>(
    first === -1 ?
      defect :
      cause.reasons.flatMap((reason, index) =>
        !own(reason) ? [reason as Cause.Reason<never>] : index === first ? defect : []
      )
  )
}

/**
 * The cause with each of its defects that `wrapped` does not accept wrapped in a `ProgramDefect` that says where,
 * keeping its annotations (its stack and span), and the rest kept as it is: `Effect.catchDefect` would keep only the
 * first defect.
 */
export const wrapDefects = <E>(
  cause: Cause.Cause<E>,
  where: DefectSite,
  details: Readonly<{ key?: unknown; on?: unknown }>,
  wrapped: (defect: unknown) => boolean
): Cause.Cause<E> =>
  Cause.fromReasons(
    cause.reasons.flatMap((reason): ReadonlyArray<Cause.Reason<E>> =>
      Cause.isDieReason(reason) && !wrapped(reason.defect)
        ? Cause.annotate(
          Cause.die(programDefect({ where, cause: reason.defect, ...details })),
          Cause.reasonAnnotations(reason)
        ).reasons
        : [reason]
    )
  )

/**
 * The register of what the fibers of a run, or of a rehearsal, died of: each defect kept once, by its identity, in
 * the order the fibers died, since a fiber that joins one that died dies of the same defect; and how many of them
 * have been reported.
 */
export type Register = Readonly<{ deaths: ReadonlyArray<Cause.Die>; reported: number }>

export const noDeaths: Register = { deaths: [], reported: 0 }

const holds = (deaths: ReadonlyArray<Cause.Die>, defect: unknown) => deaths.some((death) => death.defect === defect)

/** Whether `defect` is in the register, by its identity, never by `Equal`. */
export const hasDied = (register: Register, defect: unknown) => holds(register.deaths, defect)

/** The register with the defects of `cause` that `keeps` accepts and it does not hold yet; the same when none is. */
export const record = (register: Register, cause: Cause.Cause<unknown>, keeps: (defect: unknown) => boolean) => {
  const deaths = [...register.deaths]
  for (const reason of cause.reasons) {
    if (Cause.isDieReason(reason) && keeps(reason.defect) && !holds(deaths, reason.defect)) deaths.push(reason)
  }
  return deaths.length === register.deaths.length ? register : { ...register, deaths }
}

/** The defects recorded since the last report, in the order they died, and the register with them reported. */
export const report = (register: Register): readonly [Opt.Option<Cause.Cause<never>>, Register] => {
  const dies = register.deaths.slice(register.reported)
  return Arr.isArrayNonEmpty(dies)
    ? [Opt.some(Cause.fromReasons<never>(dies)), { ...register, reported: register.deaths.length }]
    : [Opt.none(), register]
}

/**
 * `deaths` first, in their order, then the rest of `cause`, but for the defects already among them, by their identity,
 * never by `Equal`, which is the program's and which `Cause.combine` compares reasons with.
 */
export const diesFirst = <E>(deaths: ReadonlyArray<Cause.Die>, cause: Cause.Cause<E>): Cause.Cause<E> =>
  Cause.fromReasons<E>([
    ...deaths,
    ...cause.reasons.filter((reason) => !(Cause.isDieReason(reason) && holds(deaths, reason.defect)))
  ])

/**
 * What a run, or a testing tool, ends with: `exit` as it is when nothing died, else what its fibers died of first
 * (`diesFirst`), then the rest of what it ended with, whose result is dropped.
 */
export const endedWith = <A, E>(deaths: ReadonlyArray<Cause.Die>, exit: Exit.Exit<A, E>): Exit.Exit<A, E> =>
  deaths.length === 0 ? exit : Exit.failCause(diesFirst(deaths, Exit.isFailure(exit) ? exit.cause : Cause.empty))

/**
 * What a fiber with a scope of its own ends with: `own`, what its effect ended with, then what the release of its
 * scope died of, but for what is already in `own`, a defect by its identity and an interruption by its fiber and its
 * mark, never by `Equal`: two distinct defects equal by `Equal` stay two, and a release given the effect's cause may
 * die with it.
 */
export const released = <E>(own: Cause.Cause<E>, release: Cause.Cause<never>): Cause.Cause<E> =>
  Cause.fromReasons<E>([
    ...own.reasons,
    ...release.reasons.filter((reason) => !own.reasons.some((kept) => sameReason(kept, reason)))
  ])

const sameReason = (one: Cause.Reason<unknown>, other: Cause.Reason<unknown>) =>
  one === other
  || (Cause.isDieReason(one) && Cause.isDieReason(other) && one.defect === other.defect)
  || (Cause.isInterruptReason(one) && Cause.isInterruptReason(other) && one.fiberId === other.fiberId
    && markOf(one) === markOf(other))

/** Counts the starts of subscriptions: each start of a key gets a new one. */
export type Generation = number

/**
 * The keys a run listens to, each with its start, those starts, and the last start made: a subscription's message
 * applies exactly when its start is among them, which takes no comparison of keys. An ended start keeps its key among
 * the active ones: its subscription does not start again until its key goes away and comes back. Nothing here marks
 * an end, since the run starts nothing on one; `rehearse`'s ledger marks the starts it hears end.
 */
export type Active<K> = Readonly<{
  keys: HashMap.HashMap<K, Generation>
  starts: ReadonlySet<Generation>
  started: Generation
}>

export const noneActive: Active<never> = { keys: HashMap.empty(), starts: new Set(), started: 0 }

/**
 * What the keys of a new state make of those active before: the starts whose key went away, the keys that appeared,
 * each with its subscription and a new start, in the order the listing gives them, and the keys now active. A key
 * listed again keeps its start, so its subscription keeps running, ended or not: one that has ended does not start
 * again until its key goes away and comes back.
 */
export type Reconciled<K> = Readonly<{
  gone: ReadonlyArray<readonly [K, Generation]>
  fresh: ReadonlyArray<readonly [K, Generation]>
  active: Active<K>
}>

/**
 * Compares the keys `listed` with those `active`, by their `Equal` and `Hash`, which are the program's: whoever calls
 * it calls it where a defect of theirs dies in `subscriptions`, the only place where the keys are compared. The same
 * keys leave `active` the very same, and a key that stays is kept as the listing that started it gave it.
 */
export const reconcile = <K>(active: Active<K>, listed: ReadonlyArray<K>): Reconciled<K> => {
  // The starts of the active keys that are listed, and the listed keys that are not active, which may hold a key twice.
  // A key listed twice is listed once: where every active key is listed and no other is, nothing changed, however often
  // each is listed, and nothing is made.
  const kept = new Set<Generation>()
  const appeared: Array<K> = []
  for (const key of listed) {
    const found = HashMap.get(active.keys, key)
    if (Opt.isSome(found)) kept.add(found.value)
    else appeared.push(key)
  }
  if (appeared.length === 0 && kept.size === HashMap.size(active.keys)) return { gone: [], fresh: [], active }
  const gone = Arr.filter(Arr.fromIterable(active.keys), ([, generation]) => !kept.has(generation))
  const fresh: Array<readonly [K, Generation]> = []
  let started = active.started
  const keys = HashMap.mutate(active.keys, (keys) => {
    for (const [key] of gone) HashMap.remove(keys, key)
    for (const key of appeared) {
      if (HashMap.has(keys, key)) continue
      started += 1
      HashMap.set(keys, key, started)
      fresh.push([key, started])
    }
  })
  return { gone, fresh, active: { keys, starts: new Set(HashMap.values(keys)), started } }
}

/** Counts the states a run produces: every message that changes the state creates a new revision. */
export type Revision = number

export type Revisioned<State> = Readonly<{ state: State; revision: Revision }>

/** Where a message comes from: a dispatch, a command, or a subscription, with its key and the start it comes from. */
export type Source<K> =
  | Readonly<{ _tag: "Dispatch" }>
  | Readonly<{ _tag: "Command" }>
  | Readonly<{ _tag: "Subscription"; key: K; generation: Generation }>

export const fromDispatch: Source<never> = { _tag: "Dispatch" }

export const fromCommand: Source<never> = { _tag: "Command" }

/** What a program starts from: its first state, at the first revision, and the commands of its first step. */
export type Started<State, Command> = Readonly<{ current: Revisioned<State>; commands: ReadonlyArray<Command> }>

/**
 * The start of a program, from its first step, which is data: whoever makes the step from the flags (`startOf`)
 * does it where a defect of `init` dies in `init`. Its subscriptions start before its commands, as those of every
 * step do.
 */
export const init = <State, Command>(step: Step<State, Command>): Started<State, Command> => ({
  current: { state: step.state, revision: 0 },
  commands: step.commands ?? []
})

/**
 * What a message makes of the current state: `Dropped` when its start is no longer active (a subscription's message
 * left after its key went away, or came back with a new start), `Dead` once the run has died, `Ignored` when `update`
 * rejects it, `Applied` otherwise, with a new revision only when the state changes.
 */
export type Arrived<State, Command, Event> =
  | Readonly<{ _tag: "Dropped" }>
  | Readonly<{ _tag: "Dead" }>
  | Readonly<{ _tag: "Ignored" }>
  | Readonly<{
    _tag: "Applied"
    next: Revisioned<State>
    changed: boolean
    commands: ReadonlyArray<Command>
    events: ReadonlyArray<Event>
  }>

const dropped: Arrived<never, never, never> = { _tag: "Dropped" }

const dead: Arrived<never, never, never> = { _tag: "Dead" }

const ignored: Arrived<never, never, never> = { _tag: "Ignored" }

/**
 * Applies `message` to the current state, calling `update` unless `died` says the run has died or its start is gone.
 * A run that died applies no message, though its loop may take more until whoever runs it stops the loop, which may
 * run before the fiber that stops it. This is the only check of a death, and whoever calls it calls it in one
 * synchronous thunk, since the scheduler may yield at any other operation: no other fiber can die between the check and
 * the call, and a defect of `update` dies in `update`. The register is read first, so that a message taken once the
 * run has died is dead, whatever its start.
 */
export const arrive = <State, Message, Command, Event, K>(
  update: Update<State, Message, Command, Event>,
  current: Revisioned<State>,
  active: Active<K>,
  source: Source<K>,
  message: Message,
  died: () => boolean
): Arrived<State, Command, Event> => {
  if (died()) return dead
  if (source._tag === "Subscription" && !active.starts.has(source.generation)) return dropped
  const result = update(message)(current.state)
  if (result === reject) return ignored
  // `Object.is`, since a state may be NaN.
  const changed = !Object.is(result.state, current.state)
  return {
    _tag: "Applied",
    next: changed ? { state: result.state, revision: current.revision + 1 } : current,
    changed,
    commands: result.commands ?? [],
    events: result.events ?? []
  }
}
