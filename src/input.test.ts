// The semantics of an input, as pure pieces: what `update` makes of what is written into one, and what a step of the
// program leaves of one and of its subscriptions. Nothing here runs.
import { describe, expect, test } from "bun:test"
import * as Arr from "effect/Array"
import * as Channel from "effect/Channel"
import * as Effect from "effect/Effect"
import * as HashMap from "effect/HashMap"
import * as Optic from "effect/Optic"
import * as Opt from "effect/Option"
import * as fc from "fast-check"
import { program } from "./compose.ts"
import { type Dispatch, forwardTo } from "./dispatch.ts"
import type { Written } from "./input.ts"
import type { MessageOf, Program } from "./program.ts"
import type { Subscription } from "./subscription.ts"
import { dispatchViolations } from "./testing/dispatch-violations.ts"
import { stateOf } from "./testing/state-of.ts"
import { reject, type Step, type Transition } from "./update.ts"

const idle = <M>(): Subscription<M, never> => Channel.never

const stepped = <S, C, E>(result: Transition<S, C, E>): Step<S, C, E> => {
  if (result === reject) throw new Error("rejected")
  return result
}

// A draft with a title and a level, which the outside writes into, and what the program does with them: it clears
// the title, keeping the state it had, takes that state back, and mutes the level.
type Draft = Readonly<{ title: string; level: number; before: Opt.Option<Draft>; opened: number }>

type Own = "Cleared" | "Undone" | "Muted" | "Opened" | "Touched"

const draftOf = (title: string, level = 50): Draft => ({ title, level, before: Opt.none(), opened: 0 })

const here = Optic.id<Draft>()

const { make, inputById, input } = program<{ state: Draft }>()

const draft = program<{ state: Draft; message: Own }>().make({
  init: { state: draftOf("") },
  inputs: { Title: input({ at: here.key("title") }), Level: input({ at: here.key("level") }) },
  update: (message: Own) => (state) => {
    switch (message) {
      case "Cleared":
        return state.title === "" ? reject : { state: { ...state, title: "", before: Opt.some(state) } }
      // The whole state it had, as it was.
      case "Undone":
        return Opt.match(state.before, { onNone: () => reject, onSome: (before) => ({ state: before }) })
      case "Muted":
        return { state: { ...state, level: 0 } }
      case "Opened":
        return { state: { ...state, opened: state.opened + 1 } }
      case "Touched":
        return { state }
    }
  },
  makeModel: (state) => ({ title: state.title, level: state.level })
})

type Message = MessageOf<typeof draft>

const title = (text: string): Message => ({ _tag: "Title", message: { _tag: "Written", value: text } })

const level = (value: number): Message => ({ _tag: "Level", message: { _tag: "Written", value } })

const drafts = fc.record({
  title: fc.string(),
  level: fc.integer(),
  before: fc.constant(Opt.none<Draft>()),
  opened: fc.nat()
})

