import * as Arr from "effect/Array"
import * as Opt from "effect/Option"
import type { Generation } from "../core.ts"

// What `rehearse` keeps of its commands and of the starts it hears, as pure transitions of data
// (`docs/records/shared-core.md`, step 5). Several fibers of the test's write it, and the engine's thunk and its fiber of
// effects: the shell runs each transition in one synchronous thunk, so that a check of the ledger and the act it guards
// are one transition.

/** Counts the commands taken from `pending`, so that two runs of equal commands stay apart. */
export type Ticket = number

/** A command a step decided, with the handle of the fiber the engine started for it, which waits for a `run`. */
export type Owed<Command, P> = Readonly<{ command: Command; handle: P }>

/** A message an opened start sent, and whether it was its last, its end value. */
export type Sent<M> = Readonly<{ message: M; last: boolean }>

/**
 * How the test hears a start: not yet, by playing it with `hear` (`Scripted`), or by running its subscription under
 * `hearNext` (`Opened`), never both, since the run hears one subscription per start. An unheard or opened start keeps
 * what was made for it as its key appeared, `start`. An opened start keeps the calls of `hearNext` waiting on it, in
 * order, the messages it sent that no call has heard yet, in order, how many messages were asked for and not heard: a
 * call that leaves while it waits leaves what it asked for to the next one, so a message is asked for once, and heard
 * by whichever call waits when it comes; and whether its last message has been heard: it has ended, and sends nothing
 * until its key goes away, which forgets it, and comes back.
 */
export type Hearing<S, W, M> =
  | Readonly<{ _tag: "Unheard"; start: S }>
  | Readonly<{ _tag: "Scripted" }>
  | Readonly<{
    _tag: "Opened"
    start: S
    waiting: ReadonlyArray<W>
    sent: ReadonlyArray<Sent<M>>
    asked: number
    ended: boolean
  }>

/**
 * The commands `update` started whose fiber waits for a `run`, oldest first, with the handle of that fiber; those taken
 * that have not answered, by their ticket; and those whose run was interrupted before they answered, with the handle of
 * their fiber, no longer under way, so that their answer is applied by nobody: commands cannot be cancelled, so in the
 * run each of them would still answer. How each start of a key is heard, by its generation; the starts whose fiber the
 * engine has not begun yet, each with what was made for it as its key appeared, kept apart from its hearing, which is
 * forgotten as its key goes, though its fiber still begins; and the calls that waited on a start whose key went away,
 * to tell once its fiber has released what it held. The calls of `hearNext` whose job has not made
 * them wait on a start yet, each with the start it looked up: one that leaves before is no longer among them, and its
 * job makes it wait on nothing. And every call of `hearNext` from the thunk that looks its key up until it ends,
 * whatever its job has made of it: the end of the rehearsal tells them all, those a step it interrupted took out of
 * their start included.
 */
export type Ledger<Command, P, S, W, M> = Readonly<{
  pending: ReadonlyArray<Owed<Command, P>>
  underWay: ReadonlyMap<Ticket, Owed<Command, P>>
  cancelled: ReadonlyArray<Owed<Command, P>>
  taken: Ticket
  hearings: ReadonlyMap<Generation, Hearing<S, W, M>>
  starting: ReadonlyMap<Generation, S>
  stopped: ReadonlyMap<Generation, ReadonlyArray<W>>
  asking: ReadonlyMap<W, Generation>
  calls: ReadonlySet<W>
}>

export const start = <Command, P, S, W, M>(): Ledger<Command, P, S, W, M> => ({
  pending: [],
  underWay: new Map(),
  cancelled: [],
  taken: 0,
  hearings: new Map(),
  starting: new Map(),
  stopped: new Map(),
  asking: new Map(),
  calls: new Set()
})

/** The ledger with commands whose fiber the engine has started, after those pending. */
export const owe = <Command, P, S, W, M>(
  ledger: Ledger<Command, P, S, W, M>,
  owed: ReadonlyArray<Owed<Command, P>>
): Ledger<Command, P, S, W, M> => owed.length === 0 ? ledger : { ...ledger, pending: [...ledger.pending, ...owed] }

/** The commands pending, oldest first, without their handles. */
export const pendingOf = <Command, P, S, W, M>(ledger: Ledger<Command, P, S, W, M>): ReadonlyArray<Command> =>
  ledger.pending.map(({ command }) => command)

