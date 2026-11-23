import { describe, expect, expectTypeOf, test } from "bun:test"
import * as Optic from "effect/Optic"
import { program } from "../compose.ts"
import { defect, InvariantDefect } from "../defect.ts"
import type { MessageOf } from "../program.ts"
import { reject, type Update } from "../update.ts"
import { type DispatchViolation, dispatchViolations } from "./dispatch-violations.ts"

type State = Readonly<{ count: number; isOpen: boolean }>

// `Increment` repeats on purpose, `Opened` happens once, `Pinged` starts `Ping` every time, `Notified` raises
// `Notify` every time and changes nothing else, `Forbidden` never applies, and `Closed` changes nothing when sent
// again, and nothing at all where the state is closed, though it returns a copy of the state.
type Message = "Increment" | "Opened" | "Closed" | "Pinged" | "Notified" | "Forbidden"

const update: Update<State, Message, "Ping", "Notify"> = (message) => (state) => {
  switch (message) {
    case "Increment":
      return { state: { ...state, count: state.count + 1 } }
    case "Opened":
      return state.isOpen ? reject : { state: { ...state, isOpen: true } }
    case "Closed":
      return { state: { ...state, isOpen: false } }
    case "Pinged":
      return { state, commands: ["Ping"] }
    case "Notified":
      return { state, events: ["Notify" as const] }
    case "Forbidden":
      return reject
  }
}

const closed: State = { count: 0, isOpen: false }

describe("dispatchViolations", () => {
  const repeatable = (message: Message) => message === "Increment"

  test("accepts one-shot actions that guard themselves, repeatable ones, and messages that change nothing again", () => {
    expect(dispatchViolations(update, { state: closed, held: ["Opened", "Increment"], repeatable })).toEqual([])
    expect(
      dispatchViolations(update, { state: { ...closed, isOpen: true }, held: ["Closed", "Increment"], repeatable })
    )
      .toEqual([])
  })

  test("reports a message whose step does nothing: the same state by Equal, a copy included, repeatable or not", () => {
    expect(dispatchViolations(update, { state: closed, held: ["Closed"] })).toEqual([{
      _tag: "Inert",
      message: "Closed"
    }])
    expect(dispatchViolations(update, { state: closed, held: ["Closed"], repeatable: () => true }))
      .toEqual([{ _tag: "Inert", message: "Closed" }])
  })

  test("spares a message inert on purpose in the state, and only a step that does nothing", () => {
    const inert = (message: Message, state: State) => message === "Closed" && !state.isOpen
    expect(dispatchViolations(update, { state: closed, held: ["Closed"], inert })).toEqual([])
    expect(dispatchViolations(update, { state: { ...closed, isOpen: true }, held: ["Closed"], inert: () => false }))
      .toEqual([])
    expect(dispatchViolations(update, { state: closed, held: ["Increment", "Pinged"], inert: () => true }))
      .toEqual([{ _tag: "ActsTwice", message: "Increment" }, { _tag: "ActsTwice", message: "Pinged" }])
  })

  test("reports a message update rejects in the state the model was made from", () => {
    expect(dispatchViolations(update, { state: closed, held: ["Forbidden"], repeatable }))
      .toEqual([{ _tag: "Rejected", message: "Forbidden" }])
  })

  test("reports a message that changes the state again when sent twice", () => {
    expect(dispatchViolations(update, { state: closed, held: ["Increment"] }))
      .toEqual([{ _tag: "ActsTwice", message: "Increment" }])
  })

  test("reports a message that starts a command again when sent twice, though the state stays the same", () => {
    expect(dispatchViolations(update, { state: closed, held: ["Pinged"], repeatable }))
      .toEqual([{ _tag: "ActsTwice", message: "Pinged" }])
  })

  test("reports a message that raises an event again when sent twice, unless it repeats on purpose", () => {
    expect(dispatchViolations(update, { state: closed, held: ["Notified"], repeatable }))
      .toEqual([{ _tag: "ActsTwice", message: "Notified" }])
    expect(dispatchViolations(update, {
      state: closed,
      held: ["Notified"],
      repeatable: (message) => message === "Notified"
    })).toEqual([])
  })

  test("takes the state and the messages from update, and checks the record against them", () => {
    expectTypeOf(dispatchViolations(update, { state: closed, held: ["Opened"], candidates: ["Closed"] }))
      .toEqualTypeOf<ReadonlyArray<DispatchViolation<Message>>>()
    dispatchViolations(update, {
      state: closed,
      held: [],
      repeatable: (message) => {
        expectTypeOf(message).toEqualTypeOf<Message>()
        return false
      },
      inert: (message, state) => {
        expectTypeOf(message).toEqualTypeOf<Message>()
        expectTypeOf(state).toEqualTypeOf<State>()
        return false
      },
      withheld: (message, state) => {
        expectTypeOf(message).toEqualTypeOf<Message>()
        expectTypeOf(state).toEqualTypeOf<State>()
        return false
      }
    })
    const never = () => [
      // @ts-expect-error: a candidate that is no message of `update`'s.
      dispatchViolations(update, { state: closed, held: [], candidates: ["Unknown"] }),
      // @ts-expect-error: a state that is not `update`'s.
      dispatchViolations(update, { state: { count: 0 }, held: [] }),
      // @ts-expect-error: no messages held.
      dispatchViolations(update, { state: closed })
    ]
    expect(never).toBeDefined()
  })

  test("the InvariantDefect of defect fails it, as any error update throws, for a message held or a candidate", () => {
    const broken: Update<State, Message, "Ping", "Notify"> = (message) => (state) =>
      message === "Forbidden" ? defect("No Forbidden arrives here") : update(message)(state)
    expect(() => dispatchViolations(broken, { state: closed, held: ["Forbidden"] })).toThrow(InvariantDefect)
    expect(() => dispatchViolations(broken, { state: closed, held: [], candidates: ["Forbidden"] }))
      .toThrow(InvariantDefect)
  })
})

