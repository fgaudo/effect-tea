import { reject } from "@fgaudo/effect-tea"
import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import { applyAll, dispatchViolations } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as Equal from "effect/Equal"
import * as Opt from "effect/Option"
import * as fc from "fast-check"
import { duration, type Message, type Model, type State, update } from "./duration.ts"
import { durationView } from "./view.ts"

// Any valid state: one minute or more.
const state: fc.Arbitrary<State> = fc.integer({ min: 1, max: 1_000 }).map((minutes) => ({ minutes }))

// What the model holds: the messages of its controls, in the order the view draws them, for the test of the view
// below.
const messagesOf = (model: Model): ReadonlyArray<Message> => [...Opt.toArray(model.less), model.more]

describe("duration", () => {
  test("adds a minute", () => {
    expect(applyAll(update, ["More"], { minutes: 1 }).state).toEqual({ minutes: 2 })
  })

  test("takes a minute away, and rejects going below one", () => {
    expect(applyAll(update, ["Less"], { minutes: 2 }).state).toEqual({ minutes: 1 })
    expect(update("Less")({ minutes: 1 })).toBe(reject)
  })

  test("the model holds what update accepts, all of it", () => {
    fc.assert(fc.property(state, (before) => {
      expect(dispatchViolations(update, {
        state: before,
        held: messagesOf(duration.makeModel(before)),
        candidates: ["More", "Less"],
        repeatable: () => true
      })).toEqual([])
    }))
  })

  // The view, checked with the tools of its renderer: `messagesSentBy`, of the snabbdom bridge, finds what the view
  // sends without a DOM, each control once, which the test compares with what the reader returns.
  test("the view sends what its model holds", () => {
    fc.assert(fc.property(state, (before) => {
      const model = duration.makeModel(before)
      expect(messagesSentBy<Model, Message>(durationView, model)).toEqual(messagesOf(model))
    }))
  })

  // Two equal states built apart, by the same seed drawn twice, give two equal models, which a function in a model
  // would break, being made anew by each `makeModel`.
  test("the model is data: equal states, built apart, have equal models", () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const [one] = fc.sample(state, { seed, numRuns: 1 })
      const [other] = fc.sample(state, { seed, numRuns: 1 })
      if (one === undefined || other === undefined) throw new Error("nothing sampled")
      expect(one).not.toBe(other)
      expect(Equal.equals(duration.makeModel(one), duration.makeModel(other))).toBe(true)
    }))
  })
})
