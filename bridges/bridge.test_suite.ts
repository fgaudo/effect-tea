// The tests every bridge passes, in a DOM, whatever its renderer: a bridge's test file registers the DOM, holds its
// screen refreshes (`holdFrames`) and calls `bridgeTests` with what its renderer draws the scenarios with, a `Bridge`.
// What the other tests cannot see: how often `renderInto` draws, that a click on a drawn button reaches the program,
// what a second click on it does before the next frame is drawn,
// and how the bridge settles each input with a frame by the library's rule: what the user types survives the frames
// drawn while they type, with its focus, caret and selection, a frame that has not seen a key leaves the element alone,
// and a value the program puts in an input's place is shown by the same element once a frame has seen its keys, as a
// save that completes within one screen refresh empties the input under a late key once the key is rejected. An
// element the renderer draws in turn as an input and as a plain field shows the input only while it is one. A slider
// the program draws listens to a drag. A source that belongs to the control writes through the element on screen, as
// the user's edit, with the whole value. A `.test_suite.ts`, a file that serves the tests, not a `*.test.ts`:
// `bun test` does not run it by itself, and it runs in the file of each bridge that calls it, under that file's name.
import { type Dispatch, type Frame, type MessageOf, type ModelOf, program, reject, run } from "@fgaudo/effect-tea"
import { describe, expect, test } from "bun:test"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Optic from "effect/Optic"
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
// snabbdom patches synchronously, and React's bridge draws each frame with `flushSync`, which commits it and runs its
// ref callbacks before it returns. What a run waits for outside Effect's scheduler (`Effect.sleep`, a promise) is not held: a
// test controls it by its own means (`TestClock`, a `Deferred`).
const held = new Set<() => void>()
const scheduler = new Scheduler.MixedScheduler("async", (task) => {
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

/** One screen refresh: the renderer resumes in its callback, and draws the latest frame at once. */
export const refresh = () => {
  const due = [...waiting.values()]
  waiting.clear()
  for (const callback of due) callback(performance.now())
}

/** One screen refresh, then what follows from it. */
export const paint = () => {
  refresh()
  settle()
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

let running: Fiber.Fiber<void> | undefined

/** Ends the run `mount` started, if any, and forgets the refreshes it waits for: called in `afterEach`. */
export const stop = async () => {
  if (running !== undefined) {
    // The run ends on the held scheduler too: what its interruption does is let through before it is awaited.
    const ended = Effect.runPromise(Fiber.interrupt(running))
    settle()
    await ended
  }
  running = undefined
  waiting.clear()
}

/** A view of a program, drawn by a renderer whose trees are `Node`s. */
export type View<Node, Model, Message> = (model: Model, dispatch: Dispatch<Message>) => Node

/** A bridge's `renderInto`. */
export type RenderInto<Node> = <Model, Message>(
  root: HTMLElement,
  view: View<Node, Model, Message>
) => (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void>

/** How a test starts a program: `run`, with what it needs, and the renderer it is given. */
export type Start<Model, Message> = (
  render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void>
) => Effect.Effect<void>

/**
 * Starts a program drawn by `renderInto` with `view` into a fresh page, whose `#app` is the root and whose `#aside` is
 * for what a renderer can draw outside it; `views` counts the trees drawn, one per frame.
 */
export const mount = <Node, Model, Message>(
  renderInto: RenderInto<Node>,
  view: View<Node, Model, Message>,
  start: Start<Model, Message>
) => {
  document.body.innerHTML = "<div id=\"app\"></div><div id=\"aside\"></div>"
  const root = document.getElementById("app") as HTMLElement
  let views = 0
  running = Effect.runFork(
    start(renderInto(root, (model, dispatch) => {
      views += 1
      return view(model, dispatch)
    })),
    { scheduler }
  )
  return { views: () => views }
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

// A draft its parent starts again once sent, keeps, and brings back as the very same state.
type Own = "SendClicked" | "DiscardClicked"
type Sent = Readonly<{ _tag: "Sent"; text: string }>
type Draft = Readonly<{ text: string }>
type Desk = Readonly<{ draft: Draft; kept: Opt.Option<Draft>; sent: ReadonlyArray<string> }>
const draftOf = program<{ state: Draft; event: Sent; message: Own }>()

export const draft = draftOf.make({
  init: { state: { text: "" } },
  inputs: { Text: draftOf.input({ at: Optic.id<Draft>().key("text") }) },
  update: (message: Own) => (held) =>
    message === "DiscardClicked"
      ? { state: { text: "" } }
      : held.text === ""
      ? reject
      : { state: held, events: [{ _tag: "Sent", text: held.text }] },
  makeModel: (held) => held
})

const deskOf = program<{ state: Desk; message: "Kept" | "Undone" }>()

export const desk = deskOf.make({
  init: (children) => ({ state: { draft: children.Draft.init.state, kept: Opt.none(), sent: [] } }),
  children: { Draft: deskOf.child(draft, { at: Optic.id<Desk>().key("draft") }) },
  update: (message: "Kept" | "Undone") => (held) =>
    message === "Kept"
      ? { state: { ...held, kept: Opt.some(held.draft) } }
      : Opt.match(held.kept, { onNone: () => reject, onSome: (kept) => ({ state: { ...held, draft: kept } }) }),
  onEvent: {
    // Sent, the draft is started again: the state its parent puts back is the one it starts with.
    Draft: (event, children) => (held) => ({
      state: { ...held, draft: children.Draft.init.state, sent: [...held.sent, event.text] }
    })
  },
  makeModel: (held, children) => ({ draft: children.Draft(held), sent: held.sent })
})

// A note the program clears on a message that no control drawn sends, as a source that exists whatever is drawn
// would.
type Note = Readonly<{ note: string }>
const noteOf = program<{ state: Note; message: "Cleared" }>()

export const note = noteOf.make({
  init: { state: { note: "" } },
  inputs: { Note: noteOf.input({ at: Optic.id<Note>().key("note") }) },
  update: (_: "Cleared") => () => ({ state: { note: "" } }),
  makeModel: (state) => state.note
})

// A note behind a lid, which starts open or closed: open, it is drawn by its input; closed, a plain field that is no
// input of the program stands in the input's place, which a renderer may draw with the same element.
type Lid = Readonly<{ note: string; lid: "Opened" | "Closed" }>
const lidOf = program<{ state: Lid; flags: Lid["lid"]; message: "Opened" | "Closed" }>()

export const lid = lidOf.make({
  init: (lid) => ({ state: { note: "draft", lid } }),
  inputs: { Note: lidOf.input({ at: Optic.id<Lid>().key("note") }) },
  update: (message: "Opened" | "Closed") => (held) => ({ state: { ...held, lid: message } }),
  makeModel: (held) =>
    held.lid === "Opened"
      ? { _tag: "Opened" as const, note: held.note, close: "Closed" as const }
      : { _tag: "Closed" as const, open: "Opened" as const }
})

// Two steps, each with an input of its own, empty as it starts: Next leaves the first step, and its input's place, for
// the second, which a renderer may draw with the same element.
type Steps = Readonly<{ _tag: "First"; first: string }> | Readonly<{ _tag: "Second"; second: string }>
const stepsOf = program<{ state: Steps; message: "Next" }>()

export const steps = stepsOf.make({
  init: { state: { _tag: "First", first: "" } },
  inputs: {
    First: stepsOf.input({ at: Optic.id<Steps>().tag("First").key("first") }),
    Second: stepsOf.input({ at: Optic.id<Steps>().tag("Second").key("second") })
  },
  update: (_: "Next") => (held) => held._tag === "First" ? { state: { _tag: "Second", second: "" } } : reject,
  makeModel: (held) =>
    held._tag === "First"
      ? { _tag: "First" as const, text: held.first, next: "Next" as const }
      : { _tag: "Second" as const, text: held.second }
})

// A note the program locks, whose input's place the locked state no longer holds: the view draws the same input
// through the same dispatch in both states, as a field drawn while an operation runs.
type Lock = Readonly<{ _tag: "Open"; text: string }> | Readonly<{ _tag: "Locked"; text: string }>
const lockOf = program<{ state: Lock; message: "Locked" }>()

export const lock = lockOf.make({
  init: { state: { _tag: "Open", text: "" } },
  inputs: { Text: lockOf.input({ at: Optic.id<Lock>().tag("Open").key("text") }) },
  update: (_: "Locked") => (held) => held._tag === "Open" ? { state: { _tag: "Locked", text: held.text } } : reject,
  makeModel: (held) =>
    held._tag === "Open"
      ? { _tag: "Open" as const, text: held.text, lock: "Locked" as const }
      : { _tag: "Locked" as const, text: held.text }
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

/** What a bridge's tests give the shared ones: its `renderInto`, and the views of their scenarios, drawn with it. */
export type Bridge<Node> = Readonly<{
  renderInto: RenderInto<Node>
  views: Readonly<{
    /** `counter`'s view, of the example. */
    counter: View<Node, CounterModel, CounterMessage>
    /** `form`'s view, of the example. */
    form: View<Node, FormModel, FormMessage>
    /**
     * The draft's input, Send and Discard buttons, and its text in an `<output>`, in a `<form>`; then Keep and Undo
     * buttons, and the texts sent, an `<li>` each.
     */
    desk: View<Node, ModelOf<typeof desk>, MessageOf<typeof desk>>
    /** `volume`'s view, with the ringer the program draws at least: `.track.ringer`, `.fill`, `output.ringer`. */
    volume: View<Node, VolumeModel, VolumeMessage>
    /** The note's input, alone. */
    note: View<Node, ModelOf<typeof note>, MessageOf<typeof note>>
    /** The note's input, which puts each result of `source` into the element on screen, as a key is. */
    dictated: (source: Dictation) => View<Node, ModelOf<typeof note>, MessageOf<typeof note>>
    /**
     * Open, the note's input, a Close button and the note in an `<output>`; closed, in the input's place a plain
     * `<input>` that is no input of the program, read-only and showing "Closed", and an Open button.
     */
    lid: View<Node, ModelOf<typeof lid>, MessageOf<typeof lid>>
    /**
     * The input of the step drawn, first in its parent, then a Next button on the first step, and the step's text in an
     * `<output>`.
     */
    steps: View<Node, ModelOf<typeof steps>, MessageOf<typeof steps>>
    /** The note's input, through the same dispatch in both states, a Lock button while open, and its text in an `<output>`. */
    lock: View<Node, ModelOf<typeof lock>, MessageOf<typeof lock>>
  }>
}>

/** The tests of an input in the desk's draft: a describe of its own, which a renderer may run in more than one mode. */
export const draftTests = <Node>(bridge: Bridge<Node>) =>
  describe("an input in a draft its parent starts again, and brings back", () => {
    const mountDesk = () => mount(bridge.renderInto, bridge.views.desk, (render) => run(desk, render))

    test("a frame that has not seen a key sent before it was drawn leaves the element as it is", () => {
      mountDesk()
      settle()
      const typedInto = element<HTMLInputElement>("input")
      // A frame waits for the screen refresh; the key is sent, and the refresh draws that frame before the run takes
      // the key: the callback of the refresh resumes the renderer at once.
      button("Keep").click()
      settle()
      type(typedInto, "A")
      refresh()
      expect(typedInto.value).toBe("A")
      paint()
      expect(state()).toEqual(["A"])
      expect(typedInto.value).toBe("A")
    })

    test("sent, the draft is emptied in the element on screen, which stays and keeps the focus", () => {
      mountDesk()
      settle()
      const typedInto = element<HTMLInputElement>("input")
      typedInto.focus()
      type(typedInto, "hello")
      paint()
      button("Send").click()
      paint()
      expect(state()).toEqual(["", "hello"])
      expect(element("input")).toBe(typedInto)
      expect(typedInto.value).toBe("")
      expect(document.activeElement).toBe(typedInto)
      // What is typed next is typed over the empty text, and stored: the element itself was emptied.
      type(typedInto, "again")
      paint()
      expect(state()).toEqual(["again", "hello"])
    })

    test("a key typed after Send, before the emptied draft is drawn, is rejected, and the element is emptied", () => {
      mountDesk()
      settle()
      const typedInto = element<HTMLInputElement>("input")
      type(typedInto, "hello")
      paint()
      button("Send").click()
      // The frame on screen still shows "hello": the key is written over it.
      type(typedInto, "hello!")
      paint()
      expect(state()).toEqual(["", "hello"])
      expect(typedInto.value).toBe("")
      button("Send").click()
      paint()
      expect(state()).toEqual(["", "hello"])
    })

    test("a rejected click draws its frame without drawing its tree again, and the element keeps what was typed", () => {
      const app = mountDesk()
      settle()
      const typedInto = element<HTMLInputElement>("input")
      type(typedInto, "A")
      paint()
      expect(app.views()).toBe(2)
      // Nothing is kept: Undo is rejected, and its frame holds the very same state, and the very same model.
      button("Undo").click()
      paint()
      expect(app.views()).toBe(2)
      expect(state()).toEqual(["A"])
      expect(typedInto.value).toBe("A")
      type(typedInto, "Ad")
      paint()
      expect(app.views()).toBe(3)
      expect(state()).toEqual(["Ad"])
    })

    test(
      "a kept draft brought back as the very same state is shown by the element",
      () => {
        mountDesk()
        settle()
        const typedInto = element<HTMLInputElement>("input")
        type(typedInto, "Ada")
        button("Keep").click()
        paint()
        // Within one screen refresh: the draft is discarded, a key is typed over what the screen still shows, and
        // the kept draft comes back. The key is rejected, and the draft's state is the object drawn last.
        button("Discard").click()
        type(typedInto, "Adam")
        button("Undo").click()
        paint()
        expect(state()).toEqual(["Ada"])
        expect(typedInto.value).toBe("Ada")
      }
    )
  })

/** Declares the tests every bridge passes, drawn with `bridge`. */
export const bridgeTests = <Node>(bridge: Bridge<Node>) => {
  describe("renderInto", () => {
    test("draws the first frame at once, then at most once per screen refresh, the latest frame", () => {
      const app = mount(bridge.renderInto, bridge.views.counter, (render) => run(counter, render))
      settle()
      expect(app.views()).toBe(1)
      expect(element("output").textContent).toBe("0")
      for (let click = 0; click < 5; click += 1) {
        button("+").click()
        settle()
      }
      expect(app.views()).toBe(1)
      expect(element("output").textContent).toBe("0")
      paint()
      expect(app.views()).toBe(2)
      expect(element("output").textContent).toBe("5")
      paint()
      expect(app.views()).toBe(2)
    })

    test("a click on a drawn button reaches the program, and the next refresh shows it", () => {
      mount(bridge.renderInto, bridge.views.counter, (render) => run(counter, render))
      settle()
      button("+").click()
      paint()
      expect(element("output").textContent).toBe("1")
      button("−").click()
      paint()
      expect(element("output").textContent).toBe("0")
    })
  })

  describe("inputs the user types into", () => {
    const saving = Storage.of({ save: () => Effect.void })
    const mountForm = () =>
      mount(
        bridge.renderInto,
        bridge.views.form,
        (render) => run(form, render).pipe(Effect.provideService(Storage, saving))
      )

    test("a frame drawn while the user types does not take back what they typed since", () => {
      mountForm()
      settle()
      const input = element<HTMLInputElement>("input")
      type(input, "A")
      settle()
      // The next key is in the input before its message reaches the program: the frame drawn now knows only "A".
      setValue(input, "Ad")
      paint()
      expect(element("input")).toBe(input)
      expect(input.value).toBe("Ad")
      expect(button("Save")).toBeDefined()
    })

    // As an extension that fills forms writes: through the element's `value`, past nothing a renderer may put on it.
    test("a text a script writes into the input, and announces with an input event, is stored", () => {
      mountForm()
      settle()
      const input = element<HTMLInputElement>("input")
      input.value = "Ada"
      input.dispatchEvent(new Event("input", { bubbles: true }))
      paint()
      button("Save").click()
      paint()
      paint()
      expect(element("li").textContent).toBe("Ada")
    })

    test("a name the program empties is emptied in the input on screen, which stays and keeps the focus", () => {
      mountForm()
      settle()
      const input = element<HTMLInputElement>("input")
      input.focus()
      type(input, "Ada")
      paint()
      button("Save").click()
      paint()
      paint()
      expect(element("input")).toBe(input)
      expect(input.value).toBe("")
      expect(document.activeElement).toBe(input)
      expect(element("li").textContent).toBe("Ada")
    })

    describe("a key typed into the input drawn before a save completed", () => {
      // A storage that answers at once: the user types "Ada" and clicks Save, and the save completes within one screen
      // refresh of the click, so `Saving` is never drawn. The screen still shows "Ada", enabled, and the user types one
      // more key into it.
      const savedWithinOneFrame = () => {
        const applied: Array<FormMessage["_tag"]> = []
        const ignored: Array<FormMessage["_tag"]> = []
        mount(bridge.renderInto, bridge.views.form, (render) =>
          run(form, render, {
            onApplied: ({ message }) => void applied.push(message._tag),
            onIgnored: ({ message }) => void ignored.push(message._tag)
          }).pipe(Effect.provideService(Storage, saving)))
        settle()
        const input = element<HTMLInputElement>("input")
        type(input, "Ada")
        paint()
        button("Save").click()
        settle()
        expect(applied).toEqual(["Name", "SaveClicked", "SaveSucceeded"])
        expect([input.value, input.disabled, button("Save").disabled]).toEqual(["Ada", false, false])
        type(input, "Ada x")
        return { input, applied, ignored }
      }

      // The order when the run's loop wakes before the browser's next rendering: the key reaches the program first.
      test("is rejected, and the input on screen is emptied, as the save left it", () => {
        const { input, applied, ignored } = savedWithinOneFrame()
        settle()
        expect(ignored).toEqual(["Name"])
        paint()
        expect(element("input")).toBe(input)
        expect(input.value).toBe("")
        expect(element("li").textContent).toBe("Ada")
        expect(applied).toEqual(["Name", "SaveClicked", "SaveSucceeded"])
      })

      // The order when the browser renders between the task of the key and the task that wakes the run's loop: a
      // dispatch only queues the message, and the renderer resumes in the callback of the refresh, at once.
      test("is shown until it is rejected, and the input on screen is then emptied, which offers no save", () => {
        const { input, applied, ignored } = savedWithinOneFrame()
        refresh()
        // Drawn before the loop has taken the key: the frame has not seen the key, so the input keeps it.
        expect(input.value).toBe("Ada x")
        expect(ignored).toEqual([])
        settle()
        expect(ignored).toEqual(["Name"])
        // The frame of the rejection has seen the key, and gives the input the empty name.
        paint()
        // The state is what the screen shows: an empty input, and nothing to save.
        expect(element("input")).toBe(input)
        expect(input.value).toBe("")
        expect(button("Save").disabled).toBe(true)
        expect(element("li").textContent).toBe("Ada")
        expect(applied).toEqual(["Name", "SaveClicked", "SaveSucceeded"])
      })
    })
  })

  // The screen has not caught up: a slow frame, a frozen page. Both clicks are on the button of the one frame drawn.
  describe("a second click on \"Save\", before a frame is drawn for the first", () => {
    const mountNamed = (save: (name: string) => Effect.Effect<void, StorageError>) => {
      const saves: Array<string> = []
      const applied: Array<FormMessage["_tag"]> = []
      const ignored: Array<FormMessage["_tag"]> = []
      const storage = Storage.of({ save: (name) => Effect.andThen(Effect.sync(() => saves.push(name)), save(name)) })
      mount(bridge.renderInto, bridge.views.form, (render) =>
        run(form, render, {
          onApplied: ({ message }) => void applied.push(message._tag),
          onIgnored: ({ message }) => void ignored.push(message._tag)
        }).pipe(Effect.provideService(Storage, storage)))
      settle()
      type(element<HTMLInputElement>("input"), "Ada")
      paint()
      return { saves, applied, ignored }
    }
    const underWay = () => Deferred.await(Deferred.makeUnsafe<void>())

    // The order when both clicks are delivered before the run's loop wakes.
    test("is rejected while the save is under way, when the run has taken neither click", () => {
      const { saves, applied, ignored } = mountNamed(underWay)
      const save = button("Save")
      save.click()
      save.click()
      settle()
      expect(saves).toEqual(["Ada"])
      expect(applied).toEqual(["Name", "SaveClicked"])
      expect(ignored).toEqual(["SaveClicked"])
    })

    // The order when the run's loop wakes between the two clicks: the form is saving, and the screen does not say so.
    test("is rejected while the save is under way, when the run has taken the first click", () => {
      const { saves, applied, ignored } = mountNamed(underWay)
      const save = button("Save")
      save.click()
      settle()
      expect([button("Save"), save.disabled]).toEqual([save, false])
      save.click()
      settle()
      expect(saves).toEqual(["Ada"])
      expect(applied).toEqual(["Name", "SaveClicked"])
      expect(ignored).toEqual(["SaveClicked"])
    })

    test("is rejected once the save has succeeded, which left a blank name", () => {
      const { saves, applied, ignored } = mountNamed(() => Effect.void)
      const save = button("Save")
      save.click()
      settle()
      save.click()
      settle()
      expect(saves).toEqual(["Ada"])
      expect(applied).toEqual(["Name", "SaveClicked", "SaveSucceeded"])
      expect(ignored).toEqual(["SaveClicked"])
    })

    // A message is applied where it applies, whichever frame it was sent from: the form that failed takes a save.
    test("saves again once the save has failed, as a click on the frame of the failure would", () => {
      const { saves, applied, ignored } = mountNamed((name) => Effect.fail(new StorageError({ cause: name })))
      const save = button("Save")
      save.click()
      settle()
      save.click()
      settle()
      expect(saves).toEqual(["Ada", "Ada"])
      expect(applied).toEqual(["Name", "SaveClicked", "SaveFailed", "SaveClicked", "SaveFailed"])
      expect(ignored).toEqual([])
    })
  })

  draftTests(bridge)

  describe("the sliders of the volume", () => {
    test(
      "a press on the one the program draws starts a drag, whose moves set it until the pointer is released",
      () => {
        mount(
          bridge.renderInto,
          bridge.views.volume,
          (render) =>
            run(volume, render).pipe(Effect.provideService(Pointer, Pointer.of({ moves: Stream.make(40, 64.4) })))
        )
        settle()
        element(".track.ringer").dispatchEvent(new Event("pointerdown", { bubbles: true }))
        paint()
        paint()
        expect(element("output.ringer").textContent).toBe("64")
        expect(element<HTMLElement>(".track.ringer .fill").style.width).toBe("64%")
      }
    )
  })

  describe("a value the program puts in an input's place", () => {
    const mountNote = (view = bridge.views.note) => {
      let drawn: Readonly<{ model: ModelOf<typeof note>; dispatch: Dispatch<MessageOf<typeof note>> }> | undefined
      mount(bridge.renderInto, (model: ModelOf<typeof note>, dispatch: Dispatch<MessageOf<typeof note>>) => {
        drawn = { model, dispatch }
        return view(model, dispatch)
      }, (render) => run(note, render))
      const last = () => {
        if (drawn === undefined) throw new Error("No frame is drawn")
        return drawn
      }
      return {
        note: () => last().model,
        send: (message: MessageOf<typeof note>) => Effect.runSync(last().dispatch(message))
      }
    }

    test("a frame drawn while the user types keeps the focus, the caret and the selection of the input", () => {
      mountNote()
      settle()
      const typed = element<HTMLInputElement>("input")
      type(typed, "Ada")
      typed.focus()
      typed.setSelectionRange(1, 3)
      paint()
      expect(element("input")).toBe(typed)
      expect(document.activeElement).toBe(typed)
      expect([typed.selectionStart, typed.selectionEnd]).toEqual([1, 3])
    })

    test("is shown by the element on screen, which stays and keeps the focus", () => {
      const app = mountNote()
      settle()
      const typed = element<HTMLInputElement>("input")
      type(typed, "Ada")
      typed.focus()
      paint()
      app.send("Cleared")
      paint()
      expect(element("input")).toBe(typed)
      expect(typed.value).toBe("")
      expect(document.activeElement).toBe(typed)
    })

    // What a scanner would send if it could write: the bridge cannot tell it from a step of the program, and shows it.
    test("a write the element did not make is shown by it too, and the next key is written over it", () => {
      const app = mountNote()
      settle()
      const typed = element<HTMLInputElement>("input")
      type(typed, "Hel")
      paint()
      app.send({ _tag: "Note", message: { _tag: "Written", was: app.note(), value: "SCAN" } })
      paint()
      expect(app.note()).toBe("SCAN")
      expect(element("input")).toBe(typed)
      expect(typed.value).toBe("SCAN")
      type(typed, "SCANs")
      paint()
      expect(app.note()).toBe("SCANs")
    })

    describe("a source that belongs to the control, as a dictation that streams partial results", () => {
      // The control listens to the source, not the program: each result is put into the element on screen, as a key
      // is, and written by the element's own listener, over what it showed.
      test("each result is shown by the input on screen, which keeps the focus, and is stored", () => {
        const source = dictation()
        const app = mountNote(bridge.views.dictated(source))
        settle()
        const typed = element<HTMLInputElement>("input")
        type(typed, "Note: ")
        typed.focus()
        paint()
        source.say("Note: hel")
        settle()
        source.say("Note: hello")
        // A dispatch only queues the message: the program applies it in a later step of the scheduler.
        settle()
        paint()
        expect(element("input")).toBe(typed)
        expect(document.activeElement).toBe(typed)
        expect(typed.value).toBe("Note: hello")
        expect(app.note()).toBe("Note: hello")
        type(typed, "Note: hello!")
        paint()
        expect(app.note()).toBe("Note: hello!")
      })

      test("after the program empties the input, the results go on into the same element, and are stored", () => {
        const source = dictation()
        const app = mountNote(bridge.views.dictated(source))
        settle()
        const typed = element<HTMLInputElement>("input")
        source.say("Ada")
        paint()
        app.send("Cleared")
        paint()
        expect(typed.value).toBe("")
        source.say("Bob")
        paint()
        expect(element("input")).toBe(typed)
        expect(typed.value).toBe("Bob")
        expect(app.note()).toBe("Bob")
      })
    })
  })

  // A renderer may draw the input with the element of the plain field it replaces, and the other way round: snabbdom
  // does, for an `<input>` in the same place.
  describe("an input in the place of a plain field, and back", () => {
    const mountLid = (flags: Lid["lid"]) =>
      mount(bridge.renderInto, bridge.views.lid, (render) => run(lid, render, { flags }))

    test("the input drawn in a plain field's place shows the program's value, and what is typed is stored", () => {
      mountLid("Closed")
      settle()
      expect(element<HTMLInputElement>("input").value).toBe("Closed")
      button("Open").click()
      paint()
      const typedInto = element<HTMLInputElement>("input")
      expect(typedInto.value).toBe("draft")
      type(typedInto, "draft!")
      paint()
      expect(state()).toEqual(["draft!"])
      expect(typedInto.value).toBe("draft!")
    })

    test("the plain field drawn in the place of the input is left as the view draws it, by every frame", () => {
      mountLid("Opened")
      settle()
      const typedInto = element<HTMLInputElement>("input")
      type(typedInto, "Ada")
      paint()
      // A key the frame of Close has seen, written over what the input showed in the frame before.
      type(typedInto, "Ada!")
      button("Close").click()
      paint()
      expect(element<HTMLInputElement>("input").value).toBe("Closed")
      // Open again, the input shows the note the program holds, whatever the field showed.
      button("Open").click()
      paint()
      expect(element<HTMLInputElement>("input").value).toBe("Ada!")
      expect(state()).toEqual(["Ada!"])
    })
  })

  // A renderer may draw one input with the element of another it replaces: snabbdom and React do, for an `<input>` in
  // the same place. What the element holds is of the input it showed, not of the next.
  describe("an input in the place of another input", () => {
    test(
      "shows the program's value once a key for the first, left unseen, is rejected, and stores what is typed next",
      () => {
        mount(bridge.renderInto, bridge.views.steps, (render) => run(steps, render))
        settle()
        const typedInto = element<HTMLInputElement>("input")
        // The run takes Next; a key is typed into the first step's input, over its empty text, and the refresh draws
        // the second step, which has not seen the key, before the run takes it. Both inputs hold the empty text.
        button("Next").click()
        settle()
        type(typedInto, "A")
        refresh()
        // The key is rejected, since the first step's place is gone, and the frame of its rejection, which has seen it,
        // gives the element the second step's text.
        paint()
        expect(element("input")).toBe(typedInto)
        expect(state()).toEqual([""])
        expect(typedInto.value).toBe("")
        type(typedInto, "B")
        paint()
        expect(state()).toEqual(["B"])
      }
    )
  })

  describe("an input whose place the state no longer holds", () => {
    test("shows the program's value once a key, left unseen by the frame that locks it, is rejected", () => {
      const app = mount(bridge.renderInto, bridge.views.lock, (render) => run(lock, render))
      settle()
      const typedInto = element<HTMLInputElement>("input")
      // The run takes Locked; a key is typed over the empty text, and the refresh draws the locked state, which has
      // not seen the key, before the run takes it. The locked state holds the empty text.
      button("Lock").click()
      settle()
      type(typedInto, "A")
      refresh()
      expect(app.views()).toBe(2)
      // The key is rejected, since the locked state holds no place for it, and the frame of its rejection, which has
      // seen it, gives the element the locked state's text: a frame of the very same state, whose tree is not drawn
      // again.
      paint()
      expect(app.views()).toBe(2)
      expect(element("input")).toBe(typedInto)
      expect(state()).toEqual([""])
      expect(typedInto.value).toBe("")
    })
  })
}
