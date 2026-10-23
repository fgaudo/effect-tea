import { describe, expect, test } from 'bun:test'
import { isRejected } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations, drive, missingActions, rehearse, simulate } from '@fgaudo/effect-tea/testing'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import * as fc from 'fast-check'
import * as Field from '../field.ts'
import { messagesSentBy } from '../snabbdom.ts'
import { Command, form, Message, type Model, type State, update } from './form.ts'
import { Storage, StorageError } from './storage.ts'
import { view } from './view.ts'

const empty = form.init.state

const state: fc.Arbitrary<State> = fc.record({
  name: fc.record({ text: fc.oneof(fc.string(), fc.constant('   ')), revision: fc.nat() }),
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
      expect(applyAll(update)([Message.NameChanged({ name: ' Ada ' })], empty).state.name.text).toBe(' Ada ')
    })

    // The input shows what was typed whatever the state: storing it in any state keeps the two the same.
    test('accepts what is typed in any state, and leaves the input it was typed into', () => {
      fc.assert(fc.property(state, fc.string(), (before, typed) => {
        const after = update(Message.NameChanged({ name: typed }))(before)
        return !isRejected(after) && after.state.name.text === typed
          && after.state.name.revision === before.name.revision
      }))
    })

    test('saves a name that is not blank, trimmed', () => {
      const { state, commands } = applyAll(update)(
        [Message.NameChanged({ name: ' Ada ' }), Message.SaveClicked()],
        empty,
      )
      expect(state.isSaving).toBe(true)
      expect(commands).toEqual([Command.Save({ name: 'Ada' })])
    })

    test('rejects saving a blank name, a second save, and a completion with nothing saving', () => {
      const saving = { ...empty, name: Field.make('Ada'), isSaving: true }
      expect(isRejected(update(Message.SaveClicked())({ ...empty, name: Field.make('  ') }))).toBe(true)
      expect(isRejected(update(Message.SaveClicked())(saving))).toBe(true)
      expect(isRejected(update(Message.SaveSucceeded({ name: 'Ada' }))(empty))).toBe(true)
    })

    test('has nothing to type into while saving', () => {
      expect(form.makeModel({ ...empty, name: Field.make('Ada'), isSaving: true }).editor._tag).toBe('Saving')
    })
  })

  // The real view, for any state and anything typed: every message it can send is accepted, a double click
  // saves once, and nothing `update` accepts is missing, but typing while saving, which the model withholds.
  test('the view sends what update accepts, all of it, and acts once when sent twice', () => {
    const violations = dispatchViolations(update)
    const missing = missingActions(update, {
      withheld: (message, state) => message._tag === 'NameChanged' && state.isSaving,
    })
    fc.assert(fc.property(state, fc.string(), (before, typed) => {
      const sent = messagesSentBy<Model, Message>(view, form.makeModel(before), typed)
      expect(violations(before, sent)).toEqual([])
      expect(missing(before, sent, [Message.NameChanged({ name: typed }), Message.SaveClicked()])).toEqual([])
    }))
  })

  // `update` and the commands, with the storage provided: what each outcome leaves.
  describe('saving', () => {
    const typedAndSaved = [Message.NameChanged({ name: ' Ada ' }), Message.SaveClicked()]

    test('a saved name is listed, trimmed, and the form gets a new, empty input', async () => {
      const { state, ignored } = await Effect.runPromise(
        simulate(form)(typedAndSaved, form.init).pipe(Effect.provideService(Storage, working)),
      )
      expect(state).toEqual({ name: { text: '', revision: 1 }, isSaving: false, hasFailed: false, saved: ['Ada'] })
      // The save's completion reached `update`: a rejected one would mean a form stuck saving.
      expect(ignored).toEqual([])
    })

    test('a failure gives the form back, as it was, and says so', async () => {
      const { state } = await Effect.runPromise(
        simulate(form)(typedAndSaved, form.init).pipe(Effect.provideService(Storage, failing)),
      )
      expect(state).toEqual({ name: Field.make(' Ada '), isSaving: false, hasFailed: true, saved: [] })
    })

    test('a key typed just before saving disabled the input is kept, for when the save fails', async () => {
      const { state } = await Effect.runPromise(
        simulate(form)([...typedAndSaved, Message.NameChanged({ name: ' Ada x' })], form.init).pipe(
          Effect.provideService(Storage, failing),
        ),
      )
      expect(state.name.text).toBe(' Ada x')
    })

    // The save waits until the test runs it: what the user can do meanwhile, and what its answer finds.
    test('while saving, the form has nothing to do; a failure gives it back, to save again', async () => {
      const save = ({ editor }: Model) => editor._tag === 'Named' ? Opt.some(editor.save) : Opt.none()
      const { whileSaving, afterFailure } = await Effect.runPromise(
        rehearse(
          form,
          Effect.fnUntraced(function*(rehearsal) {
            yield* rehearsal.send(({ editor }) =>
              editor._tag === 'Saving' ? Opt.none() : Opt.some(editor.changeName(' Ada '))
            )
            yield* rehearsal.send(save)
            const whileSaving = (yield* rehearsal.model).editor._tag
            yield* rehearsal.run((command) => command._tag === 'Save')
            const afterFailure = yield* rehearsal.model
            yield* rehearsal.send(save)
            yield* rehearsal.runAll
            return { whileSaving, afterFailure }
          }),
        ).pipe(Effect.provideService(Storage, failing)),
      )
      expect(whileSaving).toBe('Saving')
      expect(afterFailure.editor._tag).toBe('Named')
      expect(afterFailure.hasFailed).toBe(true)
    })
  })

  // The program as it runs, driven like a user would.
  test('a user types a name and saves it', async () => {
    const saved = await Effect.runPromise(
      drive(
        form,
        Effect.fnUntraced(function*(driver) {
          yield* driver.send(({ editor }) => editor._tag === 'Saving' ? Opt.none() : Opt.some(editor.changeName('Ada')))
          yield* driver.send(({ name, editor }) =>
            name.text === 'Ada' && editor._tag === 'Named' ? Opt.some(editor.save) : Opt.none()
          )
          return yield* driver.waitFor((model) => model.saved.length > 0 ? Opt.some(model.saved) : Opt.none())
        }),
      ).pipe(Effect.provideService(Storage, working)),
    )
    expect(saved).toEqual(['Ada'])
  })
})
