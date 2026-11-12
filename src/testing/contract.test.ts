import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Equal from 'effect/Equal'
import * as Exit from 'effect/Exit'
import * as Hash from 'effect/Hash'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import { parent } from '../compose.ts'
import { CompositionDefect, ProgramDefect } from '../defect.ts'
import type { Applied, Ignored } from '../engine.ts'
import type { Program } from '../program.ts'
import { reject, type Update } from '../update.ts'
import { applyAll } from './apply-all.ts'
import { drive } from './drive.ts'
import { rehearse } from './rehearse.ts'
import { simulate } from './simulate.ts'

// The same program and the same inputs, given to each testing tool and to the run (through `drive`): where the
// engine is deterministic, they must end in the same place.

// A draft saved by `Store`, whose answer waits for `answer`; while it saves, a subscription ticks once.
type Draft = Readonly<{ text: string; isSaving: boolean; saved: ReadonlyArray<string>; ticks: number }>
type Edit =
  | Readonly<{ _tag: 'Typed'; text: string }>
  | Readonly<{ _tag: 'Save' }>
  | Readonly<{ _tag: 'Cancel' }>
  | Readonly<{ _tag: 'Stored'; text: string }>
  | Readonly<{ _tag: 'Tick' }>
type Store = Readonly<{ _tag: 'Store'; text: string }>

const edit: Update<Draft, Edit, Store> = (message) => (draft) => {
  switch (message._tag) {
    case 'Typed':
      return draft.isSaving ? reject : { state: { ...draft, text: message.text } }
    case 'Save':
      return draft.isSaving || draft.text === ''
        ? reject
        : { state: { ...draft, isSaving: true }, commands: [{ _tag: 'Store', text: draft.text }] }
    case 'Cancel':
      return draft.isSaving ? { state: { ...draft, isSaving: false } } : reject
    case 'Stored':
      return draft.isSaving ? { state: { ...draft, isSaving: false, saved: [...draft.saved, message.text] } } : reject
    case 'Tick':
      return draft.isSaving ? { state: { ...draft, ticks: draft.ticks + 1 } } : reject
  }
}

type DraftModel = Readonly<{
  draft: Draft
  type: (text: string) => Opt.Option<Edit>
  save: Opt.Option<Edit>
  cancel: Opt.Option<Edit>
}>

const empty: Draft = { text: '', isSaving: false, saved: [], ticks: 0 }

const draftProgram = (
  answer: Effect.Effect<void>,
  ticking: boolean,
): Program<{ state: Draft; model: DraftModel; message: Edit; command: Store }> => ({
  init: { state: empty },
  update: edit,
  runCommand: ({ text }) => Effect.as(answer, Opt.some<Edit>({ _tag: 'Stored', text })),
  subscriptions: (draft) =>
    ticking && draft.isSaving
      ? HashMap.make([
        'ticks',
        Channel.succeed<Edit>({ _tag: 'Tick' }).pipe(Channel.concatWith(() => Channel.never)),
      ])
      : HashMap.empty(),
  makeModel: (draft) => ({
    draft,
    type: (text) => draft.isSaving ? Opt.none() : Opt.some({ _tag: 'Typed', text }),
    save: draft.isSaving || draft.text === '' ? Opt.none() : Opt.some({ _tag: 'Save' }),
    cancel: draft.isSaving ? Opt.some({ _tag: 'Cancel' }) : Opt.none(),
  }),
})

const idle = ({ draft }: DraftModel) => draft.isSaving ? Opt.none() : Opt.some(draft)

/** Runs `scenario` with `drive`, and returns what `onApplied` and `onIgnored` heard. */
const recorded = Effect.fnUntraced(function*<A>(
  program: ReturnType<typeof draftProgram>,
  scenario: Parameters<typeof drive<Draft, DraftModel, Edit, Store, never, A>>[1],
) {
  const applied: Array<Applied<Draft, Edit, Store>> = []
  const ignored: Array<Ignored<Draft, Edit>> = []
  const result = yield* drive(program, scenario, {
    onApplied: (heard) => Effect.sync(() => void applied.push(heard)),
    onIgnored: (heard) => Effect.sync(() => void ignored.push(heard)),
  })
  return { result, applied, ignored }
})

