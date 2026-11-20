// The bridge to React over the run of `src/next/` (`docs/records/synchronous-dispatch.md`, stage 3), in a DOM
// (happy-dom): the tests every bridge passes (`bridge.test_suite.ts`), drawn with `Draw` from a run the suite starts,
// with controlled elements as React's documentation draws them; where React reads the model; `Host`; what an
// application does beside the program, as `docs/records/hosted-react.md` tested it; one run drawn by React and by
// snabbdom together; then the premise of the bridge on React (`docs/premises.md`).
import { type MessageOf, type ModelOf, program, ProgramDefect, type Written } from "@fgaudo/effect-tea"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import * as Cause from "effect/Cause"
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
  type ReactNode,
  StrictMode,
  Suspense,
  use,
  useEffect,
  useState,
  useSyncExternalStore
} from "react"
import type { Root } from "react-dom/client"
import { h, type VNode } from "snabbdom"
import { counter, type Message as CounterMessage, type Model as CounterModel } from "../../examples/counter/counter.ts"
import { form, type Message as FormMessage, type Model as FormModel } from "../../examples/form/form.ts"
import { Storage } from "../../examples/form/storage.ts"
import type { Message as VolumeMessage, Model as VolumeModel } from "../../examples/volume/volume.ts"
import { type Dispatch, forwardTo } from "../../src/next/dispatch.ts"
import { type App, run } from "../../src/next/run.ts"
import type { desk, draft, lid, steps } from "../bridge.test_suite.ts"
import { lock, note } from "../bridge.test_suite.ts"
import {
  type Bridge,
  bridgeTests,
  button,
  type controls,
  type Dictation,
  element,
  type gated,
  holdFrames,
  refresh,
  type RenderInto,
  scheduler,
  settle,
  setValue,
  state,
  stop,
  type
} from "./bridge.test_suite.ts"
import type { Fork, HostProps, View } from "./react.ts"
import { renderInto as renderWithSnabbdom } from "./snabbdom.ts"

// React DOM reads the DOM when it is loaded: the bridge and React DOM are loaded once there is one.
let bridge: typeof import("./react.ts")
let flushSync: typeof import("react-dom").flushSync
let createPortal: typeof import("react-dom").createPortal
let createRoot: typeof import("react-dom/client").createRoot

beforeAll(async () => {
  GlobalRegistrator.register()
  holdFrames()
  bridge = await import("./react.ts")
  const reactDom = await import("react-dom")
  flushSync = reactDom.flushSync
  createPortal = reactDom.createPortal
  createRoot = (await import("react-dom/client")).createRoot
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

// A run started here, beside the suite's: drawn by `Draw` into a root the test made, and interrupted after the test.
const fibers: Array<Fiber.Fiber<void>> = []

afterEach(async () => {
  await acting(stop)
  const ended = Effect.runPromise(Effect.forEach(fibers.splice(0), Fiber.interrupt, { discard: true }))
  settle()
  await ended
  for (const root of roots.splice(0)) await acting(() => root.unmount())
  settle()
})

const stopLater = (fiber: Fiber.Fiber<void>) => void fibers.push(fiber)

// What a handler scheduled, or a notice from outside React: React renders it in a microtask, which `flushSync` takes
// at once.
const drawn = () => flushSync(() => {})

/** The data of a controlled text field, as React's documentation draws one: `value`, and `onChange`. */
const field = (value: string, write: Dispatch<Written<string>>) => ({
  value,
  onChange: (event: { target: { value: string } }) => write({ _tag: "Written", was: value, value: event.target.value })
})

const drawButton = (text: string, onClick: () => void) => createElement("button", { type: "button", onClick }, text)

// The suite starts the run itself: `Draw` draws its `App`, in a root of its own that the renderer's release unmounts.
const drawInto: RenderInto<ReactNode> =
  <Model, Message>(root: HTMLElement, view: View<Model, Message>) => (app: App<Model, Message>) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const reactRoot = createRoot(root)
        flushSync(() => reactRoot.render(createElement(bridge.Draw<Model, Message>, { app, view })))
        return reactRoot
      }),
      (reactRoot) => Effect.sync(() => reactRoot.unmount())
    ).pipe(Effect.andThen(Effect.never), Effect.scoped)

