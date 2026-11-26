// The bridge to React, in a DOM (happy-dom): the tests every bridge passes (`bridge.test_suite.ts`), drawn with `Draw`
// from a program the suite starts, with controlled elements as React's documentation draws them; where React reads the
// model; `Host`; what an application does beside the program, as `docs/records/hosted-react.md` tested it; a view drawn
// alone, as a user's test draws one; one program drawn by React and by snabbdom together; then the premises of the
// bridge on React (`docs/premises.md`).
import {
  type App,
  type Dispatch,
  forwardTo,
  type MessageOf,
  type ModelOf,
  program,
  ProgramDefect,
  start,
  type Started
} from "@fgaudo/effect-tea"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Opt from "effect/Option"
import {
  act,
  Activity,
  type Attributes,
  Component,
  createElement,
  type ErrorInfo,
  memo,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  startTransition,
  StrictMode,
  Suspense,
  use,
  useDeferredValue,
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition
} from "react"
import type { Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { h } from "snabbdom"
import { counter, type Message as CounterMessage, type Model as CounterModel } from "../examples/counter/counter.ts"
import { view as counterView } from "../examples/counter/view-react.tsx"
import { Draft, form, type Message as FormMessage, type Model as FormModel } from "../examples/form/form.ts"
import { Storage } from "../examples/form/storage.ts"
import { view as formView } from "../examples/form/view-react.tsx"
import { view as snabbdomFormView } from "../examples/form/view-snabbdom.ts"
import type { Message as VolumeMessage, Model as VolumeModel } from "../examples/volume/volume.ts"
import {
  type Bridge,
  bridgeTests,
  button,
  type controls,
  desk,
  type Dictation,
  type draft,
  drawing,
  type DrawInto,
  element,
  forked,
  type gated,
  holdFrames,
  lid,
  lock,
  note,
  scheduler,
  settle,
  setValue,
  state,
  type steps,
  stop,
  type
} from "./bridge.test_suite.ts"
import type { Fork, HostProps, View } from "./react.ts"
import { drawInto as drawWithSnabbdom } from "./snabbdom.ts"

// React DOM reads the DOM when it is loaded: the bridge and React DOM are loaded once there is one.
let bridge: typeof import("./react.ts")
let flushSync: typeof import("react-dom").flushSync
let createPortal: typeof import("react-dom").createPortal
let createRoot: typeof import("react-dom/client").createRoot
let hydrateRoot: typeof import("react-dom/client").hydrateRoot

beforeAll(async () => {
  GlobalRegistrator.register()
  holdFrames()
  bridge = await import("./react.ts")
  const reactDom = await import("react-dom")
  flushSync = reactDom.flushSync
  createPortal = reactDom.createPortal
  const client = await import("react-dom/client")
  createRoot = client.createRoot
  hydrateRoot = client.hydrateRoot
})

afterAll(() => GlobalRegistrator.unregister())

// React asks the environment to say it acts, and only for the call.
const acting = async (work: () => void | Promise<void>) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  try {
    await act(work)
  } finally {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false })
  }
}

// The roots a test made: unmounted after it, inside `act`. Unmounted, a `Host` interrupts its run, which `settle` lets
// through.
const roots: Array<Root> = []

// What reached `reportError` that no test took: a test that awaits a report puts its own in its place. Bun's own fails
// the test it is called in, and runs the tests after it inside the call, there inside the `act` and the commit that
// reported, which never end: such a report fails its test once the test has ended instead.
const unexpected: Array<unknown> = []
const bunReportError = globalThis.reportError
beforeAll(() => {
  globalThis.reportError = (error) => void unexpected.push(error)
})
afterAll(() => {
  globalThis.reportError = bunReportError
})

// The suite's `stop` ends the runs forked with `forked` and stops the bridges kept with `drawing`, the suite's and this
// file's.
afterEach(async () => {
  await acting(stop)
  for (const root of roots.splice(0)) await acting(() => root.unmount())
  settle()
  expect(unexpected.splice(0)).toEqual([])
})

// What a handler scheduled, or a notice from outside React: React renders it in a microtask, which `flushSync` takes
// at once.
const drawn = () => flushSync(() => {})

/** The data of a controlled text field, as React's documentation draws one: `value`, and `onChange`. */
// A controlled text field: its value is the model's, and `send` sends what is typed, the message its model holds
// filled with the text that the element holds.
const field = (value: string, send: (value: string) => void) => ({
  value,
  onChange: (event: { target: { value: string } }) => send(event.target.value)
})

const drawButton = (text: string, onClick: () => void) => createElement("button", { type: "button", onClick }, text)

// The suite starts the program itself: `Draw` draws its `App`, in a React root of its own, which the stop unmounts.
const drawInto: DrawInto<ReactNode> = <Model, Message>(
  root: HTMLElement,
  { app, view }: { readonly app: App<Model, Message>; readonly view: View<Model, Message> }
) => {
  const reactRoot = createRoot(root)
  flushSync(() => reactRoot.render(createElement(bridge.Draw<Model, Message>, { app, view })))
  return () => reactRoot.unmount()
}

// `Draw` in a root the test made, which the test unmounts.
const drawIn = <Model, Message>(root: Root, view: View<Model, Message>) => (app: App<Model, Message>) =>
  flushSync(() => root.render(createElement(bridge.Draw<Model, Message>, { app, view })))

const DraftView = (
  { model, dispatch }: Readonly<{ model: ModelOf<typeof draft>; dispatch: Dispatch<MessageOf<typeof draft>> }>
): ReactNode =>
  createElement(
    "form",
    null,
    createElement("input", field(model.text, (value) => dispatch({ ...model.typed, value }))),
    drawButton("Send", () => dispatch("SendClicked")),
    drawButton("Discard", () => dispatch("DiscardClicked")),
    drawButton("Keep", () => dispatch("Kept")),
    drawButton("Undo", () => dispatch("Undone")),
    createElement("output", null, model.text)
  )

const deskView: View<ModelOf<typeof desk>, MessageOf<typeof desk>> = (model, dispatch) =>
  createElement(
    "main",
    null,
    createElement(DraftView, { model: model.draft, dispatch: forwardTo(dispatch, "Draft") }),
    createElement("ul", null, ...model.sent.map((text, index) => createElement("li", { key: index }, text)))
  )

const volumeView: View<VolumeModel, VolumeMessage> = (model, dispatch) =>
  createElement(
    "main",
    null,
    createElement(
      "div",
      {
        className: "track ringer",
        onPointerDown: Opt.match(model.ringer.press, {
          onNone: () => undefined,
          onSome: (press) => (event: ReactPointerEvent<HTMLDivElement>) => {
            const { left, width } = event.currentTarget.getBoundingClientRect()
            dispatch({ ...press, clientX: event.clientX, left, width })
          }
        })
      },
      createElement("div", { className: "fill", style: { width: `${model.ringer.level}%` } })
    ),
    createElement("output", { className: "ringer" }, String(model.ringer.level))
  )

type NoteModel = ModelOf<typeof note>
type NoteMessage = MessageOf<typeof note>

const noteView: View<NoteModel, NoteMessage> = (model, dispatch) =>
  createElement("main", null, createElement("input", field(model.note, (value) => dispatch({ ...model.typed, value }))))

// The control listens to the source in an effect, and puts each result into the element as a key is.
const Dictated = (
  { model, dispatch, source }: Readonly<{ model: NoteModel; dispatch: Dispatch<NoteMessage>; source: Dictation }>
): ReactNode => {
  const [input, setInput] = useState<HTMLInputElement | null>(null)
  useEffect(() => (input === null ? undefined : source.listen((text) => type(input, text))), [input, source])
  return createElement("input", { ...field(model.note, (value) => dispatch({ ...model.typed, value })), ref: setInput })
}

const dictatedView = (source: Dictation): typeof noteView => (model, dispatch) =>
  createElement("main", null, createElement(Dictated, { model, dispatch, source }))

const lidView: View<ModelOf<typeof lid>, MessageOf<typeof lid>> = (model, dispatch) =>
  model._tag === "Opened"
    ? createElement(
      "main",
      null,
      createElement("input", field(model.note, (value) => dispatch({ ...model.typed, value }))),
      drawButton("Close", () => dispatch(model.close)),
      createElement("output", null, model.note)
    )
    : createElement(
      "main",
      null,
      createElement("input", { value: "Closed", readOnly: true }),
      drawButton("Open", () => dispatch(model.open))
    )

const stepsView: View<ModelOf<typeof steps>, MessageOf<typeof steps>> = (model, dispatch) =>
  createElement(
    "main",
    null,
    createElement("input", field(model.text, (value) => dispatch({ ...model.typed, value }))),
    model._tag === "First" ? drawButton("Next", () => dispatch(model.next)) : null,
    createElement("output", null, model.text)
  )

const lockView: View<ModelOf<typeof lock>, MessageOf<typeof lock>> = (model, dispatch) =>
  createElement(
    "main",
    null,
    createElement("input", field(model.text, (value) => dispatch({ ...model.typed, value }))),
    model._tag === "Open" ? drawButton("Lock", () => dispatch(model.lock)) : null,
    createElement("output", null, model.text)
  )

