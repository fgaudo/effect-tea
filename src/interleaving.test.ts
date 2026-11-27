import { describe, expect, test } from "bun:test"
import * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as HashMap from "effect/HashMap"
import * as Logger from "effect/Logger"
import * as Opt from "effect/Option"
import * as References from "effect/References"
import type * as Scope from "effect/Scope"
import type * as Tracer from "effect/Tracer"
import fc from "fast-check"
import { collectGarbage } from "../test/gc.test_helper.ts"
import { idle, prioritizedSchedules, unpreempted } from "../test/scheduled.test_scheduler.ts"
import { childById, type Instance, type Kept, program } from "./compose.ts"
import { type DefectSite, ProgramDefect } from "./defect.ts"
import { type Dispatch, forwardTo } from "./dispatch.ts"
import type { Applied, Ignored } from "./engine.ts"
import type { Program } from "./program.ts"
import { start } from "./run.ts"
import type { Subscription } from "./subscription.ts"
import { reject } from "./update.ts"

// The search of the interleavings, in which a dispatch applies its message before it returns. Run apart:
// `bun run interleavings`.
// The program is a list of rows by id, from a pool of two so that ids come back, which starts with none, one or both of
// them. Each row is a child that the library keeps, started anew from its flags when it is added, so that an answer of
// its command may arrive once the row has been removed and added again at its id. It works with a command that acquires
// something and completes when the scheduler says (working mutes the row, so that one step both stops a subscription
// and starts a command), can be poked, which leaves it as it is, and, while it listens, hears two ticks from a
// subscription that then stays open, ends with a last message, or dies; each time it starts listening again is a new
// session. The list can clear all its rows at once, stopping their subscriptions together. The list has a field, a note
// or a title, which a swap turns into the other, the text kept: what is typed names the field it is typed into, and is
// rejected once the field is the other. The user types into the element of that field, which shows what the current
// model holds and sends the message that it holds, filled with the text, as a controlled element does, or sends what is
// typed from a model read before, as its element would have; clearing empties the field, and while it holds a text the
// list searches for it, under a key of that text, and hears what the search sends, which names the start that sent
// it. The program is started by plain code, and the user may act before its run begins. The renderer is plain code
// too: a listener of the handle, told of each new state, which reads the model or not, as the fates say, and now and
// then sends a poke from inside the step that told it. What the user does, when the run begins, when commands complete,
// when ticks arrive and when releases end is all in the hands of the scheduler of the tests
// (`test/scheduled.test_scheduler.ts`), which may also make any fiber yield between two of its steps; what is drawn
// beside it (`Fates`) says how many rows the list starts with, which subscriptions end or die, which releases take time
// or die, which commands die, which steps `onApplied` and `onIgnored` die in, whether the renderer stops listening, and
// whether it dies: throwing from its listener, or giving what it threw to `die`, as one that draws outside a listener
// does. To die is to die of a defect, or, for a command or a subscription, to interrupt oneself, which the run takes
// for one. The run runs in a span of whoever runs it, with debug logs enabled, and the program logs and opens spans of
// its own.
// Each property sits in a `describe` named by the bold title of the item of "What you can rely on", in the guide's
// "Guarantees", that it checks, without its final period, and `bun run comments` fails on a `describe` named otherwise.
// The test of what the scenarios reach checks no item, and sits apart.

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
type RowCommand = Readonly<{ _tag: "Work"; born: number; attempt: number }>
/** What a row listens to: its ticks, made from the key alone, so the key carries the row and the session. */
type RowKey = Readonly<{ _tag: "Ticks"; id: Id; born: number; session: number }>

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

/** The field, a note or a title: `Swap` turns it into the other. */
type Field = Readonly<{ _tag: "Note"; text: string }> | Readonly<{ _tag: "Title"; text: string }>
/** What a row starts from: its id, and the number of the addition that made it, which no other row has. */
type RowFlags = Readonly<{ id: Id; born: number }>
type ListOwn = Readonly<{ rows: ReadonlyArray<RowFlags>; born: number; field: Field }>
/** The whole state of the list: its own, and the rows that the library keeps. */
type ListState = Kept<ListOwn, Readonly<{ Rows: HashMap.HashMap<Id, Instance<Row>> }>>
type Own =
  | Readonly<{ _tag: "Add"; id: Id }>
  | Readonly<{ _tag: "Remove"; id: Id }>
  | Readonly<{ _tag: "Clear" }>
  | Readonly<{ _tag: "Swap" }>
  | Readonly<{ _tag: "Found"; text: string; start: number }>
  | Typed

/** What is typed into the field, with the text that the element holds, and the field it is typed into. */
type Typed = Readonly<{ _tag: "Typed"; into: Field["_tag"]; value: string }>

const emptyField: Field = { _tag: "Note", text: "" }

/**
 * How a fiber of the program dies: of a defect; interrupting itself, at once or by joining an interrupted fiber; or
 * interrupted by another fiber of the program, detached.
 */
type Death = "defect" | "interrupts" | "joins" | "isInterrupted"

/** How a subscription goes on after its two ticks: open, ending with a last message, or dying. */
type Ending = "stays" | "ends" | Death

/** How a subscription's release goes: at once, when the scheduler says, or dying when the scheduler says. */
type Release = "quick" | "slow" | "dies"

/** How a command ends when the scheduler says: with its answer, or dying. */
type Answer = "answers" | Death

/** How `onApplied` or `onIgnored` hears a step: at once, or throwing. */
type Hearing = "quick" | "throws"

/** What is drawn beside the scheduler, each list read in a loop by a number that only the program's data gives. */
type Fates = Readonly<{
  /**
   * How many rows the list starts with, from the first id: a list that starts with both reaches far more often a step
   * that stops two subscriptions at once, as `Clear` does, while they hold what they acquired.
   */
  rows: number
  endings: ReadonlyArray<Ending>
  releases: ReadonlyArray<Release>
  answers: ReadonlyArray<Answer>
  /** How `onApplied` hears each step, and how `onIgnored` does: rejections are fewer, and die more often. */
  hearings: ReadonlyArray<Hearing>
  ignorings: ReadonlyArray<Hearing>
  /**
   * How many turns of the scheduler each wait of the program lasts: a tick, an answer or a release that waits. So a
   * wait that began first may end last, as a promise released in any order would.
   */
  waits: ReadonlyArray<number>
  /**
   * Whether the renderer dies: its listener throwing at the notice `at`, counted from 0, or giving what it threw to
   * `die` before the act `at`, as a renderer that draws outside a listener does.
   */
  rendererDies: Opt.Option<Readonly<{ how: "throws" | "gives"; at: number }>>
  /** Whether the renderer stops listening before the act `at`, as a bridge stops when it is unmounted. */
  rendererStops: Opt.Option<number>
  /** Whether the renderer reads the model when it is told of a new state. */
  reads: ReadonlyArray<boolean>
  /** Whether the renderer, once it has read the model, sends a poke of the first row from inside the step. */
  pokes: ReadonlyArray<boolean>
}>

const fateOf = <A>(fates: ReadonlyArray<A>, index: number): A => fates[index % fates.length] as A

const death = fc.constantFrom<Death>("defect", "interrupts", "joins", "isInterrupted")

