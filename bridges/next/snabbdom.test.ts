// The bridge to snabbdom over the run of `src/next/` (`docs/records/synchronous-dispatch.md`, stage 3), in a DOM
// (happy-dom), with screen refreshes that happen only when a test paints: the tests every bridge passes
// (`bridge.test_suite.ts`), drawn with controlled elements, and those of snabbdom alone: when it draws, a listener
// called while a patch runs, what a draw in a handler throws, and an element it no longer gives its prop back to; then
// the premises of the bridge on snabbdom (`docs/premises.md`).
import { type MessageOf, type ModelOf, program, ProgramDefect, type Written } from "@fgaudo/effect-tea"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Opt from "effect/Option"
import { h, init, propsModule, type VNode } from "snabbdom"
import { counter, type Message as CounterMessage, type Model as CounterModel } from "../../examples/counter/counter.ts"
import { form, type Message as FormMessage, type Model as FormModel } from "../../examples/form/form.ts"
import { Storage } from "../../examples/form/storage.ts"
import type { Message as VolumeMessage, Model as VolumeModel } from "../../examples/volume/volume.ts"
import { type Dispatch, forwardTo } from "../../src/next/dispatch.ts"
import { run } from "../../src/next/run.ts"
import type { desk, draft, lid, lock, note, steps } from "../bridge.test_suite.ts"
import {
  type Bridge,
  bridgeTests,
  button,
  type controls,
  type Dictation,
  element,
  type gated,
  holdFrames,
  mount,
  refresh,
  scheduler,
  settle,
  stop,
  type
} from "./bridge.test_suite.ts"
import { renderInto, type View } from "./snabbdom.ts"

beforeAll(() => {
  GlobalRegistrator.register()
  holdFrames()
})

afterAll(() => GlobalRegistrator.unregister())

afterEach(stop)

/** The data of a controlled text field: its value is the model's, and what is typed is written over it. */
const field = (value: string, write: Dispatch<Written<string>>) => ({
  props: { value },
  on: {
    input: (event: Event) => write({ _tag: "Written", was: value, value: (event.target as HTMLInputElement).value })
  }
})

const counterView: View<CounterModel, CounterMessage> = (model, dispatch) =>
  h("main", [
    model._tag === "Counting"
      ? h("button", { props: { disabled: false }, on: { click: () => dispatch(model.decrement) } }, "−")
      : h("button", { props: { disabled: true } }, "−"),
    h("output", String(model.count)),
    h("button", { on: { click: () => dispatch(model.increment) } }, "+")
  ])

const formView: View<FormModel, FormMessage> = (model, dispatch) => {
  const { editor } = model
  return h("main", [
    h("input", {
      ...field(model.name, forwardTo(dispatch, "Name")),
      props: { value: model.name, disabled: editor._tag === "Saving", placeholder: "A name" }
    }),
    // snabbdom's props module never removes a prop: the enabled button sets `disabled` too.
    editor._tag === "Named"
      ? h("button", { props: { disabled: false }, on: { click: () => dispatch(editor.save) } }, "Save")
      : h("button", { props: { disabled: true } }, editor._tag === "Saving" ? "Saving…" : "Save"),
    ...Opt.match(model.failed, {
      onNone: () => [],
      onSome: (name) => [h("p.error", `Could not save “${name}”: try again.`)]
    }),
    h("ul", model.saved.map((name) => h("li", name)))
  ])
}

const draftView = (model: ModelOf<typeof draft>, dispatch: Dispatch<MessageOf<typeof draft>>): VNode =>
  h("form", [
    h("input", field(model.text, forwardTo(dispatch, "Text"))),
    h("button", { props: { type: "button" }, on: { click: () => dispatch("SendClicked") } }, "Send"),
    h("button", { props: { type: "button" }, on: { click: () => dispatch("DiscardClicked") } }, "Discard"),
    h("output", model.text)
  ])

const deskView: View<ModelOf<typeof desk>, MessageOf<typeof desk>> = (model, dispatch) =>
  h("main", [
    draftView(model.draft, forwardTo(dispatch, "Draft")),
    h("button", { on: { click: () => dispatch("Kept") } }, "Keep"),
    h("button", { on: { click: () => dispatch("Undone") } }, "Undo"),
    h("ul", model.sent.map((text) => h("li", text)))
  ])

const volumeView: View<VolumeModel, VolumeMessage> = (model, dispatch) =>
  h("main", [
    h("div.track.ringer", {
      on: Opt.match(model.ringer.press, {
        onNone: () => ({}),
        onSome: (press) => ({ pointerdown: () => dispatch(press) })
      })
    }, [h("div.fill", { style: { width: `${model.ringer.level}%` } })]),
    h("output.ringer", String(model.ringer.level))
  ])

