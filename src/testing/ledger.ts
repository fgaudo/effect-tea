import * as Arr from 'effect/Array'
import * as Opt from 'effect/Option'
import type { Generation } from '../core.ts'

// What `rehearse` keeps of its commands and of the starts it hears, as pure transitions of data
// (`docs/shared-core.md`, step 5). Several fibers of the test's write it: the shell runs each transition in one
// synchronous thunk, so that a check of the ledger and the act it guards are one transition.

/** Counts the commands taken from `pending`, so that two runs of equal commands stay apart. */
export type Ticket = number

/** A message an opened start sent, and whether it was its last, its end value. */
export type Sent<M> = Readonly<{ message: M; last: boolean }>

/**
 * How the test hears a start: not yet, by playing it with `hear` (`Scripted`), or by running its subscription under
 * `hearNext` (`Opened`), never both, since the run hears one subscription per start. An opened start keeps the calls
 * of `hearNext` waiting on it, in order, the messages it sent that no call has heard yet, in order, how many
 * messages were asked for and not heard: a call that leaves while it waits leaves what it asked for to the next one,
 * so a message is asked for once, and heard by whichever call waits when it comes; and whether its last message has
 * been heard: it has ended, and sends nothing until its key goes away, which forgets it, and comes back.
 */
export type Hearing<S, H, W, M> =
  | Readonly<{ _tag: 'Unheard'; subscription: S }>
  | Readonly<{ _tag: 'Scripted' }>
  | Readonly<{
    _tag: 'Opened'
    handle: H
    waiting: ReadonlyArray<W>
    sent: ReadonlyArray<Sent<M>>
    asked: number
    ended: boolean
  }>

/**
 * The commands `update` started that have not run yet, oldest first, those taken that have not answered, and those
 * whose run was interrupted before they answered: commands cannot be cancelled, so in the run each of them would still
 * answer. How each start of a key is heard, by its generation. The calls of `hearNext` offered to the loop that it
 * has not made wait on a start yet: one that leaves before is no longer among them, and the loop makes it wait on
 * nothing. And every call of `hearNext` from its offer until it ends, whatever the loop has made of it: the end of
 * the rehearsal tells them all, those a step it interrupted had taken out of their start included.
 */
export type Ledger<Command, S, H, W, M> = Readonly<{
  pending: ReadonlyArray<Command>
  underWay: ReadonlyMap<Ticket, Command>
  cancelled: ReadonlyArray<Command>
  taken: Ticket
  hearings: ReadonlyMap<Generation, Hearing<S, H, W, M>>
  asking: ReadonlySet<W>
  calls: ReadonlySet<W>
}>

export const start = <Command, S, H, W, M>(commands: ReadonlyArray<Command>): Ledger<Command, S, H, W, M> => ({
  pending: commands,
  underWay: new Map(),
  cancelled: [],
  taken: 0,
  hearings: new Map(),
  asking: new Set(),
  calls: new Set(),
})

/** The ledger with the commands of a step applied after those pending. */
export const owe = <Command, S, H, W, M>(ledger: Ledger<Command, S, H, W, M>, commands: ReadonlyArray<Command>) =>
  commands.length === 0 ? ledger : { ...ledger, pending: [...ledger.pending, ...commands] }

export type Taken<Command> = Readonly<{ ticket: Ticket; command: Command }>

/**
 * Takes the oldest pending command `select` matches, under way from now on, or finds none: the one place where a
 * command leaves `pending`, so that two calls never take the same command, and a call that finds none finds it in the
 * same transition as the take it does not make.
 */
export const take = <Command, S, H, W, M>(
  ledger: Ledger<Command, S, H, W, M>,
  select: (command: Command) => boolean,
): Opt.Option<readonly [Taken<Command>, Ledger<Command, S, H, W, M>]> => {
  const index = ledger.pending.findIndex(select)
  if (index === -1) return Opt.none()
  const command = ledger.pending[index] as Command
  const ticket = ledger.taken + 1
  return Opt.some([{ ticket, command }, {
    ...ledger,
    pending: Arr.remove(ledger.pending, index),
    underWay: new Map([...ledger.underWay, [ticket, command]]),
    taken: ticket,
  }])
}

