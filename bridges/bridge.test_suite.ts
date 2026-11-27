// The tests every bridge passes, in a DOM, with controlled elements: a bridge's test file registers the DOM, holds its
// screen refreshes (`holdFrames`) and calls `bridgeTests` with its `drawInto`, the views of the scenarios, and
// `drawn`, what a test awaits after an act of the user so that the bridge has drawn what that act made (each bridge
// draws a notice in a microtask). A `.test_suite.ts`, a file that serves the tests,
// not a `*.test.ts`: `bun test` does not run it by itself, and it runs in the file of each bridge that calls it, under
// that file's name.
import {
  type App,
  child,
  type Dispatch,
  type MessageOf,
  type ModelOf,
  program,
  reject,
  start,
  type Started
} from "@fgaudo/effect-tea"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Opt from "effect/Option"
import * as Scheduler from "effect/Scheduler"
import * as Stream from "effect/Stream"
import { counter, type Message as CounterMessage, type Model as CounterModel } from "../examples/counter/counter.ts"
import { form, type Message as FormMessage, type Model as FormModel } from "../examples/form/form.ts"
import { Storage, StorageError } from "../examples/form/storage.ts"
import { type Message as VolumeMessage, type Model as VolumeModel, Pointer, volume } from "../examples/volume/volume.ts"

// The callbacks waiting for the next screen refresh: none runs until `paint`.
const waiting = new Map<number, FrameRequestCallback>()
let requested = 0

// Effect's own scheduler, but for the turns of the event loop it would wait for: it keeps them until `settle`, so
// that a test, not the clock, says when the program and the renderer go on. A renderer needs no turn of its own:
// snabbdom patches synchronously, and a test of React's bridge has React render in `drawn`, what it calls after an act
// of the user. What a run waits for outside Effect's scheduler (`Effect.sleep`, a promise) is not held: a
// test controls it by its own means (`TestClock`, a `Deferred`).
const held = new Set<() => void>()
export const scheduler = new Scheduler.MixedScheduler("async", (task) => {
  held.add(task)
  return () => held.delete(task)
})

/** Lets the program and the renderer do all they can without a screen refresh. */
export const settle = () => {
  for (let turns = 0; held.size > 0; turns += 1) {
    if (turns === 10_000) throw new Error("The program never settles: a fiber yields forever")
    // oxlint-disable-next-line unicorn/no-useless-spread -- a task may add to `held`: the turn runs those held before it
    for (const task of [...held]) if (held.delete(task)) task()
  }
}

/**
 * One screen refresh: each callback a renderer asked for runs. Neither bridge of the package asks for one ("asks for
 * no screen refresh", `snabbdom.test.ts`): this is for a bridge of a user's that draws in one.
 */
export const refresh = () => {
  const due = [...waiting.values()]
  waiting.clear()
  for (const callback of due) callback(performance.now())
}

/** Replaces the screen refreshes of the DOM just registered by those `refresh` makes: called in `beforeAll`. */
export const holdFrames = () => {
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      requested += 1
      waiting.set(requested, callback)
      return requested
    },
    cancelAnimationFrame: (id: number) => waiting.delete(id)
  })
}

// What a test drew and ran: what stops each bridge it drew with, and the fiber of each run it forked.
const drawings: Array<() => void> = []
const runs: Array<Fiber.Fiber<never>> = []

/** Keeps what stops a bridge, which `stop` calls. */
export const drawing = (stopDrawing: () => void) => void drawings.push(stopDrawing)

/** Forks a program's `run` on the held scheduler: `stop` interrupts it. */
export const forked = (run: Effect.Effect<never>): Fiber.Fiber<never> => {
  const fiber = Effect.runFork(run, { scheduler })
  runs.push(fiber)
  return fiber
}

/** Stops the bridges a test drew with, ends the runs it forked, and forgets their refreshes: called in `afterEach`. */
export const stop = async () => {
  for (const stopDrawing of drawings.splice(0)) stopDrawing()
  for (const fiber of runs.splice(0)) {
    // A run ends on the held scheduler too: what its interruption does is let through before it is awaited.
    const ended = Effect.runPromise(Fiber.interrupt(fiber))
    settle()
    await ended
  }
  waiting.clear()
}

/** A view of a program, drawn by a renderer whose trees are `Node`s. */
export type View<Node, Model, Message> = (model: Model, dispatch: Dispatch<Message>) => Node

/** A bridge's `drawInto`: draws a program that was started into `root`, by plain code, and returns what stops it. */
export type DrawInto<Node> = <Model, Message>(
  root: HTMLElement,
  drawn: { readonly app: App<Model, Message>; readonly view: View<Node, Model, Message> }
) => () => void

/**
 * Draws a program that was started on a fresh page, `#app` its root, `#aside` for what a renderer draws outside it,
 * then forks its `run`, given its services by `provide` when it needs some; `views` counts trees.
 */
