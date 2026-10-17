import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Opt from 'effect/Option'
import { reject, type Update } from './update.ts'
import { applyAll, dispatchViolations, simulate } from './testing.ts'

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

describe('simulate', () => {
  class Storage extends Context.Service<Storage, { readonly save: Effect.Effect<number> }>()('Storage') {}

  // `Save` starts a save that `Saved` completes; while saving, a second `Save` is rejected. `Saved` tells the
  // parent with an event.
  type Saving = Readonly<{ isSaving: boolean; saved: number }>
  type Flow = Readonly<{ _tag: 'Save' }> | Readonly<{ _tag: 'Saved'; total: number }>

  const flow: Update<Saving, Flow, Storage, 'Done'> = (message) => (state) => {
    switch (message._tag) {
      case 'Save':
        return state.isSaving ? reject : {
          state: { ...state, isSaving: true },
          commands: [
            Effect.map(
              Effect.service(Storage).pipe(Effect.flatMap((storage) => storage.save)),
              (total) => Opt.some<Flow>({ _tag: 'Saved', total }),
            ),
          ],
        }
      case 'Saved':
        return state.isSaving ? { state: { isSaving: false, saved: message.total }, events: ['Done'] } : reject
    }
  }

  const idle: Saving = { isSaving: false, saved: 0 }

  const withStorage = <A, E>(effect: Effect.Effect<A, E, Storage>) =>
    effect.pipe(Effect.provideService(Storage, { save: Effect.succeed(7) }))

  test('runs each command as soon as its message is applied, and applies its message before the next', async () => {
    const simulation = await Effect.runPromise(withStorage(
      simulate(flow)([{ _tag: 'Save' }, { _tag: 'Save' }], {
        state: idle,
      }),
    ))
    expect(simulation).toEqual({
      state: { isSaving: false, saved: 7 },
      messages: [{ _tag: 'Save' }, { _tag: 'Saved', total: 7 }, { _tag: 'Save' }, { _tag: 'Saved', total: 7 }],
      events: ['Done', 'Done'],
    })
  })

  test('runs the commands of the starting step first', async () => {
    const simulation = await Effect.runPromise(withStorage(
      simulate(flow)([], {
        state: { isSaving: true, saved: 0 },
        commands: [Effect.succeed(Opt.some<Flow>({ _tag: 'Saved', total: 3 }))],
      }),
    ))
    expect(simulation.state).toEqual({ isSaving: false, saved: 3 })
  })

  test('a command\'s message that update rejects is stale and ignored', async () => {
    const simulation = await Effect.runPromise(withStorage(
      simulate(flow)([], {
        state: idle,
        commands: [Effect.succeed(Opt.some<Flow>({ _tag: 'Saved', total: 3 }))],
      }),
    ))
    expect(simulation).toEqual({ state: idle, messages: [], events: [] })
  })

  test('a rejection of one of the messages fails, naming it', async () => {
    const exit = await Effect.runPromiseExit(withStorage(
      simulate(flow)([{ _tag: 'Saved', total: 1 }], {
        state: idle,
      }),
    ))
    expect(Exit.isFailure(exit) && String(Cause.squash(exit.cause))).toContain('message 0 (Saved)')
  })
})