describe('the testing tools and the run, on the same program and inputs', () => {
  test('a session the run records with onApplied plays again with applyAll, step by step', async () => {
    const { applied } = await Effect.runPromise(recorded(draftProgram(Effect.void, true), (driver) =>
      Effect.gen(function*() {
        yield* driver.send(({ type }) => type('a'))
        yield* driver.send(({ save }) => save)
        yield* driver.waitFor(({ draft }) => draft.saved.length === 1 ? Opt.some(draft) : Opt.none())
      })))
    const replayed = applied.map((_, index) =>
      applyAll(edit)(applied.slice(0, index + 1).map(({ message }) => message), empty)
    )
    expect(replayed.map(({ state }) => state)).toEqual(applied.map(({ after }) => after))
    expect(replayed.at(-1)?.commands).toEqual(applied.flatMap(({ commands }) => commands))
  })

  test('simulate ends where the run ends, when every command answers at once and nothing ticks', async () => {
    const program = draftProgram(Effect.void, false)
    // Each message, with what shows that the run has applied it, its command's answer included.
    const steps: ReadonlyArray<readonly [Edit, (draft: Draft) => boolean]> = [
      [{ _tag: 'Typed', text: 'a' }, (draft) => draft.text === 'a'],
      [{ _tag: 'Save' }, (draft) => draft.saved.length === 1 && !draft.isSaving],
      [{ _tag: 'Typed', text: 'b' }, (draft) => draft.text === 'b'],
      [{ _tag: 'Save' }, (draft) => draft.saved.length === 2 && !draft.isSaving],
    ]
    const simulation = await Effect.runPromise(simulate(program)(steps.map(([message]) => message), program.init))
    const { result, applied } = await Effect.runPromise(recorded(program, Effect.fnUntraced(function*(driver) {
      let last = empty
      for (const [message, done] of steps) {
        yield* driver.send(() => Opt.some(message))
        last = yield* driver.waitFor(({ draft }) => done(draft) ? Opt.some(draft) : Opt.none())
      }
      return last
    })))
    expect(result).toEqual(simulation.state)
    expect(applied.map(({ message }) => message)).toEqual([...simulation.messages])
    expect(applied.flatMap(({ commands }) => commands)).toEqual([...simulation.commands])
    expect(simulation.ignored).toEqual([])
  })

  test('rehearse and the run apply and ignore the same messages, a late answer and a tick included', async () => {
    const program = draftProgram(Effect.void, true)
    const rehearsed = await Effect.runPromise(rehearse(program, (rehearsal) =>
      Effect.gen(function*() {
        yield* rehearsal.send(({ type }) => type('a'))
        yield* rehearsal.send(({ save }) => save)
        yield* rehearsal.hearNext('ticks')
        yield* rehearsal.send(({ cancel }) => cancel)
        yield* rehearsal.run(() => true)
        return { state: yield* rehearsal.state, ignored: yield* rehearsal.ignored }
      })))
    const answer = await Effect.runPromise(Deferred.make<void>())
    const { result, ignored } = await Effect.runPromise(
      recorded(draftProgram(Deferred.await(answer), true), (driver) =>
        Effect.gen(function*() {
          yield* driver.send(({ type }) => type('a'))
          yield* driver.send(({ save }) => save)
          yield* driver.waitFor(({ draft }) => draft.ticks === 1 ? Opt.some(draft) : Opt.none())
          yield* driver.send(({ cancel }) => cancel)
          const cancelled = yield* driver.waitFor(idle)
          yield* Deferred.succeed(answer, undefined)
          // The late answer is ignored, so no frame shows it: give it the time to arrive.
          yield* Effect.sleep('50 millis')
          return cancelled
        })),
    )
    expect(result).toEqual(rehearsed.state)
    expect(ignored.map(({ message }) => message)).toEqual([...rehearsed.ignored])
  })
})

