// The tutorial's first step: how many minutes a timer lasts, never less than one. `update` rejects `Less` at one
// minute, so the model has no `less` there.
import { type Program, reject, type Update } from '@fgaudo/effect-tea'
import * as Opt from 'effect/Option'

// #region state
export type State = Readonly<{ minutes: number }>

export type Message = 'More' | 'Less'
// #endregion state

// #region update
export const update: Update<State, Message> = (message) => ({ minutes }) => {
  if (message === 'More') return { state: { minutes: minutes + 1 } }
  if (minutes === 1) return reject
  return { state: { minutes: minutes - 1 } }
}
// #endregion update

// #region program
export type Model = Readonly<{
  minutes: number
  more: Message
  less: Opt.Option<Message>
}>

export const duration: Program<{ state: State; model: Model; message: Message }> = {
  init: { state: { minutes: 25 } },
  update,
  makeModel: ({ minutes }) => ({
    minutes,
    more: 'More',
    less: minutes > 1 ? Opt.some('Less') : Opt.none(),
  }),
}
// #endregion program
