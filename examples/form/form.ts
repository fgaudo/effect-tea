// A form that saves names. What is typed is always accepted, and its validity becomes model data: "Save" is
// offered only for a name that is not blank. Saving is a state that only its completion leaves, so a second
// click is rejected, and the inputs are frozen meanwhile. A failure gives the form back, as it was.
import {
  attempt,
  type Execution,
  type InputOffer,
  type Offer,
  offers,
  type Program,
  reject,
  type Update,
} from '@fgaudo/effect-tea'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import { Storage } from './storage.ts'

export type State = Readonly<{
  name: string
  isSaving: boolean
  hasFailed: boolean
  saved: ReadonlyArray<string>
}>

export type Message = Data.TaggedEnum<{
  NameChanged: { name: string }
  SaveClicked: object
  SaveSucceeded: object
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
      return attempt(Effect.flatMap(Effect.service(Storage), (storage) => storage.save(command.name)), {
        onSuccess: (): Message => Message.SaveSucceeded(),
        onFailure: (): Message => Message.SaveFailed(),
      })
  }
}

export const update: Update<State, Message, Command> = (message) => (state) => {
  switch (message._tag) {
    case 'NameChanged':
      return state.isSaving ? reject : { state: { ...state, name: message.name } }
    case 'SaveClicked':
      return state.isSaving || state.name.trim() === ''
        ? reject
        : {
          state: { ...state, isSaving: true, hasFailed: false },
          commands: [Command.Save({ name: state.name.trim() })],
        }
    // A completion is accepted only while saving: there is no other operation it could belong to.
    case 'SaveSucceeded':
      return state.isSaving
        ? { state: { name: '', isSaving: false, hasFailed: false, saved: [...state.saved, state.name.trim()] } }
        : reject
    case 'SaveFailed':
      return state.isSaving ? { state: { ...state, isSaving: false, hasFailed: true } } : reject
  }
}

export type Model = Readonly<{
  name: string
  changeName: InputOffer<string, Message>
  save: Offer<Message>
  isSaving: boolean
  hasFailed: boolean
  saved: ReadonlyArray<string>
}>

export const form: Program<State, Model, Message, Command, Storage> = {
  init: { state: { name: '', isSaving: false, hasFailed: false, saved: [] } },
  update,
  runCommand,
  subscriptions: () => HashMap.empty(),
  makeModel: (state) => {
    const { offer, offerInput } = offers(update, state)
    return {
      name: state.name,
      changeName: offerInput((name: string) => Message.NameChanged({ name }), state.name),
      save: offer(Message.SaveClicked()),
      isSaving: state.isSaving,
      hasFailed: state.hasFailed,
      saved: state.saved,
    }
  },
}
