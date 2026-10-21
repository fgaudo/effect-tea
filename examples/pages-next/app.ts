// `examples/pages` on the prototype. The parent declares its pages; their messages, commands, subscriptions
// and models are routed by the library. What is left is what only the parent knows: where each page lives,
// and what their events mean.
import { child, compose } from '@fgaudo/effect-tea/next'
import * as Opt from 'effect/Option'
import * as About from './about.ts'
import * as Clock from './clock.ts'

export type State = Readonly<{ clock: Clock.State; maybeAbout: Opt.Option<About.State> }>

export const app = compose({
  init: { state: { clock: Clock.clock.init.state, maybeAbout: Opt.none() } as State },
  children: {
    // Hidden under About, the Clock keeps its state but stops ticking.
    Clock: child(Clock.clock, {
      get: (state: State) => Opt.some(state.clock),
      set: (state, clock) => ({ ...state, clock }),
      subscribed: (state) => Opt.isNone(state.maybeAbout) ? Opt.some(state.clock) : Opt.none(),
    }),
    // While About is closed, `get` is `None` and its messages are rejected.
    About: child(About.about, {
      get: (state: State) => state.maybeAbout,
      set: (state, about) => ({ ...state, maybeAbout: Opt.some(about) }),
    }),
  },
  onEvent: {
    // Opening About again while it is open changes nothing, so that a double click opens it once.
    Clock: (_, children) => (state) =>
      Opt.isSome(state.maybeAbout) ? { state } : {
        state: { ...state, maybeAbout: Opt.some(About.about.init.state) },
        commands: children.About.liftCommands(About.about.init.commands),
      },
    About: () => (state) => ({ state: { ...state, maybeAbout: Opt.none() } }),
  },
  // Only the page on top is drawn.
  makeModel: (state, { children }) => ({
    page: Opt.match(state.maybeAbout, {
      onNone: () => ({ _tag: 'Clock' as const, model: children.Clock(state) }),
      onSome: () => ({ _tag: 'About' as const, model: children.About(state) }),
    }),
  }),
})

export type Model = ReturnType<typeof app.makeModel>
