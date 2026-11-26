import { reject } from "@fgaudo/effect-tea"
import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import { applyAll, dispatchViolations, stateOf } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as Equal from "effect/Equal"
import * as HashMap from "effect/HashMap"
import * as Opt from "effect/Option"
import * as fc from "fast-check"
import { type Message, type Model, namedTimers, type State } from "./named-timers.ts"
import { namedMessages } from "./named.test_reader.ts"
import * as Named from "./named.ts"
import * as Timer from "./timer.ts"
import { namedTimersView } from "./view.ts"

const to = (id: number, message: Named.Message): Message => ({ _tag: "Timer", id, message })

/** What the user types into the name of the timer `id`, which its model shows. */
const typing = (model: Model, id: number, text: string): Message => {
  const entry = model.timers.find((entry) => entry.id === id)
  if (entry === undefined) throw new Error(`no timer ${id} in the model`)
  return to(id, { ...entry.model.typed, value: text })
}

// What the model holds, in the order the view draws it: the list's own messages, and each timer's with its id,
// wrapped as the list receives them, what is typed filled with the text that `texts` gives for the name shown.
const messagesOf = (model: Model, texts: (name: string) => string): ReadonlyArray<Message> => [
  model.add,
  ...model.timers.flatMap(({ id, model, remove }) => [
    ...namedMessages(model, texts(model.name)).map((message) => to(id, message)),
    remove
  ])
]

// A text other than the name a timer shows: typing the name it holds changes nothing.
const over = (name: string) => `${name}1`

const state: fc.Arbitrary<State> = fc
  .uniqueArray(
    fc.record({
      id: fc.nat(20),
      timer: fc.record({
        name: fc.string(),
        timer: fc.record({
          minutes: fc.constantFrom(1, 2),
          phase: fc.constantFrom(
            Timer.Phase.Setting(),
            Timer.Phase.Running({ secondsLeft: 30 }),
            Timer.Phase.Paused({ secondsLeft: 30 }),
            Timer.Phase.Finished()
          )
        })
      })
    }),
    { selector: (entry) => entry.id, maxLength: 4 }
  )
  // A named timer is a parent too: its state is made as the list's is, from its own and from its timer's.
  .map((entries) =>
    stateOf(namedTimers, { nextId: 21, ids: entries.map((entry) => entry.id) }, {
      Timer: entries.map((entry) =>
        [entry.id, stateOf(Named.named, { name: entry.timer.name }, { Timer: entry.timer.timer })] as const
      )
    })
  )

/** The named timers that the library keeps, in the order the list holds their ids in: each name, and its timer. */
const kept = (state: State) =>
  state.own.ids.map((id) => {
    const named = Opt.getOrThrow(HashMap.get(state.children.Timer, id)).state
    return { name: named.own.name, timer: Opt.getOrThrow(named.children.Timer).state }
  })

// What a user could ask of a named timer, a tag at a time: what is typed, with the text given, and its timer's clicks.
const namedCandidates = (text: string): ReadonlyArray<Named.Message> =>
  Object.values(
    {
      NameTyped: [{ _tag: "NameTyped", value: text }],
      Timer: Object.values(
        {
          MoreClicked: [{ _tag: "MoreClicked" }],
          LessClicked: [{ _tag: "LessClicked" }],
          StartClicked: [{ _tag: "StartClicked" }],
          PauseClicked: [{ _tag: "PauseClicked" }],
          ResumeClicked: [{ _tag: "ResumeClicked" }],
          ResetClicked: [{ _tag: "ResetClicked" }],
          // Only the clock sends it.
          Ticked: []
        } satisfies { [Tag in Timer.Message["_tag"]]: ReadonlyArray<Extract<Timer.Message, { _tag: Tag }>> }
      ).flat().map((message) => ({ _tag: "Timer", message }) as const)
    } satisfies { [Tag in Named.Message["_tag"]]: ReadonlyArray<Extract<Named.Message, { _tag: Tag }>> }
  ).flat()

