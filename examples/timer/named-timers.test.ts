import { describe, expect, test } from 'bun:test'
import { reject } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations } from '@fgaudo/effect-tea/testing'
import * as fc from 'fast-check'
import { messagesSentBy } from '../snabbdom-testing.test_messages.ts'
import { type Message, type Model, namedTimers, type State } from './named-timers.ts'
import { namedMessages } from './named.test_reader.ts'
import type * as Named from './named.ts'
import * as Timer from './timer.ts'
import { namedTimersView } from './view.ts'

const to = (id: number, message: Named.Message): Message => ({ _tag: 'Timer', id, message })

/** What the user types into the name of the timer `id`, over the value its model shows. */
const typing = (model: Model, id: number, text: string): Message => {
  const entry = model.timers.find((entry) => entry.id === id)
  if (entry === undefined) throw new Error(`no timer ${id} in the model`)
  return to(id, { _tag: 'Name', message: { _tag: 'Written', was: entry.model.name, value: text } })
}

// What the model holds: the list's own messages, and each timer's with its id, wrapped as the list receives them.
const messagesOf = (model: Model): ReadonlyArray<Message> => [
  model.add,
  ...model.timers.flatMap(({ id, model, remove }) => [
    ...namedMessages(model).map((message) => to(id, message)),
    remove,
  ]),
]

const state: fc.Arbitrary<State> = fc
  .uniqueArray(
    fc.record({
      id: fc.nat(20),
      timer: fc.record({
        name: fc.string(),
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
    }),
    { selector: (entry) => entry.id, maxLength: 4 },
  )
  .map((entries) => ({ nextId: 21, entries }))

// What a user could ask of a named timer, a tag at a time: its timer's clicks, and nothing of the name's, since what
// is typed is the input's, which the library rules on.
const namedClicks: ReadonlyArray<Named.Message> = Object.values(
  {
    Timer: Object.values(
      {
        MoreClicked: [{ _tag: 'MoreClicked' }],
        LessClicked: [{ _tag: 'LessClicked' }],
        StartClicked: [{ _tag: 'StartClicked' }],
        PauseClicked: [{ _tag: 'PauseClicked' }],
        ResumeClicked: [{ _tag: 'ResumeClicked' }],
        ResetClicked: [{ _tag: 'ResetClicked' }],
        // Only the clock sends it.
        Ticked: [],
      } satisfies { [Tag in Timer.Message['_tag']]: ReadonlyArray<Extract<Timer.Message, { _tag: Tag }>> },
    ).flat().map((message) => ({ _tag: 'Timer', message }) as const),
    Name: [],
  } satisfies { [Tag in Named.Message['_tag']]: ReadonlyArray<Extract<Named.Message, { _tag: Tag }>> },
).flat()

// What a user can ask of the list, a tag at a time: adding a timer, and removing or using each one.
const userMessages = (state: State): ReadonlyArray<Message> =>
  Object.values(
    {
      AddClicked: [{ _tag: 'AddClicked' }],
      RemoveClicked: state.entries.map(({ id }) => ({ _tag: 'RemoveClicked', id })),
      Timer: state.entries.flatMap(({ id }) => namedClicks.map((message) => ({ _tag: 'Timer', id, message }))),
    } satisfies { [Tag in Message['_tag']]: ReadonlyArray<Extract<Message, { _tag: Tag }>> },
  ).flat()

describe('named timers', () => {
  test('each timer keeps its own name', () => {
    const added = applyAll(namedTimers.update)([{ _tag: 'AddClicked' }], namedTimers.init.state).state
    const drawn = namedTimers.makeModel(added)
    const { state } = applyAll(namedTimers.update)([typing(drawn, 1, 'Tea'), typing(drawn, 2, 'Pasta')], added)
    expect(state.entries.map((entry) => entry.timer.name)).toEqual(['Tea', 'Pasta'])
  })

  test('a name typed into a removed timer is rejected', () => {
    const drawn = namedTimers.makeModel(namedTimers.init.state)
    const { state } = applyAll(namedTimers.update)([{ _tag: 'RemoveClicked', id: 1 }], namedTimers.init.state)
    expect(namedTimers.update(typing(drawn, 1, 'Tea'))(state)).toBe(reject)
  })

  test('the model holds what update accepts, all of it, and each acts once when sent twice', () => {
    const violations = dispatchViolations(namedTimers.update, {
      repeatable: (message) =>
        message._tag === 'AddClicked'
        || (message._tag === 'Timer' && message.message._tag === 'Timer'
          && (message.message.message._tag === 'MoreClicked' || message.message.message._tag === 'LessClicked')),
    })
    fc.assert(fc.property(state, (before) => {
      const held = messagesOf(namedTimers.makeModel(before))
      expect(violations(before, held, userMessages(before))).toEqual([])
    }))
  })

  // Beyond what the library asks: that the view draws what its model holds, each timer through its own dispatch.
  test('the view sends what its model holds', () => {
    fc.assert(fc.property(state, (before) => {
      const model = namedTimers.makeModel(before)
      expect(messagesSentBy<Model, Message>(namedTimersView, model)).toEqual(messagesOf(model))
    }))
  })
})
