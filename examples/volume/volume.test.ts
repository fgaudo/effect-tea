import { InvariantDefect, reject } from "@fgaudo/effect-tea"
import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import { applyAll, dispatchViolations, drive, rehearse } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"
import * as Stream from "effect/Stream"
import * as fc from "fast-check"
import { view } from "./view.ts"
import {
  Drag,
  Limit,
  type Message,
  type Model,
  Pointer,
  type Slider,
  Sound,
  type Span,
  type State,
  update,
  volume
} from "./volume.ts"

const start = volume.init.state

// Where the pointer is, and where the track lies, across the page: a track of no width is one the browser has not laid
// out, where a pointer is nowhere along it.
type Pressed = Readonly<{ clientX: number; left: number; width: number }>

const pressed: fc.Arbitrary<Pressed> = fc.record({
  clientX: fc.double({ min: -500, max: 1500, noNaN: true }),
  left: fc.double({ min: -500, max: 1000, noNaN: true }),
  width: fc.oneof(fc.constant(0), fc.double({ min: 1, max: 1000, noNaN: true }))
})

const span: fc.Arbitrary<Span> = pressed.map(({ left, width }) => ({ left, width }))

const state: fc.Arbitrary<State> = fc.record({
  media: fc.integer({ min: 0, max: 100 }),
  sound: fc.constantFrom(Sound.Audible(), Sound.Muted()),
  ringer: fc.integer({ min: 0, max: 100 }),
  limit: fc.constantFrom(Limit.Full(), Limit.Quiet()),
  drag: fc.oneof(
    fc.constant(Drag.Idle()),
    fc.record({ slider: fc.constantFrom<Slider>("Media", "Ringer"), track: span }).map(Drag.Dragging)
  )
})

// A press at `clientX` on a track that lies from 0 to 100 across the page, where the pointer is as far along it.
const press = (slider: Slider, clientX: number): Message => ({
  _tag: "DragStarted",
  slider,
  clientX,
  left: 0,
  width: 100
})

// What the model holds, with where the pointer is pressed and where the track lies filled in each press, as the view
// fills them: the messages of its buttons and of its tracks, in the order the view draws them, for the test of the view
// below. The moves of a drag are a subscription's.
const messagesOf = ({ sound, limit, media, ringer }: Model, at: Pressed): ReadonlyArray<Message> => [
  ...Opt.toArray(Opt.map(media.press, (press) => ({ ...press, ...at }))),
  sound._tag === "Muted" ? sound.unmute : sound.mute,
  ...Opt.toArray(Opt.map(ringer.press, (press) => ({ ...press, ...at }))),
  limit._tag === "Quiet" ? limit.full : limit.quiet
]

// What a key sends, as `messagesOf` says what the model holds: a drag sends a move to wherever the pointer is, and
// its release.
const heardFrom = (_: Slider, clientX: number): ReadonlyArray<Message> => [
  { _tag: "Moved", clientX },
  { _tag: "DragEnded" }
]

