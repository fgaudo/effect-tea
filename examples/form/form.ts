// A form that saves names. The name is an input, a plain value of the form's own state that the outside writes over:
// no `update` of the form's sees what is typed, which the library stores wherever the name can be typed, over whatever
// name the form put there. The form's messages are those it fixes, Save and the answers of its command, and its
// model holds no function. The name's validity becomes model data: "Save" exists only for a name that is not blank.
// Saving is a state that only its completion leaves, so a second click is rejected, and a completion outside it
// cannot arrive: it is a defect. The name lives in the case of the draft where it can be typed, and the input is at
// that case: a write while saving finds no place, and is rejected. A failure gives the form back, as it was, and says
// which name it could not save.
import { defect, type Execution, type MessageOf, type ModelOf, program, reject } from "@fgaudo/effect-tea"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Optic from "effect/Optic"
import * as Opt from "effect/Option"
import { Storage } from "./storage.ts"

/** The draft: one state machine. Only an editing draft is a place to type into, and it keeps the name a save failed on. */
export type Draft = Data.TaggedEnum<{
  Editing: { name: string; failed: Opt.Option<string> }
  Saving: { name: string }
}>

export const Draft = Data.taggedEnum<Draft>()

export type State = Readonly<{
  draft: Draft
  saved: ReadonlyArray<string>
}>

/** The form's own messages: what is typed is no message of the form's. */
export type Own = Data.TaggedEnum<{
  SaveClicked: object
  SaveSucceeded: { name: string }
  SaveFailed: { name: string }
}>

// Not exported, as the guide's "Model" says: a view sends only the messages its model holds, and builds none.
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

export type Editor = Data.TaggedEnum<{
  Saving: object
  Blank: object
  Named: { save: Own }
}>

export const Editor = Data.taggedEnum<Editor>()

const { make, input } = program<{ state: State; command: Command; message: Own }>()

export const form = make({
  init: { state: { draft: Draft.Editing({ name: "", failed: Opt.none() }), saved: [] } },
  inputs: { Name: input({ at: Optic.id<State>().key("draft").tag("Editing").key("name") }) },
  update: (message) => (state) => {
    const { draft } = state
    switch (message._tag) {
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
          // The form puts an empty name in the input's place, and the input on screen is emptied: what is typed next
          // is stored over it.
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
    // The form's own state: the view draws the input from it, and writes over it where the editor is there.
    name: draft.name,
    editor: draft._tag === "Saving"
      ? Editor.Saving()
      : isBlank(draft.name)
      ? Editor.Blank()
      : Editor.Named({ save: Own.SaveClicked() }),
    failed: draft._tag === "Editing" ? draft.failed : Opt.none(),
    saved
  })
})

export type Model = ModelOf<typeof form>

/** The form's messages, made by the library: its own, and `{ _tag: 'Name', message }` for what is typed. */
export type Message = MessageOf<typeof form>

export const update = form.update
