import { describe, expect, test } from "bun:test"
import * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
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
import * as Logger from "effect/Logger"
import * as Opt from "effect/Option"
import * as Queue from "effect/Queue"
import * as References from "effect/References"
import type * as Scope from "effect/Scope"
import type * as Tracer from "effect/Tracer"
import { gate } from "../test/gate.test_helper.ts"
import { defect, type DefectSite, InvariantDefect, ProgramDefect } from "./defect.ts"
import type { Applied, Ignored, RunOptions } from "./engine.ts"
import type { Program } from "./program.ts"
import { type App, start } from "./run.ts"
import { reject, type Step } from "./update.ts"

// A counter: `Increment` counts, `Same` leaves the very same state, `Ping` starts the command `Ping`, which answers
// `Increment`, and `Forbidden` is always rejected. The command `Boom` dies, where a test starts it.
type Message = "Increment" | "Forbidden" | "Same" | "Ping"

type Command = "Ping" | "Boom"

type Count = Readonly<{ count: number }>

type Model = Readonly<{ count: number }>

type Counter = Program<{ state: Count; model: Model; message: Message; command: Command }>

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
  subscriptions: () => HashMap.empty(),
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
    const app = start(counter)
    const fiber = Effect.runFork(app.run)
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
    const app = start({ ...counter, makeModel: ({ count }) => (made.push(count), { count }) })
    const fiber = Effect.runFork(app.run)
    app.dispatch("Increment")
    app.dispatch("Increment")
    const first = app.model()
    const second = app.model()
    app.dispatch("Same")
    const same = first === second && second === app.model()
    await interrupted(fiber)
    expect({ made, same }).toEqual({ made: [2], same: true })
  })

  test("a listener is told of each new state, and a model read in it is of the latest state", async () => {
    const told: Array<number> = []
    const answered = Deferred.makeUnsafe<void>()
    const app = start(counter)
    app.subscribe(() => {
      told.push(app.model().count)
      if (app.model().count === 2) Deferred.doneUnsafe(answered, Exit.void)
    })
    const fiber = Effect.runFork(app.run)
    app.dispatch("Increment")
    app.dispatch("Same")
    app.dispatch("Forbidden")
    // Its answer, `Increment`, applied in the command's fiber.
    app.dispatch("Ping")
    expect(wheres(await endedAfter(fiber, Deferred.await(answered)))).toEqual([])
    expect(told).toEqual([1, 2])
  })

  test("a dispatch from a plain callback after the run has ended applies nothing, and throws nothing", async () => {
    const app = start(counter)
    await interrupted(Effect.runFork(app.run))
    const thrown = thrownBy(() => app.dispatch("Increment"))
    expect({ count: app.model().count, thrown }).toEqual({ count: 0, thrown: undefined })
  })

  test("a message a command sends as the run releases it does not reach update", async () => {
    const calls = { n: 0 }
    const holding = Deferred.makeUnsafe<void>()
    let send: (message: Message) => void = () => undefined
    const app = start({
      ...counter,
      init: { state: { count: 0 }, commands: ["Ping"] },
      update: (message) => (state) => {
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
    const exit = await endedAfter(Effect.runFork(app.run), Deferred.await(holding))
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
    const app = start(throwing)
    const fiber = Effect.runFork(app.run)
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
    const app = start(throwing)
    app.dispatch("Increment")
    const thrown = thrownBy(() => app.model())
    const exit = await Effect.runPromiseExit(app.run)
    expect(wheres(exit)).toEqual(["render: makeModel threw"])
    expect(defectsOf(exit)[0]).toBe(thrown)
  })

  // Before the run starts: once it has, its end may begin on the stack of the read that records the defect, and be over
  // before what follows the read.
  test("a second read of the same state throws the same defect, recorded once", async () => {
    const app = start(throwing)
    app.dispatch("Increment")
    const reads = [thrownBy(() => app.model()), thrownBy(() => app.model())]
    const exit = await Effect.runPromiseExit(app.run)
    expect(wheres(exit)).toEqual(["render: makeModel threw"])
    expect(reads.map((read) => read === defectsOf(exit)[0])).toEqual([true, true])
  })

  test("a listener that reads a model that throws, and throws it, is one defect, in render", async () => {
    const app = start(throwing)
    app.subscribe(() => void app.model())
    const fiber = Effect.runFork(app.run)
    app.dispatch("Increment")
    expect(wheres(await ended(fiber))).toEqual(["render: makeModel threw"])
  })

  // Before the run starts, as the second read above.
  test("a model's defect a renderer gives to die is one defect, in render", async () => {
    const app = start(throwing)
    app.dispatch("Increment")
    app.die(thrownBy(() => app.model()))
    expect(wheres(await Effect.runPromiseExit(app.run))).toEqual(["render: makeModel threw"])
  })

  test("a model's defect a renderer gives to die once the run has ended is thrown back as it is", async () => {
    const app = start(throwing)
    app.dispatch("Increment")
    await interrupted(Effect.runFork(app.run))
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
    const app = start(failing, { flags: 0 })
    app.die(thrownBy(() => app.model()))
    expect(wheres(await Effect.runPromiseExit(app.run))).toEqual(["init: init threw"])
  })

  test("once the run has ended, throws back what it is given, a defect in render that no cause holds", async () => {
    const app = start(counter)
    const exit = await interrupted(Effect.runFork(app.run))
    const thrown = thrownBy(() => app.die("drew too late"))
    expect({
      wheres: wheres(exit),
      thrown: thrown instanceof ProgramDefect ? `${thrown.where}: ${String(thrown.cause)}` : thrown
    }).toEqual({ wheres: [], thrown: "render: drew too late" })
  })

  test("before the run has ended, throws nothing, and the run dies of what it is given", async () => {
    const app = start(counter)
    const fiber = Effect.runFork(app.run)
    expect(thrownBy(() => app.die("drew"))).toBeUndefined()
    expect(wheres(await ended(fiber))).toEqual(["render: drew"])
  })
})

describe("defects the handle meets", () => {
  test("a listener that throws on a command's answer dies in render, and the command ends as it should", async () => {
    const app = start(counter)
    app.subscribe(() => {
      if (app.model().count === 1) throw "listener threw"
    })
    const fiber = Effect.runFork(app.run)
    app.dispatch("Ping")
    expect(wheres(await ended(fiber))).toEqual(["render: listener threw"])
  })

  test("a defect of update in a dispatch is never thrown to the caller, and the run dies of it in update", async () => {
    const app = start({
      ...counter,
      update: () => () => {
        throw "update threw"
      }
    })
    const fiber = Effect.runFork(app.run)
    const thrown = thrownBy(() => app.dispatch("Increment"))
    expect({ thrown, wheres: wheres(await ended(fiber)) }).toEqual({
      thrown: undefined,
      wheres: ["update: update threw"]
    })
  })

  test("what a renderer gives to die is a defect in render: the program applies nothing after, and its run dies of it", async () => {
    const app = start(counter)
    const fiber = Effect.runFork(app.run)
    app.die("draw threw")
    app.dispatch("Increment")
    expect(app.model().count).toBe(0)
    expect(wheres(await ended(fiber))).toEqual(["render: draw threw"])
  })

  test("a command that interrupts itself is a defect in the command", async () => {
    const app = start({ ...counter, runCommand: () => Effect.interrupt })
    const fiber = Effect.runFork(app.run)
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
      const app = start(interrupting)
      const fiber = Effect.runFork(app.run)
      app.dispatch("Ping")
      expect(wheres(await ended(fiber))).toEqual([
        "command: Error: It was interrupted by the program, which only the run may do"
      ])
    })

    test("the subscription whose message it hears", async () => {
      const exit = await Effect.runPromiseExit(
        start({
          ...interrupting,
          subscriptions: () =>
            HashMap.make(["k", Channel.succeed<Message>("Increment").pipe(Channel.concatWith(() => Channel.never))])
        }).run
      )
      expect(wheres(exit)).toEqual([
        "subscription: Error: It was interrupted by the program, which only the run may do"
      ])
    })
  })

  // The end stops every fiber of the run with its mark: none of them takes it for an interruption by the program.
  test("a run interrupted by whoever runs it is no defect", async () => {
    const commanded = Deferred.makeUnsafe<void>()
    const subscribed = Deferred.makeUnsafe<void>()
    const app = start({
      ...counter,
      init: { state: { count: 0 }, commands: ["Ping"] },
      runCommand: () => Effect.andThen(Deferred.succeed(commanded, undefined), Effect.never),
      subscriptions: () =>
        HashMap.make(["k", Channel.unwrap(Effect.as(Deferred.succeed(subscribed, undefined), Channel.never))])
    })
    const exit = await endedAfter(
      Effect.runFork(app.run),
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
    const listening: Program<{ state: Listening; model: Listening; message: "On" | "Off" | "Up" }> = {
      init: { state: { listening: false, n: 0 } },
      update: (message) => (state) =>
        message === "Up"
          ? { state: { ...state, n: state.n + 1 } }
          : { state: { ...state, listening: message === "On" } },
      subscriptions: ({ listening }) =>
        listening
          ? HashMap.make([
            "held",
            Channel.unwrap(
              Effect.acquireRelease(
                Effect.sync(() => log.push("acquire")),
                () => Effect.sync(() => log.push("release")).pipe(Effect.andThen(Deferred.succeed(released, undefined)))
              ).pipe(Effect.as(Channel.never))
            )
          ])
          : HashMap.empty(),
      makeModel: (state) => state
    }
    const app = start(listening)
    const fiber = Effect.runFork(app.run)
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
    const logging: Program<{ state: Count; model: number; message: "Next"; command: "Go" }> = {
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
      subscriptions: () =>
        HashMap.make([
          "logs",
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
          )
        ]),
      makeModel: ({ count }) => count
    }
    const caller = await Effect.runPromise(
      Effect.gen(function*() {
        const app = start(logging)
        yield* Effect.raceFirst(app.run, reaching(app, (model) => model >= commands))
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
    const app = start({ ...counter, subscriptions: () => HashMap.make(["k", Channel.never]) })
    const fiber = Effect.runFork(Effect.uninterruptible(app.run))
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
    const app = start(counter)
    const fiber = Effect.runFork(app.run)
    const counts = [app.model().count]
    // A buggy view: it sends a message that `update` does not accept, then increments.
    app.dispatch("Forbidden")
    app.dispatch("Increment")
    counts.push(app.model().count)
    const exit = await interrupted(fiber)
    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
    expect(counts).toEqual([0, 1])
  })

  test("a program with flags starts from the flags it is given, its commands included", async () => {
    const seeded: Program<{ state: Count; model: Model; message: Message; command: Command; flags: number }> = {
      ...counter,
      init: (count) => ({ state: { count }, commands: ["Ping"] })
    }
    const app = start(seeded, { flags: 5 })
    // The command of `init` waits for the run.
    const counts = [app.model().count]
    const exit = await endedAfter(Effect.runFork(app.run), reaching(app, ({ count }) => count === 6))
    counts.push(app.model().count)
    expect(wheres(exit)).toEqual([])
    expect(counts).toEqual([5, 6])
    // @ts-expect-error: it has nothing to start from.
    expect(() => start(seeded)).toBeDefined()
    // @ts-expect-error: it starts without flags.
    expect(() => start(counter, { flags: 5 })).toBeDefined()
  })

  test("a program written as a plain object needs a runCommand only for commands it has", async () => {
    const plain = {
      init: { state: { count: 0 } },
      update: () => ({ count }: Count) => ({ state: { count: count + 1 } }),
      subscriptions: () => HashMap.empty(),
      makeModel: ({ count }: Count) => count
    }
    const app = start(plain)
    expect(app.model()).toBe(0)
    expect(wheres(await interrupted(Effect.runFork(app.run)))).toEqual([])
    const pinging = { ...plain, update: () => (state: Count) => ({ state, commands: ["Ping" as const] }) }
    // @ts-expect-error: its `Ping` would go uninterpreted.
    expect(() => start(pinging)).toBeDefined()
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
      subscriptions: () => HashMap.empty(),
      makeModel: () => null
    }
    const running: Effect.Effect<never> = start(program).run
    await endedAfter(Effect.runFork(running), Deferred.await(holding))
    expect(log).toEqual(["acquire", "interrupted", "release"])
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
      subscriptions: () => HashMap.empty(),
      makeModel: (heard) => heard
    }
    const app = start(program)
    await Effect.runPromise(Effect.raceFirst(
      app.run,
      reaching(app, ({ heard }) => heard.length === 1).pipe(
        Effect.andThen(Deferred.succeed(slow, undefined)),
        Effect.andThen(reaching(app, ({ heard }) => heard.length === 2))
      )
    ))
    expect(app.model().heard).toEqual(["Fast", "Slow"])
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
  const failsWithBoom = async (
    program: Counter,
    { view = () => undefined, ...options }: Partial<RunOptions<Count, Message, Command>> & {
      view?: (model: Model) => void
    } = {}
  ) => {
    const logged: Array<unknown> = []
    const everything = Logger.make(({ message }) => {
      logged.push(message)
    })
    const app = start(program, options)
    app.subscribe(() => view(app.model()))
    const drawn = thrownBy(() => view(app.model()))
    if (drawn !== undefined) app.die(drawn)
    const fiber = Effect.runFork(app.run.pipe(
      Effect.provideService(References.MinimumLogLevel, "Debug"),
      Effect.provide(Logger.layer([everything]))
    ))
    app.dispatch("Increment")
    const exit = await ended(fiber)
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return defect instanceof ProgramDefect && defect.cause instanceof Boom
      ? { where: defect.where, logged }
      : { defect, logged }
  }

  const pinging = { state: { count: 0 }, commands: ["Ping"] } as const satisfies Step<Count, Command>

  // Whoever runs the program reports its defects: wherever one happens, the run dies with it and with where it
  // happened, and logs nothing about it.
  test.each<[string, DefectSite, () => ReturnType<typeof failsWithBoom>]>([
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
      () => failsWithBoom({ ...counter, subscriptions: ({ count }) => count === 1 ? boom() : HashMap.empty() })
    ],
    [
      "a subscription",
      "subscription",
      () => failsWithBoom({ ...counter, subscriptions: () => HashMap.make(["k", Channel.die(new Boom())]) })
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
          subscriptions: ({ count }) =>
            count === 0
              ? HashMap.make(["k", Channel.fromEffectDone(Effect.ensuring(Effect.never, Effect.sync(boom)))])
              : HashMap.empty()
        })
    ],
    ["onApplied", "onApplied", () => failsWithBoom(counter, { onApplied: boom })],
    ["onIgnored", "onIgnored", () => failsWithBoom({ ...counter, update: () => () => reject }, { onIgnored: boom })]
  ])("a defect in %s ends the run, which dies with it and with where it happened", async (_, where, outcome) => {
    expect(await outcome()).toEqual({ where, logged: [] })
  })

  // The fibers of a run ignore their interruptions: one that came from the program itself would otherwise leave
  // a command without its answer, or a subscription ended without its last message, and the run going on.
  const joinsAnInterruptedFiber = Effect.gen(function*() {
    const interrupted = yield* Effect.forkChild(Effect.never)
    yield* Fiber.interrupt(interrupted)
    return yield* Fiber.join(interrupted)
  })

  /** Starts `program`, sends it `Increment` once its run has started, and returns how the run ended. */
  const sentIncrement = (program: Counter) => {
    const app = start(program)
    const fiber = Effect.runFork(app.run)
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
      "a subscription",
      "subscription",
      () =>
        start({ ...counter, subscriptions: () => HashMap.make(["k", Channel.fromEffectDone(Effect.interrupt)]) }).run
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

  test("a defect in a subscription carries its key", async () => {
    const exit = await Effect.runPromiseExit(
      start({ ...counter, subscriptions: () => HashMap.make(["k", Channel.die(new Boom())]) }).run
    )
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(defect instanceof ProgramDefect && defect.key).toBe("k")
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
    const exit = await sentIncrement({ ...counter, subscriptions: () => HashMap.make([new Key(), Channel.never]) })
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
})

describe("onApplied", () => {
  test("hears every accepted message in order, with the states around it, before the dispatch returns", async () => {
    const heard: Array<Applied<Count, Message, Command>> = []
    const counts: Array<number> = []
    const app = start(counter, { onApplied: (applied) => void heard.push(applied) })
    const fiber = Effect.runFork(app.run)
    app.dispatch("Increment")
    counts.push(heard.length)
    app.dispatch("Increment")
    counts.push(heard.length)
    await interrupted(fiber)
    const origin = { _tag: "Dispatch" } as const
    expect(heard).toEqual([
      { message: "Increment", origin, before: { count: 0 }, after: { count: 1 }, revision: 1, commands: [] },
      { message: "Increment", origin, before: { count: 1 }, after: { count: 2 }, revision: 2, commands: [] }
    ])
    expect(counts).toEqual([1, 2])
  })

  test("says where each message came from: a dispatch, a command, or a subscription with its key", async () => {
    const origins: Array<unknown> = []
    const pinging: Counter = {
      ...counter,
      init: { state: { count: 0 }, commands: ["Ping"] },
      subscriptions: () =>
        HashMap.make(["k", Channel.succeed<Message>("Increment").pipe(Channel.concatWith(() => Channel.never))])
    }
    const app = start(pinging, { onApplied: ({ origin }) => void origins.push(origin) })
    await endedAfter(
      Effect.runFork(app.run),
      reaching(app, ({ count }) => count === 2).pipe(Effect.andThen(Effect.sync(() => app.dispatch("Increment"))))
    )
    expect(origins).toHaveLength(3)
    expect(origins).toContainEqual({ _tag: "Dispatch" })
    expect(origins).toContainEqual({ _tag: "Command" })
    expect(origins).toContainEqual({ _tag: "Subscription", key: "k" })
  })

  test("a message that leaves the very same state is heard too, with an unchanged revision", async () => {
    const applied = Deferred.makeUnsafe<Applied<Count, Message, Command>>()
    const still: Counter = {
      ...counter,
      init: { state: { count: 0 }, commands: ["Ping"] },
      update: () => (state) => ({ state })
    }
    const app = start(still, { onApplied: (message) => void Deferred.doneUnsafe(applied, Exit.succeed(message)) })
    await endedAfter(Effect.runFork(app.run), Deferred.await(applied))
    expect(await Effect.runPromise(Deferred.await(applied))).toEqual({
      message: "Increment",
      origin: { _tag: "Command" },
      before: { count: 0 },
      after: { count: 0 },
      revision: 0,
      commands: []
    })
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
    const app = start(pinging, {
      onApplied: (step) => {
        applied.push(step)
        if (applied.length === 2) Deferred.doneUnsafe(two, Exit.void)
      }
    })
    await endedAfter(Effect.runFork(app.run), Deferred.await(two))
    expect(applied.slice(0, 2).map((step) => step.commands)).toEqual([["Ping"], []])
  })
})

describe("onIgnored", () => {
  test("hears every message update rejects, with where it came from and the state it did not apply in", async () => {
    const ignored: Array<Ignored<Count, Message>> = []
    const applied: Array<Message> = []
    const both = Deferred.makeUnsafe<void>()
    const app = start(
      {
        ...counter,
        init: { state: { count: 0 }, commands: ["Ping"] },
        runCommand: () => Effect.succeedSome<Message>("Forbidden")
      },
      {
        onApplied: ({ message }) => void applied.push(message),
        onIgnored: (each) => {
          ignored.push(each)
          if (ignored.length === 2) Deferred.doneUnsafe(both, Exit.void)
        }
      }
    )
    const fiber = Effect.runFork(app.run)
    app.dispatch("Forbidden")
    await endedAfter(fiber, Deferred.await(both))
    expect(applied).toEqual([])
    expect(ignored).toHaveLength(2)
    expect(ignored).toContainEqual({ message: "Forbidden", origin: { _tag: "Dispatch" }, state: { count: 0 } })
    expect(ignored).toContainEqual({ message: "Forbidden", origin: { _tag: "Command" }, state: { count: 0 } })
  })
})

describe("subscriptions", () => {
  test("what a subscription sends once its key went away, before it is stopped, does not reach update", async () => {
    // A stopwatch: `Tick` counts in any state, so that only the run can keep a late one out; `Stop` drops the key of
    // the ticks. The fiber of effects, held in the job of `Hold` by the release of the gate, has not stopped the ticks
    // when `Stop` is applied and a tick is sent.
    type Watch = Readonly<{ gated: boolean; isRunning: boolean; ticks: number }>
    type WatchMessage = "Hold" | "Tick" | "Stop"
    const ticks = await Effect.runPromise(Effect.gen(function*() {
      const source = yield* Queue.unbounded<"Tick">()
      const holding = yield* Deferred.make<void>()
      const sent = yield* Deferred.make<void>()
      // The subscription asks for what follows the tick only once the tick has been applied: then `sent` completes.
      const ticking = Channel.unwrap(Effect.map(Queue.take(source), (tick) => Channel.succeed(tick))).pipe(
        Channel.concatWith(() => Channel.unwrap(Effect.as(Deferred.succeed(sent, undefined), Channel.never)))
      )
      const held = gate<WatchMessage>(Deferred.succeed(holding, undefined).pipe(Effect.andThen(Deferred.await(sent))))
      const watch: Program<{ state: Watch; model: Watch; message: WatchMessage }> = {
        init: { state: { gated: true, isRunning: true, ticks: 0 } },
        update: (message) => (state) =>
          message === "Tick"
            ? { state: { ...state, ticks: state.ticks + 1 } }
            : message === "Hold"
            ? { state: { ...state, gated: false } }
            : { state: { ...state, isRunning: false } },
        subscriptions: (state) =>
          state.gated && state.isRunning
            ? HashMap.make(["gate", held], ["ticks", ticking])
            : state.isRunning
            ? HashMap.make(["ticks", ticking])
            : HashMap.empty(),
        makeModel: (state) => state
      }
      const app = start(watch)
      return yield* Effect.raceFirst(
        app.run,
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
    expect(ticks).toBe(0)
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
    const app = start({ ...counter, subscriptions: () => HashMap.make(["k", Channel.fromEffectDone(dying(holding))]) })
    expect(where(await endedAfter(Effect.runFork(app.run), Deferred.await(holding)))).toBe("subscription")
  })

  test("a command that dies as the end of the run interrupts it ends the run with it", async () => {
    const holding = Deferred.makeUnsafe<void>()
    const app = start({
      ...counter,
      init: { state: { count: 0 }, commands: ["Ping"] },
      runCommand: () => dying(holding)
    })
    expect(where(await endedAfter(Effect.runFork(app.run), Deferred.await(holding)))).toBe("command")
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
    const app = start({ ...releaseDies(holding), update: () => () => defect("update") })
    const fiber = Effect.runFork(app.run)
    await Effect.runPromise(Effect.raceFirst(Effect.asVoid(Fiber.await(fiber)), Deferred.await(holding)))
    app.dispatch("Increment")
    expect(sites(await ended(fiber))).toEqual(["update", "command"])
  })

  // What is read once the run has died is the model of the latest state, the one already made.
  test("a model read once a run has died is the model of the state before the defect", async () => {
    let made = 0
    const app = start({
      ...counter,
      update: () => () => defect("update"),
      makeModel: (state) => {
        made++
        return counter.makeModel(state)
      }
    })
    const before = app.model()
    const fiber = Effect.runFork(app.run)
    app.dispatch("Increment")
    const exit = await ended(fiber)
    expect([sites(exit), made, app.model() === before, app.model().count]).toEqual([["update"], 1, true, 0])
  })

  test("a makeModel that dies as a run that died elsewhere stops a command is the second defect, in render", async () => {
    const holding = Deferred.makeUnsafe<void>()
    const reader: { app?: App<Model, Message> } = {}
    const app = start({
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
    const fiber = Effect.runFork(app.run)
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
    const app = start({
      ...counter,
      init: { state: { count: 0 }, commands: ["Ping"] },
      runCommand: () => diesOnceInterrupted(started)
    })
    expect(sites(await endedAfter(Effect.runFork(app.run), Deferred.await(started)))).toEqual(["command"])
  })

  test("a subscription that dies, uninterruptible, once an interrupted run has stopped it ends the run with it", async () => {
    const started = Deferred.makeUnsafe<void>()
    const app = start({
      ...counter,
      subscriptions: () => HashMap.make(["k", Channel.fromEffectDone(diesOnceInterrupted(started))])
    })
    expect(sites(await endedAfter(Effect.runFork(app.run), Deferred.await(started)))).toEqual(["subscription"])
  })

  // What a release dies of is a defect once the scope it is in has released all it holds: a subscription that ends
  // of itself, whose first finalizer dies while the next waits, applies the messages sent meanwhile.
  test("a subscription whose release dies applies messages until its scope has released all", async () => {
    const drawn: Array<number> = []
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const go = yield* Deferred.make<void>()
      const app = start({
        ...counter,
        subscriptions: () =>
          HashMap.make([
            "a",
            Channel.unwrap(
              Effect.addFinalizer(() => Deferred.succeed(releasing, undefined).pipe(Effect.andThen(Deferred.await(go))))
                .pipe(
                  // Added last, so run first.
                  Effect.andThen(Effect.addFinalizer(() => Effect.die("release"))),
                  Effect.as(Channel.fromEffectDone(Effect.succeed<Message>("Forbidden")))
                )
            )
          ])
      })
      return yield* Effect.raceFirst(
        app.run,
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
        subscriptions: () =>
          HashMap.make(
            ["a", Channel.fromEffectDone(diesThenReleases(released))],
            ["b", Channel.fromEffectDone(diesOnceReleased(released))]
          )
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
        subscriptions: () =>
          HashMap.make(
            ["a", diesInItsChannel(released, dying)],
            [
              "b",
              Channel.fromEffectDone(Effect.uninterruptible(
                Deferred.await(released).pipe(
                  Effect.andThen(Deferred.succeed(dying, undefined)),
                  Effect.andThen(Effect.die("second"))
                )
              ))
            ]
          )
      }).run
    )
    expect(defects(exit)).toEqual(["first", "second"])
  })

  test("a subscription dying in a scope of its channel lets no message apply as the channel releases", async () => {
    let applied = 0
    const releasing = Deferred.makeUnsafe<void>()
    const heard = Deferred.makeUnsafe<void>()
    const app = start(
      {
        ...counter,
        subscriptions: () =>
          HashMap.make(
            [
              "a",
              Channel.unwrap(
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
            ],
            [
              "b",
              Channel.fromEffect(Effect.as(Deferred.await(releasing), "Increment" as const)).pipe(
                Channel.concatWith(() => Channel.never)
              )
            ]
          )
      },
      {
        onApplied: () => {
          applied += 1
          Deferred.doneUnsafe(heard, Exit.void)
        }
      }
    )
    const exit = await Effect.runPromiseExit(app.run)
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
          subscriptions: () =>
            where === "subscription"
              ? HashMap.make(["a", channel(release)], ["b", b])
              : HashMap.make(["b", b])
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
  const counted = (program: Counter) =>
    Effect.runPromiseExit(Effect.suspend(() => {
      const app = start(program)
      return Effect.raceFirst(app.run, reaching(app, ({ count }) => count === 1))
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
      subscriptions: () => HashMap.make(["a", Channel.fromEffectDone(caught<Message>("Increment"))])
    })
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  test("a command that dies as the run starts comes before what a subscription dies of as the end releases it", async () => {
    const exit = await Effect.runPromiseExit(
      start({
        ...counter,
        init: { state: { count: 0 }, commands: ["Ping"] },
        runCommand: () => Effect.die("command"),
        subscriptions: () =>
          HashMap.make([
            "a",
            Channel.unwrap(
              Effect.acquireRelease(Effect.void, () => Effect.die("release")).pipe(Effect.as(Channel.never))
            )
          ])
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
    const app = start({
      ...counter,
      init: { state: { count: 0 }, commands: ["Ping"] },
      runCommand: () => Effect.never.pipe(Effect.onInterrupt(() => Deferred.succeed(ending, undefined))),
      subscriptions: ({ count }) => count === 0 ? HashMap.make(["k", releasesThenDies]) : HashMap.empty()
    })
    const fiber = Effect.runFork(app.run)
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
    const app = start({
      ...counter,
      update: () => ({ count }) => ({ state: { count: count + 1 }, commands: ["Boom"] }),
      runCommand: () => startsAndDies,
      subscriptions: ({ count }) =>
        count === 0
          ? HashMap.make(["gate", held])
          : count === 1
          ? HashMap.make(["k", Channel.fromEffectDone(startsAndDies)])
          : HashMap.empty()
    })
    const fiber = Effect.runFork(app.run)
    app.dispatch("Increment")
    const exit = await endedAfter(fiber, Deferred.await(holding))
    expect(sites(exit).length).toBe(started)
  })

  // Takes the key of `k` away, then sends `Ping`, whose job comes after the stop of `k` has ended, and runs the program
  // until the command of `Ping` has answered, unless the run dies first.
  const stopsThenEnds = (program: Counter) =>
    Effect.runPromiseExit(Effect.suspend(() => {
      const app = start(program)
      return Effect.raceFirst(
        app.run,
        Effect.sync(() => {
          app.dispatch("Increment")
          app.dispatch("Ping")
        }).pipe(Effect.andThen(reaching(app, ({ count }) => count === 2)))
      )
    }))

  // An interruption by the run is told from one the program makes by whether the fiber was interrupted when the
  // effect ended: an uninterruptible region delays it, and it is still the run's. The region lasts until the stop of
  // its key has reached it.
  test("a subscription stopped inside an uninterruptible region is no defect", async () => {
    const busy = Effect.uninterruptible(untilInterrupted).pipe(Effect.andThen(Effect.never))
    const exit = await stopsThenEnds({
      ...counter,
      subscriptions: ({ count }) => count === 0 ? HashMap.make(["k", Channel.fromEffectDone(busy)]) : HashMap.empty()
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
      subscriptions: ({ count }) => count === 0 ? HashMap.make(["k", Channel.fromEffectDone(busy)]) : HashMap.empty()
    })
    expect(Exit.isSuccess(exit)).toBe(true)
  })
})

// An effect that interrupts itself while the run is interrupting it ends with both interruptions in its cause, its
// own first: Effect adds the ones the fiber received, which skip its handlers. The run tells them apart by asking the
// fiber what it received, and its own is still a defect, as a defect in its place would be.
describe("a self-interruption as the run interrupts", () => {
  const interruptsItselfOnceInterrupted = (started: Deferred.Deferred<void>) =>
    Effect.uninterruptible(Effect.gen(function*() {
      yield* Deferred.succeed(started, undefined)
      yield* untilInterrupted
      const interrupted = yield* Effect.forkChild(Effect.never)
      yield* Fiber.interrupt(interrupted)
      return yield* Fiber.join(interrupted)
    }))

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
  const stopsOnceStarted = (started: Deferred.Deferred<void>, program: Counter) =>
    Effect.runPromiseExit(Effect.suspend(() => {
      const app = start(program)
      return Effect.raceFirst(
        app.run,
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
      subscriptions: ({ count }) =>
        count === 0
          ? HashMap.make(["k", Channel.fromEffectDone(interruptsItselfOnceInterrupted(started))])
          : HashMap.empty()
    })
    expect(selfInterruptions(exit)).toEqual([
      "subscription: It was interrupted by the program, which only the run may do"
    ])
  })

  // Every `FiberMap`, `FiberSet` and `FiberHandle` interrupts as the fiber -1: the interruption a subscription makes
  // itself, by joining a fiber that a map of its own interrupted, has no mark, and is not taken for the one the run
  // gives it as it stops it, which has one (`stopping`). The same join is a defect, as with no interruption by the
  // run.
  const joinsWhatItsMapInterrupted = (started: Deferred.Deferred<void>) =>
    Effect.uninterruptible(Effect.gen(function*() {
      const map = yield* FiberMap.make<string>()
      const work = yield* FiberMap.run(map, "work", Effect.never)
      yield* Deferred.succeed(started, undefined)
      yield* untilInterrupted
      yield* FiberMap.remove(map, "work")
      return yield* Fiber.join(work)
    })).pipe(Effect.scoped)

  // The same through a `FiberSet` and a `FiberHandle` of the subscription's: both interrupt as the fiber -1 too.
  const joinsWhatItsSetInterrupted = (started: Deferred.Deferred<void>) =>
    Effect.uninterruptible(Effect.gen(function*() {
      const set = yield* FiberSet.make()
      const work = yield* FiberSet.run(set, Effect.never)
      yield* Deferred.succeed(started, undefined)
      yield* untilInterrupted
      yield* FiberSet.clear(set)
      return yield* Fiber.join(work)
    })).pipe(Effect.scoped)

  const joinsWhatItsHandleInterrupted = (started: Deferred.Deferred<void>) =>
    Effect.uninterruptible(Effect.gen(function*() {
      const handle = yield* FiberHandle.make()
      const work = yield* FiberHandle.run(handle, Effect.never)
      yield* Deferred.succeed(started, undefined)
      yield* untilInterrupted
      yield* FiberHandle.clear(handle)
      return yield* Fiber.join(work)
    })).pipe(Effect.scoped)

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
          subscriptions: ({ count }) =>
            count === 0 ? HashMap.make(["k", Channel.fromEffectDone(joins(started))]) : HashMap.empty()
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
  const joinsOnceInterrupted = (started: Deferred.Deferred<void>, stale: Fiber.Fiber<never>) =>
    Effect.uninterruptible(Effect.gen(function*() {
      yield* Deferred.succeed(started, undefined)
      yield* untilInterrupted
      return yield* Fiber.join(stale)
    }))

  /** Runs what `running` gives in a fiber that interrupted `stale` itself, and interrupts that fiber once started. */
  const endedByTheFiberThatInterrupted = (
    running: (started: Deferred.Deferred<void>, stale: Fiber.Fiber<never>) => Effect.Effect<void>
  ) =>
    interruptedOnce((started) =>
      Effect.gen(function*() {
        const stale = yield* Effect.forkDetach(Effect.never)
        yield* Fiber.interrupt(stale)
        yield* running(started, stale)
      })
    )

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
          subscriptions: () => HashMap.make(["k", Channel.fromEffectDone(joinsOnceInterrupted(started, stale))])
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
  const joinsAsTheStopper = (started: Deferred.Deferred<void>) =>
    Effect.uninterruptible(Effect.gen(function*() {
      yield* Deferred.succeed(started, undefined)
      const [by] = yield* receivedFrom
      const stale = yield* Effect.forkDetach(Effect.never)
      yield* Fiber.interruptAs(stale, by!)
      return yield* Fiber.join(stale)
    }))

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
          subscriptions: () => HashMap.make(["k", Channel.fromEffectDone(joinsAsTheStopper(started))])
        }).run
      )
      expect(selfInterruptions(exit)).toEqual([
        "subscription: It was interrupted by the program, which only the run may do"
      ])
    }
  )
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
    const app = start({
      ...counter,
      subscriptions: ({ count }) =>
        count === 0
          ? HashMap.make(["k", Channel.unwrap(Effect.as(releasesThatDie, Channel.never))])
          : HashMap.empty()
    })
    const fiber = Effect.runFork(app.run)
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
    const listening: Counter = { ...counter, subscriptions: () => HashMap.make(["k", ending]) }
    expect(site(await endedWithin(start(listening).run))).toBe("subscription")
  })
})
