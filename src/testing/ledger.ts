import * as Arr from 'effect/Array'
import * as Opt from 'effect/Option'
import type { Active, Generation } from '../core.ts'

// What `rehearse` keeps of its commands and of the starts it hears, as pure transitions of data
// (`docs/shared-core.md`, step 5). Several fibers of the test's write it: the shell runs each transition in one
// synchronous thunk, so that a check of the ledger and the act it guards are one transition.

/** Counts the commands taken from `pending`, so that two runs of equal commands stay apart. */
export type Ticket = number

/**
 * How the test hears a start: not yet, by playing it with `hear` (`Scripted`), or by running its subscription under
 * `hearNext` (`Opened`), never both, since the run hears one subscription per start. `waiting` counts the calls
 * waiting for a message, `asked` the messages asked for and not heard yet: a call interrupted while it waits leaves
 * what it asked for to the next one. An opened start whose key went away (`gone`) is kept while calls wait on it,
 * since the last message it sent may still be heard, and those calls told that it has ended.
 */
export type Hearing<S, H> =
  | Readonly<{ _tag: 'Unheard'; subscription: S }>
  | Readonly<{ _tag: 'Scripted' }>
  | Readonly<{ _tag: 'Opened'; handle: H; waiting: number; asked: number; gone: boolean }>

/**
 * The commands `update` started that have not run yet, oldest first, those taken that have not answered, and those
 * whose run was interrupted before they answered: commands cannot be cancelled, so in the run each of them would still
 * answer. And how each start of a key is heard, by its generation.
 */
export type Ledger<Command, S, H> = Readonly<{
  pending: ReadonlyArray<Command>
  underWay: ReadonlyMap<Ticket, Command>
  cancelled: ReadonlyArray<Command>
  taken: Ticket
  hearings: ReadonlyMap<Generation, Hearing<S, H>>
}>

export const start = <Command, S, H>(commands: ReadonlyArray<Command>): Ledger<Command, S, H> => ({
  pending: commands,
  underWay: new Map(),
  cancelled: [],
  taken: 0,
  hearings: new Map(),
})

/** The ledger with the commands of a step applied after those pending. */
export const owe = <Command, S, H>(ledger: Ledger<Command, S, H>, commands: ReadonlyArray<Command>) =>
  commands.length === 0 ? ledger : { ...ledger, pending: [...ledger.pending, ...commands] }

export type Taken<Command> = Readonly<{ ticket: Ticket; command: Command }>

/**
 * Takes the oldest pending command `select` matches, under way from now on, or finds none: the one place where a
 * command leaves `pending`, so that two calls never take the same command, and a call that finds none finds it in the
 * same transition as the take it does not make.
 */