describe("what is written into an input", () => {
  test("is stored, whatever it is and whatever the place holds", () => {
    fc.assert(fc.property(drafts, fc.string(), fc.integer(), (state, text, value) => {
      expect(stepped(draft.update(title(text))(state)).state).toEqual({ ...state, title: text })
      expect(stepped(draft.update(level(value))(state)).state).toEqual({ ...state, level: value })
    }))
  })

  test("leaves the very same state when the place holds it already", () => {
    const state = draftOf("Ada")
    expect(stepped(draft.update(title("Ada"))(state)).state).toBe(state)
  })

  test("is stored over what a step of the program put in its place", () => {
    const cleared = stepped(draft.update("Cleared")(draftOf("Ada"))).state
    expect(stepped(draft.update(title("Ada L"))(cleared)).state).toEqual({ ...cleared, title: "Ada L" })
  })

  test("goes to its own input, and leaves the others as they are", () => {
    const state = draftOf("Ada")
    expect(stepped(draft.update(level(80))(state)).state).toEqual({ ...state, level: 80 })
  })

  test("is rejected where the input is not in the state", () => {
    type Page = Readonly<{ search: Opt.Option<string> }>
    const page = program<{ state: Page }>()
    const tested = page.make({
      init: { state: { search: Opt.none() } },
      inputs: { Search: page.input({ at: Optic.id<Page>().key("search").compose(Optic.some()) }) },
      makeModel: (state) => state
    })
    const written = { _tag: "Search" as const, message: { _tag: "Written" as const, value: "a" } }
    expect(tested.update(written)({ search: Opt.none() })).toBe(reject)
    expect(stepped(tested.update(written)({ search: Opt.some("") })).state).toEqual({ search: Opt.some("a") })
  })

  test("equal by Equal to the value held, whatever it is made of, leaves the very value held", () => {
    type Tags = Readonly<{ tags: ReadonlyArray<string> }>
    const tags = program<{ state: Tags }>()
    const tested = tags.make({
      init: { state: { tags: [] } },
      inputs: { Tags: tags.input({ at: Optic.id<Tags>().key("tags") }) },
      makeModel: (state) => state
    })
    const held: Tags = { tags: ["a", "b"] }
    const write = (value: ReadonlyArray<string>) =>
      tested.update({ _tag: "Tags", message: { _tag: "Written", value } })(held)
    expect(stepped(write(["a", "b", "c"])).state).toEqual({ tags: ["a", "b", "c"] })
    // An equal copy of the value held leaves the very value held.
    expect(stepped(write(["a", "b"])).state).toBe(held)
    expect(stepped(write(["b", "a"])).state).toEqual({ tags: ["b", "a"] })
  })

  // `Equal` takes NaN for NaN, so the input leaves the value held, and the parent must take it for the very same.
  test("a write of NaN over NaN leaves the very same state", () => {
    const held = draftOf("Ada", Number.NaN)
    expect(stepped(draft.update(level(Number.NaN))(held)).state).toBe(held)
  })
})

describe("a step of the program", () => {
  test("leaves an input as it wrote it: the state stored is the state written", () => {
    fc.assert(fc.property(drafts, (state) => {
      fc.pre(state.title !== "")
      expect(stepped(draft.update("Cleared")(state)).state).toEqual({ ...state, title: "", before: Opt.some(state) })
    }))
    const state = draftOf("Ada")
    expect(stepped(draft.update("Opened")(state)).state.title).toBe(state.title)
    expect(stepped(draft.update("Touched")(state)).state).toBe(state)
  })

  test("of a child, or of what the parent makes of its event, is stored as written too", () => {
    type Button = Readonly<{ pressed: number }>
    const button = {
      init: { state: { pressed: 0 } },
      update: (_: "Pressed") => (state: Button): Step<Button, never, "Reset"> => ({
        state: { pressed: state.pressed + 1 },
        events: ["Reset"]
      }),
      subscriptions: () => HashMap.empty(),
      makeModel: (state: Button) => state
    }
    type Form = Readonly<{ name: string }>
    const form = program<{ state: Form; event: "Reset" }>()
    const tested = form.withChildren({ Reset: form.child(button) }).make({
      init: { state: { name: "" } },
      inputs: { Name: form.input({ at: Optic.id<Form>().key("name") }) },
      onEvent: { Reset: (event) => (state) => ({ state: { ...state, name: "" }, events: [event] }) },
      makeModel: (state) => state
    })
    const result = tested.update({ _tag: "Reset", message: "Pressed" })(stateOf(tested, { name: "Ada" }))
    expect(result).toEqual({
      state: stateOf(tested, { name: "" }, { Reset: { pressed: 1 } }),
      commands: [],
      events: ["Reset"]
    })
    expect(
      stepped(tested.update({ _tag: "Name", message: { _tag: "Written", value: "Eve" } })(stepped(result).state)).state
    ).toEqual(stateOf(tested, { name: "Eve" }, { Reset: { pressed: 1 } }))
  })

  test("that puts a subscription's value into an input is followed by a write over it: the last one stays", () => {
    type Note = Readonly<{ text: string }>
    const note = program<{ state: Note; message: Readonly<{ _tag: "Dictated"; text: string }> }>()
    const tested = note.make({
      init: { state: { text: "" } },
      inputs: { Text: note.input({ at: Optic.id<Note>().key("text") }) },
      update: (message: Readonly<{ _tag: "Dictated"; text: string }>) => (state) => ({
        state: { text: `${state.text}${message.text}` }
      }),
      makeModel: (state) => state.text
    })
    const dictated = stepped(tested.update({ _tag: "Dictated", text: "lo" })({ text: "Hel" }))
    expect(dictated.state).toEqual({ text: "Hello" })
    const typed = stepped(
      tested.update({ _tag: "Text", message: { _tag: "Written", value: "Hello!" } })(dictated.state)
    )
    expect(typed.state).toEqual({ text: "Hello!" })
    expect(stepped(tested.update({ _tag: "Dictated", text: "?" })(typed.state)).state).toEqual({ text: "Hello!?" })
  })
})

