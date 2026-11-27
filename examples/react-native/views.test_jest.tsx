// The views of `views.tsx` under React Native's jest preset, drawn by the bridge to React, and alone, and the program
// of `notes.ts`, which only this folder has: run by `bun run test:react-native` alone, which installs React Native in
// a project of its own. Under jest, `TextInput` is a mock that draws a host element with the props the view wrote:
// these tests check what React draws, and nothing of what a native view holds.
import { InvariantDefect, reject, start } from "@fgaudo/effect-tea"
import { Draw, type Fork, Host, type View } from "@fgaudo/effect-tea/react"
import { applyAll, dispatchViolations, stateOf } from "@fgaudo/effect-tea/testing"
import { act, fireEvent, render, screen, userEvent } from "@testing-library/react-native"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Opt from "effect/Option"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"
import { Component, type ReactNode, StrictMode } from "react"
import { Text } from "react-native"
import { counter, type Message as CounterMessage, type Model as CounterModel } from "../counter/counter.ts"
import { Draft, form, type Message as FormMessage, type Model as FormModel } from "../form/form.ts"
import { Storage, type StorageError } from "../form/storage.ts"
import * as Note from "./note.ts"
import { BackButton, type Message as NotesMessage, type Model as NotesModel, notes, type State } from "./notes.ts"
import { counterView, formView, notesView } from "./views.tsx"

const count = () => screen.getByTestId("count").props.children

test("Host draws the first model, and each press", async () => {
  await render(<Host program={counter} view={counterView} />)
  expect(count()).toBe(0)
  await fireEvent.press(screen.getByText("+"))
  expect(count()).toBe(1)
  await fireEvent.press(screen.getByText("−"))
  expect(count()).toBe(0)
})

test("Host under StrictMode applies and draws each press once", async () => {
  await render(
    <StrictMode>
      <Host program={counter} view={counterView} />
    </StrictMode>
  )
  await fireEvent.press(screen.getByText("+"))
  await fireEvent.press(screen.getByText("+"))
  expect(count()).toBe(2)
})

test("Draw draws a program started apart, and a message sent outside a handler", async () => {
  const { app, run } = start(counter)
  await render(<Draw app={app} view={counterView} />)
  const fiber = Effect.runFork(run)
  await act(async () => {
    app.dispatch("Increment")
  })
  expect(count()).toBe(1)
  await Effect.runPromise(Fiber.interrupt(fiber))
})

const storing = (save: (name: string) => Effect.Effect<void, StorageError>): Fork<Storage> => (run) =>
  Effect.runFork(Effect.provideService(run, Storage, Storage.of({ save })))

test("a TextInput is given what is typed as its value, and the empty name the program leaves after a save", async () => {
  const user = userEvent.setup()
  await render(<Host program={form} view={formView} fork={storing(() => Effect.void)} />)
  await user.type(screen.getByTestId("name"), "Ada")
  expect(screen.getByTestId("name").props.value).toBe("Ada")
  await user.press(screen.getByText("Save"))
  await act(async () => {})
  expect(screen.getByTestId("name").props.value).toBe("")
  expect(screen.getByTestId("saved").props.children).toBe("Ada")
})

test("a text that the handler of the view before Save sends while the form saves is rejected, by the shape of the state", async () => {
  const applied: Array<string> = []
  const ignored: Array<string> = []
  await render(
    <Host
      program={form}
      view={formView}
      fork={storing(() => Effect.never)}
      options={{
        onApplied: ({ message }) => void applied.push(message._tag),
        onIgnored: ({ message }) => void ignored.push(message._tag)
      }}
    />
  )
  await fireEvent.changeText(screen.getByTestId("name"), "Ada")
  // The handler of the view drawn before Save: what an event queued with the press calls on React Native.
  const older: (text: string) => void = screen.getByTestId("name").props.onChangeText
  await fireEvent.press(screen.getByText("Save"))
  expect(screen.getByText("Saving…")).toBeTruthy()
  expect(screen.getByTestId("name").props.onChangeText).toBeUndefined()
  await act(async () => older("Ada!"))
  expect(screen.getByTestId("name").props.value).toBe("Ada")
  expect([applied, ignored]).toEqual([["NameTyped", "SaveClicked"], ["NameTyped"]])
})

