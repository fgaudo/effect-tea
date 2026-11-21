// The bridge to snabbdom, in a DOM (happy-dom), whose draws a test awaits: the tests every bridge passes
// (`bridge.test_suite.ts`), drawn with controlled elements, and those of snabbdom alone: when it draws, a listener
// called while a patch runs, what a draw after a handler throws, an element it no longer gives its prop
// back to, and the buttons and the fields of the examples whose props snabbdom's props module never removes; then the
// premises of the bridge on snabbdom (`docs/premises.md`).
import {
  type Dispatch,
  forwardTo,
  type MessageOf,
  type ModelOf,
  program,
  ProgramDefect,
  start,
  type Written
} from "@fgaudo/effect-tea"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Opt from "effect/Option"
import * as Stream from "effect/Stream"
import { h, init, propsModule, type VNode } from "snabbdom"
import { counter, type Message as CounterMessage, type Model as CounterModel } from "../examples/counter/counter.ts"
import { view as counterView } from "../examples/counter/view-snabbdom.ts"
import { form } from "../examples/form/form.ts"
import { Storage } from "../examples/form/storage.ts"
import { view as formView } from "../examples/form/view-snabbdom.ts"
import { Scanner, Server, ServerError, stocktake } from "../examples/stocktake/stocktake.ts"
import { view as stocktakeView } from "../examples/stocktake/view.ts"
import { Bell, Phase, timer } from "../examples/timer/timer.ts"
import { timerView } from "../examples/timer/view.ts"
import type { Message as VolumeMessage, Model as VolumeModel } from "../examples/volume/volume.ts"
import {
  type Bridge,
  bridgeTests,
  button,
  type controls,
  type desk,
  type Dictation,
  type draft,
  drawing,
  element,
  forked,
  type gated,
  holdFrames,
  type lid,
  type lock,
  mount,
  type note,
  settle,
  type steps,
  stop,
  type
} from "./bridge.test_suite.ts"
import { drawInto, type View } from "./snabbdom.ts"

beforeAll(() => {
  GlobalRegistrator.register()
  holdFrames()
})

afterAll(() => GlobalRegistrator.unregister())

afterEach(stop)

/** The data of a controlled text field: its value is the model's, and what is typed is written. */
const field = (value: string, write: Dispatch<Written<string>>) => ({
  props: { value },
  on: { input: (event: Event) => write({ _tag: "Written", value: (event.target as HTMLInputElement).value }) }
})

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
      change: (event: Event) => write({ _tag: "Written", value: (event.target as HTMLInputElement).checked })
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

// The bridge draws a notice in a microtask: one queued after it resolves once it has drawn.
const drawn = () => new Promise<void>((resolve) => queueMicrotask(resolve))

const snabbdom: Bridge<VNode> = {
  drawInto,
  drawn,
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
  test("a notice from a command is drawn in a microtask, once", async () => {
    const answers: Array<string> = []
    const app = mount(
      drawInto,
      formView,
      start(form),
      Effect.provideService(Storage, Storage.of({ save: () => Effect.void }))
    )
    settle()
    const input = element<HTMLInputElement>("input")
    type(input, "Ada")
    await drawn()
    button("Save").click()
    // Not drawn while the task that clicked runs.
    expect(button("Save").disabled).toBe(false)
    await drawn()
    expect(button("Saving…").disabled).toBe(true)
    const views = app.views()
    // The save's answer is applied in the command's fiber, and drawn once that task is done.
    settle()
    answers.push(input.value)
    expect(app.views()).toBe(views)
    await drawn()
    answers.push(input.value)
    expect(app.views()).toBe(views + 1)
    await drawn()
    expect(app.views()).toBe(views + 1)
    expect(answers).toEqual(["Ada", ""])
    expect(element("li").textContent).toBe("Ada")
  })

  // Another program may draw into the same root by then.
  test("a draw asked for before the bridge is stopped is not made once it is stopped", async () => {
    document.body.innerHTML = "<div id=\"app\"></div>"
    const app = start(counter)
    const stopDrawing = drawInto(element("#app"), counterView)(app)
    forked(app.run)
    settle()
    button("+").click()
    stopDrawing()
    await drawn()
    expect([app.model().count, element("output").textContent]).toEqual([1, "0"])
  })

  test("asks for no screen refresh", async () => {
    const requests = { count: 0 }
    const request = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = (callback) => {
      requests.count += 1
      return request(callback)
    }
    try {
      mount(drawInto, formView, start(form), Effect.provideService(Storage, Storage.of({ save: () => Effect.void })))
      settle()
      type(element<HTMLInputElement>("input"), "Ada")
      button("Save").click()
      settle()
      await drawn()
      expect(requests.count).toBe(0)
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
    test("is drawn once that patch is done, in a microtask of its own, and the run goes on", async () => {
      document.body.innerHTML = "<div id=\"app\"></div>"
      const app = start(editor)
      drawing(drawInto(element("#app"), editorView)(app))
      const fiber = forked(app.run)
      settle()
      element<HTMLInputElement>("#name").focus()
      button("Edit").click()
      // What the listener sent while the patch ran is drawn in a microtask that patch's draw queued, before this one.
      await drawn()
      expect(document.activeElement).toBe(element("#detail"))
      expect(element("output").textContent).toBe("1")
      expect([...document.querySelectorAll("main > *")].map((drawn) => drawn.id || drawn.tagName)).toEqual([
        "name",
        "detail",
        "OUTPUT"
      ])
      settle()
      expect(fiber.pollUnsafe()).toBeUndefined()
    })
  })
})

