// The stopwatches are children by id, which the library keeps. The parent's own state is their ids, in their order:
// adding one, and halting those that run, are the parent's own messages, and it says what a stopwatch's event means.
// Which ones run it reads from their output, and keeps no copy of it in its own state. Halting is in a module of its
// own, `halting.ts`, to show a parent split by concern: a program this small would keep it here.
import { childById, type MessageOf, type ModelOf, program, type StateOf } from "@fgaudo/effect-tea"
import * as Arr from "effect/Array"
import * as Halting from "./halting.ts"
import * as Stopwatch from "./stopwatch.ts"

/** The parent's own state. Ids are numbers, so they compare by value. */
export type Own = Readonly<{ nextId: number; ids: ReadonlyArray<number> }>

type AddClicked = Readonly<{ _tag: "AddClicked" }>

type OwnMessage = AddClicked | Halting.StopAllClicked

/**
 * The stopwatches, declared apart from `withChildren`, so that `halting.ts` types its functions by them: apart from it,
 * `ids` names the parent's state. One is there while its id is listed: one removed is not, and its late messages are
 * rejected.
 */
export const stopwatches = { Stopwatch: childById(Stopwatch.stopwatch, { ids: (state: Own) => state.ids }) }

export const list = program<{ state: Own; message: OwnMessage }>().withChildren(stopwatches).make({
  init: { state: { nextId: 1, ids: [] } },
  update: (message, children) => (state) => {
    switch (message._tag) {
      case "AddClicked":
        return { state: { nextId: state.nextId + 1, ids: [...state.ids, state.nextId] } }
      case "StopAllClicked":
        return Halting.update(message, children)(state)
    }
  },
  onEvent: {
    Stopwatch: (id) => (state) => ({ state: { ...state, ids: Arr.filter(state.ids, (other) => other !== id) } })
  },
  makeModel: (state, children) => ({
    add: { _tag: "AddClicked" } as AddClicked,
    stopAll: Halting.stopAll(state, children),
    stopwatches: Arr.map(state.ids, (id) => ({ id, model: children.Stopwatch(id) }))
  })
})

export type State = StateOf<typeof list>

export type Model = ModelOf<typeof list>

/** The list's messages, made by the library: its own, and `{ _tag: 'Stopwatch', id, message }`. */
export type Message = MessageOf<typeof list>