const noteView: View<ModelOf<typeof note>, MessageOf<typeof note>> = (model, dispatch) =>
  h("main", [h("input", field(model, forwardTo(dispatch, "Note")))])

// The control listens to the source from the element's insertion: each result is put into the element on screen as a
// key is, and written by the element's own listener, over the model's value.
const dictatedView = (source: Dictation): View<ModelOf<typeof note>, MessageOf<typeof note>> => (model, dispatch) =>
  h("main", [
    h("input", {
      ...field(model, forwardTo(dispatch, "Note")),
      hook: {
        insert: (vnode) => {
          const input = vnode.elm as HTMLInputElement
          const stopped = source.listen((text) => type(input, text))
          ;(vnode.data ??= {}).stop = stopped
        },
        destroy: (vnode) => (vnode.data?.["stop"] as (() => void) | undefined)?.()
      }
    })
  ])

const lidView: View<ModelOf<typeof lid>, MessageOf<typeof lid>> = (model, dispatch) =>
  model._tag === "Opened"
    ? h("main", [
      h("input", { ...field(model.note, forwardTo(dispatch, "Note")), props: { value: model.note, readOnly: false } }),
      h("button", { on: { click: () => dispatch(model.close) } }, "Close"),
      h("output", model.note)
    ])
    : h("main", [
      h("input", { props: { value: "Closed", readOnly: true } }),
      h("button", { on: { click: () => dispatch(model.open) } }, "Open")
    ])

const stepsView: View<ModelOf<typeof steps>, MessageOf<typeof steps>> = (model, dispatch) =>
  h("main", [
    h(
      "input",
      field(model.text, model._tag === "First" ? forwardTo(dispatch, "First") : forwardTo(dispatch, "Second"))
    ),
    ...(model._tag === "First" ? [h("button", { on: { click: () => dispatch(model.next) } }, "Next")] : []),
    h("output", model.text)
  ])

const lockView: View<ModelOf<typeof lock>, MessageOf<typeof lock>> = (model, dispatch) =>
  h("main", [
    h("input", field(model.text, forwardTo(dispatch, "Text"))),
    ...(model._tag === "Open" ? [h("button", { on: { click: () => dispatch(model.lock) } }, "Lock")] : []),
    h("output", model.text)
  ])

const checkbox = (checked: boolean, write: Dispatch<Written<boolean>>) =>
  h("input", {
    props: { type: "checkbox", checked },
    on: {
      change: (event: Event) =>
        write({ _tag: "Written", was: checked, value: (event.target as HTMLInputElement).checked })
    }
  })

const controlsView: View<ModelOf<typeof controls>, MessageOf<typeof controls>> = (model, dispatch) =>
  h("main", [
    h("textarea", field(model.notes, forwardTo(dispatch, "Notes"))),
    h("select", field(model.choice, forwardTo(dispatch, "Choice")), [
      h("option", { props: { value: "tea" } }, "Tea"),
      h("option", { props: { value: "coffee" } }, "Coffee"),
      h("option", { props: { value: "water" } }, "Water")
    ]),
    checkbox(model.agreed, forwardTo(dispatch, "Agreed")),
    h("input", { ...field(model.level, forwardTo(dispatch, "Level")), props: { type: "range", value: model.level } })
  ])

const gatedView: View<ModelOf<typeof gated>, MessageOf<typeof gated>> = (model, dispatch) =>
  h("main", [
    h("textarea", field(model.notes, forwardTo(dispatch, "Notes"))),
    checkbox(model.agreed, forwardTo(dispatch, "Agreed")),
    ...(model.freeze === undefined ? [] : [h("button", { on: { click: () => dispatch("Frozen") } }, "Freeze")])
  ])

const snabbdom: Bridge<VNode> = {
  renderInto,
  drawn: () => undefined,
  views: {
    counter: counterView,
    form: formView,
    desk: deskView,
    volume: volumeView,
    note: noteView,
    dictated: dictatedView,
    lid: lidView,
    steps: stepsView,
    lock: lockView,
    controls: controlsView,
    gated: gatedView
  }
}

bridgeTests(snabbdom)

