// React's bridge in a DOM (happy-dom), with screen refreshes that happen only when a test paints: the tests every
// bridge passes (`bridge.test_suite.ts`), given a `renderInto` that draws a run started by the suite with `Frames`, and
// the draft's in StrictMode too; the store, as an application that starts its run itself uses it; `Host`, which starts
// the run itself; what an application of its own does beside the program; one run drawn by React and by snabbdom
// together, as `counter` and `form` draw theirs; what the bridge leaves out; then the premises of the bridge on React
// (`docs/premises.md`).
import {
  type Dispatch,
  forwardTo,
  type Frame,
  type MessageOf,
  type ModelOf,
  program,
  ProgramDefect,
  run
} from "@fgaudo/effect-tea"
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
import * as Stream from "effect/Stream"
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
  useLayoutEffect,
  useState,
  useSyncExternalStore
} from "react"
import type { Root } from "react-dom/client"
import type { VNode } from "snabbdom"
import { counter, type Message as CounterMessage, type Model as CounterModel } from "../examples/counter/counter.ts"
import { view as snabbdomCounterView } from "../examples/counter/view-snabbdom.ts"
import { form } from "../examples/form/form.ts"
import { Storage } from "../examples/form/storage.ts"
import { view as snabbdomFormView } from "../examples/form/view-snabbdom.ts"
import { together } from "../examples/together.ts"
import type { Message as VolumeMessage, Model as VolumeModel } from "../examples/volume/volume.ts"
import {
  type Bridge,
  bridgeTests,
  button,
  desk,
  type Dictation,
  type draft,
  draftTests,
  element,
  holdFrames,
  type lid,
  lock,
  mount,
  note,
  paint,
  refresh,
  type RenderInto,
  scheduler,
  settle,
  setValue,
  state,
  type steps,
  stop,
  type
} from "./bridge.test_suite.ts"
import type { Fork, HostProps, View } from "./react.ts"
import { renderInto as renderWithSnabbdom } from "./snabbdom.ts"

// React DOM reads the DOM when it is loaded, so the bridge, the views and React DOM are loaded once there is one:
// what the shared tests are given reaches them when a test runs.
let bridge: typeof import("./react.ts")
let counterView: typeof import("../examples/counter/view-react.tsx").view
let formView: typeof import("../examples/form/view-react.tsx").view
let flushSync: typeof import("react-dom").flushSync
let createPortal: typeof import("react-dom").createPortal
let createRoot: typeof import("react-dom/client").createRoot

beforeAll(async () => {
  GlobalRegistrator.register()
  holdFrames()
  bridge = await import("./react.ts")
  counterView = (await import("../examples/counter/view-react.tsx")).view
  formView = (await import("../examples/form/view-react.tsx")).view
  const reactDom = await import("react-dom")
  flushSync = reactDom.flushSync
  createPortal = reactDom.createPortal
  createRoot = (await import("react-dom/client")).createRoot
})

afterAll(() => GlobalRegistrator.unregister())

// React asks the environment to say it acts, and only for the call, so that the frames of the tests, published outside
// `act` in `flushSync`, are not taken for updates it was not given.
const acting = async (work: () => void | Promise<void>) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  try {
    await act(work)
  } finally {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false })
  }
}

// The roots a test made: unmounted after it, inside `act`, which returns once React has done all the work the unmount
// set going. Unmounted, a `Host` interrupts its run, which `settle` lets through.
const roots: Array<Root> = []

afterEach(async () => {
  await acting(stop)
  for (const root of roots.splice(0)) await acting(() => root.unmount())
  settle()
})

const drawButton = (text: string, onClick: () => void) => createElement("button", { type: "button", onClick }, text)

// The suite starts the run itself, with its scheduler: `Frames` draws it from a store, in a root of its own that the
// renderer's release unmounts, as an application that starts its run would.
const framesInto: RenderInto<ReactNode> =
  <Model, Message>(root: HTMLElement, view: View<Model, Message>) => (frames: Stream.Stream<Frame<Model, Message>>) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const store = bridge.makeStore<Model, Message>()
        const reactRoot = createRoot(root)
        flushSync(() => reactRoot.render(createElement(bridge.Frames<Model, Message>, { store, view })))
        return { store, reactRoot }
      }),
      ({ reactRoot }) => Effect.sync(() => reactRoot.unmount())
    ).pipe(Effect.flatMap(({ store }) => store.open()(frames)), Effect.scoped)

