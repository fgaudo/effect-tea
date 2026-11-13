import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import { type DefectSite, ProgramDefect } from './defect.ts'

// The semantics shared by the run and the testing tools, as pure functions of data (`docs/shared-core.md`): the
// shells, `engine.ts` and `src/testing/`, decide when they run and perform what they return.

/** Whether a cause holds defects, and nothing else. */
export const diesOnly = (cause: Cause.Cause<unknown>) => Cause.hasDies(cause) && cause.reasons.every(Cause.isDieReason)

/**
 * The cause with what is not a defect turned into one, in the place of the first of them, so that the defects stay
 * in the order they happened: an interruption the fiber made itself (`Effect.interrupt`, or the join of an
 * interrupted fiber), since the fibers of a run ignore their interruptions, which would leave a command without its
 * answer, or a subscription ended in silence; or any other failure, which the types rule out (an empty cause, a
 * failure a cast let through), which would end the run with no defect to report. Beside the defects of the cause
 * too: a release that interrupts itself after its effect died is a second defect.
 */
export const otherwiseDefect = (cause: Cause.Cause<unknown>): Cause.Cause<never> => {
  const others = Cause.fromReasons(cause.reasons.filter((reason) => !Cause.isDieReason(reason)))
  const defect = Cause.die(
    new Error(
      Cause.hasInterruptsOnly(others)
        ? 'It interrupted itself, which only the run may do'
        : 'It failed, which its type rules out',
      { cause: others },
    ),
  ).reasons
  const first = cause.reasons.findIndex((reason) => !Cause.isDieReason(reason))
  return Cause.fromReasons<never>(
    first === -1 ? defect : cause.reasons.flatMap((reason, index) =>
      Cause.isDieReason(reason) ? [reason] : index === first ? defect : []
    ),
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
  wrapped: (defect: unknown) => boolean,
): Cause.Cause<E> =>
  Cause.fromReasons(cause.reasons.flatMap((reason): ReadonlyArray<Cause.Reason<E>> =>
    Cause.isDieReason(reason) && !wrapped(reason.defect)
      ? Cause.annotate(
        Cause.die(new ProgramDefect({ where, cause: reason.defect, ...details })),
        Cause.reasonAnnotations(reason),
      ).reasons
      : [reason]
  ))

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

/** Counts the starts of subscriptions: each start of a key gets a new one. */
export type Generation = number

/**
 * The keys a run listens to, each with its start, those starts, and the last start made: a subscription's message
 * applies exactly when its start is among them, which takes no comparison of keys.
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
export type Reconciled<K, S> = Readonly<{
  gone: ReadonlyArray<readonly [K, Generation]>
  fresh: ReadonlyArray<readonly [K, S, Generation]>
  active: Active<K>
}>

/**
 * Compares the keys `listed` with those `active`, by their `Equal` and `Hash`, which are the program's: whoever calls
 * it calls it where a defect of theirs dies in `subscriptions`, the only place where the keys are compared.
 */
export const reconcile = <K, S>(active: Active<K>, listed: HashMap.HashMap<K, S>): Reconciled<K, S> => {
  const gone = Arr.filter(Arr.fromIterable(active.keys), ([key]) => !HashMap.has(listed, key))
  const fresh: Array<readonly [K, S, Generation]> = []
  let keys = HashMap.empty<K, Generation>()
  let started = active.started
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
  return { gone, fresh, active: { keys, starts: new Set(HashMap.values(keys)), started } }
}
