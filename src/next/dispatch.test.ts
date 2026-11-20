// The tests of `forwardTo` over the dispatch of `docs/records/synchronous-dispatch.md`, a plain function, written beside
// `src/dispatch.test.ts` until its stage 4.
import { describe, expect, test } from "bun:test"
import * as Equal from "effect/Equal"
import * as Hash from "effect/Hash"
import { collectGarbage } from "../../test/gc.test_helper.ts"
import { type Dispatch, entriesOf, forwardTo } from "./dispatch.ts"

type Row = Readonly<{ _tag: "Row"; id: number | readonly [string, number]; message: "Inc" }>
type Clock = Readonly<{ _tag: "Clock"; message: "Tick" }>
// A message of the parent's own: its `message` field is data, not a child's message.
type Toast = Readonly<{ _tag: "Toast"; message: string; level: number }>
type Message = Row | Clock | Toast

/** A dispatch that keeps what it is sent. */
const recording = () => {
  const sent: Array<Message> = []
  const dispatch: Dispatch<Message> = (message) => void sent.push(message)
  return { sent, dispatch }
}

/** Ends the current job and collects: a weak reference keeps its target until its job ends. */
const collect = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  collectGarbage()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

// Drawn by a function of its own, whose frame is gone when collecting: a collector that scans the stack could
// otherwise take a stale reference there for a live one.
const draw = (dispatch: Dispatch<Message>, ids: ReadonlyArray<number>) => {
  for (const id of ids) forwardTo(dispatch, "Row", id)
}

// A dispatch nobody holds, but through a weak reference that tells when it is collected.
const drawnWeakly = (dispatch: Dispatch<Message>, id: number) => new WeakRef(forwardTo(dispatch, "Row", id))

const range = (from: number, count: number) => Array.from({ length: count }, (_, index) => from + index)

/**
 * The entries left for the rows of `dispatch` once collections are done with them. A collector may keep a few
 * dispatches nobody holds for a while: it is given a few collections, and the entries it keeps are those.
 */
const entriesLeft = async (dispatch: Dispatch<Message>, atMost: number) => {
  let left = entriesOf(dispatch, "Row")
  for (let collection = 0; collection < 10 && left > atMost; collection++) {
    await collect()
    left = entriesOf(dispatch, "Row")
  }
  return left
}

