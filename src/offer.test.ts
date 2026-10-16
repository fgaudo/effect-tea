import { describe, expect, test } from 'bun:test'
import * as Opt from 'effect/Option'
import * as fc from 'fast-check'
import { offers } from './offer.ts'
import { reject, type Update } from './update.ts'

type Message = Readonly<{ _tag: 'Set'; value: number }>

// Accepts a value only when it differs from the state.
const update: Update<number, Message, never> = ({ value }) => (state) => value === state ? reject : { state: value }

describe('offer', () => {
  test('offers a message exactly when update accepts it', () => {
    fc.assert(fc.property(fc.integer(), fc.integer(), (state, value) => {
      const message: Message = { _tag: 'Set', value }
      const offer = offers(update, state).offer(message)
      return value === state ? Opt.isNone(offer) : Opt.getOrThrow(offer) === message
    }))
  })
})

describe('offerInput', () => {
  const toMessage = (value: number): Message => ({ _tag: 'Set', value })

  test('is decided with the current value, and builds the message from the value given later', () => {
    fc.assert(fc.property(fc.integer(), fc.integer(), fc.integer(), (state, current, later) => {
      const offer = offers(update, state).offerInput(toMessage, current)
      return current === state
        ? Opt.isNone(offer)
        : Opt.getOrThrow(offer)(later).value === later
    }))
  })

  test('is none when update rejects the current value', () => {
    expect(Opt.isNone(offers(update, 1).offerInput(toMessage, 1))).toBe(true)
  })
})
