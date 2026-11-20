import { forwardTo, reject, start } from "@fgaudo/effect-tea"
import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import { applyAll, dispatchViolations } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as HashMap from "effect/HashMap"
import * as Opt from "effect/Option"
import * as TestClock from "effect/testing/TestClock"
import * as fc from "fast-check"
import { list, type Message, type Model, type State } from "./list.ts"
import * as Stopwatch from "./stopwatch.ts"
import { view } from "./view.ts"

const added: Message = { _tag: "AddClicked" }
const stoppedAll: Message = { _tag: "StopAllClicked" }
const to = (id: number, message: Stopwatch.Message): Message => ({ _tag: "Stopwatch", id, message })

const state: fc.Arbitrary<State> = fc
  .uniqueArray(
    fc.record({
      id: fc.nat(20),
      stopwatch: fc.record({
        seconds: fc.nat(),
        watch: fc.constantFrom(Stopwatch.Watch.Running(), Stopwatch.Watch.Stopped())
      })
    }),
    { selector: (entry) => entry.id, maxLength: 4 }
  )
  .map((entries) => ({ nextId: 21, entries }))

// What a stopwatch's model holds, then the list's: its own messages, and each stopwatch's with its id, wrapped as
// the list receives them. In the order the view draws them, for the test of the view below.
const stopwatchMessages = ({ watch, remove }: Stopwatch.Model): ReadonlyArray<Stopwatch.Message> => [
  watch._tag === "Running" ? watch.stop : watch.start,
  remove
]

const messagesOf = (model: Model): ReadonlyArray<Message> => [
  model.add,
  ...Opt.toArray(model.stopAll),
  ...model.stopwatches.flatMap(({ id, model }) => stopwatchMessages(model).map((message) => to(id, message)))
]

// What a user could ask of a stopwatch, a tag at a time: not the ticks, which only its clock sends. A halt is no
// message of the stopwatch: only the list sends it, through its `external`.
const stopwatchClicks: ReadonlyArray<Stopwatch.Message> = Object.values(
  {
    Started: [{ _tag: "Started" }],
    Stopped: [{ _tag: "Stopped" }],
    RemoveClicked: [{ _tag: "RemoveClicked" }],
    Ticked: []
  } satisfies { [Tag in Stopwatch.Message["_tag"]]: ReadonlyArray<Extract<Stopwatch.Message, { _tag: Tag }>> }
).flat()

// What a user can ask of the list in `state`, a tag at a time: adding, stopping all, and starting, stopping or
// removing each stopwatch. A new message of the list, or a new child, does not compile here until the test says
// what a user could ask with it.
const userMessages = (state: State): ReadonlyArray<Message> =>
  Object.values(
    {
      AddClicked: [{ _tag: "AddClicked" }],
      StopAllClicked: [{ _tag: "StopAllClicked" }],
      Stopwatch: state.entries.flatMap(({ id }) =>
        stopwatchClicks.map((message) => ({ _tag: "Stopwatch", id, message }))
      )
    } satisfies { [Tag in Message["_tag"]]: ReadonlyArray<Extract<Message, { _tag: Tag }>> }
  ).flat()

describe("list", () => {
  describe("update", () => {
    test("each stopwatch keeps its own state", () => {
      const { state } = applyAll(list.update)(
        [added, added, to(1, { _tag: "Started" }), to(1, { _tag: "Ticked" })],
        list.init.state
      )
      expect(state.entries).toEqual([
        { id: 1, stopwatch: { seconds: 1, watch: Stopwatch.Watch.Running() } },
        { id: 2, stopwatch: { seconds: 0, watch: Stopwatch.Watch.Stopped() } }
      ])
    })

    test("a stopwatch that asks to be removed is removed, and its late messages are rejected", () => {
      const { state } = applyAll(list.update)([added, added, to(1, { _tag: "RemoveClicked" })], list.init.state)
      expect(state.entries.map((entry) => entry.id)).toEqual([2])
      expect(list.update(to(1, { _tag: "Stopped" }))(state)).toBe(reject)
    })

    test("stopping all stops the running stopwatches and leaves the others as they were", () => {
      const { state } = applyAll(list.update)(
        [added, added, added, to(1, { _tag: "Started" }), to(3, { _tag: "Started" }), stoppedAll],
        list.init.state
      )
      expect(state.entries.map((entry) => entry.stopwatch.watch)).toEqual([
        Stopwatch.Watch.Stopped(),
        Stopwatch.Watch.Stopped(),
        Stopwatch.Watch.Stopped()
      ])
      expect(HashMap.size(list.subscriptions(state))).toBe(0)
    })

    test("only running stopwatches tick, each under its own key", () => {
      const { state } = applyAll(list.update)([added, added, to(2, { _tag: "Started" })], list.init.state)
      expect(Array.from(HashMap.keys(list.subscriptions(state)))).toEqual([["Stopwatch", 2, "ticks"]])
    })
  })

  test("the model holds what update accepts, all of it, and each acts once when sent twice", () => {
    fc.assert(fc.property(state, (before) => {
      expect(dispatchViolations(list.update, {
        state: before,
        held: messagesOf(list.makeModel(before)),
        candidates: userMessages(before),
        repeatable: (message) => message._tag === "AddClicked"
      })).toEqual([])
    }))
  })

  // Beyond what the library asks: that the view draws what its model holds, each control once and each stopwatch
  // through its own dispatch. `messagesSentBy`, beside the snabbdom bridge, is its way to see it without a DOM.
  test("the view sends what its model holds", () => {
    fc.assert(fc.property(state, (before) => {
      const model = list.makeModel(before)
      expect(messagesSentBy<Model, Message>(view, model)).toEqual(messagesOf(model))
    }))
  })

  // What lets the view draw only the stopwatch that changed: the others keep the very same model.
  test("a message to one stopwatch leaves the model of the others as it was", () => {
    const model = list.makeModel
    const { state: before } = applyAll(list.update)([added, added], list.init.state)
    const { state: after } = applyAll(list.update)([to(2, { _tag: "Started" })], before)
    expect(model(after).stopwatches[0]?.model).toBe(model(before).stopwatches[0]?.model)
    expect(model(after).stopwatches[1]?.model).not.toBe(model(before).stopwatches[1]?.model)
  })

  // As it runs, with a `TestClock`: a user adds a stopwatch and starts it, and time moves on.
  test("a running stopwatch counts the seconds that pass", async () => {
    let seconds = 0
    const app = start(list)
    const counted = Deferred.makeUnsafe<void>()
    app.subscribe(() => {
      seconds = app.model().stopwatches[0]?.model.seconds ?? 0
      if (seconds >= 3) Deferred.doneUnsafe(counted, Exit.void)
    })
    // A dispatch applies its message before it returns, before the run starts too: the model read next has the
    // stopwatch, and its subscription starts once the run does.
    app.dispatch(app.model().add)
    const [first] = app.model().stopwatches
    if (first !== undefined && first.model.watch._tag === "Stopped") {
      forwardTo(app.dispatch, "Stopwatch", first.id)(first.model.watch.start)
    }
    await Effect.runPromise(
      // The run is interrupted once three seconds have been counted.
      Effect.raceFirst(app.run, Deferred.await(counted)).pipe(
        // Time moves on until then, and the race ends with the run.
        Effect.raceFirst(Effect.forever(TestClock.adjust("1 second").pipe(Effect.andThen(Effect.yieldNow)))),
        Effect.provide(TestClock.layer())
      )
    )
    expect(seconds).toBeGreaterThanOrEqual(3)
  })
})