describe("volume", () => {
  // `update` alone: the rules, without running anything.
  describe("update", () => {
    test("a press sets the level where the pointer is along the track, and a drag follows it, within its bounds", () => {
      const at = { _tag: "DragStarted", slider: "Media", clientX: 230, left: 200, width: 60 } as const
      expect(applyAll(update)([at], start).state.media).toBe(50)
      const { state } = applyAll(update)([at, { _tag: "Moved", clientX: 248.24 }, { _tag: "DragEnded" }], start)
      expect(state).toMatchObject({ media: 80, drag: Drag.Idle() })
      expect(applyAll(update)([at, { _tag: "Moved", clientX: 300 }], start).state.media).toBe(100)
      const quiet = applyAll(update)([{ _tag: "QuietClicked" }, press("Ringer", 95)], start).state
      expect(quiet.ringer).toBe(30)
    })

    // A track that the browser has not laid out has no point along it: the drag starts, and leaves the level.
    test("a press on a track with no width starts a drag that moves nothing", () => {
      const flat = { _tag: "DragStarted", slider: "Ringer", clientX: 10, left: 0, width: 0 } as const
      const { state } = applyAll(update)([flat, { _tag: "Moved", clientX: 30 }], start)
      expect(state).toMatchObject({ ringer: 80, drag: { _tag: "Dragging", slider: "Ringer" } })
    })

    test("muting leaves the media's level as it is, and unmuting gives it back", () => {
      const muted = applyAll(update)([press("Media", 80), { _tag: "DragEnded" }, { _tag: "MuteClicked" }], start).state
      expect(muted).toMatchObject({ media: 80, sound: Sound.Muted() })
      expect(volume.makeModel(muted).media).toEqual({ level: 0, max: 100, press: Opt.none() })
      expect(volume.makeModel(applyAll(update)([{ _tag: "UnmuteClicked" }], muted).state).media.level).toBe(80)
    })

    // The track is drawn at 0 with no press: a drag of it would move a level nobody sees.
    test("a mute ends a drag of the media, and a press drawn before it starts none", () => {
      const muted = applyAll(update)([press("Media", 20), { _tag: "MuteClicked" }], start).state
      expect(muted.drag).toEqual(Drag.Idle())
      expect(update(press("Media", 40))(muted)).toBe(reject)
    })

    test("quiet hours bring a louder ringer down to their maximum, and full volume leaves it there", () => {
      const quiet = applyAll(update)([{ _tag: "QuietClicked" }], start).state
      expect(quiet).toMatchObject({ ringer: 30, limit: Limit.Quiet() })
      expect(applyAll(update)([{ _tag: "FullClicked" }], quiet).state.ringer).toBe(30)
    })

    // The moves are the program's own messages: each is put within the bounds the state holds when it arrives,
    // whatever they were when the drag began. No recipe is needed for bounds that narrow under a drag.
    test("a move of the ringer is put within the bounds of quiet hours that began during the drag", () => {
      const { state } = applyAll(update)(
        [
          press("Ringer", 50),
          { _tag: "Moved", clientX: 90 },
          { _tag: "QuietClicked" },
          { _tag: "Moved", clientX: 95 },
          { _tag: "Moved", clientX: 10 }
        ],
        start
      )
      expect(state.ringer).toBe(10)
      const quietened = applyAll(update)(
        [press("Ringer", 50), { _tag: "QuietClicked" }, { _tag: "Moved", clientX: 95 }],
        start
      )
      expect(quietened.state.ringer).toBe(30)
    })

    test("a second press while a slider is dragged starts nothing", () => {
      const dragging = applyAll(update)([press("Ringer", 50)], start).state
      expect(update(press("Ringer", 60))(dragging)).toBe(reject)
      expect(update(press("Media", 60))(dragging)).toBe(reject)
    })

    // Only a drag's subscription sends moves, and it stops with the drag: a move anywhere else is a bug.
    test("dies on a move, or a release, with nothing dragged", () => {
      expect(() => update({ _tag: "Moved", clientX: 40 })(start)).toThrow(InvariantDefect)
      expect(() => update({ _tag: "DragEnded" })(start)).toThrow(InvariantDefect)
    })
  })

  // The model, for any state and wherever the pointer is pressed: every message it holds is accepted, each acts once
  // when sent twice, and nothing `update` accepts is missing, but the moves, which no control sends. A press always
  // acts, since it starts a drag, so no value of it is `inert`.
  test("the model holds what update accepts, all of it, and each acts once when sent twice", () => {
    fc.assert(fc.property(state, pressed, (before, at) => {
      // A tag at a time, so that a new message does not compile here until the test says what a user could ask with
      // it: the moves and the release are a drag's subscription's. The presses are filled as the reader fills them.
      const candidates: ReadonlyArray<Message> = Object.values(
        {
          MuteClicked: [{ _tag: "MuteClicked" }],
          UnmuteClicked: [{ _tag: "UnmuteClicked" }],
          QuietClicked: [{ _tag: "QuietClicked" }],
          FullClicked: [{ _tag: "FullClicked" }],
          DragStarted: [
            { _tag: "DragStarted", slider: "Media", ...at },
            { _tag: "DragStarted", slider: "Ringer", ...at }
          ],
          Moved: [],
          DragEnded: []
        } satisfies { [Tag in Message["_tag"]]: ReadonlyArray<Extract<Message, { _tag: Tag }>> }
      ).flat()
      const held = messagesOf(volume.makeModel(before), at)
      expect(dispatchViolations(update, { state: before, held, candidates })).toEqual([])
    }))
  })

  // Beyond what the library asks: that the view draws what its model holds, each control once, and fills each press
  // with what the event and the track report. `messagesSentBy`, beside the snabbdom bridge, is its way to see it
  // without a DOM, given the same values as the reader.
  test("the view sends what its model holds", () => {
    fc.assert(fc.property(state, pressed, (before, at) => {
      const model = volume.makeModel(before)
      const reports = () => ({
        element: { getBoundingClientRect: () => ({ left: at.left, width: at.width }) },
        event: { clientX: at.clientX }
      })
      expect(messagesSentBy<Model, Message>(view, model, reports)).toEqual(messagesOf(model, at))
    }))
  })

  test("listens to a drag exactly while a slider is dragged, by the slider", () => {
    fc.assert(fc.property(state, (before) => {
      expect(volume.subscriptions(before))
        .toEqual(before.drag._tag === "Dragging" ? [before.drag.slider] : [])
    }))
  })

  // The keys, for any state: `update` accepts what each key the state lists may send, wherever the pointer is. No
  // control sends a key's messages, so only a rejection is asked of them: each may repeat, and a move to where the
  // slider is does nothing.
  test("update accepts what each key it listens to sends", () => {
    fc.assert(fc.property(state, fc.double({ min: -500, max: 1500, noNaN: true }), (before, clientX) => {
      const heard = Arr.flatMap(
        volume.subscriptions(before),
        (key) => heardFrom(key, clientX)
      )
      expect(dispatchViolations(update, { state: before, held: heard, repeatable: () => true, inert: () => true }))
        .toEqual([])
    }))
  })

  // The drag waits on the test: where the press sets the level, what each move does, and what quiet hours do to one
  // in progress. The ringer is pressed halfway along a track that lies from 0 to 100 across the page.
  test("a drag listens while the ringer is dragged, and its release ends it", async () => {
    const ringer = (model: Model) =>
      Opt.map(model.ringer.press, (press) => ({ ...press, clientX: 50, left: 0, width: 100 }))
    const heard = await Effect.runPromise(
      rehearse(
        volume,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.send(ringer)
          const pressedAt = (yield* rehearsal.model).ringer.level
          yield* rehearsal.hear("Ringer", { _tag: "Moved", clientX: 90 })
          const loud = (yield* rehearsal.model).ringer.level
          yield* rehearsal.send((model) => model.limit._tag === "Full" ? Opt.some(model.limit.quiet) : Opt.none())
          yield* rehearsal.hear("Ringer", { _tag: "Moved", clientX: 95 })
          const quiet = (yield* rehearsal.model).ringer.level
          yield* rehearsal.hear("Ringer", { _tag: "DragEnded" })
          return { pressedAt, loud, quiet, after: yield* rehearsal.model }
        })
      ).pipe(Effect.provideService(Pointer, Pointer.of({ moves: Stream.empty })))
    )
    expect(heard.pressedAt).toBe(50)
    expect(heard.loud).toBe(90)
    expect(heard.quiet).toBe(30)
    expect(heard.after.ringer.press).toEqual(Opt.some({ _tag: "DragStarted", slider: "Ringer" }))
  })

  // The program as it runs, driven like a user would, with a pointer pressed on a track that lies from 100 to 300
  // across the page, that moves twice and is released.
  test("a user drags the ringer, and the slider ends where the pointer was released", async () => {
    const ringer = await Effect.runPromise(
      drive(
        volume,
        Effect.fnUntraced(function*(driver) {
          yield* driver.send((model) =>
            Opt.map(model.ringer.press, (press) => ({ ...press, clientX: 120, left: 100, width: 200 }))
          )
          return yield* driver.waitFor((model) =>
            Opt.isSome(model.ringer.press) && model.ringer.level !== start.ringer
              ? Opt.some(model.ringer.level)
              : Opt.none()
          )
        })
      ).pipe(Effect.provideService(Pointer, Pointer.of({ moves: Stream.make(140, 228.8) })))
    )
    expect(ringer).toBe(64)
  })
})
