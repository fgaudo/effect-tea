// A consumer of the bridges of the packed package, `@fgaudo/effect-tea/snabbdom`, `/snabbdom/testing` and `/react`,
// which `smoke.ts` runs with Node and typechecks once it has installed the renderers, and only then: what `consumer.ts`
// and the quick start check is checked without them. Node loads `window.ts` first, as a test of a snabbdom view does:
// snabbdom reads `window` as it loads.
import { type App, type Dispatch, program, start, type Update, type Written } from "@fgaudo/effect-tea"
import { Draw, Host, type View as ReactView } from "@fgaudo/effect-tea/react"
import { drawInto, type View } from "@fgaudo/effect-tea/snabbdom"
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
  h("button", { on: { click: () => dispatch(model.increment) } }, String(model.count))

const sent = messagesSentBy(view, counter.makeModel({ count: 0 }))
if (sent.join() !== "Increment") throw new Error(`messagesSentBy found ${sent.join()}, not Increment`)

// Typed, and not called: Node has no DOM to draw into.
export const begin = (root: Element) => {
  const { app, run } = start(counter)
  const stop = drawInto(root, { app, view })
  return { stop, fiber: Effect.runFork(run) }
}

// A controlled field: it shows the value, and what is typed is written.
export const field = (value: string, dispatch: Dispatch<Written<string>>) =>
  h("input", {
    props: { value },
    on: {
      input: (event: Event) => dispatch({ _tag: "Written", value: (event.target as HTMLInputElement).value })
    }
  })

const written = messagesSentBy(field, "Ada")
if (JSON.stringify(written) !== JSON.stringify([{ _tag: "Written", value: "Ada" }])) {
  throw new Error(`messagesSentBy found ${JSON.stringify(written)}, not the write of the field's value`)
}

const reactView: ReactView<Model, Message> = (model) => createElement("output", null, model.count)

// Typed, and not drawn: the bridge's own tests draw it on a server, and nothing is promised of hydration.
export const hosted = () => createElement(Host<State, Model, Message>, { program: counter, children: reactView })

export const drawn = (app: App<Model, Message>) => createElement(Draw<Model, Message>, { app, view: reactView })

export const input = (value: string, dispatch: Dispatch<Written<string>>) =>
  createElement("input", {
    value,
    onChange: (event: { target: { value: string } }) => dispatch({ _tag: "Written", value: event.target.value })
  })

console.log("node: the bridges ran")
