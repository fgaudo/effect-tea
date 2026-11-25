// The tutorial's fourth step: a timer with a name the user types. What is typed is a message of this program's, which
// its `update` stores; the timer of the second step is its child, as it is.
import { type MessageOf, type ModelOf, program, type StateOf } from "@fgaudo/effect-tea"
import * as Timer from "./timer.ts"

// #region state
/** The program's own state: its timer is kept by the library. */
export type Own = Readonly<{ name: string }>

/** What the user types into the name, with the text that the field holds. */
export type NameTyped = Readonly<{ _tag: "NameTyped"; value: string }>
// #endregion state

// #region compose
const { child, withChildren } = program<{ state: Own; message: NameTyped }>()

export const named = withChildren({ Timer: child(Timer.timer) }).make({
  init: { state: { name: "" } },
  // The text is stored as it is typed, whatever it is: the field on screen already shows it.
  update: ({ value }) => () => ({ state: { name: value } }),
  // The model holds what is typed without its text: the view fills it.
  makeModel: (state, children) => ({
    name: state.name,
    typed: { _tag: "NameTyped" } as const,
    timer: children.Timer()
  })
})

export type State = StateOf<typeof named>

export type Model = ModelOf<typeof named>

/** Its messages, made by the library: its own, and `{ _tag: 'Timer', message }` for its timer's. */
export type Message = MessageOf<typeof named>
// #endregion compose