describe('the order of the answers of commands started together', () => {
  // `Go` starts `A` and `B`; `A`'s answer starts `C`. Every command answers at once, and `update` writes down the
  // order in which the answers arrive.
  type Order = Readonly<{ heard: ReadonlyArray<string> }>
  type Answer = Readonly<{ _tag: 'Go' }> | Readonly<{ _tag: 'Answered'; by: string }>
  const ordered: Program<{ state: Order; model: Order; message: Answer; command: string }> = {
    init: { state: { heard: [] } },
    update: (message) => ({ heard }) =>
      message._tag === 'Go'
        ? { state: { heard }, commands: ['A', 'B'] }
        : { state: { heard: [...heard, message.by] }, commands: message.by === 'A' ? ['C'] : [] },
    runCommand: (command) => Effect.succeedSome<Answer>({ _tag: 'Answered', by: command }),
    makeModel: (order) => order,
  }

  const inTheRun = () =>
    Effect.runPromise(drive(ordered, (driver) =>
      Effect.gen(function*() {
        yield* driver.send(() => Opt.some({ _tag: 'Go' }))
        return yield* driver.waitFor(({ heard }) => heard.length === 3 ? Opt.some(heard) : Opt.none())
      })))

  test('in the run, a command that answers at once is heard after the commands started with it', async () => {
    expect(await inTheRun()).toEqual(['A', 'B', 'C'])
  })

  test('rehearse, running the oldest pending command first, hears them as the run does', async () => {
    const heard = await Effect.runPromise(rehearse(ordered, (rehearsal) =>
      Effect.gen(function*() {
        yield* rehearsal.send(() => Opt.some({ _tag: 'Go' }))
        yield* rehearsal.runAll
        return (yield* rehearsal.state).heard
      })))
    expect(heard).toEqual(await inTheRun())
  })

  test('simulate, running the oldest started command first, hears them as the run does', async () => {
    const simulation = await Effect.runPromise(simulate(ordered)([{ _tag: 'Go' }], ordered.init))
    expect(simulation.state.heard).toEqual(await inTheRun())
  })
})

describe('a subscription that sends A, then ends with B', () => {
  // Listens under `k` while `listening`; `Stop` and `Listen` make the key go away and come back.
  type Log = Readonly<{ heard: ReadonlyArray<string>; listening: boolean }>
  type Said = 'A' | 'B' | 'Stop' | 'Listen'
  const said: Program<{ state: Log; model: Log; message: Said }> = {
    init: { state: { heard: [], listening: true } },
    update: (message) => (log) =>
      message === 'Stop' || message === 'Listen'
        ? { state: { ...log, listening: message === 'Listen' } }
        : { state: { ...log, heard: [...log.heard, message] } },
    subscriptions: ({ listening }) =>
      listening
        ? HashMap.make(['k', Channel.succeed<Said>('A').pipe(Channel.concatWith(() => Channel.end<Said>('B')))])
        : HashMap.empty(),
    makeModel: (log) => log,
  }

  test('in the run, it is heard once to its end, under a key that stays, and again once its key comes back', async () => {
    const heard = await Effect.runPromise(drive(said, Effect.fnUntraced(function*(driver) {
      yield* driver.waitFor(({ heard }) => heard.length === 2 ? Opt.some(heard) : Opt.none())
      // Long enough for a subscription that started again to be heard.
      yield* Effect.sleep('50 millis')
      yield* driver.send(() => Opt.some('Stop'))
      yield* driver.send(() => Opt.some('Listen'))
      return yield* driver.waitFor(({ heard }) => heard.length >= 4 ? Opt.some(heard) : Opt.none())
    })))
    expect(heard).toEqual(['A', 'B', 'A', 'B'])
  })

  test('rehearse\'s hearNext hears it as the run does, and nothing more until its key comes back', async () => {
    const { heard, failures } = await Effect.runPromise(rehearse(said, Effect.fnUntraced(function*(rehearsal) {
      yield* rehearsal.hearNext('k')
      yield* rehearsal.hearNext('k')
      const failures = yield* Effect.forEach(
        [rehearsal.hearNext('k'), rehearsal.hear('k', 'A')],
        (after) => Effect.map(Effect.exit(after), (exit) => Exit.isFailure(exit) ? String(Cause.squash(exit.cause)) : ''),
      )
      yield* rehearsal.send(() => Opt.some('Stop'))
      yield* rehearsal.send(() => Opt.some('Listen'))
      yield* rehearsal.hearNext('k')
      yield* rehearsal.hearNext('k')
      return { heard: (yield* rehearsal.state).heard, failures }
    })))
    expect(heard).toEqual(['A', 'B', 'A', 'B'])
    expect(failures).toEqual([
      expect.stringContaining('The subscription under k has ended'),
      expect.stringContaining('The subscription under k has ended'),
    ])
  })
})

