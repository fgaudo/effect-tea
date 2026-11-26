// #region imports
import { InvariantDefect, reject } from "@fgaudo/effect-tea"
import { applyAll, dispatchViolations, rehearse } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Opt from "effect/Option"
import * as fc from "fast-check"
import { timerMessages } from "./timer.test_reader.ts"
import { Bell, Command, type Message, Phase, type State, timer, update } from "./timer.ts"
// #endregion imports

// #region states
// Any valid state: every phase, with no more seconds left than the minutes set.
const state: fc.Arbitrary<State> = fc.integer({ min: 1, max: 120 }).chain((minutes) =>
  fc.record({
    minutes: fc.constant(minutes),
    phase: fc.oneof(
      fc.constant(Phase.Setting()),
      fc.integer({ min: 1, max: minutes * 60 }).map((secondsLeft) => Phase.Running({ secondsLeft })),
      fc.integer({ min: 1, max: minutes * 60 }).map((secondsLeft) => Phase.Paused({ secondsLeft })),
      fc.constant(Phase.Finished())
    )
  })
)

const setting = timer.init.state
// #endregion states

// #region candidates
// What a user could ask of a timer, a tag at a time: everything but the ticks, which only the clock sends. A new
// message of the timer does not compile here until the test says what a user could ask with it.
const userMessages: ReadonlyArray<Message> = Object.values(
  {
    MoreClicked: [{ _tag: "MoreClicked" }],
    LessClicked: [{ _tag: "LessClicked" }],
    StartClicked: [{ _tag: "StartClicked" }],
    PauseClicked: [{ _tag: "PauseClicked" }],
    ResumeClicked: [{ _tag: "ResumeClicked" }],
    ResetClicked: [{ _tag: "ResetClicked" }],
    Ticked: []
  } satisfies { [Tag in Message["_tag"]]: ReadonlyArray<Extract<Message, { _tag: Tag }>> }
).flat()
// #endregion candidates

describe("timer", () => {
  // #region update
  describe("update", () => {
    test("sets the minutes, never below one", () => {
      expect(update({ _tag: "MoreClicked" })(setting)).toEqual({ state: { ...setting, minutes: 26 } })
      expect(update({ _tag: "LessClicked" })({ ...setting, minutes: 2 })).toEqual({ state: { ...setting, minutes: 1 } })
      expect(update({ _tag: "LessClicked" })({ ...setting, minutes: 1 })).toBe(reject)
    })

    test("starts from the minutes set, and rings once at zero", () => {
      const { state, commands, events } = applyAll(update, [
        { _tag: "StartClicked" },
        ...Array.from({ length: 60 }, (): Message => ({ _tag: "Ticked" }))
      ], { ...setting, minutes: 1 })
      expect(state).toEqual({ minutes: 1, phase: Phase.Finished() })
      expect(commands).toEqual([Command.Ring()])
      expect(events).toEqual([])
    })

    test("pauses and resumes with the seconds left", () => {
      const running = { ...setting, phase: Phase.Running({ secondsLeft: 90 }) }
      const paused = { ...setting, phase: Phase.Paused({ secondsLeft: 90 }) }
      expect(update({ _tag: "PauseClicked" })(running)).toEqual({ state: paused })
      expect(update({ _tag: "ResumeClicked" })(paused)).toEqual({ state: running })
    })

    test("a reset sets the minutes again as they were, from any phase but setting", () => {
      fc.assert(fc.property(state, (before) => {
        fc.pre(before.phase._tag !== "Setting")
        expect(update({ _tag: "ResetClicked" })(before)).toEqual({ state: { ...before, phase: Phase.Setting() } })
      }))
      expect(update({ _tag: "ResetClicked" })(setting)).toBe(reject)
    })

    test("rejects a second start, and changing the minutes while running", () => {
      const { state } = applyAll(update, [{ _tag: "StartClicked" }], setting)
      expect(update({ _tag: "StartClicked" })(state)).toBe(reject)
      expect(update({ _tag: "MoreClicked" })(state)).toBe(reject)
    })

    // A tick outside the running phase cannot arrive: the subscription stops with it.
    test("dies on a tick while not running", () => {
      fc.assert(fc.property(state, (before) => {
        fc.pre(before.phase._tag !== "Running")
        expect(() => update({ _tag: "Ticked" })(before)).toThrow(InvariantDefect)
      }))
    })
  })
  // #endregion update

  // #region subscriptions
  test("ticks exactly while running", () => {
    fc.assert(fc.property(state, (before) => {
      expect(timer.subscriptions(before)).toEqual(before.phase._tag === "Running" ? ["ticks"] : [])
    }))
  })
  // #endregion subscriptions

  // #region model
  // For any state, the model holds only what `update` accepts, and all of it. "+" and "−" are meant to repeat.
  test("the model holds what update accepts, all of it, and each acts once when sent twice", () => {
    fc.assert(fc.property(state, (before) => {
      expect(dispatchViolations(update, {
        state: before,
        held: timerMessages(timer.makeModel(before)),
        candidates: userMessages,
        repeatable: (message) => message._tag === "MoreClicked" || message._tag === "LessClicked"
      })).toEqual([])
    }))
  })
  // #endregion model

  // Two equal states built apart, by the same seed drawn twice, give two equal models, which a function in a model
  // would break, being made anew by each `makeModel`.
  test("the model is data: equal states, built apart, have equal models", () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const [one] = fc.sample(state, { seed, numRuns: 1 })
      const [other] = fc.sample(state, { seed, numRuns: 1 })
      if (one === undefined || other === undefined) throw new Error("nothing sampled")
      expect(one).not.toBe(other)
      expect(Equal.equals(timer.makeModel(one), timer.makeModel(other))).toBe(true)
    }))
  })

  // #region rehearse
  // The last second, step by step: the test says when the tick is heard and when the bell rings.
  test("rings when the time is up, and sets again on \"Again\"", async () => {
    let rings = 0
    const bell = Bell.of({ ring: Effect.sync(() => rings++) })
    const finished = await Effect.runPromise(
      rehearse(
        { ...timer, init: { state: { minutes: 1, phase: Phase.Running({ secondsLeft: 1 }) } } },
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hear("ticks", { _tag: "Ticked" })
          const finished = (yield* rehearsal.model)._tag
          expect(rings).toBe(0)
          yield* rehearsal.run((command) => command._tag === "Ring")
          yield* rehearsal.send((model) => model._tag === "Finished" ? Opt.some(model.reset) : Opt.none())
          expect((yield* rehearsal.model)._tag).toBe("Setting")
          return finished
        })
      ).pipe(Effect.provideService(Bell, bell))
    )
    expect(finished).toBe("Finished")
    expect(rings).toBe(1)
  })
  // #endregion rehearse
})