const fates: fc.Arbitrary<Fates> = fc.record({
  rows: fc.oneof(
    { arbitrary: fc.constant(0), weight: 2 },
    { arbitrary: fc.constant(1), weight: 1 },
    { arbitrary: fc.constant(2), weight: 1 }
  ),
  endings: fc.array(
    fc.oneof(
      { arbitrary: fc.constant<Ending>("stays"), weight: 3 },
      { arbitrary: fc.constant<Ending>("ends"), weight: 3 },
      { arbitrary: death, weight: 1 }
    ),
    { minLength: 1, maxLength: 6 }
  ),
  releases: fc.array(
    fc.oneof(
      { arbitrary: fc.constant<Release>("quick"), weight: 4 },
      { arbitrary: fc.constant<Release>("slow"), weight: 4 },
      { arbitrary: fc.constant<Release>("dies"), weight: 1 }
    ),
    { minLength: 1, maxLength: 8 }
  ),
  answers: fc.array(
    fc.oneof({ arbitrary: fc.constant<Answer>("answers"), weight: 4 }, { arbitrary: death, weight: 3 }),
    { minLength: 1, maxLength: 8 }
  ),
  hearings: fc.array(
    fc.oneof(
      { arbitrary: fc.constant<Hearing>("quick"), weight: 30 },
      { arbitrary: fc.constant<Hearing>("throws"), weight: 1 }
    ),
    { minLength: 1, maxLength: 6 }
  ),
  ignorings: fc.array(
    fc.oneof(
      { arbitrary: fc.constant<Hearing>("quick"), weight: 8 },
      { arbitrary: fc.constant<Hearing>("throws"), weight: 1 }
    ),
    { minLength: 1, maxLength: 6 }
  ),
  waits: fc.array(fc.integer({ min: 1, max: 16 }), { minLength: 1, maxLength: 8 }),
  rendererDies: fc.oneof(
    { arbitrary: fc.constant(Opt.none()), weight: 10 },
    {
      arbitrary: fc.record({ how: fc.constantFrom("throws", "gives"), at: fc.integer({ min: 0, max: 6 }) }).map(
        Opt.some
      ),
      weight: 1
    }
  ),
  rendererStops: fc.oneof(
    { arbitrary: fc.constant(Opt.none()), weight: 8 },
    { arbitrary: fc.integer({ min: 0, max: 8 }).map(Opt.some), weight: 1 }
  ),
  reads: fc.array(
    fc.oneof({ arbitrary: fc.constant(true), weight: 4 }, { arbitrary: fc.constant(false), weight: 1 }),
    { minLength: 1, maxLength: 6 }
  ),
  pokes: fc.array(
    fc.oneof({ arbitrary: fc.constant(true), weight: 1 }, { arbitrary: fc.constant(false), weight: 5 }),
    { minLength: 1, maxLength: 6 }
  )
})

/** Where a fiber of the scenario dies. */
type Where = Extract<DefectSite, "subscription" | "command" | "render" | "onApplied" | "onIgnored">

/** What a holder other than a subscription is called in the events: a command, by its name. */
type Holder = `command ${string}`

/** What happened, in the order it happened, as the program's own code, the renderer and the options saw it. */
type Event =
  | Readonly<{ _tag: "Updated" }>
  | Readonly<{ _tag: "Applied"; applied: Applied<ListState, Message, unknown> }>
  | Readonly<{ _tag: "Ignored"; ignored: Ignored<ListState, Message> }>
  | Readonly<{ _tag: "CommandStarted"; command: string }>
  | Readonly<{ _tag: "Acquired"; listener: string; id: Id }>
  | Readonly<{ _tag: "Releasing"; listener: string; quick: boolean }>
  | Readonly<{ _tag: "Released"; listener: string }>
  | Readonly<{ _tag: "Ended"; listener: string }>
  | Readonly<{ _tag: "Took"; holder: Holder }>
  | Readonly<{ _tag: "Gave"; holder: Holder }>
  | Readonly<{ _tag: "Interrupted"; holder: Holder }>
  // The run about to begin, in the fiber whoever runs it forked.
  | Readonly<{ _tag: "Running" }>
  // The renderer told of a new state, or stopped; a model read, by the renderer as it starts or is told, or by the
  // element as the user types into it; a poke the renderer sends from inside a step, and what the element sends.
  | Readonly<{ _tag: "Noticed" }>
  | Readonly<{ _tag: "Stopped" }>
  | Readonly<{ _tag: "Read"; model: Model; why: "notice" | "start" | "typing" }>
  | Readonly<{ _tag: "Reentering"; message: unknown }>
  | Readonly<{ _tag: "Typed"; message: Typed }>
  // A dispatch of the user's about to be called, and returned, with the message `update` gets, unwrapped.
  | Readonly<{ _tag: "Sending" }>
  | Readonly<{ _tag: "Returned"; message: unknown }>
  | Readonly<{ _tag: "Spanned"; parent: Opt.Option<string> }>
  // A search begun, numbered as it begins; what it sends, as it sends it; and its end.
  | Readonly<{ _tag: "Searching"; text: string; start: number }>
  | Readonly<{ _tag: "Sent"; text: string; start: number }>
  | Readonly<{ _tag: "SearchStopped"; text: string }>
  // `released`: what died is a release, whose defect counts only once the scope it is in has closed (guide), which
  // the scenario does not see.
  | Readonly<{ _tag: "Died"; where: Where; how: Death; defect: string; released: boolean }>

const listener = (born: number, session: number) => `${born}.${session}`

/** What an interruption by the program is called among the defects: the run wraps it in an error of its own. */
const interrupted = "interrupted by the program"

/** What the renderer throws: from its listener, or as it draws outside one, given to `die`. */
const thrownByListener = "the renderer's listener"
const thrownByDraw = "the renderer's draw"

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
 * Dies as `how` says, as `defect`, which names what dies: at once, by joining a fiber it has interrupted, or
 * interrupted by a fiber of the program that nothing of the run interrupts first. Only the run may interrupt a fiber of
 * the run: one that the program interrupted would otherwise leave a command without its answer, a subscription ended
 * without its last message, and the run going on. It decides the death alone: `endsAs` records it, where the effect the
 * run gets ends.
 */
const dies = (events: Array<Event>, where: Where, how: Death, defect: string): Effect.Effect<never> => {
  const now = (dying: Effect.Effect<never>) =>
    unpreempted.pipe(Effect.andThen(Effect.withFiber((fiber) => {
      decidedIn(events).set(defect, { where, how, fiber: fiber.id })
      return dying
    })))
  switch (how) {
    case "defect":
      return now(Effect.die(defect))
    case "interrupts":
      return now(Effect.interrupt)
    case "joins":
      return Effect.gen(function*() {
        const joined = yield* Effect.forkChild(Effect.never)
        yield* Fiber.interrupt(joined)
        return yield* now(Fiber.join(joined))
      })
    case "isInterrupted":
      return Effect.withFiber((self) =>
        Effect.forkDetach(Effect.withFiber((interrupter) => {
          decidedIn(events).set(defect, { where, how, fiber: interrupter.id })
          return Fiber.interrupt(self)
        })).pipe(Effect.andThen(Effect.never))
      )
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
      how === "defect"
        ? Cause.isDieReason(reason) && reason.defect === name
        : Cause.isInterruptReason(reason) && reason.fiberId === fiber
    )
    if (!died) return Effect.void
    return unpreempted.pipe(Effect.andThen(Effect.sync(() => {
      events.push({
        _tag: "Died",
        where,
        how,
        defect: how === "defect" ? name : interrupted,
        released: name.startsWith("release of ")
      })
    })))
  })

/** Opens a span of the program's own, and records the span it is a child of. */
const spanned = (events: Array<Event>, name: string) =>
  Effect.orDie(Effect.currentSpan).pipe(
    Effect.map((span) => events.push({ _tag: "Spanned", parent: Opt.map(span.parent, ({ spanId }) => spanId) })),
    Effect.withSpan(name)
  )

/** Acquires something for `holder`, and releases it when the scope ends. */
const holds = (events: Array<Event>, holder: Holder) =>
  Effect.acquireRelease(
    Effect.sync(() => events.push({ _tag: "Took", holder })),
    () => Effect.sync(() => events.push({ _tag: "Gave", holder }))
  )

/** A point where the scheduler of the tests picks which fiber runs next, the one waiting among them. */
const later = <A>(value: A) => Effect.as(Effect.yieldNow, value)

/** A wait of the program, of as many turns as `fates` says for `index`, which only the program's data gives. */
const waits = (fates: Fates, index: number) =>
  Effect.replicateEffect(later(undefined), fateOf(fates.waits, index), { discard: true })

const rowOf = ({ born, id }: RowFlags): Row => ({
  id,
  born,
  working: false,
  attempts: 0,
  listening: true,
  session: 1,
  heard: 0,
  finished: false
})