export type Taken<Command, P> = Readonly<{ ticket: Ticket; command: Command; handle: P }>

/**
 * Takes the oldest pending command `select` matches, under way from now on, with the handle of its fiber, or finds none:
 * the one place where a command leaves `pending`, so that two calls never take the same command, and a call that finds
 * none finds it in the same transition as the take it does not make.
 */
export const take = <Command, P, S, W, M>(
  ledger: Ledger<Command, P, S, W, M>,
  select: (command: Command) => boolean
): Opt.Option<readonly [Taken<Command, P>, Ledger<Command, P, S, W, M>]> => {
  const index = ledger.pending.findIndex(({ command }) => select(command))
  if (index === -1) return Opt.none()
  const owed = ledger.pending[index] as Owed<Command, P>
  const ticket = ledger.taken + 1
  return Opt.some([{ ticket, command: owed.command, handle: owed.handle }, {
    ...ledger,
    pending: Arr.remove(ledger.pending, index),
    underWay: new Map([...ledger.underWay, [ticket, owed]]),
    taken: ticket
  }])
}

/**
 * The ledger with the command taken under `ticket`, while it is under way, among those whose run was interrupted before
 * they answered, and no longer under way: an answer that comes after is applied by nobody (`settle`).
 */
export const cancel = <Command, P, S, W, M>(
  ledger: Ledger<Command, P, S, W, M>,
  ticket: Ticket
): Ledger<Command, P, S, W, M> => {
  const owed = ledger.underWay.get(ticket)
  if (owed === undefined) return ledger
  const underWay = new Map(ledger.underWay)
  underWay.delete(ticket)
  return { ...ledger, underWay, cancelled: [...ledger.cancelled, owed] }
}

/**
 * The ledger with the command taken under `ticket` no longer under way, or nothing where it was not: it had answered,
 * or its run was interrupted before it answered. An answer is applied only with the ledger this gives, so that the
 * answer and the cancel of one command exclude each other.
 */
export const settle = <Command, P, S, W, M>(
  ledger: Ledger<Command, P, S, W, M>,
  ticket: Ticket
): Opt.Option<Ledger<Command, P, S, W, M>> => {
  if (!ledger.underWay.has(ticket)) return Opt.none()
  const underWay = new Map(ledger.underWay)
  underWay.delete(ticket)
  return Opt.some({ ...ledger, underWay })
}

type OpenedOf<S, W, M> = Extract<Hearing<S, W, M>, { _tag: "Opened" }>

const withHearing = <Command, P, S, W, M>(
  ledger: Ledger<Command, P, S, W, M>,
  generation: Generation,
  hearing: Opt.Option<Hearing<S, W, M>>
): Ledger<Command, P, S, W, M> => {
  const hearings = new Map(ledger.hearings)
  if (Opt.isSome(hearing)) hearings.set(generation, hearing.value)
  else hearings.delete(generation)
  return { ...ledger, hearings }
}

/**
 * What the keys of a new state make of the hearings: the starts that appeared are unheard, and starting, each with what
 * was made for it; those whose key went away are forgotten, with what they sent, and the calls that waited on an opened
 * one wait for its release, to be told that it was stopped. A start that went away before its fiber began is still
 * starting: the engine begins its fiber all the same, then stops it.
 */
export const listened = <Command, P, S, W, M>(
  ledger: Ledger<Command, P, S, W, M>,
  gone: ReadonlyArray<Generation>,
  fresh: ReadonlyArray<readonly [Generation, S]>
): Ledger<Command, P, S, W, M> => {
  const hearings = new Map(ledger.hearings)
  const stopped = new Map(ledger.stopped)
  for (const generation of gone) {
    const hearing = hearings.get(generation)
    if (hearing?._tag === "Opened") stopped.set(generation, hearing.waiting)
    hearings.delete(generation)
  }
  const starting = new Map(ledger.starting)
  for (const [generation, start] of fresh) {
    hearings.set(generation, { _tag: "Unheard", start })
    starting.set(generation, start)
  }
  return { ...ledger, hearings, starting, stopped }
}

