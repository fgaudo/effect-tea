import { describe, expect, test } from "bun:test"
import * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as HashMap from "effect/HashMap"
import * as Opt from "effect/Option"
import type * as Scope from "effect/Scope"
import * as TestClock from "effect/testing/TestClock"
import { ProgramDefect } from "../defect.ts"
import type { Program } from "../program.ts"
import type { Subscription } from "../subscription.ts"
import { reject, type Update } from "../update.ts"
import { drive } from "./drive.ts"

describe("drive", () => {
  // A note of one line, saved by `Store`, and pinged once by a subscription that stops with the program.
  // `Explode` starts `Crash`, a command with a bug.
  type Note = Readonly<{ text: string; isSaving: boolean; saved: Opt.Option<string>; pings: number }>
  type Edit =
    | Readonly<{ _tag: "Typed"; text: string }>
    | Readonly<{ _tag: "Save" }>
    | Readonly<{ _tag: "Saved" }>
    | Readonly<{ _tag: "Pinged" }>
    | Readonly<{ _tag: "Explode" }>

  type NoteCommand = "Store" | "Crash"

  const editNote: Update<Note, Edit, NoteCommand> = (message) => (note) => {
    switch (message._tag) {
      case "Typed":
        return note.isSaving || message.text.includes("\n") ? reject : { state: { ...note, text: message.text } }
      case "Save":
        return note.isSaving || note.text === "" ? reject : {
          state: { ...note, isSaving: true },
          commands: ["Store"]
        }
      case "Saved":
        return note.isSaving ? { state: { ...note, isSaving: false, saved: Opt.some(note.text) } } : reject
      case "Pinged":
        return { state: { ...note, pings: note.pings + 1 } }
      case "Explode":
        return { state: note, commands: ["Crash"] }
    }
  }

  // Typing is shown while not saving, and saving only for a text that is not empty.
  type NoteModel =
    | Readonly<{ _tag: "Saving"; note: Note; explode: Edit }>
    | Readonly<{ _tag: "Empty"; note: Note; changeText: (text: string) => Edit; explode: Edit }>
    | Readonly<{
      _tag: "Written"
      note: Note
      changeText: (text: string) => Edit
      save: Edit
      explode: Edit
    }>

  const noteProgram = (
    onStop: Effect.Effect<void>
  ): Program<{ state: Note; model: NoteModel; message: Edit; command: NoteCommand }> => ({
    init: { state: { text: "", isSaving: false, saved: Opt.none(), pings: 0 } },
    update: editNote,
    runCommand: (command) =>
      command === "Store" ? Effect.succeedSome<Edit>({ _tag: "Saved" }) : Effect.die(new Error("boom")),
    subscriptions: () =>
      HashMap.make([
        "ping",
        Channel.succeed<Edit>({ _tag: "Pinged" }).pipe(
          Channel.concatWith(() => Channel.never),
          Channel.ensuring(onStop)
        )
      ]),
    makeModel: (note): NoteModel => {
      const explode: Edit = { _tag: "Explode" }
      if (note.isSaving) return { _tag: "Saving", note, explode }
      const changeText = (text: string): Edit => ({ _tag: "Typed", text })
      return note.text === ""
        ? { _tag: "Empty", note, changeText, explode }
        : { _tag: "Written", note, changeText, save: { _tag: "Save" }, explode }
    }
  })

  const typing = (text: string) => (model: NoteModel) =>
    model._tag === "Saving" ? Opt.none() : Opt.some(model.changeText(text))

  const saving = (model: NoteModel) => model._tag === "Written" ? Opt.some(model.save) : Opt.none()

  test("runs the commands and subscriptions, returns what the scenario returns, then stops the program", async () => {
    let stopped = false
    const program = noteProgram(Effect.sync(() => {
      stopped = true
    }))
    const saved = await Effect.runPromise(drive(
      program,
      Effect.fnUntraced(function*(driver) {
        yield* driver.waitFor((model) => model.note.pings === 1 ? Opt.some(true) : Opt.none())
        yield* driver.send(typing("milk"))
        yield* driver.send((model) => model.note.text === "milk" ? saving(model) : Opt.none())
        return yield* driver.waitFor((model) => model.note.saved)
      })
    ))
    expect(saved).toBe("milk")
    expect(stopped).toBe(true)
  })

  test("called inside an uninterruptible region, runs the scenario and stops the program", async () => {
    let stopped = false
    const program = noteProgram(Effect.sync(() => {
      stopped = true
    }))
    const saved = await Effect.runPromise(Effect.uninterruptible(drive(
      program,
      Effect.fnUntraced(function*(driver) {
        yield* driver.send(typing("milk"))
        yield* driver.send((model) => model.note.text === "milk" ? saving(model) : Opt.none())
        return yield* driver.waitFor((model) => model.note.saved)
      })
    )))
    expect(saved).toBe("milk")
    expect(stopped).toBe(true)
  })

  test("a program with flags starts from the flags the test gives it", async () => {
    const program = noteProgram(Effect.void)
    const seeded: Program<{ state: Note; model: NoteModel; message: Edit; command: NoteCommand; flags: string }> = {
      ...program,
      init: (text) => ({ state: { text, isSaving: false, saved: Opt.none(), pings: 0 } })
    }
    const text = await Effect.runPromise(drive(
      seeded,
      (driver) => driver.waitFor((model) => Opt.some(model.note.text)),
      { flags: "eggs" }
    ))
    expect(text).toBe("eggs")
    // @ts-expect-error: it has nothing to start from.
    expect(() => drive(seeded, () => Effect.void)).toBeDefined()
  })

  test("a program written as a plain object, without commands, needs no runCommand", async () => {
    const plain = {
      init: { state: { count: 0 } },
      update: () => ({ count }: Readonly<{ count: number }>) => ({ state: { count: count + 1 } }),
      subscriptions: () => HashMap.empty(),
      makeModel: ({ count }: Readonly<{ count: number }>) => count
    }
    expect(await Effect.runPromise(drive(plain, (driver) => driver.waitFor(Opt.some)))).toBe(0)
  })

  test("send waits for a model that shows the message", async () => {
    const saved = await Effect.runPromise(drive(
      noteProgram(Effect.void),
      Effect.fnUntraced(function*(driver) {
        // Not shown while the text is empty.
        yield* Effect.all([driver.send(saving), driver.send(typing("eggs"))], { concurrency: "unbounded" })
        return yield* driver.waitFor((model) => model.note.saved)
      })
    ))
    expect(saved).toBe("eggs")
  })

  test("a wait sees the current model, never one made before it", async () => {
    type Ticked = Readonly<{ count: number }>
    // Each tick waits for the model of the count before it to be made, so that every count is read.
    const made = Arr.makeBy(3, () => Deferred.makeUnsafe<void>())
    const ticks = (count: number): Subscription<"Tick", never> => {
      const gate = made[count]
      return gate === undefined
        ? Channel.never
        : Channel.fromEffect(Effect.as(Deferred.await(gate), "Tick" as const)).pipe(
          Channel.concatWith(() => ticks(count + 1))
        )
    }
    const program: Program<{ state: Ticked; model: number; message: "Tick" }> = {
      init: { state: { count: 0 } },
      update: () => ({ count }) => ({ state: { count: count + 1 } }),
      makeModel: ({ count }) => {
        const gate = made[count]
        if (gate !== undefined) Deferred.doneUnsafe(gate, Effect.void)
        return count
      },
      subscriptions: () => HashMap.make(["ticks", ticks(0)])
    }
    const seen = await Effect.runPromise(drive(
      program,
      Effect.fnUntraced(function*(driver) {
        yield* driver.waitFor((count) => count === made.length ? Opt.some(count) : Opt.none())
        return yield* driver.waitFor(Opt.some)
      })
    ))
    expect(seen).toBe(made.length)
  })

  test("a defect of the program fails the scenario", async () => {
    const exit = await Effect.runPromiseExit(
      drive(
        noteProgram(Effect.void),
        Effect.fnUntraced(function*(driver) {
          yield* driver.send((model) => Opt.some(model.explode))
          return yield* Effect.never
        })
      )
    )
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(defect instanceof ProgramDefect && String(defect.cause)).toContain("boom")
  })

  test("a defect of what the program releases as it stops comes first, before what the scenario failed with", async () => {
    const exit = await Effect.runPromiseExit(drive(
      noteProgram(Effect.die("release")),
      Effect.fnUntraced(function*(driver) {
        yield* driver.waitFor((model) => model.note.pings === 1 ? Opt.some(true) : Opt.none())
        return yield* Effect.fail("scenario")
      })
    ))
    expect(
      Exit.isFailure(exit)
        ? exit.cause.reasons.map((reason) =>
          Cause.isDieReason(reason) && reason.defect instanceof ProgramDefect
            ? `${reason.defect.where}: ${String(reason.defect.cause)}`
            : Cause.isFailReason(reason)
            ? reason.error
            : reason._tag
        )
        : []
    ).toEqual(["subscription: release", "scenario"])
  })

  // The run may end before its renderer has its handle, which `drive` begins the scenario with.
  test("a subscription of init that dies fails a scenario waiting for a model, before its patience", async () => {
    type Still = Readonly<{ still: boolean }>
    const program: Program<{ state: Still; model: Still; message: never }> = {
      init: { state: { still: true } },
      update: () => (state) => ({ state }),
      makeModel: (state) => state,
      subscriptions: () => HashMap.make(["dies", Channel.fromEffectDone(Effect.die("boom"))])
    }
    const exit = await Effect.runPromiseExit(
      drive(program, (driver) => Effect.andThen(driver.waitFor(() => Opt.none()), Effect.never), { patience: "1 hour" })
    )
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(defect instanceof ProgramDefect && defect.where).toBe("subscription")
  })

  test("a wait longer than the patience fails, measured with the real clock even under a TestClock", async () => {
    const exit = await Effect.runPromiseExit(
      drive(
        noteProgram(Effect.void),
        (driver) => driver.waitFor(() => Opt.none()),
        { patience: "20 millis" }
      ).pipe(Effect.provide(TestClock.layer()))
    )
    expect(Exit.isFailure(exit) && String(Cause.squash(exit.cause))).toContain("No model showed")
  })

  test("a wait longer than the patience fails with the patience and its unit, given as a number of milliseconds", async () => {
    const exit = await Effect.runPromiseExit(
      drive(noteProgram(Effect.void), (driver) => driver.waitFor(() => Opt.none()), { patience: 20 })
    )
    expect(Exit.isFailure(exit) && String(Cause.squash(exit.cause))).toContain("within 20ms")
  })

  test("a wait longer than the patience fails with the latest model as its cause", async () => {
    const exit = await Effect.runPromiseExit(drive(
      noteProgram(Effect.void),
      Effect.fnUntraced(function*(driver) {
        yield* driver.send(typing("milk"))
        yield* driver.waitFor((model) => model.note.text === "milk" ? Opt.some(model) : Opt.none())
        return yield* driver.waitFor(() => Opt.none())
      }),
      { patience: 20 }
    ))
    const cause = Exit.isFailure(exit) ? (Cause.squash(exit.cause) as Error).cause : undefined
    expect(cause).toMatchObject({ _tag: "Written", note: { text: "milk" } })
  })

  test("a message update rejects is ignored, as when the program runs", async () => {
    const saved = await Effect.runPromise(drive(
      noteProgram(Effect.void),
      Effect.fnUntraced(function*(driver) {
        yield* driver.send(typing("milk\neggs"))
        yield* driver.send(typing("milk"))
        yield* driver.send((model) => model.note.text === "milk" ? saving(model) : Opt.none())
        return yield* driver.waitFor((model) => model.note.saved)
      })
    ))
    expect(saved).toBe("milk")
  })

  test("a program whose commands acquire needs no scope: each command has its own", async () => {
    const released: Array<string> = []
    type Holding = Readonly<{ count: number }>
    const holding: Program<
      { state: Holding; model: number; message: "Held"; command: "Hold"; commandServices: Scope.Scope }
    > = {
      init: { state: { count: 0 }, commands: ["Hold"] },
      update: () => ({ count }) => ({ state: { count: count + 1 } }),
      runCommand: () =>
        Effect.acquireRelease(Effect.void, () => Effect.sync(() => released.push("resource"))).pipe(
          Effect.as(Opt.some<"Held">("Held"))
        ),
      subscriptions: () => HashMap.empty(),
      makeModel: ({ count }) => count
    }
    const driven: Effect.Effect<number> = drive(
      holding,
      (driver) => driver.waitFor((count) => count === 1 ? Opt.some(released.length) : Opt.none())
    )
    expect(await Effect.runPromise(driven)).toBe(1)
  })
})

