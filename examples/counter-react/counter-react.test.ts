import { describe, expect, test } from 'bun:test'
import { dispatchViolations } from '@fgaudo/effect-tea/testing'
import * as fc from 'fast-check'
import { counter, type Message, type Model, update } from '../counter/counter.ts'
import { messagesSentBy } from '../react.ts'
import { view } from './view.tsx'

// The program's own tests are `counter`'s, and do not change with the renderer. What does is the view: this is
// the same check as there, through React's bridge.
describe('counter in React', () => {
  test('the view sends what update accepts, all of it', () => {
    const violations = dispatchViolations(update, { repeatable: () => true })
    fc.assert(fc.property(fc.nat(1_000), (count) => {
      const state = { count }
      const sent = messagesSentBy<Model, Message>(view, counter.makeModel(state))
      expect(violations(state, sent, ['Increment', 'Decrement'])).toEqual([])
    }))
  })
})
