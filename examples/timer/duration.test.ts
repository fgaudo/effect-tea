import { describe, expect, test } from 'bun:test'
import { isRejected } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations } from '@fgaudo/effect-tea/testing'
import * as Opt from 'effect/Option'
import * as fc from 'fast-check'
import { duration, type Message, type Model, update } from './duration.ts'

// What the model holds: the messages of its controls.
const messagesOf = (model: Model): ReadonlyArray<Message> => [model.more, ...Opt.toArray(model.less)]

describe('duration', () => {
  test('sets the minutes up and down', () => {
    expect(applyAll(update)(['More', 'More', 'Less'], { minutes: 1 }).state).toEqual({ minutes: 2 })
  })

  test('rejects going below one minute', () => {
    expect(isRejected(update('Less')({ minutes: 1 }))).toBe(true)
  })

  test('the model holds what update accepts, all of it', () => {
    const violations = dispatchViolations(update, { repeatable: () => true })
    fc.assert(fc.property(fc.integer({ min: 1, max: 1_000 }), (minutes) => {
      const state = { minutes }
      const held = messagesOf(duration.makeModel(state))
      expect(violations(state, held, ['More', 'Less'])).toEqual([])
    }))
  })
})
