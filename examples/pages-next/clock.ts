// The Clock page of `examples/pages`, on the prototype: only the type of `Program` and of `Offered` change.
import type { Subscription, Update } from '@fgaudo/effect-tea'
import type { Offered, Program } from '@fgaudo/effect-tea/next'
import * as Channel from 'effect/Channel'
import * as Data from 'effect/Data'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'

export type State = Readonly<{ maybeNow: Opt.Option<DateTime.Utc> }>

export type Message = Data.TaggedEnum<{
  Ticked: { now: DateTime.Utc }
  AboutClicked: object
}>

export const Message = Data.taggedEnum<Message>()

export type Event = Readonly<{ _tag: 'AboutRequested' }>

export const update: Update<State, Message, never, Event> = (message) => (state) => {
  switch (message._tag) {
    case 'Ticked':
      return { state: { maybeNow: Opt.some(message.now) } }
    case 'AboutClicked':
      return { state, events: [{ _tag: 'AboutRequested' }] }
  }
}

const ticks: Subscription<Message, never> = Channel.forever(
  Channel.fromEffect(DateTime.now).pipe(
    Channel.map((now) => Message.Ticked({ now })),
    Channel.concatWith(() => Channel.fromEffectDrain(Effect.sleep('1 second'))),
  ),
)

export type Model = Readonly<{ time: string; openAbout: Offered<Message> }>

export const clock: Program<State, Model, Message, never, never, Event> = {
  init: { state: { maybeNow: Opt.none() } },
  update,
  subscriptions: () => HashMap.make(['ticks', ticks]),
  makeModel: (state, { offer }) => ({
    time: Opt.match(state.maybeNow, { onNone: () => '', onSome: DateTime.formatIso }),
    openAbout: offer(Message.AboutClicked()),
  }),
}