// A renderer that draws a new state after the next event, as one whose elements live in another thread: the element
// keeps what it was drawn with until the test draws, and a key appends to what the element holds, then writes it.
describe("under a renderer that draws after the next event", () => {
  type Note = Readonly<{ _tag: "Editing"; text: string }> | Readonly<{ _tag: "Saving"; text: string }>
  const note = program<{ state: Note; message: "SaveClicked" | "Saved" }>()
  const tested = note.make({
    init: { state: { _tag: "Editing", text: "" } },
    // The lock is the shape of the state: only `Editing` is a place to write into.
    inputs: { Text: note.input({ at: Optic.id<Note>().tag("Editing").key("text") }) },
    update: (message: "SaveClicked" | "Saved") => (state) =>
      message === "SaveClicked"
        ? state._tag === "Editing" ? { state: { _tag: "Saving", text: state.text } } : reject
        : state._tag === "Saving"
        ? { state: { _tag: "Editing", text: "" } }
        : reject,
    makeModel: (state) => state.text
  })
  const late = () => {
    let state = tested.init.state
    let element = tested.makeModel(state)
    const send = (message: MessageOf<typeof tested>) => {
      const result = tested.update(message)(state)
      if (result !== reject) state = result.state
    }
    return {
      key: (typed: string) => {
        element = `${element}${typed}`
        send({ _tag: "Text", message: { _tag: "Written", value: element } })
      },
      send,
      draw: () => {
        element = tested.makeModel(state)
      },
      state: () => state,
      element: () => element
    }
  }

  test("each key typed between two draws is stored: the state holds the last", () => {
    const screen = late()
    screen.key("A")
    screen.key("d")
    screen.key("a")
    expect(screen.state()).toEqual({ _tag: "Editing", text: "Ada" })
    screen.draw()
    expect(screen.element()).toBe("Ada")
  })

  test("a value the program leaves in the place is written over by a key typed before its draw", () => {
    const screen = late()
    screen.key("Ada")
    screen.send("SaveClicked")
    screen.send("Saved")
    expect(screen.state()).toEqual({ _tag: "Editing", text: "" })
    screen.key("!")
    expect(screen.state()).toEqual({ _tag: "Editing", text: "Ada!" })
  })

  test("once drawn, the value the program left is shown, and the next key is typed over it", () => {
    const screen = late()
    screen.key("Ada")
    screen.send("SaveClicked")
    screen.send("Saved")
    screen.draw()
    expect(screen.element()).toBe("")
    screen.key("B")
    expect(screen.state()).toEqual({ _tag: "Editing", text: "B" })
  })

  test("a lock by the shape of the state rejects a key typed before its draw", () => {
    const screen = late()
    screen.key("Ada")
    screen.send("SaveClicked")
    screen.key("!")
    expect(screen.state()).toEqual({ _tag: "Saving", text: "Ada" })
    screen.draw()
    expect(screen.element()).toBe("Ada")
  })
})

