// A form that saves names. What is typed is always accepted, in any state, and its validity becomes model
// data: "Save" exists only for a name that is not blank. Saving is a state that only its completion leaves, so
// a second click is rejected, and a completion outside it cannot arrive: it is a defect. The model has no input
// to type into while saving, but a key typed before the input was disabled is still stored, so that the form
// never shows a text the state does not have. A failure gives the form back, as it was, and says which name it
// could not save.
import { defect, type Execution, type Program, reject, type Update } from '@fgaudo/effect-tea'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import * as Field from '../field.ts'
import { Storage } from './storage.ts'

/** The save: one state machine. A failure keeps the name it could not save. */
export type Save = Data.TaggedEnum<{
  Idle: object
  Saving: object
  Failed: { name: string }
}>

export const Save = Data.taggedEnum<Save>()

export type State = Readonly<{
  name: Field.Field
  save: Save
  saved: ReadonlyArray<string>
}>

export type Message = Data.TaggedEnum<{
  NameChanged: { name: string }
  SaveClicked: object
  SaveSucceeded: { name: string }
  SaveFailed: { name: string }
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
          onFailure: (): Message => Message.SaveFailed({ name: command.name }),
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
      return state.save._tag === 'Saving' || isBlank(state.name.text)
        ? reject
        : {
          state: { ...state, save: Save.Saving() },
          commands: [Command.Save({ name: state.name.text.trim() })],
        }
    // A completion arrives only while saving: there is no other operation it could belong to. Anywhere else it
    // is a bug, and the run dies with it.
    case 'SaveSucceeded':
      return state.save._tag === 'Saving'
        ? { state: { name: Field.replace(state.name, ''), save: Save.Idle(), saved: [...state.saved, message.name] } }
        : defect('A save completed while nothing was saving')
    case 'SaveFailed':
      return state.save._tag === 'Saving'
        ? { state: { ...state, save: Save.Failed({ name: message.name }) } }
        : defect('A save failed while nothing was saving')
  }
}

export type Model = Readonly<{
  name: Field.Field
  editor: Data.TaggedEnum<{
    Saving: object
    Blank: { changeName: (name: string) => Message }
    Named: { changeName: (name: string) => Message; save: Message }
  }>
  /** The name the last save could not save, while the form says so. */
  failed: Opt.Option<string>
  saved: ReadonlyArray<string>
}>

export const form: Program<{ state: State; model: Model; message: Message; command: Command; services: Storage }> = {
  init: { state: { name: Field.make(''), save: Save.Idle(), saved: [] } },
  update,
  runCommand,
  makeModel: (state) => {
    const changeName = (name: string) => Message.NameChanged({ name })
    return {
      name: state.name,
      // Less than `update` accepts: typing is still accepted while saving, but there is nothing to type into.
      editor: state.save._tag === 'Saving'
        ? { _tag: 'Saving' }
        : isBlank(state.name.text)
        ? { _tag: 'Blank', changeName }
        : { _tag: 'Named', changeName, save: Message.SaveClicked() },
      failed: state.save._tag === 'Failed' ? Opt.some(state.save.name) : Opt.none(),
      saved: state.saved,
    }
  },
}
