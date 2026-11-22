// The application the tutorial's fourth step ends with: the list of the third step, each timer now a named one. Only
// the child changed: adding one and removing one are the list's own messages, as before.
import { type MessageOf, type ModelOf, program, reject, type StateOf } from "@fgaudo/effect-tea"
import * as Arr from "effect/Array"
import * as Named from "./named.ts"

/** The list's own state: the ids of its timers, in their order. Ids are numbers, so they compare by value. */
export type Own = Readonly<{ nextId: number; ids: ReadonlyArray<number> }>

type AddClicked = Readonly<{ _tag: "AddClicked" }>

type RemoveClicked = Readonly<{ _tag: "RemoveClicked"; id: number }>

const { childById, withChildren } = program<{ state: Own; message: AddClicked | RemoveClicked }>()

// A timer is there while its id is listed: a click on a view drawn before its removal is rejected.
export const namedTimers = withChildren({ Timer: childById(Named.named, { ids: (state) => state.ids }) }).make({
  init: { state: { nextId: 2, ids: [1] } },
  update: (message) => (state) => {
    switch (message._tag) {
      case "AddClicked":
        return { state: { nextId: state.nextId + 1, ids: [...state.ids, state.nextId] } }
      // A second click on "Remove", from the same view, finds the timer gone.
      case "RemoveClicked":
        return Arr.contains(state.ids, message.id)
          ? { state: { ...state, ids: Arr.filter(state.ids, (id) => id !== message.id) } }
          : reject
    }
  },
  makeModel: (state, children) => ({
    add: { _tag: "AddClicked" } as AddClicked,
    timers: Arr.map(state.ids, (id) => ({
      id,
      model: children.Timer(id),
      remove: { _tag: "RemoveClicked", id } as RemoveClicked
    }))
  })
})

export type State = StateOf<typeof namedTimers>

export type Model = ModelOf<typeof namedTimers>

/** The list's messages, made by the library: its own, and `{ _tag: 'Timer', id, message }`. */
export type Message = MessageOf<typeof namedTimers>
