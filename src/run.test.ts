import { describe, expect, expectTypeOf, test } from "bun:test"
import * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as FiberHandle from "effect/FiberHandle"
import * as FiberMap from "effect/FiberMap"
import * as FiberSet from "effect/FiberSet"
import * as Hash from "effect/Hash"
import * as HashMap from "effect/HashMap"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import * as Opt from "effect/Option"
import * as Queue from "effect/Queue"
import * as References from "effect/References"
import type * as Scope from "effect/Scope"
import * as TestClock from "effect/testing/TestClock"
import type * as Tracer from "effect/Tracer"
import { gate } from "../test/gate.test_helper.ts"
import { collectGarbage, objectHeap } from "../test/gc.test_helper.ts"
import type { Execution, RunCommand } from "./command.ts"
import { program } from "./compose.ts"
import { CompositionDefect, defect, type DefectSite, InvariantDefect, ProgramDefect } from "./defect.ts"
import { forwardTo } from "./dispatch.ts"
import type { Applied, Ignored, Origin, RunOptions } from "./engine.ts"
import type { Program } from "./program.ts"
import { type App, start, type Started } from "./run.ts"
import type { Subscription } from "./subscription.ts"
import { reject, type Step } from "./update.ts"

// A counter: `Increment` counts, `Same` leaves the very same state, `Ping` starts the command `Ping`, which answers
// `Increment`, and `Forbidden` is always rejected. The command `Boom` dies, where a test starts it.
type Message = "Increment" | "Forbidden" | "Same" | "Ping"

type Command = "Ping" | "Boom"

type Count = Readonly<{ count: number }>

type Model = Readonly<{ count: number }>

type Counter = Program<{ state: Count; model: Model; message: Message; command: Command }>

// The counter, with subscriptions under keys of type `Key`.
type Keyed<Key = string> = Program<{ state: Count; model: Model; message: Message; command: Command; key: Key }>

const counter: Counter = {
  init: { state: { count: 0 } },
  update: (message) => (state) =>
    message === "Increment"
      ? { state: { count: state.count + 1 } }
      : message === "Same"
      ? { state }
      : message === "Ping"
      ? { state, commands: ["Ping"] }
      : reject,
  runCommand: (command) => command === "Ping" ? Effect.succeedSome<Message>("Increment") : Effect.die("boom"),
  subscriptions: () => [],
  makeModel: ({ count }) => ({ count })
}

// The counter, whose command of `init` holds what it acquires in the scope the run gives it, and whose release dies:
// it tells by `holding` that it holds.
const releaseDies = (
  holding: Deferred.Deferred<void>
): Program<{ state: Count; model: Model; message: Message; command: Command; commandServices: Scope.Scope }> => ({
  ...counter,
  init: { state: { count: 0 }, commands: ["Ping"] },
  runCommand: () =>
    Effect.acquireRelease(Effect.void, () => Effect.die("release threw")).pipe(
      Effect.andThen(Deferred.succeed(holding, undefined)),
      Effect.andThen(Effect.never)
    )
})

/** What a run died of, each defect by its site and what it holds, in order. */
const wheres = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit)
    ? exit.cause.reasons.filter(Cause.isDieReason).map(({ defect }) =>
      defect instanceof ProgramDefect ? `${defect.where}: ${String(defect.cause)}` : `raw: ${String(defect)}`
    )
    : []

/** The defects a run died of, as they are. */
const defectsOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? exit.cause.reasons.filter(Cause.isDieReason).map(({ defect }) => defect) : []

/** How the run of `fiber` ended. */
const ended = <A, E>(fiber: Fiber.Fiber<A, E>) => Effect.runPromise(Fiber.await(fiber))

/** Interrupts the run of `fiber`, and returns how it ended. */
const interrupted = <A, E>(fiber: Fiber.Fiber<A, E>) =>
  Effect.runPromise(Effect.andThen(Fiber.interrupt(fiber), Fiber.await(fiber)))

/** Waits for `done`, unless the run of `fiber` ends first, then interrupts the run, and returns how it ended. */
const endedAfter = <A, E>(fiber: Fiber.Fiber<A, E>, done: Effect.Effect<unknown>) =>
  Effect.runPromise(
    Effect.raceFirst(Effect.asVoid(Fiber.await(fiber)), Effect.asVoid(done)).pipe(
      Effect.andThen(Fiber.interrupt(fiber)),
      Effect.andThen(Fiber.await(fiber))
    )
  )

/** Runs `running`, interrupts it once it says it has started, and returns how it ended. */
const interruptedOnce = (running: (started: Deferred.Deferred<void>) => Effect.Effect<void>) =>
  Effect.runPromiseExit(Effect.gen(function*() {
    const started = yield* Deferred.make<void>()
    const fiber = yield* Effect.forkChild(running(started))
    yield* Deferred.await(started)
    yield* Fiber.interrupt(fiber)
    return yield* Fiber.await(fiber)
  })).then((outcome) => Exit.isSuccess(outcome) ? outcome.value : outcome)

// A gate on the fiber's own state: uninterruptible, it waits until an interruption has reached it.
const untilInterrupted: Effect.Effect<void> = Effect.suspend(() =>
  Effect.exit(Effect.interruptible(Effect.void)).pipe(
    Effect.flatMap((exit) =>
      Exit.isFailure(exit) ? Effect.void : Effect.yieldNow.pipe(Effect.andThen(untilInterrupted))
    )
  )
)

/** Succeeds once the model of the current state of `app`, or of a later one, satisfies `reached`. */
const reaching = <M, Msg>(app: App<M, Msg>, reached: (model: M) => boolean): Effect.Effect<void> =>
  Effect.suspend(() => {
    const done = Deferred.makeUnsafe<void>()
    const check = () => {
      if (reached(app.model())) Deferred.doneUnsafe(done, Exit.void)
    }
    const stop = app.subscribe(check)
    check()
    return Deferred.await(done).pipe(Effect.ensuring(Effect.sync(stop)))
  })

/** What `f` throws, called as a plain callback calls it, or `undefined`. */
const thrownBy = (f: () => unknown): unknown => {
  try {
    f()
    return undefined
  } catch (thrown) {
    return thrown
  }
}

describe("the handle a renderer gets", () => {
  test("model() is the model of the current state, at once after a dispatch, and a rejected message leaves it", async () => {
    const { app, run } = start(counter)
    const fiber = Effect.runFork(run)
    const seen: Array<unknown> = [app.model().count]
    app.dispatch("Increment")
    seen.push(app.model().count)
    const before = app.model()
    app.dispatch("Forbidden")
    seen.push(app.model() === before)
    expect(wheres(await interrupted(fiber))).toEqual([])
    expect(seen).toEqual([0, 1, true])
  })

  test("a model is made only when read, once for each state", async () => {
    const made: Array<number> = []
    const { app, run } = start({ ...counter, makeModel: ({ count }) => (made.push(count), { count }) })
    const fiber = Effect.runFork(run)
    app.dispatch("Increment")
    app.dispatch("Increment")
    const first = app.model()
    const second = app.model()
    app.dispatch("Same")
    const same = first === second && second === app.model()
    await interrupted(fiber)
    expect({ made, same }).toEqual({ made: [2], same: true })
  })

  // A state that is `undefined` is not the one `model()` last made a model of, before it has made any.
  test("a model is made of a state that is undefined", async () => {
    const blank: Program<{ state: undefined; model: Model; message: Message }> = {
      init: { state: undefined },
      update: () => () => reject,
      subscriptions: () => [],
      makeModel: (state) => ({ count: state === undefined ? -1 : 0 })
    }
    const { app, run } = start(blank)
    const fiber = Effect.runFork(run)
    let model: unknown
    try {
      model = app.model()
    } catch (thrown) {
      model = thrown
    }
    expect(wheres(await interrupted(fiber))).toEqual([])
    expect(model).toEqual({ count: -1 })
  })

  test("a model is made once for a state that is NaN", async () => {
    const made: Array<number> = []
    const nan: Program<{ state: number; model: number; message: "Same" }> = {
      init: { state: Number.NaN },
      update: () => (state) => ({ state }),
      subscriptions: () => [],
      makeModel: (state) => (made.push(state), state)
    }
    const { app, run } = start(nan)
    const fiber = Effect.runFork(run)
    const first = app.model()
    app.dispatch("Same")
    const second = app.model()
    expect(wheres(await interrupted(fiber))).toEqual([])
    expect({ made, first, second }).toEqual({ made: [Number.NaN], first: Number.NaN, second: Number.NaN })
  })

  test("a listener is told of each new state, and a model read in it is of the latest state", async () => {
    const told: Array<number> = []
    const answered = Deferred.makeUnsafe<void>()
    const { app, run } = start(counter)
    app.subscribe(() => {
      told.push(app.model().count)
      if (app.model().count === 2) Deferred.doneUnsafe(answered, Exit.void)
    })
    const fiber = Effect.runFork(run)
    app.dispatch("Increment")
    app.dispatch("Same")
    app.dispatch("Forbidden")
    // Its answer, `Increment`, applied in the command's fiber.
    app.dispatch("Ping")
    expect(wheres(await endedAfter(fiber, Deferred.await(answered)))).toEqual([])
    expect(told).toEqual([1, 2])
  })

  test("a dispatch from a plain callback after the run has ended applies nothing, and throws nothing", async () => {
    const { app, run } = start(counter)
    await interrupted(Effect.runFork(run))
    const thrown = thrownBy(() => app.dispatch("Increment"))
    expect({ count: app.model().count, thrown }).toEqual({ count: 0, thrown: undefined })
  })

  test("a message a command sends as the run releases it does not reach update", async () => {
    const calls = { n: 0 }
    const holding = Deferred.makeUnsafe<void>()
    let send: (message: Message) => void = () => undefined
    const { app, run } = start({
      ...counter,
      init: { state: { count: 0 }, commands: ["Ping"] },
      update: (message: Message) => (state) => {
        calls.n += 1
        return counter.update(message)(state)
      },
      runCommand: () =>
        Effect.scoped(
          Effect.acquireRelease(Effect.void, () => Effect.sync(() => send("Increment"))).pipe(
            Effect.andThen(Deferred.succeed(holding, undefined)),
            Effect.andThen(Effect.never)
          )
        )
    })
    send = app.dispatch
    const exit = await endedAfter(Effect.runFork(run), Deferred.await(holding))
    expect(calls.n).toBe(0)
    expect(wheres(exit)).toEqual([])
  })
})

// A model's defect is recorded where the model is read, in `'render'`, once for each state, and the reader gets that
// very defect: a listener's site and `die` take it as it is, so that a model that throws is one defect, wherever it
// is read.
describe("a model's defect", () => {
  const throwing: Counter = {
    ...counter,
    makeModel: ({ count }) => {
      if (count === 1) throw "makeModel threw"
      return { count }
    }
  }

  test("a model read outside any fiber is recorded in render, and the reader gets the defect recorded", async () => {
    const { app, run } = start(throwing)
    const fiber = Effect.runFork(run)
    const read = Deferred.makeUnsafe<unknown>()
    // As a renderer's callback reads it: a timer's.
    setTimeout(() => {
      app.dispatch("Increment")
      Deferred.doneUnsafe(read, Exit.succeed(thrownBy(() => app.model())))
    }, 0)
    const exit = await ended(fiber)
    expect(wheres(exit)).toEqual(["render: makeModel threw"])
    expect(defectsOf(exit)[0]).toBe(await Effect.runPromise(Deferred.await(read)))
  })

  test("a model read before the run starts is one defect, in render, and the run dies of it", async () => {
    const { app, run } = start(throwing)
    app.dispatch("Increment")
    const thrown = thrownBy(() => app.model())
    const exit = await Effect.runPromiseExit(run)
    expect(wheres(exit)).toEqual(["render: makeModel threw"])
    expect(defectsOf(exit)[0]).toBe(thrown)
  })

  // Before the run starts: once it has, its end may begin on the stack of the read that records the defect, and be over
  // before what follows the read.
  test("a second read of the same state throws the same defect, recorded once", async () => {
    const { app, run } = start(throwing)
    app.dispatch("Increment")
    const reads = [thrownBy(() => app.model()), thrownBy(() => app.model())]
    const exit = await Effect.runPromiseExit(run)
    expect(wheres(exit)).toEqual(["render: makeModel threw"])
    expect(reads.map((read) => read === defectsOf(exit)[0])).toEqual([true, true])
  })

  test("a listener that reads a model that throws, and throws it, is one defect, in render", async () => {
    const { app, run } = start(throwing)
    app.subscribe(() => void app.model())
    const fiber = Effect.runFork(run)
    app.dispatch("Increment")
    expect(wheres(await ended(fiber))).toEqual(["render: makeModel threw"])
  })

  // Before the run starts, as the second read above.
  test("a model's defect a renderer gives to die is one defect, in render", async () => {
    const { app, run } = start(throwing)
    app.dispatch("Increment")
    app.die(thrownBy(() => app.model()))
    expect(wheres(await Effect.runPromiseExit(run))).toEqual(["render: makeModel threw"])
  })

  test("a model's defect a renderer gives to die once the run has ended is thrown back as it is", async () => {
    const { app, run } = start(throwing)
    app.dispatch("Increment")
    await interrupted(Effect.runFork(run))
    const read = thrownBy(() => app.model())
    expect(thrownBy(() => app.die(read))).toBe(read)
  })
})

describe("die", () => {
  test("by a handle whose init threw, takes the defect model() threw as it is, and the run dies of it alone", async () => {
    const failing: Program<{ state: Count; model: Model; message: Message; command: Command; flags: number }> = {
      ...counter,
      init: () => {
        throw "init threw"
      }
    }
    const { app, run } = start(failing, { flags: 0 })
    app.die(thrownBy(() => app.model()))
    expect(wheres(await Effect.runPromiseExit(run))).toEqual(["init: init threw"])
  })

  test("once the run has ended, throws back what it is given, a defect in render that no cause holds", async () => {
    const { app, run } = start(counter)
    const exit = await interrupted(Effect.runFork(run))
    const thrown = thrownBy(() => app.die("drew too late"))
    expect({
      wheres: wheres(exit),
      thrown: thrown instanceof ProgramDefect ? `${thrown.where}: ${String(thrown.cause)}` : thrown
    }).toEqual({ wheres: [], thrown: "render: drew too late" })
  })

  test("before the run has ended, throws nothing, and the run dies of what it is given", async () => {
    const { app, run } = start(counter)
    const fiber = Effect.runFork(run)
    expect(thrownBy(() => app.die("drew"))).toBeUndefined()
    expect(wheres(await ended(fiber))).toEqual(["render: drew"])
  })
})

describe("defects the handle meets", () => {
  test("a listener that throws on a command's answer dies in render, and the command ends as it should", async () => {
    const { app, run } = start(counter)
    app.subscribe(() => {
      if (app.model().count === 1) throw "listener threw"
    })
    const fiber = Effect.runFork(run)
    app.dispatch("Ping")
    expect(wheres(await ended(fiber))).toEqual(["render: listener threw"])
  })

  test("a defect of update in a dispatch is never thrown to the caller, and the run dies of it in update", async () => {
    const { app, run } = start({
      ...counter,
      update: () => () => {
        throw "update threw"
      }
    })
    const fiber = Effect.runFork(run)
    const thrown = thrownBy(() => app.dispatch("Increment"))
    expect({ thrown, wheres: wheres(await ended(fiber)) }).toEqual({
      thrown: undefined,
      wheres: ["update: update threw"]
    })
  })

  test("what a renderer gives to die is a defect in render: the program applies nothing after, and its run dies of it", async () => {
    const { app, run } = start(counter)
    const fiber = Effect.runFork(run)
    app.die("draw threw")
    app.dispatch("Increment")
    expect(app.model().count).toBe(0)
    expect(wheres(await ended(fiber))).toEqual(["render: draw threw"])
  })

  test("a command that interrupts itself is a defect in the command", async () => {
    const { app, run } = start({ ...counter, runCommand: () => Effect.interrupt })
    const fiber = Effect.runFork(run)
    app.dispatch("Ping")
    expect(wheres(await ended(fiber))).toEqual([
      "command: Error: It was interrupted by the program, which only the run may do"
    ])
  })

  // `update` runs where its message was sent, so the fiber it could reach there (`Fiber.getCurrent`) is the command's
  // or the subscription's: the run cannot tell its interruption from one by the command or the subscription itself.
  describe("an update that interrupts the fiber it runs in is a defect of whoever sent its message", () => {
    const interrupting: Counter = {
      ...counter,
      update: (message) => (state) => {
        if (message === "Ping") return { state, commands: ["Ping"] }
        Fiber.getCurrent()?.interruptUnsafe()
        return { state: { count: state.count + 1 } }
      }
    }

    test("the command whose answer it hears", async () => {
      const { app, run } = start(interrupting)
      const fiber = Effect.runFork(run)
      app.dispatch("Ping")
      expect(wheres(await ended(fiber))).toEqual([
        "command: Error: It was interrupted by the program, which only the run may do"
      ])
    })

    test("the subscription whose message it hears", async () => {
      const exit = await Effect.runPromiseExit(
        start({
          ...interrupting,
          subscriptions: () => ["k"],
          listen: () => Channel.succeed<Message>("Increment").pipe(Channel.concatWith(() => Channel.never))
        }).run
      )
      expect(wheres(exit)).toEqual([
        "subscription: Error: It was interrupted by the program, which only the run may do"
      ])
    })
  })

  // A fiber that calls the dispatch is no fiber of the run: its interruption could be one by whoever runs the program,
  // which the run cannot tell apart.
  test("an update that interrupts a fiber that calls the dispatch is no defect, and the run goes on", async () => {
    const { app, run } = start({
      ...counter,
      update: (message: Message) => (state) => {
        Fiber.getCurrent()?.interruptUnsafe()
        return counter.update(message)(state)
      }
    })
    const fiber = Effect.runFork(run)
    const caller = await Effect.runPromiseExit(
      Effect.andThen(Effect.sync(() => app.dispatch("Increment")), Effect.never)
    )
    // Outside any fiber: nothing to interrupt.
    app.dispatch("Increment")
    const count = app.model().count
    const exit = await interrupted(fiber)
    expect({
      caller: Exit.isFailure(caller) && Cause.hasInterruptsOnly(caller.cause),
      count,
      run: Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)
    }).toEqual({ caller: true, count: 2, run: true })
  })

  // The end stops every fiber of the run with its mark: none of them takes it for an interruption by the program.
  test("a run interrupted by whoever runs it is no defect", async () => {
    const commanded = Deferred.makeUnsafe<void>()
    const subscribed = Deferred.makeUnsafe<void>()
    const { run } = start({
      ...counter,
      init: { state: { count: 0 }, commands: ["Ping"] },
      runCommand: () => Effect.andThen(Deferred.succeed(commanded, undefined), Effect.never),
      subscriptions: () => ["k"],
      listen: () => Channel.unwrap(Effect.as(Deferred.succeed(subscribed, undefined), Channel.never))
    })
    const exit = await endedAfter(
      Effect.runFork(run),
      Effect.andThen(Deferred.await(commanded), Deferred.await(subscribed))
    )
    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
  })

  // However the run ends, it interrupts its commands and awaits them: what one dies of while it releases what it holds
  // joins the cause.
  test("a command whose release dies as an interrupted run stops it is in the cause, in command", async () => {
    const holding = Deferred.makeUnsafe<void>()
    const exit = await endedAfter(Effect.runFork(start(releaseDies(holding)).run), Deferred.await(holding))
    expect(wheres(exit)).toEqual(["command: release threw"])
  })
})