describe("drive and a defect of the step the scenario waits for", () => {
  // The state of a step is current once its subscriptions are reconciled, in the call that sends it, and its commands
  // start after, in the fiber of effects: a scenario that ends as soon as it sees that state fails with a defect of its
  // subscriptions, and one that waits on fails with a defect of its commands too. One that ended may have ended the
  // run before they started, as the end of the run stops the fiber of effects with the jobs it had not taken.
  type Count = Readonly<{ count: number }>
  type Model = Readonly<{ count: number; next: "Next" }>
  const counting = { init: { state: { count: 0 } }, makeModel: ({ count }: Count): Model => ({ count, next: "Next" }) }
  const next = ({ count }: Count) => ({ count: count + 1 })
  const boom = (): never => {
    throw new Error("boom")
  }

  const whereItDied = async (
    program: Program<{ state: Count; model: Model; message: "Next"; command: "Crash" }>,
    then: Effect.Effect<void> = Effect.void
  ) => {
    const exit = await Effect.runPromiseExit(drive(
      program,
      Effect.fnUntraced(function*(driver) {
        yield* driver.send(({ next }) => Opt.some(next))
        yield* driver.waitFor(({ count }) => count === 1 ? Opt.some(count) : Opt.none())
        yield* then
      })
    ))
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return defect instanceof ProgramDefect ? defect.where : undefined
  }

  test("in its subscriptions", async () => {
    expect(
      await whereItDied({
        ...counting,
        update: () => (state) => ({ state: next(state) }),
        runCommand: () => Effect.succeedNone,
        subscriptions: ({ count }) => count === 1 ? boom() : HashMap.empty()
      })
    ).toBe("subscriptions")
  })

  test("in a command it starts, once the scenario waits on", async () => {
    expect(
      await whereItDied({
        ...counting,
        update: () => (state) => ({ state: next(state), commands: ["Crash"] }),
        runCommand: () => Effect.die("boom"),
        subscriptions: () => HashMap.empty()
      }, Effect.never)
    ).toBe("command")
  })
})

