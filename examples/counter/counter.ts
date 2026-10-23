// A counter that cannot go below zero: `update` rejects `Decrement` at 0, so the model has no `decrement` there.
import { type Program, reject, type Update } from '@fgaudo/effect-tea'

export type State = Readonly<{ count: number }>

export type Message = 'Increment' | 'Decrement'

export const update: Update<State, Message> = (message) => ({ count }) =>
  message === 'Increment'
    ? { state: { count: count + 1 } }
    : count > 0
    ? { state: { count: count - 1 } }
    : reject

export type Model =
  | Readonly<{ _tag: 'AtZero'; count: number; increment: Message }>
  | Readonly<{ _tag: 'Counting'; count: number; increment: Message; decrement: Message }>

export const counter: Program<{ state: State; model: Model; message: Message }> = {
  init: { state: { count: 0 } },
  update,
  makeModel: ({ count }) =>
    count > 0
      ? { _tag: 'Counting', count, increment: 'Increment', decrement: 'Decrement' }
      : { _tag: 'AtZero', count, increment: 'Increment' },
}
