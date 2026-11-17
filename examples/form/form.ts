// A form that saves names. The name is an input, a plain value of the form's own state that the outside writes over:
// no `update` of the form's sees what is typed, which the library stores in any state, and rejects once the form has
// put another name in its place. The form's messages are those it fixes, Save and the answers of its command, and its
// model holds no function. The name's validity becomes model data: "Save" exists only for a name that is not blank.
// Saving is a state that only its completion leaves, so a second click is rejected, and a completion outside it
// cannot arrive: it is a defect. The model has no input to type into while saving, but a key typed before the input
// was disabled is still stored, so that the form never shows a text the state does not have. A failure gives the
// form back, as it was, and says which name it could not save.
import {
  program,
  defect,
  type Execution,
  type MessageOf,
  type ModelOf,
  reject,
} from '@fgaudo/effect-tea'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import * as Optic from 'effect/Optic'
import { Storage } from './storage.ts'

/** The save: one state machine. A failure keeps the name it could not save. */
export type Save = Data.TaggedEnum<{
  Idle: object
  Saving: object
  Failed: { name: string }
}>

export const Save = Data.taggedEnum<Save>()

export type State = Readonly<{
  name: string
  save: Save
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
    case 'Save':
      // The expected failure becomes a message, as the success does: `update` decides what each means.
      return Effect.flatMap(Effect.service(Storage), (storage) => storage.save(command.name)).pipe(
        Effect.match({
          onSuccess: (): Own => Own.SaveSucceeded({ name: command.name }),
          onFailure: (): Own => Own.SaveFailed({ name: command.name }),
        }),
        Effect.asSome,
      )
  }
}

const isBlank = (name: string) => name.trim() === ''

export type Editor = Data.TaggedEnum<{
  Saving: object
  Blank: object
  Named: { save: Own }
}>

export const Editor = Data.taggedEnum<Editor>()

const { make, input } = program<{ state: State; command: Command; message: Own }>()

export const form = make({
  init: { state: { name: '', save: Save.Idle(), saved: [] } },
  inputs: { Name: input({ at: Optic.id<State>().key('name') }) },
  update: (message: Own) => (state) => {
    switch (message._tag) {
      case 'SaveClicked':
        return state.save._tag === 'Saving' || isBlank(state.name)
          ? reject
          : {
            state: { ...state, save: Save.Saving() },
            commands: [Command.Save({ name: state.name.trim() })],
          }
      // A completion arrives only while saving: there is no other operation it could belong to. Anywhere else it
      // is a bug, and the run dies with it.
      case 'SaveSucceeded':
        return state.save._tag === 'Saving'
          // Another value in the name's place: what was typed over the old one is rejected, and the input on screen
          // is emptied.
          ? { state: { name: '', save: Save.Idle(), saved: [...state.saved, message.name] } }
          : defect('A save completed while nothing was saving')
      case 'SaveFailed':
        return state.save._tag === 'Saving'
          ? { state: { ...state, save: Save.Failed({ name: message.name }) } }
          : defect('A save failed while nothing was saving')
    }
  },
  runCommand,
  makeModel: (state) => ({
    // The form's own state: the view draws the input from it, and writes over it.
    name: state.name,
    // Less than is accepted: typing is still stored while saving, but there is nothing to type into.
    editor: state.save._tag === 'Saving'
      ? Editor.Saving()
      : isBlank(state.name)
      ? Editor.Blank()
      : Editor.Named({ save: Own.SaveClicked() }),
    failed: state.save._tag === 'Failed' ? Opt.some(state.save.name) : Opt.none(),
    saved: state.saved,
  }),
})

export type Model = ModelOf<typeof form>

/** The form's messages, made by the library: its own, and `{ _tag: 'Name', message }` for what is typed. */
export type Message = MessageOf<typeof form>

export const update = form.update
