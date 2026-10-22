import { describe, expect, test } from 'bun:test'
import * as Arr from 'effect/Array'
import * as Channel from 'effect/Channel'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Stream from 'effect/Stream'
import fc from 'fast-check'
import { parent } from './compose.ts'
import type { Applied } from './engine.ts'
import type { Offered } from './offer.ts'
import type { Program } from './program.ts'
import { type Frame, run } from './run.ts'
import { reject } from './update.ts'

// A list of rows by id, from a pool of two so that ids come back. Each row is born anew when it is added, works
// with a command that completes when the scheduler says, and, while it listens, hears two ticks from a
// subscription that then stays open; each time it starts listening again is a new session. What the user does,
// when commands complete and when ticks arrive is all in the scheduler's hands.
type Id = 1 | 2
const ids: ReadonlyArray<Id> = [1, 2]

type RowMessage = Data.TaggedEnum<{
  WorkClicked: object
  Done: { born: number }
  MuteClicked: object
  ListenClicked: object
  Tick: { born: number; session: number }
}>
const RowMessage = Data.taggedEnum<RowMessage>()
type RowCommand = Readonly<{ _tag: 'Work'; born: number }>

type Row = Readonly<{ born: number; working: boolean; listening: boolean; session: number; heard: number }>
type RowModel = Readonly<{
  working: boolean
  work: Opt.Option<Offered<RowMessage>>
  mute: Opt.Option<Offered<RowMessage>>
  listen: Opt.Option<Offered<RowMessage>>
}>

type ListState = Readonly<{ rows: ReadonlyArray<Readonly<{ id: Id; row: Row }>>; born: number }>
type Own = Readonly<{ _tag: 'Add'; id: Id }> | Readonly<{ _tag: 'Remove'; id: Id }>

/** Counts the subscriptions that are holding what they acquired, by `listener`. */
type Alive = Map<string, number>

const listener = (born: number, session: number) => `${born}.${session}`

const makeList = (scheduler: fc.Scheduler, alive: Alive) => {
  const later = <A>(value: A) => Effect.promise(() => scheduler.schedule(Promise.resolve(value)))
  const ticking = (born: number, session: number) => {
    const key = listener(born, session)
    const tick = Channel.fromEffect(later(RowMessage.Tick({ born, session })))
    return Channel.unwrap(
      Effect.acquireRelease(
        Effect.sync(() => alive.set(key, (alive.get(key) ?? 0) + 1)),
        () => Effect.sync(() => alive.set(key, (alive.get(key) ?? 0) - 1)),
      ).pipe(Effect.as(tick.pipe(Channel.concatWith(() => tick), Channel.concatWith(() => Channel.never)))),
    )
  }
  const row: Program<{ state: Row; model: RowModel; message: RowMessage; command: RowCommand }> = {
    init: { state: { born: 0, working: false, listening: true, session: 1, heard: 0 } },
    update: (message) => (state) => {
      switch (message._tag) {
        case 'WorkClicked':
          return state.working
            ? reject
            : { state: { ...state, working: true }, commands: [{ _tag: 'Work', born: state.born }] }
        // Commands carry no generation: a completion for an earlier row at this id would reach this one, so
        // the row tells its own completions apart.
        case 'Done':
          return state.working && message.born === state.born ? { state: { ...state, working: false } } : reject
        case 'MuteClicked':
          return state.listening ? { state: { ...state, listening: false } } : reject
        case 'ListenClicked':
          return state.listening ? reject : { state: { ...state, listening: true, session: state.session + 1 } }
        // Accepts any tick, muted or not: whether one of a stopped subscription can arrive is what the test checks.
        case 'Tick':
          return { state: { ...state, heard: state.heard + 1 } }
      }
    },
    runCommand: (command) => later(Opt.some(RowMessage.Done({ born: command.born }))),
    // The same key in every session: only the engine tells a session from the one before.
    subscriptions: (state) =>
      state.listening ? HashMap.make(['ticks', ticking(state.born, state.session)]) : HashMap.empty(),
    makeModel: (state, { offer }) => ({
      working: state.working,
      work: state.working ? Opt.none() : Opt.some(offer(RowMessage.WorkClicked())),
      mute: state.listening ? Opt.some(offer(RowMessage.MuteClicked())) : Opt.none(),
      listen: state.listening ? Opt.none() : Opt.some(offer(RowMessage.ListenClicked())),
    }),
  }
  const List = parent<{ state: ListState }>()
  return List.compose({
    init: { state: { rows: [], born: 0 } },
    children: {
      Rows: List.each(row, {
        get: (state, id: Id) => Opt.map(Arr.findFirst(state.rows, (entry) => entry.id === id), (entry) => entry.row),
        set: (state, id, row) => ({ ...state, rows: state.rows.map((entry) => entry.id === id ? { id, row } : entry) }),
        subscribed: (state) => state.rows.map(({ id, row }) => [id, row] as const),
      }),
    },
    update: (message: Own) => (state) => {
      const present = state.rows.some((entry) => entry.id === message.id)
      switch (message._tag) {
        case 'Add': {
          if (present) return reject
          const born = state.born + 1
          return { state: { rows: [...state.rows, { id: message.id, row: { ...row.init.state, born } }], born } }
        }
        case 'Remove':
          return present ? { state: { ...state, rows: state.rows.filter((entry) => entry.id !== message.id) } } : reject
      }
    },
    makeModel: (state, { offer, children }) => ({
      add: ids.filter((id) => !state.rows.some((entry) => entry.id === id)).map((id) =>
        [id, offer({ _tag: 'Add', id })] as const
      ),
      rows: state.rows.map(({ id }) => ({ id, remove: offer({ _tag: 'Remove', id }), row: children.Rows(state, id) })),
    }),
  })
}

