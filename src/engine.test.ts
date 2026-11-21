import { describe, expect, test } from "bun:test"
import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import { absurd, identity } from "effect/Function"
import * as HashMap from "effect/HashMap"
import * as Opt from "effect/Option"
import * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import { gate } from "../test/gate.test_helper.ts"
import type { Execution } from "./command.ts"
import { ProgramDefect } from "./defect.ts"
import * as Engine from "./engine.ts"
import type { Subscription } from "./subscription.ts"
import { reject } from "./update.ts"

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) => Effect.runPromise(Effect.scoped(effect))

/** What a run died of, each defect by its site and what it holds: `ProgramDefect`s, in order. */
const sites = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit)
    ? exit.cause.reasons.filter(Cause.isDieReason).map(({ defect }) =>
      defect instanceof ProgramDefect ? `${defect.where}: ${String(defect.cause)}` : `raw: ${String(defect)}`
    )
    : []

/** Whether `f` throws, called as a plain callback calls it. */
const throws = (f: () => void) => {
  try {
    f()
    return false
  } catch {
    return true
  }
}

/** The lines a test writes, and a wait for each, so that a test awaits what it is about, and never sleeps for it. */
const journal = () => {
  const lines: Array<string> = []
  const waiting = new Map<string, Deferred.Deferred<void>>()
  return {
    lines,
    push: (line: string) => {
      lines.push(line)
      const waiter = waiting.get(line)
      if (waiter !== undefined) Deferred.doneUnsafe(waiter, Exit.void)
    },
    reached: (line: string) =>
      Effect.suspend(() => {
        if (lines.includes(line)) return Effect.void
        const waiter = waiting.get(line) ?? Deferred.makeUnsafe<void>()
        waiting.set(line, waiter)
        return Deferred.await(waiter)
      })
  }
}

// A counter that accepts `Increment`, `Decrement` only above zero, `Same` as the very same state, and never
// `Forbidden`.
type Message = "Increment" | "Decrement" | "Same" | "Forbidden"

const counter = (count: number) => (message: Message) =>
  message === "Increment"
    ? { state: { count: count + 1 } }
    : message === "Decrement" && count > 0
    ? { state: { count: count - 1 } }
    : reject

describe("a dispatch applies its message at once", () => {
  const make = (heard: Array<string>) =>
    Engine.make<{ count: number }, Message, never, never, never>({
      init: { state: { count: 0 } },
      runCommand: absurd,
      update: (message) => (state) => message === "Same" ? { state } : counter(state.count)(message),
      subscriptions: () => HashMap.empty(),
      onApplied: ({ message, after }) => void heard.push(`applied ${message} ${after.count}`),
      onIgnored: ({ message }) => void heard.push(`ignored ${message}`)
    })

  test("when it returns, update and onApplied have heard it, and the current state is the one it made", async () => {
    const outcome = await run(Effect.gen(function*() {
      const heard: Array<string> = []
      const engine = yield* make(heard)
      engine.dispatch("Increment")
      const first = { heard: [...heard], current: engine.current() }
      engine.dispatch("Increment")
      return { first, heard, current: engine.current() }
    }))
    expect(outcome.first).toEqual({ heard: ["applied Increment 1"], current: { state: { count: 1 }, revision: 1 } })
    expect(outcome.heard).toEqual(["applied Increment 1", "applied Increment 2"])
    expect(outcome.current).toEqual({ state: { count: 2 }, revision: 2 })
  })

  test("a rejected message leaves the very same state, onIgnored hears it at once, and no listener is told", async () => {
    const outcome = await run(Effect.gen(function*() {
      const heard: Array<string> = []
      const engine = yield* make(heard)
      const before = engine.current()
      let told = 0
      engine.subscribe(() => void (told += 1))
      engine.dispatch("Forbidden")
      engine.dispatch("Decrement")
      return { heard, same: engine.current() === before, told }
    }))
    expect(outcome).toEqual({ heard: ["ignored Forbidden", "ignored Decrement"], same: true, told: 0 })
  })

  test("a listener is told of each new state, once it is current, never of the very same one, until it stops", async () => {
    const told = await run(Effect.gen(function*() {
      const engine = yield* make([])
      const told: Array<number> = []
      const stop = engine.subscribe(() => void told.push(engine.current().state.count))
      engine.dispatch("Increment")
      engine.dispatch("Same")
      engine.dispatch("Increment")
      stop()
      engine.dispatch("Increment")
      return told
    }))
    expect(told).toEqual([1, 2])
  })

  test("a message a listener sends is applied after every listener has been told of the step, before the dispatch returns", async () => {
    const outcome = await run(Effect.gen(function*() {
      const heard: Array<string> = []
      const engine = yield* make(heard)
      const told: Array<string> = []
      engine.subscribe(() => {
        const { count } = engine.current().state
        told.push(`first ${count}`)
        if (count === 1) {
          engine.dispatch("Increment")
          told.push(`first sent, now ${engine.current().state.count}`)
        }
      })
      engine.subscribe(() => void told.push(`second ${engine.current().state.count}`))
      engine.dispatch("Increment")
      return { told, heard, current: engine.current().state.count }
    }))
    expect(outcome.told).toEqual(["first 1", "first sent, now 1", "second 1", "first 2", "second 2"])
    expect(outcome.heard).toEqual(["applied Increment 1", "applied Increment 2"])
    expect(outcome.current).toBe(2)
  })

  // Code that a function of the program wakes: here plain code that `onApplied` calls, as a bus of a devtools would.
  test("a message that code woken by onApplied sends is applied after the step, its listeners told, before the dispatch returns", async () => {
    const outcome = await run(Effect.gen(function*() {
      const heard: Array<string> = []
      const woken = new Set<() => void>()
      const engine = yield* Engine.make<{ count: number }, Message, never, never, never>({
        init: { state: { count: 0 } },
        runCommand: absurd,
        update: (message) => (state) => counter(state.count)(message),
        subscriptions: () => HashMap.empty(),
        onApplied: ({ after }) => {
          heard.push(`applied ${after.count}`)
          for (const wake of woken) wake()
          return undefined
        }
      })
      woken.add(() => {
        woken.clear()
        engine.dispatch("Increment")
        heard.push(`woken sent, now ${engine.current().state.count}`)
      })
      engine.subscribe(() => void heard.push(`told ${engine.current().state.count}`))
      engine.dispatch("Increment")
      return { heard, current: engine.current().state.count }
    }))
    expect(outcome).toEqual({
      heard: ["applied 1", "woken sent, now 0", "told 1", "applied 2", "told 2"],
      current: 2
    })
  })

  test("a command's answer and a subscription's message are applied in the call that sends them", async () => {
    const outcome = await run(Effect.gen(function*() {
      const told: Array<string> = []
      const answered = yield* Deferred.make<void>()
      const ticked = yield* Deferred.make<void>()
      const engine = yield* Engine.make<
        Readonly<{ listening: boolean; heard: ReadonlyArray<string> }>,
        "Listen" | "Work" | "Done" | "Tick",
        Execution<"Done", never>,
        never,
        string
      >({
        init: { state: { listening: false, heard: [] } },
        runCommand: identity,
        update: (message) => (state) =>
          message === "Listen"
            ? { state: { ...state, listening: true } }
            : message === "Work"
            ? { state, commands: [Effect.succeedSome("Done" as const)] }
            : { state: { ...state, heard: [...state.heard, message] } },
        subscriptions: ({ listening }) =>
          listening
            ? HashMap.make([
              "ticks",
              Channel.succeed("Tick" as const).pipe(
                Channel.concatWith(() => Channel.fromEffectDrain(Deferred.succeed(ticked, undefined))),
                Channel.concatWith(() => Channel.never)
              )
            ])
            : HashMap.empty(),
        onApplied: ({ message }) => void told.push(`applied ${message}`)
      })
      // Told once the state is current: a waiter that `onApplied` resumed could run before the new state is.
      engine.subscribe(() => {
        if (engine.current().state.heard.includes("Done")) Deferred.doneUnsafe(answered, Exit.void)
      })
      engine.dispatch("Listen")
      // What the subscription asks for next comes once its message was applied, in the same call.
      yield* Deferred.await(ticked)
      const afterTick = [...engine.current().state.heard]
      engine.dispatch("Work")
      yield* Deferred.await(answered)
      return { afterTick, heard: engine.current().state.heard, told }
    }))
    expect(outcome.afterTick).toEqual(["Tick"])
    expect(outcome.heard).toEqual(["Tick", "Done"])
    expect(outcome.told).toEqual(["applied Listen", "applied Tick", "applied Work", "applied Done"])
  })
})