describe('how a stopped subscription ends', () => {
  // Listening under `ticks` until the first `Tick`, which makes the key go away; the subscription tells `ended` how
  // it ended, as a release that reads its exit sees it.
  type Listening = Readonly<{ listening: boolean }>
  type Listener = Program<{ state: Listening; model: Listening; message: 'Tick' }>
  const listener = (ended: Deferred.Deferred<string>): Listener => ({
    init: { state: { listening: true } },
    update: () => () => ({ state: { listening: false } }),
    subscriptions: ({ listening }) =>
      listening
        ? HashMap.make([
          'ticks',
          Channel.succeed<'Tick'>('Tick').pipe(
            Channel.concatWith(() => Channel.never),
            Channel.onExit((exit) =>
              Deferred.succeed(
                ended,
                Exit.isSuccess(exit) ? 'ended' : Cause.hasInterruptsOnly(exit.cause) ? 'interrupted' : 'failed',
              )
            ),
          ),
        ])
        : HashMap.empty(),
    makeModel: (listening) => listening,
  })

  test('in the run, the subscription whose key went away is interrupted', async () => {
    const end = await Effect.runPromise(Effect.gen(function*() {
      const ended = yield* Deferred.make<string>()
      return yield* drive(listener(ended), () => Deferred.await(ended))
    }))
    expect(end).toBe('interrupted')
  })

  test('rehearse interrupts the subscription hearNext started once its key goes away, as the run does', async () => {
    const end = await Effect.runPromise(Effect.gen(function*() {
      const ended = yield* Deferred.make<string>()
      return yield* rehearse(listener(ended), (rehearsal) =>
        Effect.andThen(rehearsal.hearNext('ticks'), Deferred.await(ended)))
    }))
    expect(end).toBe('interrupted')
  })

  test('rehearse fails, as the run dies, on a defect of what a subscription releases when the scenario ends', async () => {
    const dying: Listener = {
      ...listener(Deferred.makeUnsafe<string>()),
      subscriptions: () =>
        HashMap.make([
          'ticks',
          Channel.succeed<'Tick'>('Tick').pipe(
            Channel.concatWith(() => Channel.never),
            Channel.onExit(() => Effect.die('release')),
          ),
        ]),
    }
    const exit = await Effect.runPromiseExit(rehearse(dying, (rehearsal) => rehearsal.hearNext('ticks')))
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(defect instanceof ProgramDefect && defect.where === 'subscription' && defect.cause).toBe('release')
  })

  // The run interrupted by whoever runs it keeps such a defect in its cause ("a subscription that dies while an
  // interrupted run releases it is in the cause", `run.test.ts`); `drive` stops the run when the scenario ends.
  test('drive fails, as the run dies, on a defect of what a subscription releases when the scenario ends', async () => {
    const dying: Listener = {
      ...listener(Deferred.makeUnsafe<string>()),
      update: () => (state) => ({ state }),
      subscriptions: () =>
        HashMap.make([
          'ticks',
          Channel.succeed<'Tick'>('Tick').pipe(
            Channel.concatWith(() => Channel.never),
            Channel.onExit(() => Effect.die('release')),
          ),
        ]),
    }
    const exit = await Effect.runPromiseExit(drive(dying, (driver) => driver.latest))
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(defect instanceof ProgramDefect && defect.where === 'subscription' && defect.cause).toBe('release')
  })
})

