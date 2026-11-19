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
import * as Scheduler from "effect/Scheduler"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import type * as Tracer from "effect/Tracer"
import { defect, type DefectSite, InvariantDefect, ProgramDefect } from "./defect.ts"
import type { Dispatch } from "./dispatch.ts"
import type { Applied, Ignored, RunOptions } from "./engine.ts"
import type { Program } from "./program.ts"
import { type Frame, run } from "./run.ts"
import { reject, type Step, type Update } from "./update.ts"

// A counter that accepts `Increment` and always rejects `Forbidden`; its model has `Increment`, and an input
// that types either (a view that lets the user type `false` is buggy). Its commands only start where a test
// puts them: `Ping` answers `Increment`, `Boom` dies.
type Message = "Increment" | "Forbidden"

type Command = "Ping" | "Boom"

type Count = Readonly<{ count: number }>

const update: Update<Count, Message, Command> = (message) => ({ count }) =>
  message === "Increment" ? { state: { count: count + 1 } } : reject

type Model = Readonly<{
  count: number
  increment: Message
  type: (increments: boolean) => Message
}>

type Counter<M = Model> = Program<{ state: Count; model: M; message: Message; command: Command }>

const counter: Counter = {
  init: { state: { count: 0 } },
  update,
  runCommand: (command) => command === "Ping" ? Effect.succeedSome<Message>("Increment") : Effect.die("boom"),
  subscriptions: () => HashMap.empty(),
  makeModel: ({ count }) => ({
    count,
    increment: "Increment",
    type: (increments) => increments ? "Increment" : "Forbidden"
  })
}

const runCounter = (
  program: Counter,
  render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void>
) => run(program, render)

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

