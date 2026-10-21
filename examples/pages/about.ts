// A page that picks a saying when it opens, and asks its parent to leave with an event.
import type { Execution, Offered, Program, Update } from '@fgaudo/effect-tea'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import * as Random from 'effect/Random'

export type State = Readonly<{ maybeSaying: Opt.Option<string> }>

export type Message = Data.TaggedEnum<{
  SayingPicked: { saying: string }
  BackClicked: object
}>

export const Message = Data.taggedEnum<Message>()

export type Command = Data.TaggedEnum<{ PickSaying: object }>

export const Command = Data.taggedEnum<Command>()

export type Event = Readonly<{ _tag: 'LeaveRequested' }>

const sayings = ['Make it work, make it right, make it fast.', 'Simple is better than complex.'] as const

const pickSaying: Execution<Message, never> = Effect.map(
  Random.choice(sayings),
  (saying) => Opt.some(Message.SayingPicked({ saying })),
)

export const update: Update<State, Message, Command, Event> = (message) => (state) => {
  switch (message._tag) {
    case 'SayingPicked':
      return { state: { maybeSaying: Opt.some(message.saying) } }
    case 'BackClicked':
      return { state, events: [{ _tag: 'LeaveRequested' }] }
  }
}

export type Model = Readonly<{ saying: Opt.Option<string>; back: Offered<Message> }>

export const about: Program<{ state: State; model: Model; message: Message; command: Command; event: Event }> = {
  init: { state: { maybeSaying: Opt.none() }, commands: [Command.PickSaying()] },
  update,
  runCommand: (command) => {
    switch (command._tag) {
      case 'PickSaying':
        return pickSaying
    }
  },
  makeModel: (state, { offer }) => ({ saying: state.maybeSaying, back: offer(Message.BackClicked()) }),
}
