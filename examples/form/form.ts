// A form that saves names. What is typed is always accepted, in any state, and its validity becomes model
// data: "Save" exists only for a name that is not blank. Saving is a state that only its completion leaves,
// so a second click is rejected; the model has no input to type into meanwhile, but a key typed before the
// input was disabled is still stored, so that the form never shows a text the state does not have. A failure
// gives the form back, as it was.
import { type Execution, type Program, reject, type Update } from '@fgaudo/effect-tea'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Field from '../field.ts'
import { Storage } from './storage.ts'

export type State = Readonly<{
  name: Field.Field
  isSaving: boolean
  hasFailed: boolean
  saved: ReadonlyArray<string>
}>

export type Message = Data.TaggedEnum<{
  NameChanged: { name: string }
  SaveClicked: object
  SaveSucceeded: { name: string }
  SaveFailed: object
}>

export const Message = Data.taggedEnum<Message>()

/** What `update` decides to do in the world, as data: `runCommand` is how it happens. */
export type Command = Data.TaggedEnum<{
  Save: { name: string }
}>

export const Command = Data.taggedEnum<Command>()

export const runCommand = (command: Command): Execution<Message, Storage> => {
  switch (command._tag) {
    case 'Save':
      // The expected failure becomes a message, as the success does: `update` decides what each means.
      return Effect.flatMap(Effect.service(Storage), (storage) => storage.save(command.name)).pipe(
        Effect.match({
          onSuccess: (): Message => Message.SaveSucceeded({ name: command.name }),
          onFailure: (): Message => Message.SaveFailed(),
        }),
        Effect.asSome,
      )
  }
}

const isBlank = (name: string) => name.trim() === ''

export const update: Update<State, Message, Command> = (message) => (state) => {
  switch (message._tag) {
    case 'NameChanged':
      return { state: { ...state, name: Field.typed(state.name, message.name) } }
    case 'SaveClicked':
      return state.isSaving || isBlank(state.name.text)
        ? reject
        : {
          state: { ...state, isSaving: true, hasFailed: false },
          commands: [Command.Save({ name: state.name.text.trim() })],
        }
    // A completion is accepted only while saving: there is no other operation it could belong to.
    case 'SaveSucceeded':
      return state.isSaving
        ? {
          state: {
            name: Field.replace(state.name, ''),
            isSaving: false,
            hasFailed: false,
            saved: [...state.saved, message.name],
          },
        }
        : reject
    case 'SaveFailed':
      return state.isSaving ? { state: { ...state, isSaving: false, hasFailed: true } } : reject
  }
}

export type Model = Readonly<{
  name: Field.Field
  editor: Data.TaggedEnum<{
    Saving: object
    Blank: { changeName: (name: string) => Message }
    Named: { changeName: (name: string) => Message; save: Message }
  }>
  hasFailed: boolean
  saved: ReadonlyArray<string>
}>

export const form: Program<{ state: State; model: Model; message: Message; command: Command; services: Storage }> = {
  init: { state: { name: Field.make(''), isSaving: false, hasFailed: false, saved: [] } },
  update,
  runCommand,
  makeModel: (state) => {
    const changeName = (name: string) => Message.NameChanged({ name })
    return {
      name: state.name,
      // Less than `update` accepts: typing is still accepted while saving, but there is nothing to type into.
      editor: state.isSaving
        ? { _tag: 'Saving' }
        : isBlank(state.name.text)
        ? { _tag: 'Blank', changeName }
        : { _tag: 'Named', changeName, save: Message.SaveClicked() },
      hasFailed: state.hasFailed,
      saved: state.saved,
    }
  },
}
