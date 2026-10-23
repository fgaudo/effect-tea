import { describe, expect, test } from 'bun:test'
import { isRejected } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations, drive, missingActions } from '@fgaudo/effect-tea/testing'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import * as fc from 'fast-check'
import { messagesSentBy } from '../snabbdom.ts'
import { counter, type Message, type Model, update } from './counter.ts'
import { view } from './view.ts'

describe('counter', () => {
  // `update` alone: pure, no runtime.
  test('counts up and down', () => {
    expect(applyAll(update)(['Increment', 'Increment', 'Decrement'], 0).state).toBe(1)
  })

  test('rejects going below zero', () => {
    expect(isRejected(update('Decrement')(0))).toBe(true)
  })

  // The real view, for any count: everything it can send is accepted, and nothing `update` accepts is
  // missing from it. Both buttons are meant to repeat.
  test('the view sends what update accepts, all of it', () => {
    const violations = dispatchViolations(update, { repeatable: () => true })
    const missing = missingActions(update)
    fc.assert(fc.property(fc.nat(1_000), (count) => {
      const sent = messagesSentBy<Model, Message>(view, counter.makeModel(count))
      expect(violations(count, sent)).toEqual([])
      expect(missing(count, sent, ['Increment', 'Decrement'])).toEqual([])
    }))
  })

  // The program as it runs, driven like a user would.
  test('a user clicks +, + and −', async () => {
    const count = await Effect.runPromise(drive(
      counter,
      Effect.fnUntraced(function*(driver) {
        yield* driver.send((model) => Opt.some(model.increment))
        yield* driver.send((model) => model.count === 1 ? Opt.some(model.increment) : Opt.none())
        yield* driver.send((model) =>
          model._tag === 'Counting' && model.count === 2 ? Opt.some(model.decrement) : Opt.none()
        )
        return yield* driver.waitFor((model) => model.count === 1 ? Opt.some(model.count) : Opt.none())
      }),
    ))
    expect(count).toBe(1)
  })
})
