// The boundary of a program started: what `start` gives, by plain code, and what its `run` does.
import { describe, expect, test } from "bun:test"
import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Opt from "effect/Option"
import { program } from "./compose.ts"
import { defect, InvariantDefect, ProgramDefect } from "./defect.ts"
import type { Program } from "./program.ts"
import { start } from "./run.ts"

// A loader: `init` starts the command `Load`, which answers `Loaded` once `answer` is done, and listens to `held`,
// which logs what it acquires and releases. `More` starts another `Load`.
type Loads = Readonly<{ loaded: number; asked: number }>

type LoadMessage = "Loaded" | "More"

const loader = (log: Array<string>, answer: Deferred.Deferred<void>) => {
  const program: Program<{ state: Loads; model: Loads; message: LoadMessage; command: "Load"; key: "held" }> = {
    init: { state: { loaded: 0, asked: 1 }, commands: ["Load"] },
    update: (message) => (state) =>
      message === "Loaded"
        ? { state: { ...state, loaded: state.loaded + 1 } }
        : { state: { ...state, asked: state.asked + 1 }, commands: ["Load"] },
    runCommand: () =>
      Effect.suspend(() => {
        log.push("command started")
        return Deferred.await(answer).pipe(
          Effect.as(Opt.some<LoadMessage>("Loaded")),
          Effect.onInterrupt(() => Effect.sync(() => log.push("command interrupted")))
        )
      }),
    subscriptions: () => ["held" as const],
    listen: () =>
      Channel.unwrap(
        Effect.acquireRelease(
          Effect.sync(() => log.push("subscription started")),
          () => Effect.sync(() => log.push("subscription released"))
        ).pipe(Effect.as(Channel.never))
      ),
    makeModel: (state) => state
  }
  return program
}

/** What a run died of, each defect by its site and what it holds, in order. */
const wheres = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit)
    ? exit.cause.reasons.filter(Cause.isDieReason).map(({ defect }) =>
      defect instanceof ProgramDefect ? `${defect.where}: ${String(defect.cause)}` : `raw: ${String(defect)}`
    )
    : []

const ended = <A, E>(fiber: Fiber.Fiber<A, E>) => Effect.runPromise(Fiber.await(fiber))

const interrupted = <A, E>(fiber: Fiber.Fiber<A, E>) =>
  Effect.runPromise(Effect.andThen(Fiber.interrupt(fiber), Fiber.await(fiber)))

