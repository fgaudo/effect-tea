import { describe, expect, test } from 'bun:test'
import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as HashMap from 'effect/HashMap'
import * as Logger from 'effect/Logger'
import * as Opt from 'effect/Option'
import * as References from 'effect/References'
import type * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import type * as Tracer from 'effect/Tracer'
import fc from 'fast-check'
import { idle, prioritizedSchedules, unpreempted } from '../test/scheduled.ts'
import { parent } from './compose.ts'
import { type DefectSite, ProgramDefect } from './defect.ts'
import { type Dispatch, dispatchTo } from './dispatch.ts'
import type { Applied, Ignored } from './engine.ts'
import type { Program } from './program.ts'
import { type Frame, run } from './run.ts'
import type { Subscription } from './subscription.ts'
import { reject } from './update.ts'

// A list of rows by id, from a pool of two so that ids come back. Each row is born anew when it is added, works
// with a command that acquires something and completes when the scheduler says (working mutes the row, so that one
// step both stops a subscription and starts a command), can be poked, which leaves it as it is, and, while it
// listens, hears two ticks from a subscription that then stays open, ends with a last message, or dies; each time it
// starts listening again is a new session. The list can clear all its rows at once, stopping their subscriptions
// together. What the user does, when commands complete, when ticks arrive and when releases end is all in the hands
// of the scheduler of the tests (`test/scheduled.ts`), which may also make any fiber yield between two of its steps;
// what is drawn beside it (`Fates`) says which subscriptions end or die, which releases take time
// or die, which commands die, which steps `onApplied` and `onIgnored` hold or die in, and whether the renderer, which
// acquires something too, dies, and takes time to release what it holds, which is when a run that died still has
// fibers under way. To die is to die of a defect, or to interrupt oneself, which the run takes for one. The run runs
// in a span of whoever runs it, with debug logs enabled, and the program logs and opens spans of its own.
type Id = 1 | 2
const ids: ReadonlyArray<Id> = [1, 2]

type RowMessage = Data.TaggedEnum<{
  WorkClicked: object
  Done: { born: number; attempt: number }
  MuteClicked: object
  ListenClicked: object
  Poked: object
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
  poke: RowMessage
}>

type ListState = Readonly<{ rows: ReadonlyArray<Readonly<{ id: Id; row: Row }>>; born: number }>
type Own = Readonly<{ _tag: 'Add'; id: Id }> | Readonly<{ _tag: 'Remove'; id: Id }> | Readonly<{ _tag: 'Clear' }>

/** How a fiber of the program dies: of a defect, or interrupting itself, at once or by joining an interrupted fiber. */
type Death = 'defect' | 'interrupts' | 'joins'

/** How a subscription goes on after its two ticks: open, ending with a last message, or dying. */
type Ending = 'stays' | 'ends' | Death

/** How a subscription's release goes: at once, when the scheduler says, or dying when the scheduler says. */
type Release = 'quick' | 'slow' | 'dies'

/** How a command ends when the scheduler says: with its answer, or dying. */
type Answer = 'answers' | Death

/** How `onApplied` or `onIgnored` hears a step: at once, until the scheduler says, or dying. */
type Hearing = 'quick' | 'slow' | Death

/** What is drawn beside the scheduler, each list read in a loop by a number that only the program's data gives. */
type Fates = Readonly<{
  endings: ReadonlyArray<Ending>
  releases: ReadonlyArray<Release>
  answers: ReadonlyArray<Answer>
  /** How `onApplied` hears each step, and how `onIgnored` does: rejections are fewer, and die more often. */
  hearings: ReadonlyArray<Hearing>
  ignorings: ReadonlyArray<Hearing>
  /**
   * How many turns of the scheduler each wait of the program lasts: a tick, an answer, a release or a hearing that
   * waits, or the renderer. So a wait that began first may end last, as a promise released in any order would.
   */
  waits: ReadonlyArray<number>
  rendererReleasesSlowly: boolean
  /** Whether the renderer dies, when the scheduler says. */
  rendererDies: Opt.Option<Death>
}>

const fateOf = <A>(fates: ReadonlyArray<A>, index: number): A => fates[index % fates.length] as A

const death = fc.constantFrom<Death>('defect', 'interrupts', 'joins')

