import { describe, expect, expectTypeOf, test } from "bun:test"
import * as Arr from "effect/Array"
import * as Optic from "effect/Optic"
import * as Opt from "effect/Option"
import { program } from "../compose.ts"
import { type PlaceViolation, placeViolations } from "./place-violations.ts"

// `dirty`, `writes` and `previous` are what a `set` that does more than its place leaves behind.
type Note = Readonly<{ note: string; dirty: boolean; writes: number; previous: string }>

const { input } = program<{ state: Note }>()

const clean: Note = { note: "", dirty: false, writes: 0, previous: "" }

const states: ReadonlyArray<Note> = [clean, { note: "Ada", dirty: true, writes: 3, previous: "A" }]

const values = ["", "Ada", "Grace"]

const tags = (violations: ReadonlyArray<{ readonly _tag: string }>) => [...new Set(violations.map(({ _tag }) => _tag))]

describe("placeViolations, of an input alone", () => {
  test("passes an optic of Effect's", () => {
    expect(placeViolations(input({ at: Optic.id<Note>().key("note") }), { states, values })).toEqual([])
  })

  test("passes a get and a set that change the place alone", () => {
    const place = input({ get: (state) => Opt.some(state.note), set: (state, note) => ({ ...state, note }) })
    expect(placeViolations(place, { states, values })).toEqual([])
  })

  test("passes a place whose form is apart, in store: the laws are of get and set alone", () => {
    const place = input({ at: Optic.id<Note>().key("note"), store: (note) => note.toUpperCase() })
    expect(placeViolations(place, { states, values })).toEqual([])
  })

  test("reports Changes for a set that marks the state at each write", () => {
    const place = input({
      get: (state) => Opt.some(state.note),
      set: (state, note) => ({ ...state, note, dirty: true })
    })
    expect(placeViolations(place, { states: [clean], values })[0]).toEqual({ _tag: "Changes", state: clean })
  })

  test("reports Remembers for a set that marks the state only on another value, by the write back of the value held", () => {
    const place = input({
      get: (state) => Opt.some(state.note),
      set: (state, note) => ({ ...state, note, dirty: state.dirty || note !== state.note })
    })
    expect(placeViolations(place, { states: [clean], values: ["Ada"] }))
      .toEqual([{ _tag: "Remembers", state: clean, values: ["Ada", ""] }])
  })

  test("reports Changes and Remembers for a set that counts the writes", () => {
    const place = input({
      get: (state) => Opt.some(state.note),
      set: (state, note) => ({ ...state, note, writes: state.writes + 1 })
    })
    expect(tags(placeViolations(place, { states, values }))).toEqual(["Changes", "Remembers"])
  })

  test("reports Remembers alone for a set that keeps the value that was there", () => {
    const place = input({
      get: (state) => Opt.some(state.note),
      set: (state, note) => (note === state.note ? state : { ...state, note, previous: state.note })
    })
    expect(tags(placeViolations(place, { states, values }))).toEqual(["Remembers"])
  })

  test("reports StoresAnother for a set that stores another form, on the values that are not their own form", () => {
    const place = input({
      get: (state) => Opt.some(state.note),
      set: (state, note) => ({ ...state, note: note.toUpperCase() })
    })
    expect(placeViolations(place, { states: [clean], values }))
      .toEqual([
        { _tag: "StoresAnother", state: clean, value: "Ada" },
        { _tag: "StoresAnother", state: clean, value: "Grace" }
      ])
    expect(placeViolations(place, { states: [clean], values: ["", "ADA"] })).toEqual([])
  })

  test("reports StoresAnother for a get that reads another place than its set writes", () => {
    const place = input({
      get: (state) => Opt.some(state.previous),
      set: (state, note) => ({ ...state, note })
    })
    expect(tags(placeViolations(place, { states, values }))).toContain("StoresAnother")
  })

  test("reports an optic made by hand whose replace does more, as it reports a set", () => {
    const at = Optic.makeLens<Note, string>((state) => state.note, (note, state) => ({ ...state, note, dirty: true }))
    expect(tags(placeViolations(input({ at }), { states: [clean], values }))).toContain("Changes")
  })

  test("checks nothing in a state where the place is not there, and returns no violation", () => {
    type Lock = Readonly<{ _tag: "Open"; text: string }> | Readonly<{ _tag: "Locked"; text: string }>
    const locked = program<{ state: Lock }>().input({
      get: (state) => (state._tag === "Open" ? Opt.some(state.text) : Opt.none()),
      set: () => ({ _tag: "Locked", text: "anything" })
    })
    expect(placeViolations(locked, { states: [{ _tag: "Locked", text: "" }], values })).toEqual([])
    expect(tags(placeViolations(locked, { states: [{ _tag: "Open", text: "" }], values }))).toContain("StoresAnother")
  })

  test("compares states and values with Equal, not by reference", () => {
    type Tags = Readonly<{ tags: ReadonlyArray<string> }>
    const place = program<{ state: Tags }>().input({
      get: (state) => Opt.some(state.tags),
      set: (state, tags) => ({ ...state, tags: [...tags] })
    })
    expect(placeViolations(place, { states: [{ tags: ["a"] }], values: [[], ["a", "b"]] })).toEqual([])
  })
})

type Rows = Readonly<{ rows: ReadonlyArray<Readonly<{ id: string; count: string }>>; touched: number }>

const { inputById } = program<{ state: Rows }>()

const uniform: Rows = { rows: [{ id: "a", count: "" }, { id: "b", count: "" }], touched: 0 }

