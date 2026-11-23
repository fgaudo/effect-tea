// Two sliders side by side, both drawn by the program: a native range changes its own value, bringing it within bounds
// that narrow, which no edit of the user reports, so the bridges support none, and a widget that changes its own value
// is replaced by one the program draws. Neither slider is an input: a press on its track starts a drag, a fixed message
// of the model, and the moves are the messages of a subscription keyed by the slider dragged, which `update` puts
// within the bounds it holds, whatever they were when the drag began. The media's bounds never change, and muting draws
// it at 0, with no press, without touching the level, which unmuting gives back; a mute ends a drag of it. The ringer's
// bounds narrow: quiet hours bring its maximum down to 30, under a drag in progress too.
import { defect, program, reject, type Subscription, type Update } from "@fgaudo/effect-tea"
import * as Channel from "effect/Channel"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"
import * as Stream from "effect/Stream"

/**
 * Where the pointer is along the track pressed, from 0 to 100, while it is held after the press that started a drag,
 * ending when it is released. The program knows only this interface: `main.ts` and the tests provide it.
 */
export class Pointer extends Context.Service<Pointer, { readonly moves: Stream.Stream<number> }>()(
  "examples/volume/Pointer"
) {}

/** Whether the media is heard: a muted one keeps its level, to give it back. */
export type Sound = Data.TaggedEnum<{
  Audible: object
  Muted: object
}>

export const Sound = Data.taggedEnum<Sound>()

/** How loud the ringer may go: quiet hours bring the maximum down. */
export type Limit = Data.TaggedEnum<{
  Full: object
  Quiet: object
}>

export const Limit = Data.taggedEnum<Limit>()

export const maxOf = (limit: Limit): number => limit._tag === "Quiet" ? 30 : 100

/** The two sliders. */
export type Slider = "Media" | "Ringer"

/** The pointer, on one slider at a time: one state machine, idle or dragging one of them. */
export type Drag = Data.TaggedEnum<{
  Idle: object
  Dragging: { slider: Slider }
}>

export const Drag = Data.taggedEnum<Drag>()

export type State = Readonly<{
  media: number
  sound: Sound
  ringer: number
  limit: Limit
  drag: Drag
}>

export type Message = Data.TaggedEnum<{
  MuteClicked: object
  UnmuteClicked: object
  QuietClicked: object
  FullClicked: object
  DragStarted: { slider: Slider }
  Moved: { at: number }
  DragEnded: object
}>

// Not exported, as the guide's "Model" says: a view sends only the messages its model holds, and builds none.
const Message = Data.taggedEnum<Message>()

// What the subscription of a drag sends: each move of the pointer, then the release, its last message.
const dragging: Subscription<Message, Pointer> = Channel.unwrap(
  Effect.map(Effect.service(Pointer), (pointer) =>
    Stream.toChannel(pointer.moves).pipe(
      Channel.flattenArray,
      Channel.map((at) => Message.Moved({ at })),
      Channel.mapDone(() => Message.DragEnded())
    ))
)

const within = (at: number, max: number) => Math.min(Math.max(Math.round(at), 0), max)

const dragged = (state: State): Opt.Option<Slider> =>
  state.drag._tag === "Dragging" ? Opt.some(state.drag.slider) : Opt.none()

export const update: Update<State, Message> = (message) => (state) => {
  switch (message._tag) {
    // A mute ends a drag of the media: the slider is drawn at 0, with no press.
    case "MuteClicked":
      return state.sound._tag === "Muted" ? reject : {
        state: {
          ...state,
          sound: Sound.Muted(),
          drag: Opt.contains(dragged(state), "Media") ? Drag.Idle() : state.drag
        }
      }
    case "UnmuteClicked":
      return state.sound._tag === "Audible" ? reject : { state: { ...state, sound: Sound.Audible() } }
    case "QuietClicked":
      return state.limit._tag === "Quiet"
        ? reject
        : { state: { ...state, ringer: within(state.ringer, maxOf(Limit.Quiet())), limit: Limit.Quiet() } }
    case "FullClicked":
      return state.limit._tag === "Full" ? reject : { state: { ...state, limit: Limit.Full() } }
    // A press on a view drawn before the last one ended may come while a drag goes on, or on the media's track
    // drawn before a mute: it starts nothing.
    case "DragStarted":
      return state.drag._tag === "Dragging" || (message.slider === "Media" && state.sound._tag === "Muted")
        ? reject
        : { state: { ...state, drag: Drag.Dragging({ slider: message.slider }) } }
    // A move comes only while dragging: the subscription that sends it stops with the drag, and the run drops what
    // it sent after. Anywhere else it is a bug, and the run dies with it.
    case "Moved":
      return Opt.match(dragged(state), {
        onNone: () => defect("A move of a slider while nothing was dragged"),
        onSome: (slider) =>
          slider === "Media"
            ? { state: { ...state, media: within(message.at, 100) } }
            : { state: { ...state, ringer: within(message.at, maxOf(state.limit)) } }
      })
    case "DragEnded":
      return state.drag._tag === "Dragging"
        ? { state: { ...state, drag: Drag.Idle() } }
        : defect("A drag ended while nothing was dragged")
  }
}

/** What a slider is drawn from: its level, how far it may go, and the press that starts a drag of it, while any may. */
export type Track = Readonly<{ level: number; max: number; press: Opt.Option<Message> }>

export type Model = Readonly<{
  media: Track
  sound:
    | Readonly<{ _tag: "Muted"; unmute: Message }>
    | Readonly<{ _tag: "Audible"; mute: Message }>
  ringer: Track
  limit:
    | Readonly<{ _tag: "Quiet"; full: Message }>
    | Readonly<{ _tag: "Full"; quiet: Message }>
}>

const press = (state: State, slider: Slider): Opt.Option<Message> =>
  state.drag._tag === "Idle" && !(slider === "Media" && state.sound._tag === "Muted")
    ? Opt.some(Message.DragStarted({ slider }))
    : Opt.none()

export const volume = program<{ state: State; model: Model; message: Message; key: Slider }>().make({
  init: { state: { media: 50, sound: Sound.Audible(), ringer: 80, limit: Limit.Full(), drag: Drag.Idle() } },
  update,
  subscriptions: (state) => Opt.toArray(dragged(state)),
  listen: () => dragging,
  makeModel: (state) => ({
    // Muted, the media's slider shows 0, and cannot be dragged.
    media: { level: state.sound._tag === "Muted" ? 0 : state.media, max: 100, press: press(state, "Media") },
    sound: state.sound._tag === "Muted"
      ? { _tag: "Muted", unmute: Message.UnmuteClicked() }
      : { _tag: "Audible", mute: Message.MuteClicked() },
    ringer: { level: state.ringer, max: maxOf(state.limit), press: press(state, "Ringer") },
    limit: state.limit._tag === "Quiet"
      ? { _tag: "Quiet", full: Message.FullClicked() }
      : { _tag: "Full", quiet: Message.QuietClicked() }
  })
})
