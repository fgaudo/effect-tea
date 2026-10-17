// A counter that cannot go below zero: `update` rejects `Decrement` at 0, so the model has no `decrement` there.
import { type Offered, type Program, reject, type Update } from '@fgaudo/effect-tea'

export type Message = 'Increment' | 'Decrement'

export const update: Update<number, Message> = (message) => (count) =>
  message === 'Increment'
    ? { state: count + 1 }
    : count > 0
    ? { state: count - 1 }
    : reject

export type Model =
  | Readonly<{ _tag: 'AtZero'; count: number; increment: Offered<Message> }>
  | Readonly<{ _tag: 'Counting'; count: number; increment: Offered<Message>; decrement: Offered<Message> }>

export const counter: Program<number, Model, Message> = {
  init: { state: 0 },
  update,
  makeModel: (count, { offer }) =>
    count > 0
      ? { _tag: 'Counting', count, increment: offer('Increment'), decrement: offer('Decrement') }
      : { _tag: 'AtZero', count, increment: offer('Increment') },
}