/** The list's own first state: as many rows as the fates say, each born anew, as an added one is. */
const initialOwnOf = (fates: Fates): ListOwn => {
  const rows = ids.slice(0, fates.rows).map((id, index) => ({ id, born: index + 1 }))
  return { rows, born: rows.length, field: emptyField }
}

/** The rows that the library keeps in a state. */
const rowsOf = (state: ListState): ReadonlyArray<Row> =>
  Array.from(HashMap.values(state.children.Rows), (kept) => kept.state)

/** The row that the library keeps at `id` in a state, if any. */
const rowAt = (state: ListState, id: Id): Row | undefined =>
  Opt.getOrUndefined(Opt.map(HashMap.get(state.children.Rows, id), (kept) => kept.state))

const makeList = (fates: Fates, events: Array<Event>) => {
  const ticking = (id: Id, born: number, session: number): Subscription<RowMessage, never> => {
    const key = listener(born, session)
    const index = born * 31 + session
    const tick = (nth: number) =>
      Channel.fromEffect(
        spanned(events, "Tick").pipe(
          Effect.andThen(waits(fates, index * 4 + nth)),
          Effect.as(RowMessage.Tick({ born, session }))
        )
      )
    const ticks = tick(0).pipe(Channel.concatWith(() => tick(1)))
    const released = Effect.sync(() => events.push({ _tag: "Released", listener: key }))
    const release = Effect.suspend(() => {
      const fate = fateOf(fates.releases, index)
      events.push({ _tag: "Releasing", listener: key, quick: fate === "quick" })
      switch (fate) {
        case "quick":
          return released
        case "slow":
          return waits(fates, index * 4 + 2).pipe(Effect.andThen(released))
        case "dies":
          return waits(fates, index * 4 + 2).pipe(
            Effect.andThen(released),
            Effect.andThen(dies(events, "subscription", "defect", `release of ${key}`)),
            Effect.onExit(endsAs(events, `release of ${key}`))
          )
      }
    })
    const ending = fateOf(fates.endings, index)
    const body: Subscription<RowMessage, never> = ending === "stays"
      ? ticks.pipe(Channel.concatWith(() => Channel.never))
      : ending === "ends"
      ? ticks.pipe(Channel.mapDoneEffect(() =>
        Effect.sync(() => {
          events.push({ _tag: "Ended", listener: key })
          return RowMessage.Finished({ born, session })
        })
      ))
      : ticks.pipe(
        Channel.concatWith(() =>
          Channel.unwrap<RowMessage, never, RowMessage, unknown, unknown, unknown, never, never, never>(
            waits(fates, index * 4 + 3).pipe(
              Effect.andThen(dies(events, "subscription", ending, `subscription ${key}`))
            )
          )
        )
      )
    return Channel.unwrap(
      Effect.acquireRelease(Effect.sync(() => events.push({ _tag: "Acquired", listener: key, id })), () => release)
        .pipe(Effect.tap(() => Effect.logDebug("Listening", key)), Effect.as(body))
    ).pipe(Channel.onExit(endsAs(events, `subscription ${key}`)))
  }
  const row: Program<
    {
      state: Row
      model: RowModel
      message: RowMessage
      command: RowCommand
      commandServices: Scope.Scope
      flags: RowFlags
      key: RowKey
    }
  > = {
    init: (flags) => ({ state: rowOf(flags) }),
    update: (message) => (state) => {
      switch (message._tag) {
        case "WorkClicked":
          return state.working ? reject : {
            state: { ...state, working: true, attempts: state.attempts + 1, listening: false },
            commands: [{ _tag: "Work", born: state.born, attempt: state.attempts }]
          }
        // Accept any completion, working or not: whether one of an earlier row at this id can reach this one is what
        // the test checks.
        case "Done":
          return { state: { ...state, working: false } }
        case "MuteClicked":
          return state.listening ? { state: { ...state, listening: false } } : reject
        case "ListenClicked":
          return state.listening
            ? reject
            : { state: { ...state, listening: true, session: state.session + 1, finished: false } }
        // Accepted, and the very same state: its parent's stays the same too, and no model is made for it.
        case "Poked":
          return { state }
        // Accept any tick, and any end, muted or not: whether one of a stopped subscription can arrive is what the
        // test checks.
        case "Tick":
          return { state: { ...state, heard: state.heard + 1 } }
        case "Finished":
          return { state: { ...state, finished: true } }
      }
    },
    // Recorded as the run calls it, which it may do only while it has not died: what the effect it returns does is the
    // program's, and may come after a death.
    runCommand: (command) => {
      const name = `${command.born}.${command.attempt}`
      events.push({ _tag: "CommandStarted", command: name })
      return Effect.suspend(() => {
        const holder: Holder = `command ${name}`
        const answer = fateOf(fates.answers, command.born * 7 + command.attempt)
        return holds(events, holder).pipe(
          Effect.andThen(Effect.logDebug("Working", name)),
          Effect.andThen(spanned(events, "Work")),
          Effect.andThen(waits(fates, command.born * 7 + command.attempt)),
          Effect.andThen(
            answer === "answers"
              ? Effect.succeedSome(RowMessage.Done({ born: command.born, attempt: command.attempt }))
              : dies(events, "command", answer, `command ${name}`)
          ),
          Effect.onInterrupt(() => Effect.sync(() => events.push({ _tag: "Interrupted", holder }))),
          Effect.onExit(endsAs(events, holder))
        )
      })
    },
    // The key carries the session, which the ticks name: each session has a key of its own. A message of an earlier
    // start of a key that came back is the search's (`searching`).
    subscriptions: (state) =>
      state.listening
        ? [{ _tag: "Ticks" as const, id: state.id, born: state.born, session: state.session }]
        : [],
    listen: ({ born, id, session }) => ticking(id, born, session),
    makeModel: (state) => ({
      working: state.working,
      work: state.working ? Opt.none() : Opt.some(RowMessage.WorkClicked()),
      mute: state.listening ? Opt.some(RowMessage.MuteClicked()) : Opt.none(),
      listen: state.listening ? Opt.none() : Opt.some(RowMessage.ListenClicked()),
      poke: RowMessage.Poked()
    })
  }
  // Numbered as it begins, it sends three messages that name its start, each when the scheduler says. Its key comes
  // back whenever the field holds the same text again, so what it sends may reach a start of the same key that is not
  // its own, which must not hear it. Its start is recorded as it acquires, and its end as it releases, in the scope
  // the subscription runs in, as a row's are: a release of the channel it gives would not run for a stop that comes
  // before that channel does, and the search would be taken for one still running.
  let starts = 0
  const searching = (text: string): Subscription<Own, never> =>
    Channel.unwrap(
      Effect.acquireRelease(
        Effect.sync(() => {
          starts += 1
          events.push({ _tag: "Searching", text, start: starts })
          return starts
        }),
        () => Effect.sync(() => events.push({ _tag: "SearchStopped", text }))
      ).pipe(Effect.map((start) => {
        const found = (nth: number) =>
          Channel.fromEffect(
            waits(fates, start * 3 + nth).pipe(
              Effect.andThen(Effect.sync((): Own => {
                events.push({ _tag: "Sent", text, start })
                return { _tag: "Found", text, start }
              }))
            )
          )
        return found(0).pipe(
          Channel.concatWith(() => found(1)),
          Channel.concatWith(() => found(2)),
          Channel.concatWith(() => Channel.never)
        )
      }))
    )
  const List = program<{ state: ListOwn; message: Own; key: readonly ["search", string] }>()
  // A row is there while its id is listed, started from the flags listed with it: one added again at its id is
  // another row.
  return List.withChildren({
    Rows: childById(row, { flags: (state) => state.rows.map((flags) => [flags.id, flags] as const) })
  }).make({
    init: { state: initialOwnOf(fates) },
    update: (message: Own) => (state) => {
      switch (message._tag) {
        case "Add": {
          if (state.rows.some((entry) => entry.id === message.id)) return reject
          const born = state.born + 1
          return { state: { ...state, rows: [...state.rows, { id: message.id, born }], born } }
        }
        case "Remove":
          return state.rows.some((entry) => entry.id === message.id)
            ? { state: { ...state, rows: state.rows.filter((entry) => entry.id !== message.id) } }
            : reject
        // Another text in the field: what is typed after it is stored over it all the same.
        case "Clear":
          return state.rows.length > 0 ? { state: { ...state, rows: [], field: { ...state.field, text: "" } } } : reject
        // The field is the other one: what is typed into the one it was is rejected.
        case "Swap": {
          const { text } = state.field
          return {
            state: { ...state, field: state.field._tag === "Note" ? { _tag: "Title", text } : { _tag: "Note", text } }
          }
        }
        // Accepted, of any start, and the very same state: whether one of a start that is not current can arrive is
        // what the test checks.
        case "Found":
          return { state }
        // The text is stored as it is typed, whatever it is, into the field it names.
        case "Typed":
          return state.field._tag === message.into
            ? { state: { ...state, field: { ...state.field, text: message.value } } }
            : reject
      }
    },
    subscriptions: ({ field: { text } }) => text === "" ? [] : [["search", text] as const],
    listen: ([, text]) => searching(text),
    makeModel: (state, children) => ({
      field: state.field,
      typed: { _tag: "Typed", into: state.field._tag } as const,
      swap: { _tag: "Swap" } as Own,
      add: ids.filter((id) => !state.rows.some((entry) => entry.id === id)).map((id): Own => ({ _tag: "Add", id })),
      clear: state.rows.length > 0 ? Opt.some<Own>({ _tag: "Clear" }) : Opt.none<Own>(),
      // Each row with what the parent's own state says of it, `born`, and the number of its instance, for its view.
      rows: state.rows.map(({ born, id }) => ({
        id,
        born,
        instance: children.Rows.instance(id),
        remove: { _tag: "Remove", id } as Own,
        row: children.Rows(id)
      }))
    })
  })
}

