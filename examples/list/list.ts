// The stopwatches are children by id. The parent says where each one lives and what its event means; adding
// one, and halting them all, are the parent's own messages.
import { forEach, type MessageOf, type ModelOf, parent } from '@fgaudo/effect-tea'
import * as Arr from 'effect/Array'
import * as Opt from 'effect/Option'
import * as Stopwatch from './stopwatch.ts'

/** Ids are numbers, so they compare by value in the subscription keys. */
export type Entry = Readonly<{ id: number; stopwatch: Stopwatch.State }>

export type State = Readonly<{ nextId: number; entries: ReadonlyArray<Entry> }>

type AddClicked = Readonly<{ _tag: 'AddClicked' }>

type StopAllClicked = Readonly<{ _tag: 'StopAllClicked' }>

const { compose, each } = parent<{ state: State }>()

export const list = compose({
  init: () => ({ state: { nextId: 1, entries: [] } }),
  children: {
    Stopwatch: each(Stopwatch.stopwatch, {
      // A removed stopwatch is `None`: its late messages (a click on a frame drawn before) are rejected.
      get: (state, id: number) =>
        Opt.map(Arr.findFirst(state.entries, (entry) => entry.id === id), (entry) => entry.stopwatch),
      set: (state, id, stopwatch) => ({
        ...state,
        entries: Arr.map(state.entries, (entry) => entry.id === id ? { id, stopwatch } : entry),
      }),
      subscribed: (state) => Arr.map(state.entries, ({ id, stopwatch }) => [id, stopwatch] as const),
    }),
  },
  update: (message: AddClicked | StopAllClicked, children) => (state) => {
    switch (message._tag) {
      case 'AddClicked': {
        const stopwatch = children.Stopwatch.init(state.nextId)
        return {
          state: {
            nextId: state.nextId + 1,
            entries: [...state.entries, { id: state.nextId, stopwatch: stopwatch.state }],
          },
          commands: stopwatch.commands,
        }
      }
      // Every stopwatch is told, running or not: the parent never reads a child's state to decide.
      case 'StopAllClicked':
        return forEach({ state }, state.entries, ({ id }) => children.Stopwatch.update(id, Stopwatch.Message.Halted()))
    }
  },
  onEvent: {
    Stopwatch: (id) => (state) => ({
      state: { ...state, entries: Arr.filter(state.entries, (entry) => entry.id !== id) },
    }),
  },
  makeModel: (state, children) => ({
    add: { _tag: 'AddClicked' } as AddClicked,
    stopAll: { _tag: 'StopAllClicked' } as StopAllClicked,
    stopwatches: Arr.map(state.entries, ({ id }) => ({ id, model: children.Stopwatch(state, id) })),
  }),
})

export type Model = ModelOf<typeof list>

/** The list's messages, made by the library: its own, and `{ _tag: 'Stopwatch', id, message }`. */
export type Message = MessageOf<typeof list>
