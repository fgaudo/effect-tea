// The contract of the testing tools: one program and its inputs given alike to each tool and to the run.
import { describe, expect, test } from "bun:test"
import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
import * as Data from "effect/Data"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Hash from "effect/Hash"
import * as HashMap from "effect/HashMap"
import * as Opt from "effect/Option"
import type * as Scope from "effect/Scope"
import { program } from "../compose.ts"
import { CompositionDefect, ProgramDefect } from "../defect.ts"
import type { Applied, Ignored } from "../engine.ts"
import type { Program } from "../program.ts"
import { reject, type Update } from "../update.ts"
import { applyAll } from "./apply-all.ts"
import { drive } from "./drive.ts"
import { rehearse } from "./rehearse.ts"
import { simulate } from "./simulate.ts"

// The same program and the same inputs, given to each testing tool and to the run (through `drive`): where the
// engine is deterministic, they must end in the same place.

// A draft saved by `Store`, whose answer waits for `answer`; while it saves, a subscription ticks once.
type Draft = Readonly<{ text: string; isSaving: boolean; saved: ReadonlyArray<string>; ticks: number }>
type Edit =
  | Readonly<{ _tag: "Typed"; text: string }>
  | Readonly<{ _tag: "Save" }>
  | Readonly<{ _tag: "Cancel" }>
  | Readonly<{ _tag: "Stored"; text: string }>
  | Readonly<{ _tag: "Tick" }>
type Store = Readonly<{ _tag: "Store"; text: string }>

const edit: Update<Draft, Edit, Store> = (message) => (draft) => {
  switch (message._tag) {
    case "Typed":
      return draft.isSaving ? reject : { state: { ...draft, text: message.text } }
    case "Save":
      return draft.isSaving || draft.text === ""
        ? reject
        : { state: { ...draft, isSaving: true }, commands: [{ _tag: "Store", text: draft.text }] }
    case "Cancel":
      return draft.isSaving ? { state: { ...draft, isSaving: false } } : reject
    case "Stored":
      return draft.isSaving ? { state: { ...draft, isSaving: false, saved: [...draft.saved, message.text] } } : reject
    case "Tick":
      return draft.isSaving ? { state: { ...draft, ticks: draft.ticks + 1 } } : reject
  }
}

type DraftModel = Readonly<{
  draft: Draft
  type: (text: string) => Opt.Option<Edit>
  save: Opt.Option<Edit>
  cancel: Opt.Option<Edit>
}>

const empty: Draft = { text: "", isSaving: false, saved: [], ticks: 0 }

const draftProgram = (
  answer: Effect.Effect<void>,
  ticking: boolean
): Program<{ state: Draft; model: DraftModel; message: Edit; command: Store }> => ({
  init: { state: empty },
  update: edit,
  runCommand: ({ text }) => Effect.as(answer, Opt.some<Edit>({ _tag: "Stored", text })),
  subscriptions: (draft) =>
    ticking && draft.isSaving
      ? HashMap.make([
        "ticks",
        Channel.succeed<Edit>({ _tag: "Tick" }).pipe(Channel.concatWith(() => Channel.never))
      ])
      : HashMap.empty(),
  makeModel: (draft) => ({
    draft,
    type: (text) => draft.isSaving ? Opt.none() : Opt.some({ _tag: "Typed", text }),
    save: draft.isSaving || draft.text === "" ? Opt.none() : Opt.some({ _tag: "Save" }),
    cancel: draft.isSaving ? Opt.some({ _tag: "Cancel" }) : Opt.none()
  })
})

const idle = ({ draft }: DraftModel) => draft.isSaving ? Opt.none() : Opt.some(draft)

/** Runs `scenario` with `drive`, and returns what `onApplied` and `onIgnored` heard. */
const recorded = Effect.fnUntraced(function*<A>(
  program: ReturnType<typeof draftProgram>,
  scenario: Parameters<typeof drive<Draft, DraftModel, Edit, Store, never, A>>[1],
  // Told the count of the messages ignored so far, each time one is.
  told: (ignored: number) => undefined = () => undefined
) {
  const applied: Array<Applied<Draft, Edit, Store>> = []
  const ignored: Array<Ignored<Draft, Edit>> = []
  const result = yield* drive(program, scenario, {
    onApplied: (heard) => void applied.push(heard),
    onIgnored: (heard) => told(ignored.push(heard))
  })
  return { result, applied, ignored }
})

describe("the testing tools and the run, on the same program and inputs", () => {
  test("a session the run records with onApplied plays again with applyAll, step by step", async () => {
    const { applied } = await Effect.runPromise(
      recorded(draftProgram(Effect.void, true), (driver) =>
        Effect.gen(function*() {
          yield* driver.send(({ type }) => type("a"))
          yield* driver.send(({ save }) => save)
          yield* driver.waitFor(({ draft }) => draft.saved.length === 1 ? Opt.some(draft) : Opt.none())
        }))
    )
    const replayed = applied.map((_, index) =>
      applyAll(edit)(applied.slice(0, index + 1).map(({ message }) => message), empty)
    )
    expect(replayed.map(({ state }) => state)).toEqual(applied.map(({ after }) => after))
    expect(replayed.at(-1)?.commands).toEqual(applied.flatMap(({ commands }) => commands))
  })

  test("simulate ends where the run ends, when every command answers at once and nothing ticks", async () => {
    const program = draftProgram(Effect.void, false)
    // Each message, with what shows that the run has applied it, its command's answer included.
    const steps: ReadonlyArray<readonly [Edit, (draft: Draft) => boolean]> = [
      [{ _tag: "Typed", text: "a" }, (draft) => draft.text === "a"],
      [{ _tag: "Save" }, (draft) => draft.saved.length === 1 && !draft.isSaving],
      [{ _tag: "Typed", text: "b" }, (draft) => draft.text === "b"],
      [{ _tag: "Save" }, (draft) => draft.saved.length === 2 && !draft.isSaving]
    ]
    const simulation = await Effect.runPromise(simulate(program)(steps.map(([message]) => message), program.init))
    const { result, applied } = await Effect.runPromise(recorded(
      program,
      Effect.fnUntraced(function*(driver) {
        let last = empty
        for (const [message, done] of steps) {
          yield* driver.send(() => Opt.some(message))
          last = yield* driver.waitFor(({ draft }) => done(draft) ? Opt.some(draft) : Opt.none())
        }
        return last
      })
    ))
    expect(result).toEqual(simulation.state)
    expect(applied.map(({ message }) => message)).toEqual([...simulation.messages])
    expect(applied.flatMap(({ commands }) => commands)).toEqual([...simulation.commands])
    expect(simulation.ignored).toEqual([])
  })

  test("rehearse and the run apply and ignore the same messages, a late answer and a tick included", async () => {
    const program = draftProgram(Effect.void, true)
    const rehearsed = await Effect.runPromise(rehearse(program, (rehearsal) =>
      Effect.gen(function*() {
        yield* rehearsal.send(({ type }) => type("a"))
        yield* rehearsal.send(({ save }) => save)
        yield* rehearsal.hearNext("ticks")
        yield* rehearsal.send(({ cancel }) => cancel)
        yield* rehearsal.run(() => true)
        return { state: yield* rehearsal.state, ignored: yield* rehearsal.ignored }
      })))
    const answer = await Effect.runPromise(Deferred.make<void>())
    const allIgnored = await Effect.runPromise(Deferred.make<void>())
    const { result, ignored } = await Effect.runPromise(
      recorded(
        draftProgram(Deferred.await(answer), true),
        (driver) =>
          Effect.gen(function*() {
            yield* driver.send(({ type }) => type("a"))
            yield* driver.send(({ save }) => save)
            yield* driver.waitFor(({ draft }) => draft.ticks === 1 ? Opt.some(draft) : Opt.none())
            yield* driver.send(({ cancel }) => cancel)
            const cancelled = yield* driver.waitFor(idle)
            yield* Deferred.succeed(answer, undefined)
            // The late answer is ignored, so no model shows it: `onIgnored` tells. Bounded, so that a run that ignores
            // fewer than `rehearse` still ends.
            yield* Effect.timeoutOption(Deferred.await(allIgnored), "1 second")
            return cancelled
          }),
        (count) => void (count === rehearsed.ignored.length && Deferred.doneUnsafe(allIgnored, Exit.void))
      )
    )
    expect(result).toEqual(rehearsed.state)
    expect(ignored.map(({ message }) => message)).toEqual([...rehearsed.ignored])
  })
})

describe("the order of the answers of commands started together", () => {
  // `Go` starts `A` and `B`; `A`'s answer starts `C`. Every command answers at once, and `update` writes down the
  // order in which the answers arrive.
  type Order = Readonly<{ heard: ReadonlyArray<string> }>
  type Answer = Readonly<{ _tag: "Go" }> | Readonly<{ _tag: "Answered"; by: string }>
  const ordered: Program<{ state: Order; model: Order; message: Answer; command: string }> = {
    init: { state: { heard: [] } },
    update: (message) => ({ heard }) =>
      message._tag === "Go"
        ? { state: { heard }, commands: ["A", "B"] }
        : { state: { heard: [...heard, message.by] }, commands: message.by === "A" ? ["C"] : [] },
    runCommand: (command) => Effect.succeedSome<Answer>({ _tag: "Answered", by: command }),
    subscriptions: () => HashMap.empty(),
    makeModel: (order) => order
  }

  const inTheRun = () =>
    Effect.runPromise(drive(ordered, (driver) =>
      Effect.gen(function*() {
        yield* driver.send(() => Opt.some({ _tag: "Go" }))
        return yield* driver.waitFor(({ heard }) => heard.length === 3 ? Opt.some(heard) : Opt.none())
      })))

  test("in the run, the answers of commands started together are heard in the order they started, before those of the commands they start", async () => {
    expect(await inTheRun()).toEqual(["A", "B", "C"])
  })

  test("rehearse, running the oldest pending command first, hears them as the run does", async () => {
    const heard = await Effect.runPromise(rehearse(ordered, (rehearsal) =>
      Effect.gen(function*() {
        yield* rehearsal.send(() => Opt.some({ _tag: "Go" }))
        yield* rehearsal.runAll
        return (yield* rehearsal.state).heard
      })))
    expect(heard).toEqual(await inTheRun())
  })

  test("simulate, running the oldest started command first, hears them as the run does", async () => {
    const simulation = await Effect.runPromise(simulate(ordered)([{ _tag: "Go" }], ordered.init))
    expect(simulation.state.heard).toEqual(await inTheRun())
  })
})