// Where each defect of a run that died was met.
const sites = (exit: Exit.Exit<never> | undefined) =>
  exit !== undefined && Exit.isFailure(exit)
    ? exit.cause.reasons.map((reason) =>
      reason._tag === "Die" && reason.defect instanceof ProgramDefect ? reason.defect.where : reason._tag
    )
    : exit

describe("what a draw after a handler throws", () => {
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

  const ending = async (view: View<CounterModel, CounterMessage>, program: typeof counter = counter) => {
    document.body.innerHTML = "<div id=\"app\"></div>"
    const app = start(program)
    drawing(drawInto(element("#app"), view)(app))
    const fiber = forked(app.run)
    settle()
    const errors = reported()
    try {
      button("+").click()
      await drawn()
    } finally {
      errors.done()
    }
    settle()
    return { exit: fiber.pollUnsafe(), errors: errors.errors }
  }

  test("by the view, ends the run at once, in render, and the handler gets nothing", async () => {
    const { exit, errors } = await ending((model, dispatch) => {
      if (model.count === 1) throw new Error("A view that cannot draw")
      return counterView(model, dispatch)
    })
    expect(errors).toEqual([])
    expect(sites(exit)).toEqual(["render"])
  })

  // The run records a defect of `makeModel` where the model is read: `die` is given that very defect.
  test("by makeModel, ends the run at once, with one defect, in render, and the handler gets nothing", async () => {
    const thrown = new Error("A model that cannot be made")
    const fragile = {
      ...counter,
      makeModel: (state: Parameters<typeof counter.makeModel>[0]) => {
        if (state.count === 1) throw thrown
        return counter.makeModel(state)
      }
    }
    const { exit, errors } = await ending(counterView, fragile)
    expect(errors).toEqual([])
    expect(sites(exit)).toEqual(["render"])
  })

  // The tree it drew last stays on screen: its handlers still call the bridge's dispatch, which asks for a draw.
  test("by the view, stops the bridge, which draws nothing more when a button on screen is clicked", async () => {
    const drawnWith: Array<number> = []
    await ending((model, dispatch) => {
      drawnWith.push(model.count)
      if (model.count === 1) throw new Error("A view that cannot draw")
      return counterView(model, dispatch)
    })
    button("+").click()
    await drawn()
    expect(drawnWith).toEqual([0, 1])
  })
})