describe('a subscription that depends on more of the state than its key', () => {
  // Under the one key `seen`, the subscription holds the count of the state it is listed in, and ends with it once
  // `gate` opens; `Inc` counts up while the key stays.
  type Counted = Readonly<{ count: number; seen: ReadonlyArray<number> }>
  type Counting = Readonly<{ _tag: 'Inc' }> | Readonly<{ _tag: 'Seen'; count: number }>
  const counted = (gate: Effect.Effect<void>): Program<{ state: Counted; model: Counted; message: Counting }> => ({
    init: { state: { count: 0, seen: [] } },
    update: (message) => (state) =>
      message._tag === 'Inc'
        ? { state: { ...state, count: state.count + 1 } }
        : { state: { ...state, seen: [...state.seen, message.count] } },
    subscriptions: ({ count }) =>
      HashMap.make(['seen', Channel.unwrap(Effect.as(gate, Channel.end<Counting>({ _tag: 'Seen', count })))]),
    makeModel: (state) => state,
  })

  test.failing('rehearse\'s hearNext runs the subscription listed when its key appeared, as the run starts it', async () => {
    const rehearsed = await Effect.runPromise(rehearse(counted(Effect.void), Effect.fnUntraced(function*(rehearsal) {
      yield* rehearsal.send(() => Opt.some({ _tag: 'Inc' }))
      yield* rehearsal.hearNext('seen')
      return (yield* rehearsal.state).seen
    })))
    const ran = await Effect.runPromise(Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      return yield* drive(counted(Deferred.await(gate)), Effect.fnUntraced(function*(driver) {
        yield* driver.send(() => Opt.some({ _tag: 'Inc' }))
        yield* driver.waitFor(({ count }) => count === 1 ? Opt.some(count) : Opt.none())
        yield* Deferred.succeed(gate, undefined)
        return yield* driver.waitFor(({ seen }) => seen.length === 1 ? Opt.some(seen) : Opt.none())
      }))
    }))
    expect(rehearsed).toEqual(ran)
  })
})