// What a user can ask of the list, a tag at a time: adding a timer, and removing or using each one, what is typed
// into its name a text other than the one it shows.
const candidatesOf = (model: Model): ReadonlyArray<Message> =>
  Object.values(
    {
      AddClicked: [{ _tag: "AddClicked" }],
      RemoveClicked: model.timers.map(({ id }) => ({ _tag: "RemoveClicked", id })),
      Timer: model.timers.flatMap(({ id, model }) =>
        namedCandidates(over(model.name)).map((message) => ({ _tag: "Timer", id, message }))
      )
    } satisfies { [Tag in Message["_tag"]]: ReadonlyArray<Extract<Message, { _tag: Tag }>> }
  ).flat()

describe("named timers", () => {
  test("each timer keeps its own name", () => {
    const added = applyAll(namedTimers.update, [{ _tag: "AddClicked" }], namedTimers.init.state).state
    const drawn = namedTimers.makeModel(added)
    const { state, commands } = applyAll(namedTimers.update, [
      typing(drawn, 1, "Tea"),
      typing(drawn, 2, "Pasta")
    ], added)
    expect(state.own).toEqual({ nextId: 3, ids: [1, 2] })
    expect(kept(state)).toEqual([
      { name: "Tea", timer: Timer.timer.init.state },
      { name: "Pasta", timer: Timer.timer.init.state }
    ])
    expect(commands).toEqual([])
  })

  test("a removed timer is gone, and a name typed into it is rejected", () => {
    const drawn = namedTimers.makeModel(namedTimers.init.state)
    const { state, commands } = applyAll(namedTimers.update, [{ _tag: "RemoveClicked", id: 1 }], namedTimers.init.state)
    expect(state.own).toEqual({ nextId: 2, ids: [] })
    expect(kept(state)).toEqual([])
    expect(commands).toEqual([])
    expect(namedTimers.update(typing(drawn, 1, "Tea"))(state)).toBe(reject)
  })

  test("the model holds what update accepts, all of it, and each acts once when sent twice", () => {
    fc.assert(fc.property(state, (before) => {
      const model = namedTimers.makeModel(before)
      expect(dispatchViolations(namedTimers.update, {
        state: before,
        held: messagesOf(model, over),
        candidates: candidatesOf(model),
        repeatable: (message) =>
          message._tag === "AddClicked"
          || (message._tag === "Timer" && message.message._tag === "Timer"
            && (message.message.message._tag === "MoreClicked" || message.message.message._tag === "LessClicked"))
      })).toEqual([])
    }))
  })

  // For any state, the timers that run tick, each under its own key, and no other: the test reads the child, its id
  // and its timer, by id, and leaves the numbers of their instances, and the order of the keys, to the library.
  test("listens to the ticks of the running timers, and of no other", () => {
    fc.assert(fc.property(state, (before) => {
      const running = before.own.ids.filter((id, i) => kept(before)[i]?.timer.phase._tag === "Running")
      const heard = namedTimers.subscriptions(before).map(({ _tag, id, key }) => ({
        _tag,
        id,
        key: { _tag: key._tag, key: key.key }
      }))
      expect([...heard].sort((a, b) => a.id - b.id)).toEqual(
        [...running].sort((a, b) => a - b).map((id) => ({ _tag: "Timer", id, key: { _tag: "Timer", key: "ticks" } }))
      )
    }))
  })

  // The view, checked with the tools of its renderer: `messagesSentBy`, of the snabbdom bridge, finds what the view
  // sends without a DOM, each timer through its own dispatch, its name's field first, with the name it holds, which
  // the test compares with what the reader returns.
  test("the view sends what its model holds", () => {
    fc.assert(fc.property(state, (before) => {
      const model = namedTimers.makeModel(before)
      expect(messagesSentBy<Model, Message>(namedTimersView, model)).toEqual(messagesOf(model, (name) => name))
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
      expect(Equal.equals(namedTimers.makeModel(one), namedTimers.makeModel(other))).toBe(true)
    }))
  })
})
