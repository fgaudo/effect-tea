import { describe, expect, test } from 'bun:test'
import { defect, InvariantDefect } from './defect.ts'

describe('defect', () => {
  test('throws an InvariantDefect that carries its reason, as its message too', () => {
    const thrown = (() => {
      try {
        return defect('A save completed while nothing was saving')
      } catch (error) {
        return error
      }
    })()
    expect(thrown).toBeInstanceOf(InvariantDefect)
    expect(thrown).toMatchObject({
      _tag: 'InvariantDefect',
      reason: 'A save completed while nothing was saving',
      message: 'A save completed while nothing was saving',
    })
  })
})