describe("an input among the subscriptions", () => {
  type Ticks = Readonly<{ ticks: number }>
  const ticking: Program<{ state: Ticks; model: number; message: "Tick" }> = {
    init: { state: { ticks: 0 } },
    update: () => ({ ticks }) => ({ state: { ticks: ticks + 1 } }),
    subscriptions: () => HashMap.make(["ticks", idle<"Tick">()]),
    makeModel: ({ ticks }) => ticks
  }
  type Page = Readonly<{ name: string }>
  const pages = program<{ state: Page }>()
  const page = pages.withChildren({ Ticking: pages.child(ticking) }).make({
    init: { state: { name: "" } },
    inputs: { Name: pages.input({ at: Optic.id<Page>().key("name") }) },
    subscriptions: () => HashMap.make(["own", idle<never>()]),
    makeModel: (state) => state.name
  })
  type PageState = typeof page.init.state

  test("lifts no key: the program keeps its own and its children's, and none is under the input's name", () => {
    const keys = page.subscriptions(stateOf(page, { name: "Ada" }))
    expect(HashMap.size(keys)).toBe(2)
    expect(HashMap.has(keys, "own")).toBe(true)
    expect(HashMap.has(keys, ["Ticking", 1, "ticks"])).toBe(true)
  })

  test("a write into it keeps every subscription the same object, the children's lifted ones included", () => {
    const before = page.init.state
    const written = stepped(
      page.update({ _tag: "Name", message: { _tag: "Written", value: "Ada" } })(before)
    )
    expect(written.state.children.Ticking).toBe(before.children.Ticking)
    const lifted = (state: PageState) => Opt.getOrThrow(HashMap.get(page.subscriptions(state), ["Ticking", 1, "ticks"]))
    expect(lifted(written.state)).toBe(lifted(before))
  })
})

// A desk whose draft is sent and started again, closed and opened again, and drafts by id, where an id leaves and
// comes back. Each history ends with a write after the desk replaced the draft: it is stored into the draft that the
// state holds then, from the state and the message alone. No bridge lets a handler run on a view older than the state
// ("Writing a bridge").
describe("a write into an input its parent has replaced", () => {
  type Sent = Readonly<{ _tag: "Sent"; text: string }>
  type Text = Readonly<{ text: string }>
  const text = program<{ state: Text; event: Sent; message: "SendClicked" | "DiscardClicked" }>()
  const textDraft = text.make({
    init: { state: { text: "" } },
    inputs: { Text: text.input({ at: Optic.id<Text>().key("text") }) },
    update: (message: "SendClicked" | "DiscardClicked") => (state) =>
      message === "DiscardClicked"
        ? { state: { text: "" } }
        : state.text === ""
        ? reject
        : { state, events: [{ _tag: "Sent", text: state.text }] },
    makeModel: (state) => state.text
  })
  type DeskOwn =
    | Readonly<{ _tag: "Closed" }>
    | Readonly<{ _tag: "Opened" }>
    | Readonly<{ _tag: "RowAdded"; id: number }>
    | Readonly<{ _tag: "RowRemoved"; id: number }>
  type Desk = Readonly<{ open: boolean; rows: ReadonlyArray<number>; sent: ReadonlyArray<string> }>
  const deskOf = program<{ state: Desk; message: DeskOwn }>()
  const desk = deskOf.withChildren({
    // Sent, the draft is started again: another count of what was sent is another key.
    Draft: deskOf.child(textDraft, { there: (state) => state.open, key: (state) => state.sent.length }),
    Row: deskOf.childById(textDraft, { ids: (state) => state.rows })
  }).make({
    init: { state: { open: true, rows: [], sent: [] } },
    update: (message) => (state) => {
      switch (message._tag) {
        case "Closed":
          return state.open ? { state: { ...state, open: false } } : reject
        case "Opened":
          return state.open ? reject : { state: { ...state, open: true } }
        case "RowAdded":
          return { state: { ...state, rows: [...state.rows, message.id] } }
        case "RowRemoved":
          return { state: { ...state, rows: Arr.filter(state.rows, (id) => id !== message.id) } }
      }
    },
    onEvent: {
      Draft: (event) => (state) => ({ state: { ...state, sent: [...state.sent, event.text] } }),
      Row: () => (state) => ({ state })
    },
    makeModel: (state, children) => ({
      draft: children.Draft(),
      rows: Arr.map(state.rows, (id) => ({ id, text: children.Row(id) }))
    })
  })
  type DeskMessage = MessageOf<typeof desk>
  type DeskState = typeof desk.init.state
  const typing = (value: string, id?: number): DeskMessage =>
    id === undefined
      ? { _tag: "Draft", message: { _tag: "Text", message: { _tag: "Written", value } } }
      : { _tag: "Row", id, message: { _tag: "Text", message: { _tag: "Written", value } } }
  const after = (messages: ReadonlyArray<DeskMessage>, from: DeskState = desk.init.state): DeskState =>
    messages.reduce((state, message) => stepped(desk.update(message)(state)).state, from)
  const keptAt = (state: DeskState, id?: number) =>
    Opt.getOrThrow(id === undefined ? state.children.Draft : HashMap.get(state.children.Row, id))
  const textOf = (state: DeskState, id?: number) => keptAt(state, id).state.text

  test("a text typed into the input on screen is stored", () => {
    const typedOnce = after([typing("hel")])
    expect(textOf(after([typing("hello")], typedOnce))).toBe("hello")
  })

  test("after the desk started the draft again, it is stored into the new draft", () => {
    const sent = after([typing("hello"), { _tag: "Draft", message: "SendClicked" }])
    expect(sent.own).toEqual({ ...desk.init.state.own, sent: ["hello"] })
    expect(keptAt(sent).instance).not.toBe(keptAt(desk.init.state).instance)
    expect(textOf(sent)).toBe("")
    expect(textOf(after([typing("h")], sent))).toBe("h")
  })

  test("after the desk closed the draft and opened it again, it is stored into the draft opened", () => {
    const closed = after([typing("Ada"), { _tag: "Closed" }])
    expect(desk.update(typing("Adam"))(closed)).toBe(reject)
    const opened = after([{ _tag: "Opened" }], closed)
    expect(textOf(opened)).toBe("")
    expect(textOf(after([typing("Adax")], opened))).toBe("Adax")
  })

  test("into a row, it is stored into the row that holds its id then", () => {
    const typedInto = after([{ _tag: "RowAdded", id: 1 }, typing("a", 1)])
    const back = after([{ _tag: "RowRemoved", id: 1 }, { _tag: "RowAdded", id: 1 }], typedInto)
    expect(textOf(back, 1)).toBe("")
    expect(textOf(after([typing("b", 1)], back), 1)).toBe("b")
    expect(desk.update(typing("b", 2))(back)).toBe(reject)
  })

  test("a fixed message drawn for the old draft reaches the new one, and update decides", () => {
    const sent = after([typing("hello"), { _tag: "Draft", message: "SendClicked" }])
    expect(desk.update({ _tag: "Draft", message: "SendClicked" })(sent)).toBe(reject)
    expect(after([{ _tag: "Draft", message: "DiscardClicked" }], sent)).toEqual(sent)
  })
})

