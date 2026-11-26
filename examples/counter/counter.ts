// A counter that cannot go below zero: `update` rejects `Decrement` at 0, so the model has no `decrement` there.
import { program, reject, type Update } from "@fgaudo/effect-tea"

export type State = Readonly<{ count: number }>

export type Message = "Increment" | "Decrement"

// Whether there is something to take away, asked by `update` and by `makeModel` alike, so that both give one answer.
const canDecrement = ({ count }: State): boolean => count > 0

export const update: Update<State, Message> = (message) => (state) =>
  message === "Increment"
    ? { state: { count: state.count + 1 } }
    : canDecrement(state)
    ? { state: { count: state.count - 1 } }
    : reject

export type Model =
  | Readonly<{ _tag: "AtZero"; count: number; increment: Message }>
  | Readonly<{ _tag: "Counting"; count: number; increment: Message; decrement: Message }>

export const counter = program<{ state: State; model: Model; message: Message }>().make({
  init: { state: { count: 0 } },
  update,
  makeModel: (state) =>
    canDecrement(state)
      ? { _tag: "Counting", count: state.count, increment: "Increment", decrement: "Decrement" }
      : { _tag: "AtZero", count: state.count, increment: "Increment" }
})
