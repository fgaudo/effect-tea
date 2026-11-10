import { describe, expect, test } from 'bun:test'
import { isRejected, subscriptionsOf } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations } from '@fgaudo/effect-tea/testing'
import * as HashMap from 'effect/HashMap'
import * as fc from 'fast-check'
import { messagesSentBy } from '../snabbdom.ts'
import * as Timer from './timer.ts'
import { type Message, type Model, type State, timers } from './timers.ts'
import { view } from './view.ts'

// #region messages
const added: Message = { _tag: 'AddClicked' }
const removed = (id: number): Message => ({ _tag: 'RemoveClicked', id })
const to = (id: number, message: Timer.Message): Message => ({ _tag: 'Timer', id, message })
// #endregion messages

const state: fc.Arbitrary<State> = fc
  .uniqueArray(
    fc.record({
      id: fc.nat(20),
      timer: fc.record({
        minutes: fc.constant(1),
        phase: fc.constantFrom(
          Timer.Phase.Setting(),
          Timer.Phase.Running({ secondsLeft: 30 }),
          Timer.Phase.Paused({ secondsLeft: 30 }),
          Timer.Phase.Finished(),
        ),
      }),
    }),
    { selector: (entry) => entry.id, maxLength: 4 },
  )
  .map((entries) => ({ nextId: 21, entries }))

// What a user can ask of the list: adding a timer, and removing or using each one.
const userMessages = (state: State) => [
  added,
  ...state.entries.flatMap(({ id }) => [
    removed(id),
    ...[
      Timer.Message.MoreClicked(),
      Timer.Message.LessClicked(),
      Timer.Message.StartClicked(),
      Timer.Message.PauseClicked(),
      Timer.Message.ResumeClicked(),
      Timer.Message.ResetClicked(),
    ].map((message) => to(id, message)),
  ]),
]

describe('timers', () => {
  // #region update
  test('each timer keeps its own state', () => {
    const { state } = applyAll(timers.update)([added, to(2, Timer.Message.StartClicked())], timers.init.state)
    expect(state.entries.map((entry) => entry.timer.phase._tag)).toEqual(['Setting', 'Running'])
  })

  test('a removed timer is gone, and a second click on "Remove" is rejected', () => {
    const { state } = applyAll(timers.update)([added, removed(1)], timers.init.state)
    expect(state.entries.map((entry) => entry.id)).toEqual([2])
    expect(isRejected(timers.update(removed(1))(state))).toBe(true)
    expect(isRejected(timers.update(to(1, Timer.Message.StartClicked()))(state))).toBe(true)
  })

  test('only running timers tick, each under its own key', () => {
    const { state } = applyAll(timers.update)([added, to(2, Timer.Message.StartClicked())], timers.init.state)
    expect(Array.from(HashMap.keys(subscriptionsOf(timers)(state)))).toEqual([['Timer', 2, 'ticks']])
  })
  // #endregion update

  test('the view sends what update accepts, all of it, and acts once when sent twice', () => {
    const violations = dispatchViolations(timers.update, {
      repeatable: (message) =>
        message._tag === 'AddClicked'
        || (message._tag === 'Timer'
          && (message.message._tag === 'MoreClicked' || message.message._tag === 'LessClicked')),
    })
    fc.assert(fc.property(state, (before) => {
      const sent = messagesSentBy<Model, Message>(view, timers.makeModel(before))
      expect(violations(before, sent, userMessages(before))).toEqual([])
    }))
  })
})