describe("an input in a child by id", () => {
  type Note = Readonly<{ text: string }>
  const note = program<{ state: Note }>()
  const noteProgram = note.make({
    init: { state: { text: "" } },
    inputs: { Text: note.input({ at: Optic.id<Note>().key("text") }) },
    makeModel: (state) => state
  })
  type Notes = Readonly<{ ids: ReadonlyArray<number> }>
  const notes = program<{ state: Notes }>()
  const tested = notes.withChildren({ Note: notes.childById(noteProgram, { ids: (state) => state.ids }) }).make({
    init: { state: { ids: [] } },
    makeModel: (state, children) => Arr.map(state.ids, (id) => ({ id, note: children.Note(id) }))
  })
  type NotesMessage = MessageOf<typeof tested>
  const typing = (id: number, text: string): NotesMessage => ({
    _tag: "Note",
    id,
    message: { _tag: "Text", message: { _tag: "Written", value: text } }
  })
  const state = stateOf(tested, { ids: [1, 2] }, { Note: [[1, { text: "a" }], [2, { text: "b" }]] })

  test("is written into the note at its id, and leaves the other note the very same", () => {
    const result = tested.update(typing(2, "bc"))(state)
    expect(result).toEqual({
      state: stateOf(tested, { ids: [1, 2] }, { Note: [[1, { text: "a" }], [2, { text: "bc" }]] }),
      commands: [],
      events: []
    })
    expect(Opt.getOrThrow(HashMap.get(stepped(result).state.children.Note, 1))).toBe(
      Opt.getOrThrow(HashMap.get(state.children.Note, 1))
    )
  })

  test("rejects what was written into a note that is gone", () => {
    expect(tested.update(typing(3, "c"))(state)).toBe(reject)
  })

  test("has a dispatch of its own, made from its note's", () => {
    const sent: Array<NotesMessage> = []
    const dispatch: Dispatch<NotesMessage> = (message) => void sent.push(message)
    const toText: Dispatch<Written<string>> = forwardTo(forwardTo(dispatch, "Note", 2), "Text")
    toText({ _tag: "Written", value: "bc" })
    expect(sent).toEqual([typing(2, "bc")])
  })
})

