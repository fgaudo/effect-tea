// #region imports
import { describe, expect, test } from 'bun:test'
import { InvariantDefect, reject, subscriptionsOf } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations, rehearse } from '@fgaudo/effect-tea/testing'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as fc from 'fast-check'
import { timerMessages } from './timer.test_reader.ts'
import { Bell, Command, type Message, Phase, type State, timer, update } from './timer.ts'
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

// What a user could ask of a timer, a tag at a time: everything but the ticks, which only the clock sends. A new
// message of the timer does not compile here until the test says what a user could ask with it.
const userMessages: ReadonlyArray<Message> = Object.values(
  {
    MoreClicked: [{ _tag: 'MoreClicked' }],
    LessClicked: [{ _tag: 'LessClicked' }],
    StartClicked: [{ _tag: 'StartClicked' }],
    PauseClicked: [{ _tag: 'PauseClicked' }],
    ResumeClicked: [{ _tag: 'ResumeClicked' }],
    ResetClicked: [{ _tag: 'ResetClicked' }],
    Ticked: [],
  } satisfies { [Tag in Message['_tag']]: ReadonlyArray<Extract<Message, { _tag: Tag }>> },
).flat()

const setting = timer.init.state
// #endregion states

describe('timer', () => {
  // #region update
  describe('update', () => {
    test('sets the minutes, never below one', () => {
      expect(applyAll(update)([{ _tag: 'LessClicked' }], { ...setting, minutes: 2 }).state.minutes).toBe(1)
      expect(update({ _tag: 'LessClicked' })({ ...setting, minutes: 1 })).toBe(reject)
    })

    test('starts from the minutes set, and rings once at zero', () => {
      const { state, commands } = applyAll(update)(
        [{ _tag: 'StartClicked' }, ...Array.from({ length: 60 }, (): Message => ({ _tag: 'Ticked' }))],
        { ...setting, minutes: 1 },
      )
      expect(state.phase).toEqual(Phase.Finished())
      expect(commands).toEqual([Command.Ring()])
    })

    test('rejects a second start, and changing the minutes while running', () => {
      const { state } = applyAll(update)([{ _tag: 'StartClicked' }], setting)
      expect(update({ _tag: 'StartClicked' })(state)).toBe(reject)
      expect(update({ _tag: 'MoreClicked' })(state)).toBe(reject)
    })

    // A tick outside the running phase cannot arrive: the subscription stops with it.
    test('dies on a tick while not running', () => {
      fc.assert(fc.property(state, (before) => {
        fc.pre(before.phase._tag !== 'Running')
        expect(() => update({ _tag: 'Ticked' })(before)).toThrow(InvariantDefect)
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

  // #region model
  // For any state, the model holds only what `update` accepts, and all of it. "+" and "−" are meant to repeat.
  test('the model holds what update accepts, all of it, and each acts once when sent twice', () => {
    const violations = dispatchViolations(update, {
      repeatable: (message) => message._tag === 'MoreClicked' || message._tag === 'LessClicked',
    })
    fc.assert(fc.property(state, (before) => {
      const held = timerMessages(timer.makeModel(before))
      expect(violations(before, held, userMessages)).toEqual([])
    }))
  })
  // #endregion model

  // #region rehearse
  // The last second, step by step: the test says when the tick is heard and when the bell rings.
  test('rings when the time is up, and sets again on "Again"', async () => {
    let rings = 0
    const bell = Bell.of({ ring: Effect.sync(() => rings++) })
    const finished = await Effect.runPromise(
      rehearse(
        { ...timer, init: { state: { minutes: 1, phase: Phase.Running({ secondsLeft: 1 }) } } },
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hear('ticks', { _tag: 'Ticked' })
          const finished = (yield* rehearsal.model)._tag
          expect(rings).toBe(0)
          yield* rehearsal.run((command) => command._tag === 'Ring')
          yield* rehearsal.send((model) => model._tag === 'Finished' ? Opt.some(model.reset) : Opt.none())
          expect((yield* rehearsal.model)._tag).toBe('Setting')
          return finished
        }),
      ).pipe(Effect.provideService(Bell, bell)),
    )
    expect(finished).toBe('Finished')
    expect(rings).toBe(1)
  })
  // #endregion rehearse
})
