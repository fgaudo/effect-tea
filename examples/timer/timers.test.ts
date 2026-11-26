import { reject } from "@fgaudo/effect-tea"
import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import { applyAll, dispatchViolations, stateOf } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as Equal from "effect/Equal"
import * as HashMap from "effect/HashMap"
import * as Opt from "effect/Option"
import * as fc from "fast-check"
import { timerMessages } from "./timer.test_reader.ts"
import * as Timer from "./timer.ts"
import { type Message, type Model, type State, timers } from "./timers.ts"
import { view } from "./view.ts"

// #region messages
const added: Message = { _tag: "AddClicked" }
const removed = (id: number): Message => ({ _tag: "RemoveClicked", id })
const to = (id: number, message: Timer.Message): Message => ({ _tag: "Timer", id, message })
// #endregion messages

// #region reader
// What the model holds: the list's own messages, and each timer's with its id, wrapped as the list receives them.
const messagesOf = (model: Model): ReadonlyArray<Message> => [
  model.add,
  ...model.timers.flatMap(({ id, model, remove }) => [
    ...timerMessages(model).map((message) => to(id, message)),
    remove
  ])
]
// #endregion reader

const state: fc.Arbitrary<State> = fc
  .uniqueArray(
    fc.record({
      id: fc.nat(20),
      timer: fc.record({
        minutes: fc.constantFrom(1, 2),
        phase: fc.constantFrom(
          Timer.Phase.Setting(),
          Timer.Phase.Running({ secondsLeft: 30 }),
          Timer.Phase.Paused({ secondsLeft: 30 }),
          Timer.Phase.Finished()
        )
      })
    }),
    { selector: (entry) => entry.id, maxLength: 4 }
  )
  .map((entries) =>
    stateOf(timers, { nextId: 21, ids: entries.map((entry) => entry.id) }, {
      Timer: entries.map((entry) => [entry.id, entry.timer] as const)
    })
  )

/** The timers that the library keeps, in the order the list holds their ids in. */
const kept = (state: State) => state.own.ids.map((id) => Opt.getOrThrow(HashMap.get(state.children.Timer, id)).state)

// What a user could ask of a timer, a tag at a time: everything but the ticks, which only the clock sends.
const timerClicks: ReadonlyArray<Timer.Message> = Object.values(
  {
    MoreClicked: [{ _tag: "MoreClicked" }],
    LessClicked: [{ _tag: "LessClicked" }],
    StartClicked: [{ _tag: "StartClicked" }],
    PauseClicked: [{ _tag: "PauseClicked" }],
    ResumeClicked: [{ _tag: "ResumeClicked" }],
    ResetClicked: [{ _tag: "ResetClicked" }],
    Ticked: []
  } satisfies { [Tag in Timer.Message["_tag"]]: ReadonlyArray<Extract<Timer.Message, { _tag: Tag }>> }
).flat()

// What a user can ask of the list, a tag at a time: adding a timer, and removing or using each one. A new message
// of the list, or a new child, does not compile here until the test says what a user could ask with it.
const userMessages = (state: State): ReadonlyArray<Message> =>
  Object.values(
    {
      AddClicked: [{ _tag: "AddClicked" }],
      RemoveClicked: state.own.ids.map((id) => ({ _tag: "RemoveClicked", id })),
      Timer: state.own.ids.flatMap((id) => timerClicks.map((message) => ({ _tag: "Timer", id, message })))
    } satisfies { [Tag in Message["_tag"]]: ReadonlyArray<Extract<Message, { _tag: Tag }>> }
  ).flat()

describe("timers", () => {
  // #region update
  test("each timer keeps its own state", () => {
    const { state, commands } = applyAll(timers.update, [added, to(2, { _tag: "StartClicked" })], timers.init.state)
    expect(state.own).toEqual({ nextId: 3, ids: [1, 2] })
    expect(kept(state)).toEqual([
      { minutes: 25, phase: Timer.Phase.Setting() },
      { minutes: 25, phase: Timer.Phase.Running({ secondsLeft: 1500 }) }
    ])
    expect(commands).toEqual([])
  })

  test("a removed timer is gone, and a second click on \"Remove\" is rejected", () => {
    const { state, commands } = applyAll(timers.update, [added, removed(1)], timers.init.state)
    expect(state.own).toEqual({ nextId: 3, ids: [2] })
    expect(kept(state)).toEqual([{ minutes: 25, phase: Timer.Phase.Setting() }])
    expect(commands).toEqual([])
    expect(timers.update(removed(1))(state)).toBe(reject)
    expect(timers.update(to(1, { _tag: "StartClicked" }))(state)).toBe(reject)
  })

  test("only running timers tick, each under its own key", () => {
    const { state } = applyAll(timers.update, [added, to(2, { _tag: "StartClicked" })], timers.init.state)
    expect(timers.subscriptions(state)).toEqual([{ _tag: "Timer", id: 2, instance: 2, key: "ticks" }])
  })
  // #endregion update

  test("the model holds what update accepts, all of it, and each acts once when sent twice", () => {
    fc.assert(fc.property(state, (before) => {
      expect(dispatchViolations(timers.update, {
        state: before,
        held: messagesOf(timers.makeModel(before)),
        candidates: userMessages(before),
        repeatable: (message) =>
          message._tag === "AddClicked"
          || (message._tag === "Timer"
            && (message.message._tag === "MoreClicked" || message.message._tag === "LessClicked"))
      })).toEqual([])
    }))
  })

  // For any state, the timers that run tick, each under its own key, and no other: the test reads the child and its
  // id, by id, and leaves the number of its instance, and the order of the keys, to the library.
  test("listens to the ticks of the running timers, and of no other", () => {
    fc.assert(fc.property(state, (before) => {
      const running = before.own.ids.filter((id, i) => kept(before)[i]?.phase._tag === "Running")
      const heard = timers.subscriptions(before).map(({ _tag, id, key }) => ({ _tag, id, key }))
      expect([...heard].sort((a, b) => a.id - b.id))
        .toEqual([...running].sort((a, b) => a - b).map((id) => ({ _tag: "Timer", id, key: "ticks" })))
    }))
  })

  // The view, checked with the tools of its renderer: `messagesSentBy`, of the snabbdom bridge, finds what the view
  // sends without a DOM, each control once and each timer through its own dispatch, in every phase, which the test
  // compares with what the reader returns.
  test("the view sends what its model holds", () => {
    fc.assert(fc.property(state, (before) => {
      const model = timers.makeModel(before)
      expect(messagesSentBy<Model, Message>(view, model)).toEqual(messagesOf(model))
    }))
  })

  // Two equal states built apart, by the same seed drawn twice, give two equal models, which a function in a model
  // would break, being made anew by each `makeModel`. Each is built by `stateOf`, so that no child's model is kept
  // from the other.
  test("the model is data: equal states, built apart, have equal models", () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const [one] = fc.sample(state, { seed, numRuns: 1 })
      const [other] = fc.sample(state, { seed, numRuns: 1 })
      if (one === undefined || other === undefined) throw new Error("nothing sampled")
      expect(one).not.toBe(other)
      expect(Equal.equals(timers.makeModel(one), timers.makeModel(other))).toBe(true)
    }))
  })
})