describe("a program started", () => {
  test("is made by plain code: its first model is read at once, and nothing of init has started", () => {
    const log: Array<string> = []
    const { app } = start(loader(log, Deferred.makeUnsafe<void>()))
    expect(app.model()).toEqual({ loaded: 0, asked: 1 })
    expect(log).toEqual([])
  })

  test("applies a message sent before run starts, and its effects wait for run, in the order of the states", async () => {
    const log: Array<string> = []
    const answer = Deferred.makeUnsafe<void>()
    const { app, run } = start(loader(log, answer), { onApplied: ({ message }) => void log.push(`applied ${message}`) })
    const told: Array<number> = []
    app.subscribe(() => told.push(app.model().asked))
    app.dispatch("More")
    expect(app.model().asked).toBe(2)
    expect(told).toEqual([2])
    expect(log).toEqual(["applied More"])
    const fiber = Effect.runFork(run)
    // The first state's job, then the message's: on the stack of whoever forks the run.
    expect(log).toEqual(["applied More", "subscription started", "command started", "command started"])
    Deferred.doneUnsafe(answer, Exit.void)
    await Effect.runPromise(Effect.yieldNow)
    expect(app.model().loaded).toBe(2)
    await interrupted(fiber)
  })

  test("interrupted, its run stops the program: what it started is released, and a dispatch after applies nothing", async () => {
    const log: Array<string> = []
    const { app, run } = start(loader(log, Deferred.makeUnsafe<void>()))
    const fiber = Effect.runFork(run)
    const exit = await interrupted(fiber)
    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
    expect(log).toEqual(["subscription started", "command started", "command interrupted", "subscription released"])
    const before = app.model()
    app.dispatch("More")
    expect(app.model()).toBe(before)
  })

  test("is run once: a second run dies, and the first goes on", async () => {
    const log: Array<string> = []
    const { app, run } = start(loader(log, Deferred.makeUnsafe<void>()))
    const first = Effect.runFork(run)
    const second = await Effect.runPromiseExit(run)
    expect(wheres(second)).toEqual([
      "raw: Error: A program that was started is run once: start it again to run it again"
    ])
    app.dispatch("More")
    expect(app.model().asked).toBe(2)
    expect(log).toEqual(["subscription started", "command started"])
    await Effect.runPromise(Effect.yieldNow)
    expect(log).toEqual(["subscription started", "command started", "command started"])
    await interrupted(first)
    const third = await Effect.runPromiseExit(run)
    expect(wheres(third)).toHaveLength(1)
  })

  // An alarm of what the guide leaves unspecified: the effects of a step start once the call that sent its message has
  // returned. It rests on the queue of the jobs resuming the fiber of effects in a task of the scheduler, and is the
  // killer of no mutation.
  test("a dispatch returns before the commands of its step start, while the fiber of effects waits", async () => {
    const log: Array<string> = []
    const { app, run } = start(loader(log, Deferred.makeUnsafe<void>()))
    const fiber = Effect.runFork(run)
    await Effect.runPromise(Effect.yieldNow)
    expect(log).toEqual(["subscription started", "command started"])
    app.dispatch("More")
    log.push("dispatch returned")
    await Effect.runPromise(Effect.yieldNow)
    expect(log).toEqual(["subscription started", "command started", "dispatch returned", "command started"])
    await interrupted(fiber)
  })

  test("dies of a command's defect, in command, and applies nothing after", async () => {
    type Boom = Program<{ state: Readonly<{ n: number }>; model: number; message: "Up"; command: "Boom" }>
    const boom: Boom = {
      init: { state: { n: 0 }, commands: ["Boom"] },
      update: () => (state) => ({ state: { n: state.n + 1 } }),
      runCommand: () => Effect.die("boom"),
      subscriptions: () => [],
      makeModel: ({ n }) => n
    }
    const { app, run } = start(boom)
    app.dispatch("Up")
    expect(app.model()).toBe(1)
    const exit = await ended(Effect.runFork(run))
    expect(wheres(exit)).toEqual(["command: boom"])
    app.dispatch("Up")
    expect(app.model()).toBe(1)
  })

  test("never run, reports no defect: nothing is thrown to the sender, nothing is applied after it, and run dies of it once it runs", async () => {
    type Fragile = Program<{ state: Readonly<{ n: number }>; model: number; message: "Up" | "Break" }>
    const fragile: Fragile = {
      init: { state: { n: 0 } },
      update: (message) => (state) => {
        if (message === "Break") throw new Error("broke")
        return { state: { n: state.n + 1 } }
      },
      subscriptions: () => [],
      makeModel: ({ n }) => n
    }
    const { app, run } = start(fragile)
    let told = 0
    app.subscribe(() => void told++)
    app.dispatch("Up")
    expect(() => app.dispatch("Break")).not.toThrow()
    app.dispatch("Up")
    expect([app.model(), told]).toEqual([1, 1])
    const exit = await Effect.runPromiseExit(run)
    expect(wheres(exit)).toEqual(["update: Error: broke"])
  })

  test("whose run is interrupted before it begins, is as one never run: it applies messages, starts nothing, reports no defect, and runs later", async () => {
    type Noting = Program<{ state: Readonly<{ n: number }>; model: number; message: "Up" | "Break"; command: "Note" }>
    const log: Array<string> = []
    const noting: Noting = {
      init: { state: { n: 0 }, commands: ["Note"] },
      update: (message) => (state) => {
        if (message === "Break") throw new Error("broke")
        return { state: { n: state.n + 1 }, commands: ["Note"] }
      },
      runCommand: () => Effect.as(Effect.sync(() => log.push("command started")), Opt.none()),
      subscriptions: () => [],
      makeModel: ({ n }) => n
    }
    const { app, run } = start(noting)
    // Forked to start in a later task, and interrupted in this one: none of `run` has run.
    const interruptedBefore = await Effect.runPromise(
      Effect.forkChild(run).pipe(Effect.flatMap((fiber) => Effect.andThen(Fiber.interrupt(fiber), Fiber.await(fiber))))
    )
    app.dispatch("Up")
    expect(() => app.dispatch("Break")).not.toThrow()
    app.dispatch("Up")
    expect({
      interrupted: Exit.isFailure(interruptedBefore) && Cause.hasInterruptsOnly(interruptedBefore.cause),
      model: app.model(),
      log
    }).toEqual({ interrupted: true, model: 1, log: [] })
    const exit = await Effect.runPromiseExit(run)
    expect(wheres(exit)).toEqual(["update: Error: broke"])
  })
})

