import { describe, expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import { type Dispatch, dispatchTo } from './dispatch.ts'

type Row = Readonly<{ _tag: 'Row'; id: number; message: 'Inc' }>
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

const heapUsed = async () => {
  await collect()
  return process.memoryUsage().heapUsed
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
    const before = await heapUsed()
    for (let frame = 0; frame < 200; frame++) {
      for (let id = 0; id < 1_000; id++) dispatchTo(dispatch, 'Row', frame * 1_000 + id)
      await collect()
    }
    expect((await heapUsed()) - before).toBeLessThan(5_000_000)
    expect(dispatch).toBeDefined()
  })

  test('lets go of what a long list held once the list is short', async () => {
    const { dispatch } = recording()
    const before = await heapUsed()
    let shown = Array.from({ length: 100_000 }, (_, id) => dispatchTo(dispatch, 'Row', id))
    await collect()
    shown = shown.slice(0, 10)
    // Drawn again and again, the short list sweeps what the long one left.
    for (let frame = 0; frame < 20; frame++) {
      shown = Array.from({ length: 10_000 }, (_, call) => dispatchTo(dispatch, 'Row', call % 10))
      await collect()
    }
    expect((await heapUsed()) - before).toBeLessThan(3_000_000)
    expect(shown.length).toBe(10_000)
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
