// A form that saves names. What is typed is a message of the form's, as a click is: the model holds it without the
// text, where the name can be typed, and the view fills the text that the element holds. The form's messages are
// what is typed, Save and the answers of its command, and its model holds no function. The name's validity becomes
// model data: "Save" exists only for a name that is not blank. Saving is a state that only its completion leaves, so a
// second click is rejected, and a completion outside it cannot arrive: it is a defect. The name lives in the case of
// the draft where it can be typed: what is typed while saving is rejected, and the model holds nothing to type there.
// A failure gives the form back, as it was, and says which name it could not save.
import { defect, type Execution, type MessageOf, type ModelOf, program, reject } from "@fgaudo/effect-tea"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"
import { Storage } from "./storage.ts"

/** The draft: one state machine. Only an editing draft can be typed into, and it keeps the name a save failed on. */
export type Draft = Data.TaggedEnum<{
  Editing: { name: string; failed: Opt.Option<string> }
  Saving: { name: string }
}>

export const Draft = Data.taggedEnum<Draft>()

export type State = Readonly<{
  draft: Draft
  saved: ReadonlyArray<string>
}>

/** The form's messages: what is typed, with the text the element holds, Save, and the answers of its command. */
export type Own = Data.TaggedEnum<{
  NameTyped: { value: string }
  SaveClicked: object
  SaveSucceeded: { name: string }
  SaveFailed: { name: string }
}>

// Not exported, so that no view calls its constructors, as the guide's "Model" says.
const Own = Data.taggedEnum<Own>()

/** What `update` decides to do in the world, as data: `runCommand` is how it happens. */
export type Command = Data.TaggedEnum<{
  Save: { name: string }
}>

export const Command = Data.taggedEnum<Command>()

export const runCommand = (command: Command): Execution<Own, Storage> => {
  switch (command._tag) {
    case "Save":
      // The expected failure becomes a message, as the success does: `update` decides what each means.
      return Effect.flatMap(Effect.service(Storage), (storage) => storage.save(command.name)).pipe(
        Effect.match({
          onSuccess: (): Own => Own.SaveSucceeded({ name: command.name }),
          onFailure: (): Own => Own.SaveFailed({ name: command.name })
        }),
        Effect.asSome
      )
  }
}

const isBlank = (name: string) => name.trim() === ""

/** What is typed, held without its text: the view fills the text that the element holds. */
type Typing = Readonly<{ _tag: "NameTyped" }>

export type Editor = Data.TaggedEnum<{
  Saving: object
  Blank: { typed: Typing }
  Named: { typed: Typing; save: Own }
}>

export const Editor = Data.taggedEnum<Editor>()

const { make } = program<{ state: State; command: Command; message: Own }>()

export const form = make({
  init: { state: { draft: Draft.Editing({ name: "", failed: Opt.none() }), saved: [] } },
  update: (message) => (state) => {
    const { draft } = state
    switch (message._tag) {
      // The text is stored as it is typed, whatever it is: the element on screen already shows it.
      case "NameTyped":
        return draft._tag === "Editing"
          ? { state: { ...state, draft: Draft.Editing({ name: message.value, failed: draft.failed }) } }
          : reject
      case "SaveClicked":
        return draft._tag === "Saving" || isBlank(draft.name)
          ? reject
          : {
            state: { ...state, draft: Draft.Saving({ name: draft.name }) },
            commands: [Command.Save({ name: draft.name.trim() })]
          }
      // A completion arrives only while saving: there is no other operation it could belong to. Anywhere else it
      // is a bug, and the run dies with it.
      case "SaveSucceeded":
        return draft._tag === "Saving"
          // The form empties the name, and the element on screen is emptied: what is typed next replaces it.
          ? { state: { draft: Draft.Editing({ name: "", failed: Opt.none() }), saved: [...state.saved, message.name] } }
          : defect("A save completed while nothing was saving")
      case "SaveFailed":
        return draft._tag === "Saving"
          ? { state: { ...state, draft: Draft.Editing({ name: draft.name, failed: Opt.some(message.name) }) } }
          : defect("A save failed while nothing was saving")
    }
  },
  runCommand,
  makeModel: ({ draft, saved }) => ({
    // The view draws the field with this name, and, where the model shows an editor, fills what is typed with the
    // text that the field holds.
    name: draft.name,
    editor: draft._tag === "Saving"
      ? Editor.Saving()
      : isBlank(draft.name)
      ? Editor.Blank({ typed: { _tag: "NameTyped" } })
      : Editor.Named({ typed: { _tag: "NameTyped" }, save: Own.SaveClicked() }),
    failed: draft._tag === "Editing" ? draft.failed : Opt.none(),
    saved
  })
})

export type Model = ModelOf<typeof form>

/** The form's messages: what is typed, Save, and the answers of its command. */
export type Message = MessageOf<typeof form>

export const update = form.update