// `Draw` in a root the test made.
const drawIn = <Model, Message>(root: Root, view: View<Model, Message>) => (app: App<Model, Message>) =>
  Effect.andThen(
    Effect.sync(() => flushSync(() => root.render(createElement(bridge.Draw<Model, Message>, { app, view })))),
    Effect.never
  )

const counterView: View<CounterModel, CounterMessage> = (model, dispatch) =>
  createElement(
    "main",
    null,
    createElement("button", {
      type: "button",
      disabled: model._tag !== "Counting",
      onClick: () => model._tag === "Counting" && dispatch(model.decrement)
    }, "−"),
    createElement("output", null, String(model.count)),
    drawButton("+", () => dispatch(model.increment))
  )

const formView: View<FormModel, FormMessage> = (model, dispatch) => {
  const { editor } = model
  return createElement(
    "main",
    null,
    createElement("input", {
      ...field(model.name, forwardTo(dispatch, "Name")),
      disabled: editor._tag === "Saving",
      placeholder: "A name"
    }),
    editor._tag === "Named"
      ? drawButton("Save", () => dispatch(editor.save))
      : createElement("button", { type: "button", disabled: true }, editor._tag === "Saving" ? "Saving…" : "Save"),
    Opt.match(model.failed, {
      onNone: () => null,
      onSome: (name) => createElement("p", { className: "error" }, `Could not save “${name}”: try again.`)
    }),
    createElement("ul", null, ...model.saved.map((name, index) => createElement("li", { key: index }, name)))
  )
}

const DraftView = (
  { model, dispatch }: Readonly<{ model: ModelOf<typeof draft>; dispatch: Dispatch<MessageOf<typeof draft>> }>
): ReactNode =>
  createElement(
    "form",
    null,
    createElement("input", field(model.text, forwardTo(dispatch, "Text"))),
    drawButton("Send", () => dispatch("SendClicked")),
    drawButton("Discard", () => dispatch("DiscardClicked")),
    createElement("output", null, model.text)
  )

const deskView: View<ModelOf<typeof desk>, MessageOf<typeof desk>> = (model, dispatch) =>
  createElement(
    "main",
    null,
    createElement(DraftView, { model: model.draft, dispatch: forwardTo(dispatch, "Draft") }),
    drawButton("Keep", () => dispatch("Kept")),
    drawButton("Undo", () => dispatch("Undone")),
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
          onSome: (press) => () => dispatch(press)
        })
      },
      createElement("div", { className: "fill", style: { width: `${model.ringer.level}%` } })
    ),
    createElement("output", { className: "ringer" }, String(model.ringer.level))
  )

type NoteModel = ModelOf<typeof note>
type NoteMessage = MessageOf<typeof note>

const noteView: View<NoteModel, NoteMessage> = (model, dispatch) =>
  createElement("main", null, createElement("input", field(model, forwardTo(dispatch, "Note"))))

// The control listens to the source in an effect, and puts each result into the element as a key is.
const Dictated = (
  { model, dispatch, source }: Readonly<{ model: NoteModel; dispatch: Dispatch<NoteMessage>; source: Dictation }>
): ReactNode => {
  const [input, setInput] = useState<HTMLInputElement | null>(null)
  useEffect(() => (input === null ? undefined : source.listen((text) => type(input, text))), [input, source])
  return createElement("input", { ...field(model, forwardTo(dispatch, "Note")), ref: setInput })
}

const dictatedView = (source: Dictation): typeof noteView => (model, dispatch) =>
  createElement("main", null, createElement(Dictated, { model, dispatch, source }))

const lidView: View<ModelOf<typeof lid>, MessageOf<typeof lid>> = (model, dispatch) =>
  model._tag === "Opened"
    ? createElement(
      "main",
      null,
      createElement("input", field(model.note, forwardTo(dispatch, "Note"))),
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
    createElement(
      "input",
      field(model.text, model._tag === "First" ? forwardTo(dispatch, "First") : forwardTo(dispatch, "Second"))
    ),
    model._tag === "First" ? drawButton("Next", () => dispatch(model.next)) : null,
    createElement("output", null, model.text)
  )

const lockView: View<ModelOf<typeof lock>, MessageOf<typeof lock>> = (model, dispatch) =>
  createElement(
    "main",
    null,
    createElement("input", field(model.text, forwardTo(dispatch, "Text"))),
    model._tag === "Open" ? drawButton("Lock", () => dispatch(model.lock)) : null,
    createElement("output", null, model.text)
  )