type List = ReturnType<typeof makeList>
type Model = ReturnType<List["makeModel"]>
type Message = Parameters<List["update"]>[0]

/**
 * What the user does, on whatever model the renderer read last, when the scheduler lets them: `pick` chooses among the
 * controls drawn, so that every act does something; `twice` is a double tap, a key and its undo on the element of the
 * field; `pause` is how many turns of the scheduler the user waits before; `stale` is a model read before, whose view
 * the act is on; `named` is whether the dispatch of a row names the instance that its model holds, as a view given the
 * number makes it.
 */
type Act = Readonly<{ pick: number; twice: boolean; pause: number; stale: Opt.Option<number>; named: boolean }>

const act: fc.Arbitrary<Act> = fc.record({
  pick: fc.nat(),
  twice: fc.boolean(),
  pause: fc.integer({ min: 1, max: 4 }),
  // An act on a model read before, now and then: what is typed into its field, as the element of that model would send
  // it, or a tap on one of its rows.
  stale: fc.oneof({ arbitrary: fc.constant(Opt.none()), weight: 5 }, { arbitrary: fc.nat().map(Opt.some), weight: 1 }),
  named: fc.boolean()
})

/** What the user makes of a text: a letter more, or one less. */
const typed = (text: string, pick: number) => pick % 3 === 0 ? text.slice(0, -1) : `${text}${"ab"[pick % 2]}`

/**
 * What a control does with the dispatch, and the message it sent, as `update` gets it, unwrapped: a row's sends through
 * the row's own dispatch, as its view would.
 */
type Control = (dispatch: Dispatch<Message>) => Effect.Effect<unknown>

// The dispatch is called as the control is: when it returns, its message has been applied.
const sent = <A>(_: void, message: A): Effect.Effect<A> => Effect.succeed(message)

/** What the element of an older model would have sent: a text typed over the one that model drew, into its field. */
const staleTyping = (model: Model, pick: number): Control => (dispatch) => {
  const message: Typed = { ...model.typed, value: typed(model.field.text, pick) }
  return sent(dispatch(message), message)
}

/**
 * What a row of the model shows, sent through the row's own dispatch: made from its name and its id, or, `named`, from
 * the instance that the model holds.
 */
const taps = ({ id, instance, row }: Model["rows"][number], named: boolean): ReadonlyArray<Control> =>
  [...Arr.getSomes([row.work, row.mute, row.listen]), row.poke].map((message): Control => (dispatch) =>
    sent(
      (named ? forwardTo(dispatch, { _tag: "Rows", id, instance }) : forwardTo(dispatch, "Rows", id))(message),
      message
    )
  )

/** Every control the model shows, the element of the field first: a user can only use what is drawn. */
const controls = (model: Model, typing: Control, named: boolean): ReadonlyArray<Control> => [
  typing,
  (dispatch) => sent(dispatch(model.swap), model.swap),
  ...model.add.map((add): Control => (dispatch) => sent(dispatch(add), add)),
  ...Opt.toArray(model.clear).map((clear): Control => (dispatch) => sent(dispatch(clear), clear)),
  ...model.rows.flatMap((row) => [
    (dispatch: Dispatch<Message>) => sent(dispatch(row.remove), row.remove),
    ...taps(row, named)
  ])
]

/**
 * What a view older than the state sends: a tap on one of its rows, through a dispatch that names the instance drawn,
 * where the act names instances and the model has a row, and otherwise a text typed into its field.
 */
const staleControl = (model: Model, { named, pick }: Act): Control => {
  const drawn = named ? model.rows.flatMap((row) => taps(row, true)) : []
  return Arr.get(drawn, pick % Math.max(drawn.length, 1)).pipe(Opt.getOrElse(() => staleTyping(model, pick)))
}

const controlFor = (model: Model, { named, pick }: Act, typing: Control): Opt.Option<Control> => {
  const drawn = controls(model, typing, named)
  return Arr.get(drawn, pick % Math.max(drawn.length, 1))
}

/** The message `update` got, as the control that sent it made it: a child's unwrapped. */
const innerOf = (message: Message): unknown => message._tag === "Rows" ? message.message : message

/**
 * Runs `acts` against the list, in a span of its own with debug logs enabled, and what was seen once nothing is under
 * way but what waits forever (`settled`, the number of events by then, and `last`, a model read then), then once
 * whoever runs it has interrupted it and it has ended: the span it ran in, and the models made. It is run under the
 * scheduler of the tests, which picks every order: each act waits for its turn as a `later` does.
 */