describe("run", () => {
  test("frames carry the model, and a dispatch that drives the program", async () => {
    const counts: Array<number> = []
    await Effect.runPromise(runCounter(counter, (frames) =>
      frames.pipe(
        Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
          counts.push(model.count)
          if (model.count < 2) yield* dispatch(model.increment)
        })),
        Stream.take(3),
        Stream.runDrain
      )))
    expect(counts).toEqual([0, 1, 2])
  })

  test("called inside an uninterruptible region, ends once its renderer returns", async () => {
    const counts: Array<number> = []
    await Effect.runPromise(Effect.uninterruptible(runCounter(counter, (frames) =>
      frames.pipe(
        Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
          counts.push(model.count)
          if (model.count < 2) yield* dispatch(model.increment)
        })),
        Stream.take(3),
        Stream.runDrain
      ))))
    expect(counts).toEqual([0, 1, 2])
  })

  test("a message that update rejects is ignored, and the program goes on", async () => {
    const counts: Array<number> = []
    const exit = await Effect.runPromiseExit(runCounter(counter, (frames) =>
      frames.pipe(
        Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
          counts.push(model.count)
          // A buggy view: it lets the user type a value that `update` does not accept, then increments.
          yield* dispatch(model.type(false))
          yield* dispatch(model.increment)
        })),
        Stream.take(2),
        Stream.runDrain
      )))
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
      (frames) =>
        frames.pipe(
          Stream.tap(({ model }) => Effect.sync(() => counts.push(model.count))),
          Stream.takeUntil(({ model }) => model.count === 6),
          Stream.runDrain
        ),
      { flags: 5 }
    ))
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
    await Effect.runPromise(run(
      plain,
      (frames) => Stream.runForEach(Stream.take(frames, 1), ({ model }) => Effect.sync(() => counts.push(model)))
    ))
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
      (frames) =>
        resource("renderer").pipe(
          Effect.andThen(Deferred.succeed(drawing, undefined)),
          Effect.andThen(Stream.runDrain(frames)),
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
    // `Slow` answers only once the answer of `Fast`, started after it, has been drawn.
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
    await Effect.runPromise(run(program, (frames) =>
      frames.pipe(
        Stream.tap(({ model }) => {
          last = model.heard
          return model.heard.length === 1 ? Deferred.succeed(slow, undefined) : Effect.void
        }),
        Stream.takeUntil(({ model }) => model.heard.length === 2),
        Stream.runDrain
      )))
    expect(last).toEqual(["Fast", "Slow"])
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
          (frames) =>
            frames.pipe(
              Stream.tap(() => Effect.logInfo("the renderer")),
              Stream.takeUntil(({ model }) => model >= commands),
              Stream.runDrain
            ),
          { onApplied: () => Effect.logInfo("onApplied") }
        )
        return yield* Effect.orDie(Effect.currentSpan)
      }).pipe(
        Effect.withSpan("caller"),
        // Down to debug: the engine's own logs, such as a subscription starting, are among them.
        Effect.provideService(References.MinimumLogLevel, "Debug"),
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

  test("the run ends when the renderer ends", async () => {
    const exit = await Effect.runPromiseExit(runCounter(counter, (frames) => Stream.runHead(frames)))
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  // What a renderer's plain callbacks rely on: no services, nothing to wait for, whatever runs it.
  test("a dispatch runs with Effect.runSync from a plain callback, and after the run has ended too", async () => {
    let kept: Dispatch<Message> | undefined
    const counts: Array<number> = []
    await Effect.runPromise(runCounter(counter, (frames) =>
      frames.pipe(
        Stream.tap(({ model, dispatch }) =>
          Effect.sync(() => {
            counts.push(model.count)
            kept = dispatch
            // As a click handler would, outside the renderer's fiber.
            if (model.count === 0) setTimeout(() => Effect.runSync(dispatch(model.increment)), 0)
          })
        ),
        Stream.take(2),
        Stream.runDrain
      )))
    expect(counts).toEqual([0, 1])
    expect(() => kept && Effect.runSync(kept("Increment"))).not.toThrow()
  })

  // A queue that waits when full would make the second of them suspend, and `Effect.runSync` throw on it.
  test("dispatches run one after the other in one callback, before the run takes any, are all applied in order", async () => {
    const sent: ReadonlyArray<Message> = ["Increment", "Forbidden", "Increment"]
    const thrown: Array<unknown> = []
    const arrived: Array<Message> = []
    const dispatched = Deferred.makeUnsafe<void>()
    await Effect.runPromise(run(
      counter,
      (frames) =>
        frames.pipe(
          Stream.tap(({ model, dispatch }) =>
            Effect.sync(() => {
              if (model.count > 0) return
              setTimeout(() => {
                for (const message of sent) {
                  try {
                    Effect.runSync(dispatch(message))
                  } catch (error) {
                    thrown.push(error)
                  }
                }
                Effect.runSync(Deferred.succeed(dispatched, undefined))
              }, 0)
            })
          ),
          Stream.takeUntil(({ model }) => model.count === 2),
          Stream.runDrain,
          // Bounded, so that a run where a dispatch threw before the second `Increment` still ends; and wide, since a
          // loaded machine may take a while to apply what was sent.
          Effect.raceFirst(Deferred.await(dispatched).pipe(Effect.andThen(Effect.sleep("1 second"))))
        ),
      {
        onApplied: ({ message }) => Effect.sync(() => arrived.push(message)),
        onIgnored: ({ message }) => Effect.sync(() => arrived.push(message))
      }
    ))
    expect(thrown).toEqual([])
    expect(arrived).toEqual([...sent])
  })
})

describe("defects", () => {
  class Boom extends Error {}
  const boom = (): never => {
    throw new Boom()
  }

  /**
   * Runs `program`, sending `Increment` from the first frame and drawing every frame with `view`, with debug logs
   * enabled, and tells where the run says its defect happened, if it died with the one thrown, and what it
   * logged above the debug level.
   */
  const failsWithBoom = async (
    program: Counter,
    { view = () => undefined, ...options }: Partial<RunOptions<Count, Message, Command>> & {
      view?: (model: Model) => void
    } = {}
  ) => {
    let sent = false
    const logged: Array<unknown> = []
    const aboveDebug = Logger.make(({ message, logLevel }) => {
      if (logLevel !== "Debug") logged.push(message)
    })
    const exit = await Effect.runPromiseExit(
      run(
        program,
        (frames) =>
          frames.pipe(
            Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
              view(model)
              if (sent) return
              sent = true
              yield* dispatch(model.increment)
            })),
            Stream.runDrain
          ),
        options
      ).pipe(
        Effect.provideService(References.MinimumLogLevel, "Debug"),
        Effect.provide(Logger.layer([aboveDebug]))
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
    ["describeMessage", "describeMessage", () => failsWithBoom(counter, { describeMessage: boom })],
    [
      "describeCommand",
      "describeCommand",
      () =>
        failsWithBoom({
          ...counter,
          update: () => ({ count }) => ({ state: { count: count + 1 }, commands: ["Ping"] })
        }, {
          describeCommand: boom
        })
    ],
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
    ["onApplied", "onApplied", () => failsWithBoom(counter, { onApplied: () => Effect.sync(boom) })],
    ["onApplied, before it returns its effect", "onApplied", () => failsWithBoom(counter, { onApplied: boom })],
    [
      "onIgnored",
      "onIgnored",
      () => failsWithBoom({ ...counter, update: () => () => reject }, { onIgnored: () => Effect.sync(boom) })
    ],
    [
      "onIgnored, before it returns its effect",
      "onIgnored",
      () => failsWithBoom({ ...counter, update: () => () => reject }, { onIgnored: boom })
    ]
  ])("a defect in %s ends the run, which dies with it and with where it happened", async (_, where, outcome) => {
    expect(await outcome()).toEqual({ where, logged: [] })
  })

  test("an init that throws on its flags dies in init", async () => {
    const seeded: Program<{ state: Count; model: Model; message: Message; command: Command; flags: number }> = {
      ...counter,
      init: boom
    }
    const exit = await Effect.runPromiseExit(run(seeded, () => Effect.never, { flags: 5 }))
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(defect instanceof ProgramDefect && [defect.where, defect.cause]).toEqual(["init", new Boom()])
  })

  test("a renderer that throws before it returns its effect dies in the renderer", async () => {
    const exit = await Effect.runPromiseExit(run(counter, boom))
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(defect instanceof ProgramDefect && [defect.where, defect.cause]).toEqual(["render", new Boom()])
  })

  // The fibers of a run ignore their interruptions: one that came from the program itself would otherwise leave
  // a command without its answer, or a subscription ended without its last message, and the run going on.
  const joinsAnInterruptedFiber = Effect.gen(function*() {
    const interrupted = yield* Effect.forkChild(Effect.never)
    yield* Fiber.interrupt(interrupted)
    return yield* Fiber.join(interrupted)
  })

  const sendsIncrement = (frames: Stream.Stream<Frame<Model, Message>>) =>
    Stream.runForEach(frames, ({ model, dispatch }) => dispatch(model.increment))

  test.each<[string, DefectSite, () => Effect.Effect<void>]>([
    [
      "a command",
      "command",
      () => run({ ...counter, init: pinging, runCommand: () => Effect.interrupt }, () => Effect.never)
    ],
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
    ],
    ["onApplied", "onApplied", () => run(counter, sendsIncrement, { onApplied: () => Effect.interrupt })],
    ["the renderer", "render", () => run(counter, () => Effect.interrupt)]
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

  test("a run interrupted by whoever runs it is no defect", async () => {
    const outcome = await Effect.runPromiseExit(Effect.gen(function*() {
      const drawn = yield* Deferred.make<void>()
      const running = yield* Effect.forkChild(run(
        { ...counter, init: pinging, runCommand: () => Effect.never },
        (frames) => Stream.runForEach(frames, () => Deferred.succeed(drawn, undefined))
      ))
      yield* Deferred.await(drawn)
      yield* Fiber.interrupt(running)
      return yield* Fiber.await(running)
    }))
    expect(Exit.isSuccess(outcome) && Exit.isFailure(outcome.value) && Cause.hasInterruptsOnly(outcome.value.cause))
      .toBe(true)
  })

  test("a defect in update says which message it was given, by its tags, in its message too", async () => {
    const exit = await Effect.runPromiseExit(run(
      { ...counter, update: (message) => message === "Increment" ? boom : () => reject },
      (frames) => Stream.runForEach(frames, ({ model, dispatch }) => dispatch(model.increment))
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
      (frames) => Stream.runForEach(frames, ({ model, dispatch }) => dispatch(model.increment))
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

  // A message the subscription sends after the one that stops it: `onApplied` holds the loop until it is queued.
  const leavesAMessage = Effect.gen(function*() {
    const sent = yield* Deferred.make<void>()
    const twice = Channel.fromIterable<Message, void>(["Increment", "Increment"]).pipe(
      Channel.concatWith(() => Channel.unwrap(Effect.as(Deferred.succeed(sent, undefined), Channel.never)))
    )
    yield* run(
      { ...counter, subscriptions: ({ count }) => count === 0 ? HashMap.make(["k", twice]) : HashMap.empty() },
      () => Effect.never,
      { onApplied: () => Deferred.await(sent) }
    )
  })

  // The run's own logs are in no function of the program: whatever throws in one dies in the log, and never in the
  // subscription or the step that logs it.
  test.each<[string, string, () => Effect.Effect<void>]>([
    ["an accepted message", "Message", () => run(counter, sendsIncrement)],
    [
      "a rejected message",
      "Ignored a rejected message",
      () => run({ ...counter, update: () => () => reject }, sendsIncrement)
    ],
    ["a dropped message", "Dropped a message of a stopped subscription", () => leavesAMessage],
    [
      "a subscription started by init",
      "Subscription started",
      () => run({ ...counter, subscriptions: () => HashMap.make(["k", Channel.never]) }, () => Effect.never)
    ],
    [
      "a subscription started by a message",
      "Subscription started",
      () =>
        run({
          ...counter,
          subscriptions: ({ count }) => count === 1 ? HashMap.make(["k", Channel.never]) : HashMap.empty()
        }, sendsIncrement)
    ],
    [
      "a subscription stopped",
      "Subscription stopped",
      () =>
        run({
          ...counter,
          subscriptions: ({ count }) => count === 0 ? HashMap.make(["k", Channel.never]) : HashMap.empty()
        }, sendsIncrement)
    ],
    [
      "a subscription ended",
      "Subscription ended",
      () =>
        run({
          ...counter,
          subscriptions: () => HashMap.make(["k", Channel.fromEffectDone(Effect.succeed<Message>("Forbidden"))])
        }, () => Effect.never)
    ]
  ])("a Logger that throws on the log of %s is one defect, in the log", async (_, text, running) => {
    expect(await diesOnLog(text, running())).toEqual([["log", new Boom()]])
  })

  test("a Logger that throws on what a command logs is a defect in the command", async () => {
    const logging = run(
      { ...counter, init: pinging, runCommand: () => Effect.logDebug("Pinging").pipe(Effect.as(Opt.none())) },
      () => Effect.never
    )
    expect(await diesOnLog("Pinging", logging)).toEqual([["command", new Boom()]])
  })
})

describe("logs", () => {
  /**
   * How many times the run describes a message, and a command, for an accepted message that starts a command and a
   * rejected one.
   */
  const descriptionsAt = async (level: "Info" | "Debug") => {
    const described = { messages: 0, commands: 0 }
    await Effect.runPromise(
      run(
        {
          ...counter,
          update: (message) => (state) =>
            message === "Increment" && state.count === 0
              ? { state: { count: 1 }, commands: ["Ping" as const] }
              : update(message)(state)
        },
        (frames) =>
          frames.pipe(
            Stream.tap(({ model, dispatch }) => dispatch(model.count === 0 ? model.increment : model.type(false))),
            Stream.take(2),
            Stream.runDrain
          ),
        {
          describeMessage: () => {
            described.messages += 1
            return "described"
          },
          describeCommand: () => {
            described.commands += 1
            return "described"
          }
        }
      ).pipe(
        Effect.provideService(References.MinimumLogLevel, level),
        // Written nowhere: the level alone decides whether they are described.
        Effect.provide(Logger.layer([]))
      )
    )
    return described
  }

  test("messages and commands are described only while debug logs are enabled", async () => {
    expect(await descriptionsAt("Info")).toEqual({ messages: 0, commands: 0 })
    const atDebug = await descriptionsAt("Debug")
    expect(atDebug.messages).toBeGreaterThan(0)
    expect(atDebug.commands).toBeGreaterThan(0)
  })

  /** How many times the run describes a rejected message, which it ignores, sent before one it applies. */
  const ignoredDescriptionsAt = async (level: "Info" | "Debug") => {
    let forbidden = 0
    await Effect.runPromise(
      run(
        counter,
        (frames) =>
          frames.pipe(
            Stream.tap(({ model, dispatch }) =>
              model.count === 0 ? Effect.andThen(dispatch(model.type(false)), dispatch(model.increment)) : Effect.void
            ),
            // The queue keeps their order: once `Increment` is drawn, `Forbidden` has been ignored.
            Stream.takeUntil(({ model }) => model.count === 1),
            Stream.runDrain
          ),
        {
          describeMessage: (message) => {
            if (message === "Forbidden") forbidden += 1
            return message
          }
        }
      ).pipe(
        Effect.provideService(References.MinimumLogLevel, level),
        Effect.provide(Logger.layer([]))
      )
    )
    return forbidden
  }

  test("a message ignored as rejected is described only while debug logs are enabled", async () => {
    expect(await ignoredDescriptionsAt("Info")).toBe(0)
    expect(await ignoredDescriptionsAt("Debug")).toBe(1)
  })

  /**
   * How many times the run describes a tick that a subscription left in the queue after its key went away, which the
   * run drops: `onApplied` holds the loop on `Stop` until the tick is queued behind it, and the frame of the stopped
   * state sends `Done` behind the tick. The run ends once `Done` is applied, so the loop has taken the tick by then.
   */
  const droppedDescriptionsAt = (level: "Info" | "Debug") =>
    Effect.runPromise(Effect.gen(function*() {
      const source = yield* Queue.unbounded<"Tick">()
      const sent = yield* Deferred.make<void>()
      const done = yield* Deferred.make<void>()
      let ticks = 0
      // The engine asks for what follows the tick only once it has queued the tick: then `sent` completes.
      const ticking = Channel.unwrap(Effect.map(Queue.take(source), (tick) => Channel.succeed(tick))).pipe(
        Channel.concatWith(() => Channel.unwrap(Effect.as(Deferred.succeed(sent, undefined), Channel.never)))
      )
      yield* run(
        {
          init: { state: { isRunning: true } },
          update: (message: "Tick" | "Stop" | "Done") => (state: Readonly<{ isRunning: boolean }>) =>
            message === "Stop" ? { state: { isRunning: false } } : { state },
          subscriptions: (state) => state.isRunning ? HashMap.make(["ticks", ticking]) : HashMap.empty(),
          makeModel: ({ isRunning }) => ({ isRunning, stop: "Stop" as const, done: "Done" as const })
        },
        (frames) =>
          frames.pipe(
            Stream.tap(({ model, dispatch }) => dispatch(model.isRunning ? model.stop : model.done)),
            Stream.runDrain,
            Effect.raceFirst(Deferred.await(done))
          ),
        {
          onApplied: ({ message }) =>
            message === "Stop"
              ? Queue.offer(source, "Tick").pipe(Effect.andThen(Deferred.await(sent)))
              : message === "Done"
              ? Deferred.succeed(done, undefined)
              : Effect.void,
          describeMessage: (message) => {
            if (message === "Tick") ticks += 1
            return message
          }
        }
      ).pipe(
        Effect.provideService(References.MinimumLogLevel, level),
        Effect.provide(Logger.layer([]))
      )
      return ticks
    }))

  test("a message dropped as its subscription stopped is described only while debug logs are enabled", async () => {
    expect(await droppedDescriptionsAt("Info")).toBe(0)
    expect(await droppedDescriptionsAt("Debug")).toBe(1)
  })
})

// The view sends `first`, then `Increment`; `observe` puts `held` in the hook that hears `first`, which tells
// that it is holding and waits until the renderer has given the loop time to go on. Returns how many times
// `update` ran meanwhile.
const updatesWhileHeld = (
  first: Message,
  observe: (held: Effect.Effect<void>) => RunOptions<Count, Message, Command>
) =>
  Effect.gen(function*() {
    const holding = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    let updates = 0
    let whileHeld = -1
    const counting: Counter = {
      ...counter,
      update: (message) => (state) => {
        updates += 1
        return update(message)(state)
      }
    }
    yield* run(
      counting,
      (frames) =>
        frames.pipe(
          Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
            if (model.count > 0) return
            yield* dispatch(first === "Increment" ? model.increment : model.type(false))
            yield* dispatch(model.increment)
            yield* Deferred.await(holding)
            // Long enough for the loop to take the second message, if it did not wait.
            yield* Effect.sleep("20 millis")
            whileHeld = updates
            yield* Deferred.succeed(release, undefined)
          })),
          Stream.takeUntil(({ model }) => model.count === (first === "Increment" ? 2 : 1)),
          Stream.runDrain
        ),
      observe(Deferred.succeed(holding, undefined).pipe(Effect.andThen(Deferred.await(release))))
    )
    return whileHeld
  })

describe("onApplied", () => {
  test("the next message waits until it ends", async () => {
    const updates = await Effect.runPromise(updatesWhileHeld("Increment", (held) => ({
      onApplied: ({ after }) => after.count === 1 ? held : Effect.void
    })))
    expect(updates).toBe(1)
  })

  test("hears every accepted message in order, with the states around it, before its frame", async () => {
    const heard: Array<Applied<Count, Message, Command>> = []
    const drawn: Array<number> = []
    await Effect.runPromise(run(
      counter,
      (frames) =>
        frames.pipe(
          Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
            drawn.push(heard.length)
            if (model.count < 2) yield* dispatch(model.increment)
          })),
          Stream.take(3),
          Stream.runDrain
        ),
      { onApplied: (applied) => Effect.sync(() => heard.push(applied)) }
    ))
    const origin = { _tag: "Dispatch" } as const
    expect(heard).toEqual([
      { message: "Increment", origin, before: { count: 0 }, after: { count: 1 }, revision: 1, commands: [] },
      { message: "Increment", origin, before: { count: 1 }, after: { count: 2 }, revision: 2, commands: [] }
    ])
    expect(drawn).toEqual([0, 1, 2])
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
      (frames) =>
        frames.pipe(
          Stream.tap(({ model, dispatch }) => model.count === 2 ? dispatch(model.increment) : Effect.void),
          Stream.takeUntil(({ model }) => model.count === 3),
          Stream.runDrain
        ),
      { onApplied: ({ origin }) => Effect.sync(() => origins.push(origin)) }
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
        onApplied: (message) => Effect.asVoid(Deferred.succeed(applied, message))
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
        onApplied: (step) =>
          Effect.suspend(() => {
            applied.push(step)
            return applied.length === 2 ? Effect.asVoid(Deferred.succeed(two, applied)) : Effect.void
          })
      })
      return yield* Deferred.await(two)
    }))
    expect(heard.map((step) => step.commands)).toEqual([["Ping"], []])
  })
})