type Own = "SendClicked" | "DiscardClicked"
type DraftProps = Readonly<{ model: ModelOf<typeof draft>; dispatch: Dispatch<MessageOf<typeof draft>> }>

const DraftView = ({ model, dispatch }: DraftProps): ReactNode =>
  createElement(
    "form",
    null,
    createElement(bridge.Shows, { value: model.text, dispatch: forwardTo(dispatch, "Text") }),
    drawButton("Send", bridge.onClick<Own>("SendClicked", dispatch)),
    drawButton("Discard", bridge.onClick<Own>("DiscardClicked", dispatch)),
    createElement("output", null, model.text)
  )

const deskView: View<ModelOf<typeof desk>, MessageOf<typeof desk>> = (model, dispatch) =>
  createElement(
    "main",
    null,
    createElement(DraftView, { model: model.draft, dispatch: forwardTo(dispatch, "Draft") }),
    drawButton("Keep", bridge.onClick<MessageOf<typeof desk>>("Kept", dispatch)),
    drawButton("Undo", bridge.onClick<MessageOf<typeof desk>>("Undone", dispatch)),
    createElement("ul", null, ...model.sent.map((text, index) => createElement("li", { key: index }, text)))
  )

// Only the ringer is drawn here, which is what the shared test drags.
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
          onSome: (press) => bridge.onPress<VolumeMessage>(press, dispatch)
        })
      },
      createElement("div", { className: "fill", style: { width: `${model.ringer.level}%` } }),
      createElement("div", { className: "cap", style: { left: `${model.ringer.max}%` } })
    ),
    createElement("output", { className: "ringer" }, String(model.ringer.level))
  )

type NoteModel = ModelOf<typeof note>
type NoteMessage = MessageOf<typeof note>

const noteView: View<NoteModel, NoteMessage> = (model, dispatch) =>
  createElement("main", null, createElement(bridge.Shows, { value: model, dispatch: forwardTo(dispatch, "Note") }))

// `Shows` takes no ref: the element is found inside a wrapper. It listens from the wrapper's ref callback, a new one in
// every frame, which has run when `flushSync` returns (`docs/premises.md`), so that a test dictates with no turn for
// React; the cleanup it returns stops the last frame's.
const dictatedView = (source: Dictation): typeof noteView => (model, dispatch) =>
  createElement(
    "main",
    null,
    createElement(
      "span",
      {
        ref: (wrapper: HTMLSpanElement | null) =>
          wrapper === null ? undefined : source.listen((text) => {
            const shown = wrapper.querySelector("input")
            if (shown !== null) type(shown, text)
          })
      },
      createElement(bridge.Shows, { value: model, dispatch: forwardTo(dispatch, "Note") })
    )
  )

const lidView: View<ModelOf<typeof lid>, MessageOf<typeof lid>> = (model, dispatch) =>
  model._tag === "Opened"
    ? createElement(
      "main",
      null,
      createElement(bridge.Shows, { value: model.note, dispatch: forwardTo(dispatch, "Note") }),
      drawButton("Close", bridge.onClick<MessageOf<typeof lid>>(model.close, dispatch)),
      createElement("output", null, model.note)
    )
    : createElement(
      "main",
      null,
      createElement("input", { value: "Closed", readOnly: true }),
      drawButton("Open", bridge.onClick<MessageOf<typeof lid>>(model.open, dispatch))
    )

// The same `Shows` for both steps, whose `<input>` React draws again for the second.
const stepsView: View<ModelOf<typeof steps>, MessageOf<typeof steps>> = (model, dispatch) =>
  createElement(
    "main",
    null,
    createElement(bridge.Shows, {
      value: model.text,
      dispatch: model._tag === "First" ? forwardTo(dispatch, "First") : forwardTo(dispatch, "Second")
    }),
    model._tag === "First" ? drawButton("Next", bridge.onClick<MessageOf<typeof steps>>(model.next, dispatch)) : null,
    createElement("output", null, model.text)
  )

// The same `Shows`, through the same dispatch, open and locked.
const lockView: View<ModelOf<typeof lock>, MessageOf<typeof lock>> = (model, dispatch) =>
  createElement(
    "main",
    null,
    createElement(bridge.Shows, { value: model.text, dispatch: forwardTo(dispatch, "Text") }),
    model._tag === "Open" ? drawButton("Lock", bridge.onClick<MessageOf<typeof lock>>(model.lock, dispatch)) : null,
    createElement("output", null, model.text)
  )

