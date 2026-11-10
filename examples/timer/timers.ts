// The tutorial's third step: timers by id, each the timer of the second step as it is. Adding one and removing
// one are the list's own messages; everything inside a timer is the timer's.
import { type MessageOf, type ModelOf, parent, reject } from '@fgaudo/effect-tea'
import * as Arr from 'effect/Array'
import * as Opt from 'effect/Option'
import * as Timer from './timer.ts'

// #region state
/** Ids are numbers, never reused, so they compare by value and a removed timer's id never comes back. */
export type Entry = Readonly<{ id: number; timer: Timer.State }>

export type State = Readonly<{ nextId: number; entries: ReadonlyArray<Entry> }>

type AddClicked = Readonly<{ _tag: 'AddClicked' }>

type RemoveClicked = Readonly<{ _tag: 'RemoveClicked'; id: number }>
// #endregion state

// #region compose
const { compose, each } = parent<{ state: State }>()

export const timers = compose({
  init: (children) => {
    const first = children.Timer.init(1)
    return { state: { nextId: 2, entries: [{ id: 1, timer: first.state }] }, commands: first.commands }
  },
  children: {
    Timer: each(Timer.timer, {
      // A removed timer is `None`: a click on a frame drawn before its removal is rejected.
      get: (state, id: number) =>
        Opt.map(Arr.findFirst(state.entries, (entry) => entry.id === id), (entry) => entry.timer),
      set: (state, id, timer) => ({
        ...state,
        entries: Arr.map(state.entries, (entry) => entry.id === id ? { id, timer } : entry),
      }),
      // Every timer may listen: each one's own `subscriptions` say when it ticks.
      subscribed: (state) => Arr.map(state.entries, ({ id, timer }) => [id, timer] as const),
    }),
  },
  update: (message: AddClicked | RemoveClicked, children) => (state) => {
    switch (message._tag) {
      case 'AddClicked': {
        const timer = children.Timer.init(state.nextId)
        return {
          state: { nextId: state.nextId + 1, entries: [...state.entries, { id: state.nextId, timer: timer.state }] },
          commands: timer.commands,
        }
      }
      // A second click on "Remove", from the same frame, finds the timer gone.
      case 'RemoveClicked':
        return Arr.some(state.entries, (entry) => entry.id === message.id)
          ? { state: { ...state, entries: Arr.filter(state.entries, (entry) => entry.id !== message.id) } }
          : reject
    }
  },
  makeModel: (state, children) => ({
    add: { _tag: 'AddClicked' } as AddClicked,
    timers: Arr.map(state.entries, ({ id }) => ({
      id,
      model: children.Timer(state, id),
      remove: { _tag: 'RemoveClicked', id } as RemoveClicked,
    })),
  }),
})

export type Model = ModelOf<typeof timers>

/** The list's messages, made by the library: its own, and `{ _tag: 'Timer', id, message }`. */
export type Message = MessageOf<typeof timers>
// #endregion compose