describe("when the bridge to snabbdom draws", () => {
  test("a notice from a command is drawn at the next refresh, at most once for each refresh", () => {
    const answers: Array<string> = []
    const app = mount(
      renderInto,
      formView,
      (render) => run(form, render).pipe(Effect.provideService(Storage, Storage.of({ save: () => Effect.void })))
    )
    settle()
    const input = element<HTMLInputElement>("input")
    type(input, "Ada")
    button("Save").click()
    // The click is drawn at once: the form is saving.
    expect(button("Saving…").disabled).toBe(true)
    const views = app.views()
    // The save's answer is applied in the command's fiber, and waits for the refresh to be drawn.
    settle()
    answers.push(input.value)
    expect(app.views()).toBe(views)
    refresh()
    settle()
    answers.push(input.value)
    expect(app.views()).toBe(views + 1)
    refresh()
    settle()
    expect(app.views()).toBe(views + 1)
    expect(answers).toEqual(["Ada", ""])
    expect(element("li").textContent).toBe("Ada")
  })

  test("once a notice is drawn, it waits for no screen refresh until the next notice", () => {
    const requests = { count: 0 }
    const request = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = (callback) => {
      requests.count += 1
      return request(callback)
    }
    try {
      mount(
        renderInto,
        formView,
        (render) => run(form, render).pipe(Effect.provideService(Storage, Storage.of({ save: () => Effect.void })))
      )
      settle()
      expect(requests.count).toBe(0)
      type(element<HTMLInputElement>("input"), "Ada")
      settle()
      expect(requests.count).toBe(1)
      refresh()
      settle()
      refresh()
      settle()
      expect(requests.count).toBe(1)
    } finally {
      globalThis.requestAnimationFrame = request
    }
  })

  // A listener may be called while a patch runs: here the DOM calls `blur` as an `insert` hook focuses the element it
  // inserts (HTML, "focus update steps"), and a browser calls it too as a patch removes the focused element.
  describe("a message a listener sends while a patch runs", () => {
    type Desk = Readonly<{ editing: boolean; left: number }>
    const editor = program<{ state: Desk; message: "Edit" | "Left" }>().make({
      init: { state: { editing: false, left: 0 } },
      update: (message: "Edit" | "Left") => (held) =>
        message === "Edit" ? { state: { ...held, editing: true } } : { state: { ...held, left: held.left + 1 } },
      makeModel: (held) => held
    })
    const editorView: View<Desk, "Edit" | "Left"> = (model, dispatch) =>
      h("main", [
        h("input#name", { on: { blur: () => dispatch("Left") } }),
        ...(model.editing
          ? [h("input#detail", { hook: { insert: (vnode) => (vnode.elm as HTMLInputElement).focus() } })]
          : [h("button", { on: { click: () => dispatch("Edit") } }, "Edit")]),
        h("output", String(model.left))
      ])

    // A patch inside the patch under way would patch a tree that no longer matches the page.
    test("is drawn once that patch is done, before the handler that set it going returns, and the run goes on", async () => {
      document.body.innerHTML = "<div id=\"app\"></div>"
      const fiber = Effect.runFork(run(editor, renderInto(element("#app"), editorView)), { scheduler })
      settle()
      element<HTMLInputElement>("#name").focus()
      button("Edit").click()
      expect(document.activeElement).toBe(element("#detail"))
      expect(element("output").textContent).toBe("1")
      expect([...document.querySelectorAll("main > *")].map((drawn) => drawn.id || drawn.tagName)).toEqual([
        "name",
        "detail",
        "OUTPUT"
      ])
      settle()
      const exit = fiber.pollUnsafe()
      await Effect.runPromise(Fiber.interrupt(fiber))
      expect(exit).toBeUndefined()
    })
  })
})

describe("what a draw in a handler throws", () => {
  // The errors a listener throws, which the DOM reports and never gives to the code that dispatched the event.
  const reported = () => {
    const errors: Array<unknown> = []
    const listener = (event: Event) => void errors.push((event as ErrorEvent).error)
    const error = console.error
    window.addEventListener("error", listener)
    console.error = () => undefined
    return {
      errors,
      done: () => {
        window.removeEventListener("error", listener)
        console.error = error
      }
    }
  }

  const ending = (view: View<CounterModel, CounterMessage>, program: typeof counter = counter) => {
    document.body.innerHTML = "<div id=\"app\"></div>"
    const fiber = Effect.runFork(run(program, renderInto(element("#app"), view)), { scheduler })
    settle()
    const errors = reported()
    try {
      button("+").click()
    } finally {
      errors.done()
    }
    // No screen refresh: the run ends with what its fibers can do without one.
    settle()
    return { exit: fiber.pollUnsafe(), errors: errors.errors, fiber }
  }

  const sites = (exit: Exit.Exit<void> | undefined) =>
    exit !== undefined && Exit.isFailure(exit)
      ? exit.cause.reasons.map((reason) =>
        reason._tag === "Die" && reason.defect instanceof ProgramDefect ? reason.defect.where : reason._tag
      )
      : exit

  test("by the view, ends the run at once, in render, and the handler gets nothing", async () => {
    const { exit, errors, fiber } = ending((model, dispatch) => {
      if (model.count === 1) throw new Error("A view that cannot draw")
      return counterView(model, dispatch)
    })
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(errors).toEqual([])
    expect(sites(exit)).toEqual(["render"])
  })

  // The run records a defect of `makeModel` where the model is read: the renderer's fiber dies of that very defect.
  test("by makeModel, ends the run at once, with one defect, in render, and the handler gets nothing", async () => {
    const thrown = new Error("A model that cannot be made")
    const fragile = {
      ...counter,
      makeModel: (state: Parameters<typeof counter.makeModel>[0]) => {
        if (state.count === 1) throw thrown
        return counter.makeModel(state)
      }
    }
    const { exit, errors, fiber } = ending(counterView, fragile)
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(errors).toEqual([])
    expect(sites(exit)).toEqual(["render"])
  })
})