describe("scopes and spans", () => {
  test("what a subscription acquires is released when its key goes away, apart from the next message", async () => {
    type Listening = Readonly<{ listening: boolean; n: number }>
    const log: Array<string> = []
    const released = Deferred.makeUnsafe<void>()
    const listening: Program<{ state: Listening; model: Listening; message: "On" | "Off" | "Up"; key: "held" }> = {
      init: { state: { listening: false, n: 0 } },
      update: (message) => (state) =>
        message === "Up"
          ? { state: { ...state, n: state.n + 1 } }
          : { state: { ...state, listening: message === "On" } },
      subscriptions: ({ listening }) => listening ? ["held" as const] : [],
      listen: () =>
        Channel.unwrap(
          Effect.acquireRelease(
            Effect.sync(() => log.push("acquire")),
            () => Effect.sync(() => log.push("release")).pipe(Effect.andThen(Deferred.succeed(released, undefined)))
          ).pipe(Effect.as(Channel.never))
        ),
      makeModel: (state) => state
    }
    const { app, run } = start(listening)
    const fiber = Effect.runFork(run)
    app.dispatch("On")
    app.dispatch("Off")
    app.dispatch("Up")
    log.push(`applied ${app.model().n}`)
    expect(wheres(await endedAfter(fiber, Deferred.await(released)))).toEqual([])
    // The next message is applied at once; the release follows in the fiber of effects, after the acquisition.
    expect(log).toEqual(["applied 1", "acquire", "release"])
  })

  test("what runs in a run logs nothing into the span of whoever runs it, which stays the parent of their spans", async () => {
    const commands = 500
    const parents: Array<string> = []
    const listening: Array<string> = []
    const logging: Program<{ state: Count; model: number; message: "Next"; command: "Go"; key: "logs" }> = {
      init: { state: { count: 0 }, commands: ["Go"] },
      update: () => (state) =>
        state.count < commands ? { state: { count: state.count + 1 }, commands: ["Go"] } : { state },
      // Each logs outside a span of its own, where the span is the one the run gives it, then opens one.
      runCommand: () =>
        Effect.logInfo("a command").pipe(
          Effect.andThen(
            Effect.orDie(Effect.currentSpan).pipe(
              Effect.map((span) => parents.push(span.parent._tag === "Some" ? span.parent.value.spanId : "")),
              Effect.withSpan("Go")
            )
          ),
          Effect.andThen(Effect.succeedSome<"Next">("Next"))
        ),
      subscriptions: () => ["logs" as const],
      listen: () =>
        Channel.fromEffectDrain(
          Effect.forever(
            Effect.logInfo("a subscription").pipe(
              Effect.andThen(
                Effect.orDie(Effect.currentSpan).pipe(
                  Effect.map((span) => listening.push(span.parent._tag === "Some" ? span.parent.value.spanId : "")),
                  Effect.withSpan("Listen")
                )
              ),
              Effect.andThen(Effect.sleep("1 millis"))
            )
          )
        ).pipe(
          Channel.concatWith(() => Channel.never)
        ),
      makeModel: ({ count }) => count
    }
    const caller = await Effect.runPromise(
      Effect.gen(function*() {
        const { app, run } = start(logging)
        yield* Effect.raceFirst(run, reaching(app, (model) => model >= commands))
        return yield* Effect.orDie(Effect.currentSpan)
      }).pipe(
        Effect.withSpan("caller"),
        Effect.provide(Logger.layer([Logger.tracerLogger]))
      )
    )
    expect((caller as Tracer.NativeSpan).events).toEqual([])
    // The last command may be cut short by the end of the run.
    expect(parents.length).toBeGreaterThanOrEqual(commands)
    expect(parents.every((parent) => parent === caller.spanId)).toBe(true)
    expect(listening.length).toBeGreaterThan(0)
    expect(listening.every((parent) => parent === caller.spanId)).toBe(true)
  })
})

describe("the run", () => {
  // Nothing can interrupt it there: the end is a defect's, and it still stops the subscription, which would hold the
  // end forever had it been forked uninterruptible.
  test("called inside an uninterruptible region, runs the program's effects, and a defect still ends it", async () => {
    const { app, run } = start({ ...counter, subscriptions: () => ["k"], listen: () => Channel.never })
    const fiber = Effect.runFork(Effect.uninterruptible(run))
    const counts = [app.model().count]
    app.dispatch("Increment")
    // Its answer, `Increment`, comes from the command's fiber.
    app.dispatch("Ping")
    await Effect.runPromise(
      Effect.raceFirst(Effect.asVoid(Fiber.await(fiber)), reaching(app, ({ count }) => count === 2))
    )
    counts.push(app.model().count)
    app.die("ended")
    expect(wheres(await ended(fiber))).toEqual(["render: ended"])
    expect(counts).toEqual([0, 2])
  })

  test("a message that update rejects is ignored, and the program goes on", async () => {
    const { app, run } = start(counter)
    const fiber = Effect.runFork(run)
    const counts = [app.model().count]
    // A buggy view: it sends a message that `update` does not accept, then increments.
    app.dispatch("Forbidden")
    app.dispatch("Increment")
    counts.push(app.model().count)
    const exit = await interrupted(fiber)
    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
    expect(counts).toEqual([0, 1])
  })

  test("never succeeds: once every effect of the program has run and ended, it runs until it is interrupted", async () => {
    // The command of `init` answers, and the subscription ends with its message: nothing of the program is left.
    const { app, run } = start({
      ...counter,
      init: { state: { count: 0 }, commands: ["Ping"] },
      subscriptions: () => ["once"],
      listen: () => Channel.end<Message>("Increment")
    })
    const fiber = Effect.runFork(run)
    await Effect.runPromise(
      Effect.raceFirst(Effect.asVoid(Fiber.await(fiber)), reaching(app, ({ count }) => count === 2))
    )
    // A window of absence, once both have answered: the fibers that sent them end after, and nothing of a correct
    // run could tell that the run has not ended.
    await Effect.runPromise(Effect.sleep("20 millis"))
    const running = fiber.pollUnsafe() === undefined
    const exit = await interrupted(fiber)
    expect({ running, interrupted: Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause) }).toEqual({
      running: true,
      interrupted: true
    })
  })

  // Its command answers, its key comes with the answer and goes with the next message, and whoever runs it interrupts
  // it: what the program logs is its own, and it logs nothing.
  test("writes no log of its own, as it goes on and as whoever runs it interrupts it", async () => {
    const logged: Array<unknown> = []
    const everything = Logger.make(({ message }) => {
      logged.push(message)
    })
    const listening = Deferred.makeUnsafe<void>()
    const released = Deferred.makeUnsafe<void>()
    const { app, run } = start({
      ...counter,
      init: { state: { count: 0 }, commands: ["Ping"] },
      subscriptions: ({ count }) => count === 1 ? ["k"] : [],
      listen: () =>
        Channel.unwrap(
          Effect.acquireRelease(Deferred.succeed(listening, undefined), () => Deferred.succeed(released, undefined))
            .pipe(Effect.as(Channel.never))
        )
    })
    const fiber = Effect.runFork(run.pipe(
      Effect.provideService(References.MinimumLogLevel, "Debug"),
      Effect.provide(Logger.layer([everything]))
    ))
    const exit = await endedAfter(
      fiber,
      Deferred.await(listening).pipe(
        Effect.andThen(Effect.sync(() => app.dispatch("Increment"))),
        Effect.andThen(Deferred.await(released))
      )
    )
    expect({ interrupted: Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause), logged }).toEqual({
      interrupted: true,
      logged: []
    })
  })

  test("a program with flags starts from the flags it is given, its commands included", async () => {
    const seeded: Program<{ state: Count; model: Model; message: Message; command: Command; flags: number }> = {
      ...counter,
      init: (count) => ({ state: { count }, commands: ["Ping"] })
    }
    const { app, run } = start(seeded, { flags: 5 })
    // The command of `init` waits for the run.
    const counts = [app.model().count]
    const exit = await endedAfter(Effect.runFork(run), reaching(app, ({ count }) => count === 6))
    counts.push(app.model().count)
    expect(wheres(exit)).toEqual([])
    expect(counts).toEqual([5, 6])
    // @ts-expect-error: it has nothing to start from.
    expect(() => start(seeded)).toBeDefined()
    // @ts-expect-error: nor from options without flags.
    expect(() => start(seeded, {})).toBeDefined()
    // @ts-expect-error: it starts without flags.
    expect(() => start(counter, { flags: 5 })).toBeDefined()
  })

  test("a program written as a plain object needs a runCommand only for commands it has", async () => {
    const plain = {
      init: { state: { count: 0 } },
      update: () => ({ count }: Count) => ({ state: { count: count + 1 } }),
      subscriptions: () => [],
      makeModel: ({ count }: Count) => count
    }
    const { app, run } = start(plain)
    expect(app.model()).toBe(0)
    expect(wheres(await interrupted(Effect.runFork(run)))).toEqual([])
    const pinging = { ...plain, update: () => (state: Count) => ({ state, commands: ["Ping" as const] }) }
    // @ts-expect-error: its `Ping` would go uninterpreted.
    expect(() => start(pinging)).toBeDefined()
  })

  test("a program written as a plain object takes every message its update takes, whatever its commands answer", () => {
    type Step = "Increment" | "Decrement"
    const plain = {
      init: { state: { count: 0 }, commands: ["Ping" as const] },
      update: (message: Step) => ({ count }: Count) => ({
        state: { count: count + (message === "Increment" ? 1 : -1) }
      }),
      runCommand: () => Effect.succeedSome("Increment" as const),
      subscriptions: () => ["ticks" as const],
      listen: () => Channel.succeed("Increment" as const).pipe(Channel.concatWith(() => Channel.never)),
      makeModel: ({ count }: Count) => count
    }
    const { app } = start(plain)
    expectTypeOf<Parameters<typeof app.dispatch>[0]>().toEqualTypeOf<Step>()
    // @ts-expect-error: an answer is a message its update takes.
    expect(() => start({ ...plain, runCommand: () => Effect.succeedSome("Reset" as const) })).toBeDefined()
  })

  test("only a program without events starts: no parent would handle them", () => {
    const telling: Program<{ state: Count; model: Model; message: Message; command: Command; event: "Told" }> = counter
    // @ts-expect-error: its events would go unhandled.
    expect(() => start(telling)).toBeDefined()
  })

  test("a program a parent could hold starts too: its external and its output are checked, and never called", async () => {
    const calls = { external: 0, output: 0 }
    const held = program<{ state: Count; model: number; message: Message; external: "Reset"; output: number }>().make({
      init: { state: { count: 0 } },
      update: () => ({ count }) => ({ state: { count: count + 1 } }),
      external: () => () => (calls.external++, { state: { count: 0 } }),
      makeModel: ({ count }) => count,
      output: ({ count }) => (calls.output++, count)
    })
    const { app, run } = start(held)
    app.dispatch("Increment")
    expect(app.model()).toBe(1)
    expect(wheres(await interrupted(Effect.runFork(run)))).toEqual([])
    expect(calls).toEqual({ external: 0, output: 0 })
    expect(() =>
      // @ts-expect-error: an external message applies in every state.
      start({ ...held, external: (_: "Reset") => (state: Count) => state.count > 0 ? { state } : reject })
    ).toBeDefined()
    // @ts-expect-error: its output reads its own state.
    expect(() => start({ ...held, output: (other: Readonly<{ other: string }>) => other.other.length })).toBeDefined()
  })

  test("a run needs the services of the effects the program has, not those its type names for effects it lacks", () => {
    type Db = Readonly<{ db: true }>
    type Feed = Readonly<{ feed: true }>
    const named: Program<
      { state: Count; model: Model; message: Message; commandServices: Db; subscriptionServices: Feed }
    > = {
      init: { state: { count: 0 } },
      update: () => (state) => ({ state }),
      subscriptions: () => [],
      makeModel: (state) => state
    }
    expectTypeOf(start(named).run).toEqualTypeOf<Effect.Effect<never, never, never>>()
  })

  test("a command's execution cannot fail: its type has no error", () => {
    expectTypeOf<Effect.Error<Execution<Message>>>().toBeNever()
    expectTypeOf<Effect.Error<ReturnType<RunCommand<Command, Message>>>>().toBeNever()
    // An expected failure is a message, not an error.
    expectTypeOf(Effect.succeedSome<Message>("Increment")).toExtend<Execution<Message>>()
    expectTypeOf(Effect.fail("offline")).not.toExtend<Execution<Message>>()
  })

  test("runCommand takes the command alone: it does not see the state", () => {
    const seeing: Counter = {
      ...counter,
      // @ts-expect-error: a command carries everything it needs.
      runCommand: (_: Command, state: Count) => Effect.succeedSome<Message>(state.count > 0 ? "Increment" : "Same")
    }
    expect(seeing).toBeDefined()
  })

  test("a program has a runCommand exactly when it has commands, and a listen exactly when it has keys", () => {
    // @ts-expect-error: its `Ping` would go uninterpreted.
    const uninterpreted: Counter = {
      init: counter.init,
      update: counter.update,
      subscriptions: () => [],
      makeModel: counter.makeModel
    }
    // @ts-expect-error: its keys would go without their subscription.
    const deaf: Keyed = { ...counter, subscriptions: () => ["k"] }
    const plain = {
      init: { state: { count: 0 } },
      update: () => ({ count }: Count) => ({ state: { count: count + 1 } }),
      subscriptions: () => ["ticks" as const],
      makeModel: ({ count }: Count) => count
    }
    // @ts-expect-error: written as a plain object, its keys would go without their subscription too.
    expect(() => start(plain)).toBeDefined()
    expect([uninterpreted, deaf]).toHaveLength(2)
  })

  test("what a command acquires is its own: no scope to provide, released after it stops", async () => {
    const log: Array<string> = []
    const note = (line: string) => Effect.sync(() => void log.push(line))
    const holding = Deferred.makeUnsafe<void>()
    const program: Program<
      { state: object; model: null; message: never; command: "Hold"; commandServices: Scope.Scope }
    > = {
      init: { state: {}, commands: ["Hold"] },
      update: () => (state) => ({ state }),
      runCommand: () =>
        Effect.acquireRelease(note("acquire"), () => note("release")).pipe(
          Effect.andThen(Deferred.succeed(holding, undefined)),
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => note("interrupted"))
        ),
      subscriptions: () => [],
      makeModel: () => null
    }
    const running: Effect.Effect<never> = start(program).run
    await endedAfter(Effect.runFork(running), Deferred.await(holding))
    expect(log).toEqual(["acquire", "interrupted", "release"])
  })

  test("what a command acquires is released before its defect ends the run, and what a service around run acquires after", async () => {
    class Storage extends Context.Service<Storage, { readonly save: Effect.Effect<void> }>()("Storage") {}
    const log: Array<string> = []
    const note = (line: string) => Effect.sync(() => void log.push(line))
    const storage = Layer.effect(
      Storage,
      Effect.acquireRelease(Effect.succeed({ save: note("saved") }), () => note("service released"))
    )
    const program: Program<
      { state: object; model: null; message: never; command: "Save"; commandServices: Storage | Scope.Scope }
    > = {
      init: { state: {}, commands: ["Save"] },
      update: () => (state) => ({ state }),
      runCommand: Effect.fnUntraced(function*() {
        yield* Effect.acquireRelease(Effect.void, () => note("command released"))
        yield* (yield* Storage).save
        return yield* Effect.die("boom")
      }),
      subscriptions: () => [],
      makeModel: () => null
    }
    const exit = await Effect.runPromiseExit(
      start(program).run.pipe(Effect.onExit(() => note("run ended")), Effect.provide(storage))
    )
    expect(wheres(exit)).toEqual(["command: boom"])
    expect(log).toEqual(["saved", "command released", "run ended", "service released"])
  })

  test("the commands of a step run concurrently, and their answers reach update in the order they end", async () => {
    // `Slow` answers only once the answer of `Fast`, started after it, has been applied.
    const slow = Deferred.makeUnsafe<void>()
    type Heard = Readonly<{ heard: ReadonlyArray<"Slow" | "Fast"> }>
    const program: Program<{ state: Heard; model: Heard; message: "Slow" | "Fast"; command: "Slow" | "Fast" }> = {
      init: { state: { heard: [] }, commands: ["Slow", "Fast"] },
      update: (message) => ({ heard }) => ({ state: { heard: [...heard, message] } }),
      runCommand: (command) =>
        command === "Slow" ? Effect.as(Deferred.await(slow), Opt.some(command)) : Effect.succeedSome(command),
      subscriptions: () => [],
      makeModel: (heard) => heard
    }
    const { app, run } = start(program)
    await Effect.runPromise(Effect.raceFirst(
      run,
      reaching(app, ({ heard }) => heard.length === 1).pipe(
        Effect.andThen(Deferred.succeed(slow, undefined)),
        Effect.andThen(reaching(app, ({ heard }) => heard.length === 2))
      )
    ))
    expect(app.model().heard).toEqual(["Fast", "Slow"])
  })

  // Each command waits for all of them to have started: a bound on how many run at once would hold the last ones back
  // for ever.
  test("starts every command of a step, however many: a thousand run at once", async () => {
    const many = 1000
    const all = Deferred.makeUnsafe<void>()
    const open = Deferred.makeUnsafe<void>()
    let started = 0
    type Answered = Readonly<{ answered: number }>
    const program: Program<{ state: Answered; model: Answered; message: "Answered"; command: number }> = {
      init: { state: { answered: 0 }, commands: Arr.range(1, many) },
      update: () => ({ answered }) => ({ state: { answered: answered + 1 } }),
      runCommand: () =>
        Effect.suspend(() => {
          started += 1
          if (started === many) Deferred.doneUnsafe(all, Exit.void)
          return Effect.as(Deferred.await(open), Opt.some<"Answered">("Answered"))
        }),
      subscriptions: () => [],
      makeModel: (state) => state
    }
    const { app, run } = start(program)
    await Effect.runPromise(Effect.raceFirst(
      run,
      Deferred.await(all).pipe(
        Effect.andThen(Deferred.succeed(open, undefined)),
        Effect.andThen(reaching(app, ({ answered }) => answered === many))
      )
    ))
    expect({ started, answered: app.model().answered }).toEqual({ started: many, answered: many })
  })

  test("update, subscriptions and the options run where the message was sent: a command's fiber, a subscription's, a fiber that dispatches, or none", async () => {
    type Sender = "Plain" | "Forked" | "Command" | "Subscription"
    type Sent = Readonly<{ by: Sender; applies: boolean }>
    type Sending = "Listen" | "Ping" | Sent
    type Where = Readonly<{ count: number; listening: boolean }>
    const named = new Map<Fiber.Fiber<unknown, unknown>, string>()
    const own = (name: string) => Effect.map(Effect.fiber, (self) => void named.set(self, name))
    const calls: Array<readonly [string, Fiber.Fiber<unknown, unknown> | undefined]> = []
    const here = (call: string) => void calls.push([call, Fiber.getCurrent()])
    const label = (message: Sending) =>
      typeof message === "string" ? message : `${message.by} ${message.applies ? "applied" : "rejected"}`
    // `subscriptions` runs in the step of the message `update` was last given.
    let last = "init"
    const done = Deferred.makeUnsafe<void>()
    let heard = 0
    const hear = (call: string): undefined => {
      here(call)
      heard += 1
      if (heard === 10) Deferred.doneUnsafe(done, Exit.void)
    }
    const sent = (by: Sender, applies: boolean): Sending => ({ by, applies })
    const where: Program<{ state: Where; model: Where; message: Sending; command: boolean; key: "k" }> = {
      init: { state: { count: 0, listening: false } },
      update: (message) => (state) => {
        last = label(message)
        here(`update ${last}`)
        return message === "Listen"
          ? { state: { ...state, listening: true } }
          : message === "Ping"
          ? { state, commands: [true, false] }
          : message.applies
          ? { state: { ...state, count: state.count + 1 } }
          : reject
      },
      runCommand: (applies) =>
        Effect.as(own(`Command ${applies ? "applied" : "rejected"}`), Opt.some(sent("Command", applies))),
      subscriptions: ({ listening }) => {
        here(`subscriptions after ${last}`)
        return listening ? ["k" as const] : []
      },
      listen: () =>
        Channel.unwrap(Effect.as(
          own("Subscription"),
          Channel.succeed(sent("Subscription", true)).pipe(
            Channel.concatWith(() => Channel.succeed(sent("Subscription", false))),
            Channel.concatWith(() => Channel.never)
          )
        )),
      makeModel: (state) => state
    }
    const { app, run } = start(where, {
      onApplied: ({ message }) => hear(`onApplied ${label(message)}`),
      onIgnored: ({ message }) => hear(`onIgnored ${label(message)}`)
    })
    const fiber = Effect.runFork(run)
    app.dispatch("Listen")
    app.dispatch(sent("Plain", true))
    app.dispatch(sent("Plain", false))
    await Effect.runPromise(Effect.andThen(
      own("Forked"),
      Effect.sync(() => {
        app.dispatch(sent("Forked", true))
        app.dispatch(sent("Forked", false))
      })
    ))
    app.dispatch("Ping")
    expect(wheres(await endedAfter(fiber, Deferred.await(done)))).toEqual([])
    const nameOf = (fiber: Fiber.Fiber<unknown, unknown> | undefined) =>
      fiber === undefined ? "none" : named.get(fiber) ?? "another fiber"
    // Each command answers in a fiber of its own; plain code sends in none.
    const senderOf = (by: Sender, applies: boolean) =>
      by === "Plain" ? "none" : by === "Command" ? `Command ${applies ? "applied" : "rejected"}` : by
    expect(calls.map(([call, fiber]) => `${call} in ${nameOf(fiber)}`).sort()).toEqual(
      [
        "subscriptions after init in none",
        "update Listen in none",
        "onApplied Listen in none",
        "subscriptions after Listen in none",
        "update Ping in none",
        "onApplied Ping in none",
        ...(["Plain", "Forked", "Command", "Subscription"] as const).flatMap((by) => [
          `update ${by} applied in ${senderOf(by, true)}`,
          `onApplied ${by} applied in ${senderOf(by, true)}`,
          `subscriptions after ${by} applied in ${senderOf(by, true)}`,
          `update ${by} rejected in ${senderOf(by, false)}`,
          `onIgnored ${by} rejected in ${senderOf(by, false)}`
        ])
      ].sort()
    )
  })
})

