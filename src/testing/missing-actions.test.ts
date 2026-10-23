import { describe, expect, test } from 'bun:test'
import { reject, type Update } from '../update.ts'
import { missingActions } from './missing-actions.ts'

type State = Readonly<{ isOpen: boolean; isSaving: boolean }>

type Message = Readonly<{ _tag: 'Opened' }> | Readonly<{ _tag: 'Closed' }> | Readonly<{ _tag: 'Typed'; text: string }>

const update: Update<State, Message> = (message) => (state) => {
  switch (message._tag) {
    case 'Opened':
      return state.isOpen ? reject : { state: { ...state, isOpen: true } }
    case 'Closed':
      return state.isOpen ? { state: { ...state, isOpen: false } } : reject
    case 'Typed':
      return { state }
  }
}

const opened: Message = { _tag: 'Opened' }
const closed: Message = { _tag: 'Closed' }
const typed = (text: string): Message => ({ _tag: 'Typed', text })

describe('missingActions', () => {
  const check = missingActions(update)

  test('reports what update accepts and the view does not send', () => {
    expect(check({ isOpen: true, isSaving: false }, [], [opened, closed])).toEqual([closed])
  })

  test('ignores what update rejects, and what the view sends, compared by value', () => {
    expect(check({ isOpen: false, isSaving: false }, [{ _tag: 'Opened' }], [opened, closed])).toEqual([])
    expect(check({ isOpen: false, isSaving: false }, [typed('milk')], [typed('milk')])).toEqual([])
  })

  test('ignores what the view withholds on purpose', () => {
    const withholding = missingActions(update, {
      withheld: (message, state) => message._tag === 'Typed' && state.isSaving,
    })
    expect(withholding({ isOpen: false, isSaving: true }, [], [typed('milk')])).toEqual([])
    expect(withholding({ isOpen: false, isSaving: false }, [], [typed('milk')])).toEqual([typed('milk')])
  })
})