const runScenario = Effect.fnUntraced(function*(fates: Fates, acts: ReadonlyArray<Act>) {
  const events: Array<Event> = []
  const list = makeList(fates, events)
  let made = 0
  // The state of each model made, by the model's identity.
  const stateOf = new Map<Model, ListState>()
  const counted: List = {
    ...list,
    // Recorded as the run calls `update`, which is what it applies.
    update: (message) => {
      events.push({ _tag: "Updated" })
      return list.update(message)
    },
    makeModel: (state) => {
      made += 1
      const model = list.makeModel(state)
      stateOf.set(model, state)
      return model
    }
  }
  const shown: Array<Model> = []
  let heard = 0
  // The options are functions: one hears at once, or throws, which is its death, there and then.
  const hearing = (event: Event): undefined => {
    events.push(event)
    heard += 1
    const where = event._tag === "Applied" ? "onApplied" : "onIgnored"
    const fate = fateOf(where === "onApplied" ? fates.hearings : fates.ignorings, heard)
    if (fate === "quick") return
    const name = `${where} ${heard}`
    events.push({ _tag: "Died", where, how: "defect", defect: name, released: false })
    throw name
  }
  // Started by plain code: the handle is there before the run begins, and so is its first model.
  const { app, run } = start(counted, {
    onApplied: (applied) => hearing({ _tag: "Applied", applied }),
    onIgnored: (ignored) => hearing({ _tag: "Ignored", ignored })
  })
  const read = (why: "notice" | "start" | "typing") => {
    const model = app.model()
    events.push({ _tag: "Read", model, why })
    shown.push(model)
    return model
  }
  let latest = read("start")
  let notices = 0
  // The renderer's listener: told of each new state, it throws as the fates say, or reads the model or not, and now and
  // then sends a message of its own, a poke of the first row, from inside the step that told it.
  const stop = app.subscribe(() => {
    notices += 1
    events.push({ _tag: "Noticed" })
    if (Opt.exists(fates.rendererDies, ({ how, at }) => how === "throws" && at + 1 === notices)) {
      events.push({ _tag: "Died", where: "render", how: "defect", defect: thrownByListener, released: false })
      throw thrownByListener
    }
    if (!fateOf(fates.reads, notices)) return
    const model = read("notice")
    latest = model
    const first = model.rows[0]
    if (first === undefined || !fateOf(fates.pokes, notices)) return
    events.push({ _tag: "Reentering", message: first.row.poke })
    forwardTo(app.dispatch, "Rows", first.id)(first.row.poke)
  })
  // A key typed into the element of the field, which shows what the current model holds, as a controlled element
  // does: it sends the message that the model holds, filled with that value with the key, from a plain callback. Tapped
  // twice, it is a key and its undo, which gives back the text the field held before: so a key of the search comes back
  // while its earlier start still sends in enough scenarios for the test of what they reach to meet one on every seed.
  const typing = (pick: number): Control => {
    let before: string | undefined
    return (dispatch) =>
      Effect.sync(() => {
        const model = read("typing")
        const message: Typed = { ...model.typed, value: before ?? typed(model.field.text, pick) }
        before = model.field.text
        events.push({ _tag: "Typed", message })
        dispatch(message)
        return message
      })
  }
  let caller: Tracer.Span | undefined
  const fiber = yield* Effect.forkChild(
    Effect.gen(function*() {
      caller = yield* Effect.orDie(Effect.currentSpan)
      events.push({ _tag: "Running" })
      return yield* run
    }).pipe(
      Effect.withSpan("caller"),
      // Down to debug: what the subscriptions and the commands log is among them.
      Effect.provideService(References.MinimumLogLevel, "Debug"),
      Effect.provide(Logger.layer([Logger.tracerLogger]))
    )
  )
  // The user acts on what the renderer read last, from the first model on: before the run has begun, and after it has
  // ended too, when a dispatch applies nothing.
  for (const [nth, act] of acts.entries()) {
    for (let turn = 0; turn < act.pause; turn++) yield* later(undefined)
    if (Opt.contains(fates.rendererStops, nth)) {
      stop()
      events.push({ _tag: "Stopped" })
    }
    // A draw outside a listener that throws, given to `die` by plain code, while nothing has died and the run has not
    // ended: once it has, `die` throws back what the cause lacks, which `run.test.ts` checks and the search does not.
    const gives = Opt.exists(fates.rendererDies, ({ how, at }) => how === "gives" && at === nth)
    if (gives && fiber.pollUnsafe() === undefined && !events.some(({ _tag }) => _tag === "Died")) {
      events.push({ _tag: "Died", where: "render", how: "defect", defect: thrownByDraw, released: false })
      app.die(thrownByDraw)
    }
    const older = Opt.flatMap(act.stale, (index) => Arr.get(shown, index % Math.max(shown.length, 1)))
    const control = Opt.isSome(older)
      ? Opt.some(staleControl(older.value, act))
      : controlFor(latest, act, typing(act.pick))
    if (Opt.isNone(control)) continue
    for (const _ of act.twice ? [1, 2] : [1]) {
      events.push({ _tag: "Sending" })
      const message = yield* control.value(app.dispatch)
      events.push({ _tag: "Returned", message })
    }
  }
  yield* idle
  const settled = events.length
  const last = fiber.pollUnsafe() !== undefined ? undefined : app.model()
  yield* Fiber.interrupt(fiber)
  const exit = yield* Fiber.await(fiber)
  return { exit, events, settled, last, made, stateOf, caller, first: list.init.state }
})

type Outcome = Effect.Success<ReturnType<typeof runScenario>>

const isTyped = (message: Message): message is Typed => message._tag === "Typed"

/** A message of a row's view whose dispatch named the instance that its model held: no answer, and no tick. */
type Tap = Extract<Message, Readonly<{ _tag: "Rows" }>> & Readonly<{ instance: number }>
const tapped: ReadonlySet<RowMessage["_tag"]> = new Set(["WorkClicked", "MuteClicked", "ListenClicked", "Poked"])
const isTap = (message: Message): message is Tap =>
  message._tag === "Rows" && message.instance !== undefined && tapped.has(message.message._tag)

/** The row that each instance was drawn for, by its `born`, as the models that were read held them. */
const drawnFor = (events: ReadonlyArray<Event>): ReadonlyMap<number, number> =>
  new Map(
    events.flatMap((event) =>
      event._tag === "Read" ? event.model.rows.map(({ born, instance }) => [instance, born] as const) : []
    )
  )

const applied = (events: ReadonlyArray<Event>) =>
  events.flatMap((event) => event._tag === "Applied" ? [event.applied] : [])

/** The state after the first `count` events: the last that a message made, or `first`, the one the list began with. */
const stateAfter = (first: ListState, events: ReadonlyArray<Event>, count = events.length): ListState =>
  applied(events.slice(0, count)).at(-1)?.after ?? first

const finalState = (first: ListState, events: ReadonlyArray<Event>): ListState => stateAfter(first, events)

/**
 * The very state after the first `count` events, by its identity: the first state is the one the first message heard
 * was given, or, when none was, the one of the first model read.
 */
const sameStateAfter = (
  events: ReadonlyArray<Event>,
  stateOf: ReadonlyMap<Model, ListState>,
  count = events.length
): ListState | undefined => {
  const last = applied(events.slice(0, count)).at(-1)
  if (last !== undefined) return last.after
  for (const event of events) {
    if (event._tag === "Applied") return event.applied.before
    if (event._tag === "Ignored") return event.ignored.state
  }
  const first = events.find((event) => event._tag === "Read")
  return first?._tag === "Read" ? stateOf.get(first.model) : undefined
}

/** The message an event shows `update` heard, accepted or not, with where it came from. */
const heardOf = (event: Event) =>
  event._tag === "Applied"
    ? Opt.some({ message: event.applied.message, origin: event.applied.origin })
    : event._tag === "Ignored"
    ? Opt.some({ message: event.ignored.message, origin: event.ignored.origin })
    : Opt.none()

/**
 * Whether the start of a search is no longer the current one by the first `count` events: the field has held another
 * text since it began, or a later start of its text has begun. It may be one before then too, begun once its key had
 * gone: that a run reaches the comparison of starts at all is what matters.
 */
const superseded = (events: ReadonlyArray<Event>, text: string, start: number, count: number) => {
  const begun = events.findIndex((event) => event._tag === "Searching" && event.start === start)
  return events.slice(begun, count).some((event) =>
    (event._tag === "Applied" && event.applied.after.own.field.text !== text)
    || (event._tag === "Searching" && event.text === text && event.start > start)
  )
}

/** The searches running after the first `count` events, by their text. */
const searches = (events: ReadonlyArray<Event>, count = events.length) => {
  const running: Array<string> = []
  for (const event of events.slice(0, count)) {
    if (event._tag === "Searching") running.push(event.text)
    if (event._tag === "SearchStopped") running.splice(running.indexOf(event.text), 1)
  }
  return running
}

const listeners = (state: ListState) =>
  rowsOf(state).filter((row) => row.listening).map((row) => listener(row.born, row.session)).sort()

const deaths = (events: ReadonlyArray<Event>) =>
  events.flatMap((event) => event._tag === "Died" ? [`${event.where}: ${event.defect}`] : [])

/** The subscriptions that hold what they acquired after the first `count` events. */
const holding = (events: ReadonlyArray<Event>, count = events.length) => {
  const held = new Set<string>()
  for (const event of events.slice(0, count)) {
    if (event._tag === "Acquired") held.add(event.listener)
    if (event._tag === "Releasing") held.delete(event.listener)
  }
  return held
}

