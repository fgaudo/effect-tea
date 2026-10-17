// A counter that cannot go below zero: `update` rejects `Decrement` at 0, so the model does not offer it.
import { type Offer, type Program, reject, type Update } from '@fgaudo/effect-tea'

export type Message = 'Increment' | 'Decrement'

export const update: Update<number, Message> = (message) => (count) =>
  message === 'Increment'
    ? { state: count + 1 }
    : count > 0
    ? { state: count - 1 }
    : reject

export type Model = Readonly<{ count: number; increment: Offer<Message>; decrement: Offer<Message> }>

export const counter: Program<number, Model, Message> = {
  init: { state: 0 },
  update,
  makeModel: (count, { offer }) => ({ count, increment: offer('Increment'), decrement: offer('Decrement') }),
}
