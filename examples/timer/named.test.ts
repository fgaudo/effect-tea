import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import { applyAll, dispatchViolations, rehearse, stateOf } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Opt from "effect/Option"
import * as fc from "fast-check"
import { namedMessages } from "./named.test_reader.ts"
import { type Message, type Model, named, type State } from "./named.ts"
import * as Timer from "./timer.ts"
import { namedView } from "./view.ts"

const state: fc.Arbitrary<State> = fc.record({
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
}).map(({ name, timer }) => stateOf(named, { name }, { Timer: timer }))

// #region candidates
// What a user could ask of a named timer, a tag at a time: what is typed, with the text given, and its timer's clicks,
// wrapped.
const candidatesOf = (text: string): ReadonlyArray<Message> =>
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
    } satisfies { [Tag in Message["_tag"]]: ReadonlyArray<Extract<Message, { _tag: Tag }>> }
  ).flat()
// #endregion candidates

const silent = Timer.Bell.of({ ring: Effect.void })

describe("named", () => {
  // #region update
  test("a name typed is stored", () => {
    const start = named.init.state
    const { state } = applyAll(named.update, [{ _tag: "NameTyped", value: "Tea" }], start)
    expect(state).toEqual({ ...start, own: { name: "Tea" } })
  })
  // #endregion update

  // #region violations
  // What is typed is filled with a text other than the name the model shows: the same text would change nothing.
  test("the model holds what update accepts, all of it, and each acts once when sent twice", () => {
    fc.assert(fc.property(state, (before) => {
      const model = named.makeModel(before)
      expect(dispatchViolations(named.update, {
        state: before,
        held: namedMessages(model, `${model.name}1`),
        candidates: candidatesOf(`${model.name}1`),
        repeatable: (message) =>
          message._tag === "Timer"
          && (message.message._tag === "MoreClicked" || message.message._tag === "LessClicked")
      })).toEqual([])
    }))
  })
  // #endregion violations

  // For any state, the ticks of its timer while the timer runs: the test reads the child, and leaves the number of its
  // instance to the library.
  test("listens to the ticks of its timer exactly while the timer runs", () => {
    fc.assert(fc.property(state, (before) => {
      const running = Opt.getOrThrow(before.children.Timer).state.phase._tag === "Running"
      expect(named.subscriptions(before).map(({ _tag, key }) => ({ _tag, key })))
        .toEqual(running ? [{ _tag: "Timer", key: "ticks" }] : [])
    }))
  })

  // The view, checked with the tools of its renderer: `messagesSentBy`, of the snabbdom bridge, finds what the view
  // sends without a DOM, the field's with the name the model holds, as its element is drawn with it, which the test
  // compares with what the reader returns.
  test("the view sends what its model holds", () => {
    fc.assert(fc.property(state, (before) => {
      const model = named.makeModel(before)
      expect(messagesSentBy<Model, Message>(namedView, model)).toEqual(namedMessages(model, model.name))
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
      expect(Equal.equals(named.makeModel(one), named.makeModel(other))).toBe(true)
    }))
  })

  // #region rehearse
  // What is typed is sent from the model, filled as the view fills it, and so is the click on "Start".
  test("a user names a timer, then starts it", async () => {
    const started = await Effect.runPromise(
      rehearse(
        named,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.send(({ typed }) => Opt.some({ ...typed, value: "Tea" }))
          yield* rehearsal.send(({ timer }): Opt.Option<Message> =>
            timer._tag === "Setting" ? Opt.some({ _tag: "Timer", message: timer.start }) : Opt.none()
          )
          return yield* rehearsal.model
        })
      ).pipe(Effect.provideService(Timer.Bell, silent))
    )
    expect(started.name).toBe("Tea")
    expect(started.timer._tag).toBe("Running")
  })
  // #endregion rehearse
})