describe("a subscription that sends A, then ends with B", () => {
  // Listens under `k` while `listening`; `Stop` and `Listen` make the key go away and come back.
  type Log = Readonly<{ heard: ReadonlyArray<string>; listening: boolean }>
  type Said = "A" | "B" | "Stop" | "Listen"
  const said: Program<{ state: Log; model: Log; message: Said }> = {
    init: { state: { heard: [], listening: true } },
    update: (message) => (log) =>
      message === "Stop" || message === "Listen"
        ? { state: { ...log, listening: message === "Listen" } }
        : { state: { ...log, heard: [...log.heard, message] } },
    subscriptions: ({ listening }) =>
      listening
        ? HashMap.make(["k", Channel.succeed<Said>("A").pipe(Channel.concatWith(() => Channel.end<Said>("B")))])
        : HashMap.empty(),
    makeModel: (log) => log
  }

  test("in the run, it is heard once to its end, under a key that stays, and again once its key comes back", async () => {
    const heard = await Effect.runPromise(drive(
      said,
      Effect.fnUntraced(function*(driver) {
        yield* driver.waitFor(({ heard }) => heard.length === 2 ? Opt.some(heard) : Opt.none())
        // Long enough for a subscription that started again to be heard.
        yield* Effect.sleep("50 millis")
        yield* driver.send(() => Opt.some("Stop"))
        yield* driver.send(() => Opt.some("Listen"))
        return yield* driver.waitFor(({ heard }) => heard.length >= 4 ? Opt.some(heard) : Opt.none())
      })
    ))
    expect(heard).toEqual(["A", "B", "A", "B"])
  })

  test("rehearse's hearNext hears it as the run does, and nothing more until its key comes back", async () => {
    const { heard, failures } = await Effect.runPromise(rehearse(
      said,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.hearNext("k")
        yield* rehearsal.hearNext("k")
        const failures = yield* Effect.forEach(
          [rehearsal.hearNext("k"), rehearsal.hear("k", "A")],
          (after) =>
            Effect.map(Effect.exit(after), (exit) => Exit.isFailure(exit) ? String(Cause.squash(exit.cause)) : "")
        )
        yield* rehearsal.send(() => Opt.some("Stop"))
        yield* rehearsal.send(() => Opt.some("Listen"))
        yield* rehearsal.hearNext("k")
        yield* rehearsal.hearNext("k")
        return { heard: (yield* rehearsal.state).heard, failures }
      })
    ))
    expect(heard).toEqual(["A", "B", "A", "B"])
    expect(failures).toEqual([
      expect.stringContaining("The subscription under k has ended"),
      expect.stringContaining("The subscription under k has ended")
    ])
  })
})

describe("how a stopped subscription ends", () => {
  // Listening under `ticks` until the first `Tick`, which makes the key go away; the subscription tells `ended` how
  // it ended, as a release that reads its exit sees it.
  type Listening = Readonly<{ listening: boolean }>
  type Listener = Program<{ state: Listening; model: Listening; message: "Tick" }>
  const listener = (ended: Deferred.Deferred<string>): Listener => ({
    init: { state: { listening: true } },
    update: () => () => ({ state: { listening: false } }),
    subscriptions: ({ listening }) =>
      listening
        ? HashMap.make([
          "ticks",
          Channel.succeed<"Tick">("Tick").pipe(
            Channel.concatWith(() => Channel.never),
            Channel.onExit((exit) =>
              Deferred.succeed(
                ended,
                Exit.isSuccess(exit) ? "ended" : Cause.hasInterruptsOnly(exit.cause) ? "interrupted" : "failed"
              )
            )
          )
        ])
        : HashMap.empty(),
    makeModel: (listening) => listening
  })

  test("in the run, the subscription whose key went away is interrupted", async () => {
    const end = await Effect.runPromise(Effect.gen(function*() {
      const ended = yield* Deferred.make<string>()
      return yield* drive(listener(ended), () => Deferred.await(ended))
    }))
    expect(end).toBe("interrupted")
  })

  test("rehearse interrupts the subscription hearNext started once its key goes away, as the run does", async () => {
    const end = await Effect.runPromise(Effect.gen(function*() {
      const ended = yield* Deferred.make<string>()
      return yield* rehearse(
        listener(ended),
        (rehearsal) => Effect.andThen(rehearsal.hearNext("ticks"), Deferred.await(ended))
      )
    }))
    expect(end).toBe("interrupted")
  })

  test("rehearse fails, as the run dies, on a defect of what a subscription releases when the scenario ends", async () => {
    const dying: Listener = {
      ...listener(Deferred.makeUnsafe<string>()),
      subscriptions: () =>
        HashMap.make([
          "ticks",
          Channel.succeed<"Tick">("Tick").pipe(
            Channel.concatWith(() => Channel.never),
            Channel.onExit(() => Effect.die("release"))
          )
        ])
    }
    const exit = await Effect.runPromiseExit(rehearse(dying, (rehearsal) => rehearsal.hearNext("ticks")))
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(defect instanceof ProgramDefect && defect.where === "subscription" && defect.cause).toBe("release")
  })

  // The run interrupted by whoever runs it keeps such a defect in its cause ("a subscription that dies while an
  // interrupted run releases it is in the cause", `run.test.ts`); `drive` stops the run when the scenario ends.
  test("drive fails, as the run dies, on a defect of what a subscription releases when the scenario ends", async () => {
    const dying: Listener = {
      ...listener(Deferred.makeUnsafe<string>()),
      update: () => (state) => ({ state }),
      subscriptions: () =>
        HashMap.make([
          "ticks",
          Channel.succeed<"Tick">("Tick").pipe(
            Channel.concatWith(() => Channel.never),
            Channel.onExit(() => Effect.die("release"))
          )
        ])
    }
    const exit = await Effect.runPromiseExit(drive(dying, (driver) => driver.model))
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(defect instanceof ProgramDefect && defect.where === "subscription" && defect.cause).toBe("release")
  })

  // `Stop` makes the key go away; the subscription ticks once, then waits, and dies as it releases what it holds.
  type Stopping = Program<{ state: Listening; model: Listening; message: "Tick" | "Stop" }>
  const stopping: Stopping = {
    init: { state: { listening: true } },
    update: (message) => (state) => message === "Stop" ? { state: { listening: false } } : { state },
    subscriptions: ({ listening }) =>
      listening
        ? HashMap.make([
          "ticks",
          Channel.succeed<"Tick" | "Stop">("Tick").pipe(
            Channel.concatWith(() => Channel.never),
            Channel.onExit(() => Effect.die("release"))
          )
        ])
        : HashMap.empty(),
    makeModel: (listening) => listening
  }
  // Each reason of the cause: the defect a `ProgramDefect` holds, or the tag of what is not a defect.
  const reasonsOf = (exit: Exit.Exit<unknown, unknown>) =>
    Exit.isFailure(exit)
      ? exit.cause.reasons.map((reason) =>
        Cause.isDieReason(reason) && reason.defect instanceof ProgramDefect ? reason.defect.cause : reason._tag
      )
      : []

  test("in the run, a defect of what a stopped subscription releases is all the cause holds", async () => {
    const exit = await Effect.runPromiseExit(drive(
      stopping,
      Effect.fnUntraced(function*(driver) {
        yield* driver.send(() => Opt.some("Stop"))
        return yield* Effect.never
      })
    ))
    expect(reasonsOf(exit)).toEqual(["release"])
  })

  // `Stop` starts `Note` too: the step whose release dies goes on whole, its state written and its commands started,
  // until the end of the run stops its loop. The run's renderer is stopped first, so `onApplied` is what shows it.
  const noting: Program<{ state: Listening; model: Listening; message: "Tick" | "Stop"; command: "Note" }> = {
    ...stopping,
    update: (message) => (state) =>
      message === "Stop" ? { state: { listening: false }, commands: ["Note"] } : { state },
    runCommand: () => Effect.succeedNone
  }

  test("in the run, the message whose release dies is applied whole, with its commands", async () => {
    const applied: Array<unknown> = []
    const exit = await Effect.runPromiseExit(drive(
      noting,
      (driver) => Effect.andThen(driver.send(() => Opt.some("Stop")), Effect.never),
      {
        onApplied: ({ message, after, commands }) => {
          if (message === "Stop") applied.push({ after, commands })
        }
      }
    ))
    expect(reasonsOf(exit)).toEqual(["release"])
    expect(applied).toEqual([{ after: { listening: false }, commands: ["Note"] }])
  })

  // The call that sent it returns, as the run's dispatch does; what is asked after it fails with the defect, and so
  // does the rehearsal.
  test("rehearse applies the message whose release dies whole, as the run does, its commands owed", async () => {
    const seen: Array<unknown> = []
    const exit = await Effect.runPromiseExit(rehearse(
      noting,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.hearNext("ticks")
        const sent = yield* Effect.exit(rehearsal.send(() => Opt.some("Stop")))
        const after = yield* Effect.exit(rehearsal.send(() => Opt.some("Tick")))
        seen.push(Exit.isSuccess(sent), yield* rehearsal.state, yield* rehearsal.pending, reasonsOf(after))
      })
    ))
    expect(reasonsOf(exit)).toEqual(["release"])
    expect(seen).toEqual([true, { listening: false }, ["Note"], ["release"]])
  })

  // A `hearNext` waiting when the key goes away fails with what its subscription ended with, the interruption by the
  // rehearsal included; the scenario that joins it fails with that, and still the rehearsal's cause holds the defect
  // alone, as the run's does. The call waits on the start once its job is done, which `Tick`, sent after it, waits for;
  // one whose job comes after `Stop` finds the key gone, and is told once `Stop`'s job has released it, all the same.
  test("rehearse fails with the defect alone, as the run dies, though a hearNext waited", async () => {
    const exits = await Effect.runPromise(Effect.forEach([true, false], (waits) =>
      Effect.exit(rehearse(
        stopping,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext("ticks")
          // Started on this stack, the call has offered its job before `Tick` and `Stop` are sent.
          const waiting = yield* Effect.forkChild(rehearsal.hearNext("ticks"), { startImmediately: true })
          if (waits) yield* rehearsal.send(() => Opt.some("Tick"))
          yield* Effect.exit(rehearsal.send(() => Opt.some("Stop")))
          return yield* Fiber.join(waiting)
        })
      ))))
    expect(exits.map(reasonsOf)).toEqual([["release"], ["release"]])
  })

  // What the subscription releases tells `releasing`, then waits until the test has seen the state `Stop` left: the
  // run makes a state current before it stops the subscriptions the state takes away.
  const awaiting = (releasing: Deferred.Deferred<void>, seen: Deferred.Deferred<void>): Stopping => ({
    ...stopping,
    subscriptions: ({ listening }) =>
      listening
        ? HashMap.make([
          "ticks",
          Channel.succeed<"Tick" | "Stop">("Tick").pipe(
            Channel.concatWith(() => Channel.never),
            Channel.onExit(() => Effect.andThen(Deferred.succeed(releasing, undefined), Deferred.await(seen)))
          )
        ])
        : HashMap.empty()
  })

  test("in the run, a stopped subscription releases once the state that stopped it is current", async () => {
    const shown = await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const seen = yield* Deferred.make<void>()
      return yield* drive(
        awaiting(releasing, seen),
        Effect.fnUntraced(function*(driver) {
          yield* driver.send(() => Opt.some("Stop"))
          yield* Deferred.await(releasing)
          const shown = yield* driver.waitFor((model) => model.listening ? Opt.none() : Opt.some(model))
          yield* Deferred.succeed(seen, undefined)
          return shown
        })
      )
    }))
    expect(shown).toEqual({ listening: false })
  })

  test("rehearse writes the state that stops a subscription before its release, as the run makes it current", async () => {
    const shown = await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const seen = yield* Deferred.make<void>()
      return yield* rehearse(
        awaiting(releasing, seen),
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext("ticks")
          const stopped = yield* Effect.forkChild(rehearsal.send(() => Opt.some("Stop")), { startImmediately: true })
          yield* Deferred.await(releasing)
          const shown = [yield* rehearsal.state, yield* rehearsal.model]
          yield* Deferred.succeed(seen, undefined)
          yield* Fiber.join(stopped)
          return shown
        })
      )
    }))
    expect(shown).toEqual([{ listening: false }, { listening: false }])
  })
})