export const take = <Command, S, H>(
  ledger: Ledger<Command, S, H>,
  select: (command: Command) => boolean,
): Opt.Option<readonly [Taken<Command>, Ledger<Command, S, H>]> => {
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
export const cancel = <Command, S, H>(ledger: Ledger<Command, S, H>, ticket: Ticket): Ledger<Command, S, H> => {
  const command = ledger.underWay.get(ticket)
  return command === undefined ? ledger : { ...ledger, cancelled: [...ledger.cancelled, command] }
}

/** The ledger with the command taken under `ticket` no longer under way: it answered, or its run ended otherwise. */
export const settle = <Command, S, H>(ledger: Ledger<Command, S, H>, ticket: Ticket): Ledger<Command, S, H> => {
  if (!ledger.underWay.has(ticket)) return ledger
  const underWay = new Map(ledger.underWay)
  underWay.delete(ticket)
  return { ...ledger, underWay }
}

const withHearing = <Command, S, H>(
  ledger: Ledger<Command, S, H>,
  generation: Generation,
  hearing: Opt.Option<Hearing<S, H>>,
): Ledger<Command, S, H> => {
  const hearings = new Map(ledger.hearings)
  if (Opt.isSome(hearing)) hearings.set(generation, hearing.value)
  else hearings.delete(generation)
  return { ...ledger, hearings }
}

/**
 * What the keys of a new state make of the hearings: the starts that appeared are unheard, with the subscription
 * listed when their key appeared, and those whose key went away are forgotten, but for an opened one that calls wait
 * on. Returns the handles of the opened ones that went away, to stop.
 */
export const listened = <Command, S, H>(
  ledger: Ledger<Command, S, H>,
  gone: ReadonlyArray<Generation>,
  fresh: ReadonlyArray<readonly [Generation, S]>,
): readonly [ReadonlyArray<H>, Ledger<Command, S, H>] => {
  const hearings = new Map(ledger.hearings)
  const stopping: Array<H> = []
  for (const generation of gone) {
    const hearing = hearings.get(generation)
    if (hearing?._tag === 'Opened') {
      stopping.push(hearing.handle)
      if (hearing.waiting > 0) {
        hearings.set(generation, { ...hearing, gone: true })
        continue
      }
    }
    hearings.delete(generation)
  }
  for (const [generation, subscription] of fresh) hearings.set(generation, { _tag: 'Unheard', subscription })
  return [stopping, { ...ledger, hearings }]
}

/** The handles of the opened starts whose key stays, to stop as the rehearsal ends. */
export const opened = <Command, S, H>(ledger: Ledger<Command, S, H>): ReadonlyArray<H> =>
  Arr.flatMap(
    Arr.fromIterable(ledger.hearings.values()),
    (hearing) => hearing._tag === 'Opened' && !hearing.gone ? [hearing.handle] : [],
  )

/**
 * What `hear` makes of the start `generation`: `Scripted`, with the ledger, unless `hearNext` runs it, and says so
 * (`Opened`), or has heard it end (`Ended`), until its key goes away and comes back.
 */
export const script = <Command, S, H, K>(
  ledger: Ledger<Command, S, H>,
  active: Active<K>,
  generation: Generation,
):
  | Readonly<{ _tag: 'Scripted'; ledger: Ledger<Command, S, H> }>
  | Readonly<{ _tag: 'Opened' }>
  | Readonly<{ _tag: 'Ended' }> =>
{
  const hearing = ledger.hearings.get(generation)
  if (hearing?._tag === 'Opened') return active.ended.has(generation) ? { _tag: 'Ended' } : { _tag: 'Opened' }
  return {
    _tag: 'Scripted',
    ledger: hearing?._tag === 'Scripted' ? ledger : withHearing(ledger, generation, Opt.some({ _tag: 'Scripted' })),
  }
}

/**
 * What `hearNext` makes of the start `generation`: the subscription to run (`Open`), or the handle of the one it runs
 * (`Opened`), unless the test plays it with `hear` (`Scripted`), or `hearNext` has heard it end (`Ended`), until its
 * key goes away and comes back. `Gone` for a start the ledger does not hear, which an active key never is.
 */
export const opening = <Command, S, H, K>(
  ledger: Ledger<Command, S, H>,
  active: Active<K>,
  generation: Generation,
):
  | Readonly<{ _tag: 'Open'; subscription: S }>
  | Readonly<{ _tag: 'Opened'; handle: H }>
  | Readonly<{ _tag: 'Scripted' }>
  | Readonly<{ _tag: 'Ended' }>
  | Readonly<{ _tag: 'Gone' }> =>
{
  const hearing = ledger.hearings.get(generation)
  if (hearing === undefined) return { _tag: 'Gone' }
  switch (hearing._tag) {
    case 'Unheard':
      return { _tag: 'Open', subscription: hearing.subscription }
    case 'Scripted':
      return { _tag: 'Scripted' }
    case 'Opened':
      return active.ended.has(generation) ? { _tag: 'Ended' } : { _tag: 'Opened', handle: hearing.handle }
  }
}

/** The ledger with the start `generation` run by `hearNext` under `handle`, no call waiting on it yet. */
export const open = <Command, S, H>(ledger: Ledger<Command, S, H>, generation: Generation, handle: H) =>
  withHearing(ledger, generation, Opt.some({ _tag: 'Opened', handle, waiting: 0, asked: 0, gone: false }))

const updateOpened = <Command, S, H, A>(
  ledger: Ledger<Command, S, H>,
  generation: Generation,
  otherwise: A,
  f: (hearing: Extract<Hearing<S, H>, { _tag: 'Opened' }>) => readonly [A, Opt.Option<Hearing<S, H>>],
): readonly [A, Ledger<Command, S, H>] => {
  const hearing = ledger.hearings.get(generation)
  if (hearing?._tag !== 'Opened') return [otherwise, ledger]
  const [result, next] = f(hearing)
  return [result, withHearing(ledger, generation, next)]
}

/**
 * A call of `hearNext` waits on the start `generation`, and asks its subscription for a message unless one asked for
 * is not heard yet: whether it asks (`true`), and the ledger.
 */
export const ask = <Command, S, H>(ledger: Ledger<Command, S, H>, generation: Generation) =>
  updateOpened(ledger, generation, false, (hearing) => {
    const waiting = hearing.waiting + 1
    return hearing.asked >= waiting
      ? [false, Opt.some({ ...hearing, waiting })]
      : [true, Opt.some({ ...hearing, waiting, asked: hearing.asked + 1 })]
  })

/**
 * A call of `hearNext` no longer waits on the start `generation`, having heard a message or not: a start whose key
 * went away is forgotten once no call waits on it.
 */
export const leave = <Command, S, H>(ledger: Ledger<Command, S, H>, generation: Generation) =>
  updateOpened(ledger, generation, undefined, (hearing) => {
    const waiting = hearing.waiting - 1
    return [undefined, hearing.gone && waiting === 0 ? Opt.none() : Opt.some({ ...hearing, waiting })]
  })[1]

/**
 * A call of `hearNext` that has left heard a message of the start `generation`, asked for by it or by a call before:
 * how many calls still wait on it, to tell that it has ended when the message was its last (none otherwise), and the
 * ledger.
 */
export const heard = <Command, S, H>(ledger: Ledger<Command, S, H>, generation: Generation, last: boolean) =>
  updateOpened(ledger, generation, 0, (hearing) => [
    last ? hearing.waiting : 0,
    Opt.some({ ...hearing, asked: hearing.asked - 1 }),
  ])