const react: Bridge<ReactNode> = {
  renderInto: framesInto,
  views: {
    counter: (model, dispatch) => counterView(model, dispatch),
    form: (model, dispatch) => formView(model, dispatch),
    desk: deskView,
    volume: volumeView,
    note: noteView,
    dictated: dictatedView,
    lid: lidView,
    steps: stepsView,
    lock: lockView
  }
}

bridgeTests(react)

// StrictMode attaches every ref twice, and renders every component twice.
describe("in StrictMode", () => {
  draftTests({
    ...react,
    views: {
      ...react.views,
      desk: (model, dispatch) => createElement(StrictMode, null, deskView(model, dispatch))
    }
  })
})

const page = () => {
  document.body.innerHTML = "<div id=\"app\"></div><div id=\"aside\"></div>"
  return element<HTMLElement>("#app")
}

// A root a test draws into: unmounted after the test, if the test has not.
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

describe("the store, for a run the application starts itself", () => {
  // `flushSync` inside an effect of React does not flush, and React says so (react.dev, "flushSync"): a run forked
  // there with `Effect.runFork` is evaluated at once, and would publish its first frame inside the effect.
  test("a renderer forked as an effect of React runs draws its first frame outside the effect", async () => {
    const errors: Array<unknown> = []
    const error = console.error
    console.error = (...args: Array<unknown>) => void errors.push(args)
    try {
      const store = bridge.makeStore<string, never>()
      const Started = (): ReactNode => {
        useEffect(() => {
          const fiber = Effect.runFork(
            store.open()(Stream.make({ model: "Drawn", dispatch: () => Effect.succeed(0), seen: 0 })),
            { scheduler }
          )
          return () => void Effect.runFork(Fiber.interrupt(fiber))
        }, [])
        return createElement(bridge.Frames<string, never>, {
          store,
          view: (model) => createElement("output", null, model),
          fallback: "Starting"
        })
      }
      await acting(() => rootIn(page()).render(createElement(Started)))
      expect(element("#app").textContent).toBe("Starting")
      settle()
      expect(element("#app").textContent).toBe("Drawn")
      expect(errors).toEqual([])
    } finally {
      console.error = error
    }
  })

  test("once another renderer of the store is opened, the frames of the first are not published", async () => {
    const store = bridge.makeStore<CounterModel, CounterMessage>()
    await acting(() =>
      rootIn(page()).render(createElement(bridge.Frames<CounterModel, CounterMessage>, { store, view: counterView }))
    )
    const first = Effect.runFork(run(counter, store.open()), { scheduler })
    settle()
    const sendToFirst = store.frame()?.dispatch
    if (sendToFirst === undefined) throw new Error("The first run drew no frame")
    const second = Effect.runFork(run(counter, store.open()), { scheduler })
    settle()
    expect(store.frame()?.dispatch).not.toBe(sendToFirst)
    Effect.runSync(sendToFirst("Increment"))
    Effect.runSync(sendToFirst("Increment"))
    paint()
    expect(element("output").textContent).toBe("0")
    button("+").click()
    paint()
    expect(element("output").textContent).toBe("1")
    const ended = Effect.runPromise(Effect.all([Fiber.interrupt(first), Fiber.interrupt(second)]))
    settle()
    await ended
  })
})

// The run is forked on the suite's scheduler, so that a test says when the run goes on, as the suite's do.
const heldFork: Fork<never> = (effect) => Effect.runFork(effect, { scheduler })

const withStorage = (storage: Storage["Service"]): Fork<Storage> => (effect) =>
  heldFork(effect.pipe(Effect.provideService(Storage, storage)))

// `createElement` does not infer the types of a generic component, as JSX does: a function of its props does.
const host = <State, Model, Message, Command = never, RC = never, RS = never, Flags = never>(
  props: HostProps<State, Model, Message, Command, RC, RS, Flags> & Attributes
) =>
  createElement(
    bridge.Host<State, Model, Message, Command, RC, RS, Flags>,
    props
  )

const hostInto = async (node: ReactNode, into = page()) => {
  const root = rootIn(into)
  await acting(() => root.render(node))
  return root
}

