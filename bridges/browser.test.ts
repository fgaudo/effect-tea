// The bridges in a real browser, Chromium, Firefox and WebKit, and nowhere else: what happy-dom cannot show. A browser
// takes the focus from an element disabled as the screen refreshes, which happy-dom never does; an IME composes a text
// in the element before it is sent; and an event that the program's own code dispatches before a new state is
// drawn runs the handler of the view drawn before it (the guide's "Writing a bridge", "What is left out"); and so do a
// handler that awaits, and a limit that the element keeps by itself, which the browser applies to what a user types,
// with keys that Playwright sends as a user's. Run by
// `bun run test:browsers` (`tools/browser/vitest.config.ts`), never by `bun run test`, which leaves it out. The rest of
// the bridges' tests run there too, those of `snabbdom.test.ts` and `react.test.ts`, unchanged.
import { type App, type MessageOf, type ModelOf, start } from "@fgaudo/effect-tea"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import { createElement, type ReactNode } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { h, type VNode } from "snabbdom"
import { afterEach, describe, expect, test } from "vitest"
import { cdp, server, userEvent } from "vitest/browser"
import { counter } from "../examples/counter/counter.ts"
import { form } from "../examples/form/form.ts"
import { Storage } from "../examples/form/storage.ts"
import { view as formWithReact } from "../examples/form/view-react.tsx"
import { view as formWithSnabbdom } from "../examples/form/view-snabbdom.ts"
import {
  button,
  type DrawInto,
  element,
  lock,
  mount,
  note,
  settle,
  stop,
  type,
  type View
} from "./bridge.test_suite.ts"
import { Draw } from "./react.ts"
import { drawInto as drawWithSnabbdom } from "./snabbdom.ts"

afterEach(stop)

/** What a bridge gives these tests: how it draws a program started, and the views of their programs. */
type Bridge<Node> = Readonly<{
  drawInto: DrawInto<Node>
  form: View<Node, ModelOf<typeof form>, MessageOf<typeof form>>
  /** The note's controlled `<input>`, whose `maxLength` is `limit` when it is given. */
  note: (limit?: number) => View<Node, ModelOf<typeof note>, MessageOf<typeof note>>
  /** The counter's count, and a button whose handler increments twice, awaits `resumed`, then increments again. */
  counter: (resumed: Promise<void>) => View<Node, ModelOf<typeof counter>, MessageOf<typeof counter>>
  /** The same button in both states, with a handler only while open. */
  lock: View<Node, ModelOf<typeof lock>, MessageOf<typeof lock>>
}>

// A handler that sends twice, awaits, and sends once more.
const awaiting = async (resumed: Promise<void>, send: () => void) => {
  send()
  send()
  await resumed
  send()
}

const snabbdom: Bridge<VNode> = {
  drawInto: drawWithSnabbdom,
  form: formWithSnabbdom,
  note: (limit) => (model, dispatch) =>
    h("main", [
      h("input", {
        props: limit === undefined ? { value: model.note } : { value: model.note, maxLength: limit },
        on: { input: (event: Event) => dispatch({ ...model.typed, value: (event.target as HTMLInputElement).value }) }
      })
    ]),
  counter: (resumed) => (model, dispatch) =>
    h("main", [
      h("output", String(model.count)),
      h("button", { on: { click: () => awaiting(resumed, () => dispatch(model.increment)) } }, "Add")
    ]),
  lock: (model, dispatch) =>
    h("main", [
      model._tag === "Open"
        ? h("button", { on: { click: () => dispatch(model.lock) } }, "Lock")
        : h("button", "Lock")
    ])
}

// `Draw` in a React root of its own, which the bridge's stop unmounts.
const drawWithReact: DrawInto<ReactNode> = <Model, Message>(
  root: HTMLElement,
  { app, view }: { readonly app: App<Model, Message>; readonly view: View<ReactNode, Model, Message> }
) => {
  const reactRoot = createRoot(root)
  flushSync(() => reactRoot.render(createElement(Draw<Model, Message>, { app, view })))
  return () => reactRoot.unmount()
}

const react: Bridge<ReactNode> = {
  drawInto: drawWithReact,
  form: formWithReact,
  note: (limit) => (model, dispatch) =>
    createElement(
      "main",
      null,
      createElement("input", {
        value: model.note,
        maxLength: limit,
        onChange: (event: { target: { value: string } }) => dispatch({ ...model.typed, value: event.target.value })
      })
    ),
  counter: (resumed) => (model, dispatch) =>
    createElement(
      "main",
      null,
      createElement("output", null, String(model.count)),
      createElement("button", {
        type: "button",
        onClick: () => awaiting(resumed, () => dispatch(model.increment))
      }, "Add")
    ),
  lock: (model, dispatch) =>
    createElement(
      "main",
      null,
      createElement(
        "button",
        model._tag === "Open" ? { type: "button", onClick: () => dispatch(model.lock) } : { type: "button" },
        "Lock"
      )
    )
}

// Each bridge draws a new state in a microtask: once a task has run, all it drew is on the page.
const task = () => new Promise<void>((resolve) => setTimeout(resolve))

// A screen refresh, the browser's own: what the browser does to the focus as it refreshes, it has done once this
// resolves.
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