describe("a subscription that depends on more of the state than its key", () => {
  // Under the one key `seen`, the subscription holds the count of the state it is listed in, and ends with it once
  // `gate` opens; `Inc` counts up while the key stays.
  type Counted = Readonly<{ count: number; seen: ReadonlyArray<number> }>
  type Counting = Readonly<{ _tag: "Inc" }> | Readonly<{ _tag: "Seen"; count: number }>
  const counted = (gate: Effect.Effect<void>): Program<{ state: Counted; model: Counted; message: Counting }> => ({
    init: { state: { count: 0, seen: [] } },
    update: (message) => (state) =>
      message._tag === "Inc"
        ? { state: { ...state, count: state.count + 1 } }
        : { state: { ...state, seen: [...state.seen, message.count] } },
    subscriptions: ({ count }) =>
      HashMap.make(["seen", Channel.unwrap(Effect.as(gate, Channel.end<Counting>({ _tag: "Seen", count })))]),
    makeModel: (state) => state
  })

  test("rehearse's hearNext runs the subscription listed when its key appeared, as the run starts it", async () => {
    const rehearsed = await Effect.runPromise(rehearse(
      counted(Effect.void),
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send(() => Opt.some({ _tag: "Inc" }))
        yield* rehearsal.hearNext("seen")
        return (yield* rehearsal.state).seen
      })
    ))
    const ran = await Effect.runPromise(Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      return yield* drive(
        counted(Deferred.await(gate)),
        Effect.fnUntraced(function*(driver) {
          yield* driver.send(() => Opt.some({ _tag: "Inc" }))
          yield* driver.waitFor(({ count }) => count === 1 ? Opt.some(count) : Opt.none())
          yield* Deferred.succeed(gate, undefined)
          return yield* driver.waitFor(({ seen }) => seen.length === 1 ? Opt.some(seen) : Opt.none())
        })
      )
    }))
    expect(rehearsed).toEqual(ran)
  })
})

