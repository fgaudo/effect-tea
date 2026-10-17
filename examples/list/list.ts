// A list of stopwatches with `embedEach`: each one has its own state, messages and subscriptions, reached
// through its id. The parent adds them, and removes one when it asks.
import { embedEach, type Offer, type Program, type Update } from '@fgaudo/effect-tea'
import * as Arr from 'effect/Array'
import * as Data from 'effect/Data'
import { absurd } from 'effect/Function'
import * as Opt from 'effect/Option'
import * as Stopwatch from './stopwatch.ts'

/** Ids are numbers, so they compare by value in the subscription keys. */
export type Entry = Readonly<{ id: number; stopwatch: Stopwatch.State }>

export type State = Readonly<{ nextId: number; entries: ReadonlyArray<Entry> }>

export type Message = Data.TaggedEnum<{
  AddClicked: object
  GotStopwatch: { id: number; message: Stopwatch.Message }
}>

export const Message = Data.taggedEnum<Message>()

const stopwatches = embedEach(Stopwatch.stopwatch, {
  key: 'Stopwatch',
  wrap: (id: number, message: Stopwatch.Message) => Message.GotStopwatch({ id, message }),
  // A removed stopwatch is `None`: its late messages (a tick already on its way) are rejected.
  get: (state: State, id) =>
    Opt.map(Arr.findFirst(state.entries, (entry) => entry.id === id), (entry) => entry.stopwatch),
  set: (state, id, stopwatch) => ({
    ...state,
    entries: Arr.map(state.entries, (entry) => entry.id === id ? { id, stopwatch } : entry),
  }),
  subscribed: (state) => Arr.map(state.entries, ({ id, stopwatch }) => [id, stopwatch] as const),
  onEvent: (id) => (state) => ({
    state: { ...state, entries: Arr.filter(state.entries, (entry) => entry.id !== id) },
  }),
})

export const update: Update<State, Message, never> = (message) => (state) => {
  switch (message._tag) {
    case 'AddClicked':
      return {
        state: {
          nextId: state.nextId + 1,
          entries: [...state.entries, { id: state.nextId, stopwatch: Stopwatch.stopwatch.init.state }],
        },
        commands: stopwatches.liftCommands(state.nextId, Stopwatch.stopwatch.init.commands),
      }
    case 'GotStopwatch':
      return stopwatches.update(message.id, message.message)(state)
  }
}

export type Model = Readonly<{
  add: Offer<Message>
  stopwatches: ReadonlyArray<Readonly<{ id: number; model: Stopwatch.Model }>>
}>

export const list: Program<State, Model, Message, never, never> = {
  init: { state: { nextId: 1, entries: [] } },
  update,
  runCommand: absurd,
  subscriptions: stopwatches.subscriptions,
  makeModel: (state, { offer }) => ({
    add: offer(Message.AddClicked()),
    stopwatches: Arr.map(
      state.entries,
      ({ id, stopwatch }) => ({ id, model: stopwatches.makeModel(stopwatch) }),
    ),
  }),
}
