// The parent declares its pages; their messages, commands, subscriptions and models are routed by the library, which
// keeps the pages too. What is left is what only the parent knows: which pages are there, and what their events mean.
import { type MessageOf, type ModelOf, program, type StateOf } from "@fgaudo/effect-tea"
import * as Opt from "effect/Option"
import * as About from "./about.ts"
import * as Clock from "./clock.ts"

/** The parent's own state: whether About is open, and what it was opened with. */
export type Own = Readonly<{ about: Opt.Option<About.Flags> }>

const { child, withChildren } = program<{ state: Own }>()

export const app = withChildren({
  // Always there. Hidden under About, the Clock keeps its state but stops ticking.
  Clock: child(Clock.clock, { listening: (state) => Opt.isNone(state.about) }),
  // There while the state gives its flags, and started from them.
  About: child(About.about, { there: (state) => state.about })
}).make({
  init: { state: { about: Opt.none() } },
  onEvent: {
    // Opening About again while it is open changes nothing, so that a double click opens it once.
    Clock: (event) => (state) =>
      Opt.isSome(state.about) ? { state } : { state: { about: Opt.some({ openedAt: event.at }) } },
    About: () => () => ({ state: { about: Opt.none() } })
  },
  // Only the page on top is drawn.
  makeModel: (_, children) => ({
    page: Opt.match(children.About(), {
      onNone: () => ({ _tag: "Clock" as const, model: children.Clock() }),
      onSome: (model) => ({ _tag: "About" as const, model })
    })
  })
})

/** The parent's whole state: its own, and the pages that the library keeps. */
export type State = StateOf<typeof app>

export type Model = ModelOf<typeof app>

/** The parent's messages, made by the library from its pages': `{ _tag: 'Clock' | 'About', message }`. */
export type Message = MessageOf<typeof app>