const fates: fc.Arbitrary<Fates> = fc.record({
  endings: fc.array(
    fc.oneof(
      { arbitrary: fc.constant<Ending>('stays'), weight: 3 },
      { arbitrary: fc.constant<Ending>('ends'), weight: 3 },
      { arbitrary: death, weight: 1 },
    ),
    { minLength: 1, maxLength: 6 },
  ),
  releases: fc.array(
    fc.oneof(
      { arbitrary: fc.constant<Release>('quick'), weight: 4 },
      { arbitrary: fc.constant<Release>('slow'), weight: 4 },
      { arbitrary: fc.constant<Release>('dies'), weight: 1 },
    ),
    { minLength: 1, maxLength: 8 },
  ),
  answers: fc.array(
    fc.oneof({ arbitrary: fc.constant<Answer>('answers'), weight: 4 }, { arbitrary: death, weight: 3 }),
    { minLength: 1, maxLength: 8 },
  ),
  hearings: fc.array(
    fc.oneof(
      { arbitrary: fc.constant<Hearing>('quick'), weight: 15 },
      { arbitrary: fc.constant<Hearing>('slow'), weight: 15 },
      { arbitrary: death, weight: 1 },
    ),
    { minLength: 1, maxLength: 6 },
  ),
  ignorings: fc.array(
    fc.oneof(
      { arbitrary: fc.constant<Hearing>('quick'), weight: 4 },
      { arbitrary: fc.constant<Hearing>('slow'), weight: 4 },
      { arbitrary: death, weight: 1 },
    ),
    { minLength: 1, maxLength: 6 },
  ),
  waits: fc.array(fc.integer({ min: 1, max: 16 }), { minLength: 1, maxLength: 8 }),
  rendererReleasesSlowly: fc.boolean(),
  rendererDies: fc.oneof(
    { arbitrary: fc.constant(Opt.none<Death>()), weight: 12 },
    { arbitrary: death.map(Opt.some), weight: 1 },
  ),
})

/** Where a fiber of the scenario dies. */
type Where = Extract<DefectSite, 'subscription' | 'command' | 'render' | 'onApplied' | 'onIgnored'>

/** What a holder other than a subscription is called in the events: a command by its name, or the renderer. */
type Holder = `command ${string}` | 'renderer'

/** What happened, in the order it happened, as the program's own code, the renderer and the options saw it. */
type Event =
  | Readonly<{ _tag: 'Updated' }>
  | Readonly<{ _tag: 'Applied'; applied: Applied<ListState, Message, unknown> }>
  | Readonly<{ _tag: 'Ignored'; ignored: Ignored<ListState, Message> }>
  | Readonly<{ _tag: 'CommandStarted'; command: string }>
  | Readonly<{ _tag: 'Acquired'; listener: string; id: Id }>
  | Readonly<{ _tag: 'Releasing'; listener: string; quick: boolean }>
  | Readonly<{ _tag: 'Released'; listener: string }>
  | Readonly<{ _tag: 'Ended'; listener: string }>
  | Readonly<{ _tag: 'Took'; holder: Holder }>
  | Readonly<{ _tag: 'Gave'; holder: Holder }>
  | Readonly<{ _tag: 'Interrupted'; holder: Holder }>
  | Readonly<{ _tag: 'Drew'; frame: Frame<Model, Message> }>
  | Readonly<{ _tag: 'Spanned'; parent: Opt.Option<string> }>
  // `released`: what died is a release, whose defect counts only once the scope it is in has closed (README), which
  // the scenario does not see.
  | Readonly<{ _tag: 'Died'; where: Where; how: Death; defect: string; released: boolean }>

const listener = (born: number, session: number) => `${born}.${session}`

/** What a self-interruption is called among the defects: the run wraps it in an error of its own. */
const interruptedItself = 'interrupted itself'

/** A death decided, by the fiber that decides it. */
type Decision = Readonly<{ where: Where; how: Death; fiber: number }>

/** The deaths decided in a scenario, by the name of what dies, which is the defect it dies of. */
const decisions = new WeakMap<ReadonlyArray<Event>, Map<string, Decision>>()

const decidedIn = (events: ReadonlyArray<Event>) => {
  let decided = decisions.get(events)
  if (decided === undefined) decisions.set(events, decided = new Map())
  return decided
}

