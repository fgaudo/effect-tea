// The tutorial's fourth step: a timer with a name the user types. The name is an input, a plain value of this
// program's state that the view writes over; the timer of the second step is its child, as it is.
import { type MessageOf, type ModelOf, program, type StateOf } from "@fgaudo/effect-tea"
import * as Optic from "effect/Optic"
import * as Timer from "./timer.ts"

// #region state
/** The program's own state: its timer is kept by the library. */
export type Own = Readonly<{ name: string }>
// #endregion state

// #region compose
const { child, input, withChildren } = program<{ state: Own }>()

export const named = withChildren({ Timer: child(Timer.timer) }).make({
  init: { state: { name: "" } },
  inputs: { Name: input({ at: Optic.id<Own>().key("name") }) },
  // The name is the program's own state: the view draws the input from it, and writes over it.
  makeModel: (state, children) => ({ name: state.name, timer: children.Timer() })
})

export type State = StateOf<typeof named>

export type Model = ModelOf<typeof named>

/** Its messages, made by the library: `{ _tag: 'Timer', message }`, and `{ _tag: 'Name', message }` for a write. */
export type Message = MessageOf<typeof named>
// #endregion compose