export const mount = <Node, Model, Message, R = never>(
  drawInto: DrawInto<Node>,
  view: View<Node, Model, Message>,
  { app, run }: Started<Model, Message, R>,
  ...[provide]: [R] extends [never] ? [] : [provide: (run: Effect.Effect<never, never, R>) => Effect.Effect<never>]
) => {
  document.body.innerHTML = "<div id=\"app\"></div><div id=\"aside\"></div>"
  const root = document.getElementById("app") as HTMLElement
  let views = 0
  drawing(
    drawInto(root, {
      app,
      view: (model, dispatch) => {
        views += 1
        return view(model, dispatch)
      }
    })
  )
  forked(provide === undefined ? run as Effect.Effect<never> : provide(run))
  return { views: () => views, app }
}

export const element = <E extends Element>(selector: string): E => {
  const found = document.querySelector<E>(selector)
  if (found === null) throw new Error(`Nothing drawn matches ${selector}`)
  return found
}

export const button = (text: string) => {
  const found = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent === text)
  if (found === undefined) throw new Error(`No button "${text}" is drawn`)
  return found
}

// A key as the browser makes one: the value written by the prototype's own setter, past any a renderer puts on the
// element, then the event, which bubbles, as a renderer may hear it at its root.
export const setValue = (input: HTMLInputElement, text: string) =>
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text)