describe('what the run dies of, and the tools fail on', () => {
  // A row by id, listening under `ticks`; `Doubled` makes the parent's `subscribed` list its id twice, which the
  // run's reconciliation of the parent's subscriptions finds in the state `Doubled` leaves.
  type Row = Readonly<{ seen: number }>
  const row: Program<{ state: Row; model: number; message: 'Seen' }> = {
    init: { state: { seen: 0 } },
    update: () => ({ seen }) => ({ state: { seen: seen + 1 } }),
    subscriptions: () => HashMap.make(['ticks', Channel.never]),
    makeModel: ({ seen }) => seen,
  }
  type Table = Readonly<{ row: Row; twice: boolean }>
  const { each, compose } = parent<{ state: Table }>()
  const table = compose({
    init: (children) => ({ state: { row: children.Row.init(1).state, twice: false } }),
    children: {
      Row: each(row, {
        get: (state, id: number) => id === 1 ? Opt.some(state.row) : Opt.none(),
        set: (state, _, row) => ({ ...state, row }),
        subscribed: (state) => state.twice ? [[1, state.row], [1, state.row]] : [[1, state.row]],
      }),
    },
    update: (_: 'Doubled') => (state) => ({ state: { ...state, twice: true } }),
    makeModel: ({ twice }) => ({ double: twice ? Opt.none<'Doubled'>() : Opt.some<'Doubled'>('Doubled') }),
  })

  const isCompositionDefect = (exit: Exit.Exit<unknown>) => {
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return (defect instanceof ProgramDefect ? defect.cause : defect) instanceof CompositionDefect
  }

  test('the run dies of a state whose subscriptions are a defect', async () => {
    const exit = await Effect.runPromiseExit(drive(table, Effect.fnUntraced(function*(driver) {
      yield* driver.send(({ double }) => double)
      yield* driver.waitFor(({ double }) => Opt.isNone(double) ? Opt.some(true) : Opt.none())
    })))
    expect(isCompositionDefect(exit)).toBe(true)
  })

  // Neither tool runs the subscriptions, but both read them on each new state, as the run does.
  test('rehearse fails, as the run dies, on a state whose subscriptions are a defect', async () => {
    const exit = await Effect.runPromiseExit(rehearse(table, (rehearsal) => rehearsal.send(({ double }) => double)))
    expect(isCompositionDefect(exit)).toBe(true)
  })

  test('simulate fails, as the run dies, on a state whose subscriptions are a defect', async () => {
    const exit = await Effect.runPromiseExit(simulate(table)(['Doubled'], table.init))
    expect(isCompositionDefect(exit)).toBe(true)
  })

  // A key whose Equal throws, under the same hash as every other: no state lists two, so only a comparison with
  // the keys of the state before finds it, as the run's reconciliation does ("a key whose Equal throws dies in
  // subscriptions", `run.test.ts`).
  class Throwing implements Equal.Equal {
    [Equal.symbol](): boolean {
      throw new Error('boom')
    }
    [Hash.symbol](): number {
      return 0
    }
  }
  const renewing: Program<{ state: Row; model: number; message: 'Seen' }> = {
    ...row,
    subscriptions: () => HashMap.make([new Throwing(), Channel.never]),
  }
  const diesInSubscriptions = (exit: Exit.Exit<unknown>) => {
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return defect instanceof ProgramDefect && defect.where === 'subscriptions'
  }

  test.failing('simulate fails, as the run dies, on a key whose Equal throws against the key of the state before', async () => {
    const exit = await Effect.runPromiseExit(simulate(renewing)(['Seen'], renewing.init))
    expect(diesInSubscriptions(exit)).toBe(true)
  })

  test.failing('rehearse fails, as the run dies, on a key whose Equal throws against the key of the state before', async () => {
    const exit = await Effect.runPromiseExit(rehearse(renewing, (rehearsal) => rehearsal.send(() => Opt.some('Seen'))))
    expect(diesInSubscriptions(exit)).toBe(true)
  })

  // A command or a subscription that interrupts itself is a defect of the run (`diesIn`), and of the tools, which
  // would otherwise interrupt the test's own fiber, with no defect that says where.
  const diedIn = (exit: Exit.Exit<unknown>) => {
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return defect instanceof ProgramDefect ? defect.where : undefined
  }

  const quitting: Program<{ state: Row; model: number; message: 'Go'; command: 'Quit' }> = {
    init: { state: { seen: 0 } },
    update: () => (state) => ({ state, commands: ['Quit'] }),
    runCommand: () => Effect.interrupt,
    makeModel: ({ seen }) => seen,
  }

  test('simulate fails with a defect, as the run dies, on a command interrupting itself', async () => {
    const exit = await Effect.runPromiseExit(simulate(quitting)(['Go'], quitting.init))
    expect(diedIn(exit)).toBe('command')
  })

  test('rehearse fails with a defect, as the run dies, on a command interrupting itself', async () => {
    const exit = await Effect.runPromiseExit(rehearse(quitting, (rehearsal) =>
      rehearsal.send(() => Opt.some('Go')).pipe(Effect.andThen(rehearsal.runAll))))
    expect(diedIn(exit)).toBe('command')
  })

  test('the run dies with a defect of a command interrupting itself', async () => {
    const exit = await Effect.runPromiseExit(drive(quitting, Effect.fnUntraced(function*(driver) {
      yield* driver.send(() => Opt.some('Go'))
      // The run dies before any frame could end the wait.
      return yield* driver.waitFor(() => Opt.none())
    })))
    expect(diedIn(exit)).toBe('command')
  })

  test('rehearse fails with a defect, as the run dies, on a subscription interrupting itself', async () => {
    const leaving: Program<{ state: Row; model: number; message: 'Seen' }> = {
      ...row,
      subscriptions: () => HashMap.make(['ticks', Channel.fromEffect(Effect.interrupt).pipe(Channel.mapDone((): 'Seen' => 'Seen'))]),
    }
    const exit = await Effect.runPromiseExit(rehearse(leaving, (rehearsal) => rehearsal.hearNext('ticks')))
    expect(diedIn(exit)).toBe('subscription')
  })
})