describe("defects", () => {
  class Boom extends Error {}
  const boom = (): never => {
    throw new Boom()
  }

  /**
   * Starts `program`, draws the model with `view` as a renderer does, in a listener and once outside any, where what
   * it throws goes to `die`, runs it with debug logs enabled and sends `Increment`, and tells where the run says its
   * defect happened, if it died with the one thrown, and what it logged.
   */
  const failsWithBoom = async <Key = never>(
    program: Program<{ state: Count; model: Model; message: Message; command: Command; key: Key }>,
    { view = () => undefined, ...options }: Partial<RunOptions<Count, Message, Command>> & {
      view?: (model: Model) => void
    } = {}
  ) => {
    const logged: Array<unknown> = []
    const everything = Logger.make(({ message }) => {
      logged.push(message)
    })
    const { app, run } = start(program, options)
    app.subscribe(() => view(app.model()))
    const drawn = thrownBy(() => view(app.model()))
    if (drawn !== undefined) app.die(drawn)
    const fiber = Effect.runFork(run.pipe(
      Effect.provideService(References.MinimumLogLevel, "Debug"),
      Effect.provide(Logger.layer([everything]))
    ))
    app.dispatch("Increment")
    const exit = await ended(fiber)
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return defect instanceof ProgramDefect && defect.cause instanceof Boom
      ? { where: defect.where, message: defect.message, logged }
      : { defect, logged }
  }

  // What the `message` of a `ProgramDefect` says of each site, for a defect of `update` on `Increment`.
  const said: Readonly<Record<Exclude<DefectSite, "init">, string>> = {
    update: "A defect in update on Increment",
    subscriptions: "A defect in subscriptions",
    subscription: "A defect in a subscription",
    command: "A defect in a command",
    onApplied: "A defect in onApplied",
    onIgnored: "A defect in onIgnored",
    render: "A defect in makeModel or the renderer"
  }

  const pinging = { state: { count: 0 }, commands: ["Ping"] } as const satisfies Step<Count, Command>

  // Whoever runs the program reports its defects: wherever one happens, the run dies with it and with where it
  // happened, which its message says too, and logs nothing about it.
  test.each<[string, Exclude<DefectSite, "init">, () => ReturnType<typeof failsWithBoom>]>([
    [
      "update",
      "update",
      () => failsWithBoom({ ...counter, update: () => ({ count }) => count === 0 ? boom() : { state: { count: 1 } } })
    ],
    ["update, given a message", "update", () => failsWithBoom({ ...counter, update: () => boom })],
    ["makeModel", "render", () => failsWithBoom({ ...counter, makeModel: boom })],
    ["the view", "render", () => failsWithBoom(counter, { view: ({ count }) => count === 1 ? boom() : undefined })],
    [
      "subscriptions",
      "subscriptions",
      () => failsWithBoom({ ...counter, subscriptions: ({ count }) => count === 1 ? boom() : [] })
    ],
    [
      "a subscription",
      "subscription",
      () => failsWithBoom({ ...counter, subscriptions: () => ["k"], listen: () => Channel.die(new Boom()) })
    ],
    [
      "a command",
      "command",
      () => failsWithBoom({ ...counter, init: pinging, runCommand: () => Effect.sync(boom) })
    ],
    ["runCommand", "command", () => failsWithBoom({ ...counter, init: pinging, runCommand: boom })],
    [
      "what a subscription the run stopped releases",
      "subscription",
      () =>
        failsWithBoom({
          ...counter,
          subscriptions: ({ count }) => count === 0 ? ["k"] : [],
          listen: () => Channel.fromEffectDone(Effect.ensuring(Effect.never, Effect.sync(boom)))
        })
    ],
    ["onApplied", "onApplied", () => failsWithBoom(counter, { onApplied: boom })],
    ["onIgnored", "onIgnored", () => failsWithBoom({ ...counter, update: () => () => reject }, { onIgnored: boom })]
  ])("a defect in %s ends the run, which dies with it and with where it happened", async (_, where, outcome) => {
    expect(await outcome()).toEqual({ where, message: said[where], logged: [] })
  })

  // The pieces of a parent, each of which dies once its parent's step has counted to 1, and the children they read.
  const Parent = program<{ state: Count; message: "Increment" }>()
  const Keyed = program<{ state: Count; message: "Increment"; key: number }>()
  const Flagged = program<{ state: Count; flags: number }>()
  const counted = {
    init: { state: { count: 0 } },
    update: () => ({ count }: Count) => ({ state: { count: count + 1 } })
  }
  const plain = program<{ state: Count }>().make({ init: { state: { count: 0 } }, makeModel: () => null })
  const hearing = program<{ state: Count; external: "Told" }>().make({
    init: { state: { count: 0 } },
    external: () => ({ count }) => ({ state: { count: count + 1 } }),
    makeModel: () => null
  })
  const seeded = program<{ state: Count; flags: number }>().make({
    init: (count) => count === 1 ? boom() : { state: { count } },
    makeModel: () => null
  })
  const outputting = program<{ state: Count; output: number }>().make({
    init: { state: { count: 0 } },
    output: () => boom(),
    makeModel: () => null
  })
  const listing = program<{ state: Count; key: "k" }>().make({
    init: { state: { count: 0 } },
    subscriptions: () => boom(),
    listen: () => Channel.never,
    makeModel: () => null
  })
  const drawing = program<{ state: Count }>().make({ init: { state: { count: 0 } }, makeModel: () => boom() })
  const subscribing = program<{ state: Count; key: "k" }>().make({
    init: { state: { count: 0 } },
    subscriptions: () => ["k"],
    listen: () => boom(),
    makeModel: () => null
  })
  const commanding = program<{ state: Count; command: "Go" }>().make({
    init: { state: { count: 0 }, commands: ["Go"] },
    runCommand: () => boom(),
    makeModel: () => null
  })
  const once = ({ count }: Count) => count === 1
  /** Runs a parent, sends `Increment`, reads the model, and tells where the run died of the defect thrown. */
  const steppedOnce = async ({ app, run }: Started<unknown, "Increment">) => {
    const fiber = Effect.runFork(run)
    app.dispatch("Increment")
    thrownBy(app.model)
    const exit = await ended(fiber)
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return defect instanceof ProgramDefect && defect.cause instanceof Boom ? defect.where : defect
  }
  /** Starts a parent with the flags 1, and tells where its run died of the defect thrown. */
  const startedAtOne = async ({ run }: Started<unknown, never>) => {
    const exit = await Effect.runPromiseExit(run)
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return defect instanceof ProgramDefect && defect.cause instanceof Boom ? defect.where : defect
  }
  test.each<[string, DefectSite, () => Promise<unknown>]>([
    [
      "there",
      "update",
      () =>
        steppedOnce(
          start(
            Parent.withChildren({ Child: Parent.child(plain, { there: (state) => once(state) && boom() }) })
              .make({ ...counted, makeModel: () => null })
          )
        )
    ],
    [
      "key",
      "update",
      () =>
        steppedOnce(
          start(
            Parent.withChildren({ Child: Parent.child(plain, { key: (state) => once(state) ? boom() : 0 }) })
              .make({ ...counted, makeModel: () => null })
          )
        )
    ],
    [
      "ids",
      "update",
      () =>
        steppedOnce(
          start(
            Parent.withChildren({ Rows: Parent.childById(plain, { ids: (state) => once(state) ? boom() : [] }) })
              .make({ ...counted, makeModel: () => null })
          )
        )
    ],
    [
      "the tell of a declaration",
      "update",
      () =>
        steppedOnce(
          start(
            Parent.withChildren({ Child: Parent.child(hearing, { tell: (state) => once(state) ? boom() : "Told" }) })
              .make({ ...counted, makeModel: () => null })
          )
        )
    ],
    [
      "the init of a child that a step starts",
      "update",
      () =>
        steppedOnce(
          start(
            Parent.withChildren({ Child: Parent.child(seeded, { flags: (state) => state.count }) })
              .make({ ...counted, makeModel: () => null })
          )
        )
    ],
    [
      "an output read in update",
      "update",
      () =>
        steppedOnce(start(
          Parent.withChildren({ Child: Parent.child(outputting) }).make({
            init: { state: { count: 0 } },
            update: (_, children) => ({ count }) => ({ state: { count: count + children.Child.output() } }),
            makeModel: () => null
          })
        ))
    ],
    [
      "listening",
      "subscriptions",
      () =>
        steppedOnce(
          start(
            Parent.withChildren({ Child: Parent.child(plain, { listening: (state) => !once(state) || boom() }) })
              .make({ ...counted, makeModel: () => null })
          )
        )
    ],
    [
      "the subscriptions of a child",
      "subscriptions",
      () =>
        steppedOnce(
          start(
            Parent.withChildren({ Child: Parent.child(listing, { there: once }) })
              .make({ ...counted, makeModel: () => null })
          )
        )
    ],
    [
      "an output read in subscriptions",
      "subscriptions",
      () =>
        steppedOnce(start(
          Keyed.withChildren({ Child: Keyed.child(outputting) }).make({
            ...counted,
            subscriptions: (state, children) => once(state) ? [children.Child.output()] : [],
            listen: () => Channel.never,
            makeModel: () => null
          })
        ))
    ],
    [
      "the makeModel of a child",
      "render",
      () =>
        steppedOnce(
          start(
            Parent.withChildren({ Child: Parent.child(drawing, { there: once }) })
              .make({ ...counted, makeModel: (_, children) => Opt.isSome(children.Child()) })
          )
        )
    ],
    [
      "an output read in makeModel",
      "render",
      () =>
        steppedOnce(
          start(
            Parent.withChildren({ Child: Parent.child(outputting) })
              .make({ ...counted, makeModel: (state, children) => once(state) ? children.Child.output() : 0 })
          )
        )
    ],
    [
      "the listen of a child",
      "subscription",
      () =>
        steppedOnce(
          start(
            Parent.withChildren({ Child: Parent.child(subscribing, { there: once }) })
              .make({ ...counted, makeModel: () => null })
          )
        )
    ],
    [
      "the runCommand of a child",
      "command",
      () =>
        steppedOnce(
          start(
            Parent.withChildren({ Child: Parent.child(commanding, { there: once }) })
              .make({ ...counted, makeModel: () => null })
          )
        )
    ],
    [
      "the init of a child as a parent with flags starts",
      "init",
      () =>
        startedAtOne(
          start(
            Flagged.withChildren({ Child: Flagged.child(seeded, { flags: (state) => state.count }) })
              .make({ init: (count) => ({ state: { count } }), makeModel: () => null }),
            { flags: 1 }
          )
        )
    ],
    [
      "the tell of a declaration as a parent with flags starts",
      "init",
      () =>
        startedAtOne(
          start(
            Flagged.withChildren({ Child: Flagged.child(hearing, { tell: (state) => once(state) ? boom() : "Told" }) })
              .make({ init: (count) => ({ state: { count } }), makeModel: () => null }),
            { flags: 1 }
          )
        )
    ]
  ])("a defect in %s of a parent dies in %s", async (_, where, outcome) => {
    expect(await outcome()).toBe(where)
  })

  // The fibers of a run ignore their interruptions: one that came from the program itself would otherwise leave
  // a command without its answer, or a subscription ended without its last message, and the run going on.
  const joinsAnInterruptedFiber = Effect.gen(function*() {
    const interrupted = yield* Effect.forkChild(Effect.never)
    yield* Fiber.interrupt(interrupted)
    return yield* Fiber.join(interrupted)
  })

  /** Starts `program`, sends it `Increment` once its run has started, and returns how the run ended. */
  const sentIncrement = <Key = never>(
    program: Program<{ state: Count; model: Model; message: Message; command: Command; key: Key }>
  ) => {
    const { app, run } = start(program)
    const fiber = Effect.runFork(run)
    app.dispatch("Increment")
    return ended(fiber)
  }

  // A command that interrupts itself is under "defects the handle meets".
  test.each<[string, DefectSite, () => Effect.Effect<void>]>([
    [
      "a command that joins an interrupted fiber",
      "command",
      () => start({ ...counter, init: pinging, runCommand: () => joinsAnInterruptedFiber }).run
    ],
    [
      "a subscription that joins an interrupted fiber",
      "subscription",
      () =>
        start({
          ...counter,
          subscriptions: () => ["k"],
          listen: () => Channel.fromEffectDone(joinsAnInterruptedFiber)
        }).run
    ],
    [
      "a subscription",
      "subscription",
      () =>
        start({ ...counter, subscriptions: () => ["k"], listen: () => Channel.fromEffectDone(Effect.interrupt) }).run
    ]
  ])("%s that interrupts itself is a defect, where it happened", async (_, where, running) => {
    const outcome = await Effect.runPromiseExit(running())
    const defect = Exit.isFailure(outcome) ? Cause.squash(outcome.cause) : undefined
    expect(defect instanceof ProgramDefect && [defect.where, defect.cause instanceof Error]).toEqual([where, true])
  })

  test("a command that fails without a defect, which its type rules out, is a defect in the command", async () => {
    const outcome = await Effect.runPromiseExit(
      start({ ...counter, init: pinging, runCommand: () => Effect.failCause(Cause.empty) }).run
    )
    const defect = Exit.isFailure(outcome) ? Cause.squash(outcome.cause) : undefined
    expect(defect instanceof ProgramDefect && [defect.where, defect.cause instanceof Error]).toEqual(["command", true])
  })

  test("a defect in update says which message it was given, by its tags, in its message too", async () => {
    const exit = await sentIncrement({ ...counter, update: (message) => message === "Increment" ? boom : () => reject })
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(defect instanceof ProgramDefect && [defect.on, defect.message]).toEqual([
      "Increment",
      "A defect in update on Increment"
    ])
  })

  test("defect in update dies in update, on its message, with the InvariantDefect as its cause", async () => {
    const exit = await sentIncrement({ ...counter, update: () => () => defect("An increment cannot arrive") })
    const thrown = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(
      thrown instanceof ProgramDefect && thrown.cause instanceof InvariantDefect
        && [thrown.where, thrown.on, thrown.cause.reason]
    ).toEqual(["update", "Increment", "An increment cannot arrive"])
  })

  test("a defect in onEvent dies in update, on the child's message whose step raised the event", async () => {
    type Saver = Readonly<{ saved: boolean }>
    const saver: Program<{ state: Saver; model: null; message: "Save"; event: "Saved" }> = {
      init: { state: { saved: false } },
      update: () => () => ({ state: { saved: true }, events: ["Saved"] }),
      subscriptions: () => [],
      makeModel: () => null
    }
    const Page = program<{ state: object }>()
    const page = Page.withChildren({ Saver: Page.child(saver) }).make({
      init: { state: {} },
      onEvent: { Saver: () => () => boom() },
      makeModel: () => null
    })
    const { app, run } = start(page)
    const fiber = Effect.runFork(run)
    app.dispatch({ _tag: "Saver", message: "Save" })
    const exit = await ended(fiber)
    const thrown = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(thrown instanceof ProgramDefect && [thrown.where, thrown.on, thrown.cause instanceof Boom]).toEqual([
      "update",
      "Saver",
      true
    ])
  })

  // What a parent declares and its children's functions are called where the library needs them: in the step of the
  // parent's `update`, in `subscriptions`, or where the model is read. What they throw is a defect there.
  describe("a defect in a function that a parent gives is recorded where the library calls it", () => {
    type Desk = Readonly<{ step: number }>
    type Leaf = Readonly<{ on: boolean }>
    const initial = { state: { step: 0 } }
    const Desk = program<{ state: Desk; message: "Next" }>()
    const next = () => (state: Desk) => ({ state: { ...state, step: state.step + 1 } })
    const quiet = program<{ state: Leaf }>().make({ init: { state: { on: false } }, makeModel: () => null })
    const flagged = (init: (flags: Leaf) => Step<Leaf>) =>
      program<{ state: Leaf; flags: Leaf }>().make({ init, makeModel: () => null })
    const reading = program<{ state: Leaf; output: boolean }>().make({
      init: { state: { on: false } },
      output: () => boom(),
      makeModel: () => null
    })

    /** Starts the program, reads its model at each new state as a renderer does, sends `message`, and tells where
     * the run died of a `Boom`. */
    const diedIn = async <Model, Message>({ app, run }: Started<Model, Message>, message: Message) => {
      app.subscribe(() => {
        app.model()
      })
      const fiber = Effect.runFork(run)
      app.dispatch(message)
      const exit = await ended(fiber)
      const thrown = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
      return thrown instanceof ProgramDefect && thrown.cause instanceof Boom ? thrown.where : thrown
    }

    test.each<[string, DefectSite, () => Promise<unknown>]>([
      [
        "there",
        "update",
        () =>
          diedIn(
            start(
              Desk.withChildren({ Leaf: Desk.child(quiet, { there: (state) => state.step === 1 ? boom() : true }) })
                .make({ init: initial, update: next, makeModel: () => null })
            ),
            "Next"
          )
      ],
      [
        "key",
        "update",
        () =>
          diedIn(
            start(
              Desk.withChildren({ Leaf: Desk.child(quiet, { key: (state) => state.step === 1 ? boom() : 0 }) })
                .make({ init: initial, update: next, makeModel: () => null })
            ),
            "Next"
          )
      ],
      [
        "flags",
        "update",
        () =>
          diedIn(
            start(
              Desk.withChildren({
                Leaf: Desk.child(flagged((flags) => ({ state: flags })), {
                  there: (state) => state.step === 1 ? boom() : Opt.some({ on: false })
                })
              }).make({ init: initial, update: next, makeModel: () => null })
            ),
            "Next"
          )
      ],
      [
        "ids",
        "update",
        () =>
          diedIn(
            start(
              Desk.withChildren({ Leaf: Desk.childById(quiet, { ids: (state) => state.step === 1 ? boom() : [1] }) })
                .make({ init: initial, update: next, makeModel: () => null })
            ),
            "Next"
          )
      ],
      [
        "a child's init, as a step of its parent starts it",
        "update",
        () =>
          diedIn(
            start(
              Desk.withChildren({
                Leaf: Desk.child(flagged((flags) => flags.on ? boom() : { state: flags }), {
                  there: (state) => Opt.some({ on: state.step === 1 })
                })
              }).make({ init: initial, update: next, makeModel: () => null })
            ),
            "Next"
          )
      ],
      [
        "a child's external",
        "update",
        () =>
          diedIn(
            start(
              Desk.withChildren({
                Leaf: Desk.child(
                  program<{ state: Leaf; external: "Told" }>().make({
                    init: { state: { on: false } },
                    external: () => () => boom(),
                    makeModel: () => null
                  })
                )
              }).make({
                init: initial,
                update: () => (state) => ({ state, tell: [{ _tag: "Leaf", message: "Told" }] }),
                makeModel: () => null
              })
            ),
            "Next"
          )
      ],
      [
        "a child's output, read in its parent's update",
        "update",
        () =>
          diedIn(
            start(
              Desk.withChildren({ Leaf: Desk.child(reading) }).make({
                init: initial,
                update: (_, children) => (state) => ({ state: { ...state, step: children.Leaf.output() ? 1 : 2 } }),
                makeModel: () => null
              })
            ),
            "Next"
          )
      ],
      [
        "listening",
        "subscriptions",
        () =>
          diedIn(
            start(
              Desk.withChildren({
                Leaf: Desk.child(quiet, { listening: (state) => state.step === 1 ? boom() : true })
              }).make({ init: initial, update: next, makeModel: () => null })
            ),
            "Next"
          )
      ],
      [
        "a child's subscriptions",
        "subscriptions",
        () =>
          diedIn(
            start(
              Desk.withChildren({
                Leaf: Desk.child(
                  program<{ state: Leaf; message: "Go"; key: "k" }>().make({
                    init: { state: { on: false } },
                    update: () => () => ({ state: { on: true } }),
                    subscriptions: (state) => state.on ? boom() : [],
                    listen: () => Channel.never,
                    makeModel: () => null
                  })
                )
              }).make({ init: initial, update: next, makeModel: () => null })
            ),
            { _tag: "Leaf", message: "Go" }
          )
      ],
      [
        "a child's output, read in its parent's makeModel",
        "render",
        () =>
          diedIn(
            start(
              Desk.withChildren({ Leaf: Desk.child(reading) }).make({
                init: initial,
                update: next,
                makeModel: (state, children) => state.step === 1 ? children.Leaf.output() : null
              })
            ),
            "Next"
          )
      ],
      [
        "a child's makeModel",
        "render",
        () =>
          diedIn(
            start(
              Desk.withChildren({
                Leaf: Desk.child(
                  program<{ state: Leaf }>().make({ init: { state: { on: false } }, makeModel: () => boom() })
                )
              }).make({
                init: initial,
                update: next,
                makeModel: (state, children) => state.step === 1 ? children.Leaf() : null
              })
            ),
            "Next"
          )
      ]
    ])("%s", async (_, where, died) => {
      expect(await died()).toBe(where)
    })

    // A parent lists its child's keys under the child's name, and its `listen` makes the child's subscription.
    test.each<[string, () => Subscription<"Go">]>([
      ["whose listen throws", boom],
      ["whose channel dies", () => Channel.die(new Boom())]
    ])("a child's subscription %s is a defect in subscription, with the child's key", async (_, listen) => {
      const listening = program<{ state: Leaf; message: "Go"; key: "k" }>().make({
        init: { state: { on: false } },
        update: () => () => ({ state: { on: true } }),
        subscriptions: () => ["k"],
        listen,
        makeModel: () => null
      })
      const exit = await Effect.runPromiseExit(
        start(
          Desk.withChildren({ Leaf: Desk.child(listening) }).make({
            init: initial,
            update: next,
            makeModel: () => null
          })
        ).run
      )
      const thrown = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
      expect(thrown instanceof ProgramDefect && thrown.cause instanceof Boom && [thrown.where, thrown.key]).toEqual([
        "subscription",
        { _tag: "Leaf", instance: expect.any(Number), key: "k" }
      ])
    })
  })

  test("a defect in a subscription carries its key", async () => {
    const exit = await Effect.runPromiseExit(
      start({ ...counter, subscriptions: () => ["k"], listen: () => Channel.die(new Boom()) }).run
    )
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(defect instanceof ProgramDefect && defect.key).toBe("k")
  })

  test("the key of a ProgramDefect and the id of a CompositionDefect are the program's own values, as they are", async () => {
    const key = { room: "general" }
    const keyed = await Effect.runPromiseExit(
      start({ ...counter, subscriptions: () => [key], listen: () => Channel.die(new Boom()) }).run
    )
    const inKey = Exit.isFailure(keyed) ? Cause.squash(keyed.cause) : undefined
    type Row = Readonly<{ n: number }>
    const row: Program<{ state: Row; model: number; message: "Up"; external: "Clear" }> = {
      init: { state: { n: 0 } },
      update: () => ({ n }) => ({ state: { n: n + 1 } }),
      external: () => () => ({ state: { n: 0 } }),
      subscriptions: () => [],
      makeModel: ({ n }) => n
    }
    type Shelf = Readonly<{ shelf: string }>
    const Rows = program<{ state: object; message: Readonly<{ id: Shelf }> }>()
    // No row is ever there: an external message to one is a defect that names its id.
    const rows = Rows.withChildren({ Rows: Rows.childById(row, { ids: (): ReadonlyArray<Shelf> => [] }) }).make({
      init: { state: {} },
      update: ({ id }) => (state) => ({ state, tell: [{ _tag: "Rows", id, message: "Clear" }] }),
      makeModel: () => null
    })
    const id = { shelf: "top" }
    const { app, run } = start(rows)
    const fiber = Effect.runFork(run)
    app.dispatch({ id })
    const ided = await ended(fiber)
    const inId = Exit.isFailure(ided) ? Cause.squash(ided.cause) : undefined
    expect(inKey instanceof ProgramDefect && inKey.key).toBe(key)
    expect(inId instanceof ProgramDefect && inId.cause instanceof CompositionDefect && inId.cause.id).toBe(id)
  })

  // Equal throws when the run compares a key with the next state's; Hash, which Effect caches by object, when the
  // key is first hashed.
  test.each(["Equal", "Hash"])("a key whose %s throws dies in subscriptions", async (throwing) => {
    class Key implements Equal.Equal {
      [Equal.symbol](): boolean {
        return boom()
      }
      [Hash.symbol](): number {
        return throwing === "Hash" ? boom() : 0
      }
    }
    const exit = await sentIncrement({
      ...counter,
      subscriptions: () => [new Key()],
      listen: () => Channel.never
    })
    expect(defectsOf(exit).map((defect) => defect instanceof ProgramDefect ? [defect.where, defect.cause] : defect))
      .toEqual([["subscriptions", new Boom()]])
  })

  test("every defect of the cause is kept, each with where it happened", async () => {
    const exit = await Effect.runPromiseExit(
      start({
        ...counter,
        init: pinging,
        runCommand: () => Effect.die(new Boom()).pipe(Effect.ensuring(Effect.die("also")))
      }).run
    )
    expect(defectsOf(exit).map((defect) => defect instanceof ProgramDefect && [defect.where, defect.cause])).toEqual([
      ["command", new Boom()],
      ["command", "also"]
    ])
  })

  /** Runs `running` with debug logs enabled and a `Logger` that throws on the log that starts with `text`. */
  const diesOnLog = async (text: string, running: Effect.Effect<void>) => {
    const throwing = Logger.make(({ message }) => {
      if (Arr.isArray(message) && message[0] === text) boom()
    })
    const exit = await Effect.runPromiseExit(running.pipe(
      Effect.provideService(References.MinimumLogLevel, "Debug"),
      Effect.provide(Logger.layer([throwing]))
    ))
    return defectsOf(exit).map((defect) => defect instanceof ProgramDefect ? [defect.where, defect.cause] : defect)
  }

  test("a Logger that throws on what a command logs is a defect in the command", async () => {
    const logging = start({
      ...counter,
      init: pinging,
      runCommand: () => Effect.logDebug("Pinging").pipe(Effect.as(Opt.none()))
    }).run
    expect(await diesOnLog("Pinging", logging)).toEqual([["command", new Boom()]])
  })

  test("a Logger that throws on what a subscription logs is a defect in the subscription", async () => {
    const logging = start({
      ...counter,
      subscriptions: () => ["k"],
      listen: () => Channel.fromEffectDone(Effect.andThen(Effect.logDebug("Listening"), Effect.never))
    }).run
    expect(await diesOnLog("Listening", logging)).toEqual([["subscription", new Boom()]])
  })

  type Busy = Readonly<{ count: number; listening: boolean }>

  type BusyMessage = "Up" | "Break" | "Work"

  /**
   * `Up` counts, `Break` throws, and `Work` listens and starts the command `Note`: each notes in `log` that it is
   * applied, and the command and the subscription that they started.
   */
  const busy = (
    log: Array<string>,
    init: Step<Busy, "Note" | "Answer">,
    runCommand: (command: "Note" | "Answer") => Execution<BusyMessage>,
    dies: Subscription<BusyMessage> = Channel.never
  ): Program<
    { state: Busy; model: Busy; message: BusyMessage; command: "Note" | "Answer"; key: "listening" | "dies" }
  > => ({
    init,
    update: (message) => (state) => {
      log.push(`update ${message}`)
      if (message === "Break") throw "update threw"
      return message === "Up"
        ? { state: { ...state, count: state.count + 1 } }
        : { state: { ...state, listening: true }, commands: ["Note"] }
    },
    runCommand: (command) =>
      command === "Note" ? Effect.as(Effect.sync(() => log.push("command started")), Opt.none()) : runCommand(command),
    subscriptions: ({ listening }) => [listening ? "listening" as const : "dies" as const],
    listen: (key) =>
      key === "listening"
        ? Channel.unwrap(Effect.as(Effect.sync(() => log.push("subscription started")), Channel.never))
        : dies,
    makeModel: (state) => state
  })

  // A listener sends `Break` in the step of `Up`, and `Work` after it, in the same call: the end of the run has not
  // begun when `Work` arrives, and only the defect keeps it out.
  test("a message the run does not apply after a defect starts no command and no subscription, and onApplied does not hear it", async () => {
    const log: Array<string> = []
    const { app, run } = start(busy(log, { state: { count: 0, listening: false } }, () => Effect.succeedNone), {
      onApplied: ({ message }) => void log.push(`applied ${message}`)
    })
    // Once: a `Work` applied would tell it again.
    const stop = app.subscribe(() => {
      stop()
      app.dispatch("Break")
      app.dispatch("Work")
    })
    const fiber = Effect.runFork(run)
    app.dispatch("Up")
    expect(wheres(await ended(fiber))).toEqual(["update: update threw"])
    expect(log).toEqual(["update Up", "applied Up", "update Break"])
  })

  // The command of `init` answers `Work` once the subscription's release has begun, which comes after its death is
  // recorded; uninterruptible, it answers however soon the end comes.
  test("a run whose subscription of init dies as it starts applies no message after: an answer starts nothing, and onApplied does not hear it", async () => {
    const log: Array<string> = []
    const released = Deferred.makeUnsafe<void>()
    const dies = Channel.unwrap(Effect.as(
      Effect.addFinalizer(() => Deferred.succeed(released, undefined)),
      Channel.die("subscription threw")
    ))
    const { run } = start(
      busy(
        log,
        { state: { count: 0, listening: false }, commands: ["Answer"] },
        () => Effect.uninterruptible(Effect.as(Deferred.await(released), Opt.some<BusyMessage>("Work"))),
        dies
      ),
      { onApplied: ({ message }) => void log.push(`applied ${message}`) }
    )
    expect(wheres(await Effect.runPromiseExit(run))).toEqual(["subscription: subscription threw"])
    expect(log).toEqual([])
  })
})

