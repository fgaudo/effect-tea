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
import { type App, run } from "./run.ts"
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
    const seen = await Effect.runPromise(Effect.gen(function*() {
      const seen: Array<unknown> = []
      yield* run(counter, (app) =>
        Effect.sync(() => {
          seen.push(app.model().count)
          app.dispatch("Increment")
          seen.push(app.model().count)
          const before = app.model()
          app.dispatch("Forbidden")
          seen.push(app.model() === before)
        }))
      return seen
    }))
    expect(seen).toEqual([0, 1, true])
  })

  test("a model is made only when read, once for each state", async () => {
    const outcome = await Effect.runPromise(Effect.gen(function*() {
      const made: Array<number> = []
      let same = false
      yield* run(
        { ...counter, makeModel: ({ count }) => (made.push(count), { count }) },
        (app) =>
          Effect.sync(() => {
            app.dispatch("Increment")
            app.dispatch("Increment")
            const first = app.model()
            const second = app.model()
            app.dispatch("Same")
            same = first === second && second === app.model()
          })
      )
      return { made, same }
    }))
    expect(outcome).toEqual({ made: [2], same: true })
  })

  test("a listener is told of each new state, and a model read in it is of the latest state", async () => {
    const told = await Effect.runPromise(Effect.gen(function*() {
      const told: Array<number> = []
      yield* run(
        counter,
        Effect.fnUntraced(function*(app: App<Model, Message>) {
          const answered = yield* Deferred.make<void>()
          app.subscribe(() => {
            told.push(app.model().count)
            if (app.model().count === 2) Deferred.doneUnsafe(answered, Exit.void)
          })
          app.dispatch("Increment")
          app.dispatch("Same")
          app.dispatch("Forbidden")
          // Its answer, `Increment`, applied in the command's fiber.
          app.dispatch("Ping")
          yield* Deferred.await(answered)
        })
      )
      return told
    }))
    expect(told).toEqual([1, 2])
  })

  test("a dispatch from a plain callback after the run has ended applies nothing, and throws nothing", async () => {
    const outcome = await Effect.runPromise(Effect.gen(function*() {
      let kept: App<Model, Message> | undefined
      yield* run(counter, (app) =>
        Effect.sync(() => {
          kept = app
        }))
      if (kept === undefined) return undefined
      const app = kept
      const thrown = thrownBy(() => app.dispatch("Increment"))
      return { count: app.model().count, thrown }
    }))
    expect(outcome).toEqual({ count: 0, thrown: undefined })
  })

  test("the run ends when the renderer ends", async () => {
    const exit = await Effect.runPromiseExit(run(counter, () => Effect.void))
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  test("a message the renderer sends as the run releases it does not reach update", async () => {
    const calls = { n: 0 }
    const exit = await interruptedOnce((started) =>
      run(
        {
          ...counter,
          update: (message) => (state) => {
            calls.n += 1
            return counter.update(message)(state)
          }
        },
        (app) =>
          Effect.acquireRelease(Effect.void, () => Effect.sync(() => app.dispatch("Increment"))).pipe(
            Effect.andThen(Deferred.succeed(started, undefined)),
            Effect.andThen(Effect.never)
          )
      )
    )
    expect(calls.n).toBe(0)
    expect(wheres(exit)).toEqual([])
  })
})

// A model's defect is recorded where the model is read, in `'render'`, once for each state, and the reader gets that
// very defect: the renderer's own site takes it as it is, so that a renderer that reads the model is one defect,
// wherever it reads it.
describe("a model's defect", () => {
  const throwing: Counter = {
    ...counter,
    makeModel: ({ count }) => {
      if (count === 1) throw "makeModel threw"
      return { count }
    }
  }

  test("a model read outside any fiber is recorded in render, and the reader gets the defect recorded", async () => {
    const outcome = await Effect.runPromise(Effect.gen(function*() {
      const ready = yield* Deferred.make<App<Model, Message>>()
      const read = yield* Deferred.make<unknown>()
      const exit = yield* Effect.exit(
        run(throwing, (app) => Deferred.succeed(ready, app).pipe(Effect.andThen(Effect.never))).pipe(
          Effect.raceFirst(
            Deferred.await(ready).pipe(
              // Outside any fiber of the run, as a renderer's callback reads it: a timer's.
              Effect.flatMap((app) =>
                Effect.sync(() =>
                  setTimeout(() => {
                    app.dispatch("Increment")
                    Deferred.doneUnsafe(read, Effect.succeed(thrownBy(() => app.model())))
                  }, 0)
                )
              ),
              Effect.andThen(Effect.never)
            )
          )
        )
      )
      return { thrown: yield* Deferred.await(read), exit }
    }))
    expect(wheres(outcome.exit)).toEqual(["render: makeModel threw"])
    expect(defectsOf(outcome.exit)[0]).toBe(outcome.thrown)
  })

  test("a model read in the renderer's fiber is one defect, in render", async () => {
    const exit = await Effect.runPromiseExit(run(throwing, (app) =>
      Effect.sync(() => {
        app.dispatch("Increment")
        app.model()
      })))
    expect(wheres(exit)).toEqual(["render: makeModel threw"])
  })

  // Where nothing interrupts the renderer, it dies of what it read whenever the end of the run begins: the end may
  // begin as the defect is recorded, on the reader's stack, and interrupt the renderer before it dies otherwise.
  test("a model read as the renderer acquires what it draws on is one defect, in render", async () => {
    const exit = await Effect.runPromiseExit(run(throwing, (app) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          app.dispatch("Increment")
          return app.model()
        }),
        () => Effect.void
      ).pipe(Effect.andThen(Effect.never))))
    expect(wheres(exit)).toEqual(["render: makeModel threw"])
  })

  test("a second read of the same state throws the same defect, recorded once", async () => {
    const outcome = await Effect.runPromise(Effect.gen(function*() {
      let reads: ReadonlyArray<unknown> = []
      const exit = yield* Effect.exit(run(throwing, (app) =>
        Effect.sync(() => {
          app.dispatch("Increment")
          reads = [thrownBy(() => app.model()), thrownBy(() => app.model())]
        }).pipe(Effect.andThen(Effect.never))))
      return { reads, exit }
    }))
    expect(wheres(outcome.exit)).toEqual(["render: makeModel threw"])
    expect(outcome.reads).toEqual([defectsOf(outcome.exit)[0], defectsOf(outcome.exit)[0]])
  })

  test("a listener that reads a model that throws, and throws it, is one defect, in render", async () => {
    const exit = await Effect.runPromiseExit(run(throwing, (app) =>
      Effect.sync(() => {
        app.subscribe(() => void app.model())
        app.dispatch("Increment")
      }).pipe(Effect.andThen(Effect.never))))
    expect(wheres(exit)).toEqual(["render: makeModel threw"])
  })

  test("a renderer whose release reads a model that throws is one defect, in render", async () => {
    const exit = await interruptedOnce((started) =>
      run(throwing, (app) =>
        Effect.acquireRelease(Effect.void, () => Effect.sync(() => app.model())).pipe(
          Effect.andThen(Effect.sync(() => app.dispatch("Increment"))),
          Effect.andThen(Deferred.succeed(started, undefined)),
          Effect.andThen(Effect.never)
        ))
    )
    expect(wheres(exit)).toEqual(["render: makeModel threw"])
  })
})