/** The ledger with the command taken under `ticket` among those whose run was interrupted before they answered. */
export const cancel = <Command, S, H, W, M>(
  ledger: Ledger<Command, S, H, W, M>,
  ticket: Ticket,
): Ledger<Command, S, H, W, M> => {
  const command = ledger.underWay.get(ticket)
  return command === undefined ? ledger : { ...ledger, cancelled: [...ledger.cancelled, command] }
}

/** The ledger with the command taken under `ticket` no longer under way: it answered, or its run ended otherwise. */
export const settle = <Command, S, H, W, M>(
  ledger: Ledger<Command, S, H, W, M>,
  ticket: Ticket,
): Ledger<Command, S, H, W, M> => {
  if (!ledger.underWay.has(ticket)) return ledger
  const underWay = new Map(ledger.underWay)
  underWay.delete(ticket)
  return { ...ledger, underWay }
}

type OpenedOf<S, H, W, M> = Extract<Hearing<S, H, W, M>, { _tag: 'Opened' }>

const withHearing = <Command, S, H, W, M>(
  ledger: Ledger<Command, S, H, W, M>,
  generation: Generation,
  hearing: Opt.Option<Hearing<S, H, W, M>>,
): Ledger<Command, S, H, W, M> => {
  const hearings = new Map(ledger.hearings)
  if (Opt.isSome(hearing)) hearings.set(generation, hearing.value)
  else hearings.delete(generation)
  return { ...ledger, hearings }
}

/**
 * What the keys of a new state make of the hearings: the starts that appeared are unheard, with the subscription
 * listed when their key appeared, and those whose key went away are forgotten, with what they sent. Returns the
 * handles of the opened ones that went away, to stop, and the calls that waited on them, to tell that they were
 * stopped.
 */
export const listened = <Command, S, H, W, M>(
  ledger: Ledger<Command, S, H, W, M>,
  gone: ReadonlyArray<Generation>,
  fresh: ReadonlyArray<readonly [Generation, S]>,
): readonly [ReadonlyArray<H>, ReadonlyArray<W>, Ledger<Command, S, H, W, M>] => {
  const hearings = new Map(ledger.hearings)
  const stopping: Array<H> = []
  const stopped: Array<W> = []
  for (const generation of gone) {
    const hearing = hearings.get(generation)
    if (hearing?._tag === 'Opened') {
      stopping.push(hearing.handle)
      stopped.push(...hearing.waiting)
    }
    hearings.delete(generation)
  }
  for (const [generation, subscription] of fresh) hearings.set(generation, { _tag: 'Unheard', subscription })
  return [stopping, stopped, { ...ledger, hearings }]
}

/**
 * What `hear` makes of the start `generation`: `Scripted`, with the ledger, unless `hearNext` runs it, and says so
 * (`Opened`), or has heard it end (`Ended`), until its key goes away and comes back.
 */
export const script = <Command, S, H, W, M>(
  ledger: Ledger<Command, S, H, W, M>,
  generation: Generation,
):
  | Readonly<{ _tag: 'Scripted'; ledger: Ledger<Command, S, H, W, M> }>
  | Readonly<{ _tag: 'Opened' }>
  | Readonly<{ _tag: 'Ended' }> =>
{
  const hearing = ledger.hearings.get(generation)
  if (hearing?._tag === 'Opened') return hearing.ended ? { _tag: 'Ended' } : { _tag: 'Opened' }
  return {
    _tag: 'Scripted',
    ledger: hearing?._tag === 'Scripted' ? ledger : withHearing(ledger, generation, Opt.some({ _tag: 'Scripted' })),
  }
}

/**
 * The ledger with `call`, a call of `hearNext` offered to the loop, among those it has not made wait yet, and among
 * its calls until it leaves.
 */
export const enter = <Command, S, H, W, M>(ledger: Ledger<Command, S, H, W, M>, call: W): Ledger<Command, S, H, W, M> => ({
  ...ledger,
  asking: new Set([...ledger.asking, call]),
  calls: new Set([...ledger.calls, call]),
})

/**
 * What the call `call` of `hearNext` makes of the start `generation`: nothing, when it has left (`Left`), so that a
 * call that left starts no subscription; else the subscription to run (`Open`), or the handle of the one it runs
 * (`Opened`), unless the test plays it with `hear` (`Scripted`), or `hearNext` has heard it end (`Ended`), until its
 * key goes away and comes back. `Gone` for a start the ledger does not hear, which an active key never is.
 */