const browserTests = <Node>(name: string, bridge: Bridge<Node>) =>
  describe(name, () => {
    test("a name saved over several screen refreshes is emptied in the input on screen, which keeps the focus throughout", async () => {
      const saved = Deferred.makeUnsafe<void>()
      mount(
        bridge.drawInto,
        bridge.form,
        start(form),
        Effect.provideService(Storage, Storage.of({ save: () => Deferred.await(saved) }))
      )
      settle()
      await task()
      const input = element<HTMLInputElement>("input")
      input.focus()
      type(input, "Ada")
      await task()
      button("Save").click()
      settle()
      await frame()
      await frame()
      expect([input.readOnly, document.activeElement]).toEqual([true, input])
      Effect.runSync(Deferred.succeed(saved, undefined))
      settle()
      await task()
      await frame()
      expect(element("input")).toBe(input)
      expect([input.value, input.readOnly, document.activeElement]).toEqual(["", false, input])
      expect(element("li").textContent).toBe("Ada")
    })

    // An IME is driven only in Chromium, through its protocol (`Input.imeSetComposition`): Playwright drives none in
    // Firefox or WebKit.
    test.runIf(server.browser === "chromium")(
      "a text composed by an IME is stored as it is composed, a value the program puts there ends the composition, and what the IME commits is stored",
      async () => {
        const { app } = mount(bridge.drawInto, bridge.note(), start(note))
        settle()
        await task()
        const input = element<HTMLInputElement>("input")
        input.focus()
        // Vitest types the session as an empty interface, for a provider to fill.
        const ime = cdp() as { send: (method: string, params: object) => Promise<unknown> }
        const shown = () => [app.model().note, input.value]
        await ime.send("Input.imeSetComposition", { text: "か", selectionStart: 1, selectionEnd: 1 })
        await task()
        expect(shown()).toEqual(["か", "か"])
        await ime.send("Input.imeSetComposition", { text: "かな", selectionStart: 2, selectionEnd: 2 })
        await task()
        expect(shown()).toEqual(["かな", "かな"])
        const started: Array<string> = []
        input.addEventListener("compositionstart", () => started.push("again"))
        app.dispatch("Cleared")
        await task()
        expect(shown()).toEqual(["", ""])
        // The IME composes its whole text again, in a composition of its own.
        await ime.send("Input.imeSetComposition", { text: "かなに", selectionStart: 3, selectionEnd: 3 })
        await task()
        expect(shown()).toEqual(["かなに", "かなに"])
        expect(started).toEqual(["again"])
        await ime.send("Input.insertText", { text: "仮名に" })
        await task()
        expect(shown()).toEqual(["仮名に", "仮名に"])
        expect(document.activeElement).toBe(input)
      }
    )

    test("what a handler sends before its first await is drawn once it returns there, and what it sends after is drawn apart", async () => {
      const resumed = Promise.withResolvers<void>()
      mount(bridge.drawInto, bridge.counter(resumed.promise), start(counter))
      settle()
      await task()
      button("Add").click()
      await task()
      expect(element("output").textContent).toBe("2")
      resumed.resolve()
      await task()
      expect(element("output").textContent).toBe("3")
    })

    test("what a listener that the browser calls sends twice is drawn once, as it returns", async () => {
      const { views } = mount(bridge.drawInto, bridge.counter(new Promise<void>(() => {})), start(counter))
      settle()
      await task()
      const before = views()
      await userEvent.click(button("Add"))
      await task()
      expect([views() - before, element("output").textContent]).toEqual([1, "2"])
    })

    // An alarm of the browser's: a limit the element keeps leaves out of what it holds the keys past it, so its handler
    // sends what it holds ("Writing a bridge", "What a bridge does", a controlled element), and no value changed by the
    // element itself is left to show ("What is left out"). It is the killer of no mutation.
    test("a limit that the element keeps by itself, maxlength, keeps what a user types, and the element reports what it holds", async () => {
      const { app } = mount(bridge.drawInto, bridge.note(3), start(note))
      settle()
      await task()
      const input = element<HTMLInputElement>("input")
      await userEvent.type(input, "abcd")
      await task()
      expect([app.model().note, input.value]).toEqual(["abc", "abc"])
    })

    // An alarm of what the guide leaves unspecified ("Writing a bridge", "What is left out", an event that the
    // program's own code dispatches before a new state is drawn). It is the killer of no mutation.
    test("a click that the program's own code makes in the task of a new state, before its draw, runs the handler of the view drawn before", async () => {
      const ignored: Array<MessageOf<typeof lock>> = []
      const { app } = mount(
        bridge.drawInto,
        bridge.lock,
        start(lock, { onIgnored: ({ message }) => void ignored.push(message) })
      )
      settle()
      await task()
      app.dispatch("Locked")
      button("Lock").click()
      expect(ignored).toEqual(["Locked"])
      await task()
      button("Lock").click()
      expect(ignored).toEqual(["Locked"])
    })
  })

browserTests("snabbdom", snabbdom)

browserTests("React", react)

// An alarm of what the guide leaves unspecified ("Writing a bridge", "What is left out", an event that the program's
// own code dispatches before a new state is drawn): what each bridge does then. It is the killer of no mutation.
describe("an input event that the program's own code dispatches in the task of a new state, before its draw", () => {
  const typeThenClear = async <Node>(bridge: Bridge<Node>) => {
    const { app } = mount(bridge.drawInto, bridge.note(), start(note))
    settle()
    await task()
    const input = element<HTMLInputElement>("input")
    input.focus()
    type(input, "hello")
    await task()
    app.dispatch("Cleared")
    input.dispatchEvent(new Event("input", { bubbles: true }))
    const stored = app.model().note
    await task()
    return [stored, input.value]
  }

  test("with snabbdom, stores what the element held over what the program put there", async () => {
    expect(await typeThenClear(snabbdom)).toEqual(["hello", "hello"])
  })

  // React tells a new value from the one it saw last, and sends no `onChange` for an event that brings none.
  test("with React, sends nothing when the element holds the value React saw last, and the program's value is drawn", async () => {
    expect(await typeThenClear(react)).toEqual(["", ""])
  })
})
