// The tutorial's fourth step: a timer with a name the user types. The name is an input, a plain value of this
// program's state that the view writes over; the timer of the second step is its child, as it is.
import { type MessageOf, type ModelOf, program } from "@fgaudo/effect-tea"
import * as Optic from "effect/Optic"
import * as Timer from "./timer.ts"

// #region state
export type State = Readonly<{ name: string; timer: Timer.State }>
// #endregion state

// #region compose
const { child, make, input } = program<{ state: State }>()

const state = Optic.id<State>()

export const named = make({
  init: (children) => ({
    state: { name: "", timer: children.Timer.init.state },
    commands: children.Timer.init.commands
  }),
  children: { Timer: child(Timer.timer, { at: state.key("timer") }) },
  inputs: { Name: input({ at: state.key("name") }) },
  // The name is the program's own state: the view draws the input from it, and writes over it.
  makeModel: (state, children) => ({ name: state.name, timer: children.Timer(state) })
})

export type Model = ModelOf<typeof named>

/** Its messages, made by the library: `{ _tag: 'Timer', message }`, and `{ _tag: 'Name', message }` for a write. */
export type Message = MessageOf<typeof named>
// #endregion compose