describe("onApplied", () => {
  test("returns nothing, as onIgnored does: the types refuse a value, an effect or a promise", () => {
    // @ts-expect-error: a value it returned would be lost.
    expect(() => start(counter, { onApplied: () => 1 })).toBeDefined()
    // @ts-expect-error: an effect it returned would never run.
    expect(() => start(counter, { onApplied: () => Effect.void })).toBeDefined()
    // @ts-expect-error: a promise it returned would not be awaited.
    expect(() => start(counter, { onIgnored: async () => undefined })).toBeDefined()
    const heard: Array<Message> = []
    const untyped = ({ message }: Applied<Count, Message, Command>) => {
      heard.push(message)
    }
    const typed = ({ message }: Applied<Count, Message, Command>): undefined => {
      heard.push(message)
    }
    // @ts-expect-error: declared apart, it is typed `void`, which may hide an effect.
    expect(() => start(counter, { onApplied: untyped })).toBeDefined()
    expect(() => start(counter, { onApplied: typed, onIgnored: () => undefined })).toBeDefined()
    // @ts-expect-error: a value onIgnored returned would be lost.
    expect(() => start(counter, { onIgnored: () => 1 })).toBeDefined()
    // @ts-expect-error: an effect onIgnored returned would never run.
    expect(() => start(counter, { onIgnored: () => Effect.void })).toBeDefined()
    const ignoredApart = ({ message }: Ignored<Count, Message>) => {
      heard.push(message)
    }
    // @ts-expect-error: declared apart, onIgnored is typed `void` too.
    expect(() => start(counter, { onIgnored: ignoredApart })).toBeDefined()
  })

  test("hears every accepted message in order, with the states around it, before the dispatch returns", async () => {
    const heard: Array<Applied<Count, Message, Command>> = []
    const counts: Array<number> = []
    const { app, run } = start(counter, { onApplied: (applied) => void heard.push(applied) })
    const fiber = Effect.runFork(run)
    app.dispatch("Increment")
    counts.push(heard.length)
    app.dispatch("Increment")
    counts.push(heard.length)
    await interrupted(fiber)
    const origin = { _tag: "Dispatch" } as const
    expect(heard).toEqual([
      { message: "Increment", origin, before: { count: 0 }, after: { count: 1 }, commands: [] },
      { message: "Increment", origin, before: { count: 1 }, after: { count: 2 }, commands: [] }
    ])
    expect(counts).toEqual([1, 2])
  })

  test("says where each message came from: a dispatch, a command, or a subscription with its key", async () => {
    const origins: Array<unknown> = []
    const pinging: Keyed = {
      ...counter,
      init: { state: { count: 0 }, commands: ["Ping"] },
      subscriptions: () => ["k"],
      listen: () => Channel.succeed<Message>("Increment").pipe(Channel.concatWith(() => Channel.never))
    }
    const { app, run } = start(pinging, { onApplied: ({ origin }) => void origins.push(origin) })
    await endedAfter(
      Effect.runFork(run),
      reaching(app, ({ count }) => count === 2).pipe(Effect.andThen(Effect.sync(() => app.dispatch("Increment"))))
    )
    expect(origins).toHaveLength(3)
    expect(origins).toContainEqual({ _tag: "Dispatch" })
    expect(origins).toContainEqual({ _tag: "Command" })
    expect(origins).toContainEqual({ _tag: "Subscription", key: "k" })
  })

  test("a key that carries data reaches onApplied and onIgnored whole, as the very value listed", async () => {
    const key = { room: "general" }
    const keys: Array<unknown> = []
    const both = Deferred.makeUnsafe<void>()
    const hear = (origin: Origin): undefined => {
      keys.push(origin._tag === "Subscription" ? origin.key : origin._tag)
      if (keys.length === 2) Deferred.doneUnsafe(both, Exit.void)
    }
    const room: Keyed<Readonly<{ room: string }>> = {
      ...counter,
      subscriptions: () => [key],
      listen: () =>
        Channel.succeed<Message>("Increment").pipe(
          Channel.concatWith(() => Channel.succeed<Message>("Forbidden")),
          Channel.concatWith(() => Channel.never)
        )
    }
    const { run } = start(room, { onApplied: ({ origin }) => hear(origin), onIgnored: ({ origin }) => hear(origin) })
    expect(wheres(await endedAfter(Effect.runFork(run), Deferred.await(both)))).toEqual([])
    expect(keys.map((heard) => heard === key)).toEqual([true, true])
  })

  test("a message that leaves the very same state is heard too, with after as before, and tells no listener", async () => {
    const applied = Deferred.makeUnsafe<Applied<Count, Message, Command>>()
    const still: Counter = {
      ...counter,
      init: { state: { count: 0 }, commands: ["Ping"] },
      update: () => (state) => ({ state })
    }
    const { app, run } = start(still, {
      onApplied: (message) => void Deferred.doneUnsafe(applied, Exit.succeed(message))
    })
    let told = 0
    app.subscribe(() => void (told += 1))
    await endedAfter(Effect.runFork(run), Deferred.await(applied))
    const heard = await Effect.runPromise(Deferred.await(applied))
    expect(heard).toEqual({
      message: "Increment",
      origin: { _tag: "Command" },
      before: { count: 0 },
      after: { count: 0 },
      commands: []
    })
    expect(heard.after).toBe(heard.before)
    expect(told).toBe(0)
  })

  test("hears the commands each message started, as update returned them", async () => {
    const applied: Array<Applied<Count, Message, Command>> = []
    const two = Deferred.makeUnsafe<void>()
    // The first increment pings again, so a second one follows.
    const pinging: Counter = {
      ...counter,
      init: { state: { count: 0 }, commands: ["Ping"] },
      update: () => ({ count }) => ({ state: { count: count + 1 }, commands: count === 0 ? ["Ping"] : [] })
    }
    const { run } = start(pinging, {
      onApplied: (step) => {
        applied.push(step)
        if (applied.length === 2) Deferred.doneUnsafe(two, Exit.void)
      }
    })
    await endedAfter(Effect.runFork(run), Deferred.await(two))
    expect(applied.slice(0, 2).map((step) => step.commands)).toEqual([["Ping"], []])
  })
})