describe("a rejected message", () => {
  const make = (
    commands: ReadonlyArray<Execution<Message, never>> = [],
    onIgnored: (ignored: Engine.Ignored<{ count: number }, Message>) => undefined = () => undefined
  ) =>
    Engine.make<{ count: number }, Message, Execution<Message, never>, never, never>({
      init: { state: { count: 0 }, commands },
      runCommand: identity,
      update: (message) => (state) => message === "Same" ? { state } : counter(state.count)(message),
      subscriptions: () => HashMap.empty(),
      onIgnored
    })

  // The scope ends with what the engine died of: a run that ends is one that did not die.
  test("a message update rejects is ignored, and the program goes on", async () => {
    const current = await run(Effect.gen(function*() {
      const engine = yield* make()
      engine.dispatch("Forbidden")
      engine.dispatch("Increment")
      return engine.current()
    }))
    expect(current).toEqual({ state: { count: 1 }, revision: 1 })
  })

  test("a message that no longer applies is ignored", async () => {
    const current = await run(Effect.gen(function*() {
      const engine = yield* make()
      engine.dispatch("Increment")
      engine.dispatch("Decrement")
      // A double tap: it applied at 1, and is rejected at 0.
      engine.dispatch("Decrement")
      engine.dispatch("Increment")
      return engine.current()
    }))
    expect(current).toEqual({ state: { count: 1 }, revision: 3 })
  })

  test("a message rejected after coming from a command is ignored", async () => {
    const outcome = await run(Effect.gen(function*() {
      const ignored = yield* Deferred.make<string>()
      const engine = yield* make([Effect.succeedSome<Message>("Forbidden")], ({ message, origin }) => {
        Deferred.doneUnsafe(ignored, Effect.succeed(`${message} from ${origin._tag}`))
        return undefined
      })
      engine.dispatch("Increment")
      return { ignored: yield* Deferred.await(ignored), current: engine.current() }
    }))
    expect(outcome).toEqual({ ignored: "Forbidden from Command", current: { state: { count: 1 }, revision: 1 } })
  })
})

describe("subscriptions follow their keys, in the order of the states", () => {
  // The state lists the names to listen to. Each start notes itself, and its release is held by a gate of the test's,
  // where the test gives one.
  type Listening = Readonly<{ names: ReadonlyArray<string> }>

  const listening = (log: ReturnType<typeof journal>, releases: Map<string, Effect.Effect<void>>) => {
    let starts = 0
    return Engine.make<Listening, Listening, never, never, string>({
      init: { state: { names: [] } },
      runCommand: absurd,
      update: (next) => () => ({ state: next }),
      subscriptions: ({ names }) =>
        HashMap.fromIterable(names.map((name) =>
          [
            name,
            Channel.unwrap(Effect.suspend(() => {
              const start = `${name}#${(starts += 1)}`
              log.push(`start ${start}`)
              return Effect.as(
                Effect.addFinalizer(() =>
                  (releases.get(name) ?? Effect.void).pipe(
                    Effect.andThen(Effect.sync(() => log.push(`released ${start}`)))
                  )
                ),
                Channel.never
              )
            }))
          ] as const
        ))
    })
  }

  test("the stops of a state are awaited before any start of that state or a later one, and a key that comes back finds its old one released", async () => {
    const lines = await run(Effect.gen(function*() {
      const log = journal()
      const opened = yield* Deferred.make<void>()
      const releasing = yield* Deferred.make<void>()
      const releases = new Map([[
        "a",
        Deferred.succeed(releasing, undefined).pipe(Effect.andThen(Deferred.await(opened)))
      ]])
      const engine = yield* listening(log, releases)
      engine.dispatch({ names: ["a"] })
      engine.dispatch({ names: ["b"] })
      engine.dispatch({ names: ["a"] })
      yield* Deferred.await(releasing)
      log.push("opened")
      yield* Deferred.succeed(opened, undefined)
      // The last start is the witness that every job before it is done.
      yield* log.reached("start a#3")
      return [...log.lines]
    }))
    expect(lines).toEqual(["start a#1", "opened", "released a#1", "start b#2", "released b#2", "start a#3"])
  })

  test("the next message does not wait for a release, which the effects of the next state do", async () => {
    const outcome = await run(Effect.gen(function*() {
      const log = journal()
      const opened = yield* Deferred.make<void>()
      const releasing = yield* Deferred.make<void>()
      const releases = new Map([[
        "a",
        Deferred.succeed(releasing, undefined).pipe(Effect.andThen(Deferred.await(opened)))
      ]])
      const engine = yield* listening(log, releases)
      engine.dispatch({ names: ["a"] })
      engine.dispatch({ names: [] })
      yield* Deferred.await(releasing)
      engine.dispatch({ names: ["c"] })
      const applied = engine.current().state.names
      const startedBeforeRelease = log.lines.includes("start c#2")
      yield* Deferred.succeed(opened, undefined)
      yield* log.reached("start c#2")
      return { applied, startedBeforeRelease, lines: [...log.lines] }
    }))
    expect(outcome.applied).toEqual(["c"])
    expect(outcome.startedBeforeRelease).toBe(false)
    expect(outcome.lines).toEqual(["start a#1", "released a#1", "start c#2"])
  })

  // Each release waits for the other to begin: stopped one after the other, the first would wait for ever.
  test("keys that go away together are stopped together, not one after the other", async () => {
    const lines = await run(Effect.gen(function*() {
      const log = journal()
      const both = yield* Deferred.make<void>()
      let releasing = 0
      const release = Effect.suspend(() => {
        releasing += 1
        if (releasing === 2) Deferred.doneUnsafe(both, Exit.void)
        return Deferred.await(both)
      })
      const engine = yield* listening(log, new Map([["a", release], ["b", release]]))
      engine.dispatch({ names: ["a", "b"] })
      engine.dispatch({ names: [] })
      engine.dispatch({ names: ["c"] })
      yield* log.reached("start c#3")
      return [...log.lines]
    }))
    expect(lines.slice(-1)).toEqual(["start c#3"])
    expect(lines.filter((line) => line.startsWith("released")).sort()).toEqual(["released a#1", "released b#2"])
  })

  // The keys are new tuples in every state: only their values say whether they changed. A command of each `Bump`,
  // started once its job has stopped and started what it had to, is the witness that the job is done.
  test("a key equal by value keeps its subscription running, untouched", async () => {
    type Bumping = Readonly<{ names: ReadonlyArray<string>; bumps: number }>
    const log = journal()
    const whileRunning = await run(Effect.gen(function*() {
      const engine = yield* Engine.make<
        Bumping,
        "Listen" | "Bump",
        Execution<never, never>,
        never,
        readonly [string, number]
      >({
        init: { state: { names: [], bumps: 0 } },
        runCommand: identity,
        update: (message) => (state) =>
          message === "Listen"
            ? { state: { ...state, names: ["a"] } }
            : {
              state: { ...state, bumps: state.bumps + 1 },
              commands: [Effect.as(Effect.sync(() => log.push(`bumped ${state.bumps + 1}`)), Opt.none())]
            },
        subscriptions: ({ names }) =>
          HashMap.fromIterable(names.map((name) =>
            [
              [name, 1] as const,
              Channel.unwrap(
                Effect.acquireRelease(
                  Effect.sync(() => log.push(`start ${name}`)),
                  () => Effect.sync(() => log.push(`stop ${name}`))
                ).pipe(Effect.as(Channel.never))
              )
            ] as const
          ))
      })
      engine.dispatch("Listen")
      yield* log.reached("start a")
      engine.dispatch("Bump")
      engine.dispatch("Bump")
      yield* log.reached("bumped 2")
      return log.lines.filter((line) => !line.startsWith("bumped"))
    }))
    expect(whileRunning).toEqual(["start a"])
    // Stopped only when the engine itself stops, at the end of the test.
    expect(log.lines.filter((line) => !line.startsWith("bumped"))).toEqual(["start a", "stop a"])
  })
})

