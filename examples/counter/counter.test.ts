import { reject } from "@fgaudo/effect-tea"
import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import { applyAll, dispatchViolations, drive } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Opt from "effect/Option"
import * as fc from "fast-check"
import { counter, type Message, type Model, type State, update } from "./counter.ts"
import { view } from "./view-snabbdom.ts"

// The reader is also the test of the view's, below.
// #region reader
// What the model holds: the messages of its controls, a case at a time, in the order the view draws them.
const messagesOf = (model: Model): ReadonlyArray<Message> =>
  model._tag === "Counting" ? [model.decrement, model.increment] : [model.increment]
// #endregion reader

describe("counter", () => {
  // #region update
  // Any valid state: a count from zero up.
  const states: fc.Arbitrary<State> = fc.nat(1_000).map((count) => ({ count }))

  // `update` alone: pure, no runtime.
  test("counts up and down", () => {
    expect(applyAll(update, ["Increment", "Increment", "Decrement"], { count: 0 }).state).toEqual({ count: 1 })
  })

  test("rejects going below zero", () => {
    expect(update("Decrement")({ count: 0 })).toBe(reject)
  })

  // The model, for any count: every message it holds is accepted, and nothing `update` accepts is missing from
  // it. Both buttons are meant to repeat.
  test("the model holds what update accepts, all of it", () => {
    fc.assert(fc.property(states, (state) => {
      expect(dispatchViolations(update, {
        state,
        held: messagesOf(counter.makeModel(state)),
        candidates: ["Increment", "Decrement"],
        repeatable: () => true
      })).toEqual([])
    }))
  })
  // #endregion update

  // The view, checked with the tools of its renderer: `messagesSentBy`, of the snabbdom bridge, finds what the view
  // sends without a DOM, each control once, which the test compares with what the reader returns.
  test("the view sends what its model holds", () => {
    fc.assert(fc.property(states, (state) => {
      const model = counter.makeModel(state)
      expect(messagesSentBy<Model, Message>(view, model)).toEqual(messagesOf(model))
    }))
  })

  // Two equal states built apart, by the same seed drawn twice, give two equal models, which a function in a model
  // would break, being made anew by each `makeModel`.
  test("the model is data: equal states, built apart, have equal models", () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const [one] = fc.sample(states, { seed, numRuns: 1 })
      const [other] = fc.sample(states, { seed, numRuns: 1 })
      if (one === undefined || other === undefined) throw new Error("nothing sampled")
      expect(one).not.toBe(other)
      expect(Equal.equals(counter.makeModel(one), counter.makeModel(other))).toBe(true)
    }))
  })

  // #region drive
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
  // #endregion drive
})