const checkbox = (checked: boolean, write: Dispatch<Written<boolean>>) =>
  createElement("input", {
    type: "checkbox",
    checked,
    onChange: (event: { target: { checked: boolean } }) =>
      write({ _tag: "Written", was: checked, value: event.target.checked })
  })

const controlsView: View<ModelOf<typeof controls>, MessageOf<typeof controls>> = (model, dispatch) =>
  createElement(
    "main",
    null,
    createElement("textarea", field(model.notes, forwardTo(dispatch, "Notes"))),
    createElement(
      "select",
      field(model.choice, forwardTo(dispatch, "Choice")),
      createElement("option", { value: "tea" }, "Tea"),
      createElement("option", { value: "coffee" }, "Coffee"),
      createElement("option", { value: "water" }, "Water")
    ),
    checkbox(model.agreed, forwardTo(dispatch, "Agreed")),
    createElement("input", { type: "range", ...field(model.level, forwardTo(dispatch, "Level")) })
  )

const gatedView: View<ModelOf<typeof gated>, MessageOf<typeof gated>> = (model, dispatch) =>
  createElement(
    "main",
    null,
    createElement("textarea", field(model.notes, forwardTo(dispatch, "Notes"))),
    checkbox(model.agreed, forwardTo(dispatch, "Agreed")),
    model.freeze === undefined ? null : drawButton("Freeze", () => dispatch("Frozen"))
  )