// A note's Host, which records the dispatch of each frame it draws.
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
    if (last === undefined) throw new Error("No frame is drawn")
    return last
  }
  return {
    node,
    note: () => current().model,
    send: (message: NoteMessage) => Effect.runSync(current().dispatch(message))
  }
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
  test("draws its fallback until the first frame, then the frame", async () => {
    await hostInto(
      host({ program: counter, fork: heldFork, fallback: createElement("p", null, "Starting"), children: counterView })
    )
    expect(element("#app").textContent).toBe("Starting")
    settle()
    expect(element("output").textContent).toBe("0")
    button("+").click()
    paint()
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
    settle()
    await acting(() => root.render(node((message) => void ignored.push(message))))
    button("+").click()
    paint()
    expect([applied, ignored]).toEqual([["Increment"], []])
  })

  test("interrupts the run as it unmounts, and the run releases what it holds", async () => {
    const ended: Array<string> = []
    const root = await hostInto(host({
      program: counter,
      fork: (effect) => heldFork(effect.pipe(Effect.onInterrupt(() => Effect.sync(() => ended.push("run"))))),
      children: counterView
    }))
    settle()
    expect(ended).toEqual([])
    await unmount(root)
    expect(ended).toEqual(["run"])
    expect(element("#app").childElementCount).toBe(0)
  })

  test("a new key starts the program anew, from init", async () => {
    const node = (key: string) => host({ key, program: counter, fork: heldFork, children: counterView })
    const root = await hostInto(node("first"))
    settle()
    button("+").click()
    paint()
    expect(element("output").textContent).toBe("1")
    await acting(() => root.render(node("second")))
    settle()
    expect(element("output").textContent).toBe("0")
  })

  // React's `<Activity>` destroys the effects of what it hides, and creates them again as it shows it (react.dev,
  // "<Activity>"), keeping the state of its components: `Host`'s store stays, and its last frame belongs to a run that
  // has ended.
  test("hidden by Activity, the run ends; shown again, the program starts from init, after the fallback", async () => {
    const ended: Array<string> = []
    const node = (mode: "visible" | "hidden") =>
      createElement(Activity, {
        mode,
        children: host({
          program: counter,
          fork: (effect) => heldFork(effect.pipe(Effect.onInterrupt(() => Effect.sync(() => ended.push("run"))))),
          fallback: createElement("p", null, "Starting"),
          children: counterView
        })
      })
    const root = await hostInto(node("visible"))
    settle()
    button("+").click()
    paint()
    expect(element("output").textContent).toBe("1")
    await acting(() => root.render(node("hidden")))
    settle()
    expect(ended).toEqual(["run"])
    await acting(() => root.render(node("visible")))
    expect(element("#app").textContent).toBe("Starting")
    settle()
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
    settle()
    await acting(() => root.render(node("visible", forkedBy("second"))))
    await acting(() => root.render(node("hidden", forkedBy("second"))))
    settle()
    await acting(() => root.render(node("visible", forkedBy("second"))))
    settle()
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
    settle()
    type(element<HTMLInputElement>("input"), "Ada")
    paint()
    button("Save").click()
    paint()
    paint()
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
    settle()
    for (const text of ["A", "Ad", "Ada"]) {
      type(element<HTMLInputElement>("input"), text)
      paint()
    }
    expect(element("input").getAttribute("placeholder")).toBe("A name")
    expect([dispatches.size, forwarded.size]).toEqual([1, 1])
  })

  // A message of a command makes no new `seen`: the frame that empties the name has the `seen` of the frame before.
  test("a value a command's message puts in an input's place, with no new seen, is shown by the element", async () => {
    const answer = Deferred.makeUnsafe<void>()
    await hostInto(host({
      program: form,
      fork: withStorage(Storage.of({ save: () => Deferred.await(answer) })),
      children: formView
    }))
    settle()
    const input = element<HTMLInputElement>("input")
    type(input, "Ada")
    paint()
    button("Save").click()
    paint()
    expect([input.value, input.disabled]).toEqual(["Ada", true])
    Deferred.doneUnsafe(answer, Effect.void)
    settle()
    paint()
    expect(element("input")).toBe(input)
    expect([input.value, input.disabled]).toEqual(["", false])
    expect(element("li").textContent).toBe("Ada")
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
        children: (model, dispatch) => drawButton("Break", bridge.onClick(model.broken, dispatch))
      })

    test("throws its ProgramDefect as Host renders, for the nearest error boundary", async () => {
      const caught = witness<unknown>()
      const root = createRoot(page(), { onCaughtError: (error) => caught.settled(error) })
      roots.push(root)
      await acting(() => root.render(createElement(Boundary, null, breakIn(heldFork))))
      settle()
      button("Break").click()
      settle()
      const error = await caught.promise
      await acting(async () => {})
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
      settle()
      button("Break").click()
      settle()
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
      settle()
      button("+").click()
      paint()
      expect(await caught.promise).toBe(thrown)
      await acting(async () => {})
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
        settle()
        await unmount(root)
        expect(await reported.promise).toBe(released)
      } finally {
        globalThis.reportError = reportError
      }
    })
  })

  // StrictMode mounts every component, unmounts it, and mounts it again, running its effects each time: the first run
  // is interrupted before it draws, and the second draws.
  test("in StrictMode, the run of the first mount is interrupted, and the second's frames are drawn", async () => {
    const started: Array<number> = []
    const ended: Array<number> = []
    await hostInto(createElement(
      StrictMode,
      null,
      host({
        program: counter,
        fork: (effect) => {
          const count = started.length + 1
          started.push(count)
          return heldFork(effect.pipe(Effect.onInterrupt(() => Effect.sync(() => ended.push(count)))))
        },
        children: counterView
      })
    ))
    settle()
    expect([started, ended]).toEqual([[1, 2], [1]])
    button("+").click()
    paint()
    expect(element("output").textContent).toBe("1")
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
      update: () => (state) => ({ state: { loaded: state.loaded + 1 } }),
      runCommand: () =>
        Effect.suspend(() => {
          const count = runs
          commands.push(`started by ${count}`)
          return Deferred.await(answer).pipe(
            Effect.as(Opt.some<"Loaded">("Loaded")),
            Effect.onInterrupt(() => Effect.sync(() => commands.push(`interrupted in ${count}`)))
          )
        }),
      makeModel: (state) => state
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
    settle()
    Deferred.doneUnsafe(answer, Effect.void)
    settle()
    paint()
    expect(commands).toEqual(["started by 1", "interrupted in 1", "started by 2"])
    expect(element("output").textContent).toBe("1")
  })

  test("in StrictMode, an input is settled by the run that draws it", async () => {
    const app = hostNote()
    await hostInto(createElement(StrictMode, null, app.node))
    settle()
    const typed = element<HTMLInputElement>("input")
    type(typed, "Ada")
    paint()
    expect(app.note()).toBe("Ada")
    app.send("Cleared")
    paint()
    expect(element("input")).toBe(typed)
    expect(typed.value).toBe("")
  })

  test("forked with Effect.runFork, draws its first frame with no warning of React", async () => {
    const errors: Array<unknown> = []
    const error = console.error
    console.error = (...args: Array<unknown>) => void errors.push(args)
    const drawn = witness<void>()
    try {
      await hostInto(host({
        program: counter,
        children: (model, dispatch) => {
          drawn.settled()
          return counterView(model, dispatch)
        }
      }))
      await drawn.promise
      await acting(async () => {})
      expect(element("output").textContent).toBe("0")
      expect(errors).toEqual([])
    } finally {
      console.error = error
    }
  })
})

