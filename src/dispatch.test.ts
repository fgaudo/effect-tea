import { describe, expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import { type Dispatch, dispatchTo, entriesOf } from './dispatch.ts'

type Row = Readonly<{ _tag: 'Row'; id: number | readonly [string, number]; message: 'Inc' }>
type Clock = Readonly<{ _tag: 'Clock'; message: 'Tick' }>
// A message of the parent's own: its `message` field is data, not a child's message.
type Toast = Readonly<{ _tag: 'Toast'; message: string; level: number }>
type Message = Row | Clock | Toast

/** A dispatch that keeps what it is sent. */
const recording = () => {
  const sent: Array<Message> = []
  const dispatch: Dispatch<Message> = (message) => Effect.sync(() => sent.push(message))
  return { sent, dispatch }
}

/** Ends the current job and collects: a weak reference keeps its target until its job ends. */
const collect = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  Bun.gc(true)
  await new Promise((resolve) => setTimeout(resolve, 0))
}

// Drawn by a function of its own, whose frame is gone when collecting: a collector that scans the stack could
// otherwise take a stale reference there for a live one.
const draw = (dispatch: Dispatch<Message>, ids: ReadonlyArray<number>) => {
  for (const id of ids) dispatchTo(dispatch, 'Row', id)
}

const range = (from: number, count: number) => Array.from({ length: count }, (_, index) => from + index)

/**
 * The entries left for the rows of `dispatch` once collections are done with them. A collector may keep a few
 * dispatches nobody holds for a while: it is given a few collections, and the entries it keeps are those.
 */
const entriesLeft = async (dispatch: Dispatch<Message>, atMost: number) => {
  let left = entriesOf(dispatch, 'Row')
  for (let collection = 0; collection < 10 && left > atMost; collection++) {
    await collect()
    left = entriesOf(dispatch, 'Row')
  }
  return left
}

describe('dispatchTo', () => {
  test('wraps a child\'s messages as the parent receives them, with the id of a child by id', () => {
    const { sent, dispatch } = recording()
    Effect.runSync(dispatchTo(dispatch, 'Clock')('Tick'))
    Effect.runSync(dispatchTo(dispatch, 'Row', 7)('Inc'))
    expect(sent).toEqual([{ _tag: 'Clock', message: 'Tick' }, { _tag: 'Row', id: 7, message: 'Inc' }])
  })

  test('gives a function someone holds every time it is asked for, through collections and new ids', async () => {
    const { dispatch } = recording()
    const clock = dispatchTo(dispatch, 'Clock')
    const row = dispatchTo(dispatch, 'Row', 1)
    for (let round = 0; round < 20; round++) {
      for (let id = 2; id < 2_000; id++) dispatchTo(dispatch, 'Row', round * 10_000 + id)
      await collect()
      expect(dispatchTo(dispatch, 'Clock')).toBe(clock)
      expect(dispatchTo(dispatch, 'Row', 1)).toBe(row)
    }
  })

  // A list whose rows get ids that are never reused, as the README advises.
  test('keeps nothing for the ids nobody holds', async () => {
    const { dispatch } = recording()
    for (let frame = 0; frame < 200; frame++) {
      draw(dispatch, range(frame * 1_000, 1_000))
      await collect()
    }
    expect(await entriesLeft(dispatch, 10)).toBeLessThanOrEqual(10)
  })

  test('lets go of what a long list held once the list is no longer drawn', async () => {
    const { dispatch } = recording()
    draw(dispatch, range(0, 100_000))
    expect(entriesOf(dispatch, 'Row')).toBe(100_000)
    expect(await entriesLeft(dispatch, 1_000)).toBeLessThanOrEqual(1_000)
  })

  // The entry of a collected dispatch goes after the collection, when a new dispatch may have taken its place.
  test('keeps the entry of a new dispatch made for the id of a collected one', async () => {
    const { dispatch } = recording()
    draw(dispatch, [1])
    await new Promise((resolve) => setTimeout(resolve, 0))
    Bun.gc(true)
    const row = dispatchTo(dispatch, 'Row', 1)
    await collect()
    await collect()
    expect(dispatchTo(dispatch, 'Row', 1)).toBe(row)
    expect(entriesOf(dispatch, 'Row')).toBe(1)
  })

  test('tells ids apart by value, as subscription keys are', () => {
    const { sent, dispatch } = recording()
    const row = dispatchTo(dispatch, 'Row', ['milk', 1])
    expect(dispatchTo(dispatch, 'Row', ['milk', 1])).toBe(row)
    expect(dispatchTo(dispatch, 'Row', ['milk', 2])).not.toBe(row)
    Effect.runSync(row('Inc'))
    expect(sent).toEqual([{ _tag: 'Row', id: ['milk', 1], message: 'Inc' }])
  })

  test('takes only the literal name of a child', () => {
    const { dispatch } = recording()
    const name: string = 'Clock'
    // @ts-expect-error: any string could name any child, whose messages would be mixed up.
    expect(() => dispatchTo(dispatch, name)('Tick')).toBeDefined()
    // @ts-expect-error: a message of the parent's own, which would be sent without its `level`.
    expect(() => dispatchTo(dispatch, 'Toast')('hello')).toBeDefined()
    // @ts-expect-error: a child by id needs its id.
    expect(() => dispatchTo(dispatch, 'Row')('Inc')).toBeDefined()
  })
})