const react: Bridge<ReactNode> = {
  renderInto: drawInto,
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

// Starts a run drawn by `Draw` into a root of its own, and gives its `App`.
const drawRun = <Model, Message>(
  start: (render: (app: App<Model, Message>) => Effect.Effect<void>) => Effect.Effect<void>,
  view: View<Model, Message>
) => {
  let held: App<Model, Message> | undefined
  const root = rootIn(page())
  stopLater(Effect.runFork(
    start((app) => {
      held = app
      return drawIn(root, view)(app)
    }),
    { scheduler }
  ))
  settle()
  return () => {
    if (held === undefined) throw new Error("The renderer has not started")
    return held
  }
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
    const app = drawRun<number, "Increment">(
      (render) => run(counted, render),
      (count, dispatch) => drawButton(String(count), () => dispatch("Increment"))
    )
    expect(made).toEqual(["0 after"])
    sending = true
    app().dispatch("Increment")
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
const host = <State, Model, Message, Command = never, RC = never, RS = never, Flags = never>(
  props: HostProps<State, Model, Message, Command, RC, RS, Flags> & Attributes
) => createElement(bridge.Host<State, Model, Message, Command, RC, RS, Flags>, props)

const hostInto = async (node: ReactNode, into = page()) => {
  const root = rootIn(into)
  await acting(() => root.render(node))
  return root
}

// Starts the run, lets it hand its `App` to React, and draws it: `Host` sets its state from the renderer's fiber,
// outside any event of React's, which React renders in a lane of its own, inside `act` here.
const started = () => acting(() => settle())

// A note's Host, which records what it draws with.
const hostNote = (view: View<NoteModel, NoteMessage> = noteView) => {
  let last: Readonly<{ model: NoteModel; dispatch: Dispatch<NoteMessage> }> | undefined
  const node = host({
    program: note,
    fork: heldFork,
    children: (model, dispatch) => {
      last = { model, dispatch }
      return view(model, dispatch)
    }
  })
  const current = () => {
    if (last === undefined) throw new Error("Nothing is drawn")
    return last
  }
  return { node, note: () => current().model, send: (message: NoteMessage) => current().dispatch(message) }
}

// A promise, and what settles it: a witness a test awaits.
const witness = <A>() => {
  let settled: (value: A) => void = () => {}
  const promise = new Promise<A>((resolve) => {
    settled = resolve
  })
  return { promise, settled }
}

describe("Host", () => {
  test("draws its fallback until the run has started its renderer, then the model", async () => {
    await hostInto(
      host({ program: counter, fork: heldFork, fallback: createElement("p", null, "Starting"), children: counterView })
    )
    expect(element("#app").textContent).toBe("Starting")
    await started()
    expect(element("output").textContent).toBe("0")
    button("+").click()
    drawn()
    expect(element("output").textContent).toBe("1")
  })

  test("starts the program with the options of its first render", async () => {
    const applied: Array<CounterMessage> = []
    const ignored: Array<CounterMessage> = []
    const node = (onApplied: (message: CounterMessage) => undefined) =>
      host({
        program: counter,
        options: { onApplied: ({ message }) => onApplied(message) },
        fork: heldFork,
        children: counterView
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
      children: counterView
    }))
    await started()
    expect(ended).toEqual([])
    await unmount(root)
    expect(ended).toEqual(["run"])
    expect(element("#app").childElementCount).toBe(0)
  })

  test("a new key starts the program anew, from init", async () => {
    const node = (key: string) => host({ key, program: counter, fork: heldFork, children: counterView })
    const root = await hostInto(node("first"))
    await started()
    button("+").click()
    drawn()
    expect(element("output").textContent).toBe("1")
    await acting(() => root.render(node("second")))
    await started()
    expect(element("output").textContent).toBe("0")
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
          children: counterView
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
      createElement(Activity, { mode, children: host({ program: counter, fork, children: counterView }) })
    const root = await hostInto(node("visible", forkedBy("first")))
    await started()
    await acting(() => root.render(node("visible", forkedBy("second"))))
    await acting(() => root.render(node("hidden", forkedBy("second"))))
    settle()
    await acting(() => root.render(node("visible", forkedBy("second"))))
    await started()
    expect(forks).toEqual(["first", "first"])
  })

  // Never called: what the compiler refuses.
  test("the types ask for a fork whenever the run needs services, and for a view of the program's model", () => {
    // @ts-expect-error a run that needs services is given the fork that provides them
    const unforked = () => host({ program: form, children: formView })
    // @ts-expect-error a view of another program's model
    const misdrawn = () => host({ program: counter, children: formView })
    expect([unforked, misdrawn]).toHaveLength(2)
  })

  test("the program's services come from the runtime the application gives", async () => {
    const saved: Array<string> = []
    const runtime = ManagedRuntime.make(
      Layer.succeed(Storage, Storage.of({ save: (name) => Effect.sync(() => void saved.push(name)) }))
    )
    await hostInto(host({
      program: form,
      fork: (effect) => runtime.runFork(effect, { scheduler }),
      children: formView
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
      program: form,
      fork: withStorage(Storage.of({ save: () => Effect.void })),
      children: (model, dispatch) => {
        dispatches.add(dispatch)
        forwarded.add(forwardTo(dispatch, "Name"))
        return formView(model, dispatch)
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
      host({ program: form, fork: withStorage(Storage.of({ save: () => Effect.void })), children: formView })
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

    const breakIn = (fork: Fork<never>) =>
      host({
        program: fragile,
        fork,
        children: (model, dispatch) => drawButton("Break", () => dispatch(model.broken))
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
            children: (model, dispatch) => {
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

    test("gives what it dies of once Host has unmounted to reportError", async () => {
      const reported = witness<unknown>()
      const reportError = globalThis.reportError
      globalThis.reportError = (error) => reported.settled(error)
      try {
        const released = new Error("A release that cannot complete")
        const root = await hostInto(host({
          program: counter,
          fork: (effect) => heldFork(effect.pipe(Effect.ensuring(Effect.die(released)))),
          children: counterView
        }))
        await started()
        await unmount(root)
        expect(await reported.promise).toBe(released)
      } finally {
        globalThis.reportError = reportError
      }
    })
  })

  // StrictMode mounts every component, unmounts it, and mounts it again, running its effects each time.
  test("in StrictMode, the run of the first mount is interrupted, and the second's is drawn and typed into", async () => {
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
        children: noteView
      })
    ))
    await started()
    expect(runs).toEqual(["interrupted", "ended"])
    const input = element<HTMLInputElement>("input")
    type(input, "Ada")
    expect(input.value).toBe("Ada")
  })

  // The engine starts the commands of `init` before the renderer: React's rule for effects, which StrictMode runs
  // twice in development to show.
  test("in StrictMode, the first run starts the commands of init, which its interruption interrupts", async () => {
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
        children: (model) => createElement("output", null, model.loaded)
      })
    ))
    await started()
    Deferred.doneUnsafe(answer, Effect.void)
    settle()
    drawn()
    expect(commands).toEqual(["started by 1", "interrupted in 1", "started by 2"])
    expect(element("output").textContent).toBe("1")
  })

  test("forked with Effect.runFork, draws its first model with no warning of React", async () => {
    const errors: Array<unknown> = []
    const error = console.error
    console.error = (...args: Array<unknown>) => void errors.push(args)
    const drew = witness<void>()
    try {
      await hostInto(host({
        program: counter,
        children: (model, dispatch) => {
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
      const root = await hostInto(host({ program: form, fork: withStorage(storage), children: formView }))
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

describe("what an application does beside the program", () => {
  test("an input a component mounts from its own state shows the program's value, and what is typed is stored", async () => {
    const Toggle = ({ children }: Readonly<{ children: ReactNode }>): ReactNode => {
      const [shown, setShown] = useState(false)
      return createElement("div", null, drawButton("Show", () => setShown(true)), shown ? children : null)
    }
    const app = hostNote((model, dispatch) =>
      createElement(
        "main",
        null,
        createElement(Toggle, null, createElement("input", field(model, forwardTo(dispatch, "Note"))))
      )
    )
    await hostInto(app.node)
    await started()
    app.send({ _tag: "Note", message: { _tag: "Written", was: "", value: "Ada" } })
    drawn()
    await acting(() => button("Show").click())
    const input = element<HTMLInputElement>("input")
    expect(input.value).toBe("Ada")
    type(input, "Adam")
    expect(app.note()).toBe("Adam")
  })

  // React restores a controlled element to the props it was drawn with once its handler has run, when the render it
  // scheduled made no change: so a key the state rejects is taken back, though `memo` skips the input.
  test("a key the state rejects, in an input that memo skips, is taken back", async () => {
    const Field = memo(({ value, write }: Readonly<{ value: string; write: Dispatch<Written<string>> }>) =>
      createElement("input", field(value, write))
    )
    const view: View<ModelOf<typeof lock>, MessageOf<typeof lock>> = (model, dispatch) =>
      createElement(
        "main",
        null,
        createElement(Field, { value: model.text, write: forwardTo(dispatch, "Text") }),
        model._tag === "Open" ? drawButton("Lock", () => dispatch(model.lock)) : null
      )
    const app = drawRun((render) => run(lock, render), view)
    const input = element<HTMLInputElement>("input")
    type(input, "Ada")
    await acting(() => button("Lock").click())
    type(input, "Ada!")
    drawn()
    expect([input.value, app().model().text]).toEqual(["Ada", "Ada"])
  })

  test("an input Suspense hides, and shows again, shows the value the program put there meanwhile", async () => {
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
          createElement("input", field(model, forwardTo(dispatch, "Note")))
        ),
        createElement("output", null, model)
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

  test("an input drawn through a portal writes into its run", async () => {
    const app = hostNote((model, dispatch) =>
      createElement(
        "main",
        null,
        createPortal(createElement("input", field(model, forwardTo(dispatch, "Note"))), element("#aside"))
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
          value: model,
          onChange: (value: string) => forwardTo(dispatch, "Note")({ _tag: "Written", was: model, value })
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

// One run, drawn by snabbdom and by `Draw` at once, each in a root of its own inside `#app`: the renderer given to
// `run` runs both, over the one `App`.
describe("together, React beside snabbdom", () => {
  test("a click in either renderer is drawn by both", () => {
    page().innerHTML = "<div id=\"snabbdom\"></div><div id=\"react\"></div>"
    const reactRoot = rootIn(element("#react"))
    stopLater(Effect.runFork(
      run(counter, (app) =>
        Effect.all([
          renderWithSnabbdom(element("#snabbdom"), (model: CounterModel, dispatch: Dispatch<CounterMessage>): VNode =>
            h("main", [
              h("output", String(model.count)),
              h("button", {
                on: {
                  click: () =>
                    dispatch(model.increment)
                }
              }, "+")
            ]))(app),
          drawIn(reactRoot, counterView)(app)
        ], { concurrency: "unbounded", discard: true })),
      { scheduler }
    ))
    settle()
    const counts = () => [element("#app > main output").textContent, element("#react output").textContent]
    expect(counts()).toEqual(["0", "0"])
    element<HTMLButtonElement>("#react button:last-of-type").click()
    drawn()
    refresh()
    settle()
    expect(counts()).toEqual(["1", "1"])
    element<HTMLButtonElement>("#app > main button").click()
    drawn()
    expect(counts()).toEqual(["2", "2"])
  })
})

// The premise of the bridge on React (`docs/premises.md`), checked on React alone: react.dev ("<input>") says that a
// controlled input's state is updated synchronously in `onChange`, of a state variable, not of a store.
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
})