/**
 * Dies as `how` says, as `defect`, which names what dies: at once, or by joining a fiber it has interrupted. The
 * fibers of a run ignore their interruptions: one that came from the program itself would otherwise leave a command
 * without its answer, a subscription ended without its last message, and the run going on. It decides the death
 * alone: `endsAs` records it, where the effect the run gets ends.
 */
const dies = (events: Array<Event>, where: Where, how: Death, defect: string): Effect.Effect<never> => {
  const now = (dying: Effect.Effect<never>) =>
    unpreempted.pipe(Effect.andThen(Effect.withFiber((fiber) => {
      decidedIn(events).set(defect, { where, how, fiber: fiber.id })
      return dying
    })))
  switch (how) {
    case 'defect':
      return now(Effect.die(defect))
    case 'interrupts':
      return now(Effect.interrupt)
    case 'joins':
      return Effect.gen(function*() {
        const interrupted = yield* Effect.forkChild(Effect.never)
        yield* Fiber.interrupt(interrupted)
        return yield* now(Fiber.join(interrupted))
      })
  }
}

/**
 * Records `Died` where the effect the run gets for `name` ends with the death decided for it, its defect or an
 * interruption by the fiber that decided it, and lets the fiber yield no more until it ends: the run learns of the
 * death there, and the scheduler would let another fiber run in between. A death decided earlier is no death if the
 * effect ends otherwise: one in a fiber of its own, as in a race, that the run interrupts before its effect learns
 * of it, or a failure on its way out that an interruption by the run takes the place of, at a yield.
 */
const endsAs = (events: Array<Event>, name: string) => <A, E>(exit: Exit.Exit<A, E>): Effect.Effect<void> =>
  Effect.suspend(() => {
    const decided = decidedIn(events).get(name)
    if (decided === undefined || Exit.isSuccess(exit)) return Effect.void
    const { where, how, fiber } = decided
    const died = exit.cause.reasons.some((reason) =>
      how === 'defect'
        ? Cause.isDieReason(reason) && reason.defect === name
        : Cause.isInterruptReason(reason) && reason.fiberId === fiber
    )
    if (!died) return Effect.void
    return unpreempted.pipe(Effect.andThen(Effect.sync(() => {
      events.push({
        _tag: 'Died',
        where,
        how,
        defect: how === 'defect' ? name : interruptedItself,
        released: name.startsWith('release of '),
      })
    })))
  })

/** Opens a span of the program's own, and records the span it is a child of. */
const spanned = (events: Array<Event>, name: string) =>
  Effect.orDie(Effect.currentSpan).pipe(
    Effect.map((span) => events.push({ _tag: 'Spanned', parent: Opt.map(span.parent, ({ spanId }) => spanId) })),
    Effect.withSpan(name),
  )

/** Acquires something for `holder`, and releases it when the scope ends, after `release`. */
const holds = (events: Array<Event>, holder: Holder, release: Effect.Effect<void> = Effect.void) =>
  Effect.acquireRelease(
    Effect.sync(() => events.push({ _tag: 'Took', holder })),
    () => release.pipe(Effect.andThen(Effect.sync(() => events.push({ _tag: 'Gave', holder })))),
  )

/** A point where the scheduler of the tests picks which fiber runs next, the one waiting among them. */
const later = <A>(value: A) => Effect.as(Effect.yieldNow, value)

/** A wait of the program, of as many turns as `fates` says for `index`, which only the program's data gives. */
const waits = (fates: Fates, index: number) =>
  Effect.replicateEffect(later(undefined), fateOf(fates.waits, index), { discard: true })

