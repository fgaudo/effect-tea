// The tests of the run of `docs/records/synchronous-dispatch.md`, written beside `src/run.test.ts` until its stage 4.
import { describe, expect, test } from "bun:test"
import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as HashMap from "effect/HashMap"
import * as Logger from "effect/Logger"
import * as References from "effect/References"
import type * as Tracer from "effect/Tracer"
import { ProgramDefect } from "../defect.ts"
import type { Program } from "../program.ts"
import { reject } from "../update.ts"
import { type App, run } from "./run.ts"

type Message = "Increment" | "Forbidden" | "Same" | "Ping"

type Count = Readonly<{ count: number }>

type Model = Readonly<{ count: number }>

type Counter = Program<{ state: Count; model: Model; message: Message; command: "Ping" }>

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
  runCommand: () => Effect.succeedSome<Message>("Increment"),
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
      yield* run(counter, (app) =>
        Effect.gen(function*() {
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
        }))
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
    const seeded: Program<{ state: Count; model: Model; message: Message; command: "Ping"; flags: number }> = {
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

describe("scopes and logs", () => {
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
      yield* run(listening, (app) =>
        Effect.gen(function*() {
          app.dispatch("On")
          app.dispatch("Off")
          app.dispatch("Up")
          log.push(`applied ${app.model().n}`)
          yield* Deferred.await(released)
        }))
      return log
    }))
    // The next message is applied at once; the release follows in the fiber of effects, after the acquisition.
    expect(log).toEqual(["applied 1", "acquire", "release"])
  })

  test("what runs in a run logs nothing into the span of whoever runs it, which stays the parent of their spans", async () => {
    const parents: Array<string> = []
    const caller = await Effect.runPromise(
      Effect.gen(function*() {
        yield* run(
          {
            ...counter,
            runCommand: () =>
              Effect.logInfo("a command").pipe(
                Effect.andThen(Effect.orDie(Effect.currentSpan)),
                Effect.map((span) => parents.push(span.parent._tag === "Some" ? span.parent.value.spanId : "")),
                Effect.withSpan("Ping"),
                Effect.andThen(Effect.succeedSome<Message>("Increment"))
              )
          },
          (app) =>
            Effect.gen(function*() {
              const done = yield* Deferred.make<void>()
              app.subscribe(() => {
                if (app.model().count === 3) Deferred.doneUnsafe(done, Exit.void)
              })
              yield* Effect.logInfo("the renderer")
              app.dispatch("Ping")
              app.dispatch("Ping")
              app.dispatch("Ping")
              yield* Deferred.await(done)
            })
        )
        return yield* Effect.orDie(Effect.currentSpan)
      }).pipe(
        Effect.withSpan("caller"),
        Effect.provideService(References.MinimumLogLevel, "Debug"),
        Effect.provide(Logger.layer([Logger.tracerLogger]))
      )
    )
    expect((caller as Tracer.NativeSpan).events).toEqual([])
    expect(parents.length).toBe(3)
    expect(parents.every((parent) => parent === caller.spanId)).toBe(true)
  })

  test("a Logger that throws on the log of an accepted message is one defect, in the log, never in the dispatch", async () => {
    const outcome = await Effect.runPromise(Effect.gen(function*() {
      let thrown: unknown
      const exit = yield* Effect.exit(
        run(counter, (app) =>
          Effect.sync(() => {
            thrown = thrownBy(() => app.dispatch("Increment"))
          }).pipe(Effect.andThen(Effect.never))).pipe(
            Effect.provideService(References.MinimumLogLevel, "Debug"),
            Effect.provide(Logger.layer([Logger.make(({ message }) => {
              if (Array.isArray(message) && message[0] === "Message") throw "logger threw"
            })]))
          )
      )
      return { thrown, wheres: wheres(exit) }
    }))
    expect(outcome).toEqual({ thrown: undefined, wheres: ["log: logger threw"] })
  })
})