type List = ReturnType<typeof makeList>
type Model = ReturnType<List['makeModel']>
type Message = Parameters<List['update']>[0]

/**
 * What the user does, on whatever frame is drawn when the scheduler lets them: `pick` chooses among the
 * controls drawn, so that every act does something; `twice` is a double tap.
 */
type Act = Readonly<{ pick: number; twice: boolean }>

const act: fc.Arbitrary<Act> = fc.record({ pick: fc.nat(), twice: fc.boolean() })

/** Every control the frame shows: a user can only use what is drawn. */
const controls = (model: Model): ReadonlyArray<Offered<unknown>> => [
  ...model.add.map(([, add]) => add),
  ...model.rows.flatMap(({ remove, row }) => [remove, ...Arr.getSomes([row.work, row.mute, row.listen])]),
]

const controlFor = (model: Model, { pick }: Act): Opt.Option<Offered<unknown>> => {
  const drawn = controls(model)
  return Arr.get(drawn, pick % Math.max(drawn.length, 1))
}

const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/**
 * Releases what the scheduler holds, in its order, until nothing more is scheduled for a while. Each burst
 * releases its tasks within one macrotask, so that what they send meets in the engine's queue before the loop
 * takes any of it: one task at a time, the loop would always have caught up.
 */
const settle = async (scheduler: fc.Scheduler, bursts: ReadonlyArray<number>) => {
  for (let idle = 0, round = 0; idle < 10; round += 1) {
    await macrotask()
    if (scheduler.count() > 0) {
      idle = 0
      for (let released = 0; released < (bursts[round % bursts.length] ?? 1) && scheduler.count() > 0; released += 1) {
        await scheduler.waitOne()
      }
    } else {
      idle += 1
    }
  }
}

/** Runs `acts` against the list, and what was seen once everything scheduled has happened. */
const runScenario = async (scheduler: fc.Scheduler, acts: ReadonlyArray<Act>, bursts: ReadonlyArray<number>) => {
  const alive: Alive = new Map()
  const list = makeList(scheduler, alive)
  let latest: Frame<Model> | undefined
  let final = list.init.state
  const applied: Array<Applied<ListState, Message, unknown>> = []
  let stop = () => {}
  const stopped = new Promise<void>((resolve) => {
    stop = resolve
  })
  const scenario = Effect.forEach(acts, (act) =>
    Effect.gen(function*() {
      yield* Effect.promise(() => scheduler.schedule(Promise.resolve(act)))
      const control = latest === undefined ? Opt.none() : controlFor(latest.model, act)
      if (latest === undefined || Opt.isNone(control)) return
      yield* latest.dispatch(control.value)
      if (act.twice) yield* latest.dispatch(control.value)
    }), { discard: true })
  const done = Effect.runPromiseExit(Effect.raceFirst(
    run(list, (frames) =>
      Stream.runForEach(frames, (frame) =>
        Effect.sync(() => {
          latest = frame
        })), {
      onRejectedInput: 'die',
      onApplied: (step) =>
        Effect.sync(() => {
          applied.push(step)
          final = step.after
        }),
    }),
    Effect.andThen(scenario, Effect.promise(() => stopped)),
  ))
  await settle(scheduler, bursts)
  // Read before stopping: the end of the run releases every subscription.
  const holding = Array.from(alive).filter(([, count]) => count > 0).map(([key]) => key).sort()
  const drawn = latest?.model
  stop()
  return { exit: await done, applied, final, drawn, holding }
}

const listeners = (state: ListState) =>
  state.rows.filter(({ row }) => row.listening).map(({ row }) => listener(row.born, row.session)).sort()

describe('interleavings of the user, commands and subscriptions', () => {
  const property = (check: (outcome: Awaited<ReturnType<typeof runScenario>>) => void) =>
    fc.assert(
      fc.asyncProperty(
        fc.scheduler(),
        fc.array(act, { maxLength: 12 }),
        fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 8 }),
        async (scheduler, acts, bursts) => {
          check(await runScenario(scheduler, acts, bursts))
        },
      ),
      { numRuns: 60 },
    )

  // Also checks that the scenarios reach every message: a model that offered nothing would pass every property.
  test('whatever the order, a user who sends only what is drawn never makes the run fail', async () => {
    const reached = new Set<string>()
    await property(({ exit, applied }) => {
      expect(Exit.isSuccess(exit)).toBe(true)
      for (const { message } of applied) reached.add(message._tag === 'Rows' ? message.message._tag : message._tag)
    })
    expect([...reached].sort()).toEqual(
      ['Add', 'Done', 'ListenClicked', 'MuteClicked', 'Remove', 'Tick', 'WorkClicked'],
    )
  }, 60_000)

  test('a tick reaches update only while the session that sent it is listening', async () => {
    await property(({ applied }) => {
      const late = applied.filter(({ message, before }) => {
        if (message._tag !== 'Rows' || message.message._tag !== 'Tick') return false
        const { born, session } = message.message
        const row = Opt.getOrUndefined(Arr.findFirst(before.rows, (entry) => entry.id === message.id))?.row
        return !(row?.listening === true && row.born === born && row.session === session)
      })
      expect(late).toEqual([])
    })
  }, 60_000)

  test('once everything has happened, the subscriptions holding resources are those of the rows there', async () => {
    await property(({ final, holding }) => expect(holding).toEqual(listeners(final)))
  }, 60_000)

  test('once everything has happened, every operation has ended and the last frame shows the last state', async () => {
    await property(({ final, drawn }) => {
      expect(final.rows.filter(({ row }) => row.working)).toEqual([])
      expect(drawn?.rows.map(({ id, row }) => [id, row.working])).toEqual(
        final.rows.map(({ id, row }) => [id, row.working]),
      )
    })
  }, 60_000)
})