describe("defects the handle meets", () => {
  test("a listener that throws on a command's answer dies in render, and the command ends as it should", async () => {
    const exit = await Effect.runPromiseExit(run(counter, (app) =>
      Effect.sync(() => {
        app.subscribe(() => {
          if (app.model().count === 1) throw "listener threw"
        })
        app.dispatch("Ping")
      }).pipe(Effect.andThen(Effect.never))))
    expect(wheres(exit)).toEqual(["render: listener threw"])
  })

  test("a defect of update in a dispatch is never thrown to the caller, and the run dies of it in update", async () => {
    const outcome = await Effect.runPromise(Effect.gen(function*() {
      let thrown: unknown
      const exit = yield* Effect.exit(run(
        {
          ...counter,
          update: () => () => {
            throw "update threw"
          }
        },
        (app) =>
          Effect.sync(() => {
            thrown = thrownBy(() => app.dispatch("Increment"))
          }).pipe(Effect.andThen(Effect.never))
      ))
      return { thrown, wheres: wheres(exit) }
    }))
    expect(outcome).toEqual({ thrown: undefined, wheres: ["update: update threw"] })
  })

  test("an init that throws on its flags dies in init", async () => {
    const seeded: Program<{ state: Count; model: Model; message: Message; command: Command; flags: number }> = {
      ...counter,
      init: () => {
        throw "init threw"
      }
    }
    const exit = await Effect.runPromiseExit(run(seeded, () => Effect.never, { flags: 5 }))
    expect(wheres(exit)).toEqual(["init: init threw"])
  })

  test("a renderer that throws before it returns its effect dies in render", async () => {
    const exit = await Effect.runPromiseExit(run(counter, () => {
      throw "renderer threw"
    }))
    expect(wheres(exit)).toEqual(["render: renderer threw"])
  })

  test("a renderer that interrupts itself is a defect in render", async () => {
    const exit = await Effect.runPromiseExit(run(counter, () => Effect.interrupt))
    expect(wheres(exit)).toEqual(["render: Error: It was interrupted by the program, which only the run may do"])
  })

  test("a command that interrupts itself is a defect in the command", async () => {
    const exit = await Effect.runPromiseExit(run(
      { ...counter, runCommand: () => Effect.interrupt },
      (app) => Effect.sync(() => app.dispatch("Ping")).pipe(Effect.andThen(Effect.never))
    ))
    expect(wheres(exit)).toEqual(["command: Error: It was interrupted by the program, which only the run may do"])
  })

  // `update` runs where its message was sent, so the fiber it could reach there (`Fiber.getCurrent`) is the command's,
  // the subscription's or the renderer's: the run cannot tell its interruption from one by the command, the
  // subscription or the renderer itself.
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
      const exit = await Effect.runPromiseExit(run(
        interrupting,
        (app) => Effect.sync(() => app.dispatch("Ping")).pipe(Effect.andThen(Effect.never))
      ))
      expect(wheres(exit)).toEqual(["command: Error: It was interrupted by the program, which only the run may do"])
    })

    test("the subscription whose message it hears", async () => {
      const exit = await Effect.runPromiseExit(run(
        {
          ...interrupting,
          subscriptions: () =>
            HashMap.make(["k", Channel.succeed<Message>("Increment").pipe(Channel.concatWith(() => Channel.never))])
        },
        () => Effect.never
      ))
      expect(wheres(exit)).toEqual([
        "subscription: Error: It was interrupted by the program, which only the run may do"
      ])
    })

    test("the renderer whose dispatch it hears", async () => {
      const exit = await Effect.runPromiseExit(run(
        interrupting,
        (app) => Effect.sync(() => app.dispatch("Increment")).pipe(Effect.andThen(Effect.never))
      ))
      expect(wheres(exit)).toEqual(["render: Error: It was interrupted by the program, which only the run may do"])
    })
  })

  // The end stops every fiber of the run with its mark: none of them takes it for an interruption by the program.
  test("a run interrupted by whoever runs it is no defect", async () => {
    const exit = await interruptedOnce((started) =>
      run(
        {
          ...counter,
          init: { state: { count: 0 }, commands: ["Ping"] },
          runCommand: () => Effect.never,
          subscriptions: () => HashMap.make(["k", Channel.never])
        },
        () => Effect.andThen(Deferred.succeed(started, undefined), Effect.never)
      )
    )
    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
  })

  // However the run ends, it interrupts the renderer and awaits it: what the renderer dies of while it releases what it
  // holds joins the cause.
  test("a renderer that dies while an interrupted run releases it is in the cause", async () => {
    const exit = await interruptedOnce((started) =>
      run(counter, () =>
        Effect.acquireRelease(Effect.void, () => Effect.die("release threw")).pipe(
          Effect.andThen(Deferred.succeed(started, undefined)),
          Effect.andThen(Effect.never)
        ))
    )
    expect(wheres(exit)).toEqual(["render: release threw"])
  })
})

