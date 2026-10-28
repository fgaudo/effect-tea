import { describe, expect, test } from 'bun:test'
import { defect, InvariantDefect } from '../defect.ts'
import { reject, type Update } from '../update.ts'
import { applyAll } from './apply-all.ts'

type State = Readonly<{ count: number; isOpen: boolean }>

// `Opened` happens once, `Pinged` starts `Ping` every time, and `Forbidden` never applies.
type Message = 'Increment' | 'Opened' | 'Pinged' | 'Forbidden'

const update: Update<State, Message, 'Ping'> = (message) => (state) => {
  switch (message) {
    case 'Increment':
      return { state: { ...state, count: state.count + 1 } }
    case 'Opened':
      return state.isOpen ? reject : { state: { ...state, isOpen: true } }
    case 'Pinged':
      return { state, commands: ['Ping'] }
    case 'Forbidden':
      return reject
  }
}

const closed: State = { count: 0, isOpen: false }

describe('applyAll', () => {
  test('applies the messages in order and collects their commands', () => {
    const { state, commands } = applyAll(update)(['Increment', 'Opened', 'Pinged', 'Increment'], closed)
    expect(state).toEqual({ count: 2, isOpen: true })
    expect(commands).toEqual(['Ping'])
  })

  test('collects the events in order', () => {
    const announce: Update<number, string, never, string> = (message) => (count) => ({
      state: count + 1,
      events: [`${message}${count}`],
    })
    expect(applyAll(announce)(['a', 'b'], 0).events).toEqual(['a0', 'b1'])
  })

  test('a rejection fails, naming the message', () => {
    expect(() => applyAll(update)(['Increment', 'Forbidden'], closed)).toThrow('message 1 (Forbidden)')
  })

  test('the InvariantDefect of defect fails the test, as any error update throws', () => {
    const broken: Update<State, Message> = () => () => defect('No message arrives here')
    expect(() => applyAll(broken)(['Increment'], closed)).toThrow(InvariantDefect)
  })
})