describe("onIgnored", () => {
  test("the next message waits until it ends", async () => {
    const updates = await Effect.runPromise(updatesWhileHeld("Forbidden", (held) => ({ onIgnored: () => held })))
    expect(updates).toBe(1)
  })

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
      (frames) =>
        frames.pipe(
          Stream.tap(({ model, dispatch }) => model.count === 0 ? dispatch(model.type(false)) : Effect.void),
          Stream.runDrain,
          Effect.raceFirst(Deferred.await(both))
        ),
      {
        onApplied: ({ message }) => Effect.sync(() => applied.push(message)),
        onIgnored: (each) =>
          Effect.suspend(() => {
            ignored.push(each)
            return ignored.length === 2 ? Effect.asVoid(Deferred.succeed(both, undefined)) : Effect.void
          })
      }
    ))
    expect(applied).toEqual([])
    expect(ignored).toHaveLength(2)
    expect(ignored).toContainEqual({ message: "Forbidden", origin: { _tag: "Dispatch" }, state: { count: 0 } })
    expect(ignored).toContainEqual({ message: "Forbidden", origin: { _tag: "Command" }, state: { count: 0 } })
  })
})

describe("frames", () => {
  test("a model is made only for the frames the renderer pulls, never for a state the buffer dropped", async () => {
    let made = 0
    const counting: Counter = {
      ...counter,
      makeModel: (count) => {
        made++
        return counter.makeModel(count)
      }
    }
    const applied = Deferred.makeUnsafe<void>()
    await Effect.runPromise(run(
      counting,
      (frames) =>
        frames.pipe(
          Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
            if (model.count > 0) return
            // Three states while the renderer is still busy with this frame: the buffer keeps only the last.
            yield* Effect.repeat(dispatch(model.increment), { times: 2 })
            yield* dispatch(model.type(false))
            yield* Deferred.await(applied)
          })),
          Stream.take(2),
          Stream.runDrain
        ),
      { onIgnored: () => Deferred.succeed(applied, undefined) }
    ))
    expect(made).toBe(2)
  })

  test("a renderer slower than the program gets only the latest frame", async () => {
    const counts: Array<number> = []
    const applied = Deferred.makeUnsafe<void>()
    await Effect.runPromise(run(
      counter,
      (frames) =>
        frames.pipe(
          Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
            counts.push(model.count)
            if (model.count > 0) return
            // Three messages in a burst, while the renderer is still busy with this frame, until all are applied: a
            // rejected one behind them is heard once the state of the third is published.
            yield* Effect.repeat(dispatch(model.increment), { times: 2 })
            yield* dispatch(model.type(false))
            yield* Deferred.await(applied)
          })),
          Stream.take(2),
          Stream.runDrain
        ),
      { onIgnored: () => Deferred.succeed(applied, undefined) }
    ))
    expect(counts).toEqual([0, 3])
  })
})