describe("what the run dies of, and the tools fail on", () => {
  // A row by id, listening under `ticks`; `Doubled` makes the parent's `subscribed` list its id twice, which the
  // run's reconciliation of the parent's subscriptions finds in the state `Doubled` leaves.
  type Row = Readonly<{ seen: number }>
  const row: Program<{ state: Row; model: number; message: "Seen" }> = {
    init: { state: { seen: 0 } },
    update: () => ({ seen }) => ({ state: { seen: seen + 1 } }),
    subscriptions: () => HashMap.make(["ticks", Channel.never]),
    makeModel: ({ seen }) => seen
  }
  type Table = Readonly<{ row: Row; twice: boolean }>
  const { childById, make } = program<{ state: Table; message: "Doubled" }>()
  const table = make({
    init: (children) => ({ state: { row: children.Row.init(1).state, twice: false } }),
    children: {
      Row: childById(row, {
        get: (state, id: number) => id === 1 ? Opt.some(state.row) : Opt.none(),
        set: (state, _, row) => ({ ...state, row }),
        subscribed: (state) => state.twice ? [[1, state.row], [1, state.row]] : [[1, state.row]]
      })
    },
    update: (_: "Doubled") => (state) => ({ state: { ...state, twice: true } }),
    makeModel: ({ twice }) => ({ double: twice ? Opt.none<"Doubled">() : Opt.some<"Doubled">("Doubled") })
  })

  const isCompositionDefect = (exit: Exit.Exit<unknown>) => {
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return (defect instanceof ProgramDefect ? defect.cause : defect) instanceof CompositionDefect
  }

  test("the run dies of a state whose subscriptions are a defect", async () => {
    const exit = await Effect.runPromiseExit(drive(
      table,
      Effect.fnUntraced(function*(driver) {
        yield* driver.send(({ double }) => double)
        yield* driver.waitFor(({ double }) => Opt.isNone(double) ? Opt.some(true) : Opt.none())
      })
    ))
    expect(isCompositionDefect(exit)).toBe(true)
  })

  // Neither tool runs the subscriptions, but both read them on each new state, as the run does.
  test("rehearse fails, as the run dies, on a state whose subscriptions are a defect", async () => {
    const exit = await Effect.runPromiseExit(rehearse(table, (rehearsal) => rehearsal.send(({ double }) => double)))
    expect(isCompositionDefect(exit)).toBe(true)
  })

  // The run makes the state current before it reads its subscriptions: what the test reads of the state after the
  // defect is the state the message left.
  test("rehearse keeps the state whose subscriptions are a defect, as the run makes it current", async () => {
    const twice: Array<boolean> = []
    const exit = await Effect.runPromiseExit(rehearse(
      table,
      Effect.fnUntraced(function*(rehearsal) {
        yield* Effect.exit(rehearsal.send(({ double }) => double))
        twice.push((yield* rehearsal.state).twice)
      })
    ))
    expect(isCompositionDefect(exit)).toBe(true)
    expect(twice).toEqual([true])
  })

  test("simulate fails, as the run dies, on a state whose subscriptions are a defect", async () => {
    const exit = await Effect.runPromiseExit(simulate(table)(["Doubled"], table.init))
    expect(isCompositionDefect(exit)).toBe(true)
  })

  // A key whose Equal throws, under the same hash as every other: no state lists two, so only a comparison with
  // the keys of the state before finds it, as the run's reconciliation does ("a key whose Equal throws dies in
  // subscriptions", `run.test.ts`).
  class Throwing implements Equal.Equal {
    [Equal.symbol](): boolean {
      throw new Error("boom")
    }
    [Hash.symbol](): number {
      return 0
    }
  }
  const renewing: Program<{ state: Row; model: number; message: "Seen" }> = {
    ...row,
    subscriptions: () => HashMap.make([new Throwing(), Channel.never])
  }
  const diesInSubscriptions = (exit: Exit.Exit<unknown>) => {
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return defect instanceof ProgramDefect && defect.where === "subscriptions"
  }

  test("simulate fails, as the run dies, on a key whose Equal throws against the key of the state before", async () => {
    const exit = await Effect.runPromiseExit(simulate(renewing)(["Seen"], renewing.init))
    expect(diesInSubscriptions(exit)).toBe(true)
  })

  test("rehearse fails, as the run dies, on a key whose Equal throws against the key of the state before", async () => {
    const exit = await Effect.runPromiseExit(rehearse(renewing, (rehearsal) => rehearsal.send(() => Opt.some("Seen"))))
    expect(diesInSubscriptions(exit)).toBe(true)
  })

  // A command or a subscription that interrupts itself is a defect of the run (`diesIn`), and of the tools, which
  // would otherwise interrupt the test's own fiber, with no defect that says where.
  const diedIn = (exit: Exit.Exit<unknown>) => {
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return defect instanceof ProgramDefect ? defect.where : undefined
  }

  const quitting: Program<{ state: Row; model: number; message: "Go"; command: "Quit" }> = {
    init: { state: { seen: 0 } },
    update: () => (state) => ({ state, commands: ["Quit"] }),
    runCommand: () => Effect.interrupt,
    subscriptions: () => HashMap.empty(),
    makeModel: ({ seen }) => seen
  }

  test("simulate fails with a defect, as the run dies, on a command interrupting itself", async () => {
    const exit = await Effect.runPromiseExit(simulate(quitting)(["Go"], quitting.init))
    expect(diedIn(exit)).toBe("command")
  })

  test("rehearse fails with a defect, as the run dies, on a command interrupting itself", async () => {
    const exit = await Effect.runPromiseExit(
      rehearse(quitting, (rehearsal) => rehearsal.send(() => Opt.some("Go")).pipe(Effect.andThen(rehearsal.runAll)))
    )
    expect(diedIn(exit)).toBe("command")
  })

  test("the run dies with a defect of a command interrupting itself", async () => {
    const exit = await Effect.runPromiseExit(drive(
      quitting,
      Effect.fnUntraced(function*(driver) {
        yield* driver.send(() => Opt.some("Go"))
        // The run dies before any model could end the wait.
        return yield* driver.waitFor(() => Opt.none())
      })
    ))
    expect(diedIn(exit)).toBe("command")
  })

  test("rehearse fails with a defect, as the run dies, on a subscription interrupting itself", async () => {
    const leaving: Program<{ state: Row; model: number; message: "Seen" }> = {
      ...row,
      subscriptions: () =>
        HashMap.make(["ticks", Channel.fromEffect(Effect.interrupt).pipe(Channel.mapDone((): "Seen" => "Seen"))])
    }
    const exit = await Effect.runPromiseExit(rehearse(leaving, (rehearsal) => rehearsal.hearNext("ticks")))
    expect(diedIn(exit)).toBe("subscription")
  })

  // One that interrupts itself just as it is interrupted, with both interruptions in its cause, is still a defect
  // (`diesIn`). The gate is the fiber's own: uninterruptible, it waits until the interruption has reached it, then
  // joins a fiber it interrupted.
  const untilInterrupted: Effect.Effect<void> = Effect.suspend(() =>
    Effect.exit(Effect.interruptible(Effect.void)).pipe(
      Effect.flatMap((exit) =>
        Exit.isFailure(exit) ? Effect.void : Effect.yieldNow.pipe(Effect.andThen(untilInterrupted))
      )
    )
  )

  const interruptsItselfOnceInterrupted = (started: Deferred.Deferred<void>) =>
    Effect.uninterruptible(Effect.gen(function*() {
      yield* Deferred.succeed(started, undefined)
      yield* untilInterrupted
      const interrupted = yield* Effect.forkChild(Effect.never)
      yield* Fiber.interrupt(interrupted)
      return yield* Fiber.join(interrupted)
    }))

  const lingering = (started: Deferred.Deferred<void>) =>
    ({
      ...quitting,
      runCommand: () => interruptsItselfOnceInterrupted(started)
    }) satisfies typeof quitting

  const interruptedOnce = (running: (started: Deferred.Deferred<void>) => Effect.Effect<unknown>) =>
    Effect.runPromiseExit(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const fiber = yield* Effect.forkChild(running(started))
      yield* Deferred.await(started)
      yield* Fiber.interrupt(fiber)
      return yield* Fiber.await(fiber)
    })).then((outcome) => Exit.isSuccess(outcome) ? outcome.value : outcome)

  test("the run dies with a defect of a command interrupting itself as whoever runs it interrupts it", async () => {
    const exit = await interruptedOnce((started) =>
      drive(lingering(started), (driver) => driver.send(() => Opt.some("Go")).pipe(Effect.andThen(Effect.never)))
    )
    expect(diedIn(exit)).toBe("command")
  })

  test("rehearse fails with a defect of a command interrupting itself as whoever runs it interrupts it", async () => {
    const exit = await interruptedOnce((started) =>
      rehearse(
        lingering(started),
        (rehearsal) => rehearsal.send(() => Opt.some("Go")).pipe(Effect.andThen(rehearsal.run(() => true)))
      )
    )
    expect(diedIn(exit)).toBe("command")
  })

  test("simulate fails with a defect of a command interrupting itself as whoever runs it interrupts it", async () => {
    const exit = await interruptedOnce((started) => simulate(lingering(started))(["Go"], quitting.init))
    expect(diedIn(exit)).toBe("command")
  })

  const stopping = (started: Deferred.Deferred<void>): Program<{ state: Row; model: number; message: "Seen" }> => ({
    ...row,
    subscriptions: ({ seen }) =>
      seen === 0
        ? HashMap.make(["ticks", Channel.fromEffectDone(interruptsItselfOnceInterrupted(started))])
        : HashMap.empty()
  })

  test("the run dies with a defect of a subscription interrupting itself as the run stops it", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      return yield* drive(
        stopping(started),
        Effect.fnUntraced(function*(driver) {
          yield* Deferred.await(started)
          yield* driver.send(() => Opt.some("Seen"))
          return yield* driver.waitFor(() => Opt.none())
        })
      )
    }))
    expect(diedIn(exit)).toBe("subscription")
  })

  test("rehearse fails with a defect of a subscription interrupting itself as it stops it", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      return yield* rehearse(
        stopping(started),
        Effect.fnUntraced(function*(rehearsal) {
          yield* Effect.forkChild(rehearsal.hearNext("ticks"))
          yield* Deferred.await(started)
          yield* rehearsal.send(() => Opt.some("Seen"))
        })
      )
    }))
    expect(diedIn(exit)).toBe("subscription")
  })

  // A tool that runs in its caller's fiber stops a command as that fiber, which may have interrupted a fiber before: a
  // command that joins it, as it is stopped, interrupts itself with the very fiber id of what it received. The run
  // stops it from a fiber of its own, and is the reference.
  const joinsOnceInterrupted = (started: Deferred.Deferred<void>, stale: Fiber.Fiber<never>) =>
    ({
      ...quitting,
      runCommand: () =>
        Effect.uninterruptible(Effect.gen(function*() {
          yield* Deferred.succeed(started, undefined)
          yield* untilInterrupted
          return yield* Fiber.join(stale)
        }))
    }) satisfies typeof quitting

  /** Runs what `running` gives in a fiber that interrupted `stale` itself, and interrupts that fiber once started. */
  const endedByTheFiberThatInterrupted = (
    running: (started: Deferred.Deferred<void>, stale: Fiber.Fiber<never>) => Effect.Effect<unknown>
  ) =>
    interruptedOnce((started) =>
      Effect.gen(function*() {
        const stale = yield* Effect.forkDetach(Effect.never)
        yield* Fiber.interrupt(stale)
        return yield* running(started, stale)
      })
    )

  test("the run dies with a defect of a command joining, as it is stopped, a fiber its caller interrupted", async () => {
    const exit = await endedByTheFiberThatInterrupted((started, stale) =>
      drive(
        joinsOnceInterrupted(started, stale),
        (driver) => driver.send(() => Opt.some("Go")).pipe(Effect.andThen(Effect.never))
      )
    )
    expect(diedIn(exit)).toBe("command")
  })

  test("rehearse fails with a defect of a command joining, as its run is stopped, a fiber its caller interrupted", async () => {
    const exit = await endedByTheFiberThatInterrupted((started, stale) =>
      rehearse(
        joinsOnceInterrupted(started, stale),
        (rehearsal) => rehearsal.send(() => Opt.some("Go")).pipe(Effect.andThen(rehearsal.run(() => true)))
      )
    )
    expect(diedIn(exit)).toBe("command")
  })

  test("simulate fails with a defect of a command joining, as it is stopped, a fiber its caller interrupted", async () => {
    const exit = await endedByTheFiberThatInterrupted((started, stale) =>
      simulate(joinsOnceInterrupted(started, stale))(["Go"], quitting.init)
    )
    expect(diedIn(exit)).toBe("command")
  })

  // `simulate` runs a command in the fiber it runs in: whoever interrupts it stops the command as itself, and may have
  // interrupted a fiber before.
  const interruptedByTheFiberThatInterrupted = (
    running: (started: Deferred.Deferred<void>, stale: Fiber.Fiber<never>) => Effect.Effect<unknown>
  ) =>
    Effect.runPromiseExit(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const stale = yield* Effect.forkDetach(Effect.never)
      yield* Fiber.interrupt(stale)
      const fiber = yield* Effect.forkChild(running(started, stale))
      yield* Deferred.await(started)
      yield* Fiber.interrupt(fiber)
      return yield* Fiber.await(fiber)
    })).then((outcome) => Exit.isSuccess(outcome) ? outcome.value : outcome)

  test("the run dies with a defect of a command joining, as it is stopped, a fiber its interrupter interrupted", async () => {
    const exit = await interruptedByTheFiberThatInterrupted((started, stale) =>
      drive(
        joinsOnceInterrupted(started, stale),
        (driver) => driver.send(() => Opt.some("Go")).pipe(Effect.andThen(Effect.never))
      )
    )
    expect(diedIn(exit)).toBe("command")
  })

  test("simulate fails with a defect of a command joining, as it is stopped, a fiber its interrupter interrupted", async () => {
    const exit = await interruptedByTheFiberThatInterrupted((started, stale) =>
      simulate(joinsOnceInterrupted(started, stale))(["Go"], quitting.init)
    )
    expect(diedIn(exit)).toBe("command")
  })

  test("rehearse fails with a defect of a command joining, as its run is stopped, a fiber its interrupter interrupted", async () => {
    const exit = await interruptedByTheFiberThatInterrupted((started, stale) =>
      rehearse(
        joinsOnceInterrupted(started, stale),
        (rehearsal) => rehearsal.send(() => Opt.some("Go")).pipe(Effect.andThen(rehearsal.run(() => true)))
      )
    )
    expect(diedIn(exit)).toBe("command")
  })

  // The end of a tool stops a command still under way, as the end of the run does, not as the fiber that ends it.
  const underWayAtTheEnd = <A>(tool: (stale: Fiber.Fiber<never>) => Effect.Effect<A>) =>
    Effect.runPromiseExit(Effect.gen(function*() {
      const stale = yield* Effect.forkDetach(Effect.never)
      yield* Fiber.interrupt(stale)
      return yield* tool(stale)
    }))

  test("the run dies with a defect of a command joining, as its end stops it, a fiber its caller interrupted", async () => {
    const exit = await underWayAtTheEnd((stale) =>
      Effect.flatMap(Deferred.make<void>(), (started) =>
        drive(
          joinsOnceInterrupted(started, stale),
          (driver) => Effect.andThen(driver.send(() => Opt.some("Go")), Deferred.await(started))
        ))
    )
    expect(diedIn(exit)).toBe("command")
  })

  test("rehearse fails with a defect of a command joining, as its end stops it, a fiber its caller interrupted", async () => {
    const exit = await underWayAtTheEnd((stale) =>
      Effect.flatMap(
        Deferred.make<void>(),
        (started) =>
          rehearse(
            joinsOnceInterrupted(started, stale),
            Effect.fnUntraced(function*(rehearsal) {
              yield* rehearsal.send(() => Opt.some("Go"))
              yield* Effect.forkDetach(rehearsal.run(() => true))
              yield* Deferred.await(started)
            })
          )
      )
    )
    expect(diedIn(exit)).toBe("command")
  })

  // Likewise a subscription still running at the end, which the close of the tool's scope would interrupt as the fiber
  // that ends it.
  const listensOnceInterrupted = (
    started: Deferred.Deferred<void>,
    stale: Fiber.Fiber<never>
  ): Program<{ state: Row; model: number; message: "Seen" }> => ({
    ...row,
    subscriptions: () =>
      HashMap.make([
        "ticks",
        Channel.fromEffectDone(Effect.uninterruptible(Effect.gen(function*() {
          yield* Deferred.succeed(started, undefined)
          yield* untilInterrupted
          return yield* Fiber.join(stale)
        })))
      ])
  })

  test("the run dies with a defect of a subscription joining, as its end stops it, a fiber its caller interrupted", async () => {
    const exit = await underWayAtTheEnd((stale) =>
      Effect.flatMap(
        Deferred.make<void>(),
        (started) => drive(listensOnceInterrupted(started, stale), () => Deferred.await(started))
      )
    )
    expect(diedIn(exit)).toBe("subscription")
  })

  test("rehearse fails with a defect of a subscription joining, as its end stops it, a fiber its caller interrupted", async () => {
    const exit = await underWayAtTheEnd((stale) =>
      Effect.flatMap(
        Deferred.make<void>(),
        (started) =>
          rehearse(
            listensOnceInterrupted(started, stale),
            Effect.fnUntraced(function*(rehearsal) {
              yield* Effect.forkDetach(rehearsal.hearNext("ticks"))
              yield* Deferred.await(started)
            })
          )
      )
    )
    expect(diedIn(exit)).toBe("subscription")
  })

  // A subscription may read the fiber id of the interruption it received, and interrupt a fiber of its own as that id:
  // the join of that fiber is its own interruption, which only the mark of the run's tells from the one it received.
  const forgesTheIdItReceived = (started: Deferred.Deferred<void>) =>
    Effect.uninterruptible(Effect.gen(function*() {
      yield* Deferred.succeed(started, undefined)
      const received = yield* Effect.exit(Effect.interruptible(Effect.never))
      const reason = Exit.isFailure(received) ? received.cause.reasons.find(Cause.isInterruptReason) : undefined
      const work = yield* Effect.forkChild(Effect.never)
      yield* Fiber.interruptAs(work, reason?.fiberId)
      return yield* Fiber.join(work)
    }))

  const forging = (started: Deferred.Deferred<void>): Program<{ state: Row; model: number; message: "Seen" }> => ({
    ...row,
    subscriptions: ({ seen }) =>
      seen === 0 ? HashMap.make(["ticks", Channel.fromEffectDone(forgesTheIdItReceived(started))]) : HashMap.empty()
  })

  test("the run dies with a defect of a subscription interrupting itself as the fiber that stops it", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      return yield* drive(
        forging(started),
        Effect.fnUntraced(function*(driver) {
          yield* Deferred.await(started)
          yield* driver.send(() => Opt.some("Seen"))
          return yield* driver.waitFor(() => Opt.none())
        })
      )
    }))
    expect(diedIn(exit)).toBe("subscription")
  })

  test("rehearse fails with a defect of a subscription interrupting itself as the fiber that stops it", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      return yield* rehearse(
        forging(started),
        Effect.fnUntraced(function*(rehearsal) {
          yield* Effect.forkChild(rehearsal.hearNext("ticks"))
          yield* Deferred.await(started)
          yield* rehearsal.send(() => Opt.some("Seen"))
        })
      )
    }))
    expect(diedIn(exit)).toBe("subscription")
  })

  // Each function of the program that a tool calls fails it in the site the run dies in, with what the run says of
  // it: `update` with the message it was given, by its tags.
  const said = (exit: Exit.Exit<unknown>) => {
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return defect instanceof ProgramDefect ? [defect.where, defect.on] : defect
  }
  class Boom extends Error {}
  type Seeded = Program<{ state: Row; model: number; message: "Go"; flags: number }>
  const seeded: Seeded = {
    init: (seen) => ({ state: { seen } }),
    update: () => (state) => ({ state: { seen: state.seen + 1 } }),
    subscriptions: () => HashMap.empty(),
    makeModel: ({ seen }) => seen
  }
  const throwing = (): never => {
    throw new Boom()
  }
  const updating: Seeded = { ...seeded, update: () => throwing }
  const modeling: Seeded = { ...seeded, makeModel: throwing }
  const starting: Seeded = { ...seeded, init: throwing }
  const go = () => Opt.some<"Go">("Go")

  // The run dies of a command's defect, whoever waits for what the command does: in `rehearse`, a fiber of the test's
  // that nobody joins runs it.
  const exploding: Program<{ state: Row; model: number; message: "Go"; command: "Explode" }> = {
    init: { state: { seen: 0 } },
    update: () => (state) => ({ state, commands: ["Explode"] }),
    runCommand: () => Effect.die(new Boom()),
    subscriptions: () => HashMap.empty(),
    makeModel: ({ seen }) => seen
  }

  test("the run dies in a command on a command that dies", async () => {
    const exit = await Effect.runPromiseExit(drive(
      exploding,
      Effect.fnUntraced(function*(driver) {
        yield* driver.send(go)
        return yield* driver.waitFor(() => Opt.none())
      })
    ))
    expect(diedIn(exit)).toBe("command")
  })

  test("rehearse fails, as the run dies, on a command that dies in a fiber nobody joins", async () => {
    const exit = await Effect.runPromiseExit(rehearse(
      exploding,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send(go)
        // Awaited, never joined: what the call ends with does not reach the scenario.
        yield* Fiber.await(yield* Effect.forkChild(rehearsal.run(() => true)))
      })
    ))
    expect(diedIn(exit)).toBe("command")
  })

  test("the run dies in update, with its message, on an update that throws", async () => {
    const exit = await Effect.runPromiseExit(drive(
      updating,
      Effect.fnUntraced(function*(driver) {
        yield* driver.send(go)
        return yield* driver.waitFor(() => Opt.none())
      }),
      { flags: 0 }
    ))
    expect(said(exit)).toEqual(["update", "Go"])
  })

  test("simulate fails, as the run dies, in update, with its message, on an update that throws", async () => {
    const exit = await Effect.runPromiseExit(simulate(updating)(["Go"], { state: { seen: 0 } }))
    expect(said(exit)).toEqual(["update", "Go"])
  })

  test("rehearse fails, as the run dies, in update, with its message, on an update that throws", async () => {
    const exit = await Effect.runPromiseExit(rehearse(updating, (rehearsal) => rehearsal.send(go), { flags: 0 }))
    expect(said(exit)).toEqual(["update", "Go"])
  })

  test("the run dies in render on a makeModel that throws", async () => {
    // The model is made as the renderer reads the first one.
    const exit = await Effect.runPromiseExit(
      drive(modeling, (driver) => driver.waitFor(() => Opt.none()), { flags: 0 })
    )
    expect(said(exit)).toEqual(["render", undefined])
  })

  test("rehearse fails, as the run dies, in render, on a makeModel that throws", async () => {
    const exit = await Effect.runPromiseExit(rehearse(modeling, (rehearsal) => rehearsal.model, { flags: 0 }))
    expect(said(exit)).toEqual(["render", undefined])
  })

  test("the run dies in init on an init that throws on its flags", async () => {
    const exit = await Effect.runPromiseExit(drive(starting, () => Effect.never, { flags: 0 }))
    expect(said(exit)).toEqual(["init", undefined])
  })

  const ticking: Seeded = {
    ...seeded,
    subscriptions: () => HashMap.make(["ticks", Channel.fromEffectDone(Effect.sync(throwing))])
  }
  const keyed = (exit: Exit.Exit<unknown>) => {
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return defect instanceof ProgramDefect ? [defect.where, defect.key] : defect
  }

  test("the run dies in a subscription, with its key, on a subscription that throws", async () => {
    const exit = await Effect.runPromiseExit(drive(ticking, () => Effect.never, { flags: 0 }))
    expect(keyed(exit)).toEqual(["subscription", "ticks"])
  })

  test("rehearse fails, as the run dies, in a subscription, with its key, on a subscription that throws", async () => {
    const exit = await Effect.runPromiseExit(
      rehearse(ticking, (rehearsal) => rehearsal.hearNext("ticks"), { flags: 0 })
    )
    expect(keyed(exit)).toEqual(["subscription", "ticks"])
  })

  test("rehearse fails, as the run dies, in init, on an init that throws on its flags", async () => {
    const exit = await Effect.runPromiseExit(rehearse(starting, () => Effect.void, { flags: 0 }))
    expect(said(exit)).toEqual(["init", undefined])
  })

  test(
    "drive fails, as rehearse does, in init, on an init that throws, though its scenario returns at once",
    async () => {
      const exit = await Effect.runPromiseExit(drive(starting, () => Effect.void, { flags: 0 }))
      expect(said(exit)).toEqual(["init", undefined])
    }
  )

  test("simulate fails, as the run dies, in a command on a command that dies", async () => {
    const exit = await Effect.runPromiseExit(simulate(exploding)(["Go"], exploding.init))
    expect(diedIn(exit)).toBe("command")
  })

  // A defect a command catches around a scope of its own is the command's, never the run's: it answers.
  const recovering: Program<{ state: Row; model: number; message: "Go" | "Saved"; command: "Save" }> = {
    init: { state: { seen: 0 } },
    update: (message) => (state) =>
      message === "Go" ? { state, commands: ["Save"] } : { state: { seen: state.seen + 1 } },
    runCommand: () =>
      Effect.scoped(Effect.addFinalizer(() => Effect.yieldNow).pipe(Effect.andThen(Effect.die(new Boom())))).pipe(
        Effect.catchCause(() => Effect.succeedSome<"Go" | "Saved">("Saved"))
      ),
    subscriptions: () => HashMap.empty(),
    makeModel: ({ seen }) => seen
  }

  test("the run applies the answer of a command that catches the defect of a scope of its own", async () => {
    const seen = await Effect.runPromise(drive(
      recovering,
      Effect.fnUntraced(function*(driver) {
        yield* driver.send(() => Opt.some<"Go" | "Saved">("Go"))
        return yield* driver.waitFor((seen) => seen === 1 ? Opt.some(seen) : Opt.none())
      })
    ))
    expect(seen).toBe(1)
  })

  test("simulate applies, as the run does, the answer of a command that catches the defect of a scope of its own", async () => {
    const { state } = await Effect.runPromise(simulate(recovering)(["Go"], recovering.init))
    expect(state).toEqual({ seen: 1 })
  })

  test("rehearse applies, as the run does, the answer of a command that catches the defect of a scope of its own", async () => {
    const seen = await Effect.runPromise(
      rehearse(recovering, (rehearsal) =>
        rehearsal.send(() => Opt.some<"Go" | "Saved">("Go")).pipe(
          Effect.andThen(rehearsal.runAll),
          Effect.andThen(rehearsal.model)
        ))
    )
    expect(seen).toBe(1)
  })

  // A command that answers, and whose scope, released as it ends, dies: the defect is the command's, not the
  // renderer's nor the run's own, wherever its scope is released.
  const releasing: Program<
    { state: Row; model: number; message: "Go" | "Saved"; command: "Save"; commandServices: Scope.Scope }
  > = {
    init: { state: { seen: 0 } },
    update: (message) => (state) =>
      message === "Go" ? { state, commands: ["Save"] } : { state: { seen: state.seen + 1 } },
    runCommand: () =>
      Effect.addFinalizer(() => Effect.die(new Boom())).pipe(Effect.as(Opt.some<"Go" | "Saved">("Saved"))),
    subscriptions: () => HashMap.empty(),
    makeModel: ({ seen }) => seen
  }

  test("the run dies in a command on a release of a command that dies", async () => {
    const exit = await Effect.runPromiseExit(drive(
      releasing,
      Effect.fnUntraced(function*(driver) {
        yield* driver.send(() => Opt.some<"Go" | "Saved">("Go"))
        return yield* driver.waitFor(() => Opt.none())
      })
    ))
    expect(diedIn(exit)).toBe("command")
  })

  test("simulate fails, as the run dies, in a command on a release of a command that dies", async () => {
    const exit = await Effect.runPromiseExit(simulate(releasing)(["Go"], releasing.init))
    expect(diedIn(exit)).toBe("command")
  })

  test("rehearse fails, as the run dies, in a command on a release of a command that dies", async () => {
    const exit = await Effect.runPromiseExit(
      rehearse(
        releasing,
        (rehearsal) => rehearsal.send(() => Opt.some<"Go" | "Saved">("Go")).pipe(Effect.andThen(rehearsal.runAll))
      )
    )
    expect(diedIn(exit)).toBe("command")
  })

  // What a command holds is released once its defect says where: its scope closes with the exit the run dies with,
  // a defect for a command that interrupted itself too. So a release that dies of the very defect of its command is
  // a second defect, which `Cause` would take for the first before either said where.
  type Witness = Program<{ state: Row; model: number; message: "Go"; command: "Save"; commandServices: Scope.Scope }>
  const wheres = (exit: Exit.Exit<unknown, unknown>): ReadonlyArray<unknown> =>
    Exit.isFailure(exit)
      ? exit.cause.reasons.map((reason) =>
        Cause.isDieReason(reason) && reason.defect instanceof ProgramDefect ? reason.defect.where : reason._tag
      )
      : []
  const witnessing = (
    seen: Array<unknown>,
    body: Effect.Effect<never, never, Scope.Scope>,
    release: (exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void>
  ): Witness => ({
    init: { state: { seen: 0 } },
    update: () => (state) => ({ state, commands: ["Save"] }),
    runCommand: () =>
      Effect.addFinalizer((exit) => Effect.andThen(Effect.sync(() => seen.push(...wheres(exit))), release(exit))).pipe(
        Effect.andThen(body)
      ),
    subscriptions: () => HashMap.empty(),
    makeModel: ({ seen }) => seen
  })
  const tools = {
    run: (program: Witness) =>
      drive(program, (driver) => Effect.andThen(driver.send(go), driver.waitFor(() => Opt.none()))),
    rehearse: (program: Witness) =>
      rehearse(program, (rehearsal) => Effect.andThen(rehearsal.send(go), rehearsal.runAll)),
    simulate: (program: Witness) => simulate(program)(["Go"], program.init)
  }
  // What the release of the command saw, and what the tool ended with: the site of each defect, or the tag of what
  // is none.
  const witnessed = async (
    tool: keyof typeof tools,
    body: Effect.Effect<never, never, Scope.Scope>,
    release: (exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void> = () => Effect.void
  ) => {
    const seen: Array<unknown> = []
    const exit = await Effect.runPromiseExit(tools[tool](witnessing(seen, body, release)))
    return { seen, ended: wheres(exit) }
  }

  test("the run gives what a command that dies releases its defect, in a command", async () => {
    expect(await witnessed("run", Effect.die(new Boom()))).toEqual({ seen: ["command"], ended: ["command"] })
  })

  test("simulate gives, as the run does, what a command that dies releases its defect, in a command", async () => {
    expect(await witnessed("simulate", Effect.die(new Boom()))).toEqual({ seen: ["command"], ended: ["command"] })
  })

  test("rehearse gives, as the run does, what a command that dies releases its defect, in a command", async () => {
    expect(await witnessed("rehearse", Effect.die(new Boom()))).toEqual({ seen: ["command"], ended: ["command"] })
  })

  test("the run gives what a command that interrupts itself releases a defect, in a command", async () => {
    expect(await witnessed("run", Effect.interrupt)).toEqual({ seen: ["command"], ended: ["command"] })
  })

  test("simulate gives, as the run does, what a command that interrupts itself releases a defect", async () => {
    expect(await witnessed("simulate", Effect.interrupt)).toEqual({ seen: ["command"], ended: ["command"] })
  })

  test("rehearse gives, as the run does, what a command that interrupts itself releases a defect", async () => {
    expect(await witnessed("rehearse", Effect.interrupt)).toEqual({ seen: ["command"], ended: ["command"] })
  })

  test("the run dies of two defects on a release that dies of the very defect of its command", async () => {
    const boom = new Boom()
    const { ended } = await witnessed("run", Effect.die(boom), () => Effect.die(boom))
    expect(ended).toEqual(["command", "command"])
  })

  test("simulate fails, as the run dies, of two defects on a release that dies of that of its command", async () => {
    const boom = new Boom()
    const { ended } = await witnessed("simulate", Effect.die(boom), () => Effect.die(boom))
    expect(ended).toEqual(["command", "command"])
  })

  test("rehearse fails, as the run dies, of two defects on a release that dies of that of its command", async () => {
    const boom = new Boom()
    const { ended } = await witnessed("rehearse", Effect.die(boom), () => Effect.die(boom))
    expect(ended).toEqual(["command", "command"])
  })

  // Two releases that die of defects equal by `Equal` die of two all the same, beside the command's own. Made by one
  // function, so that no engine tells them apart by where they were made.
  class Closing extends Data.TaggedError("Closing")<object> {}
  const closing = () => new Closing()
  const twoReleasesDie = Effect.addFinalizer(() => Effect.die(closing())).pipe(Effect.andThen(Effect.die(new Boom())))
  const thrice = ["command", "command", "command"]

  test("the run dies of each of two equal defects of what a command that dies releases", async () => {
    expect((await witnessed("run", twoReleasesDie, () => Effect.die(closing()))).ended).toEqual(thrice)
  })

  test("simulate fails, as the run dies, of each of two equal defects of what a command that dies releases", async () => {
    expect((await witnessed("simulate", twoReleasesDie, () => Effect.die(closing()))).ended).toEqual(thrice)
  })

  test("rehearse fails, as the run dies, of each of two equal defects of what a command that dies releases", async () => {
    expect((await witnessed("rehearse", twoReleasesDie, () => Effect.die(closing()))).ended).toEqual(thrice)
  })

  // A release that fails with the cause it is given dies of the defect of its command, which is already in it: one
  // defect, in each tool.
  const failingWith = (exit: Exit.Exit<unknown, unknown>) =>
    Exit.isFailure(exit) ? Effect.failCause(exit.cause as Cause.Cause<never>) : Effect.void

  test("the run dies of one defect on a release that fails with the cause of its command", async () => {
    const { ended } = await witnessed("run", Effect.die(new Boom()), failingWith)
    expect(ended).toEqual(["command"])
  })

  test("simulate fails, as the run dies, of one defect on a release that fails with the cause of its command", async () => {
    const { ended } = await witnessed("simulate", Effect.die(new Boom()), failingWith)
    expect(ended).toEqual(["command"])
  })

  test("rehearse fails, as the run dies, of one defect on a release that fails with the cause of its command", async () => {
    const { ended } = await witnessed("rehearse", Effect.die(new Boom()), failingWith)
    expect(ended).toEqual(["command"])
  })

  // A `runCommand` that throws before it returns its effect: the run suspends it, so the defect is the command's.
  const raising: Program<{ state: Row; model: number; message: "Go"; command: "Explode" }> = {
    ...exploding,
    runCommand: throwing
  }

  test("the run dies in a command on a runCommand that throws before it returns an effect", async () => {
    const exit = await Effect.runPromiseExit(drive(
      raising,
      Effect.fnUntraced(function*(driver) {
        yield* driver.send(go)
        return yield* driver.waitFor(() => Opt.none())
      })
    ))
    expect(diedIn(exit)).toBe("command")
  })

  test("simulate fails, as the run dies, in a command on a runCommand that throws before its effect", async () => {
    const exit = await Effect.runPromiseExit(simulate(raising)(["Go"], raising.init))
    expect(diedIn(exit)).toBe("command")
  })

  test("rehearse fails, as the run dies, in a command on a runCommand that throws before its effect", async () => {
    const exit = await Effect.runPromiseExit(rehearse(
      raising,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send(go)
        yield* rehearsal.run(() => true)
      })
    ))
    expect(diedIn(exit)).toBe("command")
  })

  // The subscriptions of the state the program starts from are read before any message.
  const deaf: Program<{ state: Row; model: number; message: "Seen" }> = { ...row, subscriptions: throwing }

  test("the run dies in subscriptions on the subscriptions of the state it starts from", async () => {
    const exit = await Effect.runPromiseExit(drive(deaf, () => Effect.never))
    expect(diedIn(exit)).toBe("subscriptions")
  })

  test("simulate fails, as the run dies, in subscriptions on those of the state it starts from", async () => {
    const exit = await Effect.runPromiseExit(simulate(deaf)([], deaf.init))
    expect(diedIn(exit)).toBe("subscriptions")
  })

  test("rehearse fails, as the run dies, in subscriptions on those of the state it starts from", async () => {
    const exit = await Effect.runPromiseExit(rehearse(deaf, () => Effect.void))
    expect(diedIn(exit)).toBe("subscriptions")
  })

  // `drive`'s renderer makes the model as it pulls the frame, before `send` could select on it.
  test("drive fails in render on a makeModel that throws, when it sends", async () => {
    const exit = await Effect.runPromiseExit(drive(modeling, (driver) => driver.send(go), { flags: 0 }))
    expect(said(exit)).toEqual(["render", undefined])
  })
})

