// A stopwatch that ticks every second while it runs: its subscription exists only in the running state. It
// asks its parent to be removed with an event.
import { type Program, reject, type Subscription, type Update } from '@fgaudo/effect-tea'
import * as Channel from 'effect/Channel'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'

export type Watch = Data.TaggedEnum<{ Running: object; Stopped: object }>

export const Watch = Data.taggedEnum<Watch>()

export type State = Readonly<{ seconds: number; watch: Watch }>

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
      return state.watch._tag === 'Running' ? reject : { state: { ...state, watch: Watch.Running() } }
    case 'Stopped':
      return state.watch._tag === 'Running' ? { state: { ...state, watch: Watch.Stopped() } } : reject
    // A tick arrives only while running: stopping interrupts the subscription and drops what it sent. One
    // anywhere else is a bug, and the run dies with it.
    case 'Ticked':
      if (state.watch._tag !== 'Running') throw new Error('A tick while the stopwatch was stopped')
      return { state: { ...state, seconds: state.seconds + 1 } }
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
  remove: Message
  watch: Data.TaggedEnum<{
    Running: { stop: Message }
    Stopped: { start: Message }
  }>
}>

export const stopwatch: Program<{ state: State; model: Model; message: Message; event: Event }> = {
  init: { state: { seconds: 0, watch: Watch.Stopped() } },
  update,
  subscriptions: (state) => state.watch._tag === 'Running' ? HashMap.make(['ticks', ticks]) : HashMap.empty(),
  makeModel: (state) => ({
    seconds: state.seconds,
    remove: Message.RemoveClicked(),
    watch: state.watch._tag === 'Running'
      ? { _tag: 'Running', stop: Message.Stopped() }
      : { _tag: 'Stopped', start: Message.Started() },
  }),
}
