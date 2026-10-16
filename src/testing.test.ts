import { describe, expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import { reject, type Update } from './update.ts'
import { applyAll, dispatchViolations } from './testing.ts'

type State = Readonly<{ count: number; isOpen: boolean }>

// `Increment` repeats on purpose, `Opened` happens once, `Pinged` runs a command every time, `Forbidden` never
// applies, and `Closed` changes nothing when sent again.
type Message = 'Increment' | 'Opened' | 'Closed' | 'Pinged' | 'Forbidden'

const update: Update<State, Message, never> = (message) => (state) => {
  switch (message) {
    case 'Increment':
      return { state: { ...state, count: state.count + 1 } }
    case 'Opened':
      return state.isOpen ? reject : { state: { ...state, isOpen: true } }
    case 'Closed':
      return { state: { ...state, isOpen: false } }
    case 'Pinged':
      return { state, commands: [Effect.succeed(Opt.none())] }
    case 'Forbidden':
      return reject
  }
}

const closed: State = { count: 0, isOpen: false }

describe('applyAll', () => {
  test('applies the messages in order and collects their commands', () => {
    const { state, commands } = applyAll(update)(['Increment', 'Opened', 'Pinged', 'Increment'], closed)
    expect(state).toEqual({ count: 2, isOpen: true })
    expect(commands.length).toBe(1)
  })

  test('a rejection fails, naming the message', () => {
    expect(() => applyAll(update)(['Increment', 'Forbidden'], closed)).toThrow('message 1 (Forbidden)')
  })
})

describe('dispatchViolations', () => {
  const check = dispatchViolations(update, { repeatable: (message) => message === 'Increment' })

  test('accepts one-shot actions that guard themselves, repeatable ones, and messages that change nothing again', () => {
    expect(check(closed, ['Opened', 'Increment', 'Closed'])).toEqual([])
  })

  test('reports a message update rejects in the state the view was drawn from', () => {
    expect(check(closed, ['Forbidden'])).toEqual([{ _tag: 'Rejected', message: 'Forbidden' }])
  })

  test('reports a message that acts again when sent twice', () => {
    expect(check(closed, ['Pinged'])).toEqual([{ _tag: 'ActsTwice', message: 'Pinged' }])
    expect(dispatchViolations(update)(closed, ['Increment'])).toEqual([{ _tag: 'ActsTwice', message: 'Increment' }])
  })
})
