import { describe, expect, test } from 'bun:test'
import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Stream from 'effect/Stream'
import fc from 'fast-check'
import { parent } from './compose.ts'
import { ProgramDefect } from './defect.ts'
import { type Dispatch, dispatchTo } from './dispatch.ts'
import type { Applied, Ignored } from './engine.ts'
import type { Program } from './program.ts'
import { type Frame, run } from './run.ts'
import type { Subscription } from './subscription.ts'
import { reject } from './update.ts'

// A list of rows by id, from a pool of two so that ids come back. Each row is born anew when it is added, works
// with a command that completes when the scheduler says (working mutes the row, so that one step both stops a
// subscription and starts a command), and, while it listens, hears two ticks from a subscription that then
// either stays open or ends with a last message; each time it starts listening again is a new session. The list
// can clear all its rows at once, stopping their subscriptions together. What the user does, when commands
// complete, when ticks arrive and when releases end is all in the scheduler's hands; what is drawn beside it
// (`Fates`) says which subscriptions end, which releases take time or die, which commands die, and which steps
// `onApplied` and `onIgnored` hold, and whether the renderer takes time to release what it holds, which is when a
// run that died still has fibers under way.
type Id = 1 | 2
const ids: ReadonlyArray<Id> = [1, 2]

type RowMessage = Data.TaggedEnum<{
  WorkClicked: object
  Done: { born: number }
  MuteClicked: object
  ListenClicked: object
  Tick: { born: number; session: number }
  Finished: { born: number; session: number }
}>
const RowMessage = Data.taggedEnum<RowMessage>()
type RowCommand = Readonly<{ _tag: 'Work'; born: number; attempt: number }>

type Row = Readonly<{
  id: Id
  born: number
  working: boolean
  attempts: number
  listening: boolean
  session: number
  heard: number
  finished: boolean
}>
type RowModel = Readonly<{
  working: boolean
  work: Opt.Option<RowMessage>
  mute: Opt.Option<RowMessage>
  listen: Opt.Option<RowMessage>
}>

type ListState = Readonly<{ rows: ReadonlyArray<Readonly<{ id: Id; row: Row }>>; born: number }>
type Own = Readonly<{ _tag: 'Add'; id: Id }> | Readonly<{ _tag: 'Remove'; id: Id }> | Readonly<{ _tag: 'Clear' }>

/** How a subscription's release goes: at once, when the scheduler says, or dying when the scheduler says. */
type Release = 'quick' | 'slow' | 'dies'

/** What is drawn beside the scheduler, each list read in a loop by a number that only the program's data gives. */
type Fates = Readonly<{
  ends: ReadonlyArray<boolean>
  releases: ReadonlyArray<Release>
  commandDies: ReadonlyArray<boolean>
  slowObservers: ReadonlyArray<boolean>
  rendererReleasesSlowly: boolean
}>

const fateOf = <A>(fates: ReadonlyArray<A>, index: number): A => fates[index % fates.length] as A

const fates: fc.Arbitrary<Fates> = fc.record({
  ends: fc.array(fc.boolean(), { minLength: 1, maxLength: 6 }),
  releases: fc.array(
    fc.oneof(
      { arbitrary: fc.constant<Release>('quick'), weight: 4 },
      { arbitrary: fc.constant<Release>('slow'), weight: 4 },
      { arbitrary: fc.constant<Release>('dies'), weight: 1 },
    ),
    { minLength: 1, maxLength: 8 },
  ),
  commandDies: fc.array(
    fc.oneof({ arbitrary: fc.constant(false), weight: 6 }, { arbitrary: fc.constant(true), weight: 1 }),
    { minLength: 1, maxLength: 8 },
  ),
  slowObservers: fc.array(fc.boolean(), { minLength: 1, maxLength: 6 }),
  rendererReleasesSlowly: fc.boolean(),
})

/** What happened, in the order it happened, as the program's own code and the options saw it. */
type Event =
  | Readonly<{ _tag: 'Applied'; applied: Applied<ListState, Message, unknown> }>
  | Readonly<{ _tag: 'Ignored'; ignored: Ignored<ListState, Message> }>
  | Readonly<{ _tag: 'CommandStarted'; command: string }>
  | Readonly<{ _tag: 'Acquired'; listener: string; id: Id }>
  | Readonly<{ _tag: 'Releasing'; listener: string; quick: boolean }>
  | Readonly<{ _tag: 'Released'; listener: string }>
  | Readonly<{ _tag: 'Ended'; listener: string }>
  | Readonly<{ _tag: 'Died'; where: 'subscription' | 'command'; defect: string }>

