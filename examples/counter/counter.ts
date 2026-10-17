// A counter that cannot go below zero: `update` rejects `Decrement` at 0, so the model does not offer it.
import { type Offer, type Program, reject, type Update } from '@fgaudo/effect-tea'
import { absurd } from 'effect/Function'
import * as HashMap from 'effect/HashMap'

export type Message = 'Increment' | 'Decrement'

export const update: Update<number, Message, never> = (message) => (count) =>
  message === 'Increment'
    ? { state: count + 1 }
    : count > 0
    ? { state: count - 1 }
    : reject

export type Model = Readonly<{ count: number; increment: Offer<Message>; decrement: Offer<Message> }>

export const counter: Program<number, Model, Message, never, never> = {
  init: { state: 0 },
  update,
  runCommand: absurd,
  subscriptions: () => HashMap.empty(),
  makeModel: (count, { offer }) => ({ count, increment: offer('Increment'), decrement: offer('Decrement') }),
}
