// The tutorial's first step: how many minutes a timer lasts, never less than one. `update` rejects `Less` at one
// minute, so the model has no `less` there.
import { program, reject, type Update } from "@fgaudo/effect-tea"
import * as Opt from "effect/Option"

// #region state
export type State = Readonly<{ minutes: number }>

export type Message = "More" | "Less"
// #endregion state

// #region update
// The rule, asked by `update` and by `makeModel` alike, so that both give one answer.
const canTakeAMinute = ({ minutes }: State): boolean => minutes > 1

export const update: Update<State, Message> = (message) => (state) => {
  if (message === "More") return { state: { minutes: state.minutes + 1 } }
  if (!canTakeAMinute(state)) return reject
  return { state: { minutes: state.minutes - 1 } }
}
// #endregion update

// #region program
export type Model = Readonly<{
  minutes: number
  more: Message
  less: Opt.Option<Message>
}>

export const duration = program<{ state: State; model: Model; message: Message }>().make({
  init: { state: { minutes: 25 } },
  update,
  makeModel: (state) => ({
    minutes: state.minutes,
    more: "More",
    less: canTakeAMinute(state) ? Opt.some("Less") : Opt.none()
  })
})
// #endregion program