describe("onIgnored", () => {
  test("hears every message update rejects, with where it came from and the state it did not apply in", async () => {
    const ignored: Array<Ignored<Count, Message>> = []
    const applied: Array<Message> = []
    const all = Deferred.makeUnsafe<void>()
    const { app, run } = start(
      {
        ...counter,
        init: { state: { count: 0 }, commands: ["Ping"] },
        runCommand: () => Effect.succeedSome<Message>("Forbidden"),
        subscriptions: () => ["k"],
        listen: () => Channel.succeed<Message>("Forbidden").pipe(Channel.concatWith(() => Channel.never))
      },
      {
        onApplied: ({ message }) => void applied.push(message),
        onIgnored: (each) => {
          ignored.push(each)
          if (ignored.length === 3) Deferred.doneUnsafe(all, Exit.void)
        }
      }
    )
    const fiber = Effect.runFork(run)
    app.dispatch("Forbidden")
    await endedAfter(fiber, Deferred.await(all))
    expect(applied).toEqual([])
    expect(ignored).toHaveLength(3)
    expect(ignored).toContainEqual({ message: "Forbidden", origin: { _tag: "Dispatch" }, state: { count: 0 } })
    expect(ignored).toContainEqual({ message: "Forbidden", origin: { _tag: "Command" }, state: { count: 0 } })
    expect(ignored).toContainEqual({
      message: "Forbidden",
      origin: { _tag: "Subscription", key: "k" },
      state: { count: 0 }
    })
  })
})

describe("subscriptions", () => {
  test("a subscription is a Channel whose end value is a message", () => {
    const ending: Subscription<Message> = Channel.end("Increment")
    const sending: Subscription<Message> = Channel.succeed<Message>("Increment").pipe(
      Channel.concatWith(() => Channel.end<Message>("Same"))
    )
    // @ts-expect-error: it would end in silence.
    const silent: Subscription<Message> = Channel.succeed<Message>("Increment")
    // @ts-expect-error: its end is no message.
    const other: Subscription<Message> = Channel.end(0)
    expect([ending, sending, silent, other]).toHaveLength(4)
  })

  test("a subscription takes no input and cannot fail", () => {
    // @ts-expect-error: an expected failure is a message, not an error.
    const failing: Subscription<Message> = Channel.fail("offline")
    const reading = Channel.never as Channel.Channel<Message, never, Message, string>
    // @ts-expect-error: nothing gives it an input.
    const input: Subscription<Message> = reading
    expect([failing, input]).toHaveLength(2)
  })

  test("listen takes the key alone: it does not see the state", () => {
    const seeing: Keyed = {
      ...counter,
      subscriptions: () => ["k"],
      // @ts-expect-error: a key carries everything its subscription needs.
      listen: (_: string, state: Count) => Channel.end<Message>(state.count > 0 ? "Increment" : "Same")
    }
    expect(seeing).toBeDefined()
  })

  // A stopwatch: `Tick` counts in any state, so that only the run can keep a late one out; `Stop` drops the key of
  // the ticks. The fiber of effects, held in the job of `Hold` by the release of the gate, has not stopped the ticks
  // when `Stop` is applied and a tick is sent.
  type Watch = Readonly<{ gated: boolean; isRunning: boolean; ticks: number }>

  type WatchMessage = "Hold" | "Tick" | "Stop"

  /** Runs the stopwatch with `options`, sends a tick once its key went away, and returns the ticks the model counts. */
  const lateTick = (options: RunOptions<Watch, WatchMessage, never> = {}) =>
    Effect.runPromise(Effect.gen(function*() {
      const source = yield* Queue.unbounded<"Tick">()
      const holding = yield* Deferred.make<void>()
      const sent = yield* Deferred.make<void>()
      // The subscription asks for what follows the tick only once the tick has been applied: then `sent` completes.
      const ticking = Channel.unwrap(Effect.map(Queue.take(source), (tick) => Channel.succeed(tick))).pipe(
        Channel.concatWith(() => Channel.unwrap(Effect.as(Deferred.succeed(sent, undefined), Channel.never)))
      )
      const held = gate<WatchMessage>(Deferred.succeed(holding, undefined).pipe(Effect.andThen(Deferred.await(sent))))
      const watch: Program<{ state: Watch; model: Watch; message: WatchMessage; key: "gate" | "ticks" }> = {
        init: { state: { gated: true, isRunning: true, ticks: 0 } },
        update: (message) => (state) =>
          message === "Tick"
            ? { state: { ...state, ticks: state.ticks + 1 } }
            : message === "Hold"
            ? { state: { ...state, gated: false } }
            : { state: { ...state, isRunning: false } },
        subscriptions: (state) =>
          state.gated && state.isRunning
            ? ["gate" as const, "ticks" as const]
            : state.isRunning
            ? ["ticks" as const]
            : [],
        listen: (key) => key === "gate" ? held : ticking,
        makeModel: (state) => state
      }
      const { app, run } = start(watch, options)
      return yield* Effect.raceFirst(
        run,
        Effect.gen(function*() {
          app.dispatch("Hold")
          yield* Deferred.await(holding)
          app.dispatch("Stop")
          yield* Queue.offer(source, "Tick")
          yield* Deferred.await(sent)
          return app.model().ticks
        })
      )
    }))

  test("what a subscription sends once its key went away, before it is stopped, does not reach update", async () => {
    expect(await lateTick()).toBe(0)
  })

  test("neither onApplied nor onIgnored hears what a subscription sends once its key went away", async () => {
    const heard: Array<string> = []
    await lateTick({
      onApplied: ({ message }) => void heard.push(`applied ${message}`),
      onIgnored: ({ message }) => void heard.push(`ignored ${message}`)
    })
    expect(heard).toEqual(["applied Hold", "applied Stop"])
  })
})