const mixed: Rows = { rows: [{ id: "a", count: "1" }, { id: "b", count: "2" }], touched: 0 }

const ids = ["a", "b", "missing"]

const getRow = (state: Rows, id: string) =>
  Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.count)

describe("placeViolations, of inputs by id", () => {
  test("passes rows found by their id, and skips an id that is no row's", () => {
    const place = inputById({
      get: getRow,
      set: (state, id, count) => ({
        ...state,
        rows: state.rows.map((row) => (row.id === id ? { ...row, count } : row))
      })
    })
    expect(placeViolations(place, { states: [uniform, mixed], ids, values })).toEqual([])
  })

  test("passes a record, with an optic of the id", () => {
    type Record = Readonly<{ rows: Readonly<{ [id: string]: string }> }>
    const place = program<{ state: Record }>().inputById({
      at: (id: string) => Optic.id<Record>().key("rows").at(id)
    })
    expect(placeViolations(place, { states: [{ rows: { a: "", b: "2" } }], ids, values })).toEqual([])
  })

  test("names the id of each violation", () => {
    const place = inputById({
      get: getRow,
      set: (state, id, count) => ({
        touched: state.touched + 1,
        rows: state.rows.map((row) => (row.id === id ? { ...row, count } : row))
      })
    })
    expect(placeViolations(place, { states: [mixed], ids: ["b"], values: ["2"] }))
      .toEqual([
        { _tag: "Changes", state: mixed, id: "b" },
        { _tag: "Remembers", state: mixed, id: "b", values: ["2", "2"] }
      ])
  })

  test("reports StoresAnother for a set that writes the row after", () => {
    const place = inputById({
      get: getRow,
      set: (state, id, count) => {
        const index = state.rows.findIndex((row) => row.id === id) + 1
        return { ...state, rows: state.rows.map((row, at) => (at === index ? { ...row, count } : row)) }
      }
    })
    expect(tags(placeViolations(place, { states: [mixed], ids, values }))).toContain("StoresAnother")
  })

  test("reports ReachesAnother for a set that writes every row, where the three laws pass on rows that hold one value", () => {
    const place = inputById({
      get: getRow,
      set: (state, _, count) => ({ ...state, rows: state.rows.map((row) => ({ ...row, count })) })
    })
    expect(placeViolations(place, { states: [uniform], ids: ["a", "b"], values: ["3"] }))
      .toEqual([
        { _tag: "ReachesAnother", state: uniform, id: "a", value: "3", other: "b" },
        { _tag: "ReachesAnother", state: uniform, id: "b", value: "3", other: "a" }
      ])
    expect(tags(placeViolations(place, { states: [mixed], ids, values }))).toEqual(["Changes", "ReachesAnother"])
  })

  test("compares the ids with Equal: an id equal to the one written is no other", () => {
    type Grid = Readonly<{ cells: ReadonlyArray<Readonly<{ x: number; y: number; text: string }>> }>
    const at = (state: Grid, cell: Readonly<{ x: number; y: number }>) =>
      Arr.findFirst(state.cells, ({ x, y }) => x === cell.x && y === cell.y)
    const place = program<{ state: Grid }>().inputById({
      get: (state, cell: Readonly<{ x: number; y: number }>) => Opt.map(at(state, cell), ({ text }) => text),
      set: (state, cell, text) => ({
        cells: state.cells.map((each) => (each.x === cell.x && each.y === cell.y ? { ...each, text } : each))
      })
    })
    const grid: Grid = { cells: [{ x: 0, y: 0, text: "" }] }
    expect(placeViolations(place, { states: [grid], ids: [{ x: 0, y: 0 }, { x: 0, y: 0 }], values })).toEqual([])
  })
})

describe("placeViolations, its types", () => {
  test("are the input's", () => {
    const note = input({ at: Optic.id<Note>().key("note") })
    expectTypeOf(placeViolations(note, { states, values })).toEqualTypeOf<ReadonlyArray<PlaceViolation<Note, string>>>()
    const counts = inputById({ get: getRow, set: (state) => state })
    expectTypeOf(placeViolations(counts, { states: [uniform], ids, values }))
      .toEqualTypeOf<ReadonlyArray<PlaceViolation<Rows, string, string>>>()
  })

  test("check a state written as a literal against the input's, and are not widened by it", () => {
    type Lock = Readonly<{ _tag: "Open"; text: string }> | Readonly<{ _tag: "Locked" }>
    const text = program<{ state: Lock }>().input({
      get: (state) => (state._tag === "Open" ? Opt.some(state.text) : Opt.none()),
      set: (state, text) => (state._tag === "Open" ? { ...state, text } : state)
    })
    expect(placeViolations(text, { states: [{ _tag: "Open", text: "" }, { _tag: "Locked" }], values })).toEqual([])
    // @ts-expect-error: no case of the state is `Shut`.
    placeViolations(text, { states: [{ _tag: "Shut" }], values })
  })

  test("refuse a value of another type, inputs by id without ids, and ids for an input alone", () => {
    const note = input({ at: Optic.id<Note>().key("note") })
    const counts = inputById({ get: getRow, set: (state) => state })
    // @ts-expect-error: the note is a string.
    placeViolations(note, { states, values: [1] })
    // @ts-expect-error: inputs by id are checked at the ids given.
    placeViolations(counts, { states: [uniform], values })
    // @ts-expect-error: an input alone has no id.
    placeViolations(note, { states, ids, values })
  })
})