export const type = (input: HTMLInputElement, text: string) => {
  setValue(input, text)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

/** What the page says the state holds: the draft's text, then the texts sent. */
export const state = () => [...document.querySelectorAll("output, li")].map((found) => found.textContent)

/** What an element gives, with the value it holds: each model holds it without the value, and the view fills it. */
type Typed<Tag extends string, A = string> = Readonly<{ _tag: Tag; value: A }>

// A draft that keeps itself and brings itself back as the very same state, and that its parent starts again once sent.
type Own = "SendClicked" | "DiscardClicked" | "Kept" | "Undone" | Typed<"TextTyped">
type Sent = Readonly<{ _tag: "Sent"; text: string }>
type Draft = { readonly text: string; readonly kept: Opt.Option<Draft> }
type Desk = Readonly<{ sent: ReadonlyArray<string> }>
const draftOf = program<{ state: Draft; event: Sent; message: Own }>()

export const draft = draftOf.make({
  init: { state: { text: "", kept: Opt.none() } },
  update: (message: Own) => (held) => {
    if (typeof message !== "string") return { state: { ...held, text: message.value } }
    switch (message) {
      case "DiscardClicked":
        return { state: { ...held, text: "" } }
      case "Kept":
        return { state: { ...held, kept: Opt.some(held) } }
      case "Undone":
        return Opt.match(held.kept, { onNone: () => reject, onSome: (kept) => ({ state: kept }) })
      case "SendClicked":
        return held.text === "" ? reject : { state: held, events: [{ _tag: "Sent", text: held.text }] }
    }
  },
  makeModel: (held) => ({ text: held.text, typed: { _tag: "TextTyped" } as const })
})

const deskOf = program<{ state: Desk }>()

// Sent, the draft is started again, by another key: it starts from the state its `init` gives.
export const desk = deskOf.withChildren({ Draft: child(draft, { key: (held) => held.sent.length }) }).make({
  init: { state: { sent: [] } },
  onEvent: { Draft: (event) => (held) => ({ state: { sent: [...held.sent, event.text] } }) },
  makeModel: (held, children) => ({ draft: children.Draft(), sent: held.sent })
})

// A note the program clears on a message that no control drawn sends, as a source that exists whatever is drawn
// would.
type Note = Readonly<{ note: string }>
const noteOf = program<{ state: Note; message: "Cleared" | Typed<"NoteTyped"> }>()

export const note = noteOf.make({
  init: { state: { note: "" } },
  update: (message) => () => ({ state: { note: message === "Cleared" ? "" : message.value } }),
  makeModel: (state) => ({ note: state.note, typed: { _tag: "NoteTyped" } as const })
})

// The same note, stored in capitals: `update` stores another form of what is typed, and leaves the very same state
// where that form is the note held.
export const shouted = noteOf.make({
  init: { state: { note: "" } },
  update: (message) => (held) => {
    const stored = message === "Cleared" ? "" : message.value.toUpperCase()
    return stored === held.note ? { state: held } : { state: { note: stored } }
  },
  makeModel: (state) => ({ note: state.note, typed: { _tag: "NoteTyped" } as const })
})

// A note behind a lid, which starts open or closed: open, it is drawn as a field to type into; closed, a plain field
// that sends nothing stands in its place, which a renderer may draw with the same element.
type Lid = Readonly<{ note: string; lid: "Opened" | "Closed" }>
const lidOf = program<{ state: Lid; flags: Lid["lid"]; message: "Opened" | "Closed" | Typed<"NoteTyped"> }>()

export const lid = lidOf.make({
  init: (lid) => ({ state: { note: "draft", lid } }),
  update: (message) => (held) =>
    typeof message === "string" ? { state: { ...held, lid: message } } : { state: { ...held, note: message.value } },
  makeModel: (held) =>
    held.lid === "Opened"
      ? { _tag: "Opened" as const, note: held.note, close: "Closed" as const, typed: { _tag: "NoteTyped" } as const }
      : { _tag: "Closed" as const, open: "Opened" as const }
})

// Two steps, each with a field of its own, empty as it starts: Next leaves the first step, and what is typed into it,
// for the second, which a renderer may draw with the same element.
type Steps = Readonly<{ _tag: "First"; first: string }> | Readonly<{ _tag: "Second"; second: string }>
const stepsOf = program<{ state: Steps; message: "Next" | Typed<"FirstTyped"> | Typed<"SecondTyped"> }>()

export const steps = stepsOf.make({
  init: { state: { _tag: "First", first: "" } },
  update: (message) => (held) => {
    if (message === "Next") return held._tag === "First" ? { state: { _tag: "Second", second: "" } } : reject
    if (message._tag === "FirstTyped") {
      return held._tag === "First"
        ? { state: { ...held, first: message.value } }
        : reject
    }
    return held._tag === "Second" ? { state: { ...held, second: message.value } } : reject
  },
  makeModel: (held) =>
    held._tag === "First"
      ? { _tag: "First" as const, text: held.first, next: "Next" as const, typed: { _tag: "FirstTyped" } as const }
      : { _tag: "Second" as const, text: held.second, typed: { _tag: "SecondTyped" } as const }
})

// A note the program locks, which `update` no longer stores once locked. The model holds what is typed in both states,
// as a model that shows what `update` rejects does: the view draws the same field with the same handler in both, as a
// field drawn while an operation runs.
type Lock = Readonly<{ _tag: "Open"; text: string }> | Readonly<{ _tag: "Locked"; text: string }>
const lockOf = program<{ state: Lock; message: "Locked" | Typed<"TextTyped"> }>()

export const lock = lockOf.make({
  init: { state: { _tag: "Open", text: "" } },
  update: (message) => (held) =>
    held._tag === "Locked"
      ? reject
      : { state: message === "Locked" ? { _tag: "Locked", text: held.text } : { ...held, text: message.value } },
  makeModel: (held) =>
    held._tag === "Open"
      ? { _tag: "Open" as const, text: held.text, lock: "Locked" as const, typed: { _tag: "TextTyped" } as const }
      : { _tag: "Locked" as const, text: held.text, typed: { _tag: "TextTyped" } as const }
})

// A textarea, a select, a checkbox and a range, each of whose values is a message that `update` stores.
type Controls = Readonly<{ notes: string; choice: string; agreed: boolean; level: string }>
type Given = Typed<"NotesTyped"> | Typed<"ChoiceChosen"> | Typed<"AgreedChecked", boolean> | Typed<"LevelMoved">
const controlsOf = program<{ state: Controls; message: Given }>()

/** What each control gives, held without its value. */
const given = {
  notesTyped: { _tag: "NotesTyped" },
  choiceChosen: { _tag: "ChoiceChosen" },
  agreedChecked: { _tag: "AgreedChecked" },
  levelMoved: { _tag: "LevelMoved" }
} as const

const stored = <S extends Partial<Controls>>(held: S, message: Given): S => {
  switch (message._tag) {
    case "NotesTyped":
      return { ...held, notes: message.value }
    case "ChoiceChosen":
      return { ...held, choice: message.value }
    case "AgreedChecked":
      return { ...held, agreed: message.value }
    case "LevelMoved":
      return { ...held, level: message.value }
  }
}

export const controls = controlsOf.make({
  init: { state: { notes: "", choice: "tea", agreed: false, level: "50" } },
  update: (message) => (held) => ({ state: stored(held, message) }),
  makeModel: (held) => ({ ...held, ...given })
})

/**
 * The same controls and a group of two radios, `"small"` and `"large"`, which `update` stores only while it is open.
 * Its model holds what they give in both states, as a model that shows what `update` rejects does.
 */
type Gated = Controls & Readonly<{ _tag: "Open" | "Frozen"; size: string }>
const gatedOf = program<{ state: Gated; message: "Frozen" | Given | Typed<"SizeChosen"> }>()

export const gated = gatedOf.make({
  init: { state: { _tag: "Open", notes: "", choice: "tea", agreed: false, level: "50", size: "small" } },
  update: (message) => (held) => {
    if (held._tag === "Frozen") return reject
    if (message === "Frozen") return { state: { ...held, _tag: "Frozen" } }
    return { state: message._tag === "SizeChosen" ? { ...held, size: message.value } : stored(held, message) }
  },
  makeModel: (held) => ({
    ...held,
    ...given,
    freeze: held._tag === "Open" ? "Frozen" as const : undefined,
    sizeChosen: { _tag: "SizeChosen" } as const
  })
})

/** A source that belongs to the control, as a dictation that streams partial results: the control listens to it. */
export type Dictation = Readonly<{ listen: (listener: (text: string) => void) => () => void }>

const dictation = () => {
  const listeners = new Set<(text: string) => void>()
  return {
    listen: (listener: (text: string) => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    say: (text: string) => {
      // oxlint-disable-next-line unicorn/no-useless-spread -- a listener may add or remove one while it is told
      for (const listener of [...listeners]) listener(text)
    }
  }
}

export const setChecked = (input: HTMLInputElement, checked: boolean) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set?.call(input, checked)
  input.dispatchEvent(new Event("click", { bubbles: true }))
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))
}