const released = (events: ReadonlyArray<Event>, count: number) =>
  new Set(events.slice(0, count).flatMap((event) => event._tag === "Released" ? [event.listener] : []))

/** The holders that have given back what they took within `events`. */
const given = (events: ReadonlyArray<Event>) =>
  new Set(events.flatMap((event) => event._tag === "Gave" ? [event.holder] : []))

/** The listeners a state stops that the one before it listened with: those of `before` not in `after`. */
const stoppedBy = ({ before, after }: Applied<ListState, Message, unknown>) =>
  listeners(before).filter((key) => !listeners(after).includes(key))

/**
 * The subscriptions that the accepted message of event `index` stops while they hold what they acquired, and those of
 * them whose release waits.
 */
const stoppedAt = (events: ReadonlyArray<Event>, index: number, applied: Applied<ListState, Message, unknown>) => {
  const held = holding(events, index)
  const stopped = stoppedBy(applied).filter((key) => held.has(key))
  const ended = new Set(events.flatMap((event) => event._tag === "Ended" ? [event.listener] : []))
  const waiting = new Set(
    events.slice(index + 1).flatMap((later) =>
      later._tag === "Releasing" && !later.quick && stopped.includes(later.listener) && !ended.has(later.listener)
        ? [later.listener]
        : []
    )
  )
  return { stopped, waiting }
}

/** The answer of a command that an event shows reaching update, accepted or not, by the command's name. */
const answerOf = (event: Event) => {
  const message = Opt.getOrUndefined(heardOf(event))?.message
  return message?._tag === "Rows" && message.message._tag === "Done"
    ? Opt.some(`command ${message.message.born}.${message.message.attempt}` as const)
    : Opt.none()
}

/** Whether two releases that wait ended in the other order than they began: the one that began later ended first. */
const releaseOvertaken = (events: ReadonlyArray<Event>) => {
  const releasing = new Map<string, number>()
  const begun: Array<number> = []
  events.forEach((event, index) => {
    if (event._tag === "Releasing" && !event.quick) releasing.set(event.listener, index)
    if (event._tag === "Released" && releasing.has(event.listener)) begun.push(releasing.get(event.listener) ?? 0)
  })
  return begun.some((start, index) => begun.slice(index + 1).some((later) => later < start))
}

/** Whether a defect is the error the run wraps an interruption by the program in: its cause interrupts, and nothing else. */
const isInterruption = (defect: unknown) =>
  defect instanceof Error && Cause.isCause(defect.cause) && Cause.hasInterruptsOnly(defect.cause)

const defects = (exit: Exit.Exit<unknown>) =>
  Exit.isFailure(exit)
    ? exit.cause.reasons.filter(Cause.isDieReason).map(({ defect }) =>
      defect instanceof ProgramDefect
        ? `${defect.where}: ${isInterruption(defect.cause) ? interrupted : String(defect.cause)}`
        : defect
    )
    : []

/** The index of the first death the scenario decided, `events.length` when none. */
const firstDeath = (events: ReadonlyArray<Event>) => {
  const index = events.findIndex((event) => event._tag === "Died")
  return index === -1 ? events.length : index
}

const depth = 3

const property = (
  check: (outcome: Outcome) => void,
  { schedules = 1, ...options }: Readonly<{ numRuns?: number; seed?: number; schedules?: number }> = {}
) => {
  let scenarios = 0
  fc.assert(
    fc.property(fates, fc.array(act, { maxLength: 12 }), fc.nat(), (fates, acts, seed) => {
      // A property runs in one synchronous job, and Bun leaves the garbage of its scenarios there until the job ends:
      // its heap reached 350 MB in 1500 scenarios, 11 MB once collected. So it is collected as the property goes, or
      // the peak of the process depends on when Bun chooses to collect, and the memory guard ends some runs.
      if (++scenarios % 50 === 0) collectGarbage()
      prioritizedSchedules(runScenario(fates, acts), { runs: schedules, depth, first: seed }, (exit) => {
        if (Exit.isFailure(exit)) throw new Error(`the scenario failed: ${Cause.pretty(exit.cause)}`)
        check(exit.value)
      })
    }),
    { numRuns: 60, ...options }
  )
}

const sinceFirstDefect = (events: ReadonlyArray<Event>, tags: ReadonlyArray<Event["_tag"]>) => {
  const first = events.findIndex((event) => event._tag === "Died" && !event.released)
  return first === -1 ? [] : events.slice(first).filter(({ _tag }) => tags.includes(_tag)).map(({ _tag }) => _tag)
}

test("the scenarios reach every message, every way of dying, and what each property checks", () => {
  const seed = Math.floor(Math.random() * 2 ** 31)
  const reached = new Set<string>()
  property(({ events, first, made: models }) => {
    events.forEach((event, index) => {
      if (Opt.isSome(answerOf(event)) && given(events.slice(0, index)).has(Opt.getOrThrow(answerOf(event)))) {
        reached.add("an answer after its release")
      }
      const answered = Opt.getOrUndefined(heardOf(event))?.message
      if (answered?._tag === "Rows" && answered.message._tag === "Done") {
        const state = event._tag === "Applied"
          ? event.applied.before
          : event._tag === "Ignored"
          ? event.ignored.state
          : undefined
        const there = state === undefined ? undefined : rowAt(state, answered.id)
        if (there !== undefined && there.born !== answered.message.born) {
          reached.add("an answer for a row added again at its id")
        }
      }
      const tapped = Opt.getOrUndefined(heardOf(event))?.message
      if (event._tag === "Ignored" && tapped !== undefined && isTap(tapped)) {
        const there = rowAt(event.ignored.state, tapped.id)
        if (there !== undefined && there.born !== drawnFor(events).get(tapped.instance)) {
          reached.add("a tap for a row added again at its id")
        }
      }
      if (event._tag === "Spanned") reached.add("a span of the program")
      if (event._tag === "Reentering") reached.add("a message a listener sends")
      if (event._tag === "Typed") reached.add("a text typed into the element")
      if (event._tag === "Acquired" && !listeners(stateAfter(first, events, index)).includes(event.listener)) {
        reached.add("a subscription started once its key had gone")
      }
      if (
        event._tag === "Sent" && superseded(events, event.text, event.start, index)
        && stateAfter(first, events, index).own.field.text === event.text
      ) {
        reached.add("a message of an earlier start of a key that came back")
      }
      if (event._tag !== "Applied") return
      const { message } = event.applied
      reached.add(message._tag === "Rows" ? message.message._tag : message._tag)
      if (!isTyped(message) && event.applied.before.own.field.text !== event.applied.after.own.field.text) {
        reached.add("a text replaced")
      }
      if (event.applied.before === event.applied.after) reached.add("the very same state")
      if (stoppedAt(events, index, event.applied).waiting.size > 1) reached.add("two waiting releases")
      const releasing = events.slice(0, index).flatMap((earlier) =>
        earlier._tag === "Releasing" && !earlier.quick ? [earlier.listener] : []
      )
      if (releasing.some((key) => !released(events, index).has(key))) {
        reached.add("a message applied while a release is under way")
      }
    })
    for (const event of events) {
      if (event._tag !== "Died") continue
      reached.add(`${event.where} ${event.how}`)
      if (event.defect === thrownByListener) reached.add("a defect a listener throws")
      if (event.defect === thrownByDraw) reached.add("a defect given to die")
    }
    if (events.some(({ _tag }) => _tag === "Ignored")) reached.add("rejected")
    const typed = new Set(events.flatMap((event) => event._tag === "Typed" ? [event.message] : []))
    for (const event of events) {
      if (event._tag !== "Ignored") continue
      const { message } = event.ignored
      if (isTyped(message) && !typed.has(message)) reached.add("a text typed into a field that is gone")
    }
    if (events.some(({ _tag }) => _tag === "SearchStopped")) reached.add("a search stopped")
    const stopped = events.findIndex(({ _tag }) => _tag === "Stopped")
    const newState = (event: Event) => event._tag === "Applied" && event.applied.before !== event.applied.after
    if (stopped !== -1 && events.slice(stopped, firstDeath(events)).some(newState)) {
      reached.add("a new state once the renderer stopped")
    }
    const running = events.findIndex(({ _tag }) => _tag === "Running")
    if (events.slice(0, running === -1 ? events.length : running).some(({ _tag }) => _tag === "Applied")) {
      reached.add("a message applied before the run began")
    }
    const states = 1 + applied(events).filter(({ before, after }) => before !== after).length
    if (models < states) reached.add("a state whose model was never read")
    if (releaseOvertaken(events)) reached.add("a release overtaken")
    const reads = events.flatMap((event) => event._tag === "Read" ? [event.model] : [])
    if (reads.some((model, index) => index > 0 && reads[index - 1] === model)) {
      reached.add("a model read twice for one state")
    }
  }, { numRuns: 2000, seed })
  const places: ReadonlyArray<Where> = ["command", "subscription"]
  const missing = [
    "Add",
    "Clear",
    "Done",
    "Finished",
    "Found",
    "ListenClicked",
    "MuteClicked",
    "Poked",
    "Remove",
    "Swap",
    "Tick",
    "Typed",
    "WorkClicked",
    ...places.flatMap((where) =>
      (["defect", "interrupts", "joins", "isInterrupted"] as const).map((how) => `${where} ${how}`)
    ),
    "a defect a listener throws",
    "a defect given to die",
    "onApplied defect",
    "onIgnored defect",
    "rejected",
    "a text typed into a field that is gone",
    "a text replaced",
    "a text typed into the element",
    "a search stopped",
    "two waiting releases",
    "the very same state",
    "an answer after its release",
    "an answer for a row added again at its id",
    "a tap for a row added again at its id",
    "a new state once the renderer stopped",
    "a message applied before the run began",
    "a state whose model was never read",
    "a model read twice for one state",
    "a span of the program",
    "a release overtaken",
    "a message a listener sends",
    "a message applied while a release is under way",
    "a subscription started once its key had gone",
    "a message of an earlier start of a key that came back"
  ].filter((tag) => !reached.has(tag))
  if (missing.length > 0) throw new Error(`No scenario of seed ${seed} reached ${missing.join(", ")}`)
}, Infinity)