// The run's cause holds its defects first, then the rest of what it ended with, and so does `rehearse`'s, before what
// the scenario ended with ("a defect the scenario catches fails it all the same, first, and once"): `drive`, which
// fails "as the run dies", keeps the same order. Here `update` dies on `Boom`, the run releases a subscription until
// the scenario has failed, and the scenario fails once that release has begun.
describe("a defect of the program, then a failure of the scenario", () => {
  type Still = Readonly<{ still: true }>
  const booming = (
    releasing: Deferred.Deferred<void>,
    failed: Deferred.Deferred<void>
  ): Program<{ state: Still; model: Still; message: "Boom" }> => ({
    init: { state: { still: true } },
    update: () => () => {
      throw new Error("update")
    },
    subscriptions: () =>
      HashMap.make([
        "k",
        Channel.unwrap(
          // Bounded, so that a scenario that never fails still lets the run end.
          Effect.acquireRelease(
            Effect.void,
            () =>
              Effect.andThen(
                Deferred.succeed(releasing, undefined),
                Effect.timeoutOption(Deferred.await(failed), "1 second")
              )
          ).pipe(Effect.as(Channel.never))
        )
      ]),
    makeModel: (state) => state
  })

  const said = (exit: Exit.Exit<unknown>) =>
    Exit.isFailure(exit)
      ? exit.cause.reasons.map((reason) =>
        Cause.isDieReason(reason)
          ? reason.defect instanceof ProgramDefect ? reason.defect.where : reason.defect
          : reason._tag
      )
      : []

  const inOrder = "drive fails, as rehearse does, with the defect first, then with what the scenario ended with"
  test(inOrder, async () => {
    const releasing = Deferred.makeUnsafe<void>()
    const failed = Deferred.makeUnsafe<void>()
    const exit = await Effect.runPromiseExit(
      drive(booming(releasing, failed), (driver) =>
        driver.send(() => Opt.some("Boom")).pipe(
          Effect.andThen(Deferred.await(releasing)),
          Effect.andThen(Effect.die("after")),
          Effect.ensuring(Deferred.succeed(failed, undefined))
        ))
    )
    expect(said(exit)).toEqual(["update", "after"])
  })
})

