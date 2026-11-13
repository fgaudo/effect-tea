import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
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