type Form = Readonly<{ isOpen: boolean; isSaving: boolean; text: string }>

// `Copied` returns a copy of the state, `Pinged` starts `Ping` and `Notified` raises `Notify`, each changing nothing
// else.
type FormMessage =
  | Readonly<{ _tag: "Opened" }>
  | Readonly<{ _tag: "Closed" }>
  | Readonly<{ _tag: "Typed"; text: string }>
  | Readonly<{ _tag: "Copied" }>
  | Readonly<{ _tag: "Pinged" }>
  | Readonly<{ _tag: "Notified" }>

const updateForm: Update<Form, FormMessage, "Ping", "Notify"> = (message) => (state) => {
  switch (message._tag) {
    case "Opened":
      return state.isOpen ? reject : { state: { ...state, isOpen: true } }
    case "Closed":
      return state.isOpen ? { state: { ...state, isOpen: false } } : reject
    case "Typed":
      return { state: { ...state, text: message.text } }
    case "Copied":
      return { state: { ...state } }
    case "Pinged":
      return { state, commands: ["Ping"] }
    case "Notified":
      return { state, events: ["Notify" as const] }
  }
}

const opened: FormMessage = { _tag: "Opened" }
const shut: FormMessage = { _tag: "Closed" }
const typed = (text: string): FormMessage => ({ _tag: "Typed", text })
const copied: FormMessage = { _tag: "Copied" }
const pinged: FormMessage = { _tag: "Pinged" }
const notified: FormMessage = { _tag: "Notified" }

const idle: Form = { isOpen: false, isSaving: false, text: "" }

describe("dispatchViolations, of the candidates", () => {
  test("reports what update accepts and the model does not hold", () => {
    expect(dispatchViolations(updateForm, { state: { ...idle, isOpen: true }, held: [], candidates: [opened, shut] }))
      .toEqual([{ _tag: "Missing", message: shut }])
  })

  test("ignores what update rejects, and what the model holds, compared by value", () => {
    expect(dispatchViolations(updateForm, { state: idle, held: [{ _tag: "Opened" }], candidates: [opened, shut] }))
      .toEqual([])
    expect(dispatchViolations(updateForm, { state: idle, held: [typed("milk")], candidates: [typed("milk")] }))
      .toEqual([])
  })

  test("ignores what the model withholds on purpose", () => {
    const withheld = (message: FormMessage, state: Form) => message._tag === "Typed" && state.isSaving
    expect(dispatchViolations(updateForm, {
      state: { ...idle, isSaving: true },
      held: [],
      candidates: [typed("milk")],
      withheld
    })).toEqual([])
    expect(dispatchViolations(updateForm, { state: idle, held: [], candidates: [typed("milk")], withheld }))
      .toEqual([{ _tag: "Missing", message: typed("milk") }])
  })

  test("leaves out a candidate whose step does nothing: the same state by Equal, a copy included", () => {
    expect(dispatchViolations(updateForm, { state: idle, held: [], candidates: [typed(""), copied] })).toEqual([])
  })

  test("reports a candidate that starts a command or raises an event, though the state stays the same", () => {
    expect(dispatchViolations(updateForm, { state: idle, held: [], candidates: [pinged, notified] }))
      .toEqual([{ _tag: "Missing", message: pinged }, { _tag: "Missing", message: notified }])
  })

  test("reports both ways at once, what is sent first", () => {
    expect(dispatchViolations(updateForm, { state: idle, held: [shut], candidates: [opened] }))
      .toEqual([{ _tag: "Rejected", message: shut }, { _tag: "Missing", message: opened }])
  })
})

// A sheet of counts by id, which the outside writes into, and a model that shows rows by the state's own list, as a
// broken `makeModel` would: a row may be editable where the state has no count, or read-only where it has one.
type Sheet = Readonly<{
  counts: Readonly<Record<string, string>>
  rows: ReadonlyArray<Readonly<{ id: string; editable: boolean }>>
}>

const Sheet = program<{ state: Sheet }>()

const sheet = Sheet.make({
  init: { state: { counts: {}, rows: [] } },
  inputs: { Count: Sheet.inputById({ at: (id: string) => Optic.id<Sheet>().key("counts").at(id) }) },
  makeModel: ({ counts, rows }) => rows.map(({ id, editable }) => ({ id, text: counts[id] ?? "", editable }))
})

type Row = ReturnType<typeof sheet.makeModel>[number]

// A write of a value other than the one the row shows, so that its step does something.
const writeOver = ({ id, text }: Row): MessageOf<typeof sheet> => ({
  _tag: "Count",
  id,
  message: { _tag: "Written", value: `${text}0` }
})

describe("dispatchViolations, of the writes into an input", () => {
  test("Rejected finds an editor with no place to write into, and Missing a place the model shows as read-only", () => {
    const state: Sheet = {
      counts: { milk: "1", tea: "2" },
      rows: [{ id: "milk", editable: true }, { id: "eggs", editable: true }, { id: "tea", editable: false }]
    }
    const rows = sheet.makeModel(state)
    expect(dispatchViolations(sheet.update, {
      state,
      held: rows.filter(({ editable }) => editable).map(writeOver),
      candidates: rows.map(writeOver)
    })).toEqual([
      { _tag: "Rejected", message: { _tag: "Count", id: "eggs", message: { _tag: "Written", value: "0" } } },
      { _tag: "Missing", message: { _tag: "Count", id: "tea", message: { _tag: "Written", value: "20" } } }
    ])
  })
})