// Found by the sixth premise review of November 2026. The run dies of a `makeModel` that throws as its renderer pulls
// the frame, `drive` with it, and `rehearse` as it makes the model of the state: no scenario meets the defect.
describe("a defect of makeModel", () => {
  type Count = Readonly<{ count: number }>
  const modeling: Program<{ state: Count; model: number; message: "Go" }> = {
    init: { state: { count: 0 } },
    update: () => ({ count }) => ({ state: { count: count + 1 } }),
    subscriptions: () => HashMap.empty(),
    makeModel: () => {
      throw new Error("boom")
    }
  }
  const diedIn = (exit: Exit.Exit<unknown>) => {
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return defect instanceof ProgramDefect ? defect.where : undefined
  }

  test("rehearse fails in render, as the run dies", async () => {
    const exit = await Effect.runPromiseExit(rehearse(modeling, (rehearsal) => Effect.exit(rehearsal.model)))
    expect(diedIn(exit)).toBe("render")
  })

  test("drive fails in render, as rehearse does", async () => {
    const exit = await Effect.runPromiseExit(drive(modeling, (driver) => Effect.exit(driver.waitFor(Opt.some))))
    expect(diedIn(exit)).toBe("render")
  })

  // The model of the state the program starts from is made; that of the next one throws.
  const later: Program<{ state: Count; model: number; message: "Go" }> = {
    ...modeling,
    makeModel: ({ count }) => {
      if (count > 0) throw new Error("boom")
      return count
    }
  }

  test("the run dies in render on a makeModel that throws on a later state", async () => {
    const exit = await Effect.runPromiseExit(
      drive(later, (driver) => Effect.andThen(driver.send(() => Opt.some("Go")), Effect.never))
    )
    expect(diedIn(exit)).toBe("render")
  })

  test("rehearse fails, as the run dies, in render, on a makeModel that throws on a later state", async () => {
    const exit = await Effect.runPromiseExit(rehearse(later, (rehearsal) => rehearsal.send(() => Opt.some("Go"))))
    expect(diedIn(exit)).toBe("render")
  })

  // `Go` starts `Note` and takes `ticks` away, on a state whose model throws: the run's renderer is a fiber of its own,
  // so the step goes on whole, its commands started and the subscription it stops released.
  const noting = (
    released: Array<boolean>
  ): Program<{ state: Count; model: number; message: "Go" | "Tick"; command: "Note" }> => ({
    init: { state: { count: 0 } },
    update: (message) => ({ count }) =>
      message === "Go" ? { state: { count: count + 1 }, commands: ["Note"] } : { state: { count } },
    runCommand: () => Effect.succeedNone,
    subscriptions: ({ count }) =>
      count === 0
        ? HashMap.make([
          "ticks",
          Channel.succeed<"Go" | "Tick">("Tick").pipe(
            Channel.concatWith(() => Channel.never),
            Channel.onExit(() => Effect.sync(() => released.push(true)))
          )
        ])
        : HashMap.empty(),
    makeModel: ({ count }) => {
      if (count > 0) throw new Error("boom")
      return count
    }
  })

  test("in the run, the message whose model dies is applied whole, with its commands", async () => {
    const applied: Array<unknown> = []
    const exit = await Effect.runPromiseExit(drive(
      noting([]),
      (driver) => Effect.andThen(driver.send(() => Opt.some("Go")), Effect.never),
      {
        onApplied: ({ message, after, commands }) => {
          if (message === "Go") applied.push({ after, commands })
        }
      }
    ))
    expect(reasons(exit)).toEqual(["render"])
    expect(applied).toEqual([{ after: { count: 1 }, commands: ["Note"] }])
  })

  // The call that sent it returns, as the run's dispatch does, once the subscription the state stops is released; what
  // is asked after it fails with the defect, and so does the rehearsal.
  test("rehearse applies the message whose model dies whole, as the run does, its commands owed", async () => {
    const released: Array<boolean> = []
    const seen: Array<unknown> = []
    const exit = await Effect.runPromiseExit(rehearse(
      noting(released),
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.hearNext("ticks")
        const sent = yield* Effect.exit(rehearsal.send(() => Opt.some("Go")))
        seen.push(Exit.isSuccess(sent), [...released])
        const after = yield* Effect.exit(rehearsal.model)
        seen.push(yield* rehearsal.state, yield* rehearsal.pending, reasons(after))
      })
    ))
    expect(reasons(exit)).toEqual(["render"])
    expect(seen).toEqual([true, [true], { count: 1 }, ["Note"], ["render"]])
  })

  const reasons = (exit: Exit.Exit<unknown, unknown>) =>
    Exit.isFailure(exit)
      ? exit.cause.reasons.map((reason) =>
        Cause.isDieReason(reason)
          ? reason.defect instanceof ProgramDefect ? reason.defect.where : reason.defect
          : reason._tag
      )
      : []

  // `Go` leaves a state whose subscriptions throw too: the run reads them in the step that publishes the state, before
  // its renderer pulls the frame.
  const both: Program<{ state: Count; model: number; message: "Go" }> = {
    ...modeling,
    subscriptions: ({ count }) => {
      if (count > 0) throw new Error("keys")
      return HashMap.empty()
    },
    makeModel: ({ count }) => {
      if (count > 0) throw new Error("boom")
      return count
    }
  }

  // Found by the review of the testing tools of November 2026. The run makes the handle though the subscriptions of the
  // first state die, and a renderer that reads its model, as `drive` does, meets the model's defect too: `rehearse`,
  // which makes the model "as a renderer told of every state that reads each one", fails on the first and never makes
  // the model. On a later state neither reads it, since the run tells no listener of a state whose keys died.
  const bothFirst: Program<{ state: Count; model: number; message: "Go" }> = {
    ...modeling,
    subscriptions: () => {
      throw new Error("keys")
    }
  }

  test("the run dies in subscriptions, then in render, on a first state whose model is a defect too", async () => {
    const exit = await Effect.runPromiseExit(drive(bothFirst, () => Effect.never))
    expect(reasons(exit)).toEqual(["subscriptions", "render"])
  })

  test.failing(
    "rehearse fails in subscriptions, then in render, as the run dies, on a first state whose model is a defect too",
    async () => {
      const exit = await Effect.runPromiseExit(rehearse(bothFirst, () => Effect.never))
      expect(reasons(exit)).toEqual(["subscriptions", "render"])
    }
  )

  test("the run dies in subscriptions first, on a state whose model is a defect too", async () => {
    const exit = await Effect.runPromiseExit(
      drive(both, (driver) => Effect.andThen(driver.send(() => Opt.some("Go")), Effect.never))
    )
    expect(reasons(exit)[0]).toBe("subscriptions")
  })

  test("rehearse fails in subscriptions first, as the run dies, on a state whose model is a defect too", async () => {
    const exit = await Effect.runPromiseExit(rehearse(both, (rehearsal) => rehearsal.send(() => Opt.some("Go"))))
    expect(reasons(exit)[0]).toBe("subscriptions")
  })

  // As the run's death interrupts the scenario, so does this one.
  test("drive ends on the defect, though the scenario would go on", async () => {
    const exit = await Effect.runPromiseExit(
      drive(modeling, (driver) => Effect.andThen(Effect.exit(driver.waitFor(Opt.some)), Effect.never))
    )
    expect(reasons(exit)).toEqual(["render"])
  })

  test("drive fails, as rehearse does, in render alone: the scenario that would catch it never meets it", async () => {
    const failing = <R>(caught: Effect.Effect<unknown, never, R>) => Effect.andThen(caught, Effect.fail("oops"))
    const rehearsed = await Effect.runPromiseExit(
      rehearse(modeling, (rehearsal) => failing(Effect.exit(rehearsal.model)))
    )
    const driven = await Effect.runPromiseExit(
      drive(modeling, (driver) => failing(Effect.exit(driver.waitFor(Opt.some))))
    )
    expect(reasons(rehearsed)).toEqual(["render"])
    expect(reasons(driven)).toEqual(["render"])
  })
})