describe("the very same state", () => {
  // `Same` keeps the very same state; `Ping` keeps it too, but runs a command that sends `Increment`.
  type Signal = "Same" | "Ping" | "Increment"

  const make = () =>
    Engine.make<{ count: number }, Signal, "Bump", never, never>({
      init: { state: { count: 0 } },
      runCommand: () => Effect.succeedSome<Signal>("Increment"),
      update: (signal) => (state) =>
        signal === "Increment"
          ? { state: { count: state.count + 1 } }
          : signal === "Same"
          ? { state }
          : { state, commands: ["Bump"] },
      subscriptions: () => HashMap.empty()
    })

  test("a message that keeps the same state makes no new revision", async () => {
    const outcome = await run(Effect.gen(function*() {
      const engine = yield* make()
      const before = engine.current()
      engine.dispatch("Same")
      const same = engine.current() === before
      engine.dispatch("Increment")
      return { same, current: engine.current() }
    }))
    expect(outcome).toEqual({ same: true, current: { state: { count: 1 }, revision: 1 } })
  })

  test("its commands still run", async () => {
    const current = await run(Effect.gen(function*() {
      const engine = yield* make()
      const answered = yield* Deferred.make<void>()
      engine.subscribe(() => {
        if (engine.current().state.count === 1) Deferred.doneUnsafe(answered, Exit.void)
      })
      engine.dispatch("Ping")
      yield* Deferred.await(answered)
      return engine.current()
    }))
    expect(current).toEqual({ state: { count: 1 }, revision: 1 })
  })
})

describe("subscriptions that end", () => {
  // While `listening`, a subscription sends `a`, then ends with `end`; `Bumped` changes the state, not the keys, and
  // its command, started once its job has started what it had to, is the witness that the job is done.
  type Heard = Readonly<{ listening: boolean; heard: ReadonlyArray<string>; bumps: number }>
  type Signal =
    | Readonly<{ _tag: "Listened"; listening: boolean }>
    | Readonly<{ _tag: "Heard"; value: string }>
    | Readonly<{ _tag: "Bumped"; done?: Deferred.Deferred<void> }>

  const heard = (value: string): Signal => ({ _tag: "Heard", value })

  const make = (starts: Array<number>) =>
    Engine.make<Heard, Signal, Execution<never, never>, never, string>({
      init: { state: { listening: false, heard: [], bumps: 0 } },
      runCommand: identity,
      update: (signal) => (state) =>
        signal._tag === "Listened"
          ? { state: { ...state, listening: signal.listening } }
          : signal._tag === "Heard"
          ? { state: { ...state, heard: [...state.heard, signal.value] } }
          : {
            state: { ...state, bumps: state.bumps + 1 },
            commands: signal.done === undefined ? [] : [Effect.as(Deferred.succeed(signal.done, undefined), Opt.none())]
          },
      subscriptions: ({ listening }) =>
        listening
          ? HashMap.make([
            "feed",
            Channel.suspend(() => {
              starts.push(starts.length + 1)
              return Channel.mapDone(Channel.succeed(heard("a")), () => heard("end"))
            })
          ])
          : HashMap.empty()
    })

  /** Waits for a state that `done` accepts: the current one, or the first new one. */
  const until = (engine: Engine.Engine<Heard, Signal>, done: (state: Heard) => boolean) =>
    Effect.suspend(() => {
      if (done(engine.current().state)) return Effect.void
      const reached = Deferred.makeUnsafe<void>()
      const stop = engine.subscribe(() => {
        if (done(engine.current().state)) Deferred.doneUnsafe(reached, Exit.void)
      })
      return Deferred.await(reached).pipe(Effect.ensuring(Effect.sync(stop)))
    })

  test("a subscription that ends sends its last message to update", async () => {
    const state = await run(Effect.gen(function*() {
      const engine = yield* make([])
      engine.dispatch({ _tag: "Listened", listening: true })
      yield* until(engine, (state) => state.heard.length === 2)
      return engine.current().state
    }))
    expect(state.heard).toEqual(["a", "end"])
  })

  test("it does not start again while its key stays", async () => {
    const starts: Array<number> = []
    await run(Effect.gen(function*() {
      const engine = yield* make(starts)
      const done = yield* Deferred.make<void>()
      engine.dispatch({ _tag: "Listened", listening: true })
      yield* until(engine, (state) => state.heard.length === 2)
      engine.dispatch({ _tag: "Bumped" })
      engine.dispatch({ _tag: "Bumped" })
      engine.dispatch({ _tag: "Bumped", done })
      yield* Deferred.await(done)
    }))
    expect(starts).toEqual([1])
  })

  test("it starts again when its key goes away and comes back", async () => {
    const starts: Array<number> = []
    const state = await run(Effect.gen(function*() {
      const engine = yield* make(starts)
      engine.dispatch({ _tag: "Listened", listening: true })
      yield* until(engine, (state) => state.heard.length === 2)
      engine.dispatch({ _tag: "Listened", listening: false })
      engine.dispatch({ _tag: "Listened", listening: true })
      yield* until(engine, (state) => state.heard.length === 4)
      return engine.current().state
    }))
    expect(starts).toEqual([1, 2])
    expect(state.heard).toEqual(["a", "end", "a", "end"])
  })
})

