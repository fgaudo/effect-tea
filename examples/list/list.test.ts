import { describe, expect, test } from 'bun:test'
import { dispatchTo, isRejected, run, subscriptionsOf } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations } from '@fgaudo/effect-tea/testing'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Stream from 'effect/Stream'
import * as TestClock from 'effect/testing/TestClock'
import * as fc from 'fast-check'
import { messagesSentBy } from '../snabbdom.ts'
import { list, type Message, type Model, type State } from './list.ts'
import * as Stopwatch from './stopwatch.ts'
import { view } from './view.ts'

const added: Message = { _tag: 'AddClicked' }
const stoppedAll: Message = { _tag: 'StopAllClicked' }
const to = (id: number, message: Stopwatch.Message): Message => ({ _tag: 'Stopwatch', id, message })

const state: fc.Arbitrary<State> = fc
  .uniqueArray(
    fc.record({
      id: fc.nat(20),
      stopwatch: fc.record({
        seconds: fc.nat(),
        watch: fc.constantFrom(Stopwatch.Watch.Running(), Stopwatch.Watch.Stopped()),
      }),
    }),
    { selector: (entry) => entry.id, maxLength: 4 },
  )
  .map((entries) => ({ nextId: 21, entries }))

// What a user can ask of the list in `state`: adding, stopping all, and starting, stopping or removing each
// stopwatch.
const userMessages = (state: State) => [
  added,
  stoppedAll,
  ...state.entries.flatMap(({ id }) =>
    [Stopwatch.Message.Started(), Stopwatch.Message.Stopped(), Stopwatch.Message.RemoveClicked()].map((message) =>
      to(id, message)
    )
  ),
]

describe('list', () => {
  describe('update', () => {
    test('each stopwatch keeps its own state', () => {
      const { state } = applyAll(list.update)(
        [added, added, to(1, Stopwatch.Message.Started()), to(1, Stopwatch.Message.Ticked())],
        list.init.state,
      )
      expect(state.entries).toEqual([
        { id: 1, stopwatch: { seconds: 1, watch: Stopwatch.Watch.Running() } },
        { id: 2, stopwatch: { seconds: 0, watch: Stopwatch.Watch.Stopped() } },
      ])
    })

    test('a stopwatch that asks to be removed is removed, and its late messages are rejected', () => {
      const { state } = applyAll(list.update)([added, added, to(1, Stopwatch.Message.RemoveClicked())], list.init.state)
      expect(state.entries.map((entry) => entry.id)).toEqual([2])
      expect(isRejected(list.update(to(1, Stopwatch.Message.Stopped()))(state))).toBe(true)
    })

    test('stopping all stops the running stopwatches and leaves the others as they were', () => {
      const { state } = applyAll(list.update)(
        [added, added, added, to(1, Stopwatch.Message.Started()), to(3, Stopwatch.Message.Started()), stoppedAll],
        list.init.state,
      )
      expect(state.entries.map((entry) => entry.stopwatch.watch)).toEqual([
        Stopwatch.Watch.Stopped(),
        Stopwatch.Watch.Stopped(),
        Stopwatch.Watch.Stopped(),
      ])
      expect(HashMap.size(subscriptionsOf(list)(state))).toBe(0)
    })

    test('only running stopwatches tick, each under its own key', () => {
      const { state } = applyAll(list.update)([added, added, to(2, Stopwatch.Message.Started())], list.init.state)
      expect(Array.from(HashMap.keys(subscriptionsOf(list)(state)))).toEqual([['Stopwatch', 2, 'ticks']])
    })
  })

  test('the view sends what update accepts, all of it, and acts once when sent twice', () => {
    const violations = dispatchViolations(list.update, { repeatable: (message) => message._tag === 'AddClicked' })
    fc.assert(fc.property(state, (before) => {
      const sent = messagesSentBy<Model, Message>(view, list.makeModel(before))
      expect(violations(before, sent, userMessages(before))).toEqual([])
    }))
  })

  // What lets the view draw only the stopwatch that changed: the others keep the very same model.
  test('a message to one stopwatch leaves the model of the others as it was', () => {
    const model = list.makeModel
    const { state: before } = applyAll(list.update)([added, added], list.init.state)
    const { state: after } = applyAll(list.update)([to(2, Stopwatch.Message.Started())], before)
    expect(model(after).stopwatches[0]?.model).toBe(model(before).stopwatches[0]?.model)
    expect(model(after).stopwatches[1]?.model).not.toBe(model(before).stopwatches[1]?.model)
  })

  // As it runs, with a `TestClock`: a user adds a stopwatch and starts it, and time moves on.
  test('a running stopwatch counts the seconds that pass', async () => {
    let seconds = 0
    await Effect.runPromise(
      run(list, (frames) =>
        frames.pipe(
          Stream.tap(({ model, dispatch }) => {
            const [first] = model.stopwatches
            if (first === undefined) return dispatch(model.add)
            seconds = first.model.seconds
            return first.model.watch._tag === 'Stopped'
              ? dispatchTo(dispatch, 'Stopwatch', first.id)(first.model.watch.start)
              : Effect.void
          }),
          Stream.takeUntil(({ model }) => (model.stopwatches[0]?.model.seconds ?? 0) >= 3),
          Stream.runDrain,
        )).pipe(
          // Time moves on until three seconds have been counted: the run ends then, and so does the race.
          Effect.raceFirst(Effect.forever(TestClock.adjust('1 second').pipe(Effect.andThen(Effect.yieldNow)))),
          Effect.provide(TestClock.layer()),
        ),
    )
    expect(seconds).toBeGreaterThanOrEqual(3)
  })
})
