// A stopwatch that ticks every second while it runs: its subscription exists only in the running state. It
// asks its parent to be removed with an event.
import { type Offer, offers, type Program, reject, type Subscription, type Update } from '@fgaudo/effect-tea'
import * as Channel from 'effect/Channel'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'

export type State = Readonly<{ seconds: number; isRunning: boolean }>

export type Message = Data.TaggedEnum<{
  Started: object
  Stopped: object
  Ticked: object
  RemoveClicked: object
}>

export const Message = Data.taggedEnum<Message>()

export type Event = Readonly<{ _tag: 'RemoveRequested' }>

export const update: Update<State, Message, never, Event> = (message) => (state) => {
  switch (message._tag) {
    case 'Started':
      return state.isRunning ? reject : { state: { ...state, isRunning: true } }
    case 'Stopped':
      return state.isRunning ? { state: { ...state, isRunning: false } } : reject
    // A tick that arrives after the stopwatch stopped is stale: rejected here, ignored by the engine.
    case 'Ticked':
      return state.isRunning ? { state: { ...state, seconds: state.seconds + 1 } } : reject
    case 'RemoveClicked':
      return { state, events: [{ _tag: 'RemoveRequested' }] }
  }
}

const ticks: Subscription<Message, never> = Channel.forever(
  Channel.fromEffectDrain(Effect.sleep('1 second')).pipe(
    Channel.concatWith(() => Channel.succeed(Message.Ticked())),
  ),
)

export type Model = Readonly<{
  seconds: number
  start: Offer<Message>
  stop: Offer<Message>
  remove: Offer<Message>
}>

export const stopwatch: Program<State, Model, Message, never, Event> = {
  init: { state: { seconds: 0, isRunning: false } },
  update,
  subscriptions: (state) => state.isRunning ? HashMap.make(['ticks', ticks]) : HashMap.empty(),
  makeModel: (state) => {
    const { offer } = offers(update, state)
    return {
      seconds: state.seconds,
      start: offer(Message.Started()),
      stop: offer(Message.Stopped()),
      remove: offer(Message.RemoveClicked()),
    }
  },
}