const checkbox = (checked: boolean, send: (value: boolean) => void) =>
  createElement("input", {
    type: "checkbox",
    checked,
    onChange: (event: { target: { checked: boolean } }) => send(event.target.checked)
  })

const controlsView: View<ModelOf<typeof controls>, MessageOf<typeof controls>> = (model, dispatch) =>
  createElement(
    "main",
    null,
    createElement("textarea", field(model.notes, (value) => dispatch({ ...model.notesTyped, value }))),
    createElement(
      "select",
      field(model.choice, (value) => dispatch({ ...model.choiceChosen, value })),
      createElement("option", { value: "tea" }, "Tea"),
      createElement("option", { value: "coffee" }, "Coffee"),
      createElement("option", { value: "water" }, "Water")
    ),
    checkbox(model.agreed, (value) => dispatch({ ...model.agreedChecked, value })),
    createElement("input", {
      type: "range",
      ...field(model.level, (value) => dispatch({ ...model.levelMoved, value }))
    })
  )

const radio = (value: string, chosen: string, send: (value: string) => void) =>
  createElement("input", {
    type: "radio",
    name: "size",
    value,
    checked: value === chosen,
    onChange: (event: { target: { value: string } }) => send(event.target.value)
  })

const gatedView: View<ModelOf<typeof gated>, MessageOf<typeof gated>> = (model, dispatch) =>
  createElement(
    "main",
    null,
    controlsView(model, dispatch),
    radio("small", model.size, (value) => dispatch({ ...model.sizeChosen, value })),
    radio("large", model.size, (value) => dispatch({ ...model.sizeChosen, value })),
    model.freeze === undefined ? null : drawButton("Freeze", () => dispatch("Frozen"))
  )