const makeList = (fates: Fates, events: Array<Event>) => {
  const ticking = (id: Id, born: number, session: number): Subscription<RowMessage, never> => {
    const key = listener(born, session)
    const index = born * 31 + session
    const tick = (nth: number) =>
      Channel.fromEffect(
        spanned(events, 'Tick').pipe(
          Effect.andThen(waits(fates, index * 4 + nth)),
          Effect.as(RowMessage.Tick({ born, session })),
        ),
      )
    const ticks = tick(0).pipe(Channel.concatWith(() => tick(1)))
    const released = Effect.sync(() => events.push({ _tag: 'Released', listener: key }))
    const release = Effect.suspend(() => {
      const fate = fateOf(fates.releases, index)
      events.push({ _tag: 'Releasing', listener: key, quick: fate === 'quick' })
      switch (fate) {
        case 'quick':
          return released
        case 'slow':
          return waits(fates, index * 4 + 2).pipe(Effect.andThen(released))
        case 'dies':
          return waits(fates, index * 4 + 2).pipe(
            Effect.andThen(released),
            Effect.andThen(dies(events, 'subscription', 'defect', `release of ${key}`)),
            Effect.onExit(endsAs(events, `release of ${key}`)),
          )
      }
    })
    const ending = fateOf(fates.endings, index)
    const body: Subscription<RowMessage, never> = ending === 'stays'
      ? ticks.pipe(Channel.concatWith(() => Channel.never))
      : ending === 'ends'
      ? ticks.pipe(Channel.mapDoneEffect(() =>
        Effect.sync(() => {
          events.push({ _tag: 'Ended', listener: key })
          return RowMessage.Finished({ born, session })
        })
      ))
      : ticks.pipe(Channel.concatWith(() =>
        Channel.unwrap<RowMessage, never, RowMessage, unknown, unknown, unknown, never, never, never>(
          waits(fates, index * 4 + 3).pipe(
            Effect.andThen(dies(events, 'subscription', ending, `subscription ${key}`)),
          ),
        )
      ))
    return Channel.unwrap(
      Effect.acquireRelease(Effect.sync(() => events.push({ _tag: 'Acquired', listener: key, id })), () => release)
        .pipe(Effect.tap(() => Effect.logDebug('Listening', key)), Effect.as(body)),
    ).pipe(Channel.onExit(endsAs(events, `subscription ${key}`)))
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
  const row: Program<
    { state: Row; model: RowModel; message: RowMessage; command: RowCommand; services: Scope.Scope }
  > = {
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
        // Accepted, and the very same state: its parent's stays the same too, and no frame is drawn for it.
        case 'Poked':
          return { state }
        // Accept any tick, and any end, muted or not: whether one of a stopped subscription can arrive is what the
        // test checks.
        case 'Tick':
          return { state: { ...state, heard: state.heard + 1 } }
        case 'Finished':
          return { state: { ...state, finished: true } }
      }
    },
    // Recorded as the run calls it, which it may do only while it has not died: what the effect it returns does is the
    // program's, and may come after a death.
    runCommand: (command) => {
      const name = `${command.born}.${command.attempt}`
      events.push({ _tag: 'CommandStarted', command: name })
      return Effect.suspend(() => {
        const holder: Holder = `command ${name}`
        const answer = fateOf(fates.answers, command.born * 7 + command.attempt)
        return holds(events, holder).pipe(
          Effect.andThen(Effect.logDebug('Working', name)),
          Effect.andThen(spanned(events, 'Work')),
          Effect.andThen(waits(fates, command.born * 7 + command.attempt)),
          Effect.andThen(
            answer === 'answers'
              ? Effect.succeedSome(RowMessage.Done({ born: command.born, attempt: command.attempt }))
              : dies(events, 'command', answer, `command ${name}`),
          ),
          Effect.onInterrupt(() => Effect.sync(() => events.push({ _tag: 'Interrupted', holder }))),
          Effect.onExit(endsAs(events, holder)),
        )
      })
    },
    // The same key in every session: only the engine tells a session from the one before.
    subscriptions: (state) =>
      state.listening ? HashMap.make(['ticks', ticking(state.id, state.born, state.session)]) : HashMap.empty(),
    makeModel: (state) => ({
      working: state.working,
      work: state.working ? Opt.none() : Opt.some(RowMessage.WorkClicked()),
      mute: state.listening ? Opt.some(RowMessage.MuteClicked()) : Opt.none(),
      listen: state.listening ? Opt.none() : Opt.some(RowMessage.ListenClicked()),
      poke: RowMessage.Poked(),
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
 * controls drawn, so that every act does something; `twice` is a double tap; `pause` is how many turns of the
 * scheduler the user waits before, so that a frame may catch up with the last act, or not.
 */
type Act = Readonly<{ pick: number; twice: boolean; pause: number }>

const act: fc.Arbitrary<Act> = fc.record({ pick: fc.nat(), twice: fc.boolean(), pause: fc.integer({ min: 1, max: 4 }) })

/** What a control does with the frame's dispatch: a row's sends through the row's own dispatch, as its view would. */
type Control = (dispatch: Dispatch<Message>) => Effect.Effect<void>

/** Every control the frame shows: a user can only use what is drawn. */
const controls = (model: Model): ReadonlyArray<Control> => [
  ...model.add.map((add): Control => (dispatch) => dispatch(add)),
  ...Opt.toArray(model.clear).map((clear): Control => (dispatch) => dispatch(clear)),
  ...model.rows.flatMap(({ id, remove, row }) => [
    (dispatch: Dispatch<Message>) => dispatch(remove),
    ...[...Arr.getSomes([row.work, row.mute, row.listen]), row.poke].map((message): Control => (dispatch) =>
      dispatchTo(dispatch, 'Rows', id)(message)
    ),
  ]),
]

const controlFor = (model: Model, { pick }: Act): Opt.Option<Control> => {
  const drawn = controls(model)
  return Arr.get(drawn, pick % Math.max(drawn.length, 1))
}

/**
 * Runs `acts` against the list, in a span of its own with debug logs enabled, and what was seen once nothing is under
 * way but what waits forever (`settled`, the number of events by then), then once whoever runs it has interrupted it
 * and it has ended: the span it ran in, the models made, and the frames whose model was read. It is run under the
 * scheduler of the tests, which picks every order: each act waits for its turn as a `later` does.
 */
const runScenario = Effect.fnUntraced(function*(fates: Fates, acts: ReadonlyArray<Act>) {
  const events: Array<Event> = []
  const list = makeList(fates, events)
  let made = 0
  const counted: List = {
    ...list,
    // Recorded as the run calls `update`, which is what it applies: `onApplied` hears a message later, and may hear
    // after a defect one whose `update` was called before it.
    update: (message) => {
      events.push({ _tag: 'Updated' })
      return list.update(message)
    },
    makeModel: (state) => {
      made += 1
      return list.makeModel(state)
    },
  }
  let latest: Frame<Model, Message> | undefined
  const read = new Set<Frame<Model, Message>>()
  const modelOf = (frame: Frame<Model, Message>) => {
    read.add(frame)
    return frame.model
  }
  let heard = 0
  const hearing = (event: Event) =>
    Effect.suspend(() => {
      events.push(event)
      heard += 1
      const where = event._tag === 'Applied' ? 'onApplied' : 'onIgnored'
      const fate = fateOf(where === 'onApplied' ? fates.hearings : fates.ignorings, heard)
      const name = `${where} ${heard}`
      return Effect.logDebug('Heard', where).pipe(
        Effect.andThen(
          fate === 'quick'
            ? Effect.void
            : fate === 'slow'
            ? waits(fates, heard)
            : waits(fates, heard).pipe(Effect.andThen(dies(events, where, fate, name))),
        ),
        Effect.onExit(endsAs(events, name)),
      )
    })
  const drawing = (frames: Stream.Stream<Frame<Model, Message>>) =>
    Stream.runForEach(frames, (frame) =>
      Effect.sync(() => {
        events.push({ _tag: 'Drew', frame })
        latest = frame
      }))
  const renderer = (frames: Stream.Stream<Frame<Model, Message>>) =>
    holds(events, 'renderer', fates.rendererReleasesSlowly ? waits(fates, 0) : Effect.void).pipe(
      Effect.andThen(Effect.logDebug('Drawing')),
      Effect.andThen(Opt.match(fates.rendererDies, {
        onNone: () => drawing(frames),
        onSome: (how) =>
          Effect.raceFirst(
            drawing(frames),
            waits(fates, 1).pipe(Effect.andThen(dies(events, 'render', how, 'the renderer'))),
          ),
      })),
      Effect.onInterrupt(() => Effect.sync(() => events.push({ _tag: 'Interrupted', holder: 'renderer' }))),
      Effect.onExit(endsAs(events, 'the renderer')),
    )
  let caller: Tracer.Span | undefined
  const fiber = yield* Effect.forkChild(
    Effect.gen(function*() {
      caller = yield* Effect.orDie(Effect.currentSpan)
      yield* run(counted, renderer, {
        onApplied: (applied) => hearing({ _tag: 'Applied', applied }),
        onIgnored: (ignored) => hearing({ _tag: 'Ignored', ignored }),
      })
    }).pipe(
      Effect.withSpan('caller'),
      // Down to debug: the run's own logs, of each message and each subscription, are among them.
      Effect.provideService(References.MinimumLogLevel, 'Debug'),
      Effect.provide(Logger.layer([Logger.tracerLogger])),
    ),
  )
  // The user acts on what is drawn: before the first frame, or once the run has ended, an act does nothing.
  while (latest === undefined && fiber.pollUnsafe() === undefined) yield* later(undefined)
  for (const act of acts) {
    for (let turn = 0; turn < act.pause; turn++) yield* later(undefined)
    const control = latest === undefined ? Opt.none() : controlFor(modelOf(latest), act)
    if (latest === undefined || Opt.isNone(control)) continue
    yield* control.value(latest.dispatch)
    if (act.twice) yield* control.value(latest.dispatch)
  }
  yield* idle
  const settled = events.length
  const drawn = latest === undefined ? undefined : modelOf(latest)
  yield* Fiber.interrupt(fiber)
  const exit = yield* Fiber.await(fiber)
  return { exit, events, settled, drawn, made, read: read.size, caller }
})

type Outcome = Effect.Success<ReturnType<typeof runScenario>>

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

/** The holders that have given back what they took within `events`. */
const given = (events: ReadonlyArray<Event>) =>
  new Set(events.flatMap((event) => event._tag === 'Gave' ? [event.holder] : []))

/**
 * The subscriptions that the accepted message of event `index` stops while they hold what they acquired, and those
 * of them whose release waits: a quick one ends before the next fiber runs, so only those that wait tell releases
 * made together from releases made in turn.
 */
const stoppedAt = (events: ReadonlyArray<Event>, index: number, applied: Applied<ListState, Message, unknown>) => {
  const held = holding(events, index)
  const stopped = listeners(applied.before).filter((key) => held.has(key) && !listeners(applied.after).includes(key))
  // One that ends by itself releases in its own fiber, which may be before the step stops the others.
  const ended = new Set(events.flatMap((event) => event._tag === 'Ended' ? [event.listener] : []))
  const waiting = new Set(events.slice(index + 1).flatMap((later) =>
    later._tag === 'Releasing' && !later.quick && stopped.includes(later.listener) && !ended.has(later.listener)
      ? [later.listener]
      : []
  ))
  return { stopped, waiting }
}

/** The answer of a command that an event shows reaching update, accepted or not, by the command's name. */
const answerOf = (event: Event) => {
  const message = event._tag === 'Applied'
    ? event.applied.message
    : event._tag === 'Ignored'
    ? event.ignored.message
    : undefined
  return message?._tag === 'Rows' && message.message._tag === 'Done'
    ? Opt.some(`command ${message.message.born}.${message.message.attempt}` as const)
    : Opt.none()
}

/** Whether two releases that wait ended in the other order than they began: the one that began later ended first. */
const releaseOvertaken = (events: ReadonlyArray<Event>) => {
  const releasing = new Map<string, number>()
  const begun: Array<number> = []
  events.forEach((event, index) => {
    if (event._tag === 'Releasing' && !event.quick) releasing.set(event.listener, index)
    if (event._tag === 'Released' && releasing.has(event.listener)) begun.push(releasing.get(event.listener) ?? 0)
  })
  return begun.some((start, index) => begun.slice(index + 1).some((later) => later < start))
}

/** Whether a defect is the error the run wraps a self-interruption in: its cause interrupts, and does nothing else. */
const isSelfInterruption = (defect: unknown) =>
  defect instanceof Error && Cause.isCause(defect.cause) && Cause.hasInterruptsOnly(defect.cause)

const defects = (exit: Exit.Exit<unknown>) =>
  Exit.isFailure(exit)
    ? exit.cause.reasons.filter(Cause.isDieReason).map(({ defect }) =>
      defect instanceof ProgramDefect
        ? `${defect.where}: ${isSelfInterruption(defect.cause) ? interruptedItself : String(defect.cause)}`
        : defect
    )
    : []

describe('interleavings of the user, commands and subscriptions', () => {
  const depth = 3

  // fast-check draws the scenario and the seed of the prioritized schedules it runs under, one or more from that seed
  // on, and a failure names both: fast-check's replays the scenario, the strategy's its order.
  const property = (
    check: (outcome: Outcome) => void,
    { schedules = 1, ...options }: Readonly<{ numRuns?: number; seed?: number; schedules?: number }> = {},
  ) =>
    fc.assert(
      fc.property(fates, fc.array(act, { maxLength: 12 }), fc.nat(), (fates, acts, seed) => {
        prioritizedSchedules(runScenario(fates, acts), { runs: schedules, depth, first: seed }, (exit) => {
          if (Exit.isFailure(exit)) throw new Error(`the scenario failed: ${Cause.pretty(exit.cause)}`)
          check(exit.value)
        })
      }),
      { numRuns: 60, ...options },
    )

  // The other properties would hold for scenarios that did nothing: the scenarios reach every message, every way of
  // dying in every place, and what each property checks. Listening again takes three acts in a row (add, mute,
  // listen), and stopping two subscriptions at once three too (add, add, clear), with two releases that wait, and a
  // command dies only once one has started, before anything else has died, which some runs of 60 scenarios miss. The
  // rarest, two releases that wait, comes in about twelve scenarios of 2,000, and a release that overtakes another,
  // which only the waits' drawn lengths give, in about twenty: 2,000 make a miss rare. What is missing
  // shows only once every scenario has run, after fast-check could name one, so the failure names the seed that
  // makes them again.
  test('the scenarios reach every message, every way of dying, and what each property checks', () => {
    const seed = Math.floor(Math.random() * 2 ** 31)
    const reached = new Set<string>()
    property(({ events, made, read }) => {
      events.forEach((event, index) => {
        if (Opt.isSome(answerOf(event)) && given(events.slice(0, index)).has(Opt.getOrThrow(answerOf(event)))) {
          reached.add('an answer after its release')
        }
        if (event._tag === 'Spanned') reached.add('a span of the program')
        if (event._tag !== 'Applied') return
        const { message } = event.applied
        reached.add(message._tag === 'Rows' ? message.message._tag : message._tag)
        if (event.applied.before === event.applied.after) reached.add('the very same state')
        if (stoppedAt(events, index, event.applied).waiting.size > 1) reached.add('two waiting releases')
      })
      for (const event of events) if (event._tag === 'Died') reached.add(`${event.where} ${event.how}`)
      if (events.some(({ _tag }) => _tag === 'Ignored')) reached.add('rejected')
      const renderer = events.flatMap((event, index) =>
        event._tag === 'Interrupted' && event.holder === 'renderer' ? [index] : []
      )
      if (renderer.length > 0 && given(events.slice(renderer[0])).has('renderer')) {
        reached.add('a renderer released once interrupted')
      }
      if (made > 0 && read < events.filter(({ _tag }) => _tag === 'Drew').length) reached.add('a frame never read')
      if (releaseOvertaken(events)) reached.add('a release overtaken')
    }, { numRuns: 2000, seed })
    const places: ReadonlyArray<Where> = ['command', 'subscription', 'render', 'onApplied', 'onIgnored']
    const missing = [
      'Add',
      'Clear',
      'Done',
      'Finished',
      'ListenClicked',
      'MuteClicked',
      'Poked',
      'Remove',
      'Tick',
      'WorkClicked',
      ...places.flatMap((where) => (['defect', 'interrupts', 'joins'] as const).map((how) => `${where} ${how}`)),
      'rejected',
      'two waiting releases',
      'the very same state',
      'an answer after its release',
      'a renderer released once interrupted',
      'a frame never read',
      'a span of the program',
      'a release overtaken',
    ].filter((tag) => !reached.has(tag))
    if (missing.length > 0) throw new Error(`No scenario of seed ${seed} reached ${missing.join(', ')}`)
  }, 180_000)

  test('a rejected message leaves the state as it was, and an accepted one starts from the one before', () => {
    property(({ events }) => {
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

  test('the defects of the cause are those that happened, self-interruptions too, each where, in order', () => {
    property(({ exit, events }) => {
      expect(defects(exit)).toEqual(deaths(events))
    })
  }, 120_000)

  /**
   * What the run did, of the events `tags` name, from the first defect on. A release that dies is left out: it counts
   * once its scope has closed, which the scenario does not see.
   */
  const sinceFirstDefect = (events: ReadonlyArray<Event>, tags: ReadonlyArray<Event['_tag']>) => {
    const first = events.findIndex((event) => event._tag === 'Died' && !event.released)
    return first === -1 ? [] : events.slice(first).filter(({ _tag }) => tags.includes(_tag)).map(({ _tag }) => _tag)
  }

  // The windows between a check of the register of deaths and the call it guards are few among the orders, and this
  // fails only on one of them: taken out, the check in the thunk of `update` was found in 205 scenarios of four
  // schedules on average, the one before `runCommand` in 62. 1,500 make a miss rare.
  test('from the first defect on, the run applies no message and starts no command', () => {
    property(
      ({ events }) => expect(sinceFirstDefect(events, ['Updated', 'CommandStarted'])).toEqual([]),
      { numRuns: 1500, schedules: 4 },
    )
  }, 120_000)

  test('a tick or the end of a subscription reaches update only while the session that sent it listens', () => {
    property(({ events }) => {
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

  test('a subscription that ends is heard ending, and never starts again while its key stays', () => {
    property(({ events, settled }) => {
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

  test('the subscriptions one message stops are released together, before the next message and any start', () => {
    property(({ events }) => {
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

  test('a command has released what it acquired before its answer reaches update', () => {
    property(({ events }) => {
      const early = events.flatMap((event, index) =>
        Opt.toArray(answerOf(event)).filter((command) => !given(events.slice(0, index)).has(command))
      )
      expect(early).toEqual([])
    })
  }, 120_000)

  test('the renderer releases what it acquired only once it has stopped, and draws nothing after', () => {
    property(({ events }) => {
      const gave = events.findIndex((event) => event._tag === 'Gave' && event.holder === 'renderer')
      if (gave === -1) return
      const before = events.slice(0, gave)
      expect(before.some((event) =>
        (event._tag === 'Interrupted' && event.holder === 'renderer') ||
        (event._tag === 'Died' && event.where === 'render')
      )).toBe(true)
      expect(events.slice(gave).filter(({ _tag }) => _tag === 'Drew')).toEqual([])
    })
  }, 120_000)

  test('once everything has happened, the subscriptions holding resources are those of listening rows', () => {
    property(({ events, settled }) => {
      if (deaths(events).length > 0) return
      const ended = new Set(events.slice(0, settled).flatMap((event) => event._tag === 'Ended' ? [event.listener] : []))
      expect(Array.from(holding(events, settled)).sort()).toEqual(
        listeners(finalState(events)).filter((key) => !ended.has(key)),
      )
    })
  }, 120_000)

  test('once the run has ended, the subscriptions, the commands and the renderer have released all', () => {
    property(({ events }) => {
      const acquired = events.flatMap((event) => event._tag === 'Acquired' ? [event.listener] : [])
      const done = released(events, events.length)
      expect(acquired.filter((key) => !done.has(key))).toEqual([])
      const took = events.flatMap((event) => event._tag === 'Took' ? [event.holder] : [])
      const gave = given(events)
      expect(took.filter((holder) => !gave.has(holder))).toEqual([])
    })
  }, 120_000)

  test('once everything has happened, every operation has ended and the last frame shows the last state', () => {
    property(({ events, drawn }) => {
      if (deaths(events).length > 0) return
      const final = finalState(events)
      expect(final.rows.filter(({ row }) => row.working)).toEqual([])
      expect(drawn?.rows.map(({ id, row }) => [id, row.working])).toEqual(
        final.rows.map(({ id, row }) => [id, row.working]),
      )
    })
  }, 120_000)

  test('what the run logs stays out of the span of whoever runs it, the parent of the spans opened in it', () => {
    property(({ events, caller }) => {
      expect((caller as Tracer.NativeSpan | undefined)?.events).toEqual([])
      const parents = events.flatMap((event) => event._tag === 'Spanned' ? [Opt.getOrUndefined(event.parent)] : [])
      expect(parents.filter((parent) => parent !== caller?.spanId)).toEqual([])
    })
  }, 120_000)

  test('a model is made once for each frame whose model is read, and the very same state draws no frame', () => {
    property(({ events, made, read }) => {
      expect(made).toBe(read)
      // The first frame is the state the run starts from.
      const states = 1 + applied(events).filter(({ before, after }) => before !== after).length
      expect(events.filter(({ _tag }) => _tag === 'Drew').length).toBeLessThanOrEqual(states)
    })
  }, 120_000)
})