describe("beside the program, what an application of its own does", () => {
  // A component with state of its own: an editor that the user opens and closes, outside any frame.
  test("an input a component mounts from its own state shows the program's value, and what is typed is stored", async () => {
    const Editor = ({ value, dispatch }: Readonly<{ value: string; dispatch: Dispatch<NoteMessage> }>): ReactNode => {
      const [open, setOpen] = useState(false)
      return createElement(
        "section",
        null,
        drawButton(open ? "Done" : "Edit", () => setOpen(!open)),
        open ? createElement(bridge.Shows, { value, dispatch: forwardTo(dispatch, "Note") }) : null,
        createElement("output", null, value)
      )
    }
    const app = hostNote((model, dispatch) => createElement(Editor, { value: model, dispatch }))
    await hostInto(app.node)
    settle()
    app.send({ _tag: "Note", message: { _tag: "Written", was: "", value: "Ada" } })
    paint()
    expect(element("output").textContent).toBe("Ada")
    await acting(() => button("Edit").click())
    const typed = element<HTMLInputElement>("input")
    expect(typed.value).toBe("Ada")
    type(typed, "Ada!")
    paint()
    expect(app.note()).toBe("Ada!")
    await acting(() => button("Done").click())
    app.send("Cleared")
    paint()
    await acting(() => button("Edit").click())
    expect(element<HTMLInputElement>("input").value).toBe("")
  })

  // The pane is skipped by `memo` on the frame of the rejection: its props, the text and the dispatch, are the same.
  test("an input in a subtree that memo skips takes the program's value once a frame has seen its rejected key", () => {
    const Pane = memo(({ text, dispatch }: Readonly<{ text: string; dispatch: Dispatch<MessageOf<typeof lock>> }>) =>
      createElement(
        "section",
        null,
        createElement(bridge.Shows, { value: text, dispatch: forwardTo(dispatch, "Text") }),
        createElement("output", null, text)
      )
    )
    mount(framesInto, (model: ModelOf<typeof lock>, dispatch: Dispatch<MessageOf<typeof lock>>) =>
      createElement(
        "main",
        null,
        createElement(Pane, { text: model.text, dispatch }),
        model._tag === "Open" ? drawButton("Lock", bridge.onClick<MessageOf<typeof lock>>(model.lock, dispatch)) : null
      ), (render) => run(lock, render))
    settle()
    const typedInto = element<HTMLInputElement>("input")
    button("Lock").click()
    settle()
    type(typedInto, "A")
    refresh()
    expect(typedInto.value).toBe("A")
    paint()
    expect(element("input")).toBe(typedInto)
    expect(typedInto.value).toBe("")
  })

  // Suspense hides content that suspends again, and shows it once its promise settles, in a commit of React's own,
  // outside any frame: react.dev ("<Suspense>") says that it cleans up the layout effects of the hidden content, and
  // runs them again as it shows it.
  test("an input Suspense hides, and shows again outside a frame, shows the value the program put there meanwhile", async () => {
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
          createElement(bridge.Shows, { value: model, dispatch: forwardTo(dispatch, "Note") })
        ),
        createElement("output", null, model)
      )
    )
    await hostInto(app.node)
    settle()
    const typedInto = element<HTMLInputElement>("input")
    type(typedInto, "Ada")
    paint()
    expect(state()).toEqual(["Ada"])
    pending = new Promise((resolve) => {
      release = () => {
        pending = undefined
        resolve()
      }
    })
    app.send("Cleared")
    paint()
    expect(state()).toEqual([""])
    // Hidden, not removed: the element is kept, with what was typed.
    expect(element("input")).toBe(typedInto)
    expect([typedInto.style.display, typedInto.value]).toEqual(["none", "Ada"])
    await acting(async () => release())
    paint()
    expect(element("input")).toBe(typedInto)
    expect(typedInto.value).toBe("")
  })

  test("an input drawn through a portal is settled by its run's frames", async () => {
    const app = hostNote((model, dispatch) =>
      createElement(
        "main",
        null,
        createPortal(
          createElement(bridge.Shows, { value: model, dispatch: forwardTo(dispatch, "Note") }),
          element("#aside")
        ),
        createElement("output", null, model)
      )
    )
    await hostInto(app.node)
    settle()
    const typed = element<HTMLInputElement>("#aside input")
    type(typed, "Ada")
    paint()
    expect(app.note()).toBe("Ada")
    app.send("Cleared")
    paint()
    expect(element("#aside input")).toBe(typed)
    expect(typed.value).toBe("")
  })

  // Run A has seen one key when its frame is drawn; B's input has sent its first key, which B's run has not taken; then
  // the other way round. An input settled with another run's `seen` would take back what was typed into it.
  test("two programs on one page: each input is settled with its own run's seen", async () => {
    document.body.innerHTML = "<div id=\"a\"></div><div id=\"b\"></div>"
    const a = hostNote()
    const b = hostNote()
    await hostInto(a.node, element("#a"))
    await hostInto(b.node, element("#b"))
    settle()
    const inA = element<HTMLInputElement>("#a input")
    const inB = element<HTMLInputElement>("#b input")
    type(inA, "a")
    settle()
    type(inB, "b")
    refresh()
    expect([inA.value, inB.value]).toEqual(["a", "b"])
    paint()
    expect([a.note(), b.note()]).toEqual(["a", "b"])
    // The other way round: B has seen its second key, A's second is not taken yet.
    type(inB, "bb")
    settle()
    type(inA, "aa")
    refresh()
    expect([inA.value, inB.value]).toEqual(["aa", "bb"])
    paint()
    expect([a.note(), b.note()]).toEqual(["aa", "bb"])
    expect([inA.value, inB.value]).toEqual(["aa", "bb"])
  })

  test("an input in a root in a shadow tree is settled by its run's frames", async () => {
    document.body.innerHTML = "<div id=\"host\"></div>"
    const shadow = element("#host").attachShadow({ mode: "open" })
    shadow.innerHTML = "<div id=\"app\"></div>"
    const app = hostNote()
    await hostInto(app.node, shadow.getElementById("app") as HTMLElement)
    settle()
    const typed = shadow.querySelector("input")
    if (typed === null) throw new Error("No input is drawn in the shadow tree")
    type(typed, "Ada")
    paint()
    expect(app.note()).toBe("Ada")
    app.send("Cleared")
    paint()
    expect(typed.value).toBe("")
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
      settle()
      type(element<HTMLInputElement>("input"), "Ada")
      paint()
      button("Save").click()
      paint()
      expect(button("Saving…")).toBeDefined()
      await unmount(root)
      expect(interrupted).toEqual(["Ada"])
      Deferred.doneUnsafe(answer, Effect.void)
      settle()
      paint()
      expect(element("#app").childElementCount).toBe(0)
      expect(errors).toEqual([])
    } finally {
      console.error = error
    }
  })
})