// The end of a tool, as the end of the run: once `drive` or `rehearse` has ended, what a fiber of the test's that the
// scenario did not join sends reaches nothing of the program.
describe("a fiber of the test's that sends once the tool has ended", () => {
  type Count = Readonly<{ count: number }>
  const counting = (applied: Array<"Go">): Program<{ state: Count; model: Count; message: "Go" }> => ({
    init: { state: { count: 0 } },
    update: (message) => ({ count }) => {
      applied.push(message)
      return { state: { count: count + 1 } }
    },
    subscriptions: () => HashMap.empty(),
    makeModel: (state) => state
  })
  // The fiber is forked in the test's own fiber, which outlives the tool: it sends once `ended` opens.
  const late = <A>(tool: (ended: Deferred.Deferred<void>) => Effect.Effect<A, unknown>) =>
    Effect.gen(function*() {
      const ended = yield* Deferred.make<void>()
      const exit = yield* Effect.exit(tool(ended))
      yield* Deferred.succeed(ended, undefined)
      yield* Effect.sleep("20 millis")
      return exit
    })

  test("in drive, through the run's dispatch, it reaches no update", async () => {
    const applied: Array<"Go"> = []
    const exit = await Effect.runPromise(late((ended) =>
      drive(
        counting(applied),
        Effect.fnUntraced(function*(driver) {
          yield* Effect.forkDetach(Effect.andThen(Deferred.await(ended), Effect.sync(() => driver.dispatch("Go"))))
        })
      )
    ))
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(applied).toEqual([])
  })

  test("in rehearse, it reaches no update, and its call is interrupted", async () => {
    const applied: Array<"Go"> = []
    let sent: Fiber.Fiber<void> | undefined
    const exit = await Effect.runPromise(
      late((ended) =>
        rehearse(
          counting(applied),
          Effect.fnUntraced(function*(rehearsal) {
            sent = yield* Effect.forkDetach(Effect.andThen(Deferred.await(ended), rehearsal.send(() => Opt.some("Go"))))
          })
        )
      )
    )
    // Once the call has ended, nothing it sent can still reach `update`.
    const call = sent === undefined ? undefined : await Effect.runPromise(Fiber.await(sent))
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(applied).toEqual([])
    expect(call !== undefined && Exit.hasInterrupts(call)).toBe(true)
  })
})

// The run forks a command with `FiberSet.run`, which runs it at once (`docs/premises.md`): its effect has begun once
// `runCommand` has been called, whatever interrupts the run then. A fork that only schedules it, as `simulate`'s did
// until the review of the testing tools of November 2026, leaves it never begun when an interruption comes first.
describe("a command whose runCommand is called as whoever runs the tool interrupts it", () => {
  const begins = (tool: "drive" | "rehearse" | "simulate") =>
    Effect.runPromise(Effect.gen(function*() {
      const called = yield* Deferred.make<void>()
      let begun = false
      const waiting: Program<{ state: { seen: number }; model: number; message: "Go"; command: "Wait" }> = {
        init: { state: { seen: 0 } },
        update: () => (state) => ({ state, commands: ["Wait"] }),
        runCommand: () => {
          Deferred.doneUnsafe(called, Effect.void)
          return Effect.uninterruptible(Effect.sync(() => {
            begun = true
          })).pipe(Effect.andThen(Effect.never))
        },
        subscriptions: () => HashMap.empty(),
        makeModel: ({ seen }) => seen
      }
      const fiber = yield* Effect.forkChild(
        tool === "simulate"
          ? simulate(waiting)(["Go"], waiting.init)
          : tool === "rehearse"
          ? rehearse(waiting, (rehearsal) =>
            rehearsal.send(() => Opt.some("Go")).pipe(Effect.andThen(rehearsal.run(() => true))))
          : drive(waiting, (driver) =>
            driver.send(() => Opt.some("Go")).pipe(Effect.andThen(Effect.never)))
      )
      yield* Deferred.await(called)
      yield* Fiber.interrupt(fiber)
      return begun
    }))

  test("begins its effect in the run", async () => {
    expect(await begins("drive")).toBe(true)
  })

  test("begins its effect in rehearse, as in the run", async () => {
    expect(await begins("rehearse")).toBe(true)
  })

  test("begins its effect in simulate, as in the run", async () => {
    expect(await begins("simulate")).toBe(true)
  })
})

// A fiber of the program that interrupts a command's or a subscription's fiber is no interruption by the run nor by
// whoever runs it ("Guarantees", "Nothing ends in silence": only the run, and whoever runs it, interrupt them), so the
// run and each tool die in its site, which the root of the fiber says (`Shell.rootedIn`): the interruption carries no
// mark of the run's. The interrupter is detached, and tells `interrupted` once the fiber it interrupts has ended, so
// that a defect would have been recorded by then.
describe("a command or a subscription that a fiber of the program interrupts", () => {
  type Row = Readonly<{ seen: number }>
  const interruptingItself = (interrupted: Deferred.Deferred<void>) =>
    Effect.gen(function*() {
      const self = yield* Effect.fiber
      yield* Effect.forkDetach(Fiber.interrupt(self).pipe(Effect.andThen(Deferred.succeed(interrupted, undefined))))
      return yield* Effect.never
    })
  const commanding = (
    interrupted: Deferred.Deferred<void>
  ): Program<{ state: Row; model: number; message: "Go"; command: "Quit" }> => ({
    init: { state: { seen: 0 } },
    update: () => (state) => ({ state, commands: ["Quit"] }),
    runCommand: () => interruptingItself(interrupted),
    subscriptions: () => HashMap.empty(),
    makeModel: ({ seen }) => seen
  })
  const listening = (
    interrupted: Deferred.Deferred<void>
  ): Program<{ state: Row; model: number; message: "Seen" }> => ({
    init: { state: { seen: 0 } },
    update: () => ({ seen }) => ({ state: { seen: seen + 1 } }),
    subscriptions: () =>
      HashMap.make(["ticks", Channel.fromEffectDone(Effect.as(interruptingItself(interrupted), "Seen" as const))]),
    makeModel: ({ seen }) => seen
  })
  const diedIn = (exit: Exit.Exit<unknown, unknown>) => {
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return defect instanceof ProgramDefect ? defect.where : undefined
  }
  const interruptedBy = <A, E>(tool: (interrupted: Deferred.Deferred<void>) => Effect.Effect<A, E>) =>
    Effect.runPromiseExit(Effect.flatMap(Deferred.make<void>(), tool))

  test("the run dies with a defect of a command a fiber of the program interrupts", async () => {
    const exit = await interruptedBy((interrupted) =>
      drive(
        commanding(interrupted),
        (driver) => driver.send(() => Opt.some("Go")).pipe(Effect.andThen(Deferred.await(interrupted)))
      )
    )
    expect(diedIn(exit)).toBe("command")
  })

  test(
    "simulate fails with a defect, as the run dies, of a command a fiber of the program interrupts",
    async () => {
      const exit = await interruptedBy((interrupted) =>
        simulate(commanding(interrupted))(["Go"], { state: { seen: 0 } })
      )
      expect(diedIn(exit)).toBe("command")
    }
  )

  test(
    "rehearse fails with a defect, as the run dies, of a command a fiber of the program interrupts",
    async () => {
      const exit = await interruptedBy((interrupted) =>
        rehearse(
          commanding(interrupted),
          (rehearsal) => rehearsal.send(() => Opt.some("Go")).pipe(Effect.andThen(rehearsal.run(() => true)))
        )
      )
      expect(diedIn(exit)).toBe("command")
    }
  )

  test("the run dies with a defect of a subscription a fiber of the program interrupts", async () => {
    const exit = await interruptedBy((interrupted) => drive(listening(interrupted), () => Deferred.await(interrupted)))
    expect(diedIn(exit)).toBe("subscription")
  })

  // The call is forked: with no defect, it would wait for ever for a last message that never comes.
  test(
    "rehearse fails with a defect, as the run dies, of a subscription a fiber of the program interrupts",
    async () => {
      const exit = await interruptedBy((interrupted) =>
        rehearse(
          listening(interrupted),
          (rehearsal) => Effect.forkChild(rehearsal.hearNext("ticks")).pipe(Effect.andThen(Deferred.await(interrupted)))
        )
      )
      expect(diedIn(exit)).toBe("subscription")
    }
  )

  // Found by the review of the testing tools of November 2026. The interrupter runs at once in the release of the
  // command's scope, where nothing interrupts the fiber: the interruption lands once the scope has closed, which only the
  // root of the fiber takes for a defect. The run records it; `rehearse` gave it only to the `run` that awaits the
  // fiber, so a scenario that caught that failure, or a `run` nobody joined, lost it.
  const releasing: Program<{
    state: Row
    model: number
    message: "Go" | "Done"
    command: "Quit"
    commandServices: Scope.Scope
  }> = {
    init: { state: { seen: 0 } },
    update: (message) => ({ seen }) =>
      message === "Go" ? { state: { seen }, commands: ["Quit"] } : { state: { seen: seen + 1 } },
    runCommand: () =>
      Effect.gen(function*() {
        const self = yield* Effect.fiber
        yield* Effect.addFinalizer(() =>
          Effect.asVoid(Effect.forkDetach(Fiber.interrupt(self), { startImmediately: true }))
        )
        return Opt.some<"Go" | "Done">("Done")
      }),
    subscriptions: () => HashMap.empty(),
    makeModel: ({ seen }) => seen
  }

  test("the run dies with a defect of a command a fiber of the program interrupts as it releases", async () => {
    const exit = await Effect.runPromiseExit(
      drive(releasing, (driver) =>
        driver.send(() => Opt.some("Go")).pipe(
          Effect.andThen(driver.waitFor((seen) => seen === 1 ? Opt.some(seen) : Opt.none()))
        ))
    )
    expect(diedIn(exit)).toBe("command")
  })

  test.failing(
    "rehearse fails with a defect, as the run dies, of a command a fiber of the program interrupts as it releases, though the scenario catches it",
    async () => {
      const exit = await Effect.runPromiseExit(
        rehearse(
          releasing,
          (rehearsal) =>
            rehearsal.send(() => Opt.some("Go")).pipe(Effect.andThen(Effect.exit(rehearsal.run(() => true))))
        )
      )
      expect(diedIn(exit)).toBe("command")
    }
  )

  // The same, as whoever runs the tool interrupts it while the release waits for `gate`: the tool stops the command
  // with the run's mark, and the program's interruption lands beside it once the scope has closed.
  const gated = (began: Deferred.Deferred<void>, gate: Deferred.Deferred<void>): typeof releasing => ({
    ...releasing,
    runCommand: () =>
      Effect.gen(function*() {
        const self = yield* Effect.fiber
        yield* Effect.addFinalizer(() =>
          Effect.forkDetach(Fiber.interrupt(self), { startImmediately: true }).pipe(
            Effect.andThen(Deferred.succeed(began, undefined)),
            Effect.andThen(Deferred.await(gate))
          )
        )
        return Opt.some<"Go" | "Done">("Done")
      })
  })
  const interruptedAsItReleases = (tool: "drive" | "simulate") =>
    Effect.runPromise(Effect.gen(function*() {
      const began = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      const program = gated(began, gate)
      const fiber = yield* Effect.forkChild(
        tool === "simulate"
          ? Effect.asVoid(simulate(program)(["Go"], program.init))
          : drive(program, (driver) => driver.send(() => Opt.some("Go")).pipe(Effect.andThen(Effect.never)))
      )
      yield* Deferred.await(began)
      yield* Effect.forkChild(Fiber.interrupt(fiber), { startImmediately: true })
      yield* Deferred.succeed(gate, undefined)
      return diedIn(yield* Fiber.await(fiber))
    }))

  test("the run dies with a defect of a command a fiber of the program interrupts as it releases, as whoever runs it interrupts it", async () => {
    expect(await interruptedAsItReleases("drive")).toBe("command")
  })

  test.failing("simulate fails with a defect, as the run dies, of a command a fiber of the program interrupts as it releases, as whoever runs it interrupts it", async () => {
    expect(await interruptedAsItReleases("simulate")).toBe("command")
  })
})