describe("drive interrupted by whoever runs it", () => {
  // Ticks once, telling `started`, and dies as it releases what it holds.
  type Still = Readonly<{ seen: number }>
  const dying = (started: Deferred.Deferred<void>): Program<{ state: Still; model: Still; message: "Tick" }> => ({
    init: { state: { seen: 0 } },
    update: () => (state) => ({ state }),
    subscriptions: () =>
      HashMap.make([
        "ticks",
        Channel.unwrap(Effect.as(Deferred.succeed(started, undefined), Channel.succeed<"Tick">("Tick"))).pipe(
          Channel.concatWith(() => Channel.never),
          Channel.onExit(() => Effect.die("release"))
        )
      ]),
    makeModel: (state) => state
  })

  // As the run interrupted by whoever runs it keeps such a defect in its cause ("a subscription that dies while an
  // interrupted run releases it is in the cause", `run.test.ts`): the run's fiber is a child of `drive`'s, which
  // stops it and awaits its exit however it ends.
  test("fails on a defect of what a subscription releases", async () => {
    const exit = await Effect.runPromise(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const fiber = yield* Effect.forkChild(drive(dying(started), () => Effect.never))
      yield* Deferred.await(started)
      yield* Fiber.interrupt(fiber)
      return yield* Fiber.await(fiber)
    }))
    expect(
      Exit.isFailure(exit) &&
        exit.cause.reasons.some((reason) =>
          Cause.isDieReason(reason) && reason.defect instanceof ProgramDefect && reason.defect.where === "subscription"
          && reason.defect.cause === "release"
        )
    ).toBe(true)
  })
})

