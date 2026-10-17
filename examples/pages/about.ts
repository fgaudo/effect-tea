// A page that loads a saying when it opens (its `init` commands), and asks to be left with an event.
import { type Command, type Offer, offers, type Program, type Update } from '@fgaudo/effect-tea'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Random from 'effect/Random'

/** Empty while the saying loads. */
export type State = Readonly<{ maybeSaying: Opt.Option<string> }>

export type Message = Data.TaggedEnum<{
  SayingPicked: { saying: string }
  BackClicked: object
}>

export const Message = Data.taggedEnum<Message>()

export type Event = Readonly<{ _tag: 'LeaveRequested' }>

const sayings = ['Make it work, make it right, make it fast.', 'Simple is better than complex.'] as const

const pickSaying: Command<Message, never> = Effect.map(
  Random.choice(sayings),
  (saying) => Opt.some(Message.SayingPicked({ saying })),
)

export const update: Update<State, Message, never, Event> = (message) => (state) => {
  switch (message._tag) {
    case 'SayingPicked':
      return { state: { maybeSaying: Opt.some(message.saying) } }
    case 'BackClicked':
      return { state, events: [{ _tag: 'LeaveRequested' }] }
  }
}

export type Model = Readonly<{ saying: Opt.Option<string>; back: Offer<Message> }>

export const about: Program<State, Model, Message, never, Event> = {
  init: { state: { maybeSaying: Opt.none() }, commands: [pickSaying] },
  update,
  subscriptions: () => HashMap.empty(),
  makeModel: (state) => ({ saying: state.maybeSaying, back: offers(update, state).offer(Message.BackClicked()) }),
}