describe("subscriptions", () => {
  test("what a subscription leaves in the queue after its key went away does not reach update", async () => {
    // A stopwatch: `Tick` counts in any state, so that only the engine can keep a late one out; `Stop` drops
    // the key of the ticks.
    type Watch = Readonly<{ isRunning: boolean; ticks: number }>
    type WatchMessage = "Tick" | "Stop"
    const ticks = await Effect.runPromise(Effect.gen(function*() {
      const source = yield* Queue.unbounded<"Tick">()
      const sent = yield* Deferred.make<void>()
      let latest: Watch = { isRunning: true, ticks: 0 }
      // The engine asks for what follows the tick only once it has queued the tick: then `sent` completes.
      const ticking = Channel.unwrap(Effect.map(Queue.take(source), (tick) => Channel.succeed(tick))).pipe(
        Channel.concatWith(() => Channel.unwrap(Effect.as(Deferred.succeed(sent, undefined), Channel.never)))
      )
      const watch: Program<{
        state: Watch
        model: Readonly<{ watch: Watch; stop: WatchMessage }>
        message: WatchMessage
      }> = {
        init: { state: { isRunning: true, ticks: 0 } },
        update: (message) => (state) =>
          message === "Tick"
            ? { state: { ...state, ticks: state.ticks + 1 } }
            : { state: { ...state, isRunning: false } },
        subscriptions: (state) => state.isRunning ? HashMap.make(["ticks", ticking]) : HashMap.empty(),
        makeModel: (watch) => ({ watch, stop: "Stop" })
      }
      yield* run(watch, (frames) =>
        frames.pipe(
          // A second `Stop`, sent once the first is drawn, is queued behind the late tick: drawn, the tick was taken.
          Stream.tap(({ model, dispatch, seen }) =>
            Effect.suspend(() => {
              latest = model.watch
              return seen < 2 ? Effect.asVoid(dispatch(model.stop)) : Effect.void
            })
          ),
          Stream.takeUntil(({ seen }) => seen >= 2),
          Stream.runDrain
        ), {
        // After `update` stopped the watch and before the key goes away: a tick is sent meanwhile.
        onApplied: ({ message }) =>
          message === "Stop" ? Queue.offer(source, "Tick").pipe(Effect.andThen(Deferred.await(sent))) : Effect.void
      })
      return latest.ticks
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

  // Draws a frame, and ends once what dies holds.
  const drawsOnce = (holding: Deferred.Deferred<void>) => (frames: Stream.Stream<Frame<Model, Message>>) =>
    Stream.runHead(frames).pipe(Effect.andThen(Deferred.await(holding)))

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
        (frames) =>
          Effect.acquireRelease(Effect.void, () => Effect.die("boom")).pipe(Effect.andThen(Stream.runHead(frames)))
      )
    )
    expect(where(exit)).toBe("render")
  })

  // A command and a subscription a step of the loop starts are its own fibers, not the loop's: the end stops the loop
  // first, and then releases the renderer before them.
  describe("releases the renderer before what a step of the loop started, still running", () => {
    const released: Array<string> = []
    const holdsTill = (holding: Deferred.Deferred<void>, what: string) =>
      Effect.acquireRelease(Deferred.succeed(holding, undefined), () => Effect.sync(() => released.push(what))).pipe(
        Effect.andThen(Effect.never)
      )
    // Sends one `Increment`, then holds what it acquired until the run ends.
    const rendering = (frames: Stream.Stream<Frame<Model, Message>>) =>
      Effect.acquireRelease(Effect.void, () => Effect.sync(() => released.push("renderer"))).pipe(
        Effect.andThen(Stream.runHead(frames)),
        Effect.flatMap(Opt.match({
          onNone: () => Effect.void,
          onSome: (frame) => Effect.asVoid(frame.dispatch(frame.model.increment))
        })),
        Effect.andThen(Effect.never)
      )
    const endOnce = (program: Counter, holding: Deferred.Deferred<void>) =>
      Effect.gen(function*() {
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

  const wheres = (exit: Exit.Exit<unknown>) =>
    Exit.isFailure(exit)
      ? exit.cause.reasons.filter(Cause.isDieReason).map(({ defect }) =>
        defect instanceof ProgramDefect ? defect.where : defect
      )
      : []

  // However the run ends, it interrupts the renderer and awaits it, as it does the subscriptions and the commands:
  // what the renderer dies of while it releases what it holds joins the cause, after what ended the run.
  test("a renderer that dies while an interrupted run releases it is in the cause", async () => {
    const exit = await interruptedOnce((started) => run(counter, () => holdsWhatDies(started)))
    expect(wheres(exit)).toEqual(["render"])
  })

  test("an interrupted run whose renderer dies as it releases has the defect first, then the interruption", async () => {
    const exit = await interruptedOnce((started) => run(counter, () => holdsWhatDies(started)))
    expect(Exit.isFailure(exit) ? exit.cause.reasons.map(({ _tag }) => _tag) : []).toEqual(["Die", "Interrupt"])
  })

  test("a renderer that dies as a run that died elsewhere releases it is in the cause", async () => {
    const exit = await Effect.runPromiseExit(run(
      { ...counter, update: () => () => defect("update") },
      (frames) =>
        Effect.acquireRelease(Effect.void, () => Effect.die("boom")).pipe(
          Effect.andThen(Stream.runForEach(frames, ({ model, dispatch }) => dispatch(model.increment))),
          Effect.andThen(Effect.never)
        )
    ))
    expect(wheres(exit)).toEqual(["update", "render"])
  })

  // The check of the register is the run's own, for `update` and `runCommand`: a frame pulled once the run has died,
  // in what the renderer releases, still makes its model, of the latest state, which a new pull of the frames replays.
  const pullsAsItReleases = (program: Counter, read: (model: Model) => void) =>
    run({ ...program, update: () => () => defect("update") }, (frames) =>
      Stream.runHead(frames).pipe(
        Effect.flatMap(Opt.match({
          onNone: () => Effect.never,
          onSome: (frame) =>
            Effect.addFinalizer(() =>
              Stream.runHead(frames).pipe(Effect.map(Opt.map(({ model }) => read(model))), Effect.asVoid)
            ).pipe(
              Effect.andThen(frame.dispatch("Increment")),
              Effect.andThen(Effect.never)
            )
        }))
      ))

  test("a frame the renderer pulls as a run that died releases it still makes its model", async () => {
    const read: Array<number> = []
    let made = 0
    const exit = await Effect.runPromiseExit(pullsAsItReleases(
      {
        ...counter,
        makeModel: (state) => {
          made++
          return counter.makeModel(state)
        }
      },
      ({ count }) => read.push(count)
    ))
    expect([wheres(exit), made, read]).toEqual([["update"], 2, [0]])
  })

  test("a makeModel that dies as a run that died releases the renderer is the second defect, in render", async () => {
    let made = 0
    const exit = await Effect.runPromiseExit(pullsAsItReleases(
      {
        ...counter,
        // The first frame's model is made, and the one the release pulls dies.
        makeModel: (state) => {
          made++
          if (made > 1) throw new Error("boom")
          return counter.makeModel(state)
        }
      },
      () => undefined
    ))
    expect(wheres(exit)).toEqual(["update", "render"])
  })

  // A fiber that dies as the renderer releases what it holds, a step later than the release.
  const diesAfterTheRenderer = (renderEnded: Deferred.Deferred<void>) =>
    Deferred.await(renderEnded).pipe(Effect.andThen(Effect.yieldNow), Effect.andThen(Effect.die("late")))

  const endsAndTells = (renderEnded: Deferred.Deferred<void>) => () =>
    Effect.addFinalizer(() => Deferred.succeed(renderEnded, undefined)).pipe(Effect.andThen(Effect.sleep("5 millis")))

  // Once the renderer has ended of itself, nothing awaits `engine.await` any more: the end of the run interrupts
  // the fibers still in its `FiberSet` and `FiberMap`, and awaits one that dies while it cannot be interrupted.
  // Left interruptible, such a fiber is interrupted before its step, and never dies.
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
    expect(wheres(exit)).toEqual(["command"])
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
    expect(wheres(exit)).toEqual(["subscription"])
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
    expect(wheres(exit)).toEqual(["command"])
  })

  // A renderer's release that tells when it has begun, by `releasing`, and lasts until `died`; and what dies of itself
  // once it has, while the renderer of a run that has ended releases what it holds, and tells by `died` that it has
  // ended. No clock: a slow frame, or a run interrupted before its renderer started, would outrun one, and a slow
  // death would outlast one.
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
    expect(wheres(exit)).toEqual(["command"])
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
    expect(wheres(exit)).toEqual(["subscription"])
  })

  // The run stops the loop before it stops the renderer: what the renderer sends as it releases what it holds finds
  // nothing that applies it.
  test("a message the renderer sends as the run releases it does not reach update", async () => {
    const calls = { n: 0 }
    const exit = await interruptedOnce((started) =>
      run(
        {
          ...counter,
          update: (message) => (state) => {
            calls.n += 1
            return update(message)(state)
          }
        },
        (frames) =>
          Stream.runHead(frames).pipe(
            Effect.flatMap(Opt.match({
              onNone: () => Effect.never,
              // Long enough, once sent, for the message to be applied, were the loop still running: nothing happens
              // meanwhile that could be awaited instead.
              onSome: ({ model, dispatch }) =>
                Effect.acquireRelease(
                  Effect.void,
                  () => dispatch(model.increment).pipe(Effect.andThen(Effect.sleep("60 millis")))
                ).pipe(
                  Effect.andThen(Deferred.succeed(started, undefined)),
                  Effect.andThen(Effect.never)
                )
            }))
          )
      )
    )
    expect(calls.n).toBe(0)
    expect(wheres(exit)).toEqual([])
  })

  // `onApplied` holds the loop, and learns when the run's end interrupts it: by the release of the renderer, it has.
  test("the run stops its loop before it releases the renderer", async () => {
    const holding = Deferred.makeUnsafe<void>()
    const loopStopped = Deferred.makeUnsafe<void>()
    const stoppedAtRelease: Array<boolean> = []
    const exit = await interruptedOnce((started) =>
      run(
        counter,
        (frames) =>
          Stream.runHead(frames).pipe(
            Effect.flatMap(Opt.match({
              onNone: () => Effect.never,
              onSome: ({ model, dispatch }) =>
                Effect.acquireRelease(
                  Effect.void,
                  () => Deferred.isDone(loopStopped).pipe(Effect.map((done) => stoppedAtRelease.push(done)))
                ).pipe(
                  Effect.andThen(dispatch(model.increment)),
                  Effect.andThen(Deferred.await(holding)),
                  Effect.andThen(Deferred.succeed(started, undefined)),
                  Effect.andThen(Effect.never)
                )
            }))
          ),
        {
          onApplied: () =>
            Deferred.succeed(holding, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() => Deferred.succeed(loopStopped, undefined))
            )
        }
      )
    )
    expect(stoppedAtRelease).toEqual([true])
    expect(wheres(exit)).toEqual([])
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
      (frames) =>
        releasesAndTells(releasing, died).pipe(
          Effect.andThen(Stream.runForEach(frames, ({ model, dispatch }) => dispatch(model.increment))),
          Effect.andThen(Effect.never)
        )
    ))
    expect(wheres(exit)).toEqual(["update", "command"])
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
      (frames) =>
        releasesAndTells(releasing, died).pipe(
          Effect.andThen(Stream.runForEach(frames, ({ model, dispatch }) => dispatch(model.increment))),
          Effect.andThen(Effect.never)
        )
    ))
    expect(wheres(exit)).toEqual(["update", "subscription"])
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
        (frames) =>
          Stream.runForEach(frames, ({ model, dispatch }) => {
            drawn.push(model.count)
            return model.count === 0
              ? Deferred.await(releasing).pipe(Effect.andThen(dispatch(model.increment)), Effect.asVoid)
              : Effect.asVoid(Deferred.succeed(go, undefined))
          })
      )
    }))
    expect([wheres(exit), drawn]).toEqual([["subscription"], [0, 1]])
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
    expect(wheres(exit)).toEqual(["render", "command"])
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
                  // Bounded, so that a run that applies nothing still ends.
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
          onApplied: () =>
            Effect.sync(() => {
              applied += 1
            }).pipe(Effect.andThen(Deferred.succeed(heard, undefined)))
        }
      )
    }))
    expect([wheres(exit), applied]).toEqual([["subscription"], 0])
  })

  // What a command, a subscription or the renderer wraps around its own code (`Effect.ensuring`, an `Effect.scoped` of
  // its own) is part of its effect, which ends with the defect only once that has run: until then the defect is the
  // program's, which may still catch it, and messages apply as they do while the effect runs. Here `a` releases slowly
  // around its defect, and `b` sends once the release has begun. A subscription's channel may wrap the release around
  // it too (`Channel.onExit`, `Channel.acquireUseRelease`), which closes a scope of the channel's own as its pull
  // fails, before the defect leaves it.
  const behindItsOwnRelease = (
    where: "command" | "subscription" | "render",
    channel: (release: Effect.Effect<void>) => Channel.Channel<never, never, Message> = (release) =>
      Channel.fromEffectDone(Effect.die("boom").pipe(Effect.ensuring(release)))
  ) =>
    Effect.gen(function*() {
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
          onApplied: () =>
            Effect.sync(() => {
              applied += 1
            }).pipe(Effect.andThen(Deferred.succeed(heard, undefined)))
        }
      ))
      return [wheres(exit), applied]
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

  const counted = (frames: Stream.Stream<Frame<Model, Message>>) =>
    frames.pipe(Stream.filter(({ model }) => model.count === 1), Stream.take(1), Stream.runDrain)

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
    const exit = await Effect.runPromiseExit(run(counter, (frames) =>
      caught(undefined).pipe(
        Effect.andThen(counted(frames.pipe(Stream.tap(({ model, dispatch }) =>
          model.count === 0 ? dispatch(model.increment) : Effect.void
        ))))
      )))
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  test("a log that dies as the run starts comes before what a subscription dies of as the end releases it", async () => {
    const throwsOnB = Logger.make(({ message }) => {
      if (Array.isArray(message) && message[0] === "Subscription started" && message[1] === "b") throw new Error("log")
    })
    const exit = await Effect.runPromiseExit(
      run(
        {
          ...counter,
          subscriptions: () =>
            HashMap.make(
              [
                "a",
                Channel.unwrap(
                  Effect.acquireRelease(Effect.void, () => Effect.die("release")).pipe(Effect.as(Channel.never))
                )
              ],
              ["b", Channel.never]
            )
        },
        () => Effect.never
      ).pipe(
        Effect.provideService(References.MinimumLogLevel, "Debug"),
        Effect.provide(Logger.layer([throwsOnB]))
      )
    )
    expect(wheres(exit)).toEqual(["log", "subscription"])
  })

  // The run stops a key that went away with `stopping`, and the fiber stays in the map until it has ended: the end of
  // the run, which interrupts the loop while it waits there, still finds the fiber, and awaits its release.
  test("a subscription stopped as whoever runs the run interrupts it, which dies as it releases, is in the cause", async () => {
    const exit = await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const ending = yield* Deferred.make<void>()
      // Dies once the end of the run has begun, which interrupts the renderer once it has stopped the loop.
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
        (frames) =>
          Stream.runHead(frames).pipe(
            Effect.flatMap(Opt.match({
              onNone: () => Effect.void,
              onSome: ({ model, dispatch }) => Effect.asVoid(dispatch(model.increment))
            })),
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Deferred.succeed(ending, undefined))
          )
      ))
      yield* Deferred.await(releasing)
      yield* Fiber.interrupt(running)
      return yield* Fiber.await(running)
    }))
    expect(wheres(exit)).toEqual(["subscription"])
  })

  // The end of the run interrupts the fibers it lists, and only those: a step that went on past it, while an option
  // held the loop uninterruptibly, would start a command and a subscription that nothing awaits. The loop stops at the
  // option's end, so nothing starts; were anything to start, its defect would have to be in the cause.
  test("a step held by an uninterruptible onApplied as the run is interrupted starts nothing the run does not await", async () => {
    let started = 0
    const exit = await Effect.runPromise(Effect.gen(function*() {
      const holding = yield* Deferred.make<void>()
      const startsAndDies = Effect.sync(() => {
        started += 1
      }).pipe(Effect.andThen(Effect.die("boom")))
      const running = yield* Effect.forkChild(run(
        {
          ...counter,
          update: () => ({ count }) => ({ state: { count: count + 1 }, commands: ["Boom"] }),
          runCommand: () => startsAndDies,
          subscriptions: ({ count }) =>
            count === 1 ? HashMap.make(["k", Channel.fromEffectDone(startsAndDies)]) : HashMap.empty()
        },
        (frames) =>
          Stream.runHead(frames).pipe(
            Effect.flatMap(Opt.match({
              onNone: () => Effect.void,
              onSome: ({ model, dispatch }) => Effect.asVoid(dispatch(model.increment))
            })),
            Effect.andThen(Effect.never)
          ),
        {
          // Held until the end of the run, which stops the loop first, has reached it.
          onApplied: () =>
            Effect.uninterruptible(Deferred.succeed(holding, undefined).pipe(Effect.andThen(untilInterrupted)))
        }
      ))
      yield* Deferred.await(holding)
      yield* Fiber.interrupt(running)
      return yield* Fiber.await(running)
    }))
    expect(wheres(exit).length).toBe(started)
  })

  // Takes the key of `k` away, and ends once the next message is applied, which the loop takes once the stop has ended.
  const stopsThenEnds = (frames: Stream.Stream<Frame<Model, Message>>) =>
    frames.pipe(
      Stream.tap(({ model, dispatch }) => model.count < 2 ? dispatch(model.increment) : Effect.void),
      Stream.takeUntil(({ model }) => model.count === 2),
      Stream.runDrain
    )

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

  test(
    "a renderer that interrupts itself as whoever runs the run interrupts it is a defect in the renderer",
    async () => {
      const exit = await interruptedOnce((started) => run(counter, () => interruptsItselfOnceInterrupted(started)))
      expect(selfInterruptions(exit)).toEqual(["render: It interrupted itself, which only the run may do"])
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
      expect(selfInterruptions(exit)).toEqual(["command: It interrupted itself, which only the run may do"])
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
      yield* run(stopping, (frames) =>
        frames.pipe(
          Stream.tap(({ model, dispatch }) =>
            model.count === 0 ? Deferred.await(started).pipe(Effect.andThen(dispatch(model.increment))) : Effect.void
          ),
          Stream.takeUntil(({ model }) => model.count === 1),
          Stream.runDrain
        ))
    }))
    expect(selfInterruptions(exit)).toEqual(["subscription: It interrupted itself, which only the run may do"])
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

  test(
    "a subscription that joins a fiber its own FiberMap interrupted, as the run stops it, is a defect in the subscription",
    async () => {
      const exit = await Effect.runPromiseExit(Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        const stopping: Counter = {
          ...counter,
          subscriptions: ({ count }) =>
            count === 0
              ? HashMap.make(["k", Channel.fromEffectDone(joinsWhatItsMapInterrupted(started))])
              : HashMap.empty()
        }
        yield* run(stopping, (frames) =>
          frames.pipe(
            Stream.tap(({ model, dispatch }) =>
              model.count === 0 ? Deferred.await(started).pipe(Effect.andThen(dispatch(model.increment))) : Effect.void
            ),
            Stream.takeUntil(({ model }) => model.count === 1),
            Stream.runDrain
          ))
      }))
      expect(selfInterruptions(exit)).toEqual(["subscription: It interrupted itself, which only the run may do"])
    }
  )

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
          yield* run(stopping, (frames) =>
            frames.pipe(
              Stream.tap(({ model, dispatch }) =>
                model.count === 0
                  ? Deferred.await(started).pipe(Effect.andThen(dispatch(model.increment)))
                  : Effect.void
              ),
              Stream.takeUntil(({ model }) => model.count === 1),
              Stream.runDrain
            ))
        }))
        expect(selfInterruptions(exit)).toEqual(["subscription: It interrupted itself, which only the run may do"])
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
      expect(selfInterruptions(exit)).toEqual(["command: It interrupted itself, which only the run may do"])
    }
  )

  test(
    "a renderer that joins a fiber the fiber of the run interrupted, as the run ends, is a defect in the renderer",
    async () => {
      const exit = await endedByTheFiberThatInterrupted((started, stale) =>
        run(counter, () => joinsOnceInterrupted(started, stale))
      )
      expect(selfInterruptions(exit)).toEqual(["render: It interrupted itself, which only the run may do"])
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
      expect(selfInterruptions(exit)).toEqual(["subscription: It interrupted itself, which only the run may do"])
    }
  )
})

