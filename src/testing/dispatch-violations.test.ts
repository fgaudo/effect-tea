import { describe, expect, test } from 'bun:test'
import { reject, type Update } from '../update.ts'
import { dispatchViolations } from './dispatch-violations.ts'

type State = Readonly<{ count: number; isOpen: boolean }>

// `Increment` repeats on purpose, `Opened` happens once, `Pinged` starts `Ping` every time, `Forbidden` never
// applies, and `Closed` changes nothing when sent again.
type Message = 'Increment' | 'Opened' | 'Closed' | 'Pinged' | 'Forbidden'

const update: Update<State, Message, 'Ping'> = (message) => (state) => {
  switch (message) {
    case 'Increment':
      return { state: { ...state, count: state.count + 1 } }
    case 'Opened':
      return state.isOpen ? reject : { state: { ...state, isOpen: true } }
    case 'Closed':
      return { state: { ...state, isOpen: false } }
    case 'Pinged':
      return { state, commands: ['Ping'] }
    case 'Forbidden':
      return reject
  }
}

const closed: State = { count: 0, isOpen: false }

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
