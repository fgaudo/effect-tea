// The views of `views.tsx` under React Native's jest preset, drawn by the bridge to React, and alone: run by
// `bun run test:react-native` alone, which installs React Native in a project of its own. Under jest, `TextInput` is a
// mock that draws a host element with the props the view wrote: these tests check what React draws, and nothing of
// what a native view holds.
import { start } from "@fgaudo/effect-tea"
import { Draw, type Fork, Host, type View } from "@fgaudo/effect-tea/react"
import { act, fireEvent, render, screen, userEvent } from "@testing-library/react-native"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Opt from "effect/Option"
import { Component, type ReactNode, StrictMode } from "react"
import { Text } from "react-native"
import { counter, type Message as CounterMessage, type Model as CounterModel } from "../counter/counter.ts"
import { Draft, form, type Message as FormMessage, type Model as FormModel } from "../form/form.ts"
import { Storage, type StorageError } from "../form/storage.ts"
import { counterView, formView } from "./views.tsx"

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
