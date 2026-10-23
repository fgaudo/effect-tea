// A page that starts from the time it was opened at, its flags, picks a saying when it opens, and asks its parent
// to leave with an event.
import type { Execution, Program, Update } from '@fgaudo/effect-tea'
import * as Data from 'effect/Data'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import * as Random from 'effect/Random'

export type State = Readonly<{ openedAt: Opt.Option<DateTime.Utc>; maybeSaying: Opt.Option<string> }>

/** What its parent starts it from. */
export type Flags = Readonly<{ openedAt: Opt.Option<DateTime.Utc> }>

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
      return { state: { ...state, maybeSaying: Opt.some(message.saying) } }
    case 'BackClicked':
      return { state, events: [{ _tag: 'LeaveRequested' }] }
  }
}

export type Model = Readonly<{ openedAt: Opt.Option<string>; saying: Opt.Option<string>; back: Message }>

export const about: Program<
  { state: State; model: Model; message: Message; command: Command; event: Event; flags: Flags }
> = {
  init: ({ openedAt }) => ({ state: { openedAt, maybeSaying: Opt.none() }, commands: [Command.PickSaying()] }),
  update,
  runCommand: (command) => {
    switch (command._tag) {
      case 'PickSaying':
        return pickSaying
    }
  },
  makeModel: (state) => ({
    openedAt: Opt.map(state.openedAt, DateTime.formatIso),
    saying: state.maybeSaying,
    back: Message.BackClicked(),
  }),
}
