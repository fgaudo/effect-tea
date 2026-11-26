import { describe, expect, expectTypeOf, test } from "bun:test"
import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Opt from "effect/Option"
import type * as Scope from "effect/Scope"
import type { RunCommand } from "../command.ts"
import type { Program } from "../program.ts"
import type { Subscription } from "../subscription.ts"
import { reject, type Update } from "../update.ts"
import { simulate, type Simulated } from "./simulate.ts"

describe("simulate", () => {
  class Storage extends Context.Service<Storage, { readonly save: Effect.Effect<number> }>()("Storage") {}

  // `Save` starts `Store`, which `Saved` completes; while saving, a second `Save` is rejected. `Saved` tells
  // the parent with an event.
  type Saving = Readonly<{ isSaving: boolean; saved: number }>
  type Flow = Readonly<{ _tag: "Save" }> | Readonly<{ _tag: "Saved"; total: number }>

  const flow: Update<Saving, Flow, "Store", "Done"> = (message) => (state) => {
    switch (message._tag) {
      case "Save":
        return state.isSaving ? reject : { state: { ...state, isSaving: true }, commands: ["Store"] }
      case "Saved":
        return state.isSaving ? { state: { isSaving: false, saved: message.total }, events: ["Done"] } : reject
    }
  }

  const store: RunCommand<"Store", Flow, Storage> = () =>
    Effect.map(
      Effect.service(Storage).pipe(Effect.flatMap((storage) => storage.save)),
      (total) => Opt.some<Flow>({ _tag: "Saved", total })
    )

  const saving = { update: flow, runCommand: store, subscriptions: () => [] }

  const idle: Saving = { isSaving: false, saved: 0 }

  const withStorage = <A, E>(effect: Effect.Effect<A, E, Storage>) =>
    effect.pipe(Effect.provideService(Storage, { save: Effect.succeed(7) }))

  test("runs each command as soon as its message is applied, and applies its message before the next", async () => {
    const simulation = await Effect.runPromise(withStorage(
      simulate(saving, [{ _tag: "Save" }, { _tag: "Save" }], {
        state: idle
      })
    ))
    expect(simulation).toEqual({
      state: { isSaving: false, saved: 7 },
      applied: [{ _tag: "Save" }, { _tag: "Saved", total: 7 }, { _tag: "Save" }, { _tag: "Saved", total: 7 }],
      commands: ["Store", "Store"],
      events: ["Done", "Done"],
      ignored: []
    })
  })

  test("runs the commands of the starting step first", async () => {
    const simulation = await Effect.runPromise(withStorage(
      simulate(saving, [], { state: { isSaving: true, saved: 0 }, commands: ["Store"] })
    ))
    expect(simulation.state).toEqual({ isSaving: false, saved: 7 })
  })

  test("a test's own interpreter answers the commands, with no services", async () => {
    const answered = {
      update: flow,
      runCommand: () => Effect.succeedSome<Flow>({ _tag: "Saved", total: 3 }),
      subscriptions: () => []
    }
    const simulation = await Effect.runPromise(simulate(answered, [{ _tag: "Save" }], { state: idle }))
    expect(simulation.state).toEqual({ isSaving: false, saved: 3 })
  })

  test("a command's message that update rejects is ignored, and listed", async () => {
    const simulation = await Effect.runPromise(withStorage(
      simulate(saving, [], { state: idle, commands: ["Store"] })
    ))
    expect(simulation).toEqual({
      state: idle,
      applied: [],
      commands: ["Store"],
      events: [],
      ignored: [{ _tag: "Saved", total: 7 }]
    })
  })

  test("a command has a scope of its own, closed before its message is applied", async () => {
    // `Start` starts `A`, whose `First` starts `B`: `B` acquires only once `A` has released.
    type Step = "Start" | "First" | "Second"
    const log: Array<string> = []
    const resource = (name: string) =>
      Effect.acquireRelease(
        Effect.sync(() => log.push(`acquire ${name}`)),
        () => Effect.sync(() => log.push(`release ${name}`))
      )
    const chained: Update<object, Step, "A" | "B"> = (message) => (state) => {
      log.push(`apply ${message}`)
      return message === "Start"
        ? { state, commands: ["A"] }
        : message === "First"
        ? { state, commands: ["B"] }
        : { state }
    }
    const runCommand: RunCommand<"A" | "B", Step, Scope.Scope> = (command) =>
      resource(command).pipe(Effect.as(Opt.some<Step>(command === "A" ? "First" : "Second")))
    const simulation = await Effect.runPromise(
      simulate({ update: chained, runCommand, subscriptions: () => [] }, ["Start"], { state: {} })
    )
    expect(simulation.applied).toEqual(["Start", "First", "Second"])
    expect(log).toEqual([
      "apply Start",
      "acquire A",
      "release A",
      "apply First",
      "acquire B",
      "release B",
      "apply Second"
    ])
  })

  test("asks only for the services of the commands, not for those of the subscriptions it never runs", () => {
    class Feed extends Context.Service<Feed, { readonly flows: Subscription<Flow, never> }>()("Feed") {}
    const listening: Program<
      {
        state: Saving
        model: Saving
        message: Flow
        command: "Store"
        commandServices: Storage
        subscriptionServices: Feed
        event: "Done"
        key: "feed"
      }
    > = {
      init: { state: idle },
      update: flow,
      runCommand: store,
      subscriptions: () => ["feed" as const],
      listen: () => Channel.unwrap(Effect.map(Effect.service(Feed), (feed) => feed.flows)),
      makeModel: (state) => state
    }
    // Unlike two `extends`, it tells `any` and `unknown` from the services named.
    type Exactly<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
    const simulation = simulate(listening, [], listening.init)
    const commands: Exactly<Effect.Services<typeof simulation>, Storage> = true
    expect(commands).toBe(true)
  })

  test("takes the subscriptions of a program as well as its update", () => {
    const counting: Update<Saving, "Increment"> = () => (state) => ({ state })
    // @ts-expect-error: it reads the subscriptions on each new state.
    expect(simulate({ update: counting }, [], { state: idle })).toBeDefined()
    expect(simulate({ update: counting, subscriptions: () => [] }, [], { state: idle })).toBeDefined()
  })

  // Each start's fiber ends at once, its key still active: one that goes away has nothing left to stop, and one that
  // comes back starts again.
  test("plays a key that goes away and comes back, whose subscription never runs", async () => {
    type Toggled = Readonly<{ on: boolean; n: number }>
    const toggling = {
      update: (message: "Toggle" | "Tick") => ({ on, n }: Toggled) =>
        message === "Toggle" ? { state: { on: !on, n }, commands: ["Note" as const] } : { state: { on, n: n + 1 } },
      runCommand: () => Effect.succeedSome<"Toggle" | "Tick">("Tick"),
      subscriptions: ({ on }: Toggled) => on ? ["k"] : []
    }
    const { state } = await Effect.runPromise(
      simulate(toggling, ["Toggle", "Tick", "Toggle", "Tick", "Toggle", "Toggle"], { state: { on: true, n: 0 } })
    )
    expect(state).toEqual({ on: true, n: 6 })
  })

  test("calls no init, no listen and no output: it starts from the step it is given, and runs no subscription", async () => {
    const called: Array<string> = []
    type Counted = Readonly<{ count: number }>
    const counting = {
      init: (_: never): Readonly<{ state: Counted }> => {
        called.push("init")
        throw new Error("init")
      },
      update: (message: "Increment" | "Pinged") => ({ count }: Counted) => ({
        state: { count: count + (message === "Increment" ? 1 : 100) }
      }),
      subscriptions: () => ["ping" as const],
      listen: () => {
        called.push("listen")
        return Channel.succeed<"Pinged">("Pinged").pipe(Channel.concatWith(() => Channel.never))
      },
      makeModel: (state: Counted) => state,
      output: ({ count }: Counted) => {
        called.push("output")
        return count
      }
    }
    const simulation = await Effect.runPromise(simulate(counting, ["Increment"], { state: { count: 5 } }))
    expect(simulation.state).toEqual({ count: 6 })
    expect(called).toEqual([])
  })

  test("takes a program without commands or events, written as a plain object", async () => {
    const counting = {
      init: { state: { count: 0 } },
      update: () => (state: Readonly<{ count: number }>) => ({ state: { count: state.count + 1 } }),
      subscriptions: () => [],
      makeModel: (state: Readonly<{ count: number }>) => state.count
    }
    const simulation = await Effect.runPromise(simulate(counting, [undefined], counting.init))
    expectTypeOf(simulation.commands).toEqualTypeOf<ReadonlyArray<never>>()
    expectTypeOf(simulation.events).toEqualTypeOf<ReadonlyArray<never>>()
    expect(simulation.state).toEqual({ count: 1 })
  })

  test("its messages are every message its update takes, whatever its commands answer", () => {
    const counting = {
      update: (message: "Increment" | "Decrement") => (state: Readonly<{ count: number }>) => ({
        state: { count: state.count + (message === "Increment" ? 1 : -1) },
        commands: ["Ping" as const]
      }),
      runCommand: () => Effect.succeedSome("Increment" as const),
      subscriptions: () => []
    }
    const simulating = simulate(counting, [], { state: { count: 0 } })
    expectTypeOf<Effect.Success<typeof simulating>["applied"]>().toEqualTypeOf<
      ReadonlyArray<"Increment" | "Decrement">
    >()
  })

  test("its state is the one its init names, not the literal its update returns", () => {
    type Counted = Readonly<{ count: number }>
    const typed: Program<{ state: Counted; model: number; message: "Increment" }> = {
      init: { state: { count: 0 } },
      update: () => (state) => ({ state }),
      subscriptions: () => [],
      makeModel: (state) => state.count
    }
    const simulating = simulate(
      {
        ...typed,
        update: (_: "Increment") => (state: Counted) => ({ state: { count: state.count + 1 } })
      },
      [],
      typed.init
    )
    expectTypeOf(simulating).toEqualTypeOf<Effect.Effect<Simulated<Counted, "Increment">, never, never>>()
  })

  test("takes no program whose init names another state than its update", () => {
    const counting = {
      init: { state: { count: "0" } },
      update: () => (state: Readonly<{ count: number }>) => ({ state: { count: state.count + 1 } }),
      subscriptions: () => []
    }
    // @ts-expect-error: the state of `init` is not the one `update` takes.
    expect(simulate(counting, [], { state: { count: 0 } })).toBeDefined()
  })

  test("takes a program whose state is a number", async () => {
    const counting: Update<number, "Increment"> = () => (count) => ({ state: count + 1 })
    const simulated = await Effect.runPromise(
      simulate({ update: counting, subscriptions: () => [] }, ["Increment", "Increment"], { state: 0 })
    )
    expect(simulated.state).toBe(2)
  })

  test("a rejection of one of the messages fails, naming it", async () => {
    const exit = await Effect.runPromiseExit(withStorage(
      simulate(saving, [{ _tag: "Saved", total: 1 }], {
        state: idle
      })
    ))
    expect(Exit.isFailure(exit) && String(Cause.squash(exit.cause))).toContain("message 0 (Saved)")
  })

  test("a rejection of a message whose tag throws fails all the same, with what it threw as the cause", async () => {
    const tagless: Readonly<{ _tag: string }> = {
      get _tag(): string {
        throw new Error("tag")
      }
    }
    const refusing: Update<number, Readonly<{ _tag: string }>> = () => () => reject
    const exit = await Effect.runPromiseExit(
      simulate({ update: refusing, subscriptions: () => [] }, [tagless], { state: 0 })
    )
    const failure = Exit.isFailure(exit) && Cause.squash(exit.cause)
    expect(failure instanceof Error && [failure.message, String(failure.cause)]).toEqual([
      "update rejected message 0 (<a value that threw as it was named: see the cause>)",
      "Error: tag"
    ])
  })

  // The simulation stops the command it waits for as the run stops one, with its mark: stopped otherwise, the command
  // would take the interruption for one of the program's, and die.
  test("interrupted while a command runs, it ends interrupted, with no defect", async () => {
    const exit = await Effect.runPromise(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const waiting: Program<{ state: Readonly<{ n: number }>; model: number; message: "Go"; command: "Wait" }> = {
        init: { state: { n: 0 } },
        update: () => (state) => ({ state, commands: ["Wait"] }),
        runCommand: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
        subscriptions: () => [],
        makeModel: ({ n }) => n
      }
      const simulating = yield* Effect.forkChild(simulate(waiting, ["Go"], { state: { n: 0 } }))
      yield* Deferred.await(started)
      yield* Fiber.interrupt(simulating)
      return yield* Fiber.await(simulating)
    }))
    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
  })
})
