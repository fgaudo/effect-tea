// A consumer of the bridges of the packed package, `@fgaudo/effect-tea/snabbdom`, `/snabbdom/testing` and `/react`,
// which `smoke.ts` runs with Node and typechecks once it has installed the renderers, and only then: what `consumer.ts`
// and the quick start check is checked without them. Node loads `window.ts` first, as a test of a snabbdom view does:
// snabbdom reads `window` as it loads.
import { type Dispatch, program, run, type Update, type Written } from "@fgaudo/effect-tea"
import { Frames, Host, makeStore, Shows, type View as ReactView } from "@fgaudo/effect-tea/react"
import { onClick, renderInto, shows, type View } from "@fgaudo/effect-tea/snabbdom"
import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import * as Effect from "effect/Effect"
import { createElement } from "react"
import { h } from "snabbdom"

type State = Readonly<{ count: number }>

type Message = "Increment"

type Model = Readonly<{ count: number; increment: Message }>

const update: Update<State, Message> = () => ({ count }) => ({ state: { count: count + 1 } })

const counter = program<{ state: State; model: Model; message: Message }>().make({
  init: { state: { count: 0 } },
  update,
  makeModel: ({ count }) => ({ count, increment: "Increment" })
})

const view: View<Model, Message> = (model, dispatch) =>
  h("button", { on: onClick(model.increment, dispatch) }, String(model.count))

const sent = messagesSentBy(view, counter.makeModel({ count: 0 }))
if (sent.join() !== "Increment") throw new Error(`messagesSentBy found ${sent.join()}, not Increment`)

// Typed, and not called: Node has no DOM to draw into.
export const start = (root: Element) => Effect.runFork(run(counter, renderInto(root, view)))

export const field = (value: string, dispatch: Dispatch<Written<string>>) => h("input", shows(value, dispatch))

const reactView: ReactView<Model, Message> = (model) => createElement("output", null, model.count)

// Typed, and not drawn: React's server rendering is no part of what the bridge supports.
export const hosted = () => createElement(Host<State, Model, Message>, { program: counter, children: reactView })

const store = makeStore<Model, Message>()

export const framed = () => createElement(Frames<Model, Message>, { store, view: reactView, fallback: "none" })

export const opened = () => Effect.runFork(run(counter, store.open()))

export const input = (value: string, dispatch: Dispatch<Written<string>>) => createElement(Shows, { value, dispatch })

console.log("node: the bridges ran")