describe("the fiber of effects", () => {
  type Gated = Readonly<{ gated: boolean; works: number }>

  // The gate's key goes with `Open`: its release holds the fiber of effects in the job of `Open`, until the test
  // opens it. Each `Work` starts a command of its own, which notes itself.
  const gated = (log: ReturnType<typeof journal>, release: Effect.Effect<void>) =>
    Engine.make<Gated, "Open" | "Work", number, never, string>({
      init: { state: { gated: true, works: 0 } },
      runCommand: (n) => Effect.as(Effect.sync(() => log.push(`command ${n}`)), Opt.none()),
      update: (message) => (state) =>
        message === "Open"
          ? { state: { ...state, gated: false } }
          : { state: { ...state, works: state.works + 1 }, commands: [state.works + 1] },
      subscriptions: ({ gated }) => gated ? HashMap.make(["gate", gate<"Open" | "Work">(release)]) : HashMap.empty()
    })

  // The jobs applied while a release holds the fiber of effects wait behind it, and are done in the order of their
  // states. Nothing a correct run does could be awaited in place of the sleep: what would tell that a later job has
  // not started while the release holds is what does not happen.
  test("takes the jobs one at a time, in the order of the states: none starts while the job before is held", async () => {
    const lines = await run(Effect.gen(function*() {
      const log = journal()
      const opened = yield* Deferred.make<void>()
      const engine = yield* gated(
        log,
        Effect.sync(() => log.push("releasing")).pipe(
          Effect.andThen(Deferred.await(opened)),
          Effect.andThen(Effect.sync(() => log.push("released")))
        )
      )
      engine.dispatch("Open")
      yield* log.reached("releasing")
      engine.dispatch("Work")
      engine.dispatch("Work")
      // A window of absence, once the release has begun and both jobs are queued.
      yield* Effect.sleep("20 millis")
      yield* Deferred.succeed(opened, undefined)
      yield* log.reached("command 2")
      return [...log.lines]
    }))
    expect(lines).toEqual(["releasing", "released", "command 1", "command 2"])
  })

  test("queues the jobs of every state, however many wait: a thousand applied while a release holds it, then done in order", async () => {
    const many = 1000
    const outcome = await run(Effect.gen(function*() {
      const log = journal()
      const opened = yield* Deferred.make<void>()
      const engine = yield* gated(
        log,
        Effect.sync(() => log.push("releasing")).pipe(Effect.andThen(Deferred.await(opened)))
      )
      engine.dispatch("Open")
      yield* log.reached("releasing")
      for (let n = 0; n < many; n++) engine.dispatch("Work")
      const applied = engine.current().state.works
      yield* Deferred.succeed(opened, undefined)
      yield* log.reached(`command ${many}`)
      return { applied, lines: [...log.lines] }
    }))
    expect(outcome).toEqual({
      applied: many,
      lines: ["releasing", ...Array.from({ length: many }, (_, n) => `command ${n + 1}`)]
    })
  })
})

describe("drop by start, against the keys of the current state", () => {
  type Watch = Readonly<{ gated: boolean; ticking: boolean; ticks: number }>
  type WatchMessage = "Hold" | "Tick" | "Stop" | "Start"

  // `gate` holds the fiber of effects in the job that stops it; `ticks` sends a tick as soon as it starts.
  const watching = (held: Subscription<WatchMessage>, starts: Array<number>, ticked: Deferred.Deferred<void>) =>
    Engine.make<Watch, WatchMessage, never, never, string>({
      init: { state: { gated: true, ticking: false, ticks: 0 } },
      runCommand: absurd,
      update: (message) => (state) =>
        message === "Tick"
          ? { state: { ...state, ticks: state.ticks + 1 } }
          : message === "Hold"
          ? { state: { ...state, gated: false } }
          : { state: { ...state, ticking: message === "Start" } },
      subscriptions: (state) =>
        HashMap.fromIterable([
          ...(state.gated ? [["gate", held] as const] : []),
          ...(state.ticking
            ? [
              [
                "ticks",
                Channel.suspend(() => {
                  starts.push(starts.length + 1)
                  return Channel.succeed<WatchMessage>("Tick").pipe(
                    Channel.concatWith(() =>
                      Channel.fromEffectDrain(
                        Effect.sync(() => {
                          if (starts.length === 2) Deferred.doneUnsafe(ticked, Exit.void)
                        })
                      )
                    ),
                    Channel.concatWith(() => Channel.never)
                  )
                })
              ] as const
            ]
            : [])
        ])
    })

  test("a start whose key went away before the fiber of effects started it sends nothing that reaches update", async () => {
    const outcome = await run(Effect.gen(function*() {
      const opened = yield* Deferred.make<void>()
      const holding = yield* Deferred.make<void>()
      const ticked = yield* Deferred.make<void>()
      const starts: Array<number> = []
      const engine = yield* watching(
        gate(Deferred.succeed(holding, undefined).pipe(Effect.andThen(Deferred.await(opened)))),
        starts,
        ticked
      )
      engine.dispatch("Hold")
      yield* Deferred.await(holding)
      // Both applied while the fiber of effects is held: the start of `ticks` is queued, and gone, before it runs.
      engine.dispatch("Start")
      engine.dispatch("Stop")
      yield* Deferred.succeed(opened, undefined)
      // The second start has sent its tick: the witness that the first one has run, and sent its own.
      engine.dispatch("Start")
      yield* Deferred.await(ticked)
      return { starts, ticks: engine.current().state.ticks }
    }))
    expect(outcome).toEqual({ starts: [1, 2], ticks: 1 })
  })
})

