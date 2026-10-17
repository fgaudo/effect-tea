import { describe, expect, test } from 'bun:test'
import { isRejected } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations, drive, input, simulate, tap } from '@fgaudo/effect-tea/testing'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import * as fc from 'fast-check'
import { messagesSentBy } from '../snabbdom.ts'
import { form, Message, type State, update } from './form.ts'
import { Storage, StorageError } from './storage.ts'
import { view } from './view.ts'

const empty = form.init.state

const state: fc.Arbitrary<State> = fc.record({
  name: fc.oneof(fc.string(), fc.constant('   ')),
  isSaving: fc.boolean(),
  hasFailed: fc.boolean(),
  saved: fc.array(fc.string({ minLength: 1 }), { maxLength: 3 }),
})

const working = Storage.of({ save: () => Effect.void })
const failing = Storage.of({ save: (name) => Effect.fail(new StorageError({ cause: name })) })

describe('form', () => {
  // `update` alone: the rules, without running anything.
  describe('update', () => {
    test('stores what is typed, as typed', () => {
      expect(applyAll(update)([Message.NameChanged({ name: ' Ada ' })], empty).state.name).toBe(' Ada ')
    })

    test('saves a name that is not blank, with one command', () => {
      const { state, commands } = applyAll(update)(
        [Message.NameChanged({ name: 'Ada' }), Message.SaveClicked()],
        empty,
      )
      expect(state.isSaving).toBe(true)
      expect(commands.length).toBe(1)
    })

    test('rejects saving a blank name, a second save, typing while saving, and a completion with nothing saving', () => {
      const saving = { ...empty, name: 'Ada', isSaving: true }
      expect(isRejected(update(Message.SaveClicked())({ ...empty, name: '  ' }))).toBe(true)
      expect(isRejected(update(Message.SaveClicked())(saving))).toBe(true)
      expect(isRejected(update(Message.NameChanged({ name: 'Bob' }))(saving))).toBe(true)
      expect(isRejected(update(Message.SaveSucceeded())(empty))).toBe(true)
    })
  })

  // The real view, for any state and anything typed: every message it can send is accepted, and a double
  // click saves once.
  test('the view only sends what update accepts, and acts once when sent twice', () => {
    const check = dispatchViolations(update)
    fc.assert(fc.property(state, fc.string(), (before, typed) => {
      expect(check(before, messagesSentBy(view, form.makeModel(before), typed))).toEqual([])
    }))
  })

  // `update` and the commands, with the storage provided: what each outcome leaves.
  describe('saving', () => {
    const typedAndSaved = [Message.NameChanged({ name: ' Ada ' }), Message.SaveClicked()]

    test('a saved name is listed, trimmed, and the form is emptied', async () => {
      const { state } = await Effect.runPromise(
        simulate(update)(typedAndSaved, form.init).pipe(Effect.provideService(Storage, working)),
      )
      expect(state).toEqual({ name: '', isSaving: false, hasFailed: false, saved: ['Ada'] })
    })

    test('a failure gives the form back, as it was, and says so', async () => {
      const { state } = await Effect.runPromise(
        simulate(update)(typedAndSaved, form.init).pipe(Effect.provideService(Storage, failing)),
      )
      expect(state).toEqual({ name: ' Ada ', isSaving: false, hasFailed: true, saved: [] })
    })
  })

  // The program as it runs, driven like a user would.
  test('a user types a name and saves it', async () => {
    const saved = await Effect.runPromise(
      drive(form, (driver) =>
        Effect.gen(function*() {
          yield* driver.send((model) => input(model.changeName, 'Ada'))
          yield* driver.send((model) => model.name === 'Ada' ? tap(model.save) : Opt.none())
          return yield* driver.waitFor((model) => model.saved.length > 0 ? Opt.some(model.saved) : Opt.none())
        })).pipe(Effect.provideService(Storage, working)),
    )
    expect(saved).toEqual(['Ada'])
  })
})