describe("a program whose start throws", () => {
  type Flagged = Program<{ state: Readonly<{ n: number }>; model: number; message: "Up"; flags: number }>

  const flagged: Flagged = {
    init: (flags) => {
      if (flags < 0) throw new Error("negative")
      return { state: { n: flags } }
    },
    update: () => (state) => ({ state: { n: state.n + 1 } }),
    subscriptions: ({ n }) => {
      if (n === 13) throw new Error("unlucky")
      return []
    },
    makeModel: ({ n }) => n
  }

  test("in init: the handle is made, model() throws the defect in init, nothing is applied, and run dies of it", async () => {
    const { app, run } = start(flagged, { flags: -1 })
    let thrown: unknown
    try {
      app.model()
    } catch (defect) {
      thrown = defect
    }
    expect(thrown).toBeInstanceOf(ProgramDefect)
    expect((thrown as ProgramDefect).where).toBe("init")
    let told = 0
    app.subscribe(() => void told++)
    app.dispatch("Up")
    expect(told).toBe(0)
    const exit = await Effect.runPromiseExit(run)
    expect(wheres(exit)).toEqual(["init: Error: negative"])
    expect(
      Exit.isFailure(exit) && exit.cause.reasons[0] !== undefined && Cause.isDieReason(exit.cause.reasons[0])
        ? exit.cause.reasons[0].defect
        : undefined
    ).toBe(thrown)
  })

  test("in subscriptions, on the first state: the model is read, nothing is applied, and run dies of it", async () => {
    const { app, run } = start(flagged, { flags: 13 })
    expect(app.model()).toBe(13)
    app.dispatch("Up")
    expect(app.model()).toBe(13)
    const exit = await Effect.runPromiseExit(run)
    expect(wheres(exit)).toEqual(["subscriptions: Error: unlucky"])
  })

  type Leaf = Readonly<{ on: boolean }>

  const leaf: Program<{ state: Leaf; model: null; message: "Flip" }> = {
    init: { state: { on: false } },
    update: () => (state) => ({ state: { on: !state.on } }),
    subscriptions: () => [],
    makeModel: () => null
  }

  // A parent without flags is started as `make` makes it: the children that its first state lists are started then,
  // so what a function of their places throws, `make` throws as it is (the doc comment of `init`, in `compose.ts`).
  test("in a child's place, in a parent with no flags: make throws the defect as it is", () => {
    const Parent = program<{ state: Readonly<{ on: boolean }> }>()
    let thrown: unknown
    try {
      Parent.withChildren({ Leaf: Parent.child(leaf, { there: () => defect("no parent starts") }) }).make({
        init: { state: { on: true } },
        makeModel: () => null
      })
    } catch (caught) {
      thrown = caught
    }
    expect(thrown).toBeInstanceOf(InvariantDefect)
    expect(thrown instanceof InvariantDefect ? thrown.reason : thrown).toBe("no parent starts")
  })

  test("in the init of a parent with a child and flags: the handle is made, model() throws the defect, and run dies of it", async () => {
    const Parent = program<{ state: Readonly<{ flags: number }>; flags: number }>()
    const made = Parent.withChildren({ Leaf: Parent.child(leaf) }).make({
      init: (flags) => flags < 0 ? defect("no parent starts") : { state: { flags } },
      makeModel: () => null
    })
    const { app, run } = start(made, { flags: -1 })
    let thrown: unknown
    try {
      app.model()
    } catch (caught) {
      thrown = caught
    }
    expect(thrown).toBeInstanceOf(ProgramDefect)
    expect((thrown as ProgramDefect).where).toBe("init")
    const cause = thrown instanceof ProgramDefect ? thrown.cause : undefined
    expect(cause instanceof InvariantDefect ? cause.reason : cause).toBe("no parent starts")
    const exit = await Effect.runPromiseExit(run)
    const died = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(died).toBe(thrown)
  })
})

describe("the end of a run", () => {
  // A listener throws in the step of a message that a second message follows, sent by another listener in that
  // step. The end waits on `died`, and Effect resumes what waits on a `Deferred` on the stack of whoever completes it:
  // completed where the defect is recorded, the end would stop the subscription inside the step.
  test("never begins inside a step: a defect a listener throws ends the run once every listener of the step is told", async () => {
    const log: Array<string> = []
    const { app, run } = start(loader(log, Deferred.makeUnsafe<void>()))
    const fiber = Effect.runFork(run)
    log.length = 0
    app.subscribe(() => {
      throw new Error("listener")
    })
    app.subscribe(() => void log.push("second listener told"))
    app.dispatch("More")
    log.push("dispatch returned")
    const exit = await ended(fiber)
    expect(wheres(exit)).toEqual(["render: Error: listener"])
    expect(log.indexOf("second listener told")).toBe(0)
    expect(log.indexOf("subscription released")).toBeGreaterThan(log.indexOf("second listener told"))
  })

  // `update` throws, and the engine reads the message's tag to say what the defect was on: a tag that throws there is
  // thrown outside every site of the program, once the defect of `update` is recorded.
  test("what the thunk throws outside every site is recorded as it is, after the defect it was saying, never thrown to the sender, and ends the run", async () => {
    type Tagged = { readonly _tag: string }
    const program: Program<{ state: Readonly<{ n: number }>; model: number; message: Tagged }> = {
      init: { state: { n: 0 } },
      update: (message) => (state) => {
        if (message._tag === "Up") return { state: { n: state.n + 1 } }
        throw new Error("update threw")
      },
      subscriptions: () => [],
      makeModel: ({ n }) => n
    }
    let reads = 0
    const twice: Tagged = {
      get _tag() {
        if (reads++ > 0) throw new Error("tag threw")
        return "Other"
      }
    }
    const { app, run } = start(program)
    const fiber = Effect.runFork(run)
    app.dispatch(twice)
    app.dispatch({ _tag: "Up" })
    expect(app.model()).toBe(0)
    expect(wheres(await ended(fiber))).toEqual(["update: Error: update threw", "raw: Error: tag threw"])
  })
})