const listener = (born: number, session: number) => `${born}.${session}`

const makeList = (scheduler: fc.Scheduler, fates: Fates, events: Array<Event>) => {
  const later = <A>(value: A) => Effect.promise(() => scheduler.schedule(Promise.resolve(value)))
  const dies = (where: 'subscription' | 'command', defect: string) =>
    Effect.suspend(() => {
      events.push({ _tag: 'Died', where, defect })
      return Effect.die(defect)
    })
  const ticking = (id: Id, born: number, session: number): Subscription<RowMessage, never> => {
    const key = listener(born, session)
    const index = born * 31 + session
    const tick = Channel.fromEffect(later(RowMessage.Tick({ born, session })))
    const ticks = tick.pipe(Channel.concatWith(() => tick))
    const released = Effect.sync(() => events.push({ _tag: 'Released', listener: key }))
    const release = Effect.suspend(() => {
      const fate = fateOf(fates.releases, index)
      events.push({ _tag: 'Releasing', listener: key, quick: fate === 'quick' })
      switch (fate) {
        case 'quick':
          return released
        case 'slow':
          return later(undefined).pipe(Effect.andThen(released))
        case 'dies':
          return later(undefined).pipe(
            Effect.andThen(released),
            Effect.andThen(dies('subscription', `release of ${key}`)),
          )
      }
    })
    const body: Subscription<RowMessage, never> = fateOf(fates.ends, index)
      ? ticks.pipe(Channel.mapDoneEffect(() =>
        Effect.sync(() => {
          events.push({ _tag: 'Ended', listener: key })
          return RowMessage.Finished({ born, session })
        })
      ))
      : ticks.pipe(Channel.concatWith(() => Channel.never))
    return Channel.unwrap(
      Effect.acquireRelease(Effect.sync(() => events.push({ _tag: 'Acquired', listener: key, id })), () => release)
        .pipe(Effect.as(body)),
    )
  }
  const initial: Row = {
    id: 1,
    born: 0,
    working: false,
    attempts: 0,
    listening: true,
    session: 1,
    heard: 0,
    finished: false,
  }
  const row: Program<{ state: Row; model: RowModel; message: RowMessage; command: RowCommand }> = {
    init: { state: initial },
    update: (message) => (state) => {
      switch (message._tag) {
        case 'WorkClicked':
          return state.working ? reject : {
            state: { ...state, working: true, attempts: state.attempts + 1, listening: false },
            commands: [{ _tag: 'Work', born: state.born, attempt: state.attempts }],
          }
        // Commands carry no generation: a completion for an earlier row at this id would reach this one, so
        // the row tells its own completions apart.
        case 'Done':
          return state.working && message.born === state.born ? { state: { ...state, working: false } } : reject
        case 'MuteClicked':
          return state.listening ? { state: { ...state, listening: false } } : reject
        case 'ListenClicked':
          return state.listening
            ? reject
            : { state: { ...state, listening: true, session: state.session + 1, finished: false } }
        // Accept any tick, and any end, muted or not: whether one of a stopped subscription can arrive is what the
        // test checks.
        case 'Tick':
          return { state: { ...state, heard: state.heard + 1 } }
        case 'Finished':
          return { state: { ...state, finished: true } }
      }
    },
    runCommand: (command) =>
      Effect.suspend(() => {
        const name = `${command.born}.${command.attempt}`
        events.push({ _tag: 'CommandStarted', command: name })
        return fateOf(fates.commandDies, command.born * 7 + command.attempt)
          ? later(undefined).pipe(Effect.andThen(dies('command', `command ${name}`)))
          : later(Opt.some(RowMessage.Done({ born: command.born })))
      }),
    // The same key in every session: only the engine tells a session from the one before.
    subscriptions: (state) =>
      state.listening ? HashMap.make(['ticks', ticking(state.id, state.born, state.session)]) : HashMap.empty(),
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
      switch (message._tag) {
        case 'Add': {
          if (state.rows.some((entry) => entry.id === message.id)) return reject
          const born = state.born + 1
          const added = { id: message.id, row: { ...initial, id: message.id, born } }
          return { state: { rows: [...state.rows, added], born } }
        }
        case 'Remove':
          return state.rows.some((entry) => entry.id === message.id)
            ? { state: { ...state, rows: state.rows.filter((entry) => entry.id !== message.id) } }
            : reject
        case 'Clear':
          return state.rows.length > 0 ? { state: { ...state, rows: [] } } : reject
      }
    },
    makeModel: (state, children) => ({
      add: ids.filter((id) => !state.rows.some((entry) => entry.id === id)).map((id): Own => ({ _tag: 'Add', id })),
      clear: state.rows.length > 0 ? Opt.some<Own>({ _tag: 'Clear' }) : Opt.none<Own>(),
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
  ...Opt.toArray(model.clear).map((clear): Control => (dispatch) => dispatch(clear)),
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
 * Releases what the scheduler holds, in its order, until nothing more is scheduled for a while and `until` holds.
 * Each burst releases its tasks within one macrotask, so that what they send meets in the engine's queue before
 * the loop takes any of it: one task at a time, the loop would always have caught up.
 */
const settle = async (scheduler: fc.Scheduler, bursts: ReadonlyArray<number>, until: () => boolean = () => true) => {
  for (let idle = 0, round = 0; idle < 10 || !until(); round += 1) {
    if (idle > 1000) throw new Error('The run never ended')
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

/**
 * Runs `acts` against the list, and what was seen once everything scheduled has happened (`settled`, the number
 * of events by then), then once whoever runs it has interrupted it and it has ended.
 */
const runScenario = async (
  scheduler: fc.Scheduler,
  fates: Fates,
  acts: ReadonlyArray<Act>,
  bursts: ReadonlyArray<number>,
) => {
  const events: Array<Event> = []
  const list = makeList(scheduler, fates, events)
  let latest: Frame<Model, Message> | undefined
  let observed = 0
  const observer = (event: Event) =>
    Effect.suspend(() => {
      events.push(event)
      observed += 1
      return fateOf(fates.slowObservers, observed) ? whenScheduled(scheduler) : Effect.void
    })
  const holds = fates.rendererReleasesSlowly
    ? Effect.acquireRelease(Effect.void, () => whenScheduled(scheduler))
    : Effect.void
  const fiber = Effect.runFork(run(list, (frames) =>
    holds.pipe(Effect.andThen(Stream.runForEach(frames, (frame) =>
      Effect.sync(() => {
        latest = frame
      })))), {
    onApplied: (applied) => observer({ _tag: 'Applied', applied }),
    onIgnored: (ignored) => observer({ _tag: 'Ignored', ignored }),
  }))
  let ended = false
  const exited = Effect.runPromise(Fiber.await(fiber)).then((exit) => {
    ended = true
    return exit
  })
  const scenario = Effect.runPromise(Effect.forEach(
    acts,
    Effect.fnUntraced(function*(act) {
      yield* Effect.promise(() => scheduler.schedule(Promise.resolve(act)))
      const control = latest === undefined ? Opt.none() : controlFor(latest.model, act)
      if (latest === undefined || Opt.isNone(control)) return
      yield* control.value(latest.dispatch)
      if (act.twice) yield* control.value(latest.dispatch)
    }),
    { discard: true },
  ))
  await settle(scheduler, bursts)
  const settled = events.length
  const drawn = latest?.model
  Effect.runFork(Fiber.interrupt(fiber))
  await settle(scheduler, bursts, () => ended)
  await scenario
  return { exit: await exited, events, settled, drawn }
}

const whenScheduled = (scheduler: fc.Scheduler) => Effect.promise(() => scheduler.schedule(Promise.resolve()))

type Outcome = Awaited<ReturnType<typeof runScenario>>

const applied = (events: ReadonlyArray<Event>) =>
  events.flatMap((event) => event._tag === 'Applied' ? [event.applied] : [])

const finalState = (events: ReadonlyArray<Event>): ListState =>
  applied(events).at(-1)?.after ?? { rows: [], born: 0 }

const listeners = (state: ListState) =>
  state.rows.filter(({ row }) => row.listening).map(({ row }) => listener(row.born, row.session)).sort()

const deaths = (events: ReadonlyArray<Event>) =>
  events.flatMap((event) => event._tag === 'Died' ? [`${event.where}: ${event.defect}`] : [])

/** The subscriptions that hold what they acquired after the first `count` events. */
const holding = (events: ReadonlyArray<Event>, count = events.length) => {
  const held = new Set<string>()
  for (const event of events.slice(0, count)) {
    if (event._tag === 'Acquired') held.add(event.listener)
    if (event._tag === 'Releasing') held.delete(event.listener)
  }
  return held
}

const released = (events: ReadonlyArray<Event>, count: number) =>
  new Set(events.slice(0, count).flatMap((event) => event._tag === 'Released' ? [event.listener] : []))

/**
 * The subscriptions that the accepted message of event `index` stops while they hold what they acquired, and those
 * of them whose release waits: a quick one ends before the next fiber runs, so only those that wait tell releases
 * made together from releases made in turn.
 */
const stoppedAt = (events: ReadonlyArray<Event>, index: number, applied: Applied<ListState, Message, unknown>) => {
  const held = holding(events, index)
  const stopped = listeners(applied.before).filter((key) => held.has(key) && !listeners(applied.after).includes(key))
  const waiting = new Set(events.slice(index + 1).flatMap((later) =>
    later._tag === 'Releasing' && !later.quick && stopped.includes(later.listener) ? [later.listener] : []
  ))
  return { stopped, waiting }
}

const defects = (exit: Exit.Exit<unknown>) =>
  Exit.isFailure(exit)
    ? exit.cause.reasons.filter(Cause.isDieReason).map(({ defect }) =>
      defect instanceof ProgramDefect ? `${defect.where}: ${String(defect.cause)}` : defect
    )
    : []

describe('interleavings of the user, commands and subscriptions', () => {
  const property = (
    check: (outcome: Outcome) => void,
    options: Readonly<{ numRuns?: number; seed?: number }> = {},
  ) =>
    fc.assert(
      fc.asyncProperty(
        fc.scheduler(),
        fates,
        fc.array(act, { maxLength: 12 }),
        fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 8 }),
        async (scheduler, fates, acts, bursts) => {
          check(await runScenario(scheduler, fates, acts, bursts))
        },
      ),
      { numRuns: 60, ...options },
    )

  // The other properties would hold for scenarios that did nothing: the scenarios reach every message, and every
  // way of dying. Listening again takes three acts in a row (add, mute, listen), and stopping two subscriptions at
  // once three too (add, add, clear), with two releases that wait, which some runs of 60 scenarios miss: 300 make a
  // miss rare. What is missing
  // shows only once every scenario has run, after fast-check could name one, so the failure names the seed that
  // makes them again.
  test('the scenarios reach every message, every way of dying, and a step that waits for two releases', async () => {
    const seed = Math.floor(Math.random() * 2 ** 31)
    const reached = new Set<string>()
    await property(({ events }) => {
      events.forEach((event, index) => {
        if (event._tag !== 'Applied') return
        const { message } = event.applied
        reached.add(message._tag === 'Rows' ? message.message._tag : message._tag)
        if (stoppedAt(events, index, event.applied).waiting.size > 1) reached.add('two waiting releases')
      })
      for (const event of events) if (event._tag === 'Died') reached.add(event.where)
      if (events.some(({ _tag }) => _tag === 'Ignored')) reached.add('rejected')
    }, { numRuns: 300, seed })
    const missing = [
      'Add',
      'Clear',
      'Done',
      'Finished',
      'ListenClicked',
      'MuteClicked',
      'Remove',
      'Tick',
      'WorkClicked',
      'command',
      'rejected',
      'subscription',
      'two waiting releases',
    ].filter((tag) => !reached.has(tag))
    if (missing.length > 0) throw new Error(`No scenario of seed ${seed} reached ${missing.join(', ')}`)
  }, 120_000)

  test('a rejected message leaves the state as it was, and an accepted one starts from the one before', async () => {
    await property(({ events }) => {
      // The first state heard is the one the run starts from.
      let state: ListState | undefined
      const broken: Array<string> = []
      for (const event of events) {
        if (event._tag === 'Ignored') {
          if (state !== undefined && event.ignored.state !== state) broken.push('ignored')
          state = event.ignored.state
        }
        if (event._tag === 'Applied') {
          if (state !== undefined && event.applied.before !== state) broken.push('applied')
          state = event.applied.after
        }
      }
      expect(broken).toEqual([])
    })
  }, 120_000)

  test('the defects of the cause are exactly those that happened, each where it happened, in that order', async () => {
    await property(({ exit, events }) => {
      expect(defects(exit)).toEqual(deaths(events))
    })
  }, 120_000)

  /** What the run did, of the events `tags` name, from the first defect on. */
  const sinceFirstDefect = (events: ReadonlyArray<Event>, tags: ReadonlyArray<Event['_tag']>) => {
    const first = events.findIndex(({ _tag }) => _tag === 'Died')
    return first === -1 ? [] : events.slice(first).filter(({ _tag }) => tags.includes(_tag)).map(({ _tag }) => _tag)
  }

  test('from the first defect on, the run applies no message', async () => {
    await property(({ events }) => expect(sinceFirstDefect(events, ['Applied', 'Ignored'])).toEqual([]))
  }, 120_000)

  test('from the first defect on, the run starts no command', async () => {
    await property(({ events }) => expect(sinceFirstDefect(events, ['CommandStarted'])).toEqual([]))
  }, 120_000)

  test('a tick or the end of a subscription reaches update only while the session that sent it listens', async () => {
    await property(({ events }) => {
      const late = applied(events).filter(({ message, before }) => {
        if (message._tag !== 'Rows' || (message.message._tag !== 'Tick' && message.message._tag !== 'Finished')) {
          return false
        }
        const { born, session } = message.message
        const row = Opt.getOrUndefined(Arr.findFirst(before.rows, (entry) => entry.id === message.id))?.row
        return !(row?.listening === true && row.born === born && row.session === session)
      })
      expect(late).toEqual([])
    })
  }, 120_000)

  test('a subscription that ends is heard ending, and never starts again while its key stays', async () => {
    await property(({ events, settled }) => {
      const starts = new Map<string, number>()
      for (const event of events) {
        if (event._tag === 'Acquired') starts.set(event.listener, (starts.get(event.listener) ?? 0) + 1)
      }
      expect(Array.from(starts).filter(([, count]) => count > 1)).toEqual([])
      if (deaths(events).length > 0) return
      const heard = new Set(applied(events).flatMap(({ message }) =>
        message._tag === 'Rows' && message.message._tag === 'Finished'
          ? [listener(message.message.born, message.message.session)]
          : []
      ))
      const ended = events.slice(0, settled).flatMap((event) => event._tag === 'Ended' ? [event.listener] : [])
      const listening = listeners(finalState(events))
      expect(ended.filter((key) => listening.includes(key) && !heard.has(key))).toEqual([])
    })
  }, 120_000)

  test('the subscriptions one message stops are released together, before the next message and any start', async () => {
    await property(({ events }) => {
      const broken: Array<string> = []
      events.forEach((event, index) => {
        if (event._tag === 'Acquired') {
          // A key that comes back finds the subscription it had before released.
          const before = events.slice(0, index).flatMap((earlier) =>
            earlier._tag === 'Acquired' && earlier.id === event.id ? [earlier.listener] : []
          )
          const done = released(events, index)
          for (const key of before) if (!done.has(key)) broken.push(`${event.listener} started before ${key} ended`)
        }
        if (event._tag !== 'Applied') return
        const { stopped, waiting } = stoppedAt(events, index, event.applied)
        const rest = events.slice(index + 1)
        const next = rest.findIndex(({ _tag }) => _tag === 'Applied' || _tag === 'Ignored')
        if (next !== -1) {
          const done = released(rest, next)
          for (const key of stopped) if (!done.has(key)) broken.push(`a message came before ${key} ended`)
        }
        const firstEnd = rest.findIndex((later) => later._tag === 'Released' && waiting.has(later.listener))
        if (firstEnd === -1) return
        const begun = new Set(rest.slice(0, firstEnd).flatMap((later) =>
          later._tag === 'Releasing' ? [later.listener] : []
        ))
        for (const key of waiting) if (!begun.has(key)) broken.push(`${key} began releasing after another ended`)
      })
      expect(broken).toEqual([])
    })
  }, 120_000)

  test('once everything has happened, the subscriptions holding resources are those of listening rows', async () => {
    await property(({ events, settled }) => {
      if (deaths(events).length > 0) return
      const ended = new Set(events.slice(0, settled).flatMap((event) => event._tag === 'Ended' ? [event.listener] : []))
      expect(Array.from(holding(events, settled)).sort()).toEqual(
        listeners(finalState(events)).filter((key) => !ended.has(key)),
      )
    })
  }, 120_000)

  test('once the run has ended, every subscription has released what it acquired', async () => {
    await property(({ events }) => {
      const acquired = events.flatMap((event) => event._tag === 'Acquired' ? [event.listener] : [])
      const done = released(events, events.length)
      expect(acquired.filter((key) => !done.has(key))).toEqual([])
    })
  }, 120_000)

  test('once everything has happened, every operation has ended and the last frame shows the last state', async () => {
    await property(({ events, drawn }) => {
      if (deaths(events).length > 0) return
      const final = finalState(events)
      expect(final.rows.filter(({ row }) => row.working)).toEqual([])
      expect(drawn?.rows.map(({ id, row }) => [id, row.working])).toEqual(
        final.rows.map(({ id, row }) => [id, row.working]),
      )
    })
  }, 120_000)
})