describe("the end of the run", () => {
  const where = (exit: Exit.Exit<unknown>) => {
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return defect instanceof ProgramDefect ? defect.where : undefined
  }

  // Holds until the run ends, once it has told by `holding` that it holds, and dies while it releases what it holds.
  const dying = (holding: Deferred.Deferred<void>) =>
    Effect.ensuring(Deferred.succeed(holding, undefined).pipe(Effect.andThen(Effect.never)), Effect.die("boom"))

  // The end of the run interrupts its commands and its subscriptions, and awaits them: what one dies of as it is
  // interrupted joins the cause.
  test("a subscription that dies as the end of the run releases it ends the run with it", async () => {
    const holding = Deferred.makeUnsafe<void>()
    const { run } = start({
      ...counter,
      subscriptions: () => ["k"],
      listen: () => Channel.fromEffectDone(dying(holding))
    })
    expect(where(await endedAfter(Effect.runFork(run), Deferred.await(holding)))).toBe("subscription")
  })

  test("a command that dies as the end of the run interrupts it ends the run with it", async () => {
    const holding = Deferred.makeUnsafe<void>()
    const { run } = start({
      ...counter,
      init: { state: { count: 0 }, commands: ["Ping"] },
      runCommand: () => dying(holding)
    })
    expect(where(await endedAfter(Effect.runFork(run), Deferred.await(holding)))).toBe("command")
  })

  // A window of absence: under a `TestClock` moved on by a day, a release that never ends holds the job after it, then
  // the end of the run, which waits for it before it dies. What would tell that nothing starts and nothing ends is what
  // does not happen: the day moved once the release has begun, each hour followed by a yield for what it woke, in which
  // no real time passes.
  test("a release that never ends holds the next job, then the defects the run would die with, with no defect of its own", async () => {
    type Gated = Readonly<{ gated: boolean; works: number }>
    const outcome = await Effect.runPromise(
      Effect.gen(function*() {
        const log: Array<string> = []
        const releasing = yield* Deferred.make<void>()
        // Opened only once the test has seen what it checks, so that the run can end.
        const opened = yield* Deferred.make<void>()
        const held: Program<{ state: Gated; model: Gated; message: "Open" | "Work"; command: number; key: "gate" }> = {
          init: { state: { gated: true, works: 0 } },
          update: (message) => (state) =>
            message === "Open"
              ? { state: { ...state, gated: false } }
              : { state: { ...state, works: state.works + 1 }, commands: [state.works + 1] },
          runCommand: (n) => Effect.as(Effect.sync(() => log.push(`command ${n}`)), Opt.none()),
          subscriptions: ({ gated }) => gated ? ["gate" as const] : [],
          listen: () =>
            gate<"Open" | "Work">(
              Deferred.succeed(releasing, undefined).pipe(Effect.andThen(Deferred.await(opened)))
            ),
          makeModel: (state) => state
        }
        const aDay = Effect.forEach(
          Arr.range(1, 24),
          () => TestClock.adjust("1 hour").pipe(Effect.andThen(Effect.yieldNow)),
          { discard: true }
        )
        const { app, run } = start(held)
        // Started at once, so that the release holds the fiber of effects, not the run's.
        const fiber = yield* Effect.forkChild(run, { startImmediately: true })
        app.dispatch("Open")
        yield* Deferred.await(releasing)
        app.dispatch("Work")
        yield* aDay
        // A message is still applied: no defect has come.
        app.dispatch("Work")
        const before = { works: app.model().works, commands: [...log], running: fiber.pollUnsafe() === undefined }
        app.die("drew")
        yield* aDay
        const ending = { commands: [...log], running: fiber.pollUnsafe() === undefined }
        yield* Deferred.succeed(opened, undefined)
        return { before, ending, wheres: wheres(yield* Fiber.await(fiber)) }
      }).pipe(Effect.provide(TestClock.layer()))
    )
    expect(outcome).toEqual({
      before: { works: 2, commands: [], running: true },
      ending: { commands: [], running: true },
      wheres: ["render: drew"]
    })
  })

  const sites = (exit: Exit.Exit<unknown>) =>
    Exit.isFailure(exit)
      ? exit.cause.reasons.filter(Cause.isDieReason).map(({ defect }) =>
        defect instanceof ProgramDefect ? defect.where : defect
      )
      : []

  // The command whose release dies as the interrupted run stops it is under "defects the handle meets".
  test("an interrupted run whose command dies as it releases has the defect first, then the interruption", async () => {
    const holding = Deferred.makeUnsafe<void>()
    const exit = await endedAfter(Effect.runFork(start(releaseDies(holding)).run), Deferred.await(holding))
    expect(Exit.isFailure(exit) ? exit.cause.reasons.map(({ _tag }) => _tag) : []).toEqual(["Die", "Interrupt"])
  })

  test("a command whose release dies as a run that died elsewhere stops it is in the cause", async () => {
    const holding = Deferred.makeUnsafe<void>()
    const { app, run } = start({ ...releaseDies(holding), update: () => () => defect("update") })
    const fiber = Effect.runFork(run)
    await Effect.runPromise(Effect.raceFirst(Effect.asVoid(Fiber.await(fiber)), Deferred.await(holding)))
    app.dispatch("Increment")
    expect(sites(await ended(fiber))).toEqual(["update", "command"])
  })

  // What is read once the run has died is the model of the latest state, the one already made.
  test("a model read once a run has died is the model of the state before the defect", async () => {
    let made = 0
    const { app, run } = start({
      ...counter,
      update: () => () => defect("update"),
      makeModel: (state) => {
        made++
        return counter.makeModel(state)
      }
    })
    const before = app.model()
    const fiber = Effect.runFork(run)
    app.dispatch("Increment")
    const exit = await ended(fiber)
    expect([sites(exit), made, app.model() === before, app.model().count]).toEqual([["update"], 1, true, 0])
  })

  test("a model read for the first time once a run has died is still made, of the state before the defect", async () => {
    let made = 0
    const { app, run } = start({
      ...counter,
      update: (message) => message === "Increment" ? counter.update(message) : () => defect("update"),
      makeModel: (state) => {
        made++
        return counter.makeModel(state)
      }
    })
    const fiber = Effect.runFork(run)
    app.dispatch("Increment")
    app.dispatch("Forbidden")
    const exit = await ended(fiber)
    const unread = made
    expect([sites(exit), unread, app.model().count, made]).toEqual([["update"], 0, 1, 1])
  })

  test("a makeModel that dies as a run that died elsewhere stops a command is the second defect, in render", async () => {
    const holding = Deferred.makeUnsafe<void>()
    const reader: { app?: App<Model, Message> } = {}
    const { app, run } = start({
      ...counter,
      init: { state: { count: 0 }, commands: ["Ping"] },
      update: () => () => defect("update"),
      // The model is first read as the command is interrupted, which keeps what the read throws: the command does not
      // die of it too.
      runCommand: () =>
        Deferred.succeed(holding, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Effect.sync(() => thrownBy(() => reader.app?.model())))
        ),
      makeModel: () => {
        throw new Error("boom")
      }
    })
    reader.app = app
    const fiber = Effect.runFork(run)
    await Effect.runPromise(Effect.raceFirst(Effect.asVoid(Fiber.await(fiber)), Deferred.await(holding)))
    app.dispatch("Increment")
    expect(sites(await ended(fiber))).toEqual(["update", "render"])
  })

  // A fiber that dies once the end of the run has reached it, while it cannot be interrupted: it tells by `started`
  // that it runs. The end of the run interrupts the fibers in its `FiberSet` and `FiberMap`, and awaits one that dies
  // while it cannot be interrupted. Left interruptible, such a fiber is interrupted before its step, and never dies.
  const diesOnceInterrupted = (started: Deferred.Deferred<void>) =>
    Effect.uninterruptible(
      Deferred.succeed(started, undefined).pipe(
        Effect.andThen(untilInterrupted),
        Effect.andThen(Effect.yieldNow),
        Effect.andThen(Effect.die("late"))
      )
    )

  test("a command that dies, uninterruptible, once an interrupted run has interrupted it ends the run with it", async () => {
    const started = Deferred.makeUnsafe<void>()
    const { run } = start({
      ...counter,
      init: { state: { count: 0 }, commands: ["Ping"] },
      runCommand: () => diesOnceInterrupted(started)
    })
    expect(sites(await endedAfter(Effect.runFork(run), Deferred.await(started)))).toEqual(["command"])
  })

  test("a subscription that dies, uninterruptible, once an interrupted run has stopped it ends the run with it", async () => {
    const started = Deferred.makeUnsafe<void>()
    const { run } = start({
      ...counter,
      subscriptions: () => ["k"],
      listen: () => Channel.fromEffectDone(diesOnceInterrupted(started))
    })
    expect(sites(await endedAfter(Effect.runFork(run), Deferred.await(started)))).toEqual(["subscription"])
  })

  // What a release dies of is a defect once the scope it is in has released all it holds: a subscription that ends
  // of itself, whose first finalizer dies while the next waits, applies the messages sent meanwhile.
  test("a subscription whose release dies applies messages until its scope has released all", async () => {
    const drawn: Array<number> = []
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const go = yield* Deferred.make<void>()
      const { app, run } = start({
        ...counter,
        subscriptions: () => ["a"],
        listen: () =>
          Channel.unwrap(
            Effect.addFinalizer(() => Deferred.succeed(releasing, undefined).pipe(Effect.andThen(Deferred.await(go))))
              .pipe(
                // Added last, so run first.
                Effect.andThen(Effect.addFinalizer(() => Effect.die("release"))),
                Effect.as(Channel.fromEffectDone(Effect.succeed<Message>("Forbidden")))
              )
          )
      })
      return yield* Effect.raceFirst(
        run,
        Effect.gen(function*() {
          drawn.push(app.model().count)
          yield* Deferred.await(releasing)
          app.dispatch("Increment")
          drawn.push(app.model().count)
          yield* Deferred.succeed(go, undefined)
          return yield* Effect.never
        })
      )
    }))
    expect([sites(exit), drawn]).toEqual([["subscription"], [0, 1]])
  })

  // What dies first is first, though the release of what it held lets another fiber die before it has ended: each
  // fiber with a scope of its own records its defect as it dies, and what its release dies of as it ends.
  const defects = (exit: Exit.Exit<unknown>) =>
    Exit.isFailure(exit)
      ? exit.cause.reasons.filter(Cause.isDieReason).map(({ defect }) =>
        defect instanceof ProgramDefect ? defect.cause : defect
      )
      : []

  // Dies of `first`, then releases, which lets `second` die.
  const diesThenReleases = (released: Deferred.Deferred<void>) =>
    Effect.addFinalizer(() => Deferred.succeed(released, undefined)).pipe(
      Effect.andThen(Effect.yieldNow),
      Effect.andThen(Effect.die("first"))
    )

  // Uninterruptible, so that the end of the run, which `first` starts, lets it die.
  const diesOnceReleased = (released: Deferred.Deferred<void>) =>
    Effect.uninterruptible(Deferred.await(released).pipe(Effect.andThen(Effect.die("second"))))

  test("a command that dies before another, which its release lets die, is the first defect of the cause", async () => {
    const released = Deferred.makeUnsafe<void>()
    const exit = await Effect.runPromiseExit(
      start({
        ...counter,
        init: { state: { count: 0 }, commands: ["Boom", "Ping"] },
        runCommand: (command) =>
          command === "Boom"
            ? diesThenReleases(released)
            : diesOnceReleased(released)
      }).run
    )
    expect(defects(exit)).toEqual(["first", "second"])
  })

  test("a subscription that dies before another, which its release lets die, is the first defect", async () => {
    const released = Deferred.makeUnsafe<void>()
    const exit = await Effect.runPromiseExit(
      start({
        ...counter,
        subscriptions: () => ["a", "b"],
        listen: (key) =>
          key === "a"
            ? Channel.fromEffectDone(diesThenReleases(released))
            : Channel.fromEffectDone(diesOnceReleased(released))
      }).run
    )
    expect(defects(exit)).toEqual(["first", "second"])
  })

  // Dies of `first` inside a scope of the channel's own, whose release lets `second` die, and ends once it has.
  const diesInItsChannel = (released: Deferred.Deferred<void>, dying: Deferred.Deferred<void>) =>
    Channel.unwrap(
      Effect.addFinalizer(() =>
        Deferred.succeed(released, undefined).pipe(
          Effect.andThen(Deferred.await(dying)),
          Effect.andThen(Effect.yieldNow)
        )
      ).pipe(Effect.as(Channel.fromEffectDone(Effect.yieldNow.pipe(Effect.andThen(Effect.die("first"))))))
    )

  test("a subscription dying in a scope of its channel, before one its release lets die, is the first defect", async () => {
    const released = Deferred.makeUnsafe<void>()
    const dying = Deferred.makeUnsafe<void>()
    const exit = await Effect.runPromiseExit(
      start({
        ...counter,
        subscriptions: () => ["a", "b"],
        listen: (key) =>
          key === "a"
            ? diesInItsChannel(released, dying)
            : Channel.fromEffectDone(Effect.uninterruptible(
              Deferred.await(released).pipe(
                Effect.andThen(Deferred.succeed(dying, undefined)),
                Effect.andThen(Effect.die("second"))
              )
            ))
      }).run
    )
    expect(defects(exit)).toEqual(["first", "second"])
  })

  test("a subscription dying in a scope of its channel lets no message apply as the channel releases", async () => {
    let applied = 0
    const releasing = Deferred.makeUnsafe<void>()
    const heard = Deferred.makeUnsafe<void>()
    const { run } = start(
      {
        ...counter,
        subscriptions: () => ["a", "b"],
        listen: (key) =>
          key === "a"
            ? Channel.unwrap(
              // A window of absence: a correct run applies nothing here, so nothing can be awaited in its place.
              Effect.addFinalizer(() =>
                Deferred.succeed(releasing, undefined).pipe(
                  Effect.andThen(
                    Effect.timeoutOrElse(Deferred.await(heard), {
                      duration: "50 millis",
                      orElse: () => Effect.void
                    })
                  )
                )
              ).pipe(Effect.as(Channel.fromEffectDone(Effect.yieldNow.pipe(Effect.andThen(Effect.die("boom"))))))
            )
            : Channel.fromEffect(Effect.as(Deferred.await(releasing), "Increment" as const)).pipe(
              Channel.concatWith(() => Channel.never)
            )
      },
      {
        onApplied: () => {
          applied += 1
          Deferred.doneUnsafe(heard, Exit.void)
        }
      }
    )
    const exit = await Effect.runPromiseExit(run)
    expect([sites(exit), applied]).toEqual([["subscription"], 0])
  })

  // What a command or a subscription wraps around its own code (`Effect.ensuring`, an `Effect.scoped` of its own) is
  // part of its effect, which ends with the defect only once that has run: until then the defect is the program's,
  // which may still catch it, and messages apply as they do while the effect runs. Here `a` releases slowly around its
  // defect, and `b` sends once the release has begun. A subscription's channel may wrap the release around it too
  // (`Channel.onExit`, `Channel.acquireUseRelease`), which closes a scope of the channel's own as its pull fails,
  // before the defect leaves it.
  const behindItsOwnRelease = Effect.fnUntraced(function*(
    where: "command" | "subscription",
    channel: (release: Effect.Effect<void>) => Channel.Channel<never, never, Message> = (release) =>
      Channel.fromEffectDone(Effect.die("boom").pipe(Effect.ensuring(release)))
  ) {
    let applied = 0
    const releasing = yield* Deferred.make<void>()
    const heard = yield* Deferred.make<void>()
    const release = Deferred.succeed(releasing, undefined).pipe(
      // Bounded, so that a run that applies nothing still ends; and wide, since a loaded machine may take a while.
      Effect.andThen(Effect.timeoutOrElse(Deferred.await(heard), {
        duration: "1 second",
        orElse: () => Effect.void
      }))
    )
    const dies = Effect.die("boom").pipe(Effect.ensuring(release))
    const b = Channel.fromEffect(Effect.as(Deferred.await(releasing), "Increment" as const)).pipe(
      Channel.concatWith(() => Channel.never)
    )
    const exit = yield* Effect.exit(
      start(
        {
          ...counter,
          init: { state: { count: 0 }, commands: where === "command" ? ["Boom"] : [] },
          runCommand: () => dies,
          subscriptions: () => where === "subscription" ? ["a", "b"] : ["b"],
          listen: (key) => key === "a" ? channel(release) : b
        },
        {
          onApplied: () => {
            applied += 1
            Deferred.doneUnsafe(heard, Exit.void)
          }
        }
      ).run
    )
    return [sites(exit), applied]
  })

  test("a command that dies under a release of its own dies once it has released, applying messages meanwhile", async () => {
    expect(await Effect.runPromise(behindItsOwnRelease("command"))).toEqual([["command"], 1])
  })

  test("a subscription that dies under a release of its own dies once it has released, applying messages meanwhile", async () => {
    expect(await Effect.runPromise(behindItsOwnRelease("subscription"))).toEqual([["subscription"], 1])
  })

  test("a subscription that dies under an onExit of its channel dies once it has released, applying messages meanwhile", async () => {
    const exit = behindItsOwnRelease(
      "subscription",
      (release) => Channel.onExit(Channel.fromEffectDone(Effect.die("boom")), () => release)
    )
    expect(await Effect.runPromise(exit)).toEqual([["subscription"], 1])
  })

  test("a subscription that dies in an acquireUseRelease of its channel dies once it has released, applying messages meanwhile", async () => {
    const exit = behindItsOwnRelease(
      "subscription",
      (release) =>
        Channel.acquireUseRelease(Effect.void, () => Channel.fromEffectDone(Effect.die("boom")), () => release)
    )
    expect(await Effect.runPromise(exit)).toEqual([["subscription"], 1])
  })

  // Dies inside a scope of its own, which it catches around: the run never learns of the defect.
  const caught = <A>(recovered: A) =>
    Effect.scoped(Effect.addFinalizer(() => Effect.yieldNow).pipe(Effect.andThen(Effect.die("boom")))).pipe(
      Effect.catchCause(() => Effect.succeed(recovered))
    )

  /** Runs `program` until its count is 1, unless the run dies first, and returns how it went. */
  const counted = <Key = never>(program: Keyed<Key>) =>
    Effect.runPromiseExit(Effect.suspend(() => {
      const { app, run } = start(program)
      return Effect.raceFirst(run, reaching(app, ({ count }) => count === 1))
    }))

  test("a command that catches the defect of a scope of its own answers, and the run goes on", async () => {
    const exit = await counted({
      ...counter,
      init: { state: { count: 0 }, commands: ["Boom"] },
      runCommand: () => caught(Opt.some<Message>("Increment"))
    })
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  test("a subscription that catches the defect of a scope of its own ends with its message, and the run goes on", async () => {
    const exit = await counted({
      ...counter,
      subscriptions: () => ["a"],
      listen: () => Channel.fromEffectDone(caught<Message>("Increment"))
    })
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  test("a command that dies as the run starts comes before what a subscription dies of as the end releases it", async () => {
    const exit = await Effect.runPromiseExit(
      start({
        ...counter,
        init: { state: { count: 0 }, commands: ["Ping"] },
        runCommand: () => Effect.die("command"),
        subscriptions: () => ["a"],
        listen: () =>
          Channel.unwrap(
            Effect.acquireRelease(Effect.void, () => Effect.die("release")).pipe(Effect.as(Channel.never))
          )
      }).run
    )
    expect(sites(exit)).toEqual(["command", "subscription"])
  })

  // The fiber of effects stops a key that went away with `stopping`, and the fiber stays in the map until it has ended:
  // the end of the run, which interrupts the fiber of effects while it waits there, still finds the fiber, and awaits
  // its release.
  test("a subscription stopped as whoever runs the run interrupts it, which dies as it releases, is in the cause", async () => {
    const releasing = Deferred.makeUnsafe<void>()
    const ending = Deferred.makeUnsafe<void>()
    // Dies once the end of the run has begun, which interrupts the command of `init` once it has stopped the fiber
    // of effects.
    const releasesThenDies = Channel.unwrap(
      Effect.acquireRelease(Effect.void, () =>
        Deferred.succeed(releasing, undefined).pipe(
          Effect.andThen(Deferred.await(ending)),
          Effect.andThen(Effect.die("boom"))
        )).pipe(Effect.as(Channel.never))
    )
    const { app, run } = start({
      ...counter,
      init: { state: { count: 0 }, commands: ["Ping"] },
      runCommand: () => Effect.never.pipe(Effect.onInterrupt(() => Deferred.succeed(ending, undefined))),
      subscriptions: ({ count }) => count === 0 ? ["k"] : [],
      listen: () => releasesThenDies
    })
    const fiber = Effect.runFork(run)
    app.dispatch("Increment")
    expect(sites(await endedAfter(fiber, Deferred.await(releasing)))).toEqual(["subscription"])
  })

  // The end of the run interrupts the fibers it lists, and only those: a job that went on past it, while a release held
  // the fiber of effects, would start a command and a subscription that nothing awaits. The fiber of effects stops as it
  // waits for the release, so nothing starts; were anything to start, its defect would have to be in the cause.
  test("a step held by a release as the run is interrupted starts nothing the run does not await", async () => {
    let started = 0
    const holding = Deferred.makeUnsafe<void>()
    const startsAndDies = Effect.sync(() => {
      started += 1
    }).pipe(Effect.andThen(Effect.die("boom")))
    // Held until the end of the run, which stops the fiber of effects first, has reached the gate.
    const held = gate<Message>(Deferred.succeed(holding, undefined).pipe(Effect.andThen(untilInterrupted)))
    const { app, run } = start({
      ...counter,
      update: () => ({ count }) => ({ state: { count: count + 1 }, commands: ["Boom"] }),
      runCommand: () => startsAndDies,
      subscriptions: ({ count }) =>
        count === 0
          ? ["gate"]
          : count === 1
          ? ["k"]
          : [],
      listen: (key: string) => key === "gate" ? held : Channel.fromEffectDone(startsAndDies)
    })
    const fiber = Effect.runFork(run)
    app.dispatch("Increment")
    const exit = await endedAfter(fiber, Deferred.await(holding))
    expect(sites(exit).length).toBe(started)
  })

  // Takes the key of `k` away, then sends `Ping`, whose job comes after the stop of `k` has ended, and runs the program
  // until the command of `Ping` has answered, unless the run dies first.
  const stopsThenEnds = <Key = never>(program: Keyed<Key>) =>
    Effect.runPromiseExit(Effect.suspend(() => {
      const { app, run } = start(program)
      return Effect.raceFirst(
        run,
        Effect.sync(() => {
          app.dispatch("Increment")
          app.dispatch("Ping")
        }).pipe(Effect.andThen(reaching(app, ({ count }) => count === 2)))
      )
    }))

  // An interruption by the run is told from one the program makes by its mark, whenever it takes effect: an
  // uninterruptible region delays it, and it is still the run's. The region lasts until the stop of its key has
  // reached it.
  test("a subscription stopped inside an uninterruptible region is no defect", async () => {
    const busy = Effect.uninterruptible(untilInterrupted).pipe(Effect.andThen(Effect.never))
    const exit = await stopsThenEnds({
      ...counter,
      subscriptions: ({ count }) => count === 0 ? ["k"] : [],
      listen: () => Channel.fromEffectDone(busy)
    })
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  // Interrupted where it is uninterruptible, the fiber fails as it turns interruptible inside an `Effect.fn`, traced so
  // that the runtime annotates the interruption with its frame: on a copy of the reason the run made, which keeps the
  // run's mark.
  test("a subscription stopped inside an uninterruptible region, which then enters a traced function, is no defect", async () => {
    const listen = Effect.fn("Listen")(function*() {
      return yield* Effect.interruptible(Effect.never)
    })
    const busy = Effect.uninterruptible(untilInterrupted.pipe(Effect.andThen(listen())))
    const exit = await stopsThenEnds({
      ...counter,
      subscriptions: ({ count }) => count === 0 ? ["k"] : [],
      listen: () => Channel.fromEffectDone(busy)
    })
    expect(Exit.isSuccess(exit)).toBe(true)
  })
})

// An effect that interrupts itself while the run is interrupting it ends with both interruptions in its cause, its
// own first: Effect adds the ones the fiber received, which skip its handlers. The run tells them apart by the mark of
// its stop, which names the fiber it stops, and the effect's own is still a defect, as a defect in its place would be.
describe("a self-interruption as the run interrupts", () => {
  const interruptsItselfOnceInterrupted = Effect.fnUntraced(function*(started: Deferred.Deferred<void>) {
    yield* Deferred.succeed(started, undefined)
    yield* untilInterrupted
    const interrupted = yield* Effect.forkChild(Effect.never)
    yield* Fiber.interrupt(interrupted)
    return yield* Fiber.join(interrupted)
  }, Effect.uninterruptible)

  const selfInterruptions = (exit: Exit.Exit<unknown>) =>
    Exit.isFailure(exit)
      ? exit.cause.reasons.flatMap((reason) =>
        Cause.isDieReason(reason) && reason.defect instanceof ProgramDefect && reason.defect.cause instanceof Error
          ? [`${reason.defect.where}: ${reason.defect.cause.message}`]
          : []
      )
      : []

  // Takes the key of `k` away once it has started, then sends `Ping`, whose job comes after the stop of `k`, and runs
  // the program until the command of `Ping` has answered, unless the run dies first.
  const stopsOnceStarted = <Key = never>(started: Deferred.Deferred<void>, program: Keyed<Key>) =>
    Effect.runPromiseExit(Effect.suspend(() => {
      const { app, run } = start(program)
      return Effect.raceFirst(
        run,
        Deferred.await(started).pipe(
          Effect.andThen(Effect.sync(() => {
            app.dispatch("Increment")
            app.dispatch("Ping")
          })),
          Effect.andThen(reaching(app, ({ count }) => count === 2))
        )
      )
    }))

  test(
    "a command that interrupts itself as whoever runs the run interrupts it is a defect in the command",
    async () => {
      const exit = await interruptedOnce((started) =>
        start({
          ...counter,
          init: { state: { count: 0 }, commands: ["Ping"] },
          runCommand: () => interruptsItselfOnceInterrupted(started)
        }).run
      )
      expect(selfInterruptions(exit)).toEqual(["command: It was interrupted by the program, which only the run may do"])
    }
  )

  test("a subscription that interrupts itself as the run stops it is a defect in the subscription", async () => {
    const started = Deferred.makeUnsafe<void>()
    const exit = await stopsOnceStarted(started, {
      ...counter,
      subscriptions: ({ count }) => count === 0 ? ["k"] : [],
      listen: () => Channel.fromEffectDone(interruptsItselfOnceInterrupted(started))
    })
    expect(selfInterruptions(exit)).toEqual([
      "subscription: It was interrupted by the program, which only the run may do"
    ])
  })

  // Every `FiberMap`, `FiberSet` and `FiberHandle` interrupts as the fiber -1: the interruption a subscription makes
  // itself, by joining a fiber that a map of its own interrupted, has no mark, and is not taken for the one the run
  // gives it as it stops it, which has one (`stopping`). The same join is a defect, as with no interruption by the
  // run.
  const joinsWhatItsMapInterrupted = Effect.fnUntraced(
    function*(started: Deferred.Deferred<void>) {
      const map = yield* FiberMap.make<string>()
      const work = yield* FiberMap.run(map, "work", Effect.never)
      yield* Deferred.succeed(started, undefined)
      yield* untilInterrupted
      yield* FiberMap.remove(map, "work")
      return yield* Fiber.join(work)
    },
    Effect.uninterruptible,
    Effect.scoped
  )

  // The same through a `FiberSet` and a `FiberHandle` of the subscription's: both interrupt as the fiber -1 too.
  const joinsWhatItsSetInterrupted = Effect.fnUntraced(
    function*(started: Deferred.Deferred<void>) {
      const set = yield* FiberSet.make()
      const work = yield* FiberSet.run(set, Effect.never)
      yield* Deferred.succeed(started, undefined)
      yield* untilInterrupted
      yield* FiberSet.clear(set)
      return yield* Fiber.join(work)
    },
    Effect.uninterruptible,
    Effect.scoped
  )

  const joinsWhatItsHandleInterrupted = Effect.fnUntraced(
    function*(started: Deferred.Deferred<void>) {
      const handle = yield* FiberHandle.make()
      const work = yield* FiberHandle.run(handle, Effect.never)
      yield* Deferred.succeed(started, undefined)
      yield* untilInterrupted
      yield* FiberHandle.clear(handle)
      return yield* Fiber.join(work)
    },
    Effect.uninterruptible,
    Effect.scoped
  )

  for (
    const [name, joins] of [
      ["FiberMap", joinsWhatItsMapInterrupted],
      ["FiberSet", joinsWhatItsSetInterrupted],
      ["FiberHandle", joinsWhatItsHandleInterrupted]
    ] as const
  ) {
    test(
      `a subscription that joins a fiber its own ${name} interrupted, as the run stops it, is a defect in the subscription`,
      async () => {
        const started = Deferred.makeUnsafe<void>()
        const exit = await stopsOnceStarted(started, {
          ...counter,
          subscriptions: ({ count }) => count === 0 ? ["k"] : [],
          listen: () => Channel.fromEffectDone(joins(started))
        })
        expect(selfInterruptions(exit)).toEqual([
          "subscription: It was interrupted by the program, which only the run may do"
        ])
      }
    )
  }

  // A fiber that the fiber the run is in interrupted before, which an effect of the program joins as the run ends,
  // fails with an interruption the effect did not receive: the run stops the effect from a fiber of its own, never
  // from that one. It is a defect, as it is when joined in a run that goes on. A fiber interrupted with the very id
  // the effect received, told apart by the mark alone, is the case of the tests after these.
  const joinsOnceInterrupted = Effect.fnUntraced(
    function*(started: Deferred.Deferred<void>, stale: Fiber.Fiber<never>) {
      yield* Deferred.succeed(started, undefined)
      yield* untilInterrupted
      return yield* Fiber.join(stale)
    },
    Effect.uninterruptible
  )

  /** Runs what `running` gives in a fiber that interrupted `stale` itself, and interrupts that fiber once started. */
  const endedByTheFiberThatInterrupted = (
    running: (started: Deferred.Deferred<void>, stale: Fiber.Fiber<never>) => Effect.Effect<void>
  ) =>
    interruptedOnce(Effect.fnUntraced(function*(started) {
      const stale = yield* Effect.forkDetach(Effect.never)
      yield* Fiber.interrupt(stale)
      yield* running(started, stale)
    }))

  test(
    "a command that joins a fiber the fiber of the run interrupted, as the run ends, is a defect in the command",
    async () => {
      const exit = await endedByTheFiberThatInterrupted((started, stale) =>
        start({
          ...counter,
          init: { state: { count: 0 }, commands: ["Ping"] },
          runCommand: () => joinsOnceInterrupted(started, stale)
        }).run
      )
      expect(selfInterruptions(exit)).toEqual(["command: It was interrupted by the program, which only the run may do"])
    }
  )

  test(
    "a subscription that joins a fiber the fiber of the run interrupted, as the run ends, is a defect in the subscription",
    async () => {
      const exit = await endedByTheFiberThatInterrupted((started, stale) =>
        start({
          ...counter,
          subscriptions: () => ["k"],
          listen: () => Channel.fromEffectDone(joinsOnceInterrupted(started, stale))
        }).run
      )
      expect(selfInterruptions(exit)).toEqual([
        "subscription: It was interrupted by the program, which only the run may do"
      ])
    }
  )

  // Waits, uninterruptible, until an interruption reaches the fiber, and gives the fiber ids of those it received.
  const receivedFrom: Effect.Effect<ReadonlySet<number>> = Effect.suspend(() =>
    Effect.exit(Effect.interruptible(Effect.void)).pipe(
      Effect.flatMap((exit) =>
        Exit.isFailure(exit)
          ? Effect.succeed(Cause.interruptors(exit.cause))
          : Effect.yieldNow.pipe(Effect.andThen(receivedFrom))
      )
    )
  )

  // Learns the fiber id of the fiber that stops it from the interruption it received, interrupts a fiber of its own as
  // that id, and joins it: an interruption with the very fiber id of one it received, and without its mark, is one the
  // program made, and a defect.
  const joinsAsTheStopper = Effect.fnUntraced(function*(started: Deferred.Deferred<void>) {
    yield* Deferred.succeed(started, undefined)
    const [by] = yield* receivedFrom
    const stale = yield* Effect.forkDetach(Effect.never)
    yield* Fiber.interruptAs(stale, by!)
    return yield* Fiber.join(stale)
  }, Effect.uninterruptible)

  test(
    "a command that joins a fiber it interrupted as the fiber that stops it, as the run ends, is a defect in the command",
    async () => {
      const exit = await interruptedOnce((started) =>
        start({
          ...counter,
          init: { state: { count: 0 }, commands: ["Ping"] },
          runCommand: () => joinsAsTheStopper(started)
        }).run
      )
      expect(selfInterruptions(exit)).toEqual(["command: It was interrupted by the program, which only the run may do"])
    }
  )

  test(
    "a subscription that joins a fiber it interrupted as the fiber that stops it, as the run ends, is a defect in the subscription",
    async () => {
      const exit = await interruptedOnce((started) =>
        start({
          ...counter,
          subscriptions: () => ["k"],
          listen: () => Channel.fromEffectDone(joinsAsTheStopper(started))
        }).run
      )
      expect(selfInterruptions(exit)).toEqual([
        "subscription: It was interrupted by the program, which only the run may do"
      ])
    }
  )

  // The run's stop of a subscription has the run's mark, which names that subscription: a command that joins its fiber
  // fails with the stop of another fiber, and is a defect, as it is with no mark. The second `Ping` is sent once the
  // fiber of the first has ended, and answers only in a run that goes on.
  test("a command that joins a subscription the run stopped is a defect in the command", async () => {
    const started = Deferred.makeUnsafe<void>()
    const subscription = Deferred.makeUnsafe<Fiber.Fiber<unknown, unknown>>()
    const command = Deferred.makeUnsafe<Fiber.Fiber<unknown, unknown>>()
    const program: Keyed = {
      ...counter,
      runCommand: () =>
        Deferred.isDoneUnsafe(command)
          ? Effect.succeedSome<Message>("Increment")
          : Effect.withFiber((fiber) => Deferred.succeed(command, fiber)).pipe(
            Effect.andThen(Deferred.await(subscription)),
            Effect.flatMap(Fiber.join),
            Effect.andThen(Effect.never),
            Effect.orDie
          ),
      subscriptions: ({ count }) => count === 0 ? ["k"] : [],
      listen: () =>
        Channel.fromEffectDone(
          Effect.withFiber((fiber) => Deferred.succeed(subscription, fiber)).pipe(
            Effect.andThen(Deferred.succeed(started, undefined)),
            Effect.andThen(Effect.never)
          )
        )
    }
    const exit = await Effect.runPromiseExit(Effect.suspend(() => {
      const { app, run } = start(program)
      return Effect.raceFirst(
        run,
        Effect.gen(function*() {
          yield* Deferred.await(started)
          app.dispatch("Increment")
          app.dispatch("Ping")
          yield* Fiber.await(yield* Deferred.await(command))
          app.dispatch("Ping")
          yield* reaching(app, ({ count }) => count === 2)
        })
      )
    }))
    expect(selfInterruptions(exit)).toEqual(["command: It was interrupted by the program, which only the run may do"])
  })

  // A subscription that the run stops reads the annotations of its stop, the run's mark among them, and interrupts a
  // command with them, as the fiber that stopped it: the command received an interruption with the run's mark, which
  // names the subscription, so it is the program's, and a defect. The release waits for the command to end.
  test(
    "a command that a subscription interrupts with the annotations of its own stop is a defect in the command",
    async () => {
      const started = Deferred.makeUnsafe<void>()
      const command = Deferred.makeUnsafe<Fiber.Fiber<unknown, unknown>>()
      const passesItsStopOn = Effect.onExit(
        Effect.andThen(Deferred.succeed(started, undefined), Effect.never),
        (exit) =>
          Effect.flatMap(Deferred.await(command), (fiber) =>
            Effect.forEach(
              Exit.isFailure(exit) ? exit.cause.reasons.filter(Cause.isInterruptReason) : [],
              (reason) => Fiber.interruptAs(fiber, reason.fiberId, Cause.reasonAnnotations(reason)),
              { discard: true }
            ))
      )
      const exit = await stopsOnceStarted(started, {
        ...counter,
        init: { state: { count: 0 }, commands: ["Boom"] },
        runCommand: (asked) =>
          asked === "Ping"
            ? Effect.succeedSome<Message>("Increment")
            : Effect.withFiber((fiber) => Deferred.succeed(command, fiber)).pipe(Effect.andThen(Effect.never)),
        subscriptions: ({ count }) => count === 0 ? ["k"] : [],
        listen: () => Channel.fromEffectDone(passesItsStopOn)
      })
      expect(selfInterruptions(exit)).toEqual(["command: It was interrupted by the program, which only the run may do"])
    }
  )

  // A subscription that the run stops reads the annotations of its stop, and then interrupts itself with them, as
  // another fiber: the mark names the fiber that stopped it, so an interruption by any other is the program's.
  test(
    "a subscription that interrupts itself with the annotations of its stop, as another fiber, is a defect in the subscription",
    async () => {
      const started = Deferred.makeUnsafe<void>()
      const interruptsItselfAsAnother = Effect.onExit(
        Effect.andThen(Deferred.succeed(started, undefined), Effect.never),
        (exit) =>
          Effect.forEach(
            Exit.isFailure(exit) ? exit.cause.reasons.filter(Cause.isInterruptReason) : [],
            (reason) =>
              Effect.failCause(
                Cause.annotate(Cause.interrupt((reason.fiberId ?? 0) + 1), Cause.reasonAnnotations(reason))
              ),
            { discard: true }
          )
      )
      const exit = await stopsOnceStarted(started, {
        ...counter,
        subscriptions: ({ count }) => count === 0 ? ["k"] : [],
        listen: () => Channel.fromEffectDone(interruptsItselfAsAnother)
      })
      expect(selfInterruptions(exit)).toEqual([
        "subscription: It was interrupted by the program, which only the run may do"
      ])
    }
  )
})

// What a command holds is released once its defect says where: its scope closes with the exit the run dies with, a
// defect for a command that interrupted itself too, and what the release dies of is the command's, not the renderer's
// nor the run's own. So a release that dies of the very defect of its command is a second defect, which `Cause` would
// take for the first before either said where.
describe("the release of a command", () => {
  type Releasing = Program<
    { state: Count; model: Model; message: Message; command: Command; commandServices: Scope.Scope }
  >
  const sitesOf = (exit: Exit.Exit<unknown, unknown>): ReadonlyArray<unknown> =>
    Exit.isFailure(exit)
      ? exit.cause.reasons.map((reason) =>
        Cause.isDieReason(reason) && reason.defect instanceof ProgramDefect ? reason.defect.where : reason._tag
      )
      : []
  // Runs the command of `init`, `body` under a release that notes the site of each reason of the exit it is given,
  // then does `release`: what the release saw, and what the run died of.
  const witnessed = async (
    body: Effect.Effect<Opt.Option<Message>, never, Scope.Scope>,
    release: (exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void> = () => Effect.void
  ) => {
    const seen: Array<unknown> = []
    const program: Releasing = {
      ...counter,
      init: { state: { count: 0 }, commands: ["Boom"] },
      runCommand: () =>
        Effect.addFinalizer((exit) => Effect.andThen(Effect.sync(() => seen.push(...sitesOf(exit))), release(exit)))
          .pipe(Effect.andThen(body))
    }
    const exit = await Effect.runPromiseExit(start(program).run)
    return { seen, ended: sitesOf(exit) }
  }

  test("that dies, of a command that answers, is a defect in the command", async () => {
    const { ended } = await witnessed(Effect.succeedSome<Message>("Increment"), () => Effect.die("release threw"))
    expect(ended).toEqual(["command"])
  })

  test("of a command that dies is given its defect, in the command", async () => {
    expect(await witnessed(Effect.die("boom"))).toEqual({ seen: ["command"], ended: ["command"] })
  })

  test("of a command that interrupts itself is given a defect, in the command", async () => {
    expect(await witnessed(Effect.interrupt)).toEqual({ seen: ["command"], ended: ["command"] })
  })

  test("that dies of the very defect of its command is a second defect of the command", async () => {
    const boom = new Error("boom")
    const { ended } = await witnessed(Effect.die(boom), () => Effect.die(boom))
    expect(ended).toEqual(["command", "command"])
  })
})

// A command that interrupts itself is a defect ("Nothing ends in silence" in the guide), and its release is part of
// it: a release that interrupts itself is one too, after the defect the command died of, in the order they happened.
// Alone, without a defect before it, the run dies of it as one.
describe("a release that interrupts itself", () => {
  const said = (exit: Exit.Exit<unknown>) =>
    Exit.isFailure(exit)
      ? exit.cause.reasons.map((reason) =>
        Cause.isDieReason(reason) && reason.defect instanceof ProgramDefect
          ? reason.defect.cause instanceof Error ? reason.defect.cause.message : reason.defect.cause
          : reason._tag
      )
      : []

  test("after the command died, is a second defect of the command, after the first", async () => {
    const exit = await Effect.runPromiseExit(
      start({
        ...counter,
        init: { state: { count: 0 }, commands: ["Boom"] },
        runCommand: () => Effect.addFinalizer(() => Effect.interrupt).pipe(Effect.andThen(Effect.die("boom")))
      }).run
    )
    expect(said(exit)).toEqual(["boom", "It was interrupted by the program, which only the run may do"])
  })
})

// Two releases in the scope the run gives that die with errors equal by `Equal`, though not the same object, are two
// defects: `Cause.combine`, which `Effect.scoped` would join the causes of the close with, keeps one of two equal
// reasons (`scopedIn` in `shell.ts`).
describe("releases that die with errors equal by Equal", () => {
  class Closing extends Data.TaggedError("Closing")<object> {}

  const releasesThatDie = Effect.gen(function*() {
    yield* Effect.addFinalizer(() => Effect.die(new Closing()))
    yield* Effect.addFinalizer(() => Effect.die(new Closing()))
  })

  const sites = (exit: Exit.Exit<unknown>) =>
    Exit.isFailure(exit)
      ? exit.cause.reasons.filter(Cause.isDieReason).map(({ defect }) =>
        defect instanceof ProgramDefect ? [defect.where, defect.cause instanceof Closing ? "Closing" : "own"] : defect
      )
      : []

  test("of a command that dies are each a defect of the command", async () => {
    const exit = await Effect.runPromiseExit(
      start({
        ...counter,
        init: { state: { count: 0 }, commands: ["Ping"] },
        runCommand: () => releasesThatDie.pipe(Effect.andThen(Effect.die("own")))
      }).run
    )
    expect(sites(exit)).toEqual([["command", "own"], ["command", "Closing"], ["command", "Closing"]])
  })

  test("of a subscription the run stops are each a defect of the subscription", async () => {
    const { app, run } = start({
      ...counter,
      subscriptions: ({ count }) => count === 0 ? ["k"] : [],
      listen: () => Channel.unwrap(Effect.as(releasesThatDie, Channel.never))
    })
    const fiber = Effect.runFork(run)
    app.dispatch("Increment")
    expect(sites(await ended(fiber))).toEqual([["subscription", "Closing"], ["subscription", "Closing"]])
  })
})

// A fiber of the program's own that interrupts a command or a subscription is no interruption by the run, nor by
// whoever runs it: only those two interrupt it (guide, "Nothing ends in silence"), so the run dies in the command or
// the subscription.
describe("an interruption made by another fiber of the program", () => {
  const site = (exit: Exit.Exit<unknown>) => {
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return defect instanceof ProgramDefect ? defect.where : typeof defect === "string" ? defect : exit._tag
  }

  // Bounds only the wait of a failing case, whose run applies nothing more and never ends.
  const endedWithin = (running: Effect.Effect<void>) =>
    Effect.runPromiseExit(
      running.pipe(Effect.timeoutOrElse({ duration: "2 seconds", orElse: () => Effect.die("held") }))
    )

  // Has a fiber of its own interrupt the fiber that releases it, and waits until the interruption has reached it: the
  // release is uninterruptible, so the interruption comes as the close of the scope ends, which `scopedIn` restores,
  // before the answer or the last message is sent.
  const interruptedAsItReleases = Effect.gen(function*() {
    const self = yield* Effect.fiber
    yield* Effect.addFinalizer(() => Effect.forkDetach(Fiber.interrupt(self)).pipe(Effect.andThen(untilInterrupted)))
  })

  test("of a command, as its scope releases what it holds, is a defect in the command", async () => {
    const answering = interruptedAsItReleases.pipe(Effect.as(Opt.some<Message>("Increment")))
    const exit = await endedWithin(
      start({ ...counter, init: { state: { count: 0 }, commands: ["Ping"] }, runCommand: () => answering }).run
    )
    expect(site(exit)).toBe("command")
  })

  test("of a subscription, as its scope releases what it holds, is a defect in the subscription", async () => {
    const ending = Channel.unwrap(
      Effect.as(interruptedAsItReleases, Channel.fromEffectDone(Effect.succeed<Message>("Increment")))
    )
    const listening: Keyed = { ...counter, subscriptions: () => ["k"], listen: () => ending }
    expect(site(await endedWithin(start(listening).run))).toBe("subscription")
  })

  test("of a subscription, as it runs, is a defect in the subscription", async () => {
    const interruptedAsItRuns = Effect.gen(function*() {
      const self = yield* Effect.fiber
      yield* Effect.forkDetach(Fiber.interrupt(self))
      return yield* Effect.never
    })
    const listening: Keyed = {
      ...counter,
      subscriptions: () => ["k"],
      listen: () => Channel.fromEffectDone(interruptedAsItRuns)
    }
    expect(site(await endedWithin(start(listening).run))).toBe("subscription")
  })

  // The release waits for `gate` once the interrupter has begun, and whoever runs the run interrupts it meanwhile: the
  // run stops the command with its mark, and the program's interruption lands beside it once the scope has closed.
  test("of a command, as its scope releases what it holds while whoever runs the run interrupts it, is a defect in the command", async () => {
    const exit = await Effect.runPromise(Effect.gen(function*() {
      const began = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      const program: Program<
        { state: Count; model: Model; message: Message; command: Command; commandServices: Scope.Scope }
      > = {
        ...counter,
        init: { state: { count: 0 }, commands: ["Ping"] },
        runCommand: Effect.fnUntraced(function*() {
          const self = yield* Effect.fiber
          yield* Effect.addFinalizer(() =>
            Effect.forkDetach(Fiber.interrupt(self), { startImmediately: true }).pipe(
              Effect.andThen(Deferred.succeed(began, undefined)),
              Effect.andThen(Deferred.await(gate))
            )
          )
          return Opt.some<Message>("Increment")
        })
      }
      const fiber = yield* Effect.forkChild(start(program).run)
      yield* Deferred.await(began)
      yield* Effect.forkChild(Fiber.interrupt(fiber), { startImmediately: true })
      yield* Deferred.succeed(gate, undefined)
      return yield* Fiber.await(fiber)
    }))
    expect(site(exit)).toBe("command")
  })
})

describe("what a run that goes on keeps", () => {
  // A row by id, which counts.
  type Row = Readonly<{ count: number }>

  type Bump = Readonly<{ _tag: "Bump" }>

  const row: Program<{ state: Row; model: Readonly<{ count: number; bump: Bump }>; message: Bump }> = {
    init: { state: { count: 0 } },
    update: () => (state) => ({ state: { count: state.count + 1 } }),
    subscriptions: () => [],
    makeModel: ({ count }) => ({ count, bump: { _tag: "Bump" } })
  }

  // Each round sends its own messages, each a new object: `Tick` replaces the state, `Save` runs a command that
  // answers `Saved`, `Show` and `Hide` bring a key and take it away, `Listen` starts a subscription that ends with
  // `Ended`, and `Add` and `Remove` bring a row by id and take it away.
  type Own = Readonly<{
    _tag: "Tick" | "Save" | "Saved" | "Show" | "Hide" | "Listen" | "Ended" | "Add" | "Remove"
    round: number
  }>

  type Save = Readonly<{ _tag: "Save"; round: number; payload: object }>

  type Rounds = Readonly<{
    round: number
    payload: object
    showing: boolean
    listening: boolean
    rows: ReadonlyArray<number>
  }>

  // What a round listens to: `Show` brings a subscription that holds, `Listen` one that ends with `Ended`.
  type Listened = Data.TaggedEnum<{ Showing: { readonly round: number }; Ending: { readonly round: number } }>

  const Listened = Data.taggedEnum<Listened>()

  /** What a round uses, each part held by `WeakRef`s alone. */
  const parts = [
    "message",
    "state",
    "applied",
    "model",
    "listener",
    "command",
    "commandFiber",
    "commandAcquired",
    "subscription",
    "subscriptionFiber",
    "subscriptionAcquired",
    "endingFiber",
    "endingAcquired",
    "childState",
    "childModel",
    "childDispatch"
  ] as const

  type Part = typeof parts[number]

  // A run of the program that plays the rounds, forked, and the round to play: `hold` is given each part a round uses.
  const playing = (hold: (part: Part, target: object) => void) => {
    // What a round waits for, by name, before it goes on: names, never the objects of a round. The round resumes on
    // the stack of whoever signals, inside a step, where what it sends would wait for that step: so it yields first.
    let expected: Readonly<{ name: string; done: Deferred.Deferred<void> }> | undefined
    const signal = (name: string) => {
      if (expected?.name === name) Deferred.doneUnsafe(expected.done, Exit.void)
    }
    const until = (name: string, act: () => void) =>
      Effect.suspend(() => {
        const done = Deferred.makeUnsafe<void>()
        expected = { name, done }
        act()
        return Effect.andThen(Deferred.await(done), Effect.yieldNow)
      })
    const holding = Effect.acquireRelease(
      Effect.sync(() => {
        const acquired = {}
        signal("acquired")
        return acquired
      }),
      () => Effect.sync(() => signal("released"))
    )
    const { childById, withChildren } = program<{ state: Rounds; message: Own; command: Save; key: Listened }>()
    const rounds = withChildren({ Rows: childById(row, { ids: (state) => state.rows }) }).make({
      init: { state: { round: -1, payload: {}, showing: false, listening: false, rows: [] } },
      update: ({ _tag, round }) => (state) => {
        switch (_tag) {
          case "Tick":
            return { state: { ...state, round, payload: {} } }
          case "Save":
            return { state, commands: [{ _tag: "Save", round, payload: {} }] }
          case "Saved":
            return { state }
          case "Show":
            return { state: { ...state, showing: true } }
          case "Hide":
            return { state: { ...state, showing: false } }
          case "Listen":
            return { state: { ...state, listening: true } }
          case "Ended":
            return { state: { ...state, listening: false } }
          case "Add":
            return { state: { ...state, rows: [round] } }
          case "Remove":
            return { state: { ...state, rows: [] } }
        }
      },
      runCommand: (command) =>
        Effect.withFiber((fiber) => {
          hold("command", command)
          hold("commandFiber", fiber)
          return Effect.map(holding, (acquired): Opt.Option<Own> => {
            hold("commandAcquired", acquired)
            return Opt.some({ _tag: "Saved", round: command.round })
          })
        }),
      subscriptions: (state) =>
        Array.from([
          ...(state.showing ? [Listened.Showing({ round: state.round })] : []),
          ...(state.listening ? [Listened.Ending({ round: state.round })] : [])
        ]),
      listen: (key): Subscription<Own> => {
        if (key._tag === "Ending") {
          return Channel.unwrap(Effect.withFiber((fiber) => {
            hold("endingFiber", fiber)
            return Effect.map(holding, (acquired) => {
              hold("endingAcquired", acquired)
              return Channel.end<Own>({ _tag: "Ended", round: key.round })
            })
          }))
        }
        const showing = Channel.unwrap(Effect.withFiber((fiber) => {
          hold("subscriptionFiber", fiber)
          return Effect.map(holding, (acquired) => {
            hold("subscriptionAcquired", acquired)
            return Channel.never
          })
        }))
        hold("subscription", showing)
        return showing
      },
      makeModel: (state, children) => ({
        round: state.round,
        rows: state.rows.map((id) => children.Rows(id))
      })
    })
    const { app, run } = start(rounds, {
      onApplied: (applied) => {
        hold("applied", applied)
        hold("message", applied.message)
        hold("state", applied.before)
        // A row starts in the state of its `init`, one object for every row: the state a round makes is its row's
        // after a message of the row's own.
        const [entry] = HashMap.values(applied.after.children.Rows)
        if (applied.message._tag === "Rows" && entry !== undefined) hold("childState", entry.state)
        signal(applied.message._tag)
      }
    })
    const fiber = Effect.runFork(run)
    // Each round in a function of its own, whose frame is gone when collecting: a collector that scans the stack
    // conservatively could take a stale slot there for a live reference.
    const playRound = Effect.fnUntraced(function*(round: number) {
      const listener = () => undefined
      hold("listener", listener)
      const stop = app.subscribe(listener)
      app.dispatch({ _tag: "Tick", round })
      stop()
      hold("model", app.model())
      yield* until("Saved", () => app.dispatch({ _tag: "Save", round }))
      yield* until("acquired", () => app.dispatch({ _tag: "Show", round }))
      yield* until("released", () => app.dispatch({ _tag: "Hide", round }))
      yield* until("Ended", () => app.dispatch({ _tag: "Listen", round }))
      app.dispatch({ _tag: "Add", round })
      const dispatch = forwardTo(app.dispatch, "Rows", round)
      hold("childDispatch", dispatch)
      dispatch({ _tag: "Bump" })
      const [model] = app.model().rows
      if (model !== undefined) hold("childModel", model)
      app.dispatch({ _tag: "Remove", round })
    })
    return { fiber, playRound }
  }

  test("of what a thousand rounds used, a collection leaves a few at most while the run goes on", async () => {
    const held = new Map<Part, Array<WeakRef<object>>>(parts.map((part) => [part, []]))
    const { fiber, playRound } = playing((part, target) => {
      held.get(part)?.push(new WeakRef(target))
    })
    for (let round = 0; round < 1_000; round++) await Effect.runPromise(playRound(round))
    const left = () =>
      parts.flatMap((part) => {
        const count = (held.get(part) ?? []).filter((ref) => ref.deref() !== undefined).length
        return count > 10 ? [[part, count] as const] : []
      })
    // A WeakRef keeps its target until the current job ends: a macrotask, unlike a microtask, ends it. A collection
    // can still find a few in register or stack slots, which JavaScriptCore scans conservatively: of a thousand, a run
    // that kept them would keep all.
    for (let collection = 0; collection < 10 && left().length > 0; collection++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      collectGarbage()
    }
    expect(fiber.pollUnsafe()).toBeUndefined()
    expect(left()).toEqual([])
    expect(parts.filter((part) => (held.get(part) ?? []).length < 1_000)).toEqual([])
    expect(wheres(await interrupted(fiber))).toEqual([])
  })

  test(
    "past two thousand rounds, four thousand more grow the objects of a run that goes on by less than 100 kB",
    async () => {
      const { fiber, playRound } = playing(() => undefined)
      let round = 0
      // A collection every fifty rounds. The table of a `WeakMap` (Effect's cache of hashes, the instances of a
      // parent's children) grows to hold what it held at most between two collections, the dead entries with the live
      // ones, and no collection shrinks it. When V8 collects depends on how fast the machine runs: left to itself, on a
      // machine slowed down, it let a table double past round two thousand, by 131 kB.
      const playTo = async (last: number) => {
        for (; round < last; round++) {
          await Effect.runPromise(playRound(round))
          if (round % 50 === 0) collectGarbage()
        }
      }
      // The least of a few reads, each after a macrotask and a collection: what a read finds that is gone at the next
      // is no part of what the run keeps.
      const heap = async () => {
        let least = Infinity
        for (let read = 0; read < 5; read++) {
          await new Promise((resolve) => setTimeout(resolve, 0))
          collectGarbage()
          least = Math.min(least, objectHeap())
        }
        return least
      }
      await playTo(2_000)
      const before = await heap()
      await playTo(6_000)
      // Measured on 23 November 2026: the objects grew by 43 to 46 kB on Bun, and by 10 to 27 kB on Node, with V8's
      // compilation delayed or not (`--concurrent-recompilation-delay=50`, as a loaded machine delays it). With one
      // entry of a `Map` from a number to a number kept by the engine for each command, they grew by 529 to 538 kB on
      // Bun and by 198 kB on Node: a `Map` grows by doubling its table, and from 2,000 entries to 6,000 it doubles at
      // least once.
      expect(await heap() - before).toBeLessThan(100_000)
      expect(fiber.pollUnsafe()).toBeUndefined()
      expect(wheres(await interrupted(fiber))).toEqual([])
    },
    // A hundred and twenty collections, which a slow machine does in more than the five seconds of a test.
    20_000
  )
})