class Boundary extends Component<{ readonly children: ReactNode }, { readonly error: unknown }> {
  override state = { error: undefined as unknown }
  static getDerivedStateFromError(error: unknown) {
    return { error }
  }
  override render() {
    return this.state.error === undefined
      ? this.props.children
      : <Text testID="caught">{String(this.state.error)}</Text>
  }
}

test("Host throws a run that dies to the nearest error boundary", async () => {
  // React logs the error that a boundary caught.
  const errors = jest.spyOn(console, "error").mockImplementation(() => {})
  await render(
    <Boundary>
      <Host program={form} view={formView} fork={storing(() => Effect.die("storage is gone"))} />
    </Boundary>
  )
  await fireEvent.changeText(screen.getByTestId("name"), "Ada")
  await fireEvent.press(screen.getByText("Save"))
  await act(async () => {})
  expect(screen.getByTestId("caught").props.children).toContain("ProgramDefect")
  errors.mockRestore()
})

// What no render can throw any more is reported as React reports an error itself. React Native has no `reportError` and
// no `ErrorEvent`, and there the report reaches the console. Under jest the process is Node's, whose
// `uncaughtException` the report would take first, and which no listener of jest's hears: the test takes its `emit`
// away.
test("Host reports to the console what its run dies of once it has unmounted, where nothing else hears it", async () => {
  const released = new Error("A release that cannot complete")
  const process = (globalThis as Record<string, unknown>)["process"] as { emit?: unknown }
  const emit = process.emit
  let logged = () => {}
  const reported = new Promise<void>((resolve) => {
    logged = resolve
  })
  const errors = jest.spyOn(console, "error").mockImplementation(() => logged())
  Object.assign(process, { emit: undefined })
  try {
    const fork: Fork<never> = (run) => Effect.runFork(run.pipe(Effect.ensuring(Effect.die(released))))
    const { unmount } = await render(<Host program={counter} view={counterView} fork={fork} />)
    await act(async () => {})
    await unmount()
    await reported
    expect(errors.mock.calls).toEqual([[released]])
  } finally {
    Object.assign(process, { emit })
    errors.mockRestore()
  }
})

// A view is a function: a test draws it with a dispatch that records, acts on each control, and compares what was
// sent with what the model holds. It finds only the controls it acts on.
const sentBy = async <Model, Message>(
  view: View<Model, Message>,
  model: Model,
  acts: () => Promise<void>
): Promise<ReadonlyArray<Message>> => {
  const sent: Array<Message> = []
  await render(<>{view(model, (message) => void sent.push(message))}</>)
  await acts()
  return sent
}

// What the model holds, in the order the test acts: −, then +.
const counterMessagesOf = (model: CounterModel): ReadonlyArray<CounterMessage> =>
  model._tag === "Counting" ? [model.decrement, model.increment] : [model.increment]

const pressBoth = async () => {
  await fireEvent.press(screen.getByText("−"))
  await fireEvent.press(screen.getByText("+"))
}

test.each([0, 2])("the counter's view sends what its model holds, at %d", async (count) => {
  const model = counter.makeModel({ count })
  expect(await sentBy(counterView, model, pressBoth)).toEqual(counterMessagesOf(model))
})

// What the model holds, in the order the test acts: what is typed, filled with the text given, where the model shows
// an editor, then Save. A press of a disabled `Pressable` sends nothing.
const formMessagesOf = ({ editor }: FormModel, text: string): ReadonlyArray<FormMessage> =>
  editor._tag === "Saving" ? [] : [{ ...editor.typed, value: text }, ...(editor._tag === "Named" ? [editor.save] : [])]

test.each(
  [
    ["Blank", Draft.Editing({ name: "", failed: Opt.none() })],
    ["Named", Draft.Editing({ name: "Ada", failed: Opt.none() })],
    ["Saving", Draft.Saving({ name: "Ada" })]
  ] as const
)("the form's view sends what its model holds, %s", async (_, draft) => {
  const model = form.makeModel({ draft, saved: [] })
  const sent = await sentBy(formView, model, async () => {
    await fireEvent.changeText(screen.getByTestId("name"), "Ada!")
    await fireEvent.press(screen.getByRole("button"))
  })
  expect(sent).toEqual(formMessagesOf(model, "Ada!"))
})

