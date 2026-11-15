import { describe, expect, test } from 'bun:test'
import { InvariantDefect, isRejected, write } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations, drive, rehearse, simulate } from '@fgaudo/effect-tea/testing'
import * as Effect from 'effect/Effect'
import * as Equal from 'effect/Equal'
import * as Opt from 'effect/Option'
import * as fc from 'fast-check'
import { Command, form, type Message, type Model, Own, Save, type State, update } from './form.ts'
import { Storage, StorageError } from './storage.ts'

const empty = form.init.state

// Made anew on each draw, so that two states drawn alike share no object.
const state = (): fc.Arbitrary<State> =>
  fc.record({
    name: fc.oneof(fc.string(), fc.constant('   ')),
    save: fc.oneof(
      fc.constant(null).map(() => Save.Idle()),
      fc.constant(null).map(() => Save.Saving()),
      fc.record({ name: fc.string() }).map((failed) => Save.Failed(failed)),
    ),
    saved: fc.array(fc.string({ minLength: 1 }), { maxLength: 3 }),
  })

// What the model holds: the messages of its controls, a case at a time. What is typed is none of them.
const messagesOf = ({ editor }: Model): ReadonlyArray<Message> => editor._tag === 'Named' ? [editor.save] : []

/** What the user types into the input the model shows, as the view sends it. */
const typing = (model: Model, text: string): Message => ({ _tag: 'Name', message: write(model.name, text) })

const working = Storage.of({ save: () => Effect.void })
const failing = Storage.of({ save: (name) => Effect.fail(new StorageError({ cause: name })) })