describe("commands and scopes", () => {
  test("a command's scope closes before its answer is applied", async () => {
    const log = await run(Effect.gen(function*() {
      const log: Array<string> = []
      const answered = yield* Deferred.make<void>()
      const engine = yield* Engine.make<{ done: boolean }, "Run" | "Done", "Work", Scope.Scope, never>({
        init: { state: { done: false } },
        runCommand: () =>
          Effect.acquireRelease(Effect.sync(() => log.push("acquire")), () => Effect.sync(() => log.push("release")))
            .pipe(Effect.as(Opt.some("Done" as const))),
        update: (message) => () =>
          message === "Run" ? { state: { done: false }, commands: ["Work"] } : { state: { done: true } },
        subscriptions: () => HashMap.empty(),
        onApplied: ({ message }) => {
          log.push(`applied ${message}`)
          if (message === "Done") Deferred.doneUnsafe(answered, Exit.void)
          return undefined
        }
      })
      engine.dispatch("Run")
      yield* Deferred.await(answered)
      return log
    }))
    expect(log).toEqual(["applied Run", "acquire", "release", "applied Done"])
  })

  // `Run` and `Fork` start a command that answers `Done`, `Hold` one that never ends; `Listen` starts the
  // subscription a test gives, `Stop` stops it. The journal says what happens, in order.
  type Signal = "Run" | "Fork" | "Hold" | "Listen" | "Stop" | "Done"

  type Track = Readonly<{
    note: (line: string) => Effect.Effect<void>
    resource: (name: string) => Effect.Effect<void, never, Scope.Scope>
  }>

  const tracked = Effect.fnUntraced(function*(
    subscription: (track: Track) => Subscription<Signal, Scope.Scope> = () => Channel.never
  ) {
    const log = journal()
    const note = (line: string) => Effect.sync(() => log.push(line))
    const resource = (name: string) => Effect.acquireRelease(note(`acquire ${name}`), () => note(`release ${name}`))
    const held = yield* Deferred.make<void>()
    const runCommand = (command: Signal): Execution<Signal, Scope.Scope> => {
      switch (command) {
        case "Run":
          return resource("command").pipe(Effect.as(Opt.some<Signal>("Done")))
        case "Fork":
          return Effect.gen(function*() {
            const started = yield* Deferred.make<void>()
            yield* Effect.forkScoped(
              Deferred.succeed(started, undefined).pipe(
                Effect.andThen(Effect.never),
                Effect.onInterrupt(() => note("forked fiber interrupted"))
              )
            )
            yield* Deferred.await(started)
            return Opt.some<Signal>("Done")
          })
        default:
          return resource("held command").pipe(
            Effect.andThen(Deferred.succeed(held, undefined)),
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => note("held command interrupted"))
          )
      }
    }
    const engine = yield* Engine.make<boolean, Signal, Signal, Scope.Scope, string>({
      init: { state: false },
      update: (signal) => (listening) =>
        signal === "Listen"
          ? { state: true }
          : signal === "Stop"
          ? { state: false }
          : signal === "Done"
          ? { state: listening }
          : { state: listening, commands: [signal] },
      runCommand,
      subscriptions: (listening) =>
        listening ? HashMap.make(["subscription", subscription({ note, resource })]) : HashMap.empty(),
      onApplied: ({ message }) => {
        log.push(`applied ${message}`)
        return undefined
      }
    })
    return { log, send: engine.dispatch, held }
  })

  test("a fiber that a command forks in its scope is interrupted when the command ends", async () => {
    const lines = await run(Effect.gen(function*() {
      const { log, send } = yield* tracked()
      send("Fork")
      yield* log.reached("applied Done")
      return [...log.lines]
    }))
    expect(lines).toEqual(["applied Fork", "forked fiber interrupted", "applied Done"])
  })

  const fromEffect = ({ resource }: Track): Subscription<Signal, Scope.Scope> =>
    Channel.fromEffectDrain(resource("subscription")).pipe(Channel.concatWith(() => Channel.never))

  const fromStream = ({ resource }: Track): Subscription<Signal, Scope.Scope> =>
    Stream.fromEffect(resource("subscription")).pipe(
      Stream.drain,
      Stream.concat(Stream.never),
      Stream.toChannel,
      Channel.map((): Signal => "Done"),
      Channel.concatWith(() => Channel.never)
    )

  for (const [name, subscription] of [["Channel.fromEffect", fromEffect], ["Stream.fromEffect", fromStream]] as const) {
    test(`what a subscription acquires (${name}) is released when its key goes away`, async () => {
      const lines = await run(Effect.gen(function*() {
        const { log, send } = yield* tracked(subscription)
        send("Listen")
        yield* log.reached("acquire subscription")
        send("Stop")
        yield* log.reached("release subscription")
        return [...log.lines]
      }))
      expect(lines).toEqual(["applied Listen", "acquire subscription", "applied Stop", "release subscription"])
    })
  }

  test("when the run ends, what still runs is interrupted before its resources are released", async () => {
    const holding = ({ note, resource }: Track): Subscription<Signal, Scope.Scope> =>
      Channel.fromEffectDrain(
        resource("subscription").pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => note("subscription interrupted"))
        )
      ).pipe(
        Channel.concatWith(() => Channel.never)
      )
    const lines = await run(Effect.gen(function*() {
      const log = yield* Effect.scoped(Effect.gen(function*() {
        const { log, send, held } = yield* tracked(holding)
        send("Hold")
        send("Listen")
        yield* Deferred.await(held)
        yield* log.reached("acquire subscription")
        return log
      }))
      return [...log.lines]
    }))
    expect(lines.indexOf("held command interrupted")).toBeGreaterThan(lines.indexOf("acquire held command"))
    expect(lines.indexOf("release held command")).toBeGreaterThan(lines.indexOf("held command interrupted"))
    expect(lines.indexOf("subscription interrupted")).toBeGreaterThan(lines.indexOf("acquire subscription"))
    expect(lines.indexOf("release subscription")).toBeGreaterThan(lines.indexOf("subscription interrupted"))
  })
})