describe("dispatch", () => {
  // The engine takes the message in its own fiber: a renderer's callback never runs `update` in its own stack.
  test("running a dispatch from a plain callback returns before update has seen the message", async () => {
    let applied = 0
    const seen: Array<number> = []
    const counting: Counter = {
      ...counter,
      update: (message) => (state) => {
        applied += 1
        return update(message)(state)
      }
    }
    await Effect.runPromise(runCounter(counting, (frames) =>
      frames.pipe(
        Stream.tap(({ model, dispatch }) =>
          Effect.sync(() => {
            if (model.count === 0) {
              setTimeout(() => {
                Effect.runSync(dispatch(model.increment))
                seen.push(applied)
              }, 0)
            }
          })
        ),
        Stream.take(2),
        Stream.runDrain
      )))
    expect(seen).toEqual([0])
  })

  test("a dispatch run from a plain callback wakes the program on the scheduler the run started with", async () => {
    // `Effect.runSync` runs the dispatch on a scheduler of its own: a task this one gets while it runs can only be
    // the queue waking the loop.
    const base = new Scheduler.MixedScheduler()
    let inCallback = false
    let woken = 0
    const scheduler: Scheduler.Scheduler = {
      executionMode: base.executionMode,
      shouldYield: (fiber) => base.shouldYield(fiber),
      makeDispatcher: () => {
        const dispatcher = base.makeDispatcher()
        return {
          scheduleTask: (task, priority) => {
            if (inCallback) woken += 1
            dispatcher.scheduleTask(task, priority)
          },
          flush: () => dispatcher.flush()
        }
      }
    }
    await Effect.runPromise(
      runCounter(counter, (frames) =>
        frames.pipe(
          Stream.tap(({ model, dispatch }) =>
            Effect.sync(() => {
              if (model.count === 0) {
                setTimeout(() => {
                  inCallback = true
                  Effect.runSync(dispatch(model.increment))
                  inCallback = false
                }, 0)
              }
            })
          ),
          Stream.take(2),
          Stream.runDrain
        )).pipe(Effect.provideService(Scheduler.Scheduler, scheduler))
    )
    expect(woken).toBe(1)
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
    const exit = await Effect.runPromiseExit(run(
      {
        ...counter,
        init: { state: { count: 0 }, commands: ["Boom"] },
        runCommand: () => Effect.addFinalizer(() => Effect.interrupt).pipe(Effect.andThen(Effect.die("boom")))
      },
      () => Effect.never
    ))
    expect(said(exit)).toEqual(["boom", "It interrupted itself, which only the run may do"])
  })
})