/** The start `generation`, whose fiber the engine begins, is no longer starting: what was made for it, and the ledger. */
export const begin = <Command, P, S, W, M>(
  ledger: Ledger<Command, P, S, W, M>,
  generation: Generation
): readonly [Opt.Option<S>, Ledger<Command, P, S, W, M>] => {
  const start = ledger.starting.get(generation)
  if (start === undefined) return [Opt.none(), ledger]
  const starting = new Map(ledger.starting)
  starting.delete(generation)
  return [Opt.some(start), { ...ledger, starting }]
}

/**
 * The starts `gone` have released what they held: the calls to tell that they were stopped, those that waited on them as
 * their key went away and those whose job found their key gone, and the ledger with none of them among those waiting.
 */
export const release = <Command, P, S, W, M>(
  ledger: Ledger<Command, P, S, W, M>,
  gone: ReadonlyArray<Generation>
): readonly [ReadonlyArray<W>, Ledger<Command, P, S, W, M>] => {
  const ended = new Set(gone)
  const stopped = new Map(ledger.stopped)
  const told: Array<W> = []
  for (const generation of gone) {
    told.push(...(stopped.get(generation) ?? []))
    stopped.delete(generation)
  }
  const asking = new Map(ledger.asking)
  for (const [call, generation] of ledger.asking) {
    if (!ended.has(generation)) continue
    told.push(call)
    asking.delete(call)
  }
  return [told, { ...ledger, stopped, asking }]
}

/**
 * What `hear` makes of the start `generation`: `Scripted`, with the ledger, unless `hearNext` runs it, and says so
 * (`Opened`), or has heard it end (`Ended`), until its key goes away and comes back.
 */
export const script = <Command, P, S, W, M>(
  ledger: Ledger<Command, P, S, W, M>,
  generation: Generation
):
  | Readonly<{ _tag: "Scripted"; ledger: Ledger<Command, P, S, W, M> }>
  | Readonly<{ _tag: "Opened" }>
  | Readonly<{ _tag: "Ended" }> =>
{
  const hearing = ledger.hearings.get(generation)
  if (hearing?._tag === "Opened") return hearing.ended ? { _tag: "Ended" } : { _tag: "Opened" }
  return {
    _tag: "Scripted",
    ledger: hearing?._tag === "Scripted" ? ledger : withHearing(ledger, generation, Opt.some({ _tag: "Scripted" }))
  }
}

/**
 * The ledger with `call`, a call of `hearNext` that found its key under the start `generation`, among those its job
 * has not made wait yet, and among its calls until it leaves.
 */
export const enter = <Command, P, S, W, M>(
  ledger: Ledger<Command, P, S, W, M>,
  call: W,
  generation: Generation
): Ledger<Command, P, S, W, M> => ({
  ...ledger,
  asking: new Map([...ledger.asking, [call, generation]]),
  calls: new Set([...ledger.calls, call])
})

/**
 * What the call `call` of `hearNext` makes of the start `generation`: nothing, when it has left (`Left`), so that a
 * call that left starts no subscription; else the start to open (`Open`), or the one opened (`Opened`), unless the test
 * plays it with `hear` (`Scripted`), or `hearNext` has heard it end (`Ended`), until its key goes away and comes back.
 * `Gone` for a start the ledger does not hear, whose key went away after the call.
 */
export const opening = <Command, P, S, W, M>(
  ledger: Ledger<Command, P, S, W, M>,
  generation: Generation,
  call: W
):
  | Readonly<{ _tag: "Left" }>
  | Readonly<{ _tag: "Open"; start: S }>
  | Readonly<{ _tag: "Opened"; start: S }>
  | Readonly<{ _tag: "Scripted" }>
  | Readonly<{ _tag: "Ended" }>
  | Readonly<{ _tag: "Gone" }> =>
{
  if (!ledger.asking.has(call)) return { _tag: "Left" }
  const hearing = ledger.hearings.get(generation)
  if (hearing === undefined) return { _tag: "Gone" }
  switch (hearing._tag) {
    case "Unheard":
      return { _tag: "Open", start: hearing.start }
    case "Scripted":
      return { _tag: "Scripted" }
    case "Opened":
      return hearing.ended ? { _tag: "Ended" } : { _tag: "Opened", start: hearing.start }
  }
}

/** The ledger with the unheard start `generation` run by `hearNext`, no call waiting on it yet. */
export const open = <Command, P, S, W, M>(ledger: Ledger<Command, P, S, W, M>, generation: Generation) => {
  const hearing = ledger.hearings.get(generation)
  return hearing?._tag === "Unheard"
    ? withHearing(
      ledger,
      generation,
      Opt.some({ _tag: "Opened", start: hearing.start, waiting: [], sent: [], asked: 0, ended: false })
    )
    : ledger
}