describe('form', () => {
  // `update` alone: the rules, without running anything.
  describe('update', () => {
    test('saves a name that is not blank, trimmed', () => {
      const { state, commands } = applyAll(update)([Own.SaveClicked()], { ...empty, name: ' Ada ' })
      expect(state.save).toEqual(Save.Saving())
      expect(commands).toEqual([Command.Save({ name: 'Ada' })])
    })

    test('rejects saving a blank name, and a second save', () => {
      const saving = { ...empty, name: 'Ada', save: Save.Saving() }
      expect(isRejected(update(Own.SaveClicked())({ ...empty, name: '  ' }))).toBe(true)
      expect(isRejected(update(Own.SaveClicked())(saving))).toBe(true)
    })

    // Only the save in progress can complete: a completion anywhere else is a bug, not a message to ignore.
    test('dies on a completion with nothing saving', () => {
      const failed = { ...empty, save: Save.Failed({ name: 'Ada' }) }
      expect(() => update(Own.SaveSucceeded({ name: 'Ada' }))(empty)).toThrow(InvariantDefect)
      expect(() => update(Own.SaveFailed({ name: 'Ada' }))(failed)).toThrow(InvariantDefect)
    })

    // Sent from a frame drawn before the save: it arrives while saving, before the save's failure.
    test('a key typed just before saving disabled the input is kept, for when the save fails', () => {
      const drawn = form.makeModel({ ...empty, name: ' Ada ' })
      const { state } = applyAll(update)(
        [Own.SaveClicked(), typing(drawn, ' Ada x'), Own.SaveFailed({ name: 'Ada' })],
        { ...empty, name: ' Ada ' },
      )
      expect(state.name).toBe(' Ada x')
      expect(state.save).toEqual(Save.Failed({ name: 'Ada' }))
    })

    // Sent from a frame drawn before the save completed: it was typed over a name the form no longer holds.
    test('a key typed over the name a completed save has emptied is rejected', () => {
      const typed = { ...empty, name: 'Ada' }
      const drawn = form.makeModel(typed)
      const { state } = applyAll(update)([Own.SaveClicked(), Own.SaveSucceeded({ name: 'Ada' })], typed)
      expect(state.name).toBe('')
      expect(isRejected(update(typing(drawn, 'Ada x'))(state))).toBe(true)
    })

    // An input keeps nothing of its own: the state stored is the state the form wrote, which a test compares whole.
    test('a completed save leaves the form as it starts, with the name listed', () => {
      const { state } = applyAll(update)([Own.SaveClicked(), Own.SaveSucceeded({ name: 'Ada' })], {
        ...empty,
        name: 'Ada',
      })
      expect(state).toEqual({ ...empty, saved: ['Ada'] })
    })

    test('has nothing to type into while saving', () => {
      expect(form.makeModel({ ...empty, name: 'Ada', save: Save.Saving() }).editor._tag).toBe('Saving')
    })
  })

  // The model, for any state: every message it holds is accepted, a double click saves once, and nothing
  // `update` accepts is missing. No text is drawn: what is typed is no message of the model's.
  test('the model holds what update accepts, all of it, and each acts once when sent twice', () => {
    const violations = dispatchViolations(update)
    fc.assert(fc.property(state(), (before) => {
      expect(violations(before, messagesOf(form.makeModel(before)), [Own.SaveClicked()])).toEqual([])
    }))
  })

  // Two equal states built apart, by the same seed drawn twice, give two equal models, which a function in a model
  // would break, being made anew by each `makeModel`.
  test('the model is data: equal states, built apart, have equal models', () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const [one] = fc.sample(state(), { seed, numRuns: 1 })
      const [other] = fc.sample(state(), { seed, numRuns: 1 })
      if (one === undefined || other === undefined) throw new Error('nothing sampled')
      expect(one).not.toBe(other)
      expect(Equal.equals(form.makeModel(one), form.makeModel(other))).toBe(true)
    }))
  })

  // `update` and the commands, with the storage provided: what each outcome leaves.
  describe('saving', () => {
    const typedAndSaved = [typing(form.makeModel(empty), ' Ada '), Own.SaveClicked()]

    test('a saved name is listed, trimmed, and the form empties its input', async () => {
      const { state, ignored } = await Effect.runPromise(
        simulate(form)(typedAndSaved, form.init).pipe(Effect.provideService(Storage, working)),
      )
      expect(state).toEqual({ name: '', save: Save.Idle(), saved: ['Ada'] })
      // The save's completion reached `update`: a rejected one would mean a form stuck saving.
      expect(ignored).toEqual([])
    })

    test('a failure gives the form back, as it was, and says so', async () => {
      const { state } = await Effect.runPromise(
        simulate(form)(typedAndSaved, form.init).pipe(Effect.provideService(Storage, failing)),
      )
      expect(state).toEqual({ name: ' Ada ', save: Save.Failed({ name: 'Ada' }), saved: [] })
    })

    // The save waits until the test runs it: what the user can do meanwhile, and what its answer finds.
    test('while saving, the form has nothing to do; a failure gives it back, to save again', async () => {
      const save = ({ editor }: Model) => editor._tag === 'Named' ? Opt.some(editor.save) : Opt.none()
      const { whileSaving, afterFailure } = await Effect.runPromise(
        rehearse(
          form,
          Effect.fnUntraced(function*(rehearsal) {
            yield* rehearsal.send((model) =>
              model.editor._tag === 'Saving' ? Opt.none() : Opt.some(typing(model, ' Ada '))
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
      expect(afterFailure.failed).toEqual(Opt.some('Ada'))
    })
  })

  // The program as it runs, driven like a user would.
  test('a user types a name and saves it', async () => {
    const saved = await Effect.runPromise(
      drive(
        form,
        Effect.fnUntraced(function*(driver) {
          yield* driver.send((model) => model.editor._tag === 'Saving' ? Opt.none() : Opt.some(typing(model, 'Ada')))
          yield* driver.send(({ name, editor }) =>
            name === 'Ada' && editor._tag === 'Named' ? Opt.some(editor.save) : Opt.none()
          )
          return yield* driver.waitFor((model) => model.saved.length > 0 ? Opt.some(model.saved) : Opt.none())
        }),
      ).pipe(Effect.provideService(Storage, working)),
    )
    expect(saved).toEqual(['Ada'])
  })
})
