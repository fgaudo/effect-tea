// A page that shows the time, from a subscription, and asks its parent for the About page with an event:
// it never acts on its parent.
import { type Offer, offers, type Program, type Subscription, type Update } from '@fgaudo/effect-tea'
import * as Channel from 'effect/Channel'
import * as Data from 'effect/Data'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { absurd } from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'

/** Empty until the first tick: the time is never read in `update` or `makeModel`, only received. */
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

// Now, then every second; it never ends.
const ticks: Subscription<Message, never> = Channel.forever(
  Channel.fromEffect(DateTime.now).pipe(
    Channel.map((now) => Message.Ticked({ now })),
    Channel.concatWith(() => Channel.fromEffectDrain(Effect.sleep('1 second'))),
  ),
)

export type Model = Readonly<{ time: string; openAbout: Offer<Message> }>

export const clock: Program<State, Model, Message, never, never, Event> = {
  init: { state: { maybeNow: Opt.none() } },
  update,
  runCommand: absurd,
  subscriptions: () => HashMap.make(['ticks', ticks]),
  makeModel: (state) => ({
    time: Opt.match(state.maybeNow, { onNone: () => '', onSome: DateTime.formatIso }),
    openAbout: offers(update, state).offer(Message.AboutClicked()),
  }),
}