export const choose = (select: HTMLSelectElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value)
  select.dispatchEvent(new Event("input", { bubbles: true }))
  select.dispatchEvent(new Event("change", { bubbles: true }))
}

export const typeArea = (area: HTMLTextAreaElement, text: string) => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(area, text)
  area.dispatchEvent(new Event("input", { bubbles: true }))
}

/** What a bridge's tests give the shared ones. */
export type Bridge<Node> = Readonly<{
  drawInto: DrawInto<Node>
  /**
   * Awaited after an act of the user, so that the bridge has drawn what it made. What a command answers is applied in
   * the command's fiber, once the scheduler lets it run, and drawn after: `paint`.
   */
  drawn: () => Promise<void>
  views: Readonly<{
    counter: View<Node, CounterModel, CounterMessage>
    form: View<Node, FormModel, FormMessage>
    /** As `../bridge.test_suite.ts` describes it, with a controlled `<input>`. */
    desk: View<Node, ModelOf<typeof desk>, MessageOf<typeof desk>>
    volume: View<Node, VolumeModel, VolumeMessage>
    /** The note's controlled `<input>`, alone. */
    note: View<Node, ModelOf<typeof note>, MessageOf<typeof note>>
    /** The note's controlled `<input>`, into which each result of `source` is put as a key is, and sent by it. */
    dictated: (source: Dictation) => View<Node, ModelOf<typeof note>, MessageOf<typeof note>>
    lid: View<Node, ModelOf<typeof lid>, MessageOf<typeof lid>>
    steps: View<Node, ModelOf<typeof steps>, MessageOf<typeof steps>>
    lock: View<Node, ModelOf<typeof lock>, MessageOf<typeof lock>>
    /** A `<textarea>`, a `<select>` of "tea", "coffee" and "water", a checkbox and an `<input type="range">`. */
    controls: View<Node, ModelOf<typeof controls>, MessageOf<typeof controls>>
    /**
     * The controls of `controls`, two radios of the group `size`, `"small"` then `"large"`, each sending its `value`
     * as it changes, then a Freeze button while open.
     */
    gated: View<Node, ModelOf<typeof gated>, MessageOf<typeof gated>>
  }>
}>