describe("what the first draw throws", () => {
  // Drawn by the call that starts the bridge, which nothing of the run calls: the run dies of it all the same.
  test("by the view, ends the run, in render, and drawInto throws nothing", () => {
    document.body.innerHTML = "<div id=\"app\"></div>"
    const app = start(counter)
    const draw = () =>
      drawInto<CounterModel, CounterMessage>(element("#app"), () => {
        throw new Error("A view that cannot draw")
      })(app)
    expect(draw).not.toThrow()
    const fiber = forked(app.run)
    settle()
    expect(sites(fiber.pollUnsafe())).toEqual(["render"])
  })

  // `model()` of a program whose `init` threw throws that very defect, and the first draw gives what it threw to `die`.
  // Found by the review of the bridges before 0.8.0: `die` takes only a model's defect as it is, so the run dies of the
  // defect of `init` and of a second one, in render, wrapping it.
  test("by an init that threw, ends the run with the one defect of init", () => {
    document.body.innerHTML = "<div id=\"app\"></div>"
    const thrown = new Error("An init that cannot start")
    const failing = program<
      { state: Readonly<{ count: number }>; model: CounterModel; message: CounterMessage; flags: number }
    >().make({
      init: () => {
        throw thrown
      },
      update: counter.update,
      makeModel: counter.makeModel
    })
    const app = start(failing, { flags: 0 })
    drawing(drawInto(element("#app"), counterView)(app))
    const fiber = forked(app.run)
    settle()
    expect(sites(fiber.pollUnsafe())).toEqual(["init"])
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

  test("drawn in the same place without a value, keeps what is typed into it through later draws", async () => {
    mount(drawInto, (model: Shown, dispatch: Dispatch<"Released" | "Removed">) =>
      h("main", [
        model.controlled ? h("input", { props: { value: model.text } }) : h("input"),
        h("button", { on: { click: () => dispatch("Released") } }, "Release"),
        h("button", { on: { click: () => dispatch("Removed") } }, "Change"),
        h("output", model.text)
      ]), start(shown))
    settle()
    const input = element<HTMLInputElement>("input")
    button("Release").click()
    await drawn()
    expect(element("input")).toBe(input)
    type(input, "typed")
    button("Change").click()
    await drawn()
    expect(element("output").textContent).toBe("")
    expect(input.value).toBe("typed")
  })

  // The style module keeps an element a patch removes on screen until its `remove` styles are done.
  test("removed, though the style module keeps it on screen as it fades, is left as it is through later draws", async () => {
    mount(drawInto, (model: Shown, dispatch: Dispatch<"Released" | "Removed">) =>
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
      ]), start(shown))
    settle()
    const input = element<HTMLInputElement>("input")
    button("Release").click()
    await drawn()
    expect(input.isConnected).toBe(true)
    type(input, "typed")
    button("Change").click()
    await drawn()
    expect(element("output").textContent).toBe("")
    expect(input.value).toBe("typed")
  })
})

describe("the buttons of the timer", () => {
  const quiet = Bell.of({ ring: Effect.void })
  const oneMinute = { ...timer, init: { state: { minutes: 1, phase: Phase.Setting() } } }

  test("only the \"−\" of one minute is disabled, through a start and a reset", async () => {
    mount(drawInto, timerView, start(oneMinute), Effect.provideService(Bell, quiet))
    settle()
    expect(button("−").disabled).toBe(true)
    button("Start").click()
    settle()
    await drawn()
    expect([button("Pause").disabled, button("Reset").disabled]).toEqual([false, false])
    button("Reset").click()
    settle()
    await drawn()
    expect([button("−").disabled, button("+").disabled, button("Start").disabled]).toEqual([true, false, false])
  })
})

// snabbdom patches a count's `<input>` from read-only to editable, and its props module never removes a prop: the lock
// of a sheet being submitted must not outlast the failure that gives the counts back.
describe("the counts of the stocktake", () => {
  const items = [{ id: "bolts", code: "C-BOLT", name: "Bolts", expected: 12 }]
  const unplugged = Scanner.of({ scans: Stream.empty })

  test("are read-only while submitted, and editable again once the submit has failed", async () => {
    // The submit is refused once the test opens the gate, so that the sheet being submitted is drawn first.
    const gate = Deferred.makeUnsafe<void>()
    const refusing = Server.of({
      load: () => Effect.succeed(items),
      submit: () => Effect.andThen(Deferred.await(gate), Effect.fail(new ServerError({ message: "refused" })))
    })
    mount(
      drawInto,
      stocktakeView,
      start(stocktake, { flags: { aisle: "A3" } }),
      (run) => run.pipe(Effect.provideService(Server, refusing), Effect.provideService(Scanner, unplugged))
    )
    settle()
    await drawn()
    type(element<HTMLInputElement>("input.count"), "12")
    await drawn()
    button("Submit count").click()
    await drawn()
    expect(element<HTMLInputElement>("input.count").readOnly).toBe(true)
    Deferred.doneUnsafe(gate, Exit.void)
    settle()
    // The failure is the answer of a command, drawn once the task that applied it is done.
    await drawn()
    expect(element("p.error").textContent).toBe("refused")
    expect(element<HTMLInputElement>("input.count").readOnly).toBe(false)
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