describe("an input by id", () => {
  // Rows in a record by id, which Effect's own `at` reaches.
  type Sheet = Readonly<{ title: string; counts: Readonly<Record<string, string>> }>
  type Own = Readonly<{ _tag: "Removed"; id: string }> | Readonly<{ _tag: "Added"; id: string; count: string }>
  const sheet = Optic.id<Sheet>()
  const sheets = program<{ state: Sheet; message: Own }>()
  const tested = sheets.make({
    init: { state: { title: "", counts: { a: "1", b: "2" } } },
    inputs: {
      Title: sheets.input({ at: sheet.key("title") }),
      Count: sheets.inputById({ at: (id: string) => sheet.key("counts").at(id) })
    },
    update: (message: Own) => (state) => ({
      state: {
        ...state,
        counts: message._tag === "Added"
          ? { ...state.counts, [message.id]: message.count }
          : Object.fromEntries(Object.entries(state.counts).filter(([id]) => id !== message.id))
      }
    }),
    makeModel: (state) => state
  })
  type SheetMessage = MessageOf<typeof tested>
  const count = (id: string, value: string): SheetMessage => ({
    _tag: "Count",
    id,
    message: { _tag: "Written", value }
  })
  const start = tested.init.state
  const after = (state: Sheet, message: SheetMessage) => stepped(tested.update(message)(state)).state

  test("stores a write at its id, and leaves the other rows and inputs as they are", () => {
    expect(tested.update(count("b", "25"))(start)).toEqual({
      state: { title: "", counts: { a: "1", b: "25" } },
      commands: [],
      events: []
    })
  })

  test("rejects a write at an id the state does not hold", () => {
    expect(tested.update(count("c", "3"))(start)).toBe(reject)
  })

  test("rejects a write at an id that is gone, and stores it into another row that came to the id", () => {
    const gone = after(start, { _tag: "Removed", id: "b" })
    expect(tested.update(count("b", "25"))(gone)).toBe(reject)
    const other = after(gone, { _tag: "Added", id: "b", count: "9" })
    expect(after(other, count("b", "25"))).toEqual({ title: "", counts: { a: "1", b: "25" } })
  })

  test("has a dispatch for each id, which names it", () => {
    const sent: Array<SheetMessage> = []
    const dispatch: Dispatch<SheetMessage> = (message) => void sent.push(message)
    const toB: Dispatch<Written<string>> = forwardTo(dispatch, "Count", "b")
    toB({ _tag: "Written", value: "25" })
    expect(sent).toEqual([count("b", "25")])
  })

  test("the types: a write names its id, of the type its place takes, and an input alone takes none", () => {
    const dispatch: Dispatch<SheetMessage> = () => Effect.succeed(0)
    // @ts-expect-error: an input by id is written at an id.
    forwardTo(dispatch, "Count")
    // @ts-expect-error: the id is a string.
    forwardTo(dispatch, "Count", 1)
    // @ts-expect-error: an input alone takes no id.
    forwardTo(dispatch, "Title", "a")
    // @ts-expect-error: a write into an input by id names its id.
    const unnamed: SheetMessage = { _tag: "Count", message: { _tag: "Written", value: "25" } }
    // @ts-expect-error: a count holds a string.
    const mistyped: SheetMessage = { _tag: "Count", id: "b", message: { _tag: "Written", value: 25 } }
    expect([unnamed, mistyped]).toHaveLength(2)
  })
})