// A run that dies ends the scenario: `drive` interrupts it, and returns once it has released what it holds, as it
// waits for the run (`Effect.raceFirst` waits for the effect it interrupts, `docs/premises.md`).
describe("drive and a scenario the death of the run interrupts", () => {
  type Still = Readonly<{ still: boolean }>

  test("returns once the scenario has released what it holds", async () => {
    const log: Array<"released" | "drive ended"> = []
    const go = Deferred.makeUnsafe<void>()
    // The subscription dies once the scenario has begun.
    const program: Program<{ state: Still; model: Still; message: never }> = {
      init: { state: { still: true } },
      update: () => (state) => ({ state }),
      makeModel: (state) => state,
      subscriptions: () =>
        HashMap.make(["dies", Channel.fromEffectDone(Effect.andThen(Deferred.await(go), Effect.die("boom")))])
    }
    await Effect.runPromise(Effect.gen(function*() {
      yield* Effect.exit(drive(program, () =>
        Effect.onInterrupt(
          Effect.andThen(Deferred.succeed(go, undefined), Effect.never),
          () => Effect.andThen(Effect.sleep("20 millis"), Effect.sync(() => log.push("released")))
        )))
      log.push("drive ended")
    }))
    expect(log).toEqual(["released", "drive ended"])
  })
})