const react: Bridge<ReactNode> = {
  drawInto,
  drawn: async () => drawn(),
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

bridgeTests(react)

const page = () => {
  document.body.innerHTML = "<div id=\"app\"></div><div id=\"aside\"></div>"
  return element<HTMLElement>("#app")
}

const rootIn = (into: HTMLElement) => {
  const root = createRoot(into)
  roots.push(root)
  return root
}

const unmount = async (root: Root) => {
  roots.splice(roots.indexOf(root), 1)
  await acting(() => root.unmount())
  settle()
}

// Draws a program that was started with `Draw` into a root of its own, and runs it.
const drawRun = <Model, Message>({ app, run }: Started<Model, Message>, view: View<Model, Message>) => {
  drawIn(rootIn(page()), view)(app)
  forked(run)
  settle()
}

// The stack on which React reads the model: the run makes a model as it is read, once for each state.
describe("where React reads the model under Draw", () => {
  test("a new state's model is made in the notice, on the stack of whoever sent the message, and not again", () => {
    const made: Array<string> = []
    let sending = false
    const counted = program<{ state: Readonly<{ count: number }>; message: "Increment"; model: number }>().make({
      init: { state: { count: 0 } },
      update: () => (held) => ({ state: { count: held.count + 1 } }),
      makeModel: ({ count }) => {
        made.push(sending ? `${count} while sending` : `${count} after`)
        return count
      }
    })
    const { app, run } = start(counted)
    drawRun({ app, run }, (count, dispatch) => drawButton(String(count), () => dispatch("Increment")))
    expect(made).toEqual(["0 after"])
    sending = true
    app.dispatch("Increment")
    sending = false
    drawn()
    expect(element("button").textContent).toBe("1")
    expect(made).toEqual(["0 after", "1 while sending"])
  })
})

const heldFork: Fork<never> = (effect) => Effect.runFork(effect, { scheduler })

const withStorage = (storage: Storage["Service"]): Fork<Storage> => (effect) =>
  heldFork(effect.pipe(Effect.provideService(Storage, storage)))

// `createElement` does not infer the types of a generic component, as JSX does: a function of its props does.
const host = <
  State,
  Model,
  Message,
  Command = never,
  CommandServices = never,
  SubscriptionServices = never,
  Flags = never,
  Key = never
>(
  props: HostProps<State, Model, Message, Command, CommandServices, SubscriptionServices, Flags, Key> & Attributes
) =>
  createElement(bridge.Host<State, Model, Message, Command, CommandServices, SubscriptionServices, Flags, Key>, props)

const hostInto = async (node: ReactNode, into = page()) => {
  const root = rootIn(into)
  await acting(() => root.render(node))
  return root
}

// Lets the run that `Host` forked start the effects of its first state, inside `act`: what `Host` sets as the run goes,
// outside any event of React's, React renders in a lane of its own.
const started = () => acting(() => settle())

// A note's Host, which records what it draws with.
const hostNote = (view: View<NoteModel, NoteMessage> = noteView) => {
  let last: Readonly<{ model: NoteModel; dispatch: Dispatch<NoteMessage> }> | undefined
  const node = host({
    program: note,
    fork: heldFork,
    view: (model, dispatch) => {
      last = { model, dispatch }
      return view(model, dispatch)
    }
  })
  const current = () => {
    if (last === undefined) throw new Error("Nothing is drawn")
    return last
  }
  return { node, note: () => current().model.note, send: (message: NoteMessage) => current().dispatch(message) }
}

// A promise, and what settles it: a witness a test awaits.
const witness = <A>() => {
  let settled: (value: A) => void = () => {}
  const promise = new Promise<A>((resolve) => {
    settled = resolve
  })
  return { promise, settled }
}

// An error boundary, which draws "Crashed" once it has caught what a render threw.
class Boundary extends Component<Readonly<{ children: ReactNode }>, Readonly<{ caught: unknown }>> {
  override state: Readonly<{ caught: unknown }> = { caught: undefined }
  static getDerivedStateFromError(caught: unknown) {
    return { caught }
  }
  override componentDidCatch(_: unknown, __: ErrorInfo) {}
  override render() {
    return this.state.caught === undefined ? this.props.children : createElement("p", null, "Crashed")
  }
}

describe("Host", () => {
  test("draws the first model in the render that mounts it, before its run is forked", async () => {
    const order: Array<string> = []
    await hostInto(host({
      program: counter,
      fork: (effect) => {
        order.push("forked")
        return heldFork(effect)
      },
      view: (model, dispatch) => {
        order.push(`drawn ${model.count}`)
        return counterView(model, dispatch)
      }
    }))
    expect(order).toEqual(["drawn 0", "forked"])
    expect(element("output").textContent).toBe("0")
    await started()
    button("+").click()
    drawn()
    expect(element("output").textContent).toBe("1")
  })

  // No effect runs on a server: the program is started, by plain code, and never run.
  test("on a server, renderToString draws the first model, and starts nothing of init", () => {
    const loads = program<{ state: Readonly<{ loaded: number }>; message: "Loaded"; command: "Load" }>()
    const commands: Array<string> = []
    const loading = loads.make({
      init: { state: { loaded: 7 }, commands: ["Load"] },
      update: () => (held) => ({ state: { loaded: held.loaded + 1 } }),
      runCommand: () => Effect.sync(() => void commands.push("started")).pipe(Effect.as(Opt.none())),
      makeModel: (held) => held
    })
    const html = renderToString(host({
      program: loading,
      view: (model) => createElement("output", null, model.loaded)
    }))
    expect(html).toBe("<output>7</output>")
    expect(commands).toEqual([])
    const { app } = start(loading)
    expect(renderToString(createElement(bridge.Draw<Readonly<{ loaded: number }>, "Loaded">, {
      app,
      view: (model) => createElement("output", null, model.loaded)
    }))).toBe("<output>7</output>")
  })

  test("starts the program with the options of its first render", async () => {
    const applied: Array<CounterMessage> = []
    const ignored: Array<CounterMessage> = []
    const node = (onApplied: (message: CounterMessage) => undefined) =>
      host({
        program: counter,
        options: { onApplied: ({ message }) => onApplied(message) },
        fork: heldFork,
        view: counterView
      })
    const root = await hostInto(node((message) => void applied.push(message)))
    await started()
    await acting(() => root.render(node((message) => void ignored.push(message))))
    button("+").click()
    drawn()
    expect([applied, ignored]).toEqual([["Increment"], []])
  })

  test("interrupts the run as it unmounts, and the run releases what it holds", async () => {
    const ended: Array<string> = []
    const root = await hostInto(host({
      program: counter,
      fork: (effect) => heldFork(effect.pipe(Effect.onInterrupt(() => Effect.sync(() => ended.push("run"))))),
      view: counterView
    }))
    await started()
    expect(ended).toEqual([])
    await unmount(root)
    expect(ended).toEqual(["run"])
    expect(element("#app").childElementCount).toBe(0)
  })

  test("interrupts the fiber that fork returns as it unmounts, which the application may await", async () => {
    const forked: Array<Fiber.Fiber<void, unknown>> = []
    const root = await hostInto(host({
      program: counter,
      fork: (effect) => {
        const fiber = heldFork(effect)
        forked.push(fiber)
        return fiber
      },
      view: counterView
    }))
    await started()
    await unmount(root)
    expect(forked).toHaveLength(1)
    const exit = await Effect.runPromise(Fiber.await(forked[0]!))
    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
  })

  test("a new key starts the program anew, from the init of the props of that render", async () => {
    const node = (key: string, program: typeof counter) => host({ key, program, fork: heldFork, view: counterView })
    const later = { ...counter, init: { state: { count: 5 } } }
    const root = await hostInto(node("first", counter))
    await started()
    button("+").click()
    drawn()
    expect(element("output").textContent).toBe("1")
    await acting(() => root.render(node("first", later)))
    expect(element("output").textContent).toBe("1")
    await acting(() => root.render(node("second", later)))
    await started()
    expect(element("output").textContent).toBe("5")
    button("+").click()
    drawn()
    expect(element("output").textContent).toBe("6")
  })

  test("starts a program with flags from the flags of its first render, and draws its first model from them", async () => {
    const node = (flags: "Opened" | "Closed") =>
      host({ program: lid, options: { flags }, fork: heldFork, view: lidView })
    const root = await hostInto(node("Opened"))
    expect(element<HTMLInputElement>("input").value).toBe("draft")
    await started()
    await acting(() => root.render(node("Closed")))
    expect([element<HTMLInputElement>("input").value, button("Close").textContent]).toEqual(["draft", "Close"])
  })

  // React's `<Activity>` destroys the effects of what it hides, and creates them again as it shows it (react.dev,
  // "<Activity>"), keeping the state of its components: `Host`'s `App` stays, of a run that has ended, until the new
  // run gives its own.
  test("hidden by Activity, the run ends; shown again, the program starts from init", async () => {
    const ended: Array<string> = []
    const node = (mode: "visible" | "hidden") =>
      createElement(Activity, {
        mode,
        children: host({
          program: counter,
          fork: (effect) => heldFork(effect.pipe(Effect.onInterrupt(() => Effect.sync(() => ended.push("run"))))),
          view: counterView
        })
      })
    const root = await hostInto(node("visible"))
    await started()
    button("+").click()
    drawn()
    expect(element("output").textContent).toBe("1")
    await acting(() => root.render(node("hidden")))
    settle()
    expect(ended).toEqual(["run"])
    await acting(() => root.render(node("visible")))
    await started()
    expect(element("output").textContent).toBe("0")
  })

  test("shown again by Activity, starts the run with the fork of its first render", async () => {
    const forks: Array<string> = []
    const forkedBy = (name: string): Fork<never> => (effect) => {
      forks.push(name)
      return heldFork(effect)
    }
    const node = (mode: "visible" | "hidden", fork: Fork<never>) =>
      createElement(Activity, { mode, children: host({ program: counter, fork, view: counterView }) })
    const root = await hostInto(node("visible", forkedBy("first")))
    await started()
    await acting(() => root.render(node("visible", forkedBy("second"))))
    await acting(() => root.render(node("hidden", forkedBy("second"))))
    settle()
    await acting(() => root.render(node("visible", forkedBy("second"))))
    await started()
    expect(forks).toEqual(["first", "first"])
  })

  test("shown again by Activity, starts anew the program of its first render", async () => {
    const node = (mode: "visible" | "hidden", program: typeof counter) =>
      createElement(Activity, { mode, children: host({ program, fork: heldFork, view: counterView }) })
    const later = { ...counter, init: { state: { count: 5 } } }
    const root = await hostInto(node("visible", counter))
    await started()
    await acting(() => root.render(node("visible", later)))
    await acting(() => root.render(node("hidden", later)))
    settle()
    await acting(() => root.render(node("visible", later)))
    await started()
    expect(element("output").textContent).toBe("0")
  })

  test("shown again by Activity, starts the program anew with the options of its first render", async () => {
    const applied: Array<string> = []
    const node = (mode: "visible" | "hidden", name: string) =>
      createElement(Activity, {
        mode,
        children: host({
          program: counter,
          options: { onApplied: () => void applied.push(name) },
          fork: heldFork,
          view: counterView
        })
      })
    const root = await hostInto(node("visible", "first"))
    await started()
    await acting(() => root.render(node("visible", "second")))
    await acting(() => root.render(node("hidden", "second")))
    settle()
    await acting(() => root.render(node("visible", "second")))
    await started()
    button("+").click()
    drawn()
    expect([applied, element("output").textContent]).toEqual([["first"], "1"])
  })

  // Never called: what the compiler refuses.
  test("the types ask for a fork whenever the run needs services, and for a view of the program's model", () => {
    // @ts-expect-error a run that needs services is given the fork that provides them
    const unforked = () => host({ program: form, view: formView })
    // @ts-expect-error a view of another program's model
    const misdrawn = () => host({ program: counter, view: formView })
    expect([unforked, misdrawn]).toHaveLength(2)
  })

  // Never called: what the compiler refuses.
  test("the types ask for options with flags exactly when the program has flags", () => {
    // @ts-expect-error a program with flags is started with them
    const unflagged = () => host({ program: lid, view: lidView })
    // @ts-expect-error a program with no flags is given none
    const flagged = () => host({ program: counter, options: { flags: 1 }, view: counterView })
    expect([unflagged, flagged]).toHaveLength(2)
  })

  test("the program's services come from the runtime the application gives", async () => {
    const saved: Array<string> = []
    const runtime = ManagedRuntime.make(
      Layer.succeed(Storage, Storage.of({ save: (name) => Effect.sync(() => void saved.push(name)) }))
    )
    await hostInto(host({
      program: form,
      fork: (effect) => runtime.runFork(effect, { scheduler }),
      view: formView
    }))
    await started()
    type(element<HTMLInputElement>("input"), "Ada")
    button("Save").click()
    settle()
    drawn()
    expect(saved).toEqual(["Ada"])
    expect(element("li").textContent).toBe("Ada")
    await runtime.dispose()
  })

  test("a dispatch, and each dispatch of forwardTo, is the very same function in every render", async () => {
    const dispatches = new Set<unknown>()
    const forwarded = new Set<unknown>()
    await hostInto(host({
      program: desk,
      fork: heldFork,
      view: (model, dispatch) => {
        dispatches.add(dispatch)
        forwarded.add(forwardTo(dispatch, "Draft"))
        return deskView(model, dispatch)
      }
    }))
    await started()
    for (const text of ["A", "Ad", "Ada"]) {
      type(element<HTMLInputElement>("input"), text)
      drawn()
    }
    expect(element<HTMLInputElement>("input").value).toBe("Ada")
    expect([dispatches.size, forwarded.size]).toEqual([1, 1])
  })

  test("a form typed into and saved, its answer drawn once React renders the notice", async () => {
    await hostInto(
      host({ program: form, fork: withStorage(Storage.of({ save: () => Effect.void })), view: formView })
    )
    await started()
    const input = element<HTMLInputElement>("input")
    type(input, "Ada")
    expect(input.value).toBe("Ada")
    button("Save").click()
    settle()
    drawn()
    expect([input.value, element("li").textContent]).toEqual(["", "Ada"])
  })

  describe("a run that dies", () => {
    type Broken = Readonly<{ broken: "Broke" }>
    const fragile = program<{ state: Readonly<{ count: number }>; model: Broken; message: "Broke" }>().make({
      init: { state: { count: 0 } },
      update: () => () => {
        throw new Error("An update that cannot apply")
      },
      makeModel: () => ({ broken: "Broke" })
    })

    const breakIn = (fork: Fork<never>) =>
      host({
        program: fragile,
        fork,
        view: (model, dispatch) => drawButton("Break", () => dispatch(model.broken))
      })

    test("throws its ProgramDefect as Host renders, for the nearest error boundary", async () => {
      const caught = witness<unknown>()
      const root = createRoot(page(), { onCaughtError: (error) => caught.settled(error) })
      roots.push(root)
      await acting(() => root.render(createElement(Boundary, null, breakIn(heldFork))))
      await started()
      // The defect is recorded in the dispatch, never thrown to the handler, and the run ends with it. Inside `act`:
      // Host sets its state from a fiber, and React's own scheduler, loaded under the DOM of the first file of the
      // tests that imported React, would never run it outside `act` once that DOM is gone.
      await acting(() => {
        button("Break").click()
        settle()
      })
      const error = await caught.promise
      expect(element("#app").textContent).toBe("Crashed")
      expect(error).toBeInstanceOf(ProgramDefect)
      expect(error).toMatchObject({ where: "update" })
    })

    // The fork dies once more as the run ends: the cause it ends with holds two defects.
    test("throws Cause.squash of what the run ended with, one defect of a cause that holds two", async () => {
      const caught = witness<unknown>()
      const released = new Error("A release that cannot complete")
      let fiber: Fiber.Fiber<void, unknown> | undefined
      const root = createRoot(page(), { onCaughtError: (error) => caught.settled(error) })
      roots.push(root)
      await acting(() =>
        root.render(createElement(
          Boundary,
          null,
          breakIn((effect) => {
            fiber = heldFork(effect.pipe(Effect.ensuring(Effect.die(released))))
            return fiber
          })
        ))
      )
      await started()
      await acting(() => {
        button("Break").click()
        settle()
      })
      const error = await caught.promise
      const exit = fiber === undefined ? undefined : await Effect.runPromise(Fiber.await(fiber))
      if (exit === undefined || !Exit.isFailure(exit)) throw new Error("The run did not die")
      expect(exit.cause.reasons.map((reason) => reason._tag)).toEqual(["Die", "Die"])
      expect(error).toBe(Cause.squash(exit.cause))
      expect(error).toMatchObject({ where: "update" })
    })

    // The fiber `fork` returns may fail where the run itself cannot: what it fails with is thrown as a defect is.
    test("a run that fails throws what it failed with as Host renders, for the nearest error boundary", async () => {
      const caught = witness<unknown>()
      const failed = new Error("A fork that fails")
      const root = createRoot(page(), { onCaughtError: (error) => caught.settled(error) })
      roots.push(root)
      await acting(() =>
        root.render(createElement(
          Boundary,
          null,
          host({
            program: counter,
            fork: (effect) => Effect.runFork(Effect.raceFirst(effect, Effect.fail(failed)), { scheduler }),
            view: counterView
          })
        ))
      )
      await started()
      expect(await caught.promise).toBe(failed)
      expect(element("#app").textContent).toBe("Crashed")
    })

    // The application handles the defect in the fiber it forks: `Host` sees a run that ended well.
    test("what the application handles around the run is not thrown again", async () => {
      const handled = witness<void>()
      let fiber: Fiber.Fiber<void, unknown> | undefined
      const caught: Array<unknown> = []
      const root = createRoot(page(), { onCaughtError: (error) => void caught.push(error) })
      roots.push(root)
      await acting(() =>
        root.render(createElement(
          Boundary,
          null,
          breakIn((effect) => {
            fiber = heldFork(effect.pipe(Effect.catchCause(() => Effect.sync(() => handled.settled()))))
            return fiber
          })
        ))
      )
      await started()
      await acting(() => {
        button("Break").click()
        settle()
      })
      await handled.promise
      if (fiber !== undefined) await Effect.runPromise(Fiber.await(fiber))
      await acting(async () => {})
      expect(caught).toEqual([])
      expect(button("Break")).toBeDefined()
    })

    // The release of a subscription dies as `Host` unmounts and interrupts the fiber `fork` returns. An interrupted
    // fiber cannot recover from what it ends with, so the application runs the program in a fiber of its own,
    // interrupts it as its fiber is, and handles how it ended.
    test("what the application handles around the run is not reported once Host has unmounted", async () => {
      const reported: Array<unknown> = []
      const reportError = globalThis.reportError
      globalThis.reportError = (error) => void reported.push(error)
      try {
        const handled: Array<boolean> = []
        let fiber: Fiber.Fiber<void, unknown> | undefined
        const released = new Error("A release that cannot complete")
        const root = await hostInto(host({
          program: {
            ...counter,
            subscriptions: () => ["held" as const],
            listen: () =>
              Channel.unwrap(
                Effect.acquireRelease(Effect.void, () => Effect.die(released)).pipe(Effect.as(Channel.never))
              )
          },
          fork: (effect) => {
            const running = heldFork(effect)
            const ended = Effect.andThen(Fiber.interrupt(running), Fiber.await(running))
            fiber = heldFork(
              Fiber.await(running).pipe(
                Effect.onInterrupt(() =>
                  Effect.flatMap(
                    ended,
                    (exit) => Effect.sync(() => void handled.push(Exit.isFailure(exit) && Cause.hasDies(exit.cause)))
                  )
                ),
                Effect.asVoid
              )
            )
            return fiber
          },
          view: counterView
        }))
        await started()
        await unmount(root)
        if (fiber !== undefined) await Effect.runPromise(Fiber.await(fiber))
        // A window of absence: nothing a correct run does tells that `Host` reported nothing, so the test waits a turn
        // once the run has ended.
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect([handled, reported]).toEqual([[true], []])
      } finally {
        globalThis.reportError = reportError
      }
    })

    // React calls the view as it renders: what it throws is React's error, not a defect of the program.
    test("a view that throws reaches the nearest error boundary, which unmounts Host and interrupts the run", async () => {
      const ended: Array<string> = []
      const caught = witness<unknown>()
      const thrown = new Error("A view that cannot draw")
      const root = createRoot(page(), { onCaughtError: (error) => caught.settled(error) })
      roots.push(root)
      await acting(() =>
        root.render(createElement(
          Boundary,
          null,
          host({
            program: counter,
            fork: (effect) =>
              heldFork(effect.pipe(Effect.onExit((exit) =>
                Effect.sync(() =>
                  ended.push(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause) ? "interrupted" : "other")
                )
              ))),
            view: (model, dispatch) => {
              if (model.count > 0) {
                throw thrown
              }
              return counterView(model, dispatch)
            }
          })
        ))
      )
      await started()
      await acting(() => button("+").click())
      expect(await caught.promise).toBe(thrown)
      settle()
      expect(element("#app").textContent).toBe("Crashed")
      expect(ended).toEqual(["interrupted"])
    })

    // No model was drawn before it: React's render throws it to the boundary, `Host` never mounts, and nothing runs.
    test("a first model that throws reaches the nearest error boundary, and the run never starts", async () => {
      const thrown = new Error("A first model that cannot be made")
      const forked: Array<unknown> = []
      const caught: Array<unknown> = []
      const root = createRoot(page(), { onCaughtError: (error) => void caught.push(error) })
      roots.push(root)
      await acting(() =>
        root.render(createElement(
          Boundary,
          null,
          host({
            program: {
              ...counter,
              makeModel: () => {
                throw thrown
              }
            },
            fork: (effect) => {
              forked.push(effect)
              return heldFork(effect)
            },
            view: counterView
          })
        ))
      )
      await started()
      expect(element("#app").textContent).toBe("Crashed")
      expect([caught.length, (caught[0] as ProgramDefect).where, forked.length]).toEqual([1, "render", 0])
    })

    // React reads the model in the notice and as it renders. Found by the review of the bridges before 0.8.0: the
    // defect `model()` threw reached the boundary from React's render, which unmounted `Host`, and the run, whose end
    // waits for a release, died of that very defect once `Host` had unmounted, which gave it to `reportError` too. Now
    // `Host` draws the model it drew last until the run has ended, and throws the defect then, once.
    test("a makeModel that throws reaches the nearest error boundary, and is not reported again", async () => {
      const thrown = new Error("A model that cannot be made")
      const gate = Deferred.makeUnsafe<void>()
      const shaky = {
        ...counter,
        subscriptions: () => ["held" as const],
        listen: () =>
          Channel.unwrap(
            Effect.acquireRelease(Effect.void, () => Deferred.await(gate)).pipe(Effect.as(Channel.never))
          ),
        makeModel: (state: Parameters<typeof counter.makeModel>[0]) => {
          if (state.count > 0) throw thrown
          return counter.makeModel(state)
        }
      }
      const caught: Array<unknown> = []
      const reported: Array<unknown> = []
      const reportError = globalThis.reportError
      globalThis.reportError = (error) => void reported.push(error)
      try {
        const root = createRoot(page(), { onCaughtError: (error) => void caught.push(error) })
        roots.push(root)
        let fiber: Fiber.Fiber<void, unknown> | undefined
        await acting(() =>
          root.render(createElement(
            Boundary,
            null,
            host({
              program: shaky,
              fork: (effect) => {
                fiber = heldFork(effect)
                return fiber
              },
              view: counterView
            })
          ))
        )
        await started()
        const before = element("#app").textContent
        await acting(() => button("+").click())
        expect([element("#app").textContent, caught.length]).toEqual([before, 0])
        Deferred.doneUnsafe(gate, Exit.void)
        settle()
        if (fiber !== undefined) await Effect.runPromise(Fiber.await(fiber))
        // A window of absence: nothing a correct run does tells that `Host` did not report what the run ended with, so
        // the test waits a turn once the run has ended, then lets React do what that turn asked of it.
        await new Promise((resolve) => setTimeout(resolve, 0))
        await acting(async () => {})
        expect(element("#app").textContent).toBe("Crashed")
        expect((caught[0] as ProgramDefect).where).toBe("render")
        expect([caught.length, reported]).toEqual([1, []])
      } finally {
        globalThis.reportError = reportError
      }
    })

    test("gives what it dies of once Host has unmounted to reportError", async () => {
      const reported = witness<unknown>()
      const reportError = globalThis.reportError
      globalThis.reportError = (error) => reported.settled(error)
      try {
        const released = new Error("A release that cannot complete")
        const root = await hostInto(host({
          program: counter,
          fork: (effect) => heldFork(effect.pipe(Effect.ensuring(Effect.die(released)))),
          view: counterView
        }))
        await started()
        await unmount(root)
        expect(await reported.promise).toBe(released)
      } finally {
        globalThis.reportError = reportError
      }
    })

    // React Native has no `reportError`, the browser's: the bridge falls back as React does, here to an `error` event of
    // the window, which the listener cancels, so that nothing reaches the console.
    test("gives what it dies of once Host has unmounted to an error event, where there is no reportError", async () => {
      const reported = witness<unknown>()
      const reportError = globalThis.reportError
      const listener = (event: ErrorEvent) => {
        event.preventDefault()
        reported.settled(event.error)
      }
      Reflect.deleteProperty(globalThis, "reportError")
      window.addEventListener("error", listener)
      try {
        expect(typeof globalThis.reportError).toBe("undefined")
        const released = new Error("A release that cannot complete")
        const root = await hostInto(host({
          program: counter,
          fork: (effect) => heldFork(effect.pipe(Effect.ensuring(Effect.die(released)))),
          view: counterView
        }))
        await started()
        await unmount(root)
        expect(await reported.promise).toBe(released)
      } finally {
        window.removeEventListener("error", listener)
        globalThis.reportError = reportError
      }
    })

    // The fallbacks of React's own report, past the `error` event: what no listener cancels goes to the console, and
    // where there is no `ErrorEvent`, as on React Native, to `uncaughtException` where the process emits one, and to
    // the console where it does not.
    describe("where there is no reportError", () => {
      const released = new Error("A release that cannot complete")
      const unmountedDying = async () => {
        const root = await hostInto(host({
          program: counter,
          fork: (effect) => heldFork(effect.pipe(Effect.ensuring(Effect.die(released)))),
          view: counterView
        }))
        await started()
        await unmount(root)
      }
      // Takes away `reportError` and the globals named, runs `work`, records what reaches the console and the process
      // until the first of them does, then gives them back. A test stubs `process.emit` alone, and makes a process
      // where there is none, as in a browser.
      const without = async (names: ReadonlyArray<"ErrorEvent" | "emit">, work: () => Promise<void>) => {
        const errorEvent = globalThis.ErrorEvent
        const reportError = globalThis.reportError
        const error = console.error
        const logged: Array<unknown> = []
        const emitted: Array<unknown> = []
        const reached = witness<void>()
        Reflect.deleteProperty(globalThis, "reportError")
        if (names.includes("ErrorEvent")) Reflect.deleteProperty(globalThis, "ErrorEvent")
        const made = typeof globalThis.process === "undefined"
        if (made) Object.assign(globalThis, { process: {} })
        Object.assign(globalThis.process, {
          emit: names.includes("emit") ? undefined : (...args: Array<unknown>) => {
            emitted.push(args)
            reached.settled()
          }
        })
        console.error = (...args: Array<unknown>) => {
          logged.push(args)
          reached.settled()
        }
        try {
          await work()
          await reached.promise
          return { logged, emitted }
        } finally {
          console.error = error
          if (made) Reflect.deleteProperty(globalThis, "process")
          else Reflect.deleteProperty(globalThis.process, "emit")
          globalThis.ErrorEvent = errorEvent
          globalThis.reportError = reportError
        }
      }

      test("gives what it dies of once Host has unmounted to the console, where no listener cancels the error event", async () => {
        const heard: Array<unknown> = []
        const listener = (event: ErrorEvent) => void heard.push(event.error)
        window.addEventListener("error", listener)
        try {
          const { logged, emitted } = await without([], unmountedDying)
          // Vitest's browser mode logs a copy of an error event that a listener hears: only the error itself counts.
          const itself = logged.filter((args) => Array.isArray(args) && args[0] === released)
          expect([heard, itself, emitted]).toEqual([[released], [[released]], []])
        } finally {
          window.removeEventListener("error", listener)
        }
      })

      test("gives what it dies of once Host has unmounted to uncaughtException, where there is no ErrorEvent", async () => {
        const { logged, emitted } = await without(["ErrorEvent"], unmountedDying)
        expect([logged, emitted]).toEqual([[], [["uncaughtException", released]]])
      })

      test("gives what it dies of once Host has unmounted to the console, where there is no ErrorEvent and no process to emit it", async () => {
        const { logged, emitted } = await without(["ErrorEvent", "emit"], unmountedDying)
        expect([logged, emitted]).toEqual([[[released]], []])
      })
    })

    // Found by the review of the premises before 0.8.0: the run dies while `Host` is mounted, and its parent removes
    // `Host` in the same batch, as a button that dispatches and then closes the view would. `Host` kept the defect in a
    // state it never rendered again, and its cleanup, which comes after, found the run already ended.
    test("that dies as its parent removes Host, in one batch, is given to reportError, and is not thrown", async () => {
      const caught: Array<unknown> = []
      const reported: Array<unknown> = []
      const reportError = globalThis.reportError
      globalThis.reportError = (error) => void reported.push(error)
      try {
        let hide: (() => void) | undefined
        let fiber: Fiber.Fiber<void, unknown> | undefined
        const forking: Fork<never> = (effect) => {
          fiber = heldFork(effect)
          return fiber
        }
        const Parent = () => {
          const [shown, setShown] = useState(true)
          hide = () => setShown(false)
          return shown ? breakIn(forking) : createElement("p", null, "Closed")
        }
        const root = createRoot(page(), { onCaughtError: (error) => void caught.push(error) })
        roots.push(root)
        await acting(() => root.render(createElement(Boundary, null, createElement(Parent))))
        await started()
        await acting(() => {
          button("Break").click()
          settle()
          hide?.()
        })
        settle()
        const exit = fiber === undefined ? undefined : await Effect.runPromise(Fiber.await(fiber))
        expect(exit !== undefined && Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
        // A window of absence: nothing a correct run does tells that the defect was lost, so the test waits a turn once
        // the run has ended, then lets React do what that turn asked of it.
        await new Promise((resolve) => setTimeout(resolve, 0))
        await acting(async () => {})
        // No render of `Host` threw it before its effect ended: it is given to `reportError`, and not thrown.
        expect([caught, reported.length]).toEqual([[], 1])
        expect(reported[0]).toMatchObject({ where: "update" })
      } finally {
        globalThis.reportError = reportError
      }
    })

    // The run dies while `Host` is shown, and its parent hides `Host` with `<Activity>` in the same batch: the cleanup
    // gives the defect to `reportError`, and `<Activity>` keeps the state that holds it, which `Host` throws to the
    // boundary as it is shown again, in place of a new run. Found by the review of the whole library of 21 November
    // 2026.
    test("that dies as Activity hides Host, in one batch, is reported once, and shown again starts anew", async () => {
      const caught: Array<unknown> = []
      const reported: Array<unknown> = []
      const reportError = globalThis.reportError
      globalThis.reportError = (error) => void reported.push(error)
      try {
        let show: ((mode: "visible" | "hidden") => void) | undefined
        let fiber: Fiber.Fiber<void, unknown> | undefined
        let forks = 0
        const forking: Fork<never> = (effect) => {
          forks++
          fiber = heldFork(effect)
          return fiber
        }
        const Parent = () => {
          const [mode, setMode] = useState<"visible" | "hidden">("visible")
          show = setMode
          return createElement(Activity, { mode, children: breakIn(forking) })
        }
        const root = createRoot(page(), { onCaughtError: (error) => void caught.push(error) })
        roots.push(root)
        await acting(() => root.render(createElement(Boundary, null, createElement(Parent))))
        await started()
        await acting(() => {
          button("Break").click()
          settle()
          show?.("hidden")
        })
        settle()
        const exit = fiber === undefined ? undefined : await Effect.runPromise(Fiber.await(fiber))
        expect(exit !== undefined && Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
        // A window of absence: nothing a correct run does tells that the defect was not reported twice, so the test
        // waits a turn once the run has ended, then lets React do what that turn asked of it.
        await new Promise((resolve) => setTimeout(resolve, 0))
        await acting(async () => {})
        await acting(() => show?.("visible"))
        await started()
        // No render of `Host` threw it before its effect ended: it is given to `reportError`, and not thrown.
        expect([caught, reported.length]).toEqual([[], 1])
        expect(reported[0]).toMatchObject({ where: "update" })
        expect(forks).toBe(2)
      } finally {
        globalThis.reportError = reportError
      }
    })

    // The run ends after `<Activity>` has hidden `Host`, which no render can throw any more: the release of the first
    // run dies as the hide interrupts it.
    test("that dies as Activity hides Host, of a release, is given to reportError once, and shown again forks a new run", async () => {
      const caught: Array<unknown> = []
      const reported: Array<unknown> = []
      const reportError = globalThis.reportError
      globalThis.reportError = (error) => void reported.push(error)
      try {
        const released = new Error("A release that cannot complete")
        const fibers: Array<Fiber.Fiber<void, unknown>> = []
        const forking: Fork<never> = (effect) => {
          const fiber = heldFork(fibers.length === 0 ? effect.pipe(Effect.ensuring(Effect.die(released))) : effect)
          fibers.push(fiber)
          return fiber
        }
        const node = (mode: "visible" | "hidden") =>
          createElement(Boundary, null, createElement(Activity, { mode, children: breakIn(forking) }))
        const root = createRoot(page(), { onCaughtError: (error) => void caught.push(error) })
        roots.push(root)
        await acting(() => root.render(node("visible")))
        await started()
        await acting(() => root.render(node("hidden")))
        settle()
        const exit = await Effect.runPromise(Fiber.await(fibers[0]!))
        expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
        // A window of absence: nothing a correct run does tells that the defect was not reported twice, so the test
        // waits a turn once the run has ended, then lets React do what that turn asked of it.
        await new Promise((resolve) => setTimeout(resolve, 0))
        await acting(async () => {})
        await acting(() => root.render(node("visible")))
        await started()
        expect([caught, reported, fibers.length]).toEqual([[], [released], 2])
        expect(button("Break")).toBeDefined()
      } finally {
        globalThis.reportError = reportError
      }
    })
  })

  // StrictMode mounts every component, unmounts it, and mounts it again, running its effects each time, in one task:
  // `Host` starts its run in a microtask after its effect, so the effect that is cleaned up at once starts none.
  test("in StrictMode, one run starts, which no cleanup interrupts, and it is drawn and typed into", async () => {
    const runs: Array<string> = []
    await hostInto(createElement(
      StrictMode,
      null,
      host({
        program: note,
        fork: (effect) =>
          heldFork(effect.pipe(
            Effect.onInterrupt(() => Effect.sync(() => runs.push("interrupted"))),
            Effect.onExit(() => Effect.sync(() => runs.push("ended")))
          )),
        view: noteView
      })
    ))
    await started()
    expect(runs).toEqual([])
    const input = element<HTMLInputElement>("input")
    type(input, "Ada")
    expect(input.value).toBe("Ada")
  })

  // A program started is run once, and a command interrupted is never started again: so `Host` keeps the commands of
  // `init` from starting twice by starting no run in the effect that StrictMode cleans up at once. How often they start
  // is unspecified (`Host`'s doc comment): the test holds the invariant "`Host` starts one run under StrictMode"
  // (`docs/invariants.md`), which a run started by the effect cleaned up at once, and never interrupted, would break.
  test("in StrictMode, the commands of init start once", async () => {
    const loads = program<{ state: Readonly<{ loaded: number }>; message: "Loaded"; command: "Load" }>()
    const commands: Array<string> = []
    const answer = Deferred.makeUnsafe<void>()
    let runs = 0
    const loading = loads.make({
      init: { state: { loaded: 0 }, commands: ["Load"] },
      update: () => (held) => ({ state: { loaded: held.loaded + 1 } }),
      runCommand: () =>
        Effect.suspend(() => {
          const count = runs
          commands.push(`started by ${count}`)
          return Deferred.await(answer).pipe(
            Effect.as(Opt.some<"Loaded">("Loaded")),
            Effect.onInterrupt(() => Effect.sync(() => commands.push(`interrupted in ${count}`)))
          )
        }),
      makeModel: (held) => held
    })
    await hostInto(createElement(
      StrictMode,
      null,
      host({
        program: loading,
        fork: (effect) => {
          runs += 1
          return heldFork(effect)
        },
        view: (model) => createElement("output", null, model.loaded)
      })
    ))
    await started()
    Deferred.doneUnsafe(answer, Effect.void)
    settle()
    drawn()
    expect(commands).toEqual(["started by 1"])
    expect(element("output").textContent).toBe("1")
  })

  test("with no fork, runs the commands of init with Effect.runFork, and draws their answer", async () => {
    const answered = witness<void>()
    const loads = program<{ state: Readonly<{ loaded: boolean }>; message: "Loaded"; command: "Load" }>().make({
      init: { state: { loaded: false }, commands: ["Load"] },
      update: () => () => ({ state: { loaded: true } }),
      runCommand: () => Effect.succeedSome("Loaded" as const),
      makeModel: (held) => held
    })
    await hostInto(host({
      program: loads,
      view: (model) => {
        if (model.loaded) answered.settled()
        return createElement("output", null, model.loaded ? "Loaded" : "Loading")
      }
    }))
    await answered.promise
    await acting(async () => {})
    expect(element("output").textContent).toBe("Loaded")
  })

  test("forked with Effect.runFork, draws its first model with no warning of React", async () => {
    const errors: Array<unknown> = []
    const error = console.error
    console.error = (...args: Array<unknown>) => void errors.push(args)
    const drew = witness<void>()
    try {
      await hostInto(host({
        program: counter,
        view: (model, dispatch) => {
          drew.settled()
          return counterView(model, dispatch)
        }
      }))
      await drew.promise
      await acting(async () => {})
      expect(element("output").textContent).toBe("0")
      expect(errors).toEqual([])
    } finally {
      console.error = error
    }
  })

  test("a program unmounted while a command is under way interrupts the command, and draws nothing after", async () => {
    const interrupted: Array<string> = []
    const answer = Deferred.makeUnsafe<void>()
    const storage = Storage.of({
      save: (name) =>
        Deferred.await(answer).pipe(Effect.onInterrupt(() => Effect.sync(() => void interrupted.push(name))))
    })
    const errors: Array<unknown> = []
    const error = console.error
    console.error = (...args: Array<unknown>) => void errors.push(args)
    try {
      const root = await hostInto(host({ program: form, fork: withStorage(storage), view: formView }))
      await started()
      type(element<HTMLInputElement>("input"), "Ada")
      button("Save").click()
      drawn()
      expect(button("Saving…")).toBeDefined()
      settle()
      await unmount(root)
      expect(interrupted).toEqual(["Ada"])
      Deferred.doneUnsafe(answer, Effect.void)
      settle()
      expect(element("#app").childElementCount).toBe(0)
      expect(errors).toEqual([])
    } finally {
      console.error = error
    }
  })

  test("two programs on one page: each input writes into its own run", async () => {
    document.body.innerHTML = "<div id=\"one\"></div><div id=\"two\"></div>"
    const one = hostNote()
    const two = hostNote()
    await hostInto(one.node, element("#one"))
    await hostInto(two.node, element("#two"))
    await started()
    type(element<HTMLInputElement>("#one input"), "Ada")
    type(element<HTMLInputElement>("#two input"), "Bob")
    expect([one.note(), two.note()]).toEqual(["Ada", "Bob"])
  })
})

// The page a server drew, and React hydrating it with the same tree: what React could not hydrate it records, and
// draws anew.
describe("hydrated by hydrateRoot", () => {
  type Loading = Readonly<{ note: string; loaded: boolean }>
  type Typed = Readonly<{ _tag: "NoteTyped"; value: string }>
  const commands: Array<string> = []
  const loading = program<{ state: Loading; message: "Loaded" | Typed; command: "Load" }>().make({
    init: { state: { note: "", loaded: false }, commands: ["Load"] },
    update: (message) => (held) =>
      message === "Loaded" ? { state: { ...held, loaded: true } } : { state: { ...held, note: message.value } },
    runCommand: () =>
      Effect.sync(() => {
        commands.push("started")
        return Opt.some("Loaded" as const)
      }),
    makeModel: (held) => ({ ...held, typed: { _tag: "NoteTyped" } as const })
  })
  const loadingView: View<ModelOf<typeof loading>, MessageOf<typeof loading>> = (model, dispatch) =>
    createElement(
      "main",
      null,
      createElement("input", field(model.note, (value) => dispatch({ ...model.typed, value }))),
      createElement("output", null, model.loaded ? "Loaded" : "Loading")
    )
  const hydrate = async (node: () => ReactNode) => {
    const into = page()
    into.innerHTML = renderToString(node())
    const input = element<HTMLInputElement>("input")
    const recovered: Array<unknown> = []
    await acting(() =>
      void roots.push(hydrateRoot(into, node(), { onRecoverableError: (error) => void recovered.push(error) }))
    )
    return { input, recovered }
  }

  test("Host keeps the elements the server drew, and forks its run once React has hydrated them", async () => {
    commands.length = 0
    const { input, recovered } = await hydrate(() =>
      host({
        program: loading,
        // Forked on Effect's own scheduler, the run applies at once what `init` starts: forked before the render that
        // hydrates, that render would draw "Loaded".
        fork: (effect) => {
          commands.push("forked")
          return Effect.runFork(effect)
        },
        view: (model, dispatch) => {
          commands.push(`drawn ${model.loaded ? "Loaded" : "Loading"}`)
          return loadingView(model, dispatch)
        }
      })
    )
    expect(element("input")).toBe(input)
    // Drawn on the server, then by the render that hydrates.
    expect([recovered.map(String), commands, state()]).toEqual([
      [],
      ["drawn Loading", "drawn Loading", "forked", "started", "drawn Loaded"],
      ["Loaded"]
    ])
    await acting(() => type(input, "Ada"))
    expect(element("input")).toBe(input)
    expect(input.value).toBe("Ada")
  })

  test("Host started with flags keeps the elements the server drew from the same flags", async () => {
    const { input, recovered } = await hydrate(() =>
      host({ program: lid, options: { flags: "Opened" }, fork: heldFork, view: lidView })
    )
    expect(element("input")).toBe(input)
    expect([recovered.map(String), input.value, state()]).toEqual([[], "draft", ["draft"]])
    await started()
    await acting(() => type(input, "draft!"))
    expect([element("input"), state()]).toEqual([input, ["draft!"]])
  })

  test("Draw keeps the elements the server drew of the state current as React hydrates it", async () => {
    commands.length = 0
    const { app, run } = start(loading)
    const { input, recovered } = await hydrate(() =>
      createElement(bridge.Draw<ModelOf<typeof loading>, MessageOf<typeof loading>>, { app, view: loadingView })
    )
    expect(element("input")).toBe(input)
    expect([recovered.map(String), state()]).toEqual([[], ["Loading"]])
    forked(run)
    await acting(() => settle())
    expect([commands, state()]).toEqual([["started"], ["Loaded"]])
    type(input, "Ada")
    drawn()
    expect(element("input")).toBe(input)
    expect(app.model().note).toBe("Ada")
  })
})

describe("a makeModel that throws under Draw", () => {
  // The application started the program: nothing gives the defect to `die`, and the run records it where it was read.
  test("is thrown as Draw renders, for the nearest error boundary, and the run dies of that one defect", async () => {
    const thrown = new Error("A model that cannot be made")
    const fragile = {
      ...counter,
      makeModel: (state: Parameters<typeof counter.makeModel>[0]) => {
        if (state.count > 0) throw thrown
        return counter.makeModel(state)
      }
    }
    const caught = witness<unknown>()
    const { app, run } = start(fragile)
    const root = createRoot(page(), { onCaughtError: (error) => caught.settled(error) })
    roots.push(root)
    await acting(() =>
      root.render(createElement(
        Boundary,
        null,
        createElement(bridge.Draw<CounterModel, CounterMessage>, {
          app,
          view: counterView
        })
      ))
    )
    const fiber = forked(run)
    settle()
    await acting(() => button("+").click())
    const error = await caught.promise
    settle()
    const exit = fiber.pollUnsafe()
    if (exit === undefined || !Exit.isFailure(exit)) throw new Error("The run did not die")
    expect(element("#app").textContent).toBe("Crashed")
    expect(error).toBeInstanceOf(ProgramDefect)
    expect(error).toMatchObject({ where: "render", cause: thrown })
    expect(exit.cause.reasons.map((reason) => reason._tag === "Die" ? reason.defect : reason._tag)).toEqual([error])
  })
})

describe("a view that throws under Draw", () => {
  test("is an error of the application: the nearest error boundary gets what it threw, as it is", async () => {
    const thrown = new Error("A view that cannot draw")
    const caught = witness<unknown>()
    const { app, run } = start(counter)
    const root = createRoot(page(), { onCaughtError: (error) => caught.settled(error) })
    roots.push(root)
    await acting(() =>
      root.render(createElement(
        Boundary,
        null,
        createElement(bridge.Draw<CounterModel, CounterMessage>, {
          app,
          view: (model, dispatch) => {
            if (model.count > 0) throw thrown
            return counterView(model, dispatch)
          }
        })
      ))
    )
    forked(run)
    settle()
    await acting(() => button("+").click())
    expect(await caught.promise).toBe(thrown)
    settle()
    expect(element("#app").textContent).toBe("Crashed")
  })
})

describe("what the bridge to React leaves out", () => {
  // An alarm of what the guide leaves unspecified ("Writing a bridge", "What is left out", a value that a script
  // writes): React keeps the value it gave a controlled input, through the element's own `value`, a script's write goes
  // there too, so the input event finds no change, and React calls no `onChange`. It rests on React alone, and is the
  // killer of no mutation.
  test("a text a script writes into an input, and announces with an input event, is lost, where one typed is stored", () => {
    const { app, run } = start(note)
    drawRun({ app, run }, noteView)
    const input = element<HTMLInputElement>("input")
    type(input, "Ada")
    drawn()
    expect(app.model().note).toBe("Ada")
    input.value = "Bob"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    drawn()
    expect(app.model().note).toBe("Ada")
  })
})

describe("what an application does beside the program", () => {
  test("a field a component mounts from its own state shows the program's value, and what is typed is stored", async () => {
    const Toggle = ({ children }: Readonly<{ children: ReactNode }>): ReactNode => {
      const [shown, setShown] = useState(false)
      return createElement("div", null, drawButton("Show", () => setShown(true)), shown ? children : null)
    }
    const app = hostNote((model, dispatch) =>
      createElement(
        "main",
        null,
        createElement(
          Toggle,
          null,
          createElement("input", field(model.note, (value) => dispatch({ ...model.typed, value })))
        )
      )
    )
    await hostInto(app.node)
    await started()
    app.send({ _tag: "NoteTyped", value: "Ada" })
    drawn()
    await acting(() => button("Show").click())
    const input = element<HTMLInputElement>("input")
    expect(input.value).toBe("Ada")
    type(input, "Adam")
    expect(app.note()).toBe("Adam")
  })

  // React restores a controlled element to the props it was drawn with once its handler has run, when the render it
  // scheduled made no change: so a key the state rejects is taken back, though `memo` skips the field.
  test("a key the state rejects, in a field that memo skips, is taken back", async () => {
    type Typed = ModelOf<typeof lock>["typed"]
    // Its props are the same while the state is: the text, what is typed as the model holds it, and the dispatch.
    const Field = memo((
      { value, typed, dispatch }: Readonly<{ value: string; typed: Typed; dispatch: Dispatch<MessageOf<typeof lock>> }>
    ) => createElement("input", field(value, (text) => dispatch({ ...typed, value: text }))))
    const view: View<ModelOf<typeof lock>, MessageOf<typeof lock>> = (model, dispatch) =>
      createElement(
        "main",
        null,
        createElement(Field, { value: model.text, typed: model.typed, dispatch }),
        model._tag === "Open" ? drawButton("Lock", () => dispatch(model.lock)) : null
      )
    const { app, run } = start(lock)
    drawRun({ app, run }, view)
    const input = element<HTMLInputElement>("input")
    type(input, "Ada")
    await acting(() => button("Lock").click())
    type(input, "Ada!")
    drawn()
    expect([input.value, app.model().text]).toEqual(["Ada", "Ada"])
  })

  test("a field Suspense hides, and shows again, shows the value the program put there meanwhile", async () => {
    let pending: Promise<void> | undefined
    let release = () => {}
    const Gate = (): ReactNode => {
      if (pending !== undefined) use(pending)
      return null
    }
    const app = hostNote((model, dispatch) =>
      createElement(
        "main",
        null,
        createElement(
          Suspense,
          { fallback: "Loading" },
          createElement(Gate),
          createElement("input", field(model.note, (value) => dispatch({ ...model.typed, value })))
        ),
        createElement("output", null, model.note)
      )
    )
    await hostInto(app.node)
    await started()
    const typedInto = element<HTMLInputElement>("input")
    type(typedInto, "Ada")
    expect(state()).toEqual(["Ada"])
    pending = new Promise((resolve) => {
      release = () => {
        pending = undefined
        resolve()
      }
    })
    await acting(() => app.send("Cleared"))
    expect(state()).toEqual([""])
    await acting(async () => release())
    expect(element("input")).toBe(typedInto)
    expect(typedInto.value).toBe("")
    type(typedInto, "Bob")
    expect(app.note()).toBe("Bob")
  })

  // React renders a store's change in no transition: one made in `startTransition` is drawn as any other.
  test("a key whose message is sent in startTransition is stored, and drawn before React renders any transition", async () => {
    const app = hostNote((model, dispatch) =>
      createElement(
        "main",
        null,
        createElement(
          "input",
          field(model.note, (value) => startTransition(() => dispatch({ ...model.typed, value })))
        ),
        createElement("output", null, model.note)
      )
    )
    await hostInto(app.node)
    await started()
    const input = element<HTMLInputElement>("input")
    type(input, "Ada")
    drawn()
    expect([app.note(), input.value, state()]).toEqual(["Ada", "Ada", ["Ada"]])
  })

  test("while a transition of the application waits, a new state is drawn, and the transition draws the state current when it ends", async () => {
    let pending: Promise<void> | undefined
    let release = () => {}
    const Gate = (): ReactNode => {
      if (pending !== undefined) use(pending)
      return createElement("p", null, "More")
    }
    const More = ({ children }: Readonly<{ children: ReactNode }>): ReactNode => {
      const [shown, setShown] = useState(false)
      const [waiting, startShowing] = useTransition()
      return createElement(
        "div",
        null,
        drawButton(waiting ? "Waiting" : "Show", () => startShowing(() => setShown(true))),
        shown ? createElement(Gate) : null,
        children
      )
    }
    const app = hostNote((model) => createElement(More, null, createElement("output", null, model.note)))
    await hostInto(app.node)
    await started()
    pending = new Promise((resolve) => {
      release = () => {
        pending = undefined
        resolve()
      }
    })
    await acting(() => button("Show").click())
    expect(button("Waiting").textContent).toBe("Waiting")
    expect(document.querySelector("p")).toBeNull()
    app.send({ _tag: "NoteTyped", value: "Ada" })
    drawn()
    expect(state()).toEqual(["Ada"])
    expect(document.querySelector("p")).toBeNull()
    await acting(async () => release())
    expect([element("p").textContent, button("Show").textContent, state()]).toEqual(["More", "Show", ["Ada"]])
  })

  test("a part drawn from useDeferredValue of the model shows it later, and the field shows the program's value at once", async () => {
    const Later = ({ note }: Readonly<{ note: string }>): ReactNode =>
      createElement("output", null, useDeferredValue(note))
    const app = hostNote((model, dispatch) =>
      createElement(
        "main",
        null,
        createElement("input", field(model.note, (value) => dispatch({ ...model.typed, value }))),
        createElement(Later, { note: model.note })
      )
    )
    await hostInto(app.node)
    await started()
    const input = element<HTMLInputElement>("input")
    // `act` renders what React deferred once its callback has returned.
    let first: ReadonlyArray<unknown> = []
    await acting(() => {
      type(input, "Ada")
      drawn()
      first = [app.note(), input.value, state()]
    })
    expect(first).toEqual(["Ada", "Ada", [""]])
    expect(state()).toEqual(["Ada"])
  })

  test("an input drawn through a portal writes into its run", async () => {
    const app = hostNote((model, dispatch) =>
      createElement(
        "main",
        null,
        createPortal(
          createElement("input", field(model.note, (value) => dispatch({ ...model.typed, value }))),
          element("#aside")
        )
      )
    )
    await hostInto(app.node)
    await started()
    const input = element<HTMLInputElement>("#aside input")
    type(input, "Ada")
    expect([input.value, app.note()]).toEqual(["Ada", "Ada"])
  })

  // As a component of a library is: it keeps the text it shows in its own state, takes `value` and `onChange`, and
  // takes a new `value` from its props in an effect.
  test("a component with state of its own and value and onChange props stores what is typed, and shows the program's", async () => {
    const Library = (
      { value, onChange }: Readonly<{ value: string; onChange: (value: string) => void }>
    ): ReactNode => {
      const [text, setText] = useState(value)
      useEffect(() => setText(value), [value])
      return createElement("input", {
        value: text,
        onChange: (event: { target: { value: string } }) => {
          setText(event.target.value)
          onChange(event.target.value)
        }
      })
    }
    const app = hostNote((model, dispatch) =>
      createElement(
        "main",
        null,
        createElement(Library, {
          value: model.note,
          onChange: (value: string) => dispatch({ ...model.typed, value })
        })
      )
    )
    await hostInto(app.node)
    await started()
    const input = element<HTMLInputElement>("input")
    await acting(() => type(input, "Ada"))
    expect([input.value, app.note()]).toEqual(["Ada", "Ada"])
    await acting(() => app.send("Cleared"))
    expect(input.value).toBe("")
  })
})

describe("a view drawn alone, with a dispatch that records", () => {
  // A view is a function: the test draws it in a root of its own, with no program, acts on each control, and compares
  // what was sent with what the model holds. It finds only the controls it acts on.
  const sentBy = <Model, Message>(
    view: View<Model, Message>,
    model: Model,
    acts: () => void
  ): ReadonlyArray<Message> => {
    const sent: Array<Message> = []
    const root = rootIn(page())
    flushSync(() => root.render(view(model, (message) => void sent.push(message))))
    acts()
    return sent
  }

  // What the model holds, in the order the test acts: −, then +.
  const counterMessagesOf = (model: CounterModel): ReadonlyArray<CounterMessage> =>
    model._tag === "Counting" ? [model.decrement, model.increment] : [model.increment]

  test.each([0, 2])("the counter's view sends what its model holds, at %d", (count) => {
    const model = counter.makeModel({ count })
    expect(sentBy(counterView, model, () => {
      button("−").click()
      button("+").click()
    })).toEqual(counterMessagesOf(model))
  })

  // What the model holds, in the order the test acts: what is typed, filled with the text given, where the model shows
  // an editor, then Save. A click of a disabled button sends nothing.
  const formMessagesOf = ({ editor }: FormModel, text: string): ReadonlyArray<FormMessage> =>
    editor._tag === "Saving"
      ? []
      : [{ ...editor.typed, value: text }, ...(editor._tag === "Named" ? [editor.save] : [])]

  test.each(
    [
      ["Blank", Draft.Editing({ name: "", failed: Opt.none() })],
      ["Named", Draft.Editing({ name: "Ada", failed: Opt.none() })],
      ["Saving", Draft.Saving({ name: "Ada" })]
    ] as const
  )("the form's view sends what its model holds, %s", (_, draft) => {
    const model = form.makeModel({ draft, saved: [] })
    expect(sentBy(formView, model, () => {
      type(element<HTMLInputElement>("input"), "Ada!")
      element<HTMLButtonElement>("button").click()
    })).toEqual(formMessagesOf(model, "Ada!"))
  })
})

// One program, drawn by snabbdom and by `Draw` at once, each in a root of its own inside `#app`, over the one `App`.
describe("together, React beside snabbdom", () => {
  // The bridge to snabbdom draws a notice in a microtask, as React renders one: the test awaits it.
  const microtask = () => new Promise<void>((resolve) => queueMicrotask(resolve))

  test("a click in either renderer is drawn by both", async () => {
    page().innerHTML = "<div id=\"snabbdom\"></div><div id=\"react\"></div>"
    const { app, run } = start(counter)
    drawing(
      drawWithSnabbdom(element("#snabbdom"), {
        app,
        view: (model, dispatch) =>
          h("main", [
            h("output", String(model.count)),
            h("button", {
              on: { click: () => dispatch(model.increment) }
            }, "+")
          ])
      })
    )
    drawIn(rootIn(element("#react")), counterView)(app)
    forked(run)
    settle()
    const counts = () => [element("#snabbdom output").textContent, element("#react output").textContent]
    expect(counts()).toEqual(["0", "0"])
    element<HTMLButtonElement>("#react button:last-of-type").click()
    drawn()
    await microtask()
    expect(counts()).toEqual(["1", "1"])
    element<HTMLButtonElement>("#snabbdom button").click()
    drawn()
    await microtask()
    expect(counts()).toEqual(["2", "2"])
  })

  test("each input shows what was typed into the other, and keeps its element", async () => {
    page().innerHTML = "<div id=\"snabbdom\"></div><div id=\"react\"></div>"
    const { app, run } = start(form)
    drawing(drawWithSnabbdom(element("#snabbdom"), { app, view: snabbdomFormView }))
    drawIn(rootIn(element("#react")), formView)(app)
    forked(run.pipe(Effect.provideService(Storage, Storage.of({ save: () => Effect.void }))))
    settle()
    const inSnabbdom = element<HTMLInputElement>("#snabbdom input")
    const inReact = element<HTMLInputElement>("#react input")
    type(inReact, "Ada")
    drawn()
    await microtask()
    expect([inSnabbdom.value, inReact.value]).toEqual(["Ada", "Ada"])
    type(inSnabbdom, "Adam")
    drawn()
    await microtask()
    expect(element("#snabbdom input")).toBe(inSnabbdom)
    expect(element("#react input")).toBe(inReact)
    expect([inSnabbdom.value, inReact.value]).toEqual(["Adam", "Adam"])
  })
})

// The premises of the bridge on React (`docs/premises.md`), checked on React alone. Of the first, react.dev
// ("<input>") says that a controlled input's state is updated synchronously in `onChange`, of a state variable, not of
// a store.
describe("React, as the bridge rests on it", () => {
  test("a controlled input keeps what is typed, its caret and its selection when a store read with useSyncExternalStore is updated during its onChange", () => {
    let value = "Ada"
    const listeners = new Set<() => void>()
    const subscribe = (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
    const set = (next: string) => {
      value = next
      // oxlint-disable-next-line unicorn/no-useless-spread -- a listener may subscribe or unsubscribe while it is told
      for (const listener of [...listeners]) listener()
    }
    const Field = (): ReactNode =>
      createElement("input", {
        value: useSyncExternalStore(subscribe, () => value),
        onChange: (event: { target: { value: string } }) => set(event.target.value)
      })
    flushSync(() => rootIn(page()).render(createElement(Field)))
    const input = element<HTMLInputElement>("input")
    input.focus()
    // A key in the middle: the caret after it.
    setValue(input, "Adda")
    input.setSelectionRange(2, 2)
    input.dispatchEvent(new Event("input", { bubbles: true }))
    drawn()
    expect([input.value, input.selectionStart, input.selectionEnd, value]).toEqual(["Adda", 2, 2, "Adda"])
    // A key that leaves a selection, as an autocompletion does.
    setValue(input, "Addas")
    input.setSelectionRange(3, 5)
    input.dispatchEvent(new Event("input", { bubbles: true }))
    drawn()
    expect([input.value, input.selectionStart, input.selectionEnd, value]).toEqual(["Addas", 3, 5, "Addas"])
    expect(document.activeElement).toBe(input)
  })

  // react.dev ("useSyncExternalStore") says that React renders again when the store changes, not when. The update is
  // made outside any event of React's, as a command's answer or a subscription's message is, and the check is a
  // microtask queued after it: it runs after a microtask the update queued, before any task.
  test("React renders a store read with useSyncExternalStore, updated outside its events, in a microtask", async () => {
    let value = "Ada"
    const listeners = new Set<() => void>()
    const subscribe = (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
    const Shown = (): ReactNode => createElement("p", null, useSyncExternalStore(subscribe, () => value))
    flushSync(() => rootIn(page()).render(createElement(Shown)))
    value = "Bob"
    // oxlint-disable-next-line unicorn/no-useless-spread -- a listener may subscribe or unsubscribe while it is told
    for (const listener of [...listeners]) listener()
    const shown = await new Promise<string | null>((resolve) => queueMicrotask(() => resolve(element("p").textContent)))
    expect(shown).toBe("Bob")
  })

  // react.dev says that StrictMode runs one more setup and cleanup of each effect in development, not in which task.
  test("StrictMode runs an effect's cleanup in the task of the effect, before any microtask", async () => {
    const order: Array<string> = []
    let both = () => {}
    const ran = new Promise<void>((resolve) => {
      both = resolve
    })
    const Probe = (): ReactNode => {
      useEffect(() => {
        order.push("effect")
        queueMicrotask(() => {
          order.push("microtask")
          if (order.filter((step) => step === "microtask").length === 2) both()
        })
        return () => void order.push("cleanup")
      }, [])
      return null
    }
    await hostInto(createElement(StrictMode, null, createElement(Probe)))
    await ran
    expect(order).toEqual(["effect", "cleanup", "effect", "microtask", "microtask"])
  })
})