// Each renderer in a root of its own inside `#app`, given the half of a view's pair that is its own: snabbdom's first,
// which patches its root into the tree it draws, then React's, through `Frames`.
type Both = Readonly<{ snabbdom: VNode; react: ReactNode }>

const bothInto: RenderInto<Both> = (root, view) => {
  root.innerHTML = "<div id=\"snabbdom\"></div><div id=\"react\"></div>"
  return together(
    renderWithSnabbdom(element("#snabbdom"), (model, dispatch) => view(model, dispatch).snabbdom),
    framesInto(element("#react"), (model, dispatch) => view(model, dispatch).react)
  )
}

const drawnBySnabbdom = <E extends Element>(selector: string): E => element(`#app > main ${selector}`)

const drawnByReact = <E extends Element>(selector: string): E => element(`#react ${selector}`)

describe("together, React beside snabbdom", () => {
  test("a click in either renderer is drawn by both at the next refresh", () => {
    mount(
      bothInto,
      (model: ModelOf<typeof counter>, dispatch: Dispatch<MessageOf<typeof counter>>) => ({
        snabbdom: snabbdomCounterView(model, dispatch),
        react: counterView(model, dispatch)
      }),
      (render) => run(counter, render)
    )
    settle()
    const counts = () => [drawnBySnabbdom("output").textContent, drawnByReact("output").textContent]
    expect(counts()).toEqual(["0", "0"])
    drawnByReact<HTMLButtonElement>("button:last-of-type").click()
    paint()
    expect(counts()).toEqual(["1", "1"])
    drawnBySnabbdom<HTMLButtonElement>("button:last-of-type").click()
    paint()
    expect(counts()).toEqual(["2", "2"])
  })

  test("each input keeps what the user typed into it since the frame, and shows what was typed into the other", () => {
    mount(
      bothInto,
      (model: ModelOf<typeof form>, dispatch: Dispatch<MessageOf<typeof form>>) => ({
        snabbdom: snabbdomFormView(model, dispatch),
        react: formView(model, dispatch)
      }),
      (render) => run(form, render).pipe(Effect.provideService(Storage, Storage.of({ save: () => Effect.void })))
    )
    settle()
    const inReact = drawnByReact<HTMLInputElement>("input")
    const inSnabbdom = drawnBySnabbdom<HTMLInputElement>("input")
    type(inReact, "A")
    settle()
    // The next key is in React's input before its message reaches the program: the frame drawn now knows only "A".
    setValue(inReact, "Ad")
    paint()
    expect([inSnabbdom.value, inReact.value]).toEqual(["A", "Ad"])
    type(inSnabbdom, "Ada")
    paint()
    expect(drawnBySnabbdom("input")).toBe(inSnabbdom)
    expect(drawnByReact("input")).toBe(inReact)
    expect([inSnabbdom.value, inReact.value]).toEqual(["Ada", "Ada"])
  })
})