describe("defects in the thunk", () => {
  type Sent = "Boom" | "Fine" | "Work" | "Listen"

  const exploding = (where: "update" | "onApplied" | "onIgnored" | "subscriptions", calls: Array<string>) =>
    Engine.make<{ n: number; listening: boolean }, Sent, Execution<Sent, never>, never, string>({
      init: { state: { n: 0, listening: false } },
      runCommand: identity,
      update: (message) => (state) => {
        calls.push(`update ${message}`)
        if (message === "Boom" && where === "update") throw "update threw"
        if (message === "Boom" && where === "onIgnored") return reject
        if (message === "Work") return { state, commands: [Effect.succeedSome<Sent>("Boom")] }
        if (message === "Listen") return { state: { ...state, listening: true } }
        return { state: { ...state, n: state.n + 1 } }
      },
      subscriptions: ({ listening, n }) => {
        if (where === "subscriptions" && n > 0) throw "subscriptions threw"
        return listening
          ? HashMap.make(["boom", Channel.succeed<Sent>("Boom").pipe(Channel.concatWith(() => Channel.never))])
          : HashMap.empty()
      },
      onApplied: ({ message }) => {
        if (message === "Boom" && where === "onApplied") throw "onApplied threw"
        return undefined
      },
      onIgnored: () => {
        if (where === "onIgnored") throw "onIgnored threw"
        return undefined
      }
    })

  // The step stops at the defect: a state that `onApplied` did not hear is not made, and no listener is told of a state
  // that was not made. A defect of `subscriptions` leaves the new state with the old keys.
  for (const where of ["update", "onApplied", "onIgnored", "subscriptions"] as const) {
    test(`a defect of ${where} in a dispatch is recorded in ${where}, never thrown to the caller, and no update follows`, async () => {
      const outcome = await Effect.runPromise(Effect.gen(function*() {
        const calls: Array<string> = []
        const exit = yield* Effect.exit(Effect.scoped(Effect.gen(function*() {
          const engine = yield* exploding(where, calls)
          if (where !== "subscriptions") engine.subscribe(() => void calls.push("told"))
          const thrown = throws(() => engine.dispatch("Boom"))
          engine.dispatch("Fine")
          calls.push(`thrown ${thrown}`, `n ${engine.current().state.n}`)
          yield* engine.died
        })))
        return { calls, sites: sites(exit) }
      }))
      expect(outcome.calls).toEqual(["update Boom", "thrown false", `n ${where === "subscriptions" ? 1 : 0}`])
      expect(outcome.sites).toEqual([`${where}: ${where} threw`])
    })
  }

  test("a defect of update in a command's answer is in update, with the message, never in the command", async () => {
    const exit = await Effect.runPromiseExit(Effect.scoped(Effect.gen(function*() {
      const engine = yield* exploding("update", [])
      engine.dispatch("Work")
      yield* engine.died
    })))
    expect(sites(exit)).toEqual(["update: update threw"])
    const [reason] = Exit.isFailure(exit) ? exit.cause.reasons : []
    expect(
      reason !== undefined && Cause.isDieReason(reason) && reason.defect instanceof ProgramDefect
        ? reason.defect.on
        : undefined
    ).toBe("Boom")
  })

  test("a defect of update in a subscription's message is in update, never in the subscription", async () => {
    const exit = await Effect.runPromiseExit(Effect.scoped(Effect.gen(function*() {
      const engine = yield* exploding("update", [])
      engine.dispatch("Listen")
      yield* engine.died
    })))
    expect(sites(exit)).toEqual(["update: update threw"])
  })

  test("a listener that throws on a command's answer dies in render, and the command ends as it should", async () => {
    const exit = await Effect.runPromiseExit(Effect.scoped(Effect.gen(function*() {
      const engine = yield* Engine.make<{ n: number }, "Work" | "Done", Execution<"Done", never>, never, never>({
        init: { state: { n: 0 } },
        runCommand: identity,
        update: (message) => (state) =>
          message === "Work"
            ? { state, commands: [Effect.succeedSome("Done" as const)] }
            : { state: { n: state.n + 1 } },
        subscriptions: () => HashMap.empty()
      })
      engine.subscribe(() => {
        throw "listener threw"
      })
      engine.dispatch("Work")
      yield* engine.died
    })))
    expect(sites(exit)).toEqual(["render: listener threw"])
  })

  test("defects are recorded in the order they happened, and a listener that throws leaves the others told", async () => {
    const exit = await Effect.runPromiseExit(Effect.scoped(Effect.gen(function*() {
      const engine = yield* Engine.make<{ n: number }, "Up", never, never, never>({
        init: { state: { n: 0 } },
        runCommand: absurd,
        update: () => (state) => ({ state: { n: state.n + 1 } }),
        subscriptions: () => HashMap.empty()
      })
      engine.subscribe(() => {
        throw "first listener"
      })
      engine.subscribe(() => {
        throw "second listener"
      })
      engine.dispatch("Up")
      engine.dispatch("Up")
      yield* engine.died
    })))
    expect(sites(exit)).toEqual(["render: first listener", "render: second listener"])
  })

  // What the subscription asks for after `Late` comes once the call that sent `Late` has returned.
  test("from the first defect on, no update is called, on a subscription's message either", async () => {
    const calls = await Effect.runPromise(Effect.gen(function*() {
      const calls: Array<string> = []
      yield* Effect.exit(Effect.scoped(Effect.gen(function*() {
        const go = yield* Deferred.make<void>()
        const asked = yield* Deferred.make<void>()
        const engine = yield* Engine.make<{ listening: boolean }, "Listen" | "Boom" | "Late", never, never, string>({
          init: { state: { listening: false } },
          runCommand: absurd,
          update: (message) => (state) => {
            calls.push(message)
            if (message === "Boom") throw "boom"
            return message === "Listen" ? { state: { listening: true } } : { state }
          },
          subscriptions: ({ listening }) =>
            listening
              ? HashMap.make([
                "late",
                Channel.fromEffect(Effect.as(Deferred.await(go), "Late" as const)).pipe(
                  Channel.concatWith(() => Channel.fromEffectDrain(Deferred.succeed(asked, undefined))),
                  Channel.concatWith(() => Channel.never)
                )
              ])
              : HashMap.empty()
        })
        engine.dispatch("Listen")
        engine.dispatch("Boom")
        yield* Deferred.succeed(go, undefined)
        yield* Deferred.await(asked)
      })))
      return calls
    }))
    expect(calls).toEqual(["Listen", "Boom"])
  })

  test("a step applied before the first defect goes on whole: its commands still start", async () => {
    const started = await Effect.runPromiseExit(Effect.scoped(Effect.gen(function*() {
      const opened = yield* Deferred.make<void>()
      const holding = yield* Deferred.make<void>()
      const ran = yield* Deferred.make<void>()
      const engine = yield* Engine.make<
        Readonly<{ gated: boolean }>,
        "Open" | "Work" | "Boom",
        Execution<never, never>,
        never,
        string
      >({
        init: { state: { gated: true } },
        runCommand: identity,
        update: (message) => (state) => {
          if (message === "Boom") throw "boom"
          return message === "Open"
            ? { state: { gated: false } }
            : { state, commands: [Effect.as(Deferred.succeed(ran, undefined), Opt.none())] }
        },
        subscriptions: ({ gated }) =>
          gated
            ? HashMap.make([
              "gate",
              gate<"Open" | "Work" | "Boom">(
                Deferred.succeed(holding, undefined).pipe(Effect.andThen(Deferred.await(opened)))
              )
            ])
            : HashMap.empty()
      })
      engine.dispatch("Open")
      yield* Deferred.await(holding)
      engine.dispatch("Work")
      engine.dispatch("Boom")
      yield* engine.died
      yield* Deferred.succeed(opened, undefined)
      yield* Deferred.await(ran)
    })))
    expect(Exit.isFailure(started)).toBe(true)
    expect(sites(started)).toEqual(["update: boom"])
  })
})

