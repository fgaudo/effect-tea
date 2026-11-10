// The tutorial's second step: the duration becomes a timer. Its phase is one state machine: it is set, then runs,
// may pause, and finishes. It ticks every second only while it runs, and rings a bell when it finishes.
import { defect, type Execution, type Program, reject, type Subscription, type Update } from '@fgaudo/effect-tea'
import * as Channel from 'effect/Channel'
import * as Context from 'effect/Context'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'

// #region state
export type Phase = Data.TaggedEnum<{
  Setting: object
  Running: { secondsLeft: number }
  Paused: { secondsLeft: number }
  Finished: object
}>

export const Phase = Data.taggedEnum<Phase>()

/** `minutes` is kept while the timer runs, so that a reset sets it again as it was. */
export type State = Readonly<{ minutes: number; phase: Phase }>

export type Message = Data.TaggedEnum<{
  MoreClicked: object
  LessClicked: object
  StartClicked: object
  PauseClicked: object
  ResumeClicked: object
  ResetClicked: object
  Ticked: object
}>

export const Message = Data.taggedEnum<Message>()
// #endregion state

// #region command
export type Command = Data.TaggedEnum<{ Ring: object }>

export const Command = Data.taggedEnum<Command>()

/** The bell the timer rings. The program knows only this interface: `main.ts` and the tests provide it. */
export class Bell extends Context.Service<Bell, { readonly ring: Effect.Effect<void> }>()('examples/timer/Bell') {}

// Ringing only acts on the world: there is no answer for `update`, so the execution answers `None`.
export const runCommand = (command: Command): Execution<Message, Bell> => {
  switch (command._tag) {
    case 'Ring':
      return Effect.flatMap(Effect.service(Bell), (bell) => bell.ring).pipe(Effect.as(Opt.none()))
  }
}
// #endregion command

// #region update
export const update: Update<State, Message, Command> = (message) => (state) => {
  const { minutes, phase } = state
  switch (message._tag) {
    case 'MoreClicked':
      return phase._tag === 'Setting' ? { state: { ...state, minutes: minutes + 1 } } : reject
    case 'LessClicked':
      return phase._tag === 'Setting' && minutes > 1 ? { state: { ...state, minutes: minutes - 1 } } : reject
    case 'StartClicked':
      return phase._tag === 'Setting'
        ? { state: { ...state, phase: Phase.Running({ secondsLeft: minutes * 60 }) } }
        : reject
    case 'PauseClicked':
      return phase._tag === 'Running'
        ? { state: { ...state, phase: Phase.Paused({ secondsLeft: phase.secondsLeft }) } }
        : reject
    case 'ResumeClicked':
      return phase._tag === 'Paused'
        ? { state: { ...state, phase: Phase.Running({ secondsLeft: phase.secondsLeft }) } }
        : reject
    case 'ResetClicked':
      return phase._tag === 'Setting' ? reject : { state: { ...state, phase: Phase.Setting() } }
    // Ticks come only while running: pausing stops the subscription, and the run drops what it sent. A tick in
    // any other phase is a bug, and the run dies with it.
    case 'Ticked':
      if (phase._tag !== 'Running') return defect('A tick while the timer was not running')
      return phase.secondsLeft > 1
        ? { state: { ...state, phase: Phase.Running({ secondsLeft: phase.secondsLeft - 1 }) } }
        : { state: { ...state, phase: Phase.Finished() }, commands: [Command.Ring()] }
  }
}
// #endregion update

// #region subscriptions
const ticks: Subscription<Message, never> = Channel.forever(
  Channel.fromEffectDrain(Effect.sleep('1 second')).pipe(
    Channel.concatWith(() => Channel.succeed(Message.Ticked())),
  ),
)
// #endregion subscriptions

// #region model
export type Model = Data.TaggedEnum<{
  Setting: { minutes: number; more: Message; less: Opt.Option<Message>; start: Message }
  Running: { secondsLeft: number; pause: Message; reset: Message }
  Paused: { secondsLeft: number; resume: Message; reset: Message }
  Finished: { reset: Message }
}>

const makeModel = ({ minutes, phase }: State): Model => {
  const reset = Message.ResetClicked()
  switch (phase._tag) {
    case 'Setting':
      return {
        _tag: 'Setting',
        minutes,
        more: Message.MoreClicked(),
        less: minutes > 1 ? Opt.some(Message.LessClicked()) : Opt.none(),
        start: Message.StartClicked(),
      }
    case 'Running':
      return { _tag: 'Running', secondsLeft: phase.secondsLeft, pause: Message.PauseClicked(), reset }
    case 'Paused':
      return { _tag: 'Paused', secondsLeft: phase.secondsLeft, resume: Message.ResumeClicked(), reset }
    case 'Finished':
      return { _tag: 'Finished', reset }
  }
}
// #endregion model

// #region program
export const timer: Program<{
  state: State
  model: Model
  message: Message
  command: Command
  services: Bell
}> = {
  init: { state: { minutes: 25, phase: Phase.Setting() } },
  update,
  runCommand,
  subscriptions: (state) => state.phase._tag === 'Running' ? HashMap.make(['ticks', ticks]) : HashMap.empty(),
  makeModel,
}
// #endregion program
