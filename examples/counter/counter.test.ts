import { reject } from "@fgaudo/effect-tea"
import { applyAll, dispatchViolations, drive } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"
import * as fc from "fast-check"
import { messagesSentBy } from "../../bridges/snabbdom-testing.ts"
import { counter, type Message, type Model, update } from "./counter.ts"
import { view } from "./view-snabbdom.ts"

// What the model holds: the messages of its controls, a case at a time, in the order the view draws them, for the
// test of the view below.
const messagesOf = (model: Model): ReadonlyArray<Message> =>
  model._tag === "Counting" ? [model.decrement, model.increment] : [model.increment]

describe("counter", () => {
  // `update` alone: pure, no runtime.
  test("counts up and down", () => {
    expect(applyAll(update)(["Increment", "Increment", "Decrement"], { count: 0 }).state).toEqual({ count: 1 })
  })

  test("rejects going below zero", () => {
    expect(update("Decrement")({ count: 0 })).toBe(reject)
  })

  // The model, for any count: every message it holds is accepted, and nothing `update` accepts is missing from
  // it. Both buttons are meant to repeat.
  test("the model holds what update accepts, all of it", () => {
    fc.assert(fc.property(fc.nat(1_000), (count) => {
      const state = { count }
      expect(dispatchViolations(update, {
        state,
        held: messagesOf(counter.makeModel(state)),
        candidates: ["Increment", "Decrement"],
        repeatable: () => true
      })).toEqual([])
    }))
  })

  // Beyond what the library asks: that the view draws what its model holds, each control once. `messagesSentBy`,
  // beside the snabbdom bridge, is its way to see it without a DOM.
  test("the view sends what its model holds", () => {
    fc.assert(fc.property(fc.nat(1_000), (count) => {
      const model = counter.makeModel({ count })
      expect(messagesSentBy<Model, Message>(view, model)).toEqual(messagesOf(model))
    }))
  })

  // The program as it runs, driven like a user would.
  test("a user clicks +, + and −", async () => {
    const count = await Effect.runPromise(drive(
      counter,
      Effect.fnUntraced(function*(driver) {
        yield* driver.send((model) => Opt.some(model.increment))
        yield* driver.send((model) => model.count === 1 ? Opt.some(model.increment) : Opt.none())
        yield* driver.send((model) =>
          model._tag === "Counting" && model.count === 2 ? Opt.some(model.decrement) : Opt.none()
        )
        return yield* driver.waitFor((model) => model.count === 1 ? Opt.some(model.count) : Opt.none())
      })
    ))
    expect(count).toBe(1)
  })
})