describe("forwardTo", () => {
  test("wraps a child's messages as the parent receives them, with the id of a child by id", () => {
    const { sent, dispatch } = recording()
    forwardTo(dispatch, "Clock")("Tick")
    forwardTo(dispatch, "Row", 7)("Inc")
    expect(sent).toEqual([{ _tag: "Clock", message: "Tick" }, { _tag: "Row", id: 7, message: "Inc" }])
  })

  test("gives a function someone holds every time it is asked for, through collections and new ids", async () => {
    const { dispatch } = recording()
    const clock = forwardTo(dispatch, "Clock")
    const row = forwardTo(dispatch, "Row", 1)
    for (let round = 0; round < 20; round++) {
      for (let id = 2; id < 2_000; id++) forwardTo(dispatch, "Row", round * 10_000 + id)
      await collect()
      expect(forwardTo(dispatch, "Clock")).toBe(clock)
      expect(forwardTo(dispatch, "Row", 1)).toBe(row)
    }
  })

  // A list whose rows get ids that are never reused, as the guide advises.
  // Two hundred full collections take about six seconds on V8 (`bun run test:node`).
  test("keeps nothing for the ids nobody holds", async () => {
    const { dispatch } = recording()
    for (let frame = 0; frame < 200; frame++) {
      draw(dispatch, range(frame * 1_000, 1_000))
      await collect()
    }
    expect(await entriesLeft(dispatch, 10)).toBeLessThanOrEqual(10)
  }, 30_000)

  test("lets go of what a long list held once the list is no longer drawn", async () => {
    const { dispatch } = recording()
    draw(dispatch, range(0, 100_000))
    expect(entriesOf(dispatch, "Row")).toBe(100_000)
    expect(await entriesLeft(dispatch, 1_000)).toBeLessThanOrEqual(1_000)
  })

  // The entry of a collected dispatch goes after the collection, when a new dispatch may have taken its place. The
  // new one is made in the job of the collection that took the first, before the collector's callback can run.
  test("keeps the entry of a new dispatch made for the id of a collected one", async () => {
    const { dispatch } = recording()
    const first = drawnWeakly(dispatch, 1)
    let row: Dispatch<"Inc"> | undefined
    for (let collection = 0; collection < 10 && row === undefined; collection++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      collectGarbage()
      if (first.deref() === undefined) row = forwardTo(dispatch, "Row", 1)
    }
    if (row === undefined) throw new Error("The first dispatch was never collected")
    await collect()
    await collect()
    expect(forwardTo(dispatch, "Row", 1)).toBe(row)
    expect(entriesOf(dispatch, "Row")).toBe(1)
  })

  // The collector's callback runs in a host job, outside any run, where an id's `Equal` that throws would be no
  // defect of a run. It compares only pairs already compared while the dispatches were made, in either order of
  // collection: `Equal` keeps its results by reference.
  test("lets go of collected dispatches without comparing ids again", async () => {
    const compared: Array<string> = []
    let collecting = false
    class Colliding implements Equal.Equal {
      readonly name: string
      constructor(name: string) {
        this.name = name
      }
      [Equal.symbol](that: Equal.Equal): boolean {
        if (collecting) compared.push(`${this.name}=${(that as Colliding).name}`)
        return this === that
      }
      [Hash.symbol](): number {
        return 0
      }
    }
    const sent: Array<unknown> = []
    const dispatch: Dispatch<Readonly<{ _tag: "Row"; id: Colliding; message: "Inc" }>> = (message) =>
      void sent.push(message)
    const drawAll = () => {
      for (const name of ["a", "b", "c", "d"]) forwardTo(dispatch, "Row", new Colliding(name))
    }
    drawAll()
    expect(entriesOf(dispatch, "Row")).toBe(4)
    collecting = true
    for (let collection = 0; collection < 10 && entriesOf(dispatch, "Row") > 0; collection++) await collect()
    expect(entriesOf(dispatch, "Row")).toBe(0)
    expect(compared).toEqual([])
  })

  test("tells ids apart by value, as subscription keys are", () => {
    const { sent, dispatch } = recording()
    const row = forwardTo(dispatch, "Row", ["milk", 1])
    expect(forwardTo(dispatch, "Row", ["milk", 1])).toBe(row)
    expect(forwardTo(dispatch, "Row", ["milk", 2])).not.toBe(row)
    row("Inc")
    expect(sent).toEqual([{ _tag: "Row", id: ["milk", 1], message: "Inc" }])
  })

  test("takes only the literal name of a child", () => {
    const { dispatch } = recording()
    const name: string = "Clock"
    // @ts-expect-error: any string could name any child, whose messages would be mixed up.
    expect(() => forwardTo(dispatch, name)("Tick")).toBeDefined()
    // @ts-expect-error: a message of the parent's own, which would be sent without its `level`.
    expect(() => forwardTo(dispatch, "Toast")("hello")).toBeDefined()
    // @ts-expect-error: a child by id needs its id.
    expect(() => forwardTo(dispatch, "Row")("Inc")).toBeDefined()
  })

  test("says that a name is neither a child's nor an input's, or that it is not a literal", () => {
    const { dispatch } = recording()
    const name: string = "Clock"
    const unknown: Readonly<{ "is not a child or an input": "Clok" }> = forwardTo(dispatch, "Clok")
    const any: Readonly<{ "is not the literal name of a child or of an input": string }> = forwardTo(dispatch, name)
    expect([unknown, any]).toHaveLength(2)
  })
})