// A message is applied in the call that sends it, and the effects of its step follow in the fiber of effects, in the
// order of the states: the run's, and `rehearse`'s loop. The release of `a` holds them, telling `releasing` and waiting
// for `gate`. `Stop` stops `a`; `Swap` stops `a` and adds `b`, whose subscription sends `Tick` as it starts; `Go`
// counts and starts `Note`; `DropB` takes `b` away.
describe("a message applied while a release holds the effects of the step before", () => {
  type Held = Readonly<{ a: boolean; b: boolean; count: number }>
  type HeldMessage = "Stop" | "Swap" | "Go" | "DropB" | "Tick"
  type Signals = Readonly<{
    releasing: Deferred.Deferred<void>
    gate: Deferred.Deferred<void>
    noted: Deferred.Deferred<void>
    released: Deferred.Deferred<void>
    log: Array<string>
  }>
  const signals = Effect.gen(function*(): Effect.fn.Return<Signals> {
    return {
      releasing: yield* Deferred.make<void>(),
      gate: yield* Deferred.make<void>(),
      noted: yield* Deferred.make<void>(),
      released: yield* Deferred.make<void>(),
      log: []
    }
  })
  const holding = (
    { releasing, gate, noted, released, log }: Signals
  ): Program<{ state: Held; model: Held; message: HeldMessage; command: "Note" }> => ({
    init: { state: { a: true, b: false, count: 0 } },
    update: (message) => (state) => {
      switch (message) {
        case "Stop":
          return { state: { ...state, a: false } }
        case "Swap":
          return { state: { ...state, a: false, b: true } }
        case "Go":
          return { state: { ...state, count: state.count + 1 }, commands: ["Note"] }
        case "DropB":
          return { state: { ...state, b: false } }
        case "Tick":
          return { state: { ...state, count: state.count + 1 } }
      }
    },
    runCommand: () =>
      Effect.sync(() => log.push("Note started")).pipe(
        Effect.andThen(Deferred.succeed(noted, undefined)),
        Effect.as(Opt.none())
      ),
    subscriptions: ({ a, b }) =>
      HashMap.make(
        ...(a
          ? [
            [
              "a",
              Channel.never.pipe(
                Channel.ensuring(Effect.andThen(Deferred.succeed(releasing, undefined), Deferred.await(gate)))
              )
            ] as const
          ]
          : []),
        ...(b
          ? [
            [
              "b",
              Channel.unwrap(Effect.sync(() => {
                log.push("b started")
                return Channel.succeed<HeldMessage>("Tick").pipe(
                  Channel.concatWith(() => Channel.never),
                  Channel.ensuring(Deferred.succeed(released, undefined))
                )
              }))
            ] as const
          ]
          : [])
      ),
    makeModel: (state) => state
  })

  test("in the run, it is applied at once, and its commands start once the release has ended", async () => {
    const seen = await Effect.runPromise(Effect.gen(function*() {
      const given = yield* signals
      return yield* drive(
        holding(given),
        Effect.fnUntraced(function*(driver) {
          yield* driver.send(() => Opt.some<HeldMessage>("Stop"))
          yield* Deferred.await(given.releasing)
          yield* driver.send(() => Opt.some<HeldMessage>("Go"))
          const meanwhile = { count: (yield* driver.model).count, started: [...given.log] }
          yield* Deferred.succeed(given.gate, undefined)
          yield* Deferred.await(given.noted)
          return { meanwhile, after: [...given.log] }
        })
      )
    }))
    expect(seen).toEqual({ meanwhile: { count: 1, started: [] }, after: ["Note started"] })
  })

  test("rehearse applies it at once, as the run does, and owes its commands once the release has ended", async () => {
    const seen = await Effect.runPromise(Effect.gen(function*() {
      const given = yield* signals
      return yield* rehearse(
        holding(given),
        Effect.fnUntraced(function*(rehearsal) {
          yield* Effect.forkChild(rehearsal.hearNext("a"), { startImmediately: true })
          const stopping = yield* Effect.forkChild(rehearsal.send(() => Opt.some<HeldMessage>("Stop")))
          yield* Deferred.await(given.releasing)
          // Started on this stack, the send has applied its message once the fork returns.
          const going = yield* Effect.forkChild(rehearsal.send(() => Opt.some<HeldMessage>("Go")), {
            startImmediately: true
          })
          const meanwhile = { count: (yield* rehearsal.model).count, pending: yield* rehearsal.pending }
          yield* Deferred.succeed(given.gate, undefined)
          yield* Fiber.join(stopping)
          yield* Fiber.join(going)
          const after = yield* rehearsal.pending
          yield* rehearsal.runAll
          return { meanwhile, after, state: yield* rehearsal.state }
        })
      )
    }))
    expect(seen).toEqual({
      meanwhile: { count: 1, pending: [] },
      after: ["Note"],
      state: { a: false, b: false, count: 1 }
    })
  })

  test("simulate, given the same messages, ends in the same state", async () => {
    const given = await Effect.runPromise(signals)
    const program = holding(given)
    const simulation = await Effect.runPromise(simulate(program)(["Stop", "Go"], program.init))
    expect([simulation.state, simulation.commands]).toEqual([{ a: false, b: false, count: 1 }, ["Note"]])
  })

  test("in the run, a subscription whose key appears meanwhile sends only once the release has ended", async () => {
    const counts = await Effect.runPromise(Effect.gen(function*() {
      const given = yield* signals
      return yield* drive(
        holding(given),
        Effect.fnUntraced(function*(driver) {
          yield* driver.send(() => Opt.some<HeldMessage>("Swap"))
          yield* Deferred.await(given.releasing)
          const meanwhile = [(yield* driver.model).count, [...given.log]]
          yield* Deferred.succeed(given.gate, undefined)
          return [...meanwhile, yield* driver.waitFor(({ count }) => count === 1 ? Opt.some(count) : Opt.none())]
        })
      )
    }))
    expect(counts).toEqual([0, [], 1])
  })

  test("rehearse hears a key that appears meanwhile only once the release has ended, by hear and by hearNext", async () => {
    const heard = await Effect.runPromise(
      Effect.forEach(["hear", "hearNext"] as const, (how) =>
        Effect.gen(function*() {
          const given = yield* signals
          return yield* rehearse(
            holding(given),
            Effect.fnUntraced(function*(rehearsal) {
              yield* Effect.forkChild(rehearsal.hearNext("a"), { startImmediately: true })
              const swapping = yield* Effect.forkChild(rehearsal.send(() => Opt.some<HeldMessage>("Swap")))
              yield* Deferred.await(given.releasing)
              const hearing = yield* Effect.forkChild(
                how === "hear" ? rehearsal.hear("b", "Tick") : rehearsal.hearNext("b"),
                { startImmediately: true }
              )
              const meanwhile = (yield* rehearsal.state).count
              yield* Deferred.succeed(given.gate, undefined)
              yield* Fiber.join(swapping)
              yield* Fiber.join(hearing)
              return [meanwhile, (yield* rehearsal.state).count]
            })
          )
        }))
    )
    expect(heard).toEqual([[0, 1], [0, 1]])
  })

  test("in the run, a message of a start whose key went away before it started reaches no update", async () => {
    const seen = await Effect.runPromise(Effect.gen(function*() {
      const given = yield* signals
      return yield* drive(
        holding(given),
        Effect.fnUntraced(function*(driver) {
          yield* driver.send(() => Opt.some<HeldMessage>("Swap"))
          yield* Deferred.await(given.releasing)
          yield* driver.send(() => Opt.some<HeldMessage>("DropB"))
          yield* Deferred.succeed(given.gate, undefined)
          // The job of `Swap` starts `b`, which sends at once, and that of `DropB` stops it.
          yield* Deferred.await(given.released)
          return { count: (yield* driver.model).count, log: [...given.log] }
        })
      )
    }))
    expect(seen).toEqual({ count: 0, log: ["b started"] })
  })

  test("rehearse lets no message of such a start reach update, by hear and by hearNext: the call fails", async () => {
    const seen = await Effect.runPromise(Effect.forEach(["hear", "hearNext"] as const, (how) =>
      Effect.gen(function*() {
        const given = yield* signals
        return yield* rehearse(
          holding(given),
          Effect.fnUntraced(function*(rehearsal) {
            yield* Effect.forkChild(rehearsal.hearNext("a"), { startImmediately: true })
            const swapping = yield* Effect.forkChild(rehearsal.send(() => Opt.some<HeldMessage>("Swap")))
            yield* Deferred.await(given.releasing)
            const hearing = yield* Effect.forkChild(
              how === "hear" ? rehearsal.hear("b", "Tick") : rehearsal.hearNext("b"),
              { startImmediately: true }
            )
            const dropping = yield* Effect.forkChild(rehearsal.send(() => Opt.some<HeldMessage>("DropB")), {
              startImmediately: true
            })
            yield* Deferred.succeed(given.gate, undefined)
            yield* Fiber.join(swapping)
            yield* Fiber.join(dropping)
            const call = yield* Fiber.await(hearing)
            return { failed: Exit.isFailure(call), count: (yield* rehearsal.state).count }
          })
        )
      })))
    expect(seen).toEqual([{ failed: true, count: 0 }, { failed: true, count: 0 }])
  })
})