// What the guide's "Writing a bridge" says the bridge leaves out, each as a test that fails until a bridge handles it.
describe("what the bridge leaves out", () => {
  // The bridge hears no reset: a reset changes the element with no input event.
  test.failing("a reset of an input's form is stored as the user emptying the element", () => {
    mount(framesInto, deskView, (render) => run(desk, render))
    settle()
    const typedInto = element<HTMLInputElement>("input")
    type(typedInto, "Ada")
    paint()
    expect(state()).toEqual(["Ada"])
    typedInto.form?.reset()
    paint()
    expect(typedInto.value).toBe("")
    // What the program holds, sent: happy-dom resets the text of an `<output>` too, so the page does not say it.
    button("Send").click()
    paint()
    expect([...document.querySelectorAll("li")].map((sent) => sent.textContent)).toEqual([])
  })

  // A text field strips the line breaks of a value written into it (HTML, the value sanitization algorithm of
  // `type=text`), with no event: the element then shows a value that `drawn` holds as shown.
  test.failing("a value with a line break the program puts in an input's place is shown by the element", async () => {
    const app = hostNote()
    await hostInto(app.node)
    settle()
    const typed = element<HTMLInputElement>("input")
    app.send({ _tag: "Note", message: { _tag: "Written", was: app.note(), value: "Ada\nLovelace" } })
    paint()
    expect(app.note()).toBe("Ada\nLovelace")
    expect(typed.value).toBe(app.note())
  })
})

