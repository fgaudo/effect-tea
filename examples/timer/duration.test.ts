import { describe, expect, test } from 'bun:test'
import { isRejected } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations } from '@fgaudo/effect-tea/testing'
import * as fc from 'fast-check'
import { messagesSentBy } from '../snabbdom.ts'
import { duration, type Message, type Model, update } from './duration.ts'
import { durationView } from './view.ts'

describe('duration', () => {
  test('sets the minutes up and down', () => {
    expect(applyAll(update)(['More', 'More', 'Less'], { minutes: 1 }).state).toEqual({ minutes: 2 })
  })

  test('rejects going below one minute', () => {
    expect(isRejected(update('Less')({ minutes: 1 }))).toBe(true)
  })

  test('the view sends what update accepts, all of it', () => {
    const violations = dispatchViolations(update, { repeatable: () => true })
    fc.assert(fc.property(fc.integer({ min: 1, max: 1_000 }), (minutes) => {
      const state = { minutes }
      const sent = messagesSentBy<Model, Message>(durationView, duration.makeModel(state))
      expect(violations(state, sent, ['More', 'Less'])).toEqual([])
    }))
  })
})