describe("after the first defect", () => {
  // A subscription that a fiber of the program interrupts dies then, as one that interrupts itself does: its death is
  // recorded before its scope releases what it holds, so a message sent during that release is not applied.
  test("no update is called on a message sent as a subscription the program interrupted releases", async () => {
    const calls = { n: 0 }
    await Effect.runPromiseExit(
      Effect.gen(function*() {
        const releasing = yield* Deferred.make<void>()
        const go = yield* Deferred.make<void>()
        const interrupted = Channel.unwrap(Effect.gen(function*() {
          const self = yield* Effect.fiber
          yield* Effect.addFinalizer(() =>
            Deferred.succeed(releasing, undefined).pipe(Effect.andThen(Deferred.await(go)))
          )
          yield* Effect.forkDetach(Fiber.interrupt(self))
          return Channel.never
        }))
        const engine = yield* Engine.make<{ n: number }, "Hit", never, never, string>({
          init: { state: { n: 0 } },
          runCommand: absurd,
          update: (message) => (state) => {
            if (message === "Hit") calls.n += 1
            return { state: { n: state.n + 1 } }
          },
          subscriptions: () => HashMap.make(["interrupted", interrupted])
        })
        yield* Deferred.await(releasing)
        engine.dispatch("Hit")
        yield* Deferred.succeed(go, undefined)
        yield* engine.died
      }).pipe(Effect.scoped)
    )
    expect(calls.n).toBe(0)
  })
})

describe("the sites of the fibers of effects", () => {
  test("a defect of subscriptions on the first state dies in subscriptions, as the engine is made", async () => {
    const exit = await Effect.runPromiseExit(Effect.scoped(Engine.make<{ n: number }, "Up", never, never, never>({
      init: { state: { n: 0 } },
      runCommand: absurd,
      update: () => (state) => ({ state }),
      subscriptions: () => {
        throw "subscriptions threw"
      }
    })))
    expect(sites(exit)).toEqual(["subscriptions: subscriptions threw"])
  })

  test("a defect of a command dies in the command, and one of a subscription in the subscription, with its key", async () => {
    const exit = await Effect.runPromiseExit(Effect.scoped(Effect.gen(function*() {
      const engine = yield* Engine.make<{ n: number }, "Work", "Boom", never, never>({
        init: { state: { n: 0 } },
        runCommand: () => Effect.die("command threw"),
        update: () => (state) => ({ state, commands: ["Boom"] }),
        subscriptions: () => HashMap.empty()
      })
      engine.dispatch("Work")
      yield* engine.died
    })))
    expect(sites(exit)).toEqual(["command: command threw"])
    const subscribed = await Effect.runPromiseExit(Effect.scoped(Effect.gen(function*() {
      const engine = yield* Engine.make<{ on: boolean }, "On", never, never, string>({
        init: { state: { on: false } },
        runCommand: absurd,
        update: () => () => ({ state: { on: true } }),
        subscriptions: ({ on }) =>
          on ? HashMap.make(["k", Channel.fromEffectDone(Effect.die("subscription threw"))]) : HashMap.empty()
      })
      engine.dispatch("On")
      yield* engine.died
    })))
    expect(sites(subscribed)).toEqual(["subscription: subscription threw"])
    const [reason] = Exit.isFailure(subscribed) ? subscribed.cause.reasons : []
    expect(
      reason !== undefined && Cause.isDieReason(reason) && reason.defect instanceof ProgramDefect
        ? reason.defect.key
        : undefined
    ).toBe("k")
  })
})

