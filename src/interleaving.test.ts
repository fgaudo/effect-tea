import { describe, expect, test } from 'bun:test'
import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Stream from 'effect/Stream'
import fc from 'fast-check'
import { parent } from './compose.ts'
import { type Dispatch, dispatchTo } from './dispatch.ts'
import type { Applied } from './engine.ts'
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
  work: Opt.Option<RowMessage>
  mute: Opt.Option<RowMessage>
  listen: Opt.Option<RowMessage>
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
    makeModel: (state) => ({
      working: state.working,
      work: state.working ? Opt.none() : Opt.some(RowMessage.WorkClicked()),
      mute: state.listening ? Opt.some(RowMessage.MuteClicked()) : Opt.none(),
      listen: state.listening ? Opt.none() : Opt.some(RowMessage.ListenClicked()),
    }),
  }
  const List = parent<{ state: ListState }>()
  return List.compose({
    init: () => ({ state: { rows: [], born: 0 } }),
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
    makeModel: (state, children) => ({
      add: ids.filter((id) => !state.rows.some((entry) => entry.id === id)).map((id): Own => ({ _tag: 'Add', id })),
      rows: state.rows.map(({ id }) => ({ id, remove: { _tag: 'Remove', id } as Own, row: children.Rows(state, id) })),
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

/** What a control does with the frame's dispatch: a row's sends through the row's own dispatch, as its view would. */
type Control = (dispatch: Dispatch<Message>) => Effect.Effect<void>

/** Every control the frame shows: a user can only use what is drawn. */
const controls = (model: Model): ReadonlyArray<Control> => [
  ...model.add.map((add): Control => (dispatch) => dispatch(add)),
  ...model.rows.flatMap(({ id, remove, row }) => [
    (dispatch: Dispatch<Message>) => dispatch(remove),
    ...Arr.getSomes([row.work, row.mute, row.listen]).map((message): Control => (dispatch) =>
      dispatchTo(dispatch, 'Rows', id)(message)
    ),
  ]),
]

const controlFor = (model: Model, { pick }: Act): Opt.Option<Control> => {
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
        await scheduler.waitNext(1)
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
  let latest: Frame<Model, Message> | undefined
  let final = list.init.state
  const applied: Array<Applied<ListState, Message, unknown>> = []
  let stop = () => {}
  const stopped = new Promise<void>((resolve) => {
    stop = resolve
  })
  const scenario = Effect.forEach(
    acts,
    Effect.fnUntraced(function*(act) {
      yield* Effect.promise(() => scheduler.schedule(Promise.resolve(act)))
      const control = latest === undefined ? Opt.none() : controlFor(latest.model, act)
      if (latest === undefined || Opt.isNone(control)) return
      yield* control.value(latest.dispatch)
      if (act.twice) yield* control.value(latest.dispatch)
    }),
    { discard: true },
  )
  const done = Effect.runPromiseExit(Effect.raceFirst(
    run(list, (frames) =>
      Stream.runForEach(frames, (frame) =>
        Effect.sync(() => {
          latest = frame
        })), {
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
  const property = (
    check: (outcome: Awaited<ReturnType<typeof runScenario>>) => void,
    options: Readonly<{ numRuns?: number; seed?: number }> = {},
  ) =>
    fc.assert(
      fc.asyncProperty(
        fc.scheduler(),
        fc.array(act, { maxLength: 12 }),
        fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 8 }),
        async (scheduler, acts, bursts) => {
          check(await runScenario(scheduler, acts, bursts))
        },
      ),
      { numRuns: 60, ...options },
    )

  // The other properties would hold for scenarios that did nothing: the scenarios reach every message. Listening
  // again takes three acts in a row (add, mute, listen), which about one run of 60 scenarios in a hundred misses:
  // 200 make a miss about one in ten million. What is missing shows only once every scenario has run, after
  // fast-check could name one, so the failure names the seed that makes them again.
  test('the scenarios reach every message, of the user, of the commands and of the subscriptions', async () => {
    const seed = Math.floor(Math.random() * 2 ** 31)
    const reached = new Set<string>()
    await property(({ applied }) => {
      for (const { message } of applied) reached.add(message._tag === 'Rows' ? message.message._tag : message._tag)
    }, { numRuns: 200, seed })
    const missing = ['Add', 'Done', 'ListenClicked', 'MuteClicked', 'Remove', 'Tick', 'WorkClicked'].filter((tag) =>
      !reached.has(tag)
    )
    if (missing.length > 0) throw new Error(`No scenario of seed ${seed} reached ${missing.join(', ')}`)
  }, 60_000)

  test('whatever the order, nothing the user, the commands or the subscriptions do raises a defect', async () => {
    await property(({ exit }) => {
      expect(Exit.isSuccess(exit) ? 'no defect' : Cause.pretty(exit.cause)).toBe('no defect')
    })
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

  test('once everything has happened, the subscriptions holding resources are those of listening rows', async () => {
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