describe("inputs at get and set, alone and by id", () => {
  // Rows in an array, found by their id, as `childById` finds its children.
  type Row = Readonly<{ id: number; count: string }>
  type Sheet = Readonly<{ title: string; rows: ReadonlyArray<Row> }>
  const sheets = program<{ state: Sheet }>()
  const rowAt = (state: Sheet, id: number) =>
    Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.count)
  const tested = sheets.make({
    init: { state: { title: "", rows: [{ id: 1, count: "1" }, { id: 2, count: "2" }] } },
    inputs: {
      Title: sheets.input({ get: (state) => Opt.some(state.title), set: (state, title) => ({ ...state, title }) }),
      Count: sheets.inputById({
        get: (state, id: number) => rowAt(state, id),
        set: (state, id, count) => ({
          ...state,
          rows: Arr.map(state.rows, (row) => row.id === id ? { id, count } : row)
        })
      })
    },
    makeModel: (state) => state
  })
  type SheetMessage = MessageOf<typeof tested>
  const written = <A>(value: A) => ({ _tag: "Written", value }) as const
  const start = tested.init.state

  test("an input alone stores a write where get finds its place, through set", () => {
    expect(stepped(tested.update({ _tag: "Title", message: written("Ada") })(start)).state).toEqual({
      ...start,
      title: "Ada"
    })
  })

  test("an input by id stores a write at its id through set, and rejects one at an id get does not find", () => {
    expect(stepped(tested.update({ _tag: "Count", id: 2, message: written("25") })(start)).state).toEqual({
      ...start,
      rows: [{ id: 1, count: "1" }, { id: 2, count: "25" }]
    })
    expect(tested.update({ _tag: "Count", id: 3, message: written("3") })(start)).toBe(reject)
  })

  test("the types: get, set and the id are typed from the state and the id get takes, without annotations", () => {
    sheets.make({
      init: { state: start },
      inputs: {
        Title: sheets.input({
          get: (state) => Opt.some(state.title),
          set: (state, title) => {
            // @ts-expect-error: the value is the title, a string.
            const wrong: number = title
            void wrong
            return state
          }
        }),
        Count: sheets.inputById({
          get: (state, id: number) => rowAt(state, id),
          set: (state, id, count) => {
            // @ts-expect-error: the id is the number get takes.
            const wrongId: string = id
            // @ts-expect-error: the value is the count, a string.
            const wrongCount: number = count
            void wrongId
            void wrongCount
            return state
          }
        })
      },
      makeModel: (state) => state
    })
    // @ts-expect-error: a write at an id names one of the type get takes.
    const mistyped: SheetMessage = { _tag: "Count", id: "2", message: written("25") }
    expect(mistyped).toBeDefined()
  })
})

describe("what input and inputById return", () => {
  // A title that may be locked away, and counts in a record by id: places that are there in some states only.
  type Sheet = Readonly<{ title: Opt.Option<string>; counts: Readonly<Record<string, string>> }>
  const sheet = Optic.id<Sheet>()
  const sheets = program<{ state: Sheet }>()

  test("has the get of its place, given with at or with get and set, alone and by id", () => {
    const titleAt = sheets.input({ at: sheet.key("title").compose(Optic.some()) })
    const titleGot = sheets.input({
      get: (state) => state.title,
      set: (state, title) => ({ ...state, title: Opt.some(title) })
    })
    const countAt = sheets.inputById({ at: (id: string) => sheet.key("counts").at(id) })
    const countGot = sheets.inputById({
      get: (state, id: string) => Opt.fromNullishOr(state.counts[id]),
      set: (state, id, count) => ({ ...state, counts: { ...state.counts, [id]: count } })
    })
    const open: Sheet = { title: Opt.some("Q3"), counts: { a: "1" } }
    const locked: Sheet = { title: Opt.none(), counts: {} }
    expect([titleAt.get(open), titleGot.get(open)]).toEqual([Opt.some("Q3"), Opt.some("Q3")])
    expect([titleAt.get(locked), titleGot.get(locked)]).toEqual([Opt.none(), Opt.none()])
    expect([countAt.get(open, "a"), countGot.get(open, "a")]).toEqual([Opt.some("1"), Opt.some("1")])
    expect([countAt.get(open, "b"), countGot.get(open, "b")]).toEqual([Opt.none(), Opt.none()])
  })
})

describe("the tools of the model", () => {
  // What a model holds is what the program fixes: no value is drawn, and what is written is asked of nothing.
  test("judge a step that empties an input as any message: on an empty one it changes nothing, so it does not act twice", () => {
    const always = program<{ state: Draft; message: "Cleared" }>().make({
      init: { state: draftOf("") },
      inputs: { Title: input({ at: here.key("title") }) },
      update: (_: "Cleared") => (state) => ({ state: { ...state, title: "" } }),
      makeModel: (state) => state
    })
    expect(dispatchViolations(always.update, { state: draftOf("Ada"), held: ["Cleared"] })).toEqual([])
    expect(dispatchViolations(draft.update, { state: draftOf("Ada"), held: ["Cleared"], candidates: ["Cleared"] }))
      .toEqual([])
  })
})