describe("scopes and spans", () => {
  test("what a subscription acquires is released when its key goes away, apart from the next message", async () => {
    type Listening = Readonly<{ listening: boolean; n: number }>
    const log = await Effect.runPromise(Effect.gen(function*() {
      const log: Array<string> = []
      const released = yield* Deferred.make<void>()
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
                  () =>
                    Effect.sync(() => log.push("release")).pipe(Effect.andThen(Deferred.succeed(released, undefined)))
                ).pipe(Effect.as(Channel.never))
              )
            ])
            : HashMap.empty(),
        makeModel: (state) => state
      }
      yield* run(
        listening,
        Effect.fnUntraced(function*(app: App<Listening, "On" | "Off" | "Up">) {
          app.dispatch("On")
          app.dispatch("Off")
          app.dispatch("Up")
          log.push(`applied ${app.model().n}`)
          yield* Deferred.await(released)
        })
      )
      return log
    }))
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
      runCommand: () =>
        Effect.logInfo("a command").pipe(
          Effect.andThen(Effect.orDie(Effect.currentSpan)),
          Effect.map((span) => parents.push(span.parent._tag === "Some" ? span.parent.value.spanId : "")),
          Effect.withSpan("Go"),
          Effect.andThen(Effect.succeedSome<"Next">("Next"))
        ),
      subscriptions: () =>
        HashMap.make([
          "logs",
          Channel.fromEffectDrain(
            Effect.forever(
              Effect.logInfo("a subscription").pipe(
                Effect.andThen(Effect.orDie(Effect.currentSpan)),
                Effect.map((span) => listening.push(span.parent._tag === "Some" ? span.parent.value.spanId : "")),
                Effect.withSpan("Listen"),
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
        yield* run(
          logging,
          (app) => Effect.logInfo("the renderer").pipe(Effect.andThen(reaching(app, (model) => model >= commands)))
        )
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

describe("run", () => {
  test("called inside an uninterruptible region, ends once its renderer returns", async () => {
    const counts = await Effect.runPromise(Effect.gen(function*() {
      const counts: Array<number> = []
      yield* Effect.uninterruptible(run(
        counter,
        Effect.fnUntraced(function*(app: App<Model, Message>) {
          counts.push(app.model().count)
          app.dispatch("Increment")
          // Its answer, `Increment`, comes from the command's fiber.
          app.dispatch("Ping")
          yield* reaching(app, ({ count }) => count === 2)
          counts.push(app.model().count)
        })
      ))
      return counts
    }))
    expect(counts).toEqual([0, 2])
  })

  test("a message that update rejects is ignored, and the program goes on", async () => {
    const counts: Array<number> = []
    const exit = await Effect.runPromiseExit(run(counter, (app) =>
      Effect.sync(() => {
        counts.push(app.model().count)
        // A buggy view: it sends a message that `update` does not accept, then increments.
        app.dispatch("Forbidden")
        app.dispatch("Increment")
        counts.push(app.model().count)
      })))
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(counts).toEqual([0, 1])
  })

  test("a program with flags starts from the flags it is given, its commands included", async () => {
    const seeded: Program<{ state: Count; model: Model; message: Message; command: Command; flags: number }> = {
      ...counter,
      init: (count) => ({ state: { count }, commands: ["Ping"] })
    }
    const counts: Array<number> = []
    await Effect.runPromise(run(
      seeded,
      (app) =>
        Effect.sync(() => counts.push(app.model().count)).pipe(
          Effect.andThen(reaching(app, ({ count }) => count === 6)),
          Effect.andThen(Effect.sync(() => counts.push(app.model().count)))
        ),
      { flags: 5 }
    ))
    // The answer of `Ping` may be applied before the renderer first reads the model.
    expect(counts.at(-1)).toBe(6)
    // @ts-expect-error: it has nothing to start from.
    expect(() => run(seeded, () => Effect.void)).toBeDefined()
    // @ts-expect-error: it starts without flags.
    expect(() => run(counter, () => Effect.void, { flags: 5 })).toBeDefined()
  })

  test("a program written as a plain object needs a runCommand only for commands it has", async () => {
    const plain = {
      init: { state: { count: 0 } },
      update: () => ({ count }: Count) => ({ state: { count: count + 1 } }),
      subscriptions: () => HashMap.empty(),
      makeModel: ({ count }: Count) => count
    }
    const counts: Array<number> = []
    await Effect.runPromise(run(plain, (app) => Effect.sync(() => counts.push(app.model()))))
    expect(counts).toEqual([0])
    const pinging = { ...plain, update: () => (state: Count) => ({ state, commands: ["Ping" as const] }) }
    // @ts-expect-error: its `Ping` would go uninterpreted.
    expect(() => run(pinging, () => Effect.void)).toBeDefined()
  })

  test("what a command and the renderer acquire is theirs: no scope to provide, released after they stop", async () => {
    const log: Array<string> = []
    const note = (line: string) => Effect.sync(() => void log.push(line))
    const resource = (name: string) => Effect.acquireRelease(note(`acquire ${name}`), () => note(`release ${name}`))
    const holding = Deferred.makeUnsafe<void>()
    const drawing = Deferred.makeUnsafe<void>()
    const program: Program<
      { state: object; model: null; message: never; command: "Hold"; commandServices: Scope.Scope }
    > = {
      init: { state: {}, commands: ["Hold"] },
      update: () => (state) => ({ state }),
      runCommand: () =>
        resource("command").pipe(
          Effect.andThen(Deferred.succeed(holding, undefined)),
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => note("command interrupted"))
        ),
      subscriptions: () => HashMap.empty(),
      makeModel: () => null
    }
    const running: Effect.Effect<void> = run(
      program,
      () =>
        resource("renderer").pipe(
          Effect.andThen(Deferred.succeed(drawing, undefined)),
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => note("renderer interrupted"))
        )
    )
    await Effect.runPromise(Effect.gen(function*() {
      const fiber = yield* Effect.forkChild(running)
      yield* Deferred.await(holding)
      yield* Deferred.await(drawing)
      yield* Fiber.interrupt(fiber)
    }))
    for (const name of ["command", "renderer"]) {
      expect(log.indexOf(`${name} interrupted`)).toBeGreaterThan(log.indexOf(`acquire ${name}`))
      expect(log.indexOf(`release ${name}`)).toBeGreaterThan(log.indexOf(`${name} interrupted`))
    }
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
    let last: ReadonlyArray<string> = []
    await Effect.runPromise(run(
      program,
      Effect.fnUntraced(function*(app: App<Heard, "Slow" | "Fast">) {
        yield* reaching(app, ({ heard }) => heard.length === 1)
        yield* Deferred.succeed(slow, undefined)
        yield* reaching(app, ({ heard }) => heard.length === 2)
        last = app.model().heard
      })
    ))
    expect(last).toEqual(["Fast", "Slow"])
  })
})

describe("defects", () => {
  class Boom extends Error {}
  const boom = (): never => {
    throw new Boom()
  }

  /**
   * Runs `program`, whose renderer draws the model with `view`, sends `Increment` and draws the model again, with
   * debug logs enabled, and tells where the run says its defect happened, if it died with the one thrown, and what it
   * logged.
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
    const exit = await Effect.runPromiseExit(
      run(
        program,
        Effect.fnUntraced(function*(app: App<Model, Message>) {
          view(app.model())
          app.dispatch("Increment")
          view(app.model())
          return yield* Effect.never
        }),
        options
      ).pipe(
        Effect.provideService(References.MinimumLogLevel, "Debug"),
        Effect.provide(Logger.layer([everything]))
      )
    )
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

  const sendsIncrement = (app: App<Model, Message>) =>
    Effect.sync(() => app.dispatch("Increment")).pipe(Effect.andThen(Effect.never))

  // A command and the renderer that interrupt themselves are under "defects the handle meets".
  test.each<[string, DefectSite, () => Effect.Effect<void>]>([
    [
      "a command that joins an interrupted fiber",
      "command",
      () => run({ ...counter, init: pinging, runCommand: () => joinsAnInterruptedFiber }, () => Effect.never)
    ],
    [
      "a subscription",
      "subscription",
      () =>
        run(
          { ...counter, subscriptions: () => HashMap.make(["k", Channel.fromEffectDone(Effect.interrupt)]) },
          () => Effect.never
        )
    ]
  ])("%s that interrupts itself is a defect, where it happened", async (_, where, running) => {
    const outcome = await Effect.runPromiseExit(running())
    const defect = Exit.isFailure(outcome) ? Cause.squash(outcome.cause) : undefined
    expect(defect instanceof ProgramDefect && [defect.where, defect.cause instanceof Error]).toEqual([where, true])
  })

  test("a command that fails without a defect, which its type rules out, is a defect in the command", async () => {
    const outcome = await Effect.runPromiseExit(
      run({ ...counter, init: pinging, runCommand: () => Effect.failCause(Cause.empty) }, () => Effect.never)
    )
    const defect = Exit.isFailure(outcome) ? Cause.squash(outcome.cause) : undefined
    expect(defect instanceof ProgramDefect && [defect.where, defect.cause instanceof Error]).toEqual(["command", true])
  })

  test("a defect in update says which message it was given, by its tags, in its message too", async () => {
    const exit = await Effect.runPromiseExit(run(
      { ...counter, update: (message) => message === "Increment" ? boom : () => reject },
      sendsIncrement
    ))
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(defect instanceof ProgramDefect && [defect.on, defect.message]).toEqual([
      "Increment",
      "A defect in update on Increment"
    ])
  })

  test("defect in update dies in update, on its message, with the InvariantDefect as its cause", async () => {
    const exit = await Effect.runPromiseExit(run(
      { ...counter, update: () => () => defect("An increment cannot arrive") },
      sendsIncrement
    ))
    const thrown = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(
      thrown instanceof ProgramDefect && thrown.cause instanceof InvariantDefect
        && [thrown.where, thrown.on, thrown.cause.reason]
    ).toEqual(["update", "Increment", "An increment cannot arrive"])
  })

  test("a defect in a subscription carries its key", async () => {
    const exit = await Effect.runPromiseExit(run(
      { ...counter, subscriptions: () => HashMap.make(["k", Channel.die(new Boom())]) },
      () => Effect.never
    ))
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
    const exit = await Effect.runPromiseExit(run(
      { ...counter, subscriptions: () => HashMap.make([new Key(), Channel.never]) },
      sendsIncrement
    ))
    const defects = Exit.isFailure(exit) ? exit.cause.reasons.filter(Cause.isDieReason).map(({ defect }) => defect) : []
    expect(defects.map((defect) => defect instanceof ProgramDefect ? [defect.where, defect.cause] : defect)).toEqual([
      ["subscriptions", new Boom()]
    ])
  })

  test("every defect of the cause is kept, each with where it happened", async () => {
    const exit = await Effect.runPromiseExit(run(
      { ...counter, init: pinging, runCommand: () => Effect.die(new Boom()).pipe(Effect.ensuring(Effect.die("also"))) },
      () => Effect.never
    ))
    const defects = Exit.isFailure(exit) ? exit.cause.reasons.filter(Cause.isDieReason).map(({ defect }) => defect) : []
    expect(defects.map((defect) => defect instanceof ProgramDefect && [defect.where, defect.cause])).toEqual([
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
    const defects = Exit.isFailure(exit) ? exit.cause.reasons.filter(Cause.isDieReason).map(({ defect }) => defect) : []
    return defects.map((defect) => defect instanceof ProgramDefect ? [defect.where, defect.cause] : defect)
  }

  test("a Logger that throws on what a command logs is a defect in the command", async () => {
    const logging = run(
      { ...counter, init: pinging, runCommand: () => Effect.logDebug("Pinging").pipe(Effect.as(Opt.none())) },
      () => Effect.never
    )
    expect(await diesOnLog("Pinging", logging)).toEqual([["command", new Boom()]])
  })
})

describe("onApplied", () => {
  test("hears every accepted message in order, with the states around it, before the dispatch returns", async () => {
    const heard: Array<Applied<Count, Message, Command>> = []
    const counts: Array<number> = []
    await Effect.runPromise(run(
      counter,
      (app) =>
        Effect.sync(() => {
          app.dispatch("Increment")
          counts.push(heard.length)
          app.dispatch("Increment")
          counts.push(heard.length)
        }),
      { onApplied: (applied) => void heard.push(applied) }
    ))
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
    await Effect.runPromise(run(
      pinging,
      (app) =>
        reaching(app, ({ count }) => count === 2).pipe(
          Effect.andThen(Effect.sync(() => app.dispatch("Increment")))
        ),
      { onApplied: ({ origin }) => void origins.push(origin) }
    ))
    expect(origins).toHaveLength(3)
    expect(origins).toContainEqual({ _tag: "Dispatch" })
    expect(origins).toContainEqual({ _tag: "Command" })
    expect(origins).toContainEqual({ _tag: "Subscription", key: "k" })
  })

  test("a message that leaves the very same state is heard too, with an unchanged revision", async () => {
    const heard = await Effect.runPromise(Effect.gen(function*() {
      const applied = yield* Deferred.make<Applied<Count, Message, Command>>()
      const still: Counter = {
        ...counter,
        init: { state: { count: 0 }, commands: ["Ping"] },
        update: () => (state) => ({ state })
      }
      yield* run(still, () => Effect.asVoid(Deferred.await(applied)), {
        onApplied: (message) => void Deferred.doneUnsafe(applied, Exit.succeed(message))
      })
      return yield* Deferred.await(applied)
    }))
    expect(heard).toEqual({
      message: "Increment",
      origin: { _tag: "Command" },
      before: { count: 0 },
      after: { count: 0 },
      revision: 0,
      commands: []
    })
  })

  test("hears the commands each message started, as update returned them", async () => {
    const heard = await Effect.runPromise(Effect.gen(function*() {
      const applied: Array<Applied<Count, Message, Command>> = []
      const two = yield* Deferred.make<ReadonlyArray<Applied<Count, Message, Command>>>()
      // The first increment pings again, so a second one follows.
      const pinging: Counter = {
        ...counter,
        init: { state: { count: 0 }, commands: ["Ping"] },
        update: () => ({ count }) => ({ state: { count: count + 1 }, commands: count === 0 ? ["Ping"] : [] })
      }
      yield* run(pinging, () => Effect.asVoid(Deferred.await(two)), {
        onApplied: (step) => {
          applied.push(step)
          if (applied.length === 2) Deferred.doneUnsafe(two, Exit.succeed(applied))
        }
      })
      return yield* Deferred.await(two)
    }))
    expect(heard.map((step) => step.commands)).toEqual([["Ping"], []])
  })
})

describe("onIgnored", () => {
  test("hears every message update rejects, with where it came from and the state it did not apply in", async () => {
    const ignored: Array<Ignored<Count, Message>> = []
    const applied: Array<Message> = []
    const both = Deferred.makeUnsafe<void>()
    await Effect.runPromise(run(
      {
        ...counter,
        init: { state: { count: 0 }, commands: ["Ping"] },
        runCommand: () => Effect.succeedSome<Message>("Forbidden")
      },
      (app) => Effect.sync(() => app.dispatch("Forbidden")).pipe(Effect.andThen(Deferred.await(both))),
      {
        onApplied: ({ message }) => void applied.push(message),
        onIgnored: (each) => {
          ignored.push(each)
          if (ignored.length === 2) Deferred.doneUnsafe(both, Exit.void)
        }
      }
    ))
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
      let after = -1
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
      yield* run(
        watch,
        Effect.fnUntraced(function*(app: App<Watch, WatchMessage>) {
          app.dispatch("Hold")
          yield* Deferred.await(holding)
          app.dispatch("Stop")
          yield* Queue.offer(source, "Tick")
          yield* Deferred.await(sent)
          after = app.model().ticks
        })
      )
      return after
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

  // Reads the model, and ends once what dies holds.
  const drawsOnce = (holding: Deferred.Deferred<void>) => (app: App<Model, Message>) =>
    Effect.sync(() => app.model()).pipe(Effect.andThen(Deferred.await(holding)))

  // `FiberMap` and `FiberSet` discard the exits of the fibers they interrupt as they close: left to them, such a
  // defect would be lost, and the run would succeed.
  test("a subscription that dies as the end of the run releases it ends the run with it", async () => {
    const holding = Deferred.makeUnsafe<void>()
    const exit = await Effect.runPromiseExit(
      run(
        { ...counter, subscriptions: () => HashMap.make(["k", Channel.fromEffectDone(dying(holding))]) },
        drawsOnce(holding)
      )
    )
    expect(where(exit)).toBe("subscription")
  })

  test("a command that dies as the end of the run interrupts it ends the run with it", async () => {
    const holding = Deferred.makeUnsafe<void>()
    const exit = await Effect.runPromiseExit(
      run(
        { ...counter, init: { state: { count: 0 }, commands: ["Ping"] }, runCommand: () => dying(holding) },
        drawsOnce(holding)
      )
    )
    expect(where(exit)).toBe("command")
  })

  test("a subscription that dies while an interrupted run releases it is in the cause", async () => {
    const exit = await Effect.runPromise(Effect.gen(function*() {
      const holding = yield* Deferred.make<void>()
      const program: Counter = {
        ...counter,
        subscriptions: () => HashMap.make(["k", Channel.fromEffectDone(dying(holding))])
      }
      const running = yield* Effect.forkChild(run(program, () => Effect.never))
      yield* Deferred.await(holding)
      yield* Fiber.interrupt(running)
      return yield* Fiber.await(running)
    }))
    expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
  })

  test("a renderer that dies while it releases what it holds ends the run with that defect", async () => {
    const exit = await Effect.runPromiseExit(
      run(
        counter,
        (app) =>
          Effect.acquireRelease(Effect.void, () => Effect.die("boom")).pipe(
            Effect.andThen(Effect.sync(() => app.model()))
          )
      )
    )
    expect(where(exit)).toBe("render")
  })

  // A command and a subscription a job of the fiber of effects starts are fibers of their own: the end stops the
  // fiber of effects first, and then releases the renderer before them.
  describe("releases the renderer before what a step started, still running", () => {
    const released: Array<string> = []
    const holdsTill = (holding: Deferred.Deferred<void>, what: string) =>
      Effect.acquireRelease(Deferred.succeed(holding, undefined), () => Effect.sync(() => released.push(what))).pipe(
        Effect.andThen(Effect.never)
      )
    // Sends one `Increment`, then holds what it acquired until the run ends.
    const rendering = (app: App<Model, Message>) =>
      Effect.acquireRelease(Effect.void, () => Effect.sync(() => released.push("renderer"))).pipe(
        Effect.andThen(Effect.sync(() => app.dispatch("Increment"))),
        Effect.andThen(Effect.never)
      )
    const endOnce = Effect.fnUntraced(function*(program: Counter, holding: Deferred.Deferred<void>) {
      const running = yield* Effect.forkChild(run(program, rendering))
      yield* Deferred.await(holding)
      yield* Fiber.interrupt(running)
    })

    test("a command", async () => {
      released.length = 0
      await Effect.runPromise(Effect.gen(function*() {
        const holding = yield* Deferred.make<void>()
        const program: Counter = {
          ...counter,
          update: () => ({ count }) => ({ state: { count: count + 1 }, commands: ["Ping"] }),
          runCommand: () => Effect.scoped(holdsTill(holding, "command"))
        }
        yield* endOnce(program, holding)
      }))
      expect(released).toEqual(["renderer", "command"])
    })

    test("a subscription", async () => {
      released.length = 0
      await Effect.runPromise(Effect.gen(function*() {
        const holding = yield* Deferred.make<void>()
        const program: Counter = {
          ...counter,
          subscriptions: ({ count }) =>
            count === 0
              ? HashMap.empty()
              : HashMap.make(["k", Channel.fromEffectDone(Effect.scoped(holdsTill(holding, "subscription")))])
        }
        yield* endOnce(program, holding)
      }))
      expect(released).toEqual(["renderer", "subscription"])
    })
  })

  // A renderer whose release dies, once it is interrupted: it tells by `started` that it holds what it releases.
  const holdsWhatDies = (started: Deferred.Deferred<void>) =>
    Effect.acquireRelease(Effect.void, () => Effect.die("boom")).pipe(
      Effect.andThen(Deferred.succeed(started, undefined)),
      Effect.andThen(Effect.never)
    )

  const sites = (exit: Exit.Exit<unknown>) =>
    Exit.isFailure(exit)
      ? exit.cause.reasons.filter(Cause.isDieReason).map(({ defect }) =>
        defect instanceof ProgramDefect ? defect.where : defect
      )
      : []

  // The renderer whose release dies as the interrupted run releases it is under "defects the handle meets".
  test("an interrupted run whose renderer dies as it releases has the defect first, then the interruption", async () => {
    const exit = await interruptedOnce((started) => run(counter, () => holdsWhatDies(started)))
    expect(Exit.isFailure(exit) ? exit.cause.reasons.map(({ _tag }) => _tag) : []).toEqual(["Die", "Interrupt"])
  })

  test("a renderer that dies as a run that died elsewhere releases it is in the cause", async () => {
    const exit = await Effect.runPromiseExit(run(
      { ...counter, update: () => () => defect("update") },
      (app) =>
        Effect.acquireRelease(Effect.void, () => Effect.die("boom")).pipe(
          Effect.andThen(Effect.sync(() => app.dispatch("Increment"))),
          Effect.andThen(Effect.never)
        )
    ))
    expect(sites(exit)).toEqual(["update", "render"])
  })

  // What the renderer reads as it releases what it holds, once the run has died, is the model of the latest state.
  test("a model the renderer reads as a run that died releases it is the model of the state before the defect", async () => {
    const read: Array<number> = []
    let made = 0
    const exit = await Effect.runPromiseExit(run(
      {
        ...counter,
        update: () => () => defect("update"),
        makeModel: (state) => {
          made++
          return counter.makeModel(state)
        }
      },
      (app) =>
        Effect.sync(() => app.model()).pipe(
          Effect.andThen(Effect.addFinalizer(() => Effect.sync(() => read.push(app.model().count)))),
          Effect.andThen(Effect.sync(() => app.dispatch("Increment"))),
          Effect.andThen(Effect.never)
        )
    ))
    expect([sites(exit), made, read]).toEqual([["update"], 1, [0]])
  })

  test("a makeModel that dies as a run that died releases the renderer is the second defect, in render", async () => {
    const exit = await Effect.runPromiseExit(run(
      {
        ...counter,
        update: () => () => defect("update"),
        makeModel: () => {
          throw new Error("boom")
        }
      },
      // The model is first read as the renderer releases what it holds.
      (app) =>
        Effect.addFinalizer(() => Effect.sync(() => app.model())).pipe(
          Effect.andThen(Effect.sync(() => app.dispatch("Increment"))),
          Effect.andThen(Effect.never)
        )
    ))
    expect(sites(exit)).toEqual(["update", "render"])
  })

  // A fiber that dies as the renderer releases what it holds, a step later than the release.
  const diesAfterTheRenderer = (renderEnded: Deferred.Deferred<void>) =>
    Deferred.await(renderEnded).pipe(Effect.andThen(Effect.yieldNow), Effect.andThen(Effect.die("late")))

  const endsAndTells = (renderEnded: Deferred.Deferred<void>) => () =>
    Effect.addFinalizer(() => Deferred.succeed(renderEnded, undefined)).pipe(Effect.andThen(Effect.sleep("5 millis")))

  // Once the renderer has ended of itself, the end of the run interrupts the fibers still in its `FiberSet` and
  // `FiberMap`, and awaits one that dies while it cannot be interrupted. Left interruptible, such a fiber is interrupted
  // before its step, and never dies.
  test("a command that dies once the renderer has ended ends the run with it", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const renderEnded = yield* Deferred.make<void>()
      yield* run(
        {
          ...counter,
          init: { state: { count: 0 }, commands: ["Ping"] },
          runCommand: () => Effect.uninterruptible(diesAfterTheRenderer(renderEnded))
        },
        endsAndTells(renderEnded)
      )
    }))
    expect(sites(exit)).toEqual(["command"])
  })

  test("a subscription that dies once the renderer has ended ends the run with it", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const renderEnded = yield* Deferred.make<void>()
      yield* run(
        {
          ...counter,
          subscriptions: () =>
            HashMap.make(["k", Channel.fromEffectDone(Effect.uninterruptible(diesAfterTheRenderer(renderEnded)))])
        },
        endsAndTells(renderEnded)
      )
    }))
    expect(sites(exit)).toEqual(["subscription"])
  })

  // Interrupted by whoever runs it, the run's end interrupts the renderer and the engine's fibers in one close.
  test("a command that dies once the renderer of an interrupted run has ended ends the run with it", async () => {
    const exit = await interruptedOnce((started) =>
      Effect.gen(function*() {
        const renderEnded = yield* Deferred.make<void>()
        yield* run(
          {
            ...counter,
            init: { state: { count: 0 }, commands: ["Ping"] },
            runCommand: () => Effect.uninterruptible(diesAfterTheRenderer(renderEnded))
          },
          () =>
            Effect.addFinalizer(() => Deferred.succeed(renderEnded, undefined)).pipe(
              Effect.andThen(Deferred.succeed(started, undefined)),
              Effect.andThen(Effect.never)
            )
        )
      })
    )
    expect(sites(exit)).toEqual(["command"])
  })

  // A renderer's release that tells when it has begun, by `releasing`, and lasts until `died`; and what dies of itself
  // once it has, while the renderer of a run that has ended releases what it holds, and tells by `died` that it has
  // ended. No clock: a run interrupted before its renderer started would outrun one, and a slow death would outlast
  // one.
  const releasesAndTells = (releasing: Deferred.Deferred<void>, died: Deferred.Deferred<void>) =>
    Effect.acquireRelease(
      Effect.void,
      () => Deferred.succeed(releasing, undefined).pipe(Effect.andThen(Deferred.await(died)))
    )

  const diesWhileReleased = (releasing: Deferred.Deferred<void>, died: Deferred.Deferred<void>) =>
    Deferred.await(releasing).pipe(
      Effect.andThen(Effect.die("late")),
      Effect.ensuring(Deferred.succeed(died, undefined))
    )

  test("a command that dies while an interrupted run releases the renderer ends the run with it", async () => {
    const releasing = Deferred.makeUnsafe<void>()
    const died = Deferred.makeUnsafe<void>()
    const exit = await interruptedOnce((started) =>
      run(
        {
          ...counter,
          init: { state: { count: 0 }, commands: ["Ping"] },
          runCommand: () => diesWhileReleased(releasing, died)
        },
        () =>
          releasesAndTells(releasing, died).pipe(
            Effect.andThen(Deferred.succeed(started, undefined)),
            Effect.andThen(Effect.never)
          )
      )
    )
    expect(sites(exit)).toEqual(["command"])
  })

  test("a subscription that dies while an interrupted run releases the renderer ends the run with it", async () => {
    const releasing = Deferred.makeUnsafe<void>()
    const died = Deferred.makeUnsafe<void>()
    const exit = await interruptedOnce((started) =>
      run(
        {
          ...counter,
          subscriptions: () => HashMap.make(["k", Channel.fromEffectDone(diesWhileReleased(releasing, died))])
        },
        () =>
          releasesAndTells(releasing, died).pipe(
            Effect.andThen(Deferred.succeed(started, undefined)),
            Effect.andThen(Effect.never)
          )
      )
    )
    expect(sites(exit)).toEqual(["subscription"])
  })

  test("a command that dies while a run that died elsewhere releases the renderer is in the cause", async () => {
    const releasing = Deferred.makeUnsafe<void>()
    const died = Deferred.makeUnsafe<void>()
    const exit = await Effect.runPromiseExit(run(
      {
        ...counter,
        init: { state: { count: 0 }, commands: ["Ping"] },
        update: () => () => defect("update"),
        runCommand: () => diesWhileReleased(releasing, died)
      },
      (app) =>
        releasesAndTells(releasing, died).pipe(
          Effect.andThen(Effect.sync(() => app.dispatch("Increment"))),
          Effect.andThen(Effect.never)
        )
    ))
    expect(sites(exit)).toEqual(["update", "command"])
  })

  test("a subscription that dies while a run that died elsewhere releases the renderer is in the cause", async () => {
    const releasing = Deferred.makeUnsafe<void>()
    const died = Deferred.makeUnsafe<void>()
    const exit = await Effect.runPromiseExit(run(
      {
        ...counter,
        update: () => () => defect("update"),
        subscriptions: () => HashMap.make(["k", Channel.fromEffectDone(diesWhileReleased(releasing, died))])
      },
      (app) =>
        releasesAndTells(releasing, died).pipe(
          Effect.andThen(Effect.sync(() => app.dispatch("Increment"))),
          Effect.andThen(Effect.never)
        )
    ))
    expect(sites(exit)).toEqual(["update", "subscription"])
  })

  // What a release dies of is a defect once the scope it is in has released all it holds: a subscription that ends
  // of itself, whose first finalizer dies while the next waits, applies the messages sent meanwhile.
  test("a subscription whose release dies applies messages until its scope has released all", async () => {
    const drawn: Array<number> = []
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const go = yield* Deferred.make<void>()
      yield* run(
        {
          ...counter,
          subscriptions: () =>
            HashMap.make([
              "a",
              Channel.unwrap(
                Effect.addFinalizer(() =>
                  Deferred.succeed(releasing, undefined).pipe(Effect.andThen(Deferred.await(go)))
                )
                  .pipe(
                    // Added last, so run first.
                    Effect.andThen(Effect.addFinalizer(() => Effect.die("release"))),
                    Effect.as(Channel.fromEffectDone(Effect.succeed<Message>("Forbidden")))
                  )
              )
            ])
        },
        Effect.fnUntraced(function*(app: App<Model, Message>) {
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

  // The renderer, and the run's own fiber as it starts the engine, record what they die of where the engine's fibers
  // do: a defect that happened later never comes first.
  test("a renderer that dies before a command is the first defect of the cause", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const rendererDied = yield* Deferred.make<void>()
      yield* run(
        {
          ...counter,
          init: { state: { count: 0 }, commands: ["Ping"] },
          runCommand: () => Deferred.await(rendererDied).pipe(Effect.andThen(Effect.die("late")))
        },
        () =>
          Effect.addFinalizer(() => Deferred.succeed(rendererDied, undefined)).pipe(
            Effect.andThen(Effect.yieldNow),
            Effect.andThen(Effect.die("boom"))
          )
      )
    }))
    expect(sites(exit)).toEqual(["render", "command"])
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
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const released = yield* Deferred.make<void>()
      yield* run(
        {
          ...counter,
          init: { state: { count: 0 }, commands: ["Boom", "Ping"] },
          runCommand: (command) =>
            command === "Boom"
              ? diesThenReleases(released)
              : diesOnceReleased(released)
        },
        () => Effect.never
      )
    }))
    expect(defects(exit)).toEqual(["first", "second"])
  })

  test("a subscription that dies before another, which its release lets die, is the first defect", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const released = yield* Deferred.make<void>()
      yield* run(
        {
          ...counter,
          subscriptions: () =>
            HashMap.make(
              ["a", Channel.fromEffectDone(diesThenReleases(released))],
              ["b", Channel.fromEffectDone(diesOnceReleased(released))]
            )
        },
        () => Effect.never
      )
    }))
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
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const released = yield* Deferred.make<void>()
      const dying = yield* Deferred.make<void>()
      yield* run(
        {
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
        },
        () => Effect.never
      )
    }))
    expect(defects(exit)).toEqual(["first", "second"])
  })

  test("a subscription dying in a scope of its channel lets no message apply as the channel releases", async () => {
    let applied = 0
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const heard = yield* Deferred.make<void>()
      yield* run(
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
        () => Effect.never,
        {
          onApplied: () => {
            applied += 1
            Deferred.doneUnsafe(heard, Exit.void)
          }
        }
      )
    }))
    expect([sites(exit), applied]).toEqual([["subscription"], 0])
  })

  // What a command, a subscription or the renderer wraps around its own code (`Effect.ensuring`, an `Effect.scoped` of
  // its own) is part of its effect, which ends with the defect only once that has run: until then the defect is the
  // program's, which may still catch it, and messages apply as they do while the effect runs. Here `a` releases slowly
  // around its defect, and `b` sends once the release has begun. A subscription's channel may wrap the release around
  // it too (`Channel.onExit`, `Channel.acquireUseRelease`), which closes a scope of the channel's own as its pull
  // fails, before the defect leaves it.
  const behindItsOwnRelease = Effect.fnUntraced(function*(
    where: "command" | "subscription" | "render",
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
    const exit = yield* Effect.exit(run(
      {
        ...counter,
        init: { state: { count: 0 }, commands: where === "command" ? ["Boom"] : [] },
        runCommand: () => dies,
        subscriptions: () =>
          where === "subscription"
            ? HashMap.make(["a", channel(release)], ["b", b])
            : HashMap.make(["b", b])
      },
      () => where === "render" ? dies : Effect.never,
      {
        onApplied: () => {
          applied += 1
          Deferred.doneUnsafe(heard, Exit.void)
        }
      }
    ))
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

  test("a renderer that dies under a release of its own dies once it has released, applying messages meanwhile", async () => {
    expect(await Effect.runPromise(behindItsOwnRelease("render"))).toEqual([["render"], 1])
  })

  // Dies inside a scope of its own, which it catches around: the run never learns of the defect.
  const caught = <A>(recovered: A) =>
    Effect.scoped(Effect.addFinalizer(() => Effect.yieldNow).pipe(Effect.andThen(Effect.die("boom")))).pipe(
      Effect.catchCause(() => Effect.succeed(recovered))
    )

  const counted = (app: App<Model, Message>) => reaching(app, ({ count }) => count === 1)

  test("a command that catches the defect of a scope of its own answers, and the run goes on", async () => {
    const exit = await Effect.runPromiseExit(run(
      {
        ...counter,
        init: { state: { count: 0 }, commands: ["Boom"] },
        runCommand: () => caught(Opt.some<Message>("Increment"))
      },
      counted
    ))
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  test("a subscription that catches the defect of a scope of its own ends with its message, and the run goes on", async () => {
    const exit = await Effect.runPromiseExit(run(
      { ...counter, subscriptions: () => HashMap.make(["a", Channel.fromEffectDone(caught<Message>("Increment"))]) },
      counted
    ))
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  test("a renderer that catches the defect of a scope of its own draws on, and the run goes on", async () => {
    const exit = await Effect.runPromiseExit(run(counter, (app) =>
      caught(undefined).pipe(
        Effect.andThen(Effect.sync(() => app.dispatch("Increment"))),
        Effect.andThen(counted(app))
      )))
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  test("a command that dies as the run starts comes before what a subscription dies of as the end releases it", async () => {
    const exit = await Effect.runPromiseExit(
      run(
        {
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
        },
        () => Effect.never
      )
    )
    expect(sites(exit)).toEqual(["command", "subscription"])
  })

  // The fiber of effects stops a key that went away with `stopping`, and the fiber stays in the map until it has ended:
  // the end of the run, which interrupts the fiber of effects while it waits there, still finds the fiber, and awaits
  // its release.
  test("a subscription stopped as whoever runs the run interrupts it, which dies as it releases, is in the cause", async () => {
    const exit = await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const ending = yield* Deferred.make<void>()
      // Dies once the end of the run has begun, which interrupts the renderer once it has stopped the engine.
      const releasesThenDies = Channel.unwrap(
        Effect.acquireRelease(Effect.void, () =>
          Deferred.succeed(releasing, undefined).pipe(
            Effect.andThen(Deferred.await(ending)),
            Effect.andThen(Effect.die("boom"))
          )).pipe(Effect.as(Channel.never))
      )
      const running = yield* Effect.forkChild(run(
        {
          ...counter,
          subscriptions: ({ count }) => count === 0 ? HashMap.make(["k", releasesThenDies]) : HashMap.empty()
        },
        (app) =>
          Effect.sync(() => app.dispatch("Increment")).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Deferred.succeed(ending, undefined))
          )
      ))
      yield* Deferred.await(releasing)
      yield* Fiber.interrupt(running)
      return yield* Fiber.await(running)
    }))
    expect(sites(exit)).toEqual(["subscription"])
  })

  // The end of the run interrupts the fibers it lists, and only those: a job that went on past it, while a release held
  // the fiber of effects, would start a command and a subscription that nothing awaits. The fiber of effects stops as it
  // waits for the release, so nothing starts; were anything to start, its defect would have to be in the cause.
  test("a step held by a release as the run is interrupted starts nothing the run does not await", async () => {
    let started = 0
    const exit = await Effect.runPromise(Effect.gen(function*() {
      const holding = yield* Deferred.make<void>()
      const startsAndDies = Effect.sync(() => {
        started += 1
      }).pipe(Effect.andThen(Effect.die("boom")))
      // Held until the end of the run, which stops the fiber of effects first, has reached the gate.
      const held = gate<Message>(Deferred.succeed(holding, undefined).pipe(Effect.andThen(untilInterrupted)))
      const running = yield* Effect.forkChild(run(
        {
          ...counter,
          update: () => ({ count }) => ({ state: { count: count + 1 }, commands: ["Boom"] }),
          runCommand: () => startsAndDies,
          subscriptions: ({ count }) =>
            count === 0
              ? HashMap.make(["gate", held])
              : count === 1
              ? HashMap.make(["k", Channel.fromEffectDone(startsAndDies)])
              : HashMap.empty()
        },
        (app) => Effect.sync(() => app.dispatch("Increment")).pipe(Effect.andThen(Effect.never))
      ))
      yield* Deferred.await(holding)
      yield* Fiber.interrupt(running)
      return yield* Fiber.await(running)
    }))
    expect(sites(exit).length).toBe(started)
  })

  // Takes the key of `k` away, then sends `Ping`, whose job comes after the stop of `k` has ended: the renderer ends
  // once the command of `Ping` has answered.
  const stopsThenEnds = (app: App<Model, Message>) =>
    Effect.sync(() => {
      app.dispatch("Increment")
      app.dispatch("Ping")
    }).pipe(Effect.andThen(reaching(app, ({ count }) => count === 2)))

  // An interruption by the run is told from one the program makes by whether the fiber was interrupted when the
  // effect ended: an uninterruptible region delays it, and it is still the run's. The region lasts until the stop of
  // its key has reached it.
  test("a subscription stopped inside an uninterruptible region is no defect", async () => {
    const busy = Effect.uninterruptible(untilInterrupted).pipe(Effect.andThen(Effect.never))
    const stopping: Counter = {
      ...counter,
      subscriptions: ({ count }) => count === 0 ? HashMap.make(["k", Channel.fromEffectDone(busy)]) : HashMap.empty()
    }
    const exit = await Effect.runPromiseExit(run(stopping, stopsThenEnds))
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
    const stopping: Counter = {
      ...counter,
      subscriptions: ({ count }) => count === 0 ? HashMap.make(["k", Channel.fromEffectDone(busy)]) : HashMap.empty()
    }
    const exit = await Effect.runPromiseExit(run(stopping, stopsThenEnds))
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

  // Takes the key of `k` away once it has started, then sends `Ping`, whose job comes after the stop of `k`: the
  // renderer ends once the command of `Ping` has answered, if the run has not died first.
  const stopsOnceStarted = (started: Deferred.Deferred<void>) => (app: App<Model, Message>) =>
    Deferred.await(started).pipe(
      Effect.andThen(Effect.sync(() => {
        app.dispatch("Increment")
        app.dispatch("Ping")
      })),
      Effect.andThen(reaching(app, ({ count }) => count === 2))
    )

  test(
    "a renderer that interrupts itself as whoever runs the run interrupts it is a defect in the renderer",
    async () => {
      const exit = await interruptedOnce((started) => run(counter, () => interruptsItselfOnceInterrupted(started)))
      expect(selfInterruptions(exit)).toEqual(["render: It was interrupted by the program, which only the run may do"])
    }
  )

  test(
    "a command that interrupts itself as whoever runs the run interrupts it is a defect in the command",
    async () => {
      const exit = await interruptedOnce((started) =>
        run(
          {
            ...counter,
            init: { state: { count: 0 }, commands: ["Ping"] },
            runCommand: () => interruptsItselfOnceInterrupted(started)
          },
          () => Effect.never
        )
      )
      expect(selfInterruptions(exit)).toEqual(["command: It was interrupted by the program, which only the run may do"])
    }
  )

  test("a subscription that interrupts itself as the run stops it is a defect in the subscription", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const stopping: Counter = {
        ...counter,
        subscriptions: ({ count }) =>
          count === 0
            ? HashMap.make(["k", Channel.fromEffectDone(interruptsItselfOnceInterrupted(started))])
            : HashMap.empty()
      }
      yield* run(stopping, stopsOnceStarted(started))
    }))
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
        const exit = await Effect.runPromiseExit(Effect.gen(function*() {
          const started = yield* Deferred.make<void>()
          const stopping: Counter = {
            ...counter,
            subscriptions: ({ count }) =>
              count === 0 ? HashMap.make(["k", Channel.fromEffectDone(joins(started))]) : HashMap.empty()
          }
          yield* run(stopping, stopsOnceStarted(started))
        }))
        expect(selfInterruptions(exit)).toEqual([
          "subscription: It was interrupted by the program, which only the run may do"
        ])
      }
    )
  }

  // The end of the run interrupts the renderer, the commands and the subscriptions as the fiber the run is in. A fiber
  // that very fiber interrupted before, which an effect of the program joins as the run ends, fails with an
  // interruption of the same fiber id but with no mark: it is not taken for the one the effect received, and is a
  // defect, as it is when joined in a run that goes on.
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
        run(
          {
            ...counter,
            init: { state: { count: 0 }, commands: ["Ping"] },
            runCommand: () => joinsOnceInterrupted(started, stale)
          },
          () => Effect.never
        )
      )
      expect(selfInterruptions(exit)).toEqual(["command: It was interrupted by the program, which only the run may do"])
    }
  )

  test(
    "a renderer that joins a fiber the fiber of the run interrupted, as the run ends, is a defect in the renderer",
    async () => {
      const exit = await endedByTheFiberThatInterrupted((started, stale) =>
        run(counter, () => joinsOnceInterrupted(started, stale))
      )
      expect(selfInterruptions(exit)).toEqual(["render: It was interrupted by the program, which only the run may do"])
    }
  )

  test(
    "a subscription that joins a fiber the fiber of the run interrupted, as the run ends, is a defect in the subscription",
    async () => {
      const exit = await endedByTheFiberThatInterrupted((started, stale) =>
        run(
          {
            ...counter,
            subscriptions: () => HashMap.make(["k", Channel.fromEffectDone(joinsOnceInterrupted(started, stale))])
          },
          () => Effect.never
        )
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
    const exit = await Effect.runPromiseExit(run(
      {
        ...counter,
        init: { state: { count: 0 }, commands: ["Boom"] },
        runCommand: () => Effect.addFinalizer(() => Effect.interrupt).pipe(Effect.andThen(Effect.die("boom")))
      },
      () => Effect.never
    ))
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
    const exit = await Effect.runPromiseExit(run(
      {
        ...counter,
        init: { state: { count: 0 }, commands: ["Ping"] },
        runCommand: () => releasesThatDie.pipe(Effect.andThen(Effect.die("own")))
      },
      () => Effect.never
    ))
    expect(sites(exit)).toEqual([["command", "own"], ["command", "Closing"], ["command", "Closing"]])
  })

  test("of a subscription the run stops are each a defect of the subscription", async () => {
    const exit = await Effect.runPromiseExit(run(
      {
        ...counter,
        subscriptions: ({ count }) =>
          count === 0
            ? HashMap.make(["k", Channel.unwrap(Effect.as(releasesThatDie, Channel.never))])
            : HashMap.empty()
      },
      (app) => Effect.sync(() => app.dispatch("Increment")).pipe(Effect.andThen(Effect.never))
    ))
    expect(sites(exit)).toEqual([["subscription", "Closing"], ["subscription", "Closing"]])
  })

  test("of a renderer that dies are each a defect of the renderer", async () => {
    const exit = await Effect.runPromiseExit(
      run(counter, () => releasesThatDie.pipe(Effect.andThen(Effect.die("own"))))
    )
    expect(sites(exit)).toEqual([["render", "own"], ["render", "Closing"], ["render", "Closing"]])
  })
})

// A fiber of the program's own that interrupts the fiber of the renderer is no interruption by the run, nor by whoever
// runs it: only those two interrupt it (guide, "Nothing ends in silence"), so the run dies in the renderer.
describe("an interruption made by another fiber of the program", () => {
  const site = (exit: Exit.Exit<unknown>) => {
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return defect instanceof ProgramDefect ? defect.where : typeof defect === "string" ? defect : exit._tag
  }

  // The interrupter is detached, so that nothing of the run interrupts it first.
  const interruptedByAFiberOfItsOwn = Effect.gen(function*() {
    const self = yield* Effect.fiber
    yield* Effect.forkDetach(Fiber.interrupt(self))
    return yield* Effect.never
  })

  // Bounds only the wait of a failing case, whose run applies nothing more and never ends.
  const ended = (running: Effect.Effect<void>) =>
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

  test("of the renderer is a defect in the renderer", async () => {
    expect(site(await ended(run(counter, () => interruptedByAFiberOfItsOwn)))).toBe("render")
  })

  test("of a command, as its scope releases what it holds, is a defect in the command", async () => {
    const answering = interruptedAsItReleases.pipe(Effect.as(Opt.some<Message>("Increment")))
    expect(
      site(
        await ended(run({
          ...counter,
          init: { state: { count: 0 }, commands: ["Ping"] },
          runCommand: () => answering
        }, () => Effect.never))
      )
    )
      .toBe("command")
  })

  test("of a subscription, as its scope releases what it holds, is a defect in the subscription", async () => {
    const ending = Channel.unwrap(
      Effect.as(interruptedAsItReleases, Channel.fromEffectDone(Effect.succeed<Message>("Increment")))
    )
    const listening: Counter = { ...counter, subscriptions: () => HashMap.make(["k", ending]) }
    expect(site(await ended(run(listening, () => Effect.never)))).toBe("subscription")
  })
})