describe("the end of the engine", () => {
  test("once the end has stopped the engine, nothing sent is applied", async () => {
    const outcome = await Effect.runPromise(Effect.gen(function*() {
      const heard: Array<string> = []
      let dispatch: (message: "Up") => void = () => undefined
      yield* Effect.scoped(Effect.gen(function*() {
        const engine = yield* Engine.make<{ n: number }, "Up", never, never, never>({
          init: { state: { n: 0 } },
          runCommand: absurd,
          update: () => (state) => ({ state: { n: state.n + 1 } }),
          subscriptions: () => HashMap.empty(),
          onApplied: () => void heard.push("applied")
        })
        dispatch = engine.dispatch
        engine.dispatch("Up")
        yield* engine.stop
        engine.dispatch("Up")
      }))
      dispatch("Up")
      return heard
    }))
    expect(outcome).toEqual(["applied"])
  })

  // The fiber of effects waits, in the job of the first `Next`, for the release of the gate whose key it takes away,
  // before it starts that job's command; were the end to leave it running, it would start the commands of both jobs once
  // the release ends.
  test("the end stops the fiber of effects held by a release, which starts nothing after, nor any job it had not taken", async () => {
    const log = await Effect.runPromise(Effect.gen(function*() {
      const log: Array<string> = []
      const holding = yield* Deferred.make<void>()
      const go = yield* Deferred.make<void>()
      const scope = yield* Scope.make()
      const engine = yield* Engine.make<Readonly<{ step: number }>, "Next", Execution<never, never>, never, string>({
        init: { state: { step: 0 } },
        runCommand: identity,
        update: () => (state) => ({
          state: { step: state.step + 1 },
          commands: [Effect.as(Effect.sync(() => log.push(`command of ${state.step + 1}`)), Opt.none())]
        }),
        subscriptions: ({ step }) =>
          step === 0
            ? HashMap.make([
              "gate",
              gate<"Next">(Deferred.succeed(holding, undefined).pipe(Effect.andThen(Deferred.await(go))))
            ])
            : HashMap.empty()
      }).pipe(Scope.provide(scope))
      engine.dispatch("Next")
      yield* Deferred.await(holding)
      engine.dispatch("Next")
      const closing = yield* Effect.forkChild(Scope.close(scope, Exit.void))
      // Long enough, once the end has begun, for the fiber of effects to go on, were it still running: nothing happens
      // meanwhile that could be awaited instead.
      yield* Effect.sleep("20 millis")
      yield* Deferred.succeed(go, undefined)
      yield* Fiber.join(closing)
      return log
    }))
    expect(log).toEqual([])
  })

  // The command's release waits for the subscription to be interrupted: interrupted one after the other, it would wait
  // in vain, until its patience runs out.
  test("the end of the engine interrupts its commands and its subscriptions at once", async () => {
    const log = await Effect.runPromise(Effect.gen(function*() {
      const log: Array<string> = []
      const holding = yield* Deferred.make<void>()
      const listening = yield* Deferred.make<void>()
      const interrupted = yield* Deferred.make<void>()
      const scope = yield* Scope.make()
      yield* Engine.make<number, "Go", "Hold", Scope.Scope, string>({
        init: { state: 0, commands: ["Hold"] },
        update: () => (n) => ({ state: n + 1 }),
        runCommand: () =>
          Effect.acquireRelease(Effect.void, () =>
            Deferred.await(interrupted).pipe(
              Effect.timeoutOption("1 second"),
              Effect.flatMap((waited) =>
                Effect.sync(() =>
                  log.push(Opt.isSome(waited) ? "released once the subscription was interrupted" : "released alone")
                )
              )
            )).pipe(Effect.andThen(Deferred.succeed(holding, undefined)), Effect.andThen(Effect.never)),
        subscriptions: () =>
          HashMap.make([
            "subscription",
            Channel.fromEffectDrain(
              Deferred.succeed(listening, undefined).pipe(
                Effect.andThen(Effect.never),
                Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined))
              )
            ).pipe(Channel.concatWith(() => Channel.never))
          ])
      }).pipe(Scope.provide(scope))
      yield* Deferred.await(holding)
      yield* Deferred.await(listening)
      yield* Scope.close(scope, Exit.void)
      return log
    }))
    expect(log).toEqual(["released once the subscription was interrupted"])
  })

  test("what a command dies of as the end of the engine interrupts it is what the end dies of", async () => {
    const exit = await Effect.runPromiseExit(Effect.scoped(Effect.gen(function*() {
      const holding = yield* Deferred.make<void>()
      yield* Engine.make<number, "Go", "Hold", never, never>({
        init: { state: 0, commands: ["Hold"] },
        update: () => (n) => ({ state: n + 1 }),
        runCommand: () =>
          Deferred.succeed(holding, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Effect.die("boom"))
          ),
        subscriptions: () => HashMap.empty()
      })
      yield* Deferred.await(holding)
    })))
    expect(sites(exit)).toEqual(["command: boom"])
  })

  // How many interruptions the fiber has received, asked where it is uninterruptible.
  const received = Effect.map(
    Effect.exit(Effect.interruptible(Effect.void)),
    (exit) => Exit.isFailure(exit) ? exit.cause.reasons.filter(Cause.isInterruptReason).length : 0
  )
  // The gate is the fiber's own: it waits until it has received `count` interruptions, or gives up after a while.
  const untilReceived = (count: number, tries = 10_000): Effect.Effect<void> =>
    Effect.flatMap(
      received,
      (seen) =>
        seen >= count || tries === 0 ? Effect.void : Effect.andThen(Effect.yieldNow, untilReceived(count, tries - 1))
    )

  // The end of the engine stops its fiber of effects in a job that was waiting for the release of a key that went
  // away. It reads the fibers that still run, never the keys of a state, so it stops that subscription too: one that
  // then joins a fiber the fiber that ends the engine interrupted interrupts itself, a defect, and the end dies of it.
  test("a subscription interrupting itself as the end of the engine stops it, its key gone, is a defect", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const stopped = yield* Deferred.make<void>()
      // Interrupted by the fiber that ends the engine.
      const stale = yield* Effect.forkDetach(Effect.never)
      yield* Fiber.interrupt(stale)
      const scope = yield* Scope.make()
      const engine = yield* Engine.make<Readonly<{ on: boolean }>, "Stop", never, never, string>({
        init: { state: { on: true } },
        update: () => () => ({ state: { on: false } }),
        runCommand: absurd,
        subscriptions: ({ on }) =>
          on
            ? HashMap.make([
              "a",
              Channel.fromEffectDone(Effect.uninterruptible(Effect.gen(function*() {
                yield* untilReceived(1)
                yield* Deferred.succeed(stopped, undefined)
                yield* untilReceived(2)
                return yield* Fiber.join(stale)
              })))
            ])
            : HashMap.empty()
      }).pipe(Scope.provide(scope))
      engine.dispatch("Stop")
      yield* Deferred.await(stopped)
      return yield* Scope.close(scope, Exit.void)
    }))
    const defect = Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isDieReason)?.defect : undefined
    expect(defect instanceof ProgramDefect && defect.where).toBe("subscription")
  })

  // `FiberSet.run` starts the command's fiber at once, on the stack of the fiber of effects, so `runCommand` is called
  // before the fiber is in the set. Called, it begins the end of the engine, which interrupts the fiber of effects
  // there: had `FiberSet.run` a step between the fork and the add for that interruption to fall into, the end would not
  // find the command, and would leave it running.
  test("a command whose runCommand begins the end of the engine as it is called is interrupted by that end", async () => {
    const log = await Effect.runPromise(Effect.gen(function*() {
      const log: Array<string> = []
      const scope = yield* Scope.make()
      const fork = Effect.runForkWith(yield* Effect.context<never>())
      // The end of the engine, begun where the test cannot fork it: joined, it has stopped what it found.
      const closing = yield* Deferred.make<Fiber.Fiber<void>>()
      const engine = yield* Engine.make<number, "Go", "Hold", never, never>({
        init: { state: 0 },
        update: () => (n) => ({ state: n + 1, commands: ["Hold"] }),
        runCommand: () => {
          Deferred.doneUnsafe(closing, Effect.succeed(fork(Scope.close(scope, Exit.void))))
          return Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => log.push("command interrupted"))))
        },
        subscriptions: () => HashMap.empty()
      }).pipe(Scope.provide(scope))
      engine.dispatch("Go")
      yield* Fiber.join(yield* Deferred.await(closing))
      return log
    }))
    expect(log).toEqual(["command interrupted"])
  })

  // The same of `FiberMap.run`, which forks a subscription at once: its channel, made as it is first pulled, begins
  // the end before the fiber is in the map.
  test("a subscription that begins the end of the engine as it starts is interrupted by that end", async () => {
    const log = await Effect.runPromise(Effect.gen(function*() {
      const log: Array<string> = []
      const scope = yield* Scope.make()
      const fork = Effect.runForkWith(yield* Effect.context<never>())
      // The end of the engine, begun where the test cannot fork it: joined, it has stopped what it found.
      const closing = yield* Deferred.make<Fiber.Fiber<void>>()
      const engine = yield* Engine.make<number, "Go", never, never, string>({
        init: { state: 0 },
        update: () => (n) => ({ state: n + 1 }),
        runCommand: absurd,
        subscriptions: (n) =>
          n === 1
            ? HashMap.make([
              "k",
              Channel.unwrap(Effect.sync(() => {
                Deferred.doneUnsafe(closing, Effect.succeed(fork(Scope.close(scope, Exit.void))))
                return Channel.fromEffectDrain(
                  Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => log.push("subscription interrupted"))))
                ).pipe(Channel.concatWith(() => Channel.never))
              }))
            ])
            : HashMap.empty()
      }).pipe(Scope.provide(scope))
      engine.dispatch("Go")
      yield* Fiber.join(yield* Deferred.await(closing))
      return log
    }))
    expect(log).toEqual(["subscription interrupted"])
  })
})
