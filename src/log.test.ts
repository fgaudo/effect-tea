import { describe, expect, test } from 'bun:test'
import { applyAll } from './testing/apply-all.ts'
import { reject } from './update.ts'

// The description that the logs use by default is also the one a failing test names a message with.
const describedAs = (message: unknown) => {
  try {
    applyAll<null, unknown, never, never>(() => () => reject)([message], null)
  } catch (error) {
    return String(error).replace(/^.*\((.*)\)$/s, '$1')
  }
  throw new Error('applyAll accepted the message')
}

describe('how a message is described by default', () => {
  test('by its tag, or itself if it is a string', () => {
    expect(describedAs({ _tag: 'Saved', name: 'Ada' })).toBe('Saved')
    expect(describedAs('Increment')).toBe('Increment')
    expect(describedAs(42)).toBe('number')
  })

  test('one a parent wrapped, by the tags on its way', () => {
    const deleted = { _tag: 'Deleted', id: 7 }
    expect(describedAs({ _tag: 'Home', message: { _tag: 'Products', message: deleted } }))
      .toBe('Home › Products › Deleted')
    expect(describedAs({ _tag: 'Rows', id: 3, command: { _tag: 'Save', count: 2 } })).toBe('Rows › Save')
  })

  // A description is made in the handler of a defect too: one that threw would take the defect's place.
  test('one whose wrapping comes back to a value on its way, by the tags on its way until then', () => {
    const loop: { _tag: 'Loop'; message?: unknown } = { _tag: 'Loop' }
    loop.message = loop
    expect(describedAs(loop)).toBe('Loop › …')
    const rows: { _tag: 'Rows'; message?: unknown } = { _tag: 'Rows' }
    rows.message = { _tag: 'Row', command: rows }
    expect(describedAs(rows)).toBe('Rows › Row › …')
  })

  test('never by a field named message that holds data', () => {
    expect(describedAs({ _tag: 'ToastShown', message: 'Card ending 4242 declined' })).toBe('ToastShown')
    expect(describedAs({ _tag: 'Left', message: 'Increment' })).toBe('Left')
  })
})
