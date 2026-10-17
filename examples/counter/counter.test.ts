import { describe, expect, test } from 'bun:test'
import { isRejected } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations, drive, tap } from '@fgaudo/effect-tea/testing'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import * as fc from 'fast-check'
import { messagesSentBy } from '../snabbdom.ts'
import { counter, update } from './counter.ts'
import { view } from './view.ts'

describe('counter', () => {
  // `update` alone: pure, no runtime.
  test('counts up and down', () => {
    expect(applyAll(update)(['Increment', 'Increment', 'Decrement'], 0).state).toBe(1)
  })

  test('rejects going below zero', () => {
    expect(isRejected(update('Decrement')(0))).toBe(true)
  })

  // The real view, for any count: everything it can send is accepted. Both buttons are meant to repeat.
  test('the view only sends what update accepts', () => {
    const check = dispatchViolations(update, { repeatable: () => true })
    fc.assert(fc.property(fc.nat(1_000), (count) => {
      expect(check(count, messagesSentBy(view, counter.makeModel(count)))).toEqual([])
    }))
  })

  // The program as it runs, driven like a user would.
  test('a user clicks +, + and −', async () => {
    const count = await Effect.runPromise(drive(counter, (driver) =>
      Effect.gen(function*() {
        yield* driver.send((model) => tap(model.increment))
        yield* driver.send((model) => model.count === 1 ? tap(model.increment) : Opt.none())
        yield* driver.send((model) => model.count === 2 ? tap(model.decrement) : Opt.none())
        return yield* driver.waitFor((model) => model.count === 1 ? Opt.some(model.count) : Opt.none())
      })))
    expect(count).toBe(1)
  })
})
