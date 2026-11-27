// A page that shows a note and edits it. It starts from the note's text, its flags, raises an event when the edit is
// saved, and says by its output whether it is editing. An edit is cancelled by its own button, or by a press of the
// device's back button, which its parent tells it.
import { program, reject, type Update } from "@fgaudo/effect-tea"
import * as Data from "effect/Data"

/** What its parent starts it from. */
export type Flags = Readonly<{ text: string }>

export type State = Data.TaggedEnum<{
  Reading: { text: string }
  Editing: { text: string; draft: string }
}>

export const State = Data.taggedEnum<State>()

export type Message = Data.TaggedEnum<{
  EditClicked: object
  DraftTyped: { value: string }
  SaveClicked: object
  CancelClicked: object
}>

// Not exported, so that no view calls its constructors, as the guide's "Model" says.
const Message = Data.taggedEnum<Message>()

/** What only its parent sends it: a press of the device's back button. */
export type External = Readonly<{ _tag: "BackPressed" }>

export type Event = Readonly<{ _tag: "Saved"; text: string }>

/** What its parent reads of it: whether a press of back is the page's to take. */
export type Output = Readonly<{ editing: boolean }>

const cancelled = (state: Extract<State, { _tag: "Editing" }>): State => State.Reading({ text: state.text })

export const update: Update<State, Message, never, Event> = (message) => (state) => {
  switch (message._tag) {
    case "EditClicked":
      return state._tag === "Reading" ? { state: State.Editing({ text: state.text, draft: state.text }) } : reject
    case "DraftTyped":
      return state._tag === "Editing" ? { state: { ...state, draft: message.value } } : reject
    case "SaveClicked":
      return state._tag === "Editing"
        ? { state: State.Reading({ text: state.draft }), events: [{ _tag: "Saved", text: state.draft }] }
        : reject
    case "CancelClicked":
      return state._tag === "Editing" ? { state: cancelled(state) } : reject
  }
}

// Back cancels the edit, and changes nothing outside one.
export const external = (_: External) => (state: State) => ({
  state: state._tag === "Editing" ? cancelled(state) : state
})

/** What is typed, held without its text: the view fills the text that the element holds. */
type Typing = Readonly<{ _tag: "DraftTyped" }>

export type Model = Data.TaggedEnum<{
  Reading: { text: string; edit: Message }
  Editing: { draft: string; typed: Typing; save: Message; cancel: Message }
}>

export const note = program<
  { state: State; model: Model; message: Message; event: Event; external: External; output: Output; flags: Flags }
>().make({
  init: ({ text }) => ({ state: State.Reading({ text }) }),
  update,
  external,
  output: (state) => ({ editing: state._tag === "Editing" }),
  makeModel: (state) =>
    state._tag === "Reading"
      ? { _tag: "Reading", text: state.text, edit: Message.EditClicked() }
      : {
        _tag: "Editing",
        draft: state.draft,
        typed: { _tag: "DraftTyped" },
        save: Message.SaveClicked(),
        cancel: Message.CancelClicked()
      }
})
