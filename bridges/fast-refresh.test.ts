// The bridge to React under Fast Refresh, as a bundler's plugin drives it with React's refresh runtime: an edit of a
// module registers its components again, under the ids they had, with the signature of their hooks, and
// `performReactRefresh` draws them. An edit that keeps a component's hooks keeps its state; one that changes them
// remounts it. Run by `bun run test:browsers` alone (`tools/browser/vitest.config.ts`): the runtime is hooked into
// React DOM before React DOM loads, which a page of its own allows.
import "./fast-refresh.test_hook.ts"
import { start, type Update } from "@fgaudo/effect-tea"
import * as Effect from "effect/Effect"
import { createElement, type ReactNode } from "react"
import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"
import * as Refresh from "react-refresh/runtime"
import { afterEach, describe, expect, test } from "vitest"
import { counter, type Message, type Model, type State } from "../examples/counter/counter.ts"
import { view } from "../examples/counter/view-react.tsx"
import { button, element, forked, scheduler, settle, stop } from "./bridge.test_suite.ts"
import { Draw, type Fork, Host } from "./react.ts"

let root: Root | undefined

afterEach(async () => {
  flushSync(() => root?.unmount())
  root = undefined
  settle()
  await stop()
})

// The program as an edit of its module leaves it: its `init` and its `update` changed.
const edited = {
  ...counter,
  init: { state: { count: 100 } },
  update: (() => ({ count }) => ({ state: { count: count + 10 } })) satisfies Update<State, Message>
}

// What ended each run that `Host` forked, as the forks happened.
const runs: Array<string> = []

const fork: Fork<never> = (effect) => {
  runs.push("forked")
  return Effect.runFork(effect.pipe(Effect.onInterrupt(() => Effect.sync(() => void runs.push("interrupted")))), {
    scheduler
  })
}

// One version of the component that draws the program: its heading, and its signature, the hooks it calls as a
// plugin writes them. `Host` itself is never edited: it is in the package, which the bundler does not refresh.
const version = (heading: string, hooks: string, drawn: () => ReactNode) => {
  const Counter = (): ReactNode => createElement("section", null, createElement("h1", null, heading), drawn())
  Refresh.setSignature(Counter, hooks)
  Refresh.register(Counter, "examples/counter/main.tsx Counter")
  return Counter
}

// The run that `Host` forks in a microtask after its effect, and what a click sends: once this resolves, it is drawn.
const drawn = async () => {
  await Promise.resolve()
  settle()
  flushSync(() => {})
}

const shown = () => [element("h1").textContent, element("output").textContent]

const click = async (times: number) => {
  for (let clicks = 0; clicks < times; clicks += 1) {
    button("+").click()
    await drawn()
  }
}

const mount = async (component: () => ReactNode) => {
  document.body.innerHTML = "<div id=\"app\"></div>"
  root = createRoot(element("#app"))
  flushSync(() => root?.render(createElement(component)))
  await drawn()
}

const edit = async () => {
  Refresh.performReactRefresh()
  await drawn()
}

describe("Host, under Fast Refresh", () => {
  test("an edit that keeps the hooks of the component above it keeps the run, with the program of its first render, and draws the new view", async () => {
    runs.length = 0
    await mount(version("One", "", () => createElement(Host<State, Model, Message>, { program: counter, fork, view })))
    await click(2)
    version("Two", "", () => createElement(Host<State, Model, Message>, { program: edited, fork, view }))
    await edit()
    expect(shown()).toEqual(["Two", "2"])
    await click(1)
    expect([shown(), runs]).toEqual([["Two", "3"], ["forked"]])
  })

  test("an edit that changes the hooks of the component above it remounts it: the run is interrupted, and the edited program starts from init", async () => {
    runs.length = 0
    await mount(version("One", "", () => createElement(Host<State, Model, Message>, { program: counter, fork, view })))
    await click(2)
    version("Two", "useState{}", () => createElement(Host<State, Model, Message>, { program: edited, fork, view }))
    await edit()
    expect(shown()).toEqual(["Two", "100"])
    await click(1)
    expect([shown(), runs]).toEqual([["Two", "110"], ["forked", "interrupted", "forked"]])
  })
})

describe("Draw, under Fast Refresh", () => {
  test("an edit that remounts the component above it draws the program started apart, whose state is kept", async () => {
    const { app, run } = start(counter)
    forked(run)
    const drawing = (heading: string, hooks: string) =>
      version(heading, hooks, () => createElement(Draw<Model, Message>, { app, view }))
    await mount(drawing("One", ""))
    await click(2)
    drawing("Two", "useState{}")
    await edit()
    expect(shown()).toEqual(["Two", "2"])
    await click(1)
    expect(shown()).toEqual(["Two", "3"])
  })
})
