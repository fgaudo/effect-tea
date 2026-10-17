import { describe, expect, test } from 'bun:test'
import { type Dispatch, isRejected, mapDispatch, modelOf, type Offered } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations, drive, missingOffers, tap } from '@fgaudo/effect-tea/testing'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as TestClock from 'effect/testing/TestClock'
import * as fc from 'fast-check'
import { messagesSentBy } from '../snabbdom.ts'
import { list, Message, type State, subscriptions, update } from './list.ts'
import * as Stopwatch from './stopwatch.ts'
import { view } from './view.ts'

const added = Message.AddClicked()
const to = (id: number, message: Stopwatch.Message) => Message.GotStopwatch({ id, message })

const state: fc.Arbitrary<State> = fc
  .uniqueArray(
    fc.record({ id: fc.nat(20), stopwatch: fc.record({ seconds: fc.nat(), isRunning: fc.boolean() }) }),
    { selector: (entry) => entry.id, maxLength: 4 },
  )
  .map((entries) => ({ nextId: 21, entries }))

/** The keys of the running subscriptions: `embedEach` namespaces each one with the id of its stopwatch. */
const subscriptionKeys = (state: State) => Array.from(HashMap.keys(subscriptions(state)))

// An action on a stopwatch's offer, wrapped with its id as the parent's view wraps it.
const onStopwatch = (id: number, message: Offered<Stopwatch.Message>) => (dispatch: Dispatch<Message>) =>
  tap(message)(mapDispatch(dispatch, (message) => Message.GotStopwatch({ id, message })))

// What a user can ask of the list in `state`: adding, and starting, stopping or removing each stopwatch.
const userMessages = (state: State) => [
  added,
  ...state.entries.flatMap(({ id }) =>
    [Stopwatch.Message.Started(), Stopwatch.Message.Stopped(), Stopwatch.Message.RemoveClicked()].map((message) =>
      to(id, message)
    )
  ),
]

describe('list', () => {
  // The parent's `update`: each message reaches the stopwatch with its id, and only that one.
  describe('update', () => {
    test('each stopwatch keeps its own state', () => {
      const { state } = applyAll(update)(
        [added, added, to(1, Stopwatch.Message.Started()), to(1, Stopwatch.Message.Ticked())],
        list.init.state,
      )
      expect(state.entries).toEqual([
        { id: 1, stopwatch: { seconds: 1, isRunning: true } },
        { id: 2, stopwatch: { seconds: 0, isRunning: false } },
      ])
    })

    test('a stopwatch that asks to be removed is removed, and its late messages are rejected', () => {
      const { state } = applyAll(update)([added, added, to(1, Stopwatch.Message.RemoveClicked())], list.init.state)
      expect(state.entries.map((entry) => entry.id)).toEqual([2])
      expect(isRejected(update(to(1, Stopwatch.Message.Ticked()))(state))).toBe(true)
    })

    test('a tick after the stopwatch stopped is rejected', () => {
      const { state } = applyAll(update)([added], list.init.state)
      expect(isRejected(update(to(1, Stopwatch.Message.Ticked()))(state))).toBe(true)
    })

    test('only running stopwatches tick, each under its own key', () => {
      const { state } = applyAll(update)([added, added, to(2, Stopwatch.Message.Started())], list.init.state)
      expect(subscriptionKeys(state)).toEqual([['Stopwatch', 2, 'ticks']])
    })
  })

  // The real view, for any list: everything it sends is accepted, and nothing `update` accepts is missing.
  // Adding is meant to repeat.
  test('the view sends what update accepts, all of it, and acts once when sent twice', () => {
    const violations = dispatchViolations(update, { repeatable: (message) => message._tag === 'AddClicked' })
    const missing = missingOffers(update)
    fc.assert(fc.property(state, (before) => {
      const sent = messagesSentBy(view, modelOf(list)(before))
      expect(violations(before, sent)).toEqual([])
      expect(missing(before, sent, userMessages(before))).toEqual([])
    }))
  })

  // The program as it runs, with a `TestClock`: the test moves time forward instead of waiting for it. The
  // driver's own waits use the real clock, so they still end.
  test('a running stopwatch counts the seconds that pass', async () => {
    const seconds = await Effect.runPromise(
      drive(list, (driver) =>
        Effect.gen(function*() {
          yield* driver.send((model) => Opt.some(tap(model.add)))
          yield* driver.send((model) =>
            Opt.flatMap(
              Opt.fromNullishOr(model.stopwatches[0]),
              ({ id, model }) =>
                model.watch._tag === 'Stopped' ? Opt.some(onStopwatch(id, model.watch.start)) : Opt.none(),
            )
          )
          // Time moves on until three seconds have been counted.
          return yield* driver.waitFor((model) =>
            Opt.filter(Opt.map(Opt.fromNullishOr(model.stopwatches[0]), ({ model }) => model.seconds), (s) => s >= 3)
          ).pipe(Effect.raceFirst(Effect.forever(TestClock.adjust('1 second').pipe(Effect.andThen(Effect.yieldNow)))))
        })).pipe(Effect.provide(TestClock.layer())),
    )
    expect(seconds).toBeGreaterThanOrEqual(3)
  })
})
