// A page with a clock that ticks every second while the page is shown, in the format the user picks.
import { type Program, reject, type Subscription, type Update } from '@fgaudo/effect-tea'
import * as Channel from 'effect/Channel'
import * as Data from 'effect/Data'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'

/** How the time is shown: as an ISO date, or as the seconds since the Unix epoch. */
export type Format = 'Iso' | 'Unix'

export type State = Readonly<{ maybeNow: Opt.Option<DateTime.Utc>; format: Format }>

export type Message = Data.TaggedEnum<{
  Ticked: { now: DateTime.Utc }
  AboutClicked: object
  FormatPicked: { format: Format }
}>

// Not exported, as the README's "Model" says: a view sends only the messages its model holds, and builds none.
const Message = Data.taggedEnum<Message>()

/** Asks for About, with the time the clock shows (none before its first tick). */
export type Event = Readonly<{ _tag: 'AboutRequested'; at: Opt.Option<DateTime.Utc> }>

export const update: Update<State, Message, never, Event> = (message) => (state) => {
  switch (message._tag) {
    case 'Ticked':
      return { state: { ...state, maybeNow: Opt.some(message.now) } }
    case 'AboutClicked':
      return { state, events: [{ _tag: 'AboutRequested', at: state.maybeNow }] }
    case 'FormatPicked':
      return message.format === state.format ? reject : { state: { ...state, format: message.format } }
  }
}

const ticks: Subscription<Message, never> = Channel.forever(
  Channel.fromEffect(DateTime.now).pipe(
    Channel.map((now) => Message.Ticked({ now })),
    Channel.concatWith(() => Channel.fromEffectDrain(Effect.sleep('1 second'))),
  ),
)

export type Model = Readonly<{
  time: string
  openAbout: Message
  format: Readonly<{ _tag: 'Iso'; toUnix: Message } | { _tag: 'Unix'; toIso: Message }>
}>

const formatted = (now: DateTime.Utc, format: Format): string =>
  format === 'Iso' ? DateTime.formatIso(now) : String(Math.floor(DateTime.toEpochMillis(now) / 1000))

export const clock: Program<{ state: State; model: Model; message: Message; event: Event }> = {
  init: { state: { maybeNow: Opt.none(), format: 'Iso' } },
  update,
  subscriptions: () => HashMap.make(['ticks', ticks]),
  makeModel: (state) => ({
    time: Opt.match(state.maybeNow, { onNone: () => '', onSome: (now) => formatted(now, state.format) }),
    openAbout: Message.AboutClicked(),
    format: state.format === 'Iso'
      ? { _tag: 'Iso', toUnix: Message.FormatPicked({ format: 'Unix' }) }
      : { _tag: 'Unix', toIso: Message.FormatPicked({ format: 'Iso' }) },
  }),
}
