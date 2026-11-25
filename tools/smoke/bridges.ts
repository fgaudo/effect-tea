// A consumer of the bridges of the packed package, `@fgaudo/effect-tea/snabbdom`, `/snabbdom/testing` and `/react`,
// which `smoke.ts` runs with Node and typechecks once it has installed the renderers, and only then: what `consumer.ts`
// and the quick start check is checked without them. Node loads `window.ts` first, as a test of a snabbdom view does:
// snabbdom reads `window` as it loads.
import { type App, type Dispatch, program, start, type Update } from "@fgaudo/effect-tea"
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

/** What is typed into a field, with the text that it holds: the model holds it without the text. */
type Typed = Readonly<{ _tag: "Typed"; value: string }>

type Field = Readonly<{ text: string; typed: Readonly<{ _tag: "Typed" }> }>

// A controlled field: it shows the text the model holds, and sends what is typed, filled with the text it holds.
export const field = (model: Field, dispatch: Dispatch<Typed>) =>
  h("input", {
    props: { value: model.text },
    on: {
      input: (event: Event) => dispatch({ ...model.typed, value: (event.target as HTMLInputElement).value })
    }
  })

const typed = messagesSentBy(field, { text: "Ada", typed: { _tag: "Typed" } })
if (JSON.stringify(typed) !== JSON.stringify([{ _tag: "Typed", value: "Ada" }])) {
  throw new Error(`messagesSentBy found ${JSON.stringify(typed)}, not what is typed, filled with the field's text`)
}

const reactView: ReactView<Model, Message> = (model) => createElement("output", null, model.count)

// Typed, and not drawn: the bridge's own tests draw it on a server, and nothing is promised of hydration.
export const hosted = () => createElement(Host<State, Model, Message>, { program: counter, view: reactView })

export const drawn = (app: App<Model, Message>) => createElement(Draw<Model, Message>, { app, view: reactView })

export const input = (model: Field, dispatch: Dispatch<Typed>) =>
  createElement("input", {
    value: model.text,
    onChange: (event: { target: { value: string } }) => dispatch({ ...model.typed, value: event.target.value })
  })

console.log("node: the bridges ran")