describe("the types of an input", () => {
  test("a write is of the value its place holds, and goes to the name of its input", () => {
    // @ts-expect-error: the level holds a number.
    level("loud")
    // @ts-expect-error: a text is not written into the level.
    const wrong: Message = { _tag: "Level", message: { _tag: "Written", value: "Ada L" } }
    // @ts-expect-error: the draft has no such input.
    const missing: Message = { _tag: "Body", message: { _tag: "Written", value: "Ada L" } }
    expect([wrong, missing]).toHaveLength(2)
  })

  test("an optic into another state than the program's is no input of it, alone or by id", () => {
    type Other = Readonly<{ title: string; titles: Readonly<Record<string, string>> }>
    const other = Optic.id<Other>()
    make({
      init: { state: draftOf("") },
      inputs: {
        // @ts-expect-error: the optic is into another state.
        Title: input({ at: other.key("title") })
      },
      makeModel: (state) => state
    })
    make({
      init: { state: draftOf("") },
      inputs: {
        // @ts-expect-error: the optic of each id is into another state.
        Titles: inputById({ at: (id: string) => other.key("titles").at(id) })
      },
      makeModel: (state) => state
    })
  })

  test("an own message that takes the name of an input does not compile", () => {
    // @ts-expect-error: it would be routed to the input.
    program<{ state: Draft; message: Readonly<{ _tag: "Title" }> }>().make({
      init: { state: draftOf("") },
      inputs: { Title: input({ at: here.key("title") }) },
      update: () => (state) => ({ state }),
      makeModel: (state) => state
    })
  })

  test("a subscription of the program's own cannot write into an input: it sends the program's own messages", () => {
    program<{ state: Draft; message: "Dictated" }>().make({
      init: { state: draftOf("") },
      inputs: { Title: input({ at: here.key("title") }) },
      update: () => (state) => ({ state }),
      // @ts-expect-error: what is written into an input is no own message
      subscriptions: () => HashMap.make(["dictation", idle<Extract<Message, { _tag: "Title" }>>()]),
      makeModel: () => null
    })
  })

  test("a command's answer cannot write into an input: it is an own message", () => {
    const saving = program<{ state: Draft; command: "Load"; message: "Loaded" }>()
    saving.make({
      init: { state: draftOf("") },
      inputs: { Title: saving.input({ at: here.key("title") }) },
      update: () => (state) => ({ state, commands: ["Load"] }),
      runCommand: () =>
        // @ts-expect-error: what is written into an input is no own message
        Effect.succeedSome({ _tag: "Title" as const, message: { _tag: "Written" as const, value: "Ada" } }),
      makeModel: () => null
    })
    saving.make({
      init: { state: draftOf("") },
      inputs: { Title: saving.input({ at: here.key("title") }) },
      update: (_: "Loaded") => (state: Draft) => ({ state, commands: ["Load" as const] }),
      runCommand: () => Effect.succeedSome("Loaded" as const),
      makeModel: () => null
    })
  })

  test("a command's answer cannot write into a child's input either", () => {
    type Note = Readonly<{ text: string }>
    const note = program<{ state: Note }>()
    const noteProgram = note.make({
      init: { state: { text: "" } },
      inputs: { Text: note.input({ at: Optic.id<Note>().key("text") }) },
      makeModel: (state) => state
    })
    type Board = Readonly<{ loads: number }>
    const board = program<{ state: Board; command: "Load"; message: "Loaded" }>()
    const written = {
      _tag: "Note" as const,
      message: { _tag: "Text" as const, message: { _tag: "Written" as const, value: "Ada" } }
    }
    board.withChildren({ Note: board.child(noteProgram) }).make({
      init: { state: { loads: 0 } },
      update: () => (state) => ({ state, commands: ["Load"] }),
      // @ts-expect-error: what is written into the child's input is no own message of the parent
      runCommand: () => Effect.succeedSome(written),
      makeModel: () => null
    })
  })
})
