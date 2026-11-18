import { describe, expect, test } from 'bun:test'
import { reject } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations } from '@fgaudo/effect-tea/testing'
import * as Opt from 'effect/Option'
import * as fc from 'fast-check'
import { messagesSentBy } from '../bridges/snabbdom-testing.ts'
import { duration, type Message, type Model, update } from './duration.ts'
import { durationView } from './view.ts'

// What the model holds: the messages of its controls, in the order the view draws them, for the test of the view
// below.
const messagesOf = (model: Model): ReadonlyArray<Message> => [...Opt.toArray(model.less), model.more]

describe('duration', () => {
  test('sets the minutes up and down', () => {
    expect(applyAll(update)(['More', 'More', 'Less'], { minutes: 1 }).state).toEqual({ minutes: 2 })
  })

  test('rejects going below one minute', () => {
    expect(update('Less')({ minutes: 1 })).toBe(reject)
  })

  test('the model holds what update accepts, all of it', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 1_000 }), (minutes) => {
      const state = { minutes }
      expect(dispatchViolations(update, {
        state,
        held: messagesOf(duration.makeModel(state)),
        candidates: ['More', 'Less'],
        repeatable: () => true,
      })).toEqual([])
    }))
  })

  // Beyond what the library asks: that the view draws what its model holds, each control once. `messagesSentBy`,
  // beside the snabbdom bridge, is its way to see it without a DOM.
  test('the view sends what its model holds', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 1_000 }), (minutes) => {
      const model = duration.makeModel({ minutes })
      expect(messagesSentBy<Model, Message>(durationView, model)).toEqual(messagesOf(model))
    }))
  })
})
