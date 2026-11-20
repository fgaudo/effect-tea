import { reject } from "@fgaudo/effect-tea"
import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import { applyAll, dispatchViolations, rehearse } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
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
})

// #region candidates
// What a user could ask of a named timer, a tag at a time: its timer's clicks, wrapped, and nothing of the name's,
// since what is typed is the input's, which the library rules on, and the model holds no message for it.
const userMessages: ReadonlyArray<Message> = Object.values(
  {
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
    ).flat().map((message) => ({ _tag: "Timer", message }) as const),
    Name: []
  } satisfies { [Tag in Message["_tag"]]: ReadonlyArray<Extract<Message, { _tag: Tag }>> }
).flat()
// #endregion candidates

// #region typing
/** What the user types into the name the model shows, as the view sends it: written over the value it holds. */
const typing = (model: Model, text: string): Message => ({
  _tag: "Name",
  message: { _tag: "Written", was: model.name, value: text }
})
// #endregion typing

const silent = Timer.Bell.of({ ring: Effect.void })

describe("named", () => {
  // #region update
  // An input keeps nothing of its own: the state stored is the state written, which a test compares whole.
  test("a name written over the one the model shows is stored", () => {
    const start = named.init.state
    const { state } = applyAll(named.update)([typing(named.makeModel(start), "Tea")], start)
    expect(state).toEqual({ ...start, name: "Tea" })
  })

  test("a write over a name already replaced is rejected", () => {
    const start = named.init.state
    const drawn = named.makeModel(start)
    const { state } = applyAll(named.update)([typing(drawn, "Tea")], start)
    // Written over the empty name, which "Tea" has replaced.
    expect(named.update(typing(drawn, "Pasta"))(state)).toBe(reject)
  })
  // #endregion update

  test("the model holds what update accepts, all of it, and each acts once when sent twice", () => {
    fc.assert(fc.property(state, (before) => {
      expect(dispatchViolations(named.update, {
        state: before,
        held: namedMessages(named.makeModel(before)),
        candidates: userMessages,
        repeatable: (message) =>
          message._tag === "Timer"
          && (message.message._tag === "MoreClicked" || message.message._tag === "LessClicked")
      })).toEqual([])
    }))
  })

  // Beyond what the library asks: that the view draws what its model holds, and the input over the name the model
  // holds. `messagesSentBy`, beside the snabbdom bridge, is its way to see it without a DOM: the input's write holds the
  // value its element is drawn with, so it is written over that value, with that value.
  test("the view sends what its model holds", () => {
    fc.assert(fc.property(state, (before) => {
      const model = named.makeModel(before)
      expect(messagesSentBy<Model, Message>(namedView, model)).toEqual([
        typing(model, model.name),
        ...namedMessages(model)
      ])
    }))
  })

  // #region rehearse
  // The write is sent from the model, as the view sends it, and so is the click on "Start".
  test("a user names a timer, then starts it", async () => {
    const started = await Effect.runPromise(
      rehearse(
        named,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.send((model) => Opt.some(typing(model, "Tea")))
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
