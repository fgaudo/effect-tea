// #region imports
import { describe, expect, test } from 'bun:test'
import { InvariantDefect, isRejected, subscriptionsOf } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations, rehearse } from '@fgaudo/effect-tea/testing'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as fc from 'fast-check'
import { messagesSentBy } from '../snabbdom.ts'
import { Bell, Command, Message, type Model, Phase, type State, timer, update } from './timer.ts'
import { timerView } from './view.ts'
// #endregion imports

// #region states
// Any valid state: every phase, with no more seconds left than the minutes set.
const state: fc.Arbitrary<State> = fc.integer({ min: 1, max: 120 }).chain((minutes) =>
  fc.record({
    minutes: fc.constant(minutes),
    phase: fc.oneof(
      fc.constant(Phase.Setting()),
      fc.integer({ min: 1, max: minutes * 60 }).map((secondsLeft) => Phase.Running({ secondsLeft })),
      fc.integer({ min: 1, max: minutes * 60 }).map((secondsLeft) => Phase.Paused({ secondsLeft })),
      fc.constant(Phase.Finished()),
    ),
  })
)

// What a user could ask of a timer: everything but the ticks, which only the clock sends.
const userMessages = [
  Message.MoreClicked(),
  Message.LessClicked(),
  Message.StartClicked(),
  Message.PauseClicked(),
  Message.ResumeClicked(),
  Message.ResetClicked(),
]

const setting = timer.init.state
// #endregion states

describe('timer', () => {
  // #region update
  describe('update', () => {
    test('sets the minutes, never below one', () => {
      expect(applyAll(update)([Message.LessClicked()], { ...setting, minutes: 2 }).state.minutes).toBe(1)
      expect(isRejected(update(Message.LessClicked())({ ...setting, minutes: 1 }))).toBe(true)
    })

    test('starts from the minutes set, and rings once at zero', () => {
      const { state, commands } = applyAll(update)(
        [Message.StartClicked(), ...Array.from({ length: 60 }, () => Message.Ticked())],
        { ...setting, minutes: 1 },
      )
      expect(state.phase).toEqual(Phase.Finished())
      expect(commands).toEqual([Command.Ring()])
    })

    test('rejects a second start, and changing the minutes while running', () => {
      const { state } = applyAll(update)([Message.StartClicked()], setting)
      expect(isRejected(update(Message.StartClicked())(state))).toBe(true)
      expect(isRejected(update(Message.MoreClicked())(state))).toBe(true)
    })

    // A tick outside the running phase cannot arrive: the subscription stops with it.
    test('dies on a tick while not running', () => {
      fc.assert(fc.property(state, (before) => {
        fc.pre(before.phase._tag !== 'Running')
        expect(() => update(Message.Ticked())(before)).toThrow(InvariantDefect)
      }))
    })
  })
  // #endregion update

  // #region subscriptions
  test('ticks exactly while running', () => {
    fc.assert(fc.property(state, (before) => {
      expect(HashMap.has(subscriptionsOf(timer)(before), 'ticks')).toBe(before.phase._tag === 'Running')
    }))
  })
  // #endregion subscriptions

  // #region view
  // For any state, the real view sends only what `update` accepts, and all of it. "+" and "−" are meant to repeat.
  test('the view sends what update accepts, all of it, and acts once when sent twice', () => {
    const violations = dispatchViolations(update, {
      repeatable: (message) => message._tag === 'MoreClicked' || message._tag === 'LessClicked',
    })
    fc.assert(fc.property(state, (before) => {
      const sent = messagesSentBy<Model, Message>(timerView, timer.makeModel(before))
      expect(violations(before, sent, userMessages)).toEqual([])
    }))
  })
  // #endregion view

  // #region rehearse
  // The last second, step by step: the test says when the tick is heard and when the bell rings.
  test('rings when the time is up, and sets again on "Again"', async () => {
    let rings = 0
    const bell = Bell.of({ ring: Effect.sync(() => rings++) })
    const finished = await Effect.runPromise(
      rehearse(
        timer,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hear('ticks', Message.Ticked())
          const finished = (yield* rehearsal.model)._tag
          expect(rings).toBe(0)
          yield* rehearsal.run((command) => command._tag === 'Ring')
          yield* rehearsal.send((model) => model._tag === 'Finished' ? Opt.some(model.reset) : Opt.none())
          expect((yield* rehearsal.model)._tag).toBe('Setting')
          return finished
        }),
        { from: { state: { minutes: 1, phase: Phase.Running({ secondsLeft: 1 }) } } },
      ).pipe(Effect.provideService(Bell, bell)),
    )
    expect(finished).toBe('Finished')
    expect(rings).toBe(1)
  })
  // #endregion rehearse
})