describe("One message at a time, in the order they were sent", () => {
  // `update` and the option that hears it are one thunk: no other message is heard between them.
  test("messages are applied one at a time: each update is heard before the next one is called", () => {
    property(({ events }) => {
      const broken: Array<number> = []
      let open = false
      events.forEach((event, index) => {
        if (event._tag === "Updated") {
          if (open) broken.push(index)
          open = true
        }
        if (Opt.isSome(heardOf(event))) open = false
      })
      expect(broken).toEqual([])
    })
  }, Infinity)

  test("a dispatch has been applied when it returns", () => {
    property(({ events }) => {
      const broken: Array<string> = []
      events.forEach((event, index) => {
        if (event._tag !== "Returned") return
        let sending = index
        while (sending > 0 && events[sending]?._tag !== "Sending") sending -= 1
        if (firstDeath(events) < index) return
        const between = events.slice(sending + 1, index)
        const heard = between.some((later) =>
          Opt.match(heardOf(later), {
            onNone: () => false,
            onSome: ({ message, origin }) => origin._tag === "Dispatch" && innerOf(message) === event.message
          })
        )
        if (!heard) broken.push(`a dispatch returned at ${index} before update heard it`)
      })
      expect(broken).toEqual([])
    })
  }, Infinity)

  test("a message a listener sends is the next one heard, right after the step that told it", () => {
    property(({ events }) => {
      const broken: Array<string> = []
      events.forEach((event, index) => {
        if (event._tag !== "Reentering" || firstDeath(events) < index) return
        const next = events.slice(index + 1).map(heardOf).find(Opt.isSome)
        if (next === undefined || innerOf(next.value.message) !== event.message) {
          broken.push(`the poke sent at ${index} was not the next message heard`)
        }
      })
      expect(broken).toEqual([])
    })
  }, Infinity)

  // `update`, the option that hears it and the listeners are one thunk: the notice of a new state comes before anything
  // else is heard, and none comes of a rejected message, of the very same state, or once the listener is stopped.
  test("a listener is told of each new state once, in the step that made it, and of nothing once it is stopped", () => {
    property(({ events }) => {
      const broken: Array<string> = []
      let owed = false
      let listening = true
      events.slice(0, firstDeath(events)).forEach((event, index) => {
        switch (event._tag) {
          case "Stopped":
            listening = false
            return
          case "Noticed":
            if (!owed) broken.push(`a notice of nothing new at ${index}`)
            owed = false
            return
          case "Updated":
          case "Applied":
          case "Ignored":
            if (owed) broken.push(`a new state before ${index} that no notice followed`)
            owed = listening && event._tag === "Applied" && event.applied.before !== event.applied.after
        }
      })
      if (owed && firstDeath(events) === events.length) broken.push("a last new state that no notice followed")
      expect(broken).toEqual([])
    })
  }, Infinity)

  // What a controlled element sends is the message of the current model, which a dispatch applied at once keeps
  // current: nothing typed into it is ever for a field that is gone.
  test("what is typed into the element is never rejected", () => {
    property(({ events }) => {
      const typed = new Set(events.flatMap((event) => event._tag === "Typed" ? [event.message] : []))
      const rejected = events.flatMap((event) =>
        event._tag === "Ignored" && isTyped(event.ignored.message) && typed.has(event.ignored.message)
          ? [event.ignored.message]
          : []
      )
      expect(rejected).toEqual([])
    })
  }, Infinity)

  test("once everything has happened, no row waits for the answer of its command", () => {
    property(({ events, first }) => {
      if (deaths(events).length > 0) return
      expect(rowsOf(finalState(first, events)).filter((row) => row.working)).toEqual([])
    })
  }, Infinity)
})

describe("Outdated clicks are harmless", () => {
  test("a rejected message leaves the state as it was, and an accepted one starts from the one before", () => {
    property(({ events }) => {
      let state: ListState | undefined
      const broken: Array<string> = []
      for (const event of events) {
        if (event._tag === "Ignored") {
          if (state !== undefined && event.ignored.state !== state) broken.push("ignored")
          state = event.ignored.state
        }
        if (event._tag === "Applied") {
          if (state !== undefined && event.applied.before !== state) broken.push("applied")
          state = event.applied.after
        }
      }
      expect(broken).toEqual([])
    })
  }, Infinity)
})

describe("An answer reaches the instance that asked for it, or is rejected", () => {
  // A row removed and added again at its id is another row, born of another addition: the answer of a command of the
  // row before, which names its instance, is rejected, though the row there would accept it.
  test("an answer reaches the row that asked for it, or is rejected", () => {
    property(({ events }) => {
      const astray = applied(events).flatMap(({ before, message }) => {
        if (message._tag !== "Rows" || message.message._tag !== "Done") return []
        const { attempt, born } = message.message
        const there = rowAt(before, message.id)
        return there?.born === born ? [] : [`the answer of command ${born}.${attempt} reached row ${there?.born}`]
      })
      expect(astray).toEqual([])
    }, { numRuns: 1000 })
  }, Infinity)

  // A view may be older than the state: the user acts on the model that the renderer read last. A tap whose dispatch
  // names the instance that this model held reaches the row it was drawn for, by what the parent's own state said of
  // it then, or is rejected, though a row added again at its id would accept it.
  test("a tap that names its instance reaches the row it was drawn for, or is rejected", () => {
    property(({ events }) => {
      const drawn = drawnFor(events)
      const astray = applied(events).flatMap(({ before, message }) => {
        if (!isTap(message)) return []
        const there = rowAt(before, message.id)
        return there?.born === drawn.get(message.instance)
          ? []
          : [`a tap drawn for row ${drawn.get(message.instance)} reached row ${there?.born}`]
      })
      expect(astray).toEqual([])
    }, { numRuns: 1000 })
  }, Infinity)
})

