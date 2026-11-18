import { describe, expect, test } from 'bun:test'
import { reject, subscriptionsOf } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations } from '@fgaudo/effect-tea/testing'
import * as HashMap from 'effect/HashMap'
import * as fc from 'fast-check'
import { messagesSentBy } from '../bridges/snabbdom-testing.ts'
import { timerMessages } from './timer.test_reader.ts'
import * as Timer from './timer.ts'
import { type Message, type Model, type State, timers } from './timers.ts'
import { view } from './view.ts'

// #region messages
const added: Message = { _tag: 'AddClicked' }
const removed = (id: number): Message => ({ _tag: 'RemoveClicked', id })
const to = (id: number, message: Timer.Message): Message => ({ _tag: 'Timer', id, message })
// #endregion messages

// #region reader
// What the model holds: the list's own messages, and each timer's with its id, wrapped as the list receives them.
const messagesOf = (model: Model): ReadonlyArray<Message> => [
  model.add,
  ...model.timers.flatMap(({ id, model, remove }) => [
    ...timerMessages(model).map((message) => to(id, message)),
    remove,
  ]),
]
// #endregion reader

const state: fc.Arbitrary<State> = fc
  .uniqueArray(
    fc.record({
      id: fc.nat(20),
      timer: fc.record({
        minutes: fc.constantFrom(1, 2),
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

// What a user could ask of a timer, a tag at a time: everything but the ticks, which only the clock sends.
const timerClicks: ReadonlyArray<Timer.Message> = Object.values(
  {
    MoreClicked: [{ _tag: 'MoreClicked' }],
    LessClicked: [{ _tag: 'LessClicked' }],
    StartClicked: [{ _tag: 'StartClicked' }],
    PauseClicked: [{ _tag: 'PauseClicked' }],
    ResumeClicked: [{ _tag: 'ResumeClicked' }],
    ResetClicked: [{ _tag: 'ResetClicked' }],
    Ticked: [],
  } satisfies { [Tag in Timer.Message['_tag']]: ReadonlyArray<Extract<Timer.Message, { _tag: Tag }>> },
).flat()

// What a user can ask of the list, a tag at a time: adding a timer, and removing or using each one. A new message
// of the list, or a new child, does not compile here until the test says what a user could ask with it.
const userMessages = (state: State): ReadonlyArray<Message> =>
  Object.values(
    {
      AddClicked: [{ _tag: 'AddClicked' }],
      RemoveClicked: state.entries.map(({ id }) => ({ _tag: 'RemoveClicked', id })),
      Timer: state.entries.flatMap(({ id }) => timerClicks.map((message) => ({ _tag: 'Timer', id, message }))),
    } satisfies { [Tag in Message['_tag']]: ReadonlyArray<Extract<Message, { _tag: Tag }>> },
  ).flat()

describe('timers', () => {
  // #region update
  test('each timer keeps its own state', () => {
    const { state } = applyAll(timers.update)([added, to(2, { _tag: 'StartClicked' })], timers.init.state)
    expect(state.entries.map((entry) => entry.timer.phase._tag)).toEqual(['Setting', 'Running'])
  })

  test('a removed timer is gone, and a second click on "Remove" is rejected', () => {
    const { state } = applyAll(timers.update)([added, removed(1)], timers.init.state)
    expect(state.entries.map((entry) => entry.id)).toEqual([2])
    expect(timers.update(removed(1))(state)).toBe(reject)
    expect(timers.update(to(1, { _tag: 'StartClicked' }))(state)).toBe(reject)
  })

  test('only running timers tick, each under its own key', () => {
    const { state } = applyAll(timers.update)([added, to(2, { _tag: 'StartClicked' })], timers.init.state)
    expect(Array.from(HashMap.keys(subscriptionsOf(timers)(state)))).toEqual([['Timer', 2, 'ticks']])
  })
  // #endregion update

  test('the model holds what update accepts, all of it, and each acts once when sent twice', () => {
    fc.assert(fc.property(state, (before) => {
      expect(dispatchViolations(timers.update, {
        state: before,
        held: messagesOf(timers.makeModel(before)),
        candidates: userMessages(before),
        repeatable: (message) =>
          message._tag === 'AddClicked'
          || (message._tag === 'Timer'
            && (message.message._tag === 'MoreClicked' || message.message._tag === 'LessClicked')),
      })).toEqual([])
    }))
  })

  // Beyond what the library asks: that the view draws what its model holds, each control once and each timer
  // through its own dispatch, in every phase. `messagesSentBy`, beside the snabbdom bridge, is its way to see it
  // without a DOM.
  test('the view sends what its model holds', () => {
    fc.assert(fc.property(state, (before) => {
      const model = timers.makeModel(before)
      expect(messagesSentBy<Model, Message>(view, model)).toEqual(messagesOf(model))
    }))
  })
})
