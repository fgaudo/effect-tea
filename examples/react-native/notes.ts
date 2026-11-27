// A list of notes, and a page over it that shows one. The page is a child declared with `childWhen`, started again at
// each visit. A press of the device's back button cancels the page's edit, or closes the page: the parent reads which
// from the page's output, and listens to the button only while the page is there to take the press. The header closes
// the page only where it shows no edit.
import {
  defect,
  type MessageOf,
  type ModelOf,
  program,
  reject,
  type StateOf,
  type Subscription
} from "@fgaudo/effect-tea"
import * as Arr from "effect/Array"
import * as Channel from "effect/Channel"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"
import * as Stream from "effect/Stream"
import * as Note from "./note.ts"

/**
 * The device's back button, as the program knows it: each press, while the stream is pulled, is taken, and goes no
 * further. `App.tsx` provides it with React Native's `BackHandler`, and the tests with presses of their own.
 */
export class BackButton extends Context.Service<BackButton, { readonly presses: Stream.Stream<void> }>()(
  "examples/react-native/BackButton"
) {}

/** The parent's own state: the notes, and the one open, by its place in the list. */
export type Own = Readonly<{ notes: ReadonlyArray<string>; open: Opt.Option<number> }>

type OwnMessage = Data.TaggedEnum<{
  NoteOpened: { index: number }
  CloseClicked: object
  BackPressed: object
}>

// Not exported, so that no view calls its constructors, as the guide's "Model" says.
const OwnMessage = Data.taggedEnum<OwnMessage>()

const { childWhen, withChildren } = program<{ state: Own; message: OwnMessage; key: "back" }>()

const backPressed: Subscription<OwnMessage, BackButton> = Channel.unwrap(
  Effect.map(Effect.service(BackButton), (button) =>
    Stream.toChannel(button.presses).pipe(
      Channel.flattenArray,
      Channel.map(() => OwnMessage.BackPressed()),
      Channel.concatWith(() => Channel.die(new Error("The back button stopped")))
    ))
)

export const notes = withChildren({
  // There while a note is open, and started from its text: a note opened again starts again.
  Note: childWhen(Note.note, {
    there: (state) => Opt.flatMap(state.open, (index) => Opt.map(Arr.get(state.notes, index), (text) => ({ text })))
  })
}).make({
  init: { state: { notes: ["Milk", "Call the plumber", "Return the books"], open: Opt.none() } },
  update: (message, children) => (state) => {
    switch (message._tag) {
      // A second tap, from the list still on screen as the page opens, changes nothing.
      case "NoteOpened":
        return Opt.isSome(state.open) ? reject : { state: { ...state, open: Opt.some(message.index) } }
      // A tap on the header drawn before an edit began, or before the page closed, changes nothing.
      case "CloseClicked":
        return Opt.exists(children.Note.output(), ({ editing }) => !editing)
          ? { state: { ...state, open: Opt.none() } }
          : reject
      // A press arrives only while the page is there: the key is listed only then, and the run drops what the
      // button sent once it is not.
      case "BackPressed":
        return Opt.match(children.Note.output(), {
          onNone: () => defect("A press of back while no note was open"),
          onSome: ({ editing }) =>
            editing
              ? { state, tell: [{ _tag: "Note", message: { _tag: "BackPressed" } }] }
              : { state: { ...state, open: Opt.none() } }
        })
    }
  },
  onEvent: {
    // A page is there only while a note is open: a parent's children are those its state lists.
    Note: (event) => (state) =>
      Opt.match(Opt.flatMap(state.open, (index) => Arr.replace(state.notes, index, event.text)), {
        onNone: () => defect("A note was saved while none was open"),
        onSome: (notes) => ({ state: { notes, open: Opt.none() } })
      })
  },
  subscriptions: (_, children) => Opt.isSome(children.Note.output()) ? ["back"] : [],
  listen: () => backPressed,
  // The page is read once, with the number of its instance, which its view's dispatch and key are given.
  makeModel: (state, children) =>
    Opt.match(Opt.all({ instance: children.Note.instance(), model: children.Note() }), {
      onNone: () => ({
        _tag: "List" as const,
        notes: Arr.map(state.notes, (text, index) => ({ text, open: OwnMessage.NoteOpened({ index }) }))
      }),
      onSome: ({ instance, model }) => ({
        _tag: "Note" as const,
        instance,
        model,
        close: model._tag === "Reading" ? Opt.some(OwnMessage.CloseClicked()) : Opt.none()
      })
    })
})

/** The parent's whole state: its own, and the page that the library keeps. */
export type State = StateOf<typeof notes>

export type Model = ModelOf<typeof notes>

/** The parent's messages: its own, and `{ _tag: 'Note', message }`, made by the library from the page's. */
export type Message = MessageOf<typeof notes>
