// Two sliders side by side: the media's, a native range, and the ringer's, which the program draws itself. The media
// level is an input, a plain number the user drags and the library stores; its bounds never change, and muting draws
// the slider at 0, disabled, without touching the level, which unmuting gives back. The ringer's bounds narrow: quiet
// hours bring its maximum down to 30, under a drag in progress too. A native range brings its value within bounds that
// narrow by itself, which no edit of the user reports, so it does not meet what the bridge asks of an element: a
// widget, native or not, that does not fit the bridge is replaced by one the program draws. The ringer is no input: a
// press on its track starts a drag, a fixed message of the model, and its moves are the messages of a subscription
// keyed by the state of dragging, which `update` puts within the bounds it holds, whatever they were when the drag
// began.
import { composition, defect, type MessageOf, type ModelOf, reject, type Subscription } from '@fgaudo/effect-tea'
import * as Channel from 'effect/Channel'
import * as Context from 'effect/Context'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Optic from 'effect/Optic'
import * as Stream from 'effect/Stream'

/**
 * Where the pointer is along the ringer's track, from 0 to 100, while it is held after the press that started a drag,
 * ending when it is released. The program knows only this interface: `main.ts` and the tests provide it.
 */
export class Pointer extends Context.Service<Pointer, { readonly moves: Stream.Stream<number> }>()(
  'examples/volume/Pointer',
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

export const maxOf = (limit: Limit): number => limit._tag === 'Quiet' ? 30 : 100

/** The ringer's slider: one state machine, idle or dragged. */
export type Drag = Data.TaggedEnum<{
  Idle: object
  Dragging: object
}>

export const Drag = Data.taggedEnum<Drag>()

export type State = Readonly<{
  media: number
  sound: Sound
  ringer: number
  limit: Limit
  drag: Drag
}>

/** The volume's own messages: where the media's slider is dragged is no message of the volume's. */
export type Own = Data.TaggedEnum<{
  MuteClicked: object
  UnmuteClicked: object
  QuietClicked: object
  FullClicked: object
  DragStarted: object
  Moved: { at: number }
  DragEnded: object
}>

// Not exported, as the README's "Model" says: a view sends only the messages its model holds, and builds none.
const Own = Data.taggedEnum<Own>()

// What the subscription of a drag sends: each move of the pointer, then the release, its last message.
const dragging: Subscription<Own, Pointer> = Channel.unwrap(
  Effect.map(Effect.service(Pointer), (pointer) =>
    Stream.toChannel(pointer.moves).pipe(
      Channel.flattenArray,
      Channel.map((at) => Own.Moved({ at })),
      Channel.mapDone(() => Own.DragEnded()),
    )),
)

const within = (at: number, limit: Limit) => Math.min(Math.max(Math.round(at), 0), maxOf(limit))

const { input, compose } = composition<{ state: State }>()

export const volume = compose({
  init: () => ({ state: { media: 50, sound: Sound.Audible(), ringer: 80, limit: Limit.Full(), drag: Drag.Idle() } }),
  inputs: { Media: input(Optic.id<State>().key('media')) },
  update: (message: Own) => (state) => {
    switch (message._tag) {
      case 'MuteClicked':
        return state.sound._tag === 'Muted' ? reject : { state: { ...state, sound: Sound.Muted() } }
      case 'UnmuteClicked':
        return state.sound._tag === 'Audible' ? reject : { state: { ...state, sound: Sound.Audible() } }
      case 'QuietClicked':
        return state.limit._tag === 'Quiet'
          ? reject
          : { state: { ...state, ringer: within(state.ringer, Limit.Quiet()), limit: Limit.Quiet() } }
      case 'FullClicked':
        return state.limit._tag === 'Full' ? reject : { state: { ...state, limit: Limit.Full() } }
      // A press on a frame drawn before the last one ended may come while a drag goes on: it starts nothing.
      case 'DragStarted':
        return state.drag._tag === 'Dragging' ? reject : { state: { ...state, drag: Drag.Dragging() } }
      // A move comes only while dragging: the subscription that sends it stops with the drag, and the run drops what
      // it sent after. Anywhere else it is a bug, and the run dies with it.
      case 'Moved':
        return state.drag._tag === 'Dragging'
          ? { state: { ...state, ringer: within(message.at, state.limit) } }
          : defect('A move of the ringer while nothing was dragged')
      case 'DragEnded':
        return state.drag._tag === 'Dragging'
          ? { state: { ...state, drag: Drag.Idle() } }
          : defect('A drag of the ringer ended while nothing was dragged')
    }
  },
  subscriptions: (state) => state.drag._tag === 'Dragging' ? HashMap.make(['ringer', dragging]) : HashMap.empty(),
  makeModel: (state) => ({
    // What the media's slider is drawn from and written over: the level held, or 0 while muted, which the slider
    // cannot be dragged from.
    media: state.sound._tag === 'Muted'
      ? { _tag: 'Fixed' as const, level: 0 }
      : { _tag: 'Adjustable' as const, level: state.media },
    sound: state.sound._tag === 'Muted'
      ? { _tag: 'Muted' as const, unmute: Own.UnmuteClicked() }
      : { _tag: 'Audible' as const, mute: Own.MuteClicked() },
    ringer: state.ringer,
    max: maxOf(state.limit),
    press: state.drag._tag === 'Idle' ? Opt.some(Own.DragStarted()) : Opt.none(),
    limit: state.limit._tag === 'Quiet'
      ? { _tag: 'Quiet' as const, full: Own.FullClicked() }
      : { _tag: 'Full' as const, quiet: Own.QuietClicked() },
  }),
})

export type Model = ModelOf<typeof volume>

/** The volume's messages, made by the library: its own, and `{ _tag: 'Media', message }` for what is dragged. */
export type Message = MessageOf<typeof volume>

export const update = volume.update
