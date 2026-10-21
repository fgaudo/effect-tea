// The parent declares its pages; their messages, commands, subscriptions and models are routed by the
// library. What is left is what only the parent knows: where each page lives, and what their events mean.
import { type MessageOf, type ModelOf, parent } from '@fgaudo/effect-tea'
import * as Opt from 'effect/Option'
import * as About from './about.ts'
import * as Clock from './clock.ts'

export type State = Readonly<{ clock: Clock.State; maybeAbout: Opt.Option<About.State> }>

const { child, compose } = parent<{ state: State }>()

export const app = compose({
  init: { state: { clock: Clock.clock.init.state, maybeAbout: Opt.none() } },
  children: {
    // Hidden under About, the Clock keeps its state but stops ticking.
    Clock: child(Clock.clock, {
      get: (state) => Opt.some(state.clock),
      set: (state, clock) => ({ ...state, clock }),
      subscribed: (state) => Opt.isNone(state.maybeAbout) ? Opt.some(state.clock) : Opt.none(),
    }),
    // While About is closed, `get` is `None` and its messages are rejected.
    About: child(About.about, {
      get: (state) => state.maybeAbout,
      set: (state, about) => ({ ...state, maybeAbout: Opt.some(about) }),
    }),
  },
  onEvent: {
    // Opening About again while it is open changes nothing, so that a double click opens it once.
    Clock: (_, children) => (state) => {
      if (Opt.isSome(state.maybeAbout)) return { state }
      const about = children.About.init
      return { state: { ...state, maybeAbout: Opt.some(about.state) }, commands: about.commands }
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

export type Model = ModelOf<typeof app>

/** The parent's messages, made by the library from its pages': `{ _tag: 'Clock' | 'About', message }`. */
export type Message = MessageOf<typeof app>
