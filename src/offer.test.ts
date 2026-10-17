import { describe, expect, test } from 'bun:test'
import * as fc from 'fast-check'
import { offers } from './offer.ts'
import { RejectedOffer } from './rejection.ts'
import { reject, type Update } from './update.ts'

type Message = Readonly<{ _tag: 'Set'; value: number }>

// Accepts a value only when it differs from the state.
const update: Update<number, Message> = ({ value }) => (state) => value === state ? reject : { state: value }

describe('offer', () => {
  test('offers a message update accepts, and throws RejectedOffer for one it rejects', () => {
    fc.assert(fc.property(fc.integer(), fc.integer(), (state, value) => {
      const message: Message = { _tag: 'Set', value }
      const offer = () => offers(update, state).offer(message)
      if (value === state) expect(offer).toThrow(RejectedOffer)
      else expect<Message>(offer()).toBe(message)
    }))
  })
})

describe('offerInput', () => {
  const toMessage = (value: number): Message => ({ _tag: 'Set', value })

  test('is checked with the current value, and builds the message from the value given later', () => {
    fc.assert(fc.property(fc.integer(), fc.integer(), fc.integer(), (state, current, later) => {
      const offer = () => offers(update, state).offerInput(toMessage, current)
      if (current === state) expect(offer).toThrow(RejectedOffer)
      else expect(offer()(later).value).toBe(later)
    }))
  })
})
