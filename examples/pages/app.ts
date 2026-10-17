// Two pages under one parent, with `embed`. The Clock is always there, and About opens over it. The pages
// ask for navigation with events, and the parent decides: it owns where each page's state lives.
import { embed, type Program, type Step, type Update } from '@fgaudo/effect-tea'
import * as Data from 'effect/Data'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as About from './about.ts'
import * as Clock from './clock.ts'

export type State = Readonly<{ clock: Clock.State; maybeAbout: Opt.Option<About.State> }>

export type Message = Data.TaggedEnum<{
  GotClock: { message: Clock.Message }
  GotAbout: { message: About.Message }
}>

export const Message = Data.taggedEnum<Message>()

/** The Clock has no commands: only About's reach the parent. */
export type Command = Data.TaggedEnum<{
  About: { command: About.Command }
}>

export const Command = Data.taggedEnum<Command>()

// While About is open its messages reach it; once it is closed, `get` is `None` and they are rejected.
const aboutPage = embed(About.about, {
  key: 'About',
  wrap: (message: About.Message) => Message.GotAbout({ message }),
  wrapCommand: (command: About.Command) => Command.About({ command }),
  get: (state: State) => state.maybeAbout,
  set: (state, about) => ({ ...state, maybeAbout: Opt.some(about) }),
  onEvent: () => (state) => ({ state: { ...state, maybeAbout: Opt.none() } }),
})

// Opening About again while it is open changes nothing, so that a double click opens it once.
const openAbout = (state: State): Step<State, Command> =>
  Opt.isSome(state.maybeAbout) ? { state } : {
    state: { ...state, maybeAbout: Opt.some(About.about.init.state) },
    commands: aboutPage.liftCommands(About.about.init.commands),
  }

const clockPage = embed(Clock.clock, {
  key: 'Clock',
  wrap: (message: Clock.Message) => Message.GotClock({ message }),
  get: (state: State) => Opt.some(state.clock),
  // Hidden under About, the Clock keeps its state but stops ticking.
  getSubscribed: (state) => Opt.isNone(state.maybeAbout) ? Opt.some(state.clock) : Opt.none(),
  set: (state, clock) => ({ ...state, clock }),
  onEvent: () => openAbout,
})

export const update: Update<State, Message, Command> = (message) => {
  switch (message._tag) {
    case 'GotClock':
      return clockPage.update(message.message)
    case 'GotAbout':
      return aboutPage.update(message.message)
  }
}

/** Only the page on top is drawn. */
export type Model = Readonly<{
  page: Data.TaggedEnum<{
    Clock: { model: Clock.Model }
    About: { model: About.Model }
  }>
}>

export const app: Program<State, Model, Message, Command, never> = {
  init: { state: { clock: Clock.clock.init.state, maybeAbout: Opt.none() } },
  update,
  runCommand: (command) => {
    switch (command._tag) {
      case 'About':
        return aboutPage.runCommand(command.command)
    }
  },
  subscriptions: (state) => HashMap.union(clockPage.subscriptions(state), aboutPage.subscriptions(state)),
  makeModel: (state) => ({
    page: Opt.match(state.maybeAbout, {
      onNone: () => ({ _tag: 'Clock', model: Clock.clock.makeModel(state.clock) }),
      onSome: (about) => ({ _tag: 'About', model: About.about.makeModel(about) }),
    }),
  }),
}
