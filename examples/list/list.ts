// The stopwatches are children by id, which the library keeps. The parent's own state is their ids, in their order:
// adding one, and halting those that run, are the parent's own messages, and it says what a stopwatch's event means.
// Which ones run it reads from their output, and keeps no copy of it in its own state.
import { type MessageOf, type ModelOf, program, reject, type StateOf } from "@fgaudo/effect-tea"
import * as Arr from "effect/Array"
import * as Opt from "effect/Option"
import * as Stopwatch from "./stopwatch.ts"

/** The parent's own state. Ids are numbers, so they compare by value. */
export type Own = Readonly<{ nextId: number; ids: ReadonlyArray<number> }>

type AddClicked = Readonly<{ _tag: "AddClicked" }>

type StopAllClicked = Readonly<{ _tag: "StopAllClicked" }>

const { childById, withChildren } = program<{ state: Own; message: AddClicked | StopAllClicked }>()

// A stopwatch is there while its id is listed: one removed is not, and its late messages are rejected.
export const list = withChildren({ Stopwatch: childById(Stopwatch.stopwatch, { ids: (state) => state.ids }) }).make({
  init: { state: { nextId: 1, ids: [] } },
  update: (message, children) => (state) => {
    switch (message._tag) {
      case "AddClicked":
        return { state: { nextId: state.nextId + 1, ids: [...state.ids, state.nextId] } }
      // Only the stopwatches that run are told. Where none runs, there is nothing to stop.
      case "StopAllClicked": {
        const running = Arr.filter(state.ids, (id) => children.Stopwatch.output(id).running)
        return Arr.isReadonlyArrayEmpty(running)
          ? reject
          : { state, tell: Arr.map(running, (id) => ({ _tag: "Stopwatch", id, message: { _tag: "Halted" } })) }
      }
    }
  },
  onEvent: {
    Stopwatch: (id) => (state) => ({ state: { ...state, ids: Arr.filter(state.ids, (other) => other !== id) } })
  },
  makeModel: (state, children) => ({
    add: { _tag: "AddClicked" } as AddClicked,
    stopAll: Arr.some(state.ids, (id) => children.Stopwatch.output(id).running)
      ? Opt.some<StopAllClicked>({ _tag: "StopAllClicked" })
      : Opt.none(),
    stopwatches: Arr.map(state.ids, (id) => ({ id, model: children.Stopwatch(id) }))
  })
})

export type State = StateOf<typeof list>

export type Model = ModelOf<typeof list>

/** The list's messages, made by the library: its own, and `{ _tag: 'Stopwatch', id, message }`. */
export type Message = MessageOf<typeof list>
