import { describe, expect, test } from 'bun:test'
import { dispatchViolations } from '@fgaudo/effect-tea/testing'
import * as fc from 'fast-check'
import { form, Message, type Model, Save, type State, update } from '../form/form.ts'
import { messagesSentBy } from '../react.ts'
import { view } from './view.tsx'

// The program's own tests are `form`'s, and do not change with the renderer. What does is the view: this is the
// same check as there, through React's bridge.
const state: fc.Arbitrary<State> = fc.record({
  name: fc.record({ text: fc.oneof(fc.string(), fc.constant('   ')), revision: fc.nat() }),
  save: fc.oneof(
    fc.constant(Save.Idle()),
    fc.constant(Save.Saving()),
    fc.record({ name: fc.string() }).map((failed) => Save.Failed(failed)),
  ),
  saved: fc.array(fc.string({ minLength: 1 }), { maxLength: 3 }),
})

describe('form in React', () => {
  test('the view sends what update accepts, all of it, and acts once when sent twice', () => {
    const violations = dispatchViolations(update, {
      withheld: (message, state) => message._tag === 'NameChanged' && state.save._tag === 'Saving',
    })
    fc.assert(fc.property(state, fc.string(), (before, typed) => {
      const sent = messagesSentBy<Model, Message>(view, form.makeModel(before), typed)
      const candidates = [Message.NameChanged({ name: typed }), Message.SaveClicked()]
      expect(violations(before, sent, candidates)).toEqual([])
    }))
  })
})