// Found by the sixth premise review of November 2026: `drive` forks the run, then calls `scenario`. One that throws
// before it returns its effect ends `drive` there, past the lines that stop the run and await it: the run starts
// after `drive` has ended, and goes on until the fiber of whoever ran `drive` ends.
describe("drive and a scenario that throws before it returns its effect", () => {
  type Still = Readonly<{ still: boolean }>

  test("nothing of the program happens once drive has ended", async () => {
    const log: Array<"started" | "released" | "drive ended"> = []
    const program: Program<{ state: Still; model: Still; message: "Tick" }> = {
      init: { state: { still: true } },
      update: () => (state) => ({ state }),
      subscriptions: () =>
        HashMap.make([
          "ticks",
          Channel.unwrap(Effect.sync(() => {
            log.push("started")
            return Channel.never
          })).pipe(Channel.ensuring(Effect.sync(() => log.push("released"))))
        ]),
      makeModel: (state) => state
    }
    const exit = await Effect.runPromise(Effect.gen(function*() {
      const exit = yield* Effect.exit(drive(program, () => {
        throw new Error("boom")
      }))
      log.push("drive ended")
      // Turns of the scheduler, not time: a run left behind would start its subscription in far fewer.
      yield* Effect.repeat(Effect.yieldNow, { times: 100 })
      return exit
    }))
    expect(Exit.isFailure(exit) && String(Cause.squash(exit.cause))).toContain("boom")
    expect(log.slice(log.indexOf("drive ended") + 1)).toEqual([])
    expect(log.filter((each) => each === "started").length).toBe(log.filter((each) => each === "released").length)
  })
})

// What a driver reads of the run: the model of the current state, and the run's own dispatch.
describe("drive's model and dispatch", () => {
  type Count = Readonly<{ count: number }>
  type Counted = "Up" | "Boom"
  const counter: Program<{ state: Count; model: Count; message: Counted }> = {
    init: { state: { count: 0 } },
    update: (message) => ({ count }) => {
      if (message === "Boom") throw new Error("boom")
      return count < 1 ? { state: { count: count + 1 } } : reject
    },
    subscriptions: () => HashMap.empty(),
    makeModel: (state) => state
  }

  test("model is the model of the current state, at once after a send", async () => {
    const counts = await Effect.runPromise(drive(
      counter,
      Effect.fnUntraced(function*(driver) {
        const before = (yield* driver.model).count
        yield* driver.send(() => Opt.some<Counted>("Up"))
        return [before, (yield* driver.model).count]
      })
    ))
    expect(counts).toEqual([0, 1])
  })

  test("dispatch is the run's own from the scenario's first step: a message the state has moved past is ignored", async () => {
    const ignored: Array<Counted> = []
    const count = await Effect.runPromise(drive(
      counter,
      Effect.fnUntraced(function*(driver) {
        yield* Effect.sync(() => driver.dispatch("Up"))
        yield* Effect.sync(() => driver.dispatch("Up"))
        return (yield* driver.model).count
      }),
      { onIgnored: ({ message }) => void ignored.push(message) }
    ))
    expect(count).toBe(1)
    expect(ignored).toEqual(["Up"])
  })

  test("after a defect of the program, model fails with it", async () => {
    let read: Exit.Exit<Count> | undefined
    const exit = await Effect.runPromiseExit(drive(
      counter,
      Effect.fnUntraced(function*(driver) {
        yield* Effect.sync(() => driver.dispatch("Boom"))
        read = yield* Effect.exit(driver.model)
      })
    ))
    const failed = read !== undefined && Exit.isFailure(read) ? Cause.squash(read.cause) : undefined
    expect(failed instanceof ProgramDefect && failed.where).toBe("update")
    expect(Exit.isFailure(exit)).toBe(true)
  })
})

// Found by the review of the testing tools of November 2026. `drive` is told of a step in its listener, while the step
// is still being applied, and wakes the waits there: a fiber waiting on a model goes on on that stack, so a `send` it
// makes is a dispatch sent during the step, which returns before its message is applied.
describe("drive's send, made by a wait that a step wakes", () => {
  type Row = Readonly<{ count: number; went: boolean }>
  const row: Program<{ state: Row; model: Row; message: "Up" | "Go" }> = {
    init: { state: { count: 0, went: false } },
    update: (message) => (state) =>
      message === "Up" ? { state: { ...state, count: state.count + 1 } } : { state: { ...state, went: true } },
    subscriptions: () => HashMap.empty(),
    makeModel: (state) => state
  }

  // The waiting fiber is forked at once, so that it waits before the scenario dispatches.
  test("returns once update has seen its message, as it promises", async () => {
    const after = await Effect.runPromise(drive(
      row,
      Effect.fnUntraced(function*(driver) {
        const waiting = yield* Effect.forkChild(
          driver.waitFor(({ count }) => count === 1 ? Opt.some(count) : Opt.none()).pipe(
            Effect.andThen(driver.send(() => Opt.some<"Up" | "Go">("Go"))),
            Effect.andThen(driver.model)
          ),
          { startImmediately: true }
        )
        yield* Effect.sync(() => driver.dispatch("Up"))
        return yield* Fiber.join(waiting)
      })
    ))
    expect(after).toEqual({ count: 1, went: true })
  })
})