describe("an element the bridge no longer gives its value back to", () => {
  type Shown = Readonly<{ controlled: boolean; text: string }>
  const shown = program<{ state: Shown; message: "Released" | "Removed" }>().make({
    init: { state: { controlled: true, text: "kept" } },
    update: (message: "Released" | "Removed") => (held) =>
      message === "Released" ? { state: { ...held, controlled: false } } : { state: { ...held, text: "" } },
    makeModel: (held) => held
  })

  test("drawn in the same place without a value, keeps what is typed into it through later draws", () => {
    mount(renderInto, (model: Shown, dispatch: Dispatch<"Released" | "Removed">) =>
      h("main", [
        model.controlled ? h("input", { props: { value: model.text } }) : h("input"),
        h("button", { on: { click: () => dispatch("Released") } }, "Release"),
        h("button", { on: { click: () => dispatch("Removed") } }, "Change"),
        h("output", model.text)
      ]), (render) => run(shown, render))
    settle()
    const input = element<HTMLInputElement>("input")
    button("Release").click()
    expect(element("input")).toBe(input)
    type(input, "typed")
    button("Change").click()
    expect(element("output").textContent).toBe("")
    expect(input.value).toBe("typed")
  })

  // The style module keeps an element a patch removes on screen until its `remove` styles are done.
  test("removed, though the style module keeps it on screen as it fades, is left as it is through later draws", () => {
    mount(renderInto, (model: Shown, dispatch: Dispatch<"Released" | "Removed">) =>
      h("main", [
        ...(model.controlled
          ? [h("input", {
            props: { value: model.text },
            style: { opacity: "1", transition: "opacity 1s", remove: { opacity: "0" } }
          })]
          : []),
        h("button", { on: { click: () => dispatch("Released") } }, "Release"),
        h("button", { on: { click: () => dispatch("Removed") } }, "Change"),
        h("output", model.text)
      ]), (render) => run(shown, render))
    settle()
    const input = element<HTMLInputElement>("input")
    button("Release").click()
    expect(input.isConnected).toBe(true)
    type(input, "typed")
    button("Change").click()
    expect(element("output").textContent).toBe("")
    expect(input.value).toBe("typed")
  })
})

// The premises of the bridge on snabbdom (`docs/premises.md`), each checked on snabbdom alone: its README describes the
// reuse of keyed elements only, and says that `update` runs as an element is updated, nothing of the vnodes it skips.
describe("snabbdom, as the bridge rests on it", () => {
  test("snabbdom reuses an <input> with no key in the same place", () => {
    document.body.innerHTML = "<div id=\"app\"></div>"
    const patch = init([propsModule])
    const first = patch(element("#app"), h("main", [h("input", { props: { placeholder: "first" } })]))
    const drawn = element<HTMLInputElement>("input")
    patch(first, h("main", [h("input", { props: { placeholder: "second" } })]))
    expect(element("input")).toBe(drawn)
    expect(drawn.placeholder).toBe("second")
  })

  test("snabbdom calls a module's update hook on every element h draws again, one h is given no data for included", () => {
    document.body.innerHTML = "<div id=\"app\"></div>"
    const updated: Array<unknown> = []
    const patch = init([propsModule, { update: (_, vnode) => void updated.push(vnode.elm) }])
    const first = patch(element("#app"), h("main", [h("input", { props: { placeholder: "first" } })]))
    const drawn = element<HTMLInputElement>("input")
    patch(first, h("main", [h("input")]))
    expect(updated).toContain(drawn)
  })
})