// A dispatch returns the number of its message among those the view has sent, and a frame says how many of them the
// run had taken when its state was made: a renderer tells from the two whether a frame is older than what it sent.
describe("what a frame has seen of what was dispatched", () => {
  type Drawn = Readonly<{ count: number; seen: number }>
  type Render = (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void>

  /** Runs what `start` makes of a renderer until `act`, given each frame drawn, says it is done; returns the frames. */
  const drawnUntil = (
    start: (render: Render) => Effect.Effect<void>,
    act: (frame: Frame<Model, Message>) => Effect.Effect<boolean>
  ): Promise<ReadonlyArray<Drawn>> =>
    Effect.runPromise(Effect.gen(function*() {
      const drawn: Array<Drawn> = []
      const done = yield* Deferred.make<void>()
      const render: Render = (frames) =>
        Stream.runForEach(
          frames,
          Effect.fnUntraced(function*(frame) {
            drawn.push({ count: frame.model.count, seen: frame.seen })
            if (yield* act(frame)) yield* Deferred.succeed(done, undefined)
          })
        )
      yield* Effect.raceFirst(start(render), Deferred.await(done))
      return drawn
    }))

  test("counts every dispatched message the run has taken, a rejected one too", async () => {
    const numbers: Array<number> = []
    const frames = await drawnUntil(
      (render) => runCounter(counter, render),
      Effect.fnUntraced(function*({ model, dispatch }) {
        if (model.count === 0) {
          numbers.push(yield* dispatch("Increment"), yield* dispatch("Forbidden"), yield* dispatch("Increment"))
        }
        return model.count === 2
      })
    )
    expect(numbers).toEqual([1, 2, 3])
    expect(frames[0]).toEqual({ count: 0, seen: 0 })
    // The second increment is the third message: the frame of its state has seen the rejected one between.
    expect(frames.at(-1)).toEqual({ count: 2, seen: 3 })
    for (const { count, seen } of frames) expect(count).toBe(seen === 0 ? 0 : seen === 1 ? 1 : 2)
  })

  test("the frame of the state a message made has seen that message", async () => {
    const frames = await drawnUntil(
      (render) => runCounter(counter, render),
      ({ model, dispatch }) => model.count === 0 ? Effect.as(dispatch("Increment"), false) : Effect.succeed(true)
    )
    expect(frames).toEqual([{ count: 0, seen: 0 }, { count: 1, seen: 1 }])
  })

  test("a dispatch is numbered each time it runs, as it runs, not as it is made", async () => {
    const numbers: Array<number> = []
    const heard: Array<Message> = []
    const frames = await drawnUntil(
      (render) =>
        run(counter, render, {
          onApplied: ({ message }) => Effect.sync(() => void heard.push(message)),
          onIgnored: ({ message }) => Effect.sync(() => void heard.push(message))
        }),
      Effect.fnUntraced(function*({ model, dispatch }) {
        if (model.count === 0) {
          const increment = dispatch("Increment")
          const forbidden = dispatch("Forbidden")
          numbers.push(yield* forbidden, yield* increment, yield* increment)
        }
        return model.count === 2
      })
    )
    // The number of a message is its place in the order `update` hears them.
    expect(numbers).toEqual([1, 2, 3])
    expect(heard).toEqual(["Forbidden", "Increment", "Increment"])
    expect(frames.at(-1)).toEqual({ count: 2, seen: 3 })
  })

  test("the messages of a command are not counted among those dispatched", async () => {
    const numbers: Array<number> = []
    const frames = await drawnUntil(
      (render) => runCounter({ ...counter, init: { state: { count: 0 }, commands: ["Ping"] } }, render),
      Effect.fnUntraced(function*({ model, dispatch }) {
        if (model.count === 1) numbers.push(yield* dispatch("Increment"))
        return model.count === 2
      })
    )
    expect(numbers).toEqual([1])
    expect(frames.filter(({ count }) => count > 0)).toEqual([{ count: 1, seen: 0 }, { count: 2, seen: 1 }])
  })

  test("a frame drawn once the run has taken more messages says what its own state had seen", async () => {
    const frames = await Effect.runPromise(Effect.gen(function*() {
      const drawn: Array<Drawn> = []
      const ignored = yield* Deferred.make<void>()
      const done = yield* Deferred.make<void>()
      // The renderer reads the frame of the increment only once the loop has taken the rejected message after it,
      // which makes no frame of its own.
      const render: Render = (frames) =>
        Stream.runForEach(
          frames,
          Effect.fnUntraced(function*({ model, dispatch, seen }) {
            drawn.push({ count: model.count, seen })
            if (model.count === 0) {
              yield* dispatch("Increment")
              yield* dispatch("Forbidden")
              yield* Deferred.await(ignored)
            } else yield* Deferred.succeed(done, undefined)
          })
        )
      yield* Effect.raceFirst(
        run(counter, render, { onIgnored: () => Effect.asVoid(Deferred.succeed(ignored, undefined)) }),
        Deferred.await(done)
      )
      return drawn
    }))
    expect(frames).toEqual([{ count: 0, seen: 0 }, { count: 1, seen: 1 }])
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
      (frames) =>
        Stream.runHead(frames).pipe(
          Effect.flatMap(Opt.match({ onNone: () => Effect.void, onSome: ({ dispatch }) => dispatch("Increment") })),
          Effect.andThen(Effect.never)
        )
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

// A fiber of the program's own that interrupts the fiber of the renderer, or the loop's from `onApplied` or
// `onIgnored`, is no interruption by the run, nor by whoever runs it: only those two interrupt them (guide, "Nothing
// ends in silence"), so the run dies in their site.
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

  const sends = (message: (model: Model) => Message) => (frames: Stream.Stream<Frame<Model, Message>>) =>
    Stream.runHead(frames).pipe(
      Effect.flatMap(
        Opt.match({ onNone: () => Effect.void, onSome: ({ model, dispatch }) => dispatch(message(model)) })
      ),
      Effect.andThen(Effect.never)
    )

  test.failing("of the renderer is a defect in the renderer", async () => {
    expect(site(await ended(run(counter, () => interruptedByAFiberOfItsOwn)))).toBe("render")
  })

  test.failing("of the loop, from onApplied, is a defect in onApplied", async () => {
    const exit = await ended(run(counter, sends(({ increment }) => increment), {
      onApplied: () => interruptedByAFiberOfItsOwn
    }))
    expect(site(exit)).toBe("onApplied")
  })

  test.failing("of the loop, from onIgnored, is a defect in onIgnored", async () => {
    const exit = await ended(run(counter, sends(({ type }) => type(false)), {
      onIgnored: () => interruptedByAFiberOfItsOwn
    }))
    expect(site(exit)).toBe("onIgnored")
  })
})