const updateOpened = <Command, P, S, W, M, A>(
  ledger: Ledger<Command, P, S, W, M>,
  generation: Generation,
  otherwise: A,
  f: (hearing: OpenedOf<S, W, M>) => readonly [A, Opt.Option<Hearing<S, W, M>>]
): readonly [A, Ledger<Command, P, S, W, M>] => {
  const hearing = ledger.hearings.get(generation)
  if (hearing?._tag !== "Opened") return [otherwise, ledger]
  const [result, next] = f(hearing)
  return [result, withHearing(ledger, generation, next)]
}

/**
 * The call `call` of `hearNext` waits on the start `generation`, after the calls waiting already, and asks its
 * subscription for a message unless one asked for is not heard yet: whether it asks (`true`), and the ledger. A call
 * that has left waits on nothing, and asks for nothing.
 */
export const ask = <Command, P, S, W, M>(
  ledger: Ledger<Command, P, S, W, M>,
  generation: Generation,
  call: W
): readonly [boolean, Ledger<Command, P, S, W, M>] => {
  if (!ledger.asking.has(call)) return [false, ledger]
  const asking = new Map(ledger.asking)
  asking.delete(call)
  const [asks, next] = updateOpened(ledger, generation, false, (hearing) => {
    const waiting = [...hearing.waiting, call]
    return hearing.asked >= waiting.length
      ? [false, Opt.some({ ...hearing, waiting })]
      : [true, Opt.some({ ...hearing, waiting, asked: hearing.asked + 1 })]
  })
  return [asks, { ...next, asking }]
}

/**
 * The ledger with a message the start `generation` sent after the others it sent, to be heard by the next call that
 * waits on it; a start no longer opened, its key gone, hears nothing more, as in the run.
 */
export const send = <Command, P, S, W, M>(
  ledger: Ledger<Command, P, S, W, M>,
  generation: Generation,
  sent: Sent<M>
) =>
  updateOpened(ledger, generation, undefined, (hearing) => [
    undefined,
    Opt.some({ ...hearing, sent: [...hearing.sent, sent] })
  ])[1]

/**
 * The first call waiting on the start `generation` hears the first message it sent, or nothing is heard, when either
 * is missing. When the message was its last, the start has ended: the calls still waiting are told so, and none
 * waits on it any more.
 */
export const hear = <Command, P, S, W, M>(
  ledger: Ledger<Command, P, S, W, M>,
  generation: Generation
): Opt.Option<
  Readonly<{ call: W; sent: Sent<M>; ended: ReadonlyArray<W>; ledger: Ledger<Command, P, S, W, M> }>
> => {
  const hearing = ledger.hearings.get(generation)
  if (hearing?._tag !== "Opened") return Opt.none()
  const [call, ...waiting] = hearing.waiting
  const [sent, ...rest] = hearing.sent
  if (call === undefined || sent === undefined) return Opt.none()
  return Opt.some({
    call,
    sent,
    ended: sent.last ? waiting : [],
    ledger: withHearing(
      ledger,
      generation,
      Opt.some({
        ...hearing,
        waiting: sent.last ? [] : waiting,
        sent: rest,
        asked: hearing.asked - 1,
        ended: hearing.ended || sent.last
      })
    )
  })
}

/**
 * The call `call` of `hearNext` has ended, having heard a message or not: it is no longer asking, nor waiting on a
 * start, nor among the calls, and what it asked for is the next call's.
 */
export const leave = <Command, P, S, W, M>(
  ledger: Ledger<Command, P, S, W, M>,
  call: W
): Ledger<Command, P, S, W, M> => {
  const asking = new Map(ledger.asking)
  asking.delete(call)
  const calls = new Set(ledger.calls)
  calls.delete(call)
  const hearings = new Map(ledger.hearings)
  for (const [generation, hearing] of hearings) {
    if (hearing._tag === "Opened" && hearing.waiting.includes(call)) {
      hearings.set(generation, { ...hearing, waiting: hearing.waiting.filter((each) => each !== call) })
    }
  }
  return { ...ledger, asking, calls, hearings }
}
