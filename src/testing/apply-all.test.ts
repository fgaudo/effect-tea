import { describe, expect, expectTypeOf, test } from "bun:test"
import * as Effect from "effect/Effect"
import { program } from "../compose.ts"
import { defect, InvariantDefect } from "../defect.ts"
import { type Folded, reject, type Update } from "../update.ts"
import { applyAll } from "./apply-all.ts"

type State = Readonly<{ count: number; isOpen: boolean }>

// `Opened` happens once, `Pinged` starts `Ping` every time, and `Forbidden` never applies.
type Message = "Increment" | "Opened" | "Pinged" | "Forbidden"

const update: Update<State, Message, "Ping"> = (message) => (state) => {
  switch (message) {
    case "Increment":
      return { state: { ...state, count: state.count + 1 } }
    case "Opened":
      return state.isOpen ? reject : { state: { ...state, isOpen: true } }
    case "Pinged":
      return { state, commands: ["Ping"] }
    case "Forbidden":
      return reject
  }
}

const closed: State = { count: 0, isOpen: false }

describe("applyAll", () => {
  test("applies the messages in order and collects their commands", () => {
    const { state, commands } = applyAll(update, ["Increment", "Opened", "Pinged", "Increment"], closed)
    expect(state).toEqual({ count: 2, isOpen: true })
    expect(commands).toEqual(["Ping"])
  })

  test("returns both lists, empty where no step listed any", () => {
    expect(applyAll(update, ["Increment"], closed)).toEqual({
      state: { count: 1, isOpen: false },
      commands: [],
      events: []
    })
    expect(applyAll(update, [], closed)).toEqual({ state: closed, commands: [], events: [] })
  })

  test("takes its state and its messages from update alone", () => {
    expectTypeOf(applyAll(update, ["Increment"], closed)).toEqualTypeOf<Folded<State, "Ping", never>>()
    const never = () => [
      // @ts-expect-error: a message that is no message of `update`'s.
      applyAll(update, ["Unknown"], closed),
      // @ts-expect-error: a state that is not `update`'s.
      applyAll(update, [], { count: 0 })
    ]
    expect(never).toBeDefined()
  })

  test("collects the commands of every step in order", () => {
    const echo: Update<number, string, string> = (message) => (count) => ({
      state: count + 1,
      commands: [`${message}${count}`, `${message}!`]
    })
    expect(applyAll(echo, ["a", "b"], 0).commands).toEqual(["a0", "a!", "b1", "b!"])
  })

  test("collects the events in order", () => {
    const announce: Update<number, string, never, string> = (message) => (count) => ({
      state: count + 1,
      events: [`${message}${count}`]
    })
    expect(applyAll(announce, ["a", "b"], 0).events).toEqual(["a0", "b1"])
  })

  test("takes a program's external as it takes update, and returns both lists", () => {
    // A stopwatch that its parent halts: halted, it says so to its parent and runs no command.
    const stopwatch = program<
      { state: boolean; message: "Started"; command: "Tick"; event: "Stopped"; external: "Halted" }
    >()
      .make({
        init: { state: true },
        update: () => () => ({ state: true, commands: ["Tick"] }),
        external: () => (running) => (running ? { state: false, events: ["Stopped"] } : { state: false }),
        runCommand: () => Effect.never,
        makeModel: () => null
      })
    const halted = applyAll(stopwatch.external, ["Halted", "Halted"], true)
    expect(halted).toEqual({ state: false, commands: [], events: ["Stopped"] })
    expectTypeOf(halted).toEqualTypeOf<Folded<boolean, "Tick", "Stopped">>()
    const never = () => [
      // @ts-expect-error: a message that is no external message of the program's.
      applyAll(stopwatch.external, ["Started"], true),
      // @ts-expect-error: a state that is not the program's.
      applyAll(stopwatch.external, ["Halted"], 0)
    ]
    expect(never).toBeDefined()
  })

  test("a rejection fails, naming the message", () => {
    expect(() => applyAll(update, ["Increment", "Forbidden"], closed)).toThrow("message 1 (Forbidden)")
  })

  test("a rejection of a message whose tag throws fails all the same, with what it threw as the cause", () => {
    const tagless: Readonly<{ _tag: string }> = {
      get _tag(): string {
        throw new Error("tag")
      }
    }
    const refusing: Update<State, Readonly<{ _tag: string }>> = () => () => reject
    let failure: unknown
    try {
      applyAll(refusing, [tagless], closed)
    } catch (thrown) {
      failure = thrown
    }
    expect(failure instanceof Error && [failure.message, String(failure.cause)]).toEqual([
      "update rejected message 0 (<a value that threw as it was named: see the cause>)",
      "Error: tag"
    ])
  })

  test("the InvariantDefect of defect fails the test, as any error update throws", () => {
    const broken: Update<State, Message> = () => () => defect("No message arrives here")
    expect(() => applyAll(broken, ["Increment"], closed)).toThrow(InvariantDefect)
  })
})