describe("Subscriptions follow their keys", () => {
  test("a tick or the end of a subscription reaches update only while the session that sent it listens", () => {
    property(({ events }) => {
      const late = applied(events).filter(({ message, before }) => {
        if (message._tag !== "Rows" || (message.message._tag !== "Tick" && message.message._tag !== "Finished")) {
          return false
        }
        const { born, session } = message.message
        const row = rowAt(before, message.id)
        return !(row?.listening === true && row.born === born && row.session === session)
      })
      expect(late).toEqual([])
    })
  }, Infinity)

  test("a search runs for the text of the field while it holds one, and starts once for each text it holds", () => {
    property(({ events, first, settled }) => {
      const broken: Array<string> = []
      events.forEach((event, index) => {
        if (event._tag !== "Searching") return
        if (searches(events, index).includes(event.text)) broken.push(`${event.text} started twice`)
      })
      expect(broken).toEqual([])
      if (deaths(events).length > 0) return
      const { text } = finalState(first, events).own.field
      expect(searches(events, settled)).toEqual(text === "" ? [] : [text])
    })
  }, Infinity)

  // A key that comes back is a new start of its subscription: what an earlier start of the same key sends is not heard.
  // The search meets such a message in few of its scenarios, so it draws as many as the test of what they reach.
  test("a search's message reaches update only from the start that runs for the text the field holds", () => {
    property(({ events }) => {
      const late: Array<string> = []
      events.forEach((event, index) => {
        if (event._tag !== "Applied" || event.applied.message._tag !== "Found") return
        const { start, text } = event.applied.message
        if (event.applied.before.own.field.text !== text || superseded(events, text, start, index)) {
          late.push(`${text} of start ${start}`)
        }
      })
      expect(late).toEqual([])
    }, { numRuns: 2000 })
  }, Infinity)

  test("a subscription never starts again while its key stays", () => {
    property(({ events }) => {
      const starts = new Map<string, number>()
      for (const event of events) {
        if (event._tag === "Acquired") starts.set(event.listener, (starts.get(event.listener) ?? 0) + 1)
      }
      expect(Array.from(starts).filter(([, count]) => count > 1)).toEqual([])
    })
  }, Infinity)

  test("once everything has happened, the subscriptions holding resources are those of listening rows", () => {
    property(({ events, first, settled }) => {
      if (deaths(events).length > 0) return
      const ended = new Set(events.slice(0, settled).flatMap((event) => event._tag === "Ended" ? [event.listener] : []))
      expect(Array.from(holding(events, settled)).sort()).toEqual(
        listeners(finalState(first, events)).filter((key) => !ended.has(key))
      )
    })
  }, Infinity)
})

describe("Nothing outlives what acquired it", () => {
  test("a command has released what it acquired before its answer reaches update", () => {
    property(({ events }) => {
      const early = events.flatMap((event, index) =>
        Opt.toArray(answerOf(event)).filter((command) => !given(events.slice(0, index)).has(command))
      )
      expect(early).toEqual([])
    })
  }, Infinity)

  // Restated: the next message no longer waits for the releases of a state, and the effects of the next state do. A
  // start belongs to the state whose message brought its key: every subscription that state, or one before it, stopped
  // has released all before it starts, though later states may have stopped others meanwhile.
  test("the subscriptions a state stops are released before any start of that state or a later one", () => {
    property(({ events }) => {
      const broken: Array<string> = []
      events.forEach((event, index) => {
        if (event._tag !== "Acquired") return
        const done = released(events, index)
        // A key that comes back finds the subscription it had before released.
        const before = events.slice(0, index).flatMap((earlier) =>
          earlier._tag === "Acquired" && earlier.id === event.id ? [earlier.listener] : []
        )
        for (const key of before) if (!done.has(key)) broken.push(`${event.listener} started before ${key} ended`)
        const brought = events.findIndex((earlier) =>
          earlier._tag === "Applied" && listeners(earlier.applied.after).includes(event.listener)
          && !listeners(earlier.applied.before).includes(event.listener)
        )
        if (brought === -1) return
        const acquired = new Set(events.slice(0, index).flatMap((e) => e._tag === "Acquired" ? [e.listener] : []))
        for (const earlier of events.slice(0, brought + 1)) {
          if (earlier._tag !== "Applied") continue
          for (const key of stoppedBy(earlier.applied)) {
            if (acquired.has(key) && !done.has(key)) broken.push(`${event.listener} started before ${key} ended`)
          }
        }
      })
      expect(broken).toEqual([])
    })
  }, Infinity)

  test("once the run has ended, the subscriptions and the commands have released all", () => {
    property(({ events }) => {
      const acquired = events.flatMap((event) => event._tag === "Acquired" ? [event.listener] : [])
      const done = released(events, events.length)
      expect(acquired.filter((key) => !done.has(key))).toEqual([])
      const took = events.flatMap((event) => event._tag === "Took" ? [event.holder] : [])
      const gave = given(events)
      expect(took.filter((holder) => !gave.has(holder))).toEqual([])
    })
  }, Infinity)
})

describe("Logs do not pile up in a span", () => {
  test("what the run logs stays out of the span of whoever runs it, the parent of the spans opened in it", () => {
    property(({ events, caller }) => {
      expect((caller as Tracer.NativeSpan | undefined)?.events).toEqual([])
      const parents = events.flatMap((event) => event._tag === "Spanned" ? [Opt.getOrUndefined(event.parent)] : [])
      expect(parents.filter((parent) => parent !== caller?.spanId)).toEqual([])
    })
  }, Infinity)
})

describe("Nothing ends in silence", () => {
  test("the defects of the cause are those that happened, self-interruptions too, each where, in order", () => {
    property(({ exit, events }) => {
      expect(defects(exit)).toEqual(deaths(events))
    })
  }, Infinity)

  test("from the first defect on, the run applies no message", () => {
    property(
      ({ events }) => expect(sinceFirstDefect(events, ["Updated"])).toEqual([]),
      { numRuns: 1500, schedules: 4 }
    )
  }, Infinity)

  test("a subscription that ends while its key stays is heard ending", () => {
    property(({ events, first, settled }) => {
      if (deaths(events).length > 0) return
      const heard = new Set(
        applied(events).flatMap(({ message }) =>
          message._tag === "Rows" && message.message._tag === "Finished"
            ? [listener(message.message.born, message.message.session)]
            : []
        )
      )
      const ended = events.slice(0, settled).flatMap((event) => event._tag === "Ended" ? [event.listener] : [])
      const listening = listeners(finalState(first, events))
      expect(ended.filter((key) => listening.includes(key) && !heard.has(key))).toEqual([])
    })
  }, Infinity)
})

describe("A model is made only when it is read", () => {
  test("a model read after a notice is of the latest state, and the very same state has the very same model", () => {
    property(({ events, stateOf }) => {
      const broken: Array<string> = []
      let previous: Model | undefined
      events.forEach((event, index) => {
        // A message whose `onApplied` throws is heard, and its state never made: reads after a death are left out.
        if (event._tag !== "Read" || firstDeath(events) < index) return
        if (stateOf.get(event.model) !== sameStateAfter(events, stateOf, index)) {
          broken.push(`a ${event.why} read at ${index}`)
        }
        if (previous !== undefined && stateOf.get(previous) === stateOf.get(event.model) && previous !== event.model) {
          broken.push(`a new model of the same state at ${index}`)
        }
        previous = event.model
      })
      expect(broken).toEqual([])
    })
  }, Infinity)

  test("a model is made only when read, once for each state read", () => {
    property(({ events, made, last, stateOf }) => {
      const read = new Set(events.flatMap((event) => event._tag === "Read" ? [stateOf.get(event.model)] : []))
      if (last !== undefined) read.add(stateOf.get(last))
      expect(made).toBe(read.size)
    })
  }, Infinity)

  test("once everything has happened, a model read is of the last state", () => {
    property(({ events, last, stateOf }) => {
      if (deaths(events).length > 0) return
      expect(last === undefined ? undefined : stateOf.get(last)).toBe(sameStateAfter(events, stateOf))
    })
  }, Infinity)
})
