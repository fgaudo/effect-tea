import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Opt from 'effect/Option'
import type * as Scope from 'effect/Scope'
import type { RunCommand } from '../command.ts'
import { reject, type Update } from '../update.ts'
import { simulate } from './simulate.ts'

describe('simulate', () => {
  class Storage extends Context.Service<Storage, { readonly save: Effect.Effect<number> }>()('Storage') {}

  // `Save` starts `Store`, which `Saved` completes; while saving, a second `Save` is rejected. `Saved` tells
  // the parent with an event.
  type Saving = Readonly<{ isSaving: boolean; saved: number }>
  type Flow = Readonly<{ _tag: 'Save' }> | Readonly<{ _tag: 'Saved'; total: number }>

  const flow: Update<Saving, Flow, 'Store', 'Done'> = (message) => (state) => {
    switch (message._tag) {
      case 'Save':
        return state.isSaving ? reject : { state: { ...state, isSaving: true }, commands: ['Store'] }
      case 'Saved':
        return state.isSaving ? { state: { isSaving: false, saved: message.total }, events: ['Done'] } : reject
    }
  }

  const store: RunCommand<'Store', Flow, Storage> = () =>
    Effect.map(
      Effect.service(Storage).pipe(Effect.flatMap((storage) => storage.save)),
      (total) => Opt.some<Flow>({ _tag: 'Saved', total }),
    )

  const saving = { update: flow, runCommand: store }

  const idle: Saving = { isSaving: false, saved: 0 }

  const withStorage = <A, E>(effect: Effect.Effect<A, E, Storage>) =>
    effect.pipe(Effect.provideService(Storage, { save: Effect.succeed(7) }))

  test('runs each command as soon as its message is applied, and applies its message before the next', async () => {
    const simulation = await Effect.runPromise(withStorage(
      simulate(saving)([{ _tag: 'Save' }, { _tag: 'Save' }], {
        state: idle,
      }),
    ))
    expect(simulation).toEqual({
      state: { isSaving: false, saved: 7 },
      messages: [{ _tag: 'Save' }, { _tag: 'Saved', total: 7 }, { _tag: 'Save' }, { _tag: 'Saved', total: 7 }],
      commands: ['Store', 'Store'],
      events: ['Done', 'Done'],
      ignored: [],
    })
  })

  test('runs the commands of the starting step first', async () => {
    const simulation = await Effect.runPromise(withStorage(
      simulate(saving)([], { state: { isSaving: true, saved: 0 }, commands: ['Store'] }),
    ))
    expect(simulation.state).toEqual({ isSaving: false, saved: 7 })
  })

  test('a test\'s own interpreter answers the commands, with no services', async () => {
    const answered = { update: flow, runCommand: () => Effect.succeedSome<Flow>({ _tag: 'Saved', total: 3 }) }
    const simulation = await Effect.runPromise(simulate(answered)([{ _tag: 'Save' }], { state: idle }))
    expect(simulation.state).toEqual({ isSaving: false, saved: 3 })
  })

  test('a command\'s message that update rejects is ignored, and listed', async () => {
    const simulation = await Effect.runPromise(withStorage(
      simulate(saving)([], { state: idle, commands: ['Store'] }),
    ))
    expect(simulation).toEqual({
      state: idle,
      messages: [],
      commands: ['Store'],
      events: [],
      ignored: [{ _tag: 'Saved', total: 7 }],
    })
  })

  test('a command has a scope of its own, closed before its message is applied', async () => {
    // `Start` starts `A`, whose `First` starts `B`: `B` acquires only once `A` has released.
    type Step = 'Start' | 'First' | 'Second'
    const log: Array<string> = []
    const resource = (name: string) =>
      Effect.acquireRelease(
        Effect.sync(() => log.push(`acquire ${name}`)),
        () => Effect.sync(() => log.push(`release ${name}`)),
      )
    const chained: Update<object, Step, 'A' | 'B'> = (message) => (state) =>
      message === 'Start' ? { state, commands: ['A'] } : message === 'First' ? { state, commands: ['B'] } : { state }
    const runCommand: RunCommand<'A' | 'B', Step, Scope.Scope> = (command) =>
      resource(command).pipe(Effect.as(Opt.some<Step>(command === 'A' ? 'First' : 'Second')))
    const simulation = await Effect.runPromise(simulate({ update: chained, runCommand })(['Start'], { state: {} }))
    expect(simulation.messages).toEqual(['Start', 'First', 'Second'])
    expect(log).toEqual(['acquire A', 'release A', 'acquire B', 'release B'])
  })

  test('takes only a program that keeps its state in an object', () => {
    const counting: Update<number, 'Increment'> = () => (count) => ({ state: count + 1 })
    // @ts-expect-error: a number is no object.
    expect(simulate({ update: counting })).toBeDefined()
  })

  test('a rejection of one of the messages fails, naming it', async () => {
    const exit = await Effect.runPromiseExit(withStorage(
      simulate(saving)([{ _tag: 'Saved', total: 1 }], {
        state: idle,
      }),
    ))
    expect(Exit.isFailure(exit) && String(Cause.squash(exit.cause))).toContain('message 0 (Saved)')
  })
})