export const opening = <Command, S, H, W, M>(
  ledger: Ledger<Command, S, H, W, M>,
  generation: Generation,
  call: W,
):
  | Readonly<{ _tag: 'Left' }>
  | Readonly<{ _tag: 'Open'; subscription: S }>
  | Readonly<{ _tag: 'Opened'; handle: H }>
  | Readonly<{ _tag: 'Scripted' }>
  | Readonly<{ _tag: 'Ended' }>
  | Readonly<{ _tag: 'Gone' }> =>
{
  if (!ledger.asking.has(call)) return { _tag: 'Left' }
  const hearing = ledger.hearings.get(generation)
  if (hearing === undefined) return { _tag: 'Gone' }
  switch (hearing._tag) {
    case 'Unheard':
      return { _tag: 'Open', subscription: hearing.subscription }
    case 'Scripted':
      return { _tag: 'Scripted' }
    case 'Opened':
      return hearing.ended ? { _tag: 'Ended' } : { _tag: 'Opened', handle: hearing.handle }
  }
}

/** The ledger with the start `generation` run by `hearNext` under `handle`, no call waiting on it yet. */
export const open = <Command, S, H, W, M>(ledger: Ledger<Command, S, H, W, M>, generation: Generation, handle: H) =>
  withHearing(ledger, generation, Opt.some({ _tag: 'Opened', handle, waiting: [], sent: [], asked: 0, ended: false }))

const updateOpened = <Command, S, H, W, M, A>(
  ledger: Ledger<Command, S, H, W, M>,
  generation: Generation,
  otherwise: A,
  f: (hearing: OpenedOf<S, H, W, M>) => readonly [A, Opt.Option<Hearing<S, H, W, M>>],
): readonly [A, Ledger<Command, S, H, W, M>] => {
  const hearing = ledger.hearings.get(generation)
  if (hearing?._tag !== 'Opened') return [otherwise, ledger]
  const [result, next] = f(hearing)
  return [result, withHearing(ledger, generation, next)]
}

/**
 * The call `call` of `hearNext` waits on the start `generation`, after the calls waiting already, and asks its
 * subscription for a message unless one asked for is not heard yet: whether it asks (`true`), and the ledger. A call
 * that has left waits on nothing, and asks for nothing.
 */
export const ask = <Command, S, H, W, M>(
  ledger: Ledger<Command, S, H, W, M>,
  generation: Generation,
  call: W,
): readonly [boolean, Ledger<Command, S, H, W, M>] => {
  if (!ledger.asking.has(call)) return [false, ledger]
  const asking = new Set(ledger.asking)
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
export const send = <Command, S, H, W, M>(ledger: Ledger<Command, S, H, W, M>, generation: Generation, sent: Sent<M>) =>
  updateOpened(ledger, generation, undefined, (hearing) => [
    undefined,
    Opt.some({ ...hearing, sent: [...hearing.sent, sent] }),
  ])[1]

/**
 * The first call waiting on the start `generation` hears the first message it sent, or nothing is heard, when either
 * is missing. When the message was its last, the start has ended: the calls still waiting are told so, and none
 * waits on it any more.
 */
export const hear = <Command, S, H, W, M>(
  ledger: Ledger<Command, S, H, W, M>,
  generation: Generation,
): Opt.Option<
  Readonly<{ call: W; sent: Sent<M>; ended: ReadonlyArray<W>; ledger: Ledger<Command, S, H, W, M> }>
> => {
  const hearing = ledger.hearings.get(generation)
  if (hearing?._tag !== 'Opened') return Opt.none()
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
        ended: hearing.ended || sent.last,
      }),
    ),
  })
}

/**
 * The call `call` of `hearNext` has ended, having heard a message or not: it is no longer offered, nor waiting on a
 * start, nor among the calls, and what it asked for is the next call's.
 */
export const leave = <Command, S, H, W, M>(
  ledger: Ledger<Command, S, H, W, M>,
  call: W,
): Ledger<Command, S, H, W, M> => {
  const asking = new Set(ledger.asking)
  asking.delete(call)
  const calls = new Set(ledger.calls)
  calls.delete(call)
  const hearings = new Map(ledger.hearings)
  for (const [generation, hearing] of hearings) {
    if (hearing._tag === 'Opened' && hearing.waiting.includes(call)) {
      hearings.set(generation, { ...hearing, waiting: hearing.waiting.filter((each) => each !== call) })
    }
  }
  return { ...ledger, asking, calls, hearings }
}
