import { describe, expect, test } from 'bun:test'
import { raise, reject, type Update } from '../update.ts'
import { dispatchViolations } from './dispatch-violations.ts'

type State = Readonly<{ count: number; isOpen: boolean }>

// `Increment` repeats on purpose, `Opened` happens once, `Pinged` starts `Ping` every time, `Notified` raises
// `Notify` every time and changes nothing else, `Forbidden` never applies, and `Closed` changes nothing when sent
// again.
type Message = 'Increment' | 'Opened' | 'Closed' | 'Pinged' | 'Notified' | 'Forbidden'

const update: Update<State, Message, 'Ping', 'Notify'> = (message) => (state) => {
  switch (message) {
    case 'Increment':
      return { state: { ...state, count: state.count + 1 } }
    case 'Opened':
      return state.isOpen ? reject : { state: { ...state, isOpen: true } }
    case 'Closed':
      return { state: { ...state, isOpen: false } }
    case 'Pinged':
      return { state, commands: ['Ping'] }
    case 'Notified':
      return raise('Notify' as const)(state)
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

  test('reports a message update rejects in the state the model was made from', () => {
    expect(check(closed, ['Forbidden'])).toEqual([{ _tag: 'Rejected', message: 'Forbidden' }])
  })

  test('reports a message that changes the state again when sent twice', () => {
    expect(dispatchViolations(update)(closed, ['Increment'])).toEqual([{ _tag: 'ActsTwice', message: 'Increment' }])
  })

  test('reports a message that starts a command again when sent twice, though the state stays the same', () => {
    expect(check(closed, ['Pinged'])).toEqual([{ _tag: 'ActsTwice', message: 'Pinged' }])
  })

  test('reports a message that raises an event again when sent twice, unless it repeats on purpose', () => {
    expect(check(closed, ['Notified'])).toEqual([{ _tag: 'ActsTwice', message: 'Notified' }])
    expect(dispatchViolations(update, { repeatable: (message) => message === 'Notified' })(closed, ['Notified']))
      .toEqual([])
  })
})

type Form = Readonly<{ isOpen: boolean; isSaving: boolean; text: string }>

// `Copied` returns a copy of the state, `Pinged` starts `Ping` and `Notified` raises `Notify`, each changing nothing
// else.
type FormMessage =
  | Readonly<{ _tag: 'Opened' }>
  | Readonly<{ _tag: 'Closed' }>
  | Readonly<{ _tag: 'Typed'; text: string }>
  | Readonly<{ _tag: 'Copied' }>
  | Readonly<{ _tag: 'Pinged' }>
  | Readonly<{ _tag: 'Notified' }>

const updateForm: Update<Form, FormMessage, 'Ping', 'Notify'> = (message) => (state) => {
  switch (message._tag) {
    case 'Opened':
      return state.isOpen ? reject : { state: { ...state, isOpen: true } }
    case 'Closed':
      return state.isOpen ? { state: { ...state, isOpen: false } } : reject
    case 'Typed':
      return { state: { ...state, text: message.text } }
    case 'Copied':
      return { state: { ...state } }
    case 'Pinged':
      return { state, commands: ['Ping'] }
    case 'Notified':
      return raise('Notify' as const)(state)
  }
}

const opened: FormMessage = { _tag: 'Opened' }
const shut: FormMessage = { _tag: 'Closed' }
const typed = (text: string): FormMessage => ({ _tag: 'Typed', text })
const copied: FormMessage = { _tag: 'Copied' }
const pinged: FormMessage = { _tag: 'Pinged' }
const notified: FormMessage = { _tag: 'Notified' }

const idle: Form = { isOpen: false, isSaving: false, text: '' }

describe('dispatchViolations, of the candidates', () => {
  const check = dispatchViolations(updateForm)

  test('reports what update accepts and the model does not hold', () => {
    expect(check({ ...idle, isOpen: true }, [], [opened, shut])).toEqual([{ _tag: 'Missing', message: shut }])
  })

  test('ignores what update rejects, and what the model holds, compared by value', () => {
    expect(check(idle, [{ _tag: 'Opened' }], [opened, shut])).toEqual([])
    expect(check(idle, [typed('milk')], [typed('milk')])).toEqual([])
  })

  test('ignores what the model withholds on purpose', () => {
    const withholding = dispatchViolations(updateForm, {
      withheld: (message, state) => message._tag === 'Typed' && state.isSaving,
    })
    expect(withholding({ ...idle, isSaving: true }, [], [typed('milk')])).toEqual([])
    expect(withholding(idle, [], [typed('milk')]))
      .toEqual([{ _tag: 'Missing', message: typed('milk') }])
  })

  test('leaves out a candidate whose step does nothing: the same state by Equal, a copy included', () => {
    expect(check(idle, [], [typed(''), copied])).toEqual([])
  })

  test('reports a candidate that starts a command or raises an event, though the state stays the same', () => {
    expect(check(idle, [], [pinged, notified]))
      .toEqual([{ _tag: 'Missing', message: pinged }, { _tag: 'Missing', message: notified }])
  })

  test('reports both ways at once, what is sent first', () => {
    expect(check(idle, [shut], [opened]))
      .toEqual([{ _tag: 'Rejected', message: shut }, { _tag: 'Missing', message: opened }])
  })
})