/** Declares the tests every bridge passes, drawn with `bridge`. */
export const bridgeTests = <Node>(bridge: Bridge<Node>) => {
  const paint = async () => {
    refresh()
    settle()
    await bridge.drawn()
  }
  const act = async (work: () => void) => {
    work()
    await bridge.drawn()
  }

  describe("drawInto", () => {
    test("a click on a drawn button reaches the program, and is drawn once the handler returns", async () => {
      mount(bridge.drawInto, bridge.views.counter, start(counter))
      settle()
      await bridge.drawn()
      expect(element("output").textContent).toBe("0")
      await act(() => button("+").click())
      expect(element("output").textContent).toBe("1")
      await act(() => button("−").click())
      expect(element("output").textContent).toBe("0")
    })

    // Whoever started the program stops the bridge, or does not: the run does not.
    test("a run that ends leaves the bridge drawing, and a state applied before the end is drawn after it", async () => {
      document.body.innerHTML = "<div id=\"app\"></div>"
      const { app, run } = start(counter)
      drawing(bridge.drawInto(element<HTMLElement>("#app"), { app, view: bridge.views.counter }))
      const fiber = forked(run)
      settle()
      await bridge.drawn()
      button("+").click()
      const ended = Effect.runPromise(Fiber.interrupt(fiber))
      settle()
      expect(fiber.pollUnsafe()).toBeDefined()
      await ended
      await bridge.drawn()
      expect([app.model().count, element("output").textContent]).toEqual([1, "1"])
    })
  })

  describe("the root", () => {
    // Starts the counter, draws it into `root`, which the test made where it wants it, and runs it.
    const startIn = async (root: HTMLElement) => {
      const { app, run } = start(counter)
      drawing(bridge.drawInto(root, { app, view: bridge.views.counter }))
      forked(run)
      settle()
      await bridge.drawn()
    }
    // What the view draws, found through `root`: its top element, alone in `root`.
    const drawnIn = (root: HTMLElement) => {
      const output = root.querySelector("output")
      if (output === null) throw new Error("Nothing is drawn in the root")
      return [root.children.length, output.textContent]
    }

    test("the view is drawn into the root, which stays where it is and holds nothing else", async () => {
      document.body.innerHTML = "<div id=\"app\"><p>Loading</p></div>"
      const root = element<HTMLElement>("#app")
      await startIn(root)
      expect([root.isConnected, root.querySelector("p")]).toEqual([true, null])
      expect(drawnIn(root)).toEqual([1, "0"])
      await act(() => button("+").click())
      expect(drawnIn(root)).toEqual([1, "1"])
    })

    test("a root with no parent is drawn into", async () => {
      document.body.innerHTML = ""
      const root = document.createElement("div")
      await startIn(root)
      expect(drawnIn(root)).toEqual([1, "0"])
    })

    test("a root drawn into by a program that was stopped is drawn into by the next one", async () => {
      document.body.innerHTML = "<div id=\"app\"></div>"
      const root = element<HTMLElement>("#app")
      await startIn(root)
      await act(() => button("+").click())
      await stop()
      await startIn(root)
      expect(drawnIn(root)).toEqual([1, "0"])
    })
  })

  describe("fields the user types into, controlled", () => {
    const mountForm = async (save: (name: string) => Effect.Effect<void, StorageError> = () => Effect.void) => {
      const saves: Array<string> = []
      const applied: Array<FormMessage["_tag"]> = []
      const ignored: Array<FormMessage["_tag"]> = []
      const storage = Storage.of({ save: (name) => Effect.andThen(Effect.sync(() => saves.push(name)), save(name)) })
      mount(
        bridge.drawInto,
        bridge.views.form,
        start(form, {
          onApplied: ({ message }) => void applied.push(message._tag),
          onIgnored: ({ message }) => void ignored.push(message._tag)
        }),
        Effect.provideService(Storage, storage)
      )
      settle()
      await bridge.drawn()
      return { saves, applied, ignored }
    }

    test("what is typed is stored, and the element keeps it with its focus and its caret", async () => {
      await mountForm()
      const input = element<HTMLInputElement>("input")
      input.focus()
      await act(() => type(input, "Ada"))
      input.setSelectionRange(1, 1)
      setValue(input, "Adda")
      input.setSelectionRange(2, 2)
      await act(() => input.dispatchEvent(new Event("input", { bubbles: true })))
      expect(element("input")).toBe(input)
      expect([input.value, input.selectionStart, input.selectionEnd]).toEqual(["Adda", 2, 2])
      expect(document.activeElement).toBe(input)
      expect(button("Save").disabled).toBe(false)
    })

    test("a name the program empties once saved is emptied in the field on screen, which stays and keeps the focus", async () => {
      await mountForm()
      const input = element<HTMLInputElement>("input")
      input.focus()
      await act(() => type(input, "Ada"))
      await act(() => button("Save").click())
      await paint()
      await paint()
      expect(element("input")).toBe(input)
      expect(input.value).toBe("")
      expect(document.activeElement).toBe(input)
      expect(element("li").textContent).toBe("Ada")
    })

    // Restated from "a second click on Save, before a frame is drawn for the first": the click is applied at once.
    test("a second click on Save in the same task is rejected while the save is under way", async () => {
      const { saves, applied, ignored } = await mountForm(() => Effect.never)
      await act(() => type(element<HTMLInputElement>("input"), "Ada"))
      const save = button("Save")
      save.click()
      save.dispatchEvent(new Event("click", { bubbles: true }))
      await bridge.drawn()
      settle()
      expect(saves).toEqual(["Ada"])
      expect(applied).toEqual(["NameTyped", "SaveClicked"])
      expect(ignored).toEqual(["SaveClicked"])
    })

    test("saves again once the save has failed, as a click on the model of the failure would", async () => {
      const { saves, applied } = await mountForm((name) => Effect.fail(new StorageError({ cause: name })))
      await act(() => type(element<HTMLInputElement>("input"), "Ada"))
      await act(() => button("Save").click())
      await paint()
      await paint()
      await act(() => button("Save").click())
      await paint()
      await paint()
      expect(saves).toEqual(["Ada", "Ada"])
      expect(applied).toEqual(["NameTyped", "SaveClicked", "SaveFailed", "SaveClicked", "SaveFailed"])
    })
  })

  describe("a field in a draft its parent starts again, and that brings itself back", () => {
    const mountDesk = async () => {
      mount(bridge.drawInto, bridge.views.desk, start(desk))
      settle()
      await bridge.drawn()
    }

    test("sent, the draft is emptied in the element on screen, which stays and keeps the focus", async () => {
      await mountDesk()
      const typedInto = element<HTMLInputElement>("input")
      typedInto.focus()
      await act(() => type(typedInto, "hello"))
      await act(() => button("Send").click())
      expect(state()).toEqual(["", "hello"])
      expect(element("input")).toBe(typedInto)
      expect(typedInto.value).toBe("")
      expect(document.activeElement).toBe(typedInto)
      await act(() => type(typedInto, "again"))
      expect(state()).toEqual(["again", "hello"])
    })

    test("a rejected click draws no tree again, and the element keeps what was typed", async () => {
      const app = mount(bridge.drawInto, bridge.views.desk, start(desk))
      settle()
      await bridge.drawn()
      const typedInto = element<HTMLInputElement>("input")
      await act(() => type(typedInto, "A"))
      const views = app.views()
      await act(() => button("Undo").click())
      expect(app.views()).toBe(views)
      expect(state()).toEqual(["A"])
      expect(typedInto.value).toBe("A")
    })

    test("a kept draft brought back as the very same state is shown by the element", async () => {
      await mountDesk()
      const typedInto = element<HTMLInputElement>("input")
      await act(() => type(typedInto, "Ada"))
      await act(() => button("Keep").click())
      await act(() => button("Discard").click())
      expect(typedInto.value).toBe("")
      await act(() => button("Undo").click())
      expect(state()).toEqual(["Ada"])
      expect(typedInto.value).toBe("Ada")
    })
  })

  describe("the sliders of the volume", () => {
    test("a press on the one the program draws starts a drag, whose moves set it", async () => {
      mount(
        bridge.drawInto,
        bridge.views.volume,
        start(volume),
        Effect.provideService(Pointer, Pointer.of({ moves: Stream.make(140, 164.4) }))
      )
      settle()
      await bridge.drawn()
      // happy-dom lays nothing out: the track says it lies from 100 to 200 across the page.
      const track = element(".track.ringer")
      track.getBoundingClientRect = () => DOMRect.fromRect({ x: 100, y: 0, width: 100, height: 10 })
      await act(() => track.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 120 })))
      expect(element("output.ringer").textContent).toBe("20")
      await paint()
      await paint()
      expect(element("output.ringer").textContent).toBe("64")
      expect(element<HTMLElement>(".track.ringer .fill").style.width).toBe("64%")
    })
  })

  describe("a value the program puts in a field", () => {
    const mountNote = async (view = bridge.views.note, noted: typeof note = note) => {
      const { app } = mount(bridge.drawInto, view, start(noted))
      settle()
      await bridge.drawn()
      return { note: () => app.model().note, send: app.dispatch }
    }

    test("a text typed in its middle keeps the focus, the caret and the selection of the field", async () => {
      await mountNote()
      const typed = element<HTMLInputElement>("input")
      typed.focus()
      await act(() => type(typed, "Ada"))
      typed.setSelectionRange(1, 1)
      setValue(typed, "Adda")
      typed.setSelectionRange(2, 2)
      await act(() => typed.dispatchEvent(new Event("input", { bubbles: true })))
      expect([typed.value, typed.selectionStart, typed.selectionEnd]).toEqual(["Adda", 2, 2])
      typed.setSelectionRange(1, 3)
      await paint()
      expect(element("input")).toBe(typed)
      expect(document.activeElement).toBe(typed)
      expect([typed.selectionStart, typed.selectionEnd]).toEqual([1, 3])
    })

    test("is shown by the element on screen, which stays and keeps the focus", async () => {
      const app = await mountNote()
      const typed = element<HTMLInputElement>("input")
      await act(() => type(typed, "Ada"))
      typed.focus()
      app.send("Cleared")
      await paint()
      expect(element("input")).toBe(typed)
      expect(typed.value).toBe("")
      expect(document.activeElement).toBe(typed)
    })

    test("a text typed that the element did not send is shown by it too, and the next key replaces it", async () => {
      const app = await mountNote()
      const typed = element<HTMLInputElement>("input")
      await act(() => type(typed, "Hel"))
      app.send({ _tag: "NoteTyped", value: "SCAN" })
      await paint()
      expect(typed.value).toBe("SCAN")
      await act(() => type(typed, "SCANs"))
      expect(app.note()).toBe("SCANs")
    })

    // Where the caret goes once the element is given another value than the one typed is the browser's, and is not
    // checked.
    test("a value stored in another form than the one typed is shown by the element at once, which keeps the focus", async () => {
      const app = await mountNote(bridge.views.note, shouted)
      const typed = element<HTMLInputElement>("input")
      typed.focus()
      await act(() => type(typed, "ada"))
      expect([app.note(), typed.value]).toEqual(["ADA", "ADA"])
      expect(element("input")).toBe(typed)
      expect(document.activeElement).toBe(typed)
      await act(() => type(typed, "ADAl"))
      expect([app.note(), typed.value]).toEqual(["ADAL", "ADAL"])
    })

    // A bridge draws after each message its view sends, whether or not the state changed, as after a message rejected.
    test("a key whose stored form is the value held makes no new state, and the element is given its value back", async () => {
      const { app } = mount(bridge.drawInto, bridge.views.note, start(shouted))
      settle()
      await bridge.drawn()
      const typed = element<HTMLInputElement>("input")
      typed.focus()
      await act(() => type(typed, "ada"))
      let notices = 0
      const stop = app.subscribe(() => {
        notices += 1
      })
      await act(() => type(typed, "AdA"))
      expect([app.model().note, typed.value]).toEqual(["ADA", "ADA"])
      expect(notices).toBe(0)
      expect(document.activeElement).toBe(typed)
      stop()
    })

    // An alarm of what the guide leaves unspecified ("Writing a bridge", "What is left out", a value the element
    // changes by itself): an `<input>` strips the line breaks of what it is given (HTML, the value sanitization
    // algorithm of `type=text`). It shows the stripped value until the next key, which is stored. It is the killer of
    // no mutation.
    test("a value with a line break, which the field strips, is shown stripped, and the next key is stored", async () => {
      const app = await mountNote()
      const typed = element<HTMLInputElement>("input")
      app.send({ _tag: "NoteTyped", value: "a\nb" })
      await paint()
      expect(typed.value).toBe("ab")
      await act(() => type(typed, "abc"))
      expect(app.note()).toBe("abc")
    })

    describe("a source that belongs to the control, as a dictation that streams partial results", () => {
      test("each result is shown by the field on screen, which keeps the focus, and is stored", async () => {
        const source = dictation()
        const app = await mountNote(bridge.views.dictated(source))
        const typed = element<HTMLInputElement>("input")
        await act(() => type(typed, "Note: "))
        typed.focus()
        await act(() => source.say("Note: hel"))
        await act(() => source.say("Note: hello"))
        expect(element("input")).toBe(typed)
        expect(document.activeElement).toBe(typed)
        expect(typed.value).toBe("Note: hello")
        expect(app.note()).toBe("Note: hello")
        await act(() => type(typed, "Note: hello!"))
        expect(app.note()).toBe("Note: hello!")
      })

      test("after the program empties the field, the results go on into the same element, and are stored", async () => {
        const source = dictation()
        const app = await mountNote(bridge.views.dictated(source))
        const typed = element<HTMLInputElement>("input")
        await act(() => source.say("Ada"))
        app.send("Cleared")
        await paint()
        expect(typed.value).toBe("")
        await act(() => source.say("Bob"))
        expect(element("input")).toBe(typed)
        expect(typed.value).toBe("Bob")
        expect(app.note()).toBe("Bob")
      })
    })
  })

  describe("a field to type into in the place of a plain field, and back", () => {
    const mountLid = async (flags: "Opened" | "Closed") => {
      mount(bridge.drawInto, bridge.views.lid, start(lid, { flags }))
      settle()
      await bridge.drawn()
    }

    test("the field drawn in a plain field's place shows the program's value, and what is typed is stored", async () => {
      await mountLid("Closed")
      expect(element<HTMLInputElement>("input").value).toBe("Closed")
      await act(() => button("Open").click())
      const typedInto = element<HTMLInputElement>("input")
      expect(typedInto.value).toBe("draft")
      await act(() => type(typedInto, "draft!"))
      expect(state()).toEqual(["draft!"])
      expect(typedInto.value).toBe("draft!")
    })

    test("the plain field drawn in the place of the field to type into is left as the view draws it", async () => {
      await mountLid("Opened")
      const typedInto = element<HTMLInputElement>("input")
      await act(() => type(typedInto, "Ada!"))
      await act(() => button("Close").click())
      expect(element<HTMLInputElement>("input").value).toBe("Closed")
      await act(() => button("Open").click())
      expect(element<HTMLInputElement>("input").value).toBe("Ada!")
      expect(state()).toEqual(["Ada!"])
    })
  })

  // Restated: Next is applied and drawn at once, so no key for the first step can reach the run after it.
  describe("a field in the place of another field", () => {
    test("after Next, the element is the second step's field, empty, and what is typed is stored there", async () => {
      mount(bridge.drawInto, bridge.views.steps, start(steps))
      settle()
      await bridge.drawn()
      const typedInto = element<HTMLInputElement>("input")
      await act(() => type(typedInto, "A"))
      await act(() => button("Next").click())
      expect(state()).toEqual([""])
      expect(element<HTMLInputElement>("input").value).toBe("")
      await act(() => type(element<HTMLInputElement>("input"), "B"))
      expect(state()).toEqual(["B"])
    })
  })

  // What is typed that `update` rejects leaves the very same state: no new state, and the element shows the model's
  // value again.
  describe("a field that update no longer stores", () => {
    test("a key typed once it is locked is rejected, and the element shows the program's value again at once", async () => {
      const app = mount(bridge.drawInto, bridge.views.lock, start(lock))
      settle()
      await bridge.drawn()
      const typedInto = element<HTMLInputElement>("input")
      await act(() => type(typedInto, "Ada"))
      await act(() => button("Lock").click())
      const views = app.views()
      await act(() => type(typedInto, "Ada!"))
      expect(app.views()).toBe(views)
      expect(element("input")).toBe(typedInto)
      expect(state()).toEqual(["Ada"])
      expect(typedInto.value).toBe("Ada")
    })
  })

  describe("controlled elements of other kinds", () => {
    const mountControls = async () => {
      const { app } = mount(bridge.drawInto, bridge.views.controls, start(controls))
      settle()
      await bridge.drawn()
      return app.model
    }

    test("a textarea keeps what is typed, with its caret, and stores it", async () => {
      const model = await mountControls()
      const area = element<HTMLTextAreaElement>("textarea")
      area.focus()
      await act(() => typeArea(area, "one\ntwo"))
      area.setSelectionRange(2, 2)
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(area, "on!e\ntwo")
      area.setSelectionRange(3, 3)
      await act(() => area.dispatchEvent(new Event("input", { bubbles: true })))
      expect([area.value, model().notes]).toEqual(["on!e\ntwo", "on!e\ntwo"])
      expect([area.selectionStart, area.selectionEnd]).toEqual([3, 3])
      expect(document.activeElement).toBe(area)
    })

    test("a select stores what is chosen, and shows it", async () => {
      const model = await mountControls()
      const select = element<HTMLSelectElement>("select")
      expect(select.value).toBe("tea")
      await act(() => choose(select, "coffee"))
      expect([select.value, model().choice]).toEqual(["coffee", "coffee"])
    })

    test("a checkbox stores what is checked, and shows it", async () => {
      const model = await mountControls()
      const box = element<HTMLInputElement>("input[type=checkbox]")
      await act(() => setChecked(box, true))
      expect([box.checked, model().agreed]).toEqual([true, true])
      await act(() => setChecked(box, false))
      expect([box.checked, model().agreed]).toEqual([false, false])
    })

    test("a range stores where it is moved, and shows it", async () => {
      const model = await mountControls()
      const range = element<HTMLInputElement>("input[type=range]")
      expect(range.value).toBe("50")
      await act(() => type(range, "70"))
      expect([range.value, model().level]).toEqual(["70", "70"])
    })

    test("once frozen, a key in the textarea and a click on the checkbox are rejected, and both show the model again", async () => {
      mount(bridge.drawInto, bridge.views.gated, start(gated))
      settle()
      await bridge.drawn()
      const area = element<HTMLTextAreaElement>("textarea")
      const box = element<HTMLInputElement>("input[type=checkbox]")
      await act(() => typeArea(area, "kept"))
      await act(() => button("Freeze").click())
      await act(() => typeArea(area, "kept!"))
      await act(() => setChecked(box, true))
      expect([area.value, box.checked]).toEqual(["kept", false])
    })

    // A radio checked unchecks the other of its group by itself (HTML, "the radio button group"): both are given the
    // model's back.
    test("once frozen, a choice in the select, a move of the range and a radio checked are rejected, and each shows the model again", async () => {
      mount(bridge.drawInto, bridge.views.gated, start(gated))
      settle()
      await bridge.drawn()
      const select = element<HTMLSelectElement>("select")
      const range = element<HTMLInputElement>("input[type=range]")
      const small = element<HTMLInputElement>("input[value=small]")
      const large = element<HTMLInputElement>("input[value=large]")
      await act(() => button("Freeze").click())
      await act(() => choose(select, "coffee"))
      await act(() => type(range, "70"))
      await act(() => setChecked(large, true))
      expect([select.value, range.value, small.checked, large.checked]).toEqual(["tea", "50", true, false])
    })
  })

  // A gap of 16 November 2026 (`docs/rejected.md`, "The bridges"), closed for both bridges.
  describe("a root in a shadow tree", () => {
    test("what is typed into a field drawn in a shadow root is stored, and shown", async () => {
      document.body.innerHTML = "<div id=\"host\"></div>"
      const shadow = element("#host").attachShadow({ mode: "open" })
      shadow.innerHTML = "<div id=\"app\"></div>"
      const root = shadow.getElementById("app") as HTMLElement
      const { app, run } = start(note)
      drawing(bridge.drawInto(root, { app, view: bridge.views.note }))
      forked(run)
      settle()
      await bridge.drawn()
      const input = root.querySelector("input")
      if (input === null) throw new Error("Nothing is drawn in the shadow root")
      await act(() => type(input, "Ada"))
      expect([input.value, app.model().note]).toEqual(["Ada", "Ada"])
    })
  })
}