describe("notes", () => {
  const opened = (index: number) => ({ _tag: "NoteOpened", index }) as const
  // A message of the page, as its view's dispatch sends it: naming the instance it was drawn for, the first by default.
  const onPage = (message: Note.Message, instance = 1): NotesMessage => ({ _tag: "Note", instance, message })
  const edit = onPage({ _tag: "EditClicked" })
  const backPressed: NotesMessage = { _tag: "BackPressed" }
  const pageOf = (state: State) => Opt.map(state.children.Note, (note) => note.state)
  const list = notes.init.state
  const reading = stateOf(notes, { ...list.own, open: Opt.some(0) }, { Note: Note.State.Reading({ text: "Milk" }) })
  const editing = stateOf(notes, { ...list.own, open: Opt.some(0) }, {
    Note: Note.State.Editing({ text: "Milk", draft: "Mil" })
  })

  test("a note opens, is edited and saved, and the list holds what was saved", () => {
    const typed = onPage({ _tag: "DraftTyped", value: "Oat milk" })
    const { state } = applyAll(notes.update, [opened(0), edit, typed, onPage({ _tag: "SaveClicked" })], list)
    expect(state.own).toEqual({ notes: ["Oat milk", "Call the plumber", "Return the books"], open: Opt.none() })
    expect(state.children.Note).toEqual(Opt.none())
  })

  test("back cancels an edit, then closes the page", () => {
    const cancelled = applyAll(notes.update, [opened(0), edit, backPressed], list).state
    expect(pageOf(cancelled)).toEqual(Opt.some(Note.State.Reading({ text: "Milk" })))
    expect(applyAll(notes.update, [backPressed], cancelled).state.own.open).toEqual(Opt.none())
  })

  test("a note opened again starts again, and a message of the earlier visit is rejected", () => {
    const { state } = applyAll(notes.update, [opened(0), edit, backPressed, backPressed, opened(0)], list)
    expect(pageOf(state)).toEqual(Opt.some(Note.State.Reading({ text: "Milk" })))
    expect(notes.makeModel(state)).toMatchObject({ _tag: "Note", instance: 2 })
    expect(notes.update(edit)(state)).toBe(reject)
    expect(pageOf(applyAll(notes.update, [onPage({ _tag: "EditClicked" }, 2)], state).state)).toEqual(
      Opt.some(Note.State.Editing({ text: "Milk", draft: "Milk" }))
    )
  })

  test("the device's back button is listened to only while a note is open", () => {
    expect([notes.subscriptions(list), notes.subscriptions(reading), notes.subscriptions(editing)]).toEqual([
      [],
      ["back"],
      ["back"]
    ])
  })

  // The key of the button is listed only while a note is open, and the run drops what the button sent once it is not.
  test("dies on a press of back while no note is open", () => {
    expect(() => notes.update(backPressed)(list)).toThrow(InvariantDefect)
  })

  // What the model holds, in the order the test acts: the header's Close, then the page's controls, what is typed
  // filled with the text given, each naming the page's instance; or the list's notes.
  const notesMessagesOf = (model: NotesModel, text: string): ReadonlyArray<NotesMessage> => {
    if (model._tag === "List") return model.notes.map(({ open }) => open)
    const page = model.model
    const sent: ReadonlyArray<Note.Message> = page._tag === "Reading"
      ? [page.edit]
      : [{ ...page.typed, value: text }, page.save, page.cancel]
    return [
      ...Opt.toArray(model.close),
      ...sent.map((message) => ({ _tag: "Note" as const, instance: model.instance, message }))
    ]
  }

  const noteClicks: ReadonlyArray<Note.Message> = Object.values(
    {
      EditClicked: [{ _tag: "EditClicked" }],
      DraftTyped: [{ _tag: "DraftTyped", value: "Oat milk" }],
      SaveClicked: [{ _tag: "SaveClicked" }],
      CancelClicked: [{ _tag: "CancelClicked" }]
    } satisfies { [Tag in Note.Message["_tag"]]: ReadonlyArray<Extract<Note.Message, { _tag: Tag }>> }
  ).flat()

  // What a user could ask of the notes, with the page's messages naming the instance of the states below.
  const userMessages: ReadonlyArray<NotesMessage> = Object.values(
    {
      NoteOpened: [opened(0), opened(1), opened(2)],
      CloseClicked: [{ _tag: "CloseClicked" }],
      // Only the device's button sends it, through the subscription.
      BackPressed: [],
      Note: noteClicks.map((message) => ({ _tag: "Note", instance: 1, message }))
    } satisfies { [Tag in NotesMessage["_tag"]]: ReadonlyArray<Extract<NotesMessage, { _tag: Tag }>> }
  ).flat()

  const states = [["the list", list], ["a note", reading], ["an edit", editing]] as const

  test.each(states)("the model holds what update accepts, all of it, and each acts once when sent twice, in %s", (
    _,
    state
  ) => {
    expect(dispatchViolations(notes.update, {
      state,
      held: notesMessagesOf(notes.makeModel(state), "Oat milk"),
      candidates: userMessages
    })).toEqual([])
  })

  const actOnEach = (text: string) => async () => {
    for (const draft of screen.queryAllByTestId("draft")) await fireEvent.changeText(draft, text)
    for (const button of screen.getAllByRole("button")) await fireEvent.press(button)
  }

  test.each(states)("the view of the notes sends what its model holds, in %s", async (_, state) => {
    const model = notes.makeModel(state)
    expect(await sentBy(notesView, model, actOnEach("Oat milk"))).toEqual(notesMessagesOf(model, "Oat milk"))
  })

  // A back button of the test's: a press reaches what listens to it, as `BackHandler` would.
  const backButton = () => {
    const listeners = new Set<() => void>()
    const service = BackButton.of({
      presses: Stream.callback<void>((queue) => {
        const listener = () => {
          Queue.offerUnsafe(queue, undefined)
        }
        return Effect.acquireRelease(
          Effect.sync(() => listeners.add(listener)),
          () => Effect.sync(() => listeners.delete(listener))
        )
      })
    })
    const fork: Fork<BackButton> = (run) => Effect.runFork(Effect.provideService(run, BackButton, service))
    const press = () => act(async () => listeners.forEach((listener) => listener()))
    return { fork, listening: () => listeners.size, press }
  }

  test("Host listens to the back button while a note is open, and a press cancels its edit, then closes it", async () => {
    const button = backButton()
    await render(<Host program={notes} view={notesView} fork={button.fork} />)
    await act(async () => {})
    expect(button.listening()).toBe(0)
    await fireEvent.press(screen.getByText("Milk"))
    await act(async () => {})
    expect(button.listening()).toBe(1)
    await fireEvent.press(screen.getByText("Edit"))
    await fireEvent.changeText(screen.getByTestId("draft"), "Oat milk")
    await button.press()
    expect(screen.getByTestId("note").props.children).toBe("Milk")
    await button.press()
    expect(screen.getByText("Call the plumber")).toBeTruthy()
    expect(button.listening()).toBe(0)
  })

  test("Host rejects what the page drawn for an earlier visit sends", async () => {
    const ignored: Array<NotesMessage> = []
    await render(
      <Host
        program={notes}
        view={notesView}
        fork={backButton().fork}
        options={{ onIgnored: ({ message }) => void ignored.push(message) }}
      />
    )
    await fireEvent.press(screen.getByText("Milk"))
    await fireEvent.press(screen.getByText("Edit"))
    // The handler of the page drawn for the first visit: what a tap queued as the page closed calls on React Native.
    const older: (text: string) => void = screen.getByTestId("draft").props.onChangeText
    await fireEvent.press(screen.getByText("Cancel"))
    await fireEvent.press(screen.getByText("Close"))
    await fireEvent.press(screen.getByText("Milk"))
    await fireEvent.press(screen.getByText("Edit"))
    await act(async () => older("Oat milk"))
    expect(screen.getByTestId("draft").props.value).toBe("Milk")
    expect(ignored).toEqual([onPage({ _tag: "DraftTyped", value: "Oat milk" })])
  })
})