// The premises of the bridge on React (`docs/premises.md`), each checked on React alone.
describe("React, as the bridge rests on it", () => {
  // react.dev ("flushSync") says only that React updates the DOM before `flushSync` returns.
  test("the ref callbacks and the layout effects of a commit have run when flushSync returns", () => {
    const root = rootIn(page())
    const ran: Array<string> = []
    const Drawn = ({ frame }: Readonly<{ frame: string }>): ReactNode => {
      useLayoutEffect(() => void ran.push(`layout ${frame}`), [frame])
      return createElement("input", {
        ref: (node: HTMLInputElement | null) => void ran.push(`ref ${frame} ${node?.tagName}`)
      })
    }
    flushSync(() => root.render(createElement(Drawn, { frame: "first" })))
    expect(ran).toEqual(["ref first INPUT", "layout first"])
    flushSync(() => root.render(createElement(Drawn, { frame: "second" })))
    expect(ran.slice(2)).toEqual(["ref first undefined", "ref second INPUT", "layout second"])
  })

  // As the bridge's `Frames` and `Shows` read one: the listener is told inside `flushSync`.
  test("the layout effects of a component that a store makes render again have run when flushSync returns", () => {
    const root = rootIn(page())
    let value = 0
    const listeners = new Set<() => void>()
    const subscribe = (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
    const ran: Array<number> = []
    const Reads = (): ReactNode => {
      const read = useSyncExternalStore(subscribe, () => value)
      useLayoutEffect(() => void ran.push(read), [read])
      return null
    }
    flushSync(() => root.render(createElement(Reads)))
    value = 1
    flushSync(() => {
      for (const listener of listeners) listener()
    })
    expect(ran).toEqual([0, 1])
  })

  // react.dev ("<input>") says only that the JSX of an uncontrolled input does not control its value.
  test("React leaves the value of an input drawn without value or defaultValue as it is when it draws it again", () => {
    const root = rootIn(page())
    flushSync(() => root.render(createElement("input", { placeholder: "first" })))
    const drawn = element<HTMLInputElement>("input")
    setValue(drawn, "Ada")
    flushSync(() => root.render(createElement("input", { placeholder: "second" })))
    expect(element("input")).toBe(drawn)
    expect([drawn.placeholder, drawn.value]).toEqual(["second", "Ada"])
  })

  // react.dev ("memo") says that a memoized component renders again when its state or a context it reads changes.
  test("a component that memo skips renders again when a store it reads changes", () => {
    const root = rootIn(page())
    let value = 0
    const listeners = new Set<() => void>()
    const subscribe = (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
    const Reads = memo((): ReactNode => createElement("output", null, useSyncExternalStore(subscribe, () => value)))
    const Parent = (): ReactNode => createElement("main", null, createElement(Reads))
    flushSync(() => root.render(createElement(Parent)))
    value = 1
    flushSync(() => {
      for (const listener of listeners) listener()
    })
    expect(element("output").textContent).toBe("1")
  })
})
