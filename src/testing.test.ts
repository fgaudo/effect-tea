import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as References from 'effect/References'
import * as TestClock from 'effect/testing/TestClock'
import { RejectedMessage } from './bug.ts'
import type { RunCommand } from './command.ts'
import { type InputOffer, type Offer, type Offered, offers } from './offer.ts'
import type { Program } from './program.ts'
import { reject, type Update } from './update.ts'
import { applyAll, dispatchViolations, drive, input, simulate, tap } from './testing.ts'

type State = Readonly<{ count: number; isOpen: boolean }>

// `Increment` repeats on purpose, `Opened` happens once, `Pinged` starts `Ping` every time, `Forbidden` never
// applies, and `Closed` changes nothing when sent again.
type Message = 'Increment' | 'Opened' | 'Closed' | 'Pinged' | 'Forbidden'

const update: Update<State, Message, 'Ping'> = (message) => (state) => {
  switch (message) {
    case 'Increment':
      return { state: { ...state, count: state.count + 1 } }
    case 'Opened':
      return state.isOpen ? reject : { state: { ...state, isOpen: true } }
    case 'Closed':
      return { state: { ...state, isOpen: false } }
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

  test('a command\'s message that update rejects is stale and ignored', async () => {
    const simulation = await Effect.runPromise(withStorage(
      simulate(saving)([], { state: idle, commands: ['Store'] }),
    ))
    expect(simulation).toEqual({ state: idle, messages: [], commands: ['Store'], events: [] })
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

describe('drive', () => {
  // A note that is saved by `Store`, and pinged once by a subscription that stops with the program.
  // `Explode` starts `Crash`, a command with a bug.
  type Note = Readonly<{ text: string; isSaving: boolean; saved: Opt.Option<string>; pings: number }>
  type Edit =
    | Readonly<{ _tag: 'Typed'; text: string }>
    | Readonly<{ _tag: 'Save' }>
    | Readonly<{ _tag: 'Saved' }>
    | Readonly<{ _tag: 'Pinged' }>
    | Readonly<{ _tag: 'Explode' }>

  type NoteCommand = 'Store' | 'Crash'

  const editNote: Update<Note, Edit, NoteCommand> = (message) => (note) => {
    switch (message._tag) {
      case 'Typed':
        return note.isSaving ? reject : { state: { ...note, text: message.text } }
      case 'Save':
        return note.isSaving || note.text === '' ? reject : {
          state: { ...note, isSaving: true },
          commands: ['Store'],
        }
      case 'Saved':
        return note.isSaving ? { state: { ...note, isSaving: false, saved: Opt.some(note.text) } } : reject
      case 'Pinged':
        return { state: { ...note, pings: note.pings + 1 } }
      case 'Explode':
        return { state: note, commands: ['Crash'] }
    }
  }

  type NoteModel = Readonly<{
    note: Note
    changeText: InputOffer<string, Edit>
    save: Offer<Edit>
    explode: Offer<Edit>
  }>

  const noteProgram = (onStop: Effect.Effect<void>): Program<Note, NoteModel, Edit, NoteCommand, never> => ({
    init: { state: { text: '', isSaving: false, saved: Opt.none(), pings: 0 } },
    update: editNote,
    runCommand: (command) =>
      command === 'Store' ? Effect.succeedSome<Edit>({ _tag: 'Saved' }) : Effect.die(new Error('boom')),
    subscriptions: () =>
      HashMap.make([
        'ping',
        Channel.succeed<Edit>({ _tag: 'Pinged' }).pipe(
          Channel.concatWith(() => Channel.never),
          Channel.ensuring(onStop),
        ),
      ]),
    makeModel: (note) => {
      const { offer, offerInput } = offers(editNote, note)
      return {
        note,
        changeText: offerInput((text: string) => ({ _tag: 'Typed', text }), note.text),
        save: offer({ _tag: 'Save' }),
        explode: offer({ _tag: 'Explode' }),
      }
    },
  })

  // The program dies on purpose in some tests: what it logs then is expected.
  const quietly = <A, E>(effect: Effect.Effect<A, E>) =>
    effect.pipe(Effect.provideService(References.MinimumLogLevel, 'None'))

  test('runs the commands and subscriptions, returns what the scenario returns, then stops the program', async () => {
    let stopped = false
    const program = noteProgram(Effect.sync(() => {
      stopped = true
    }))
    const saved = await Effect.runPromise(drive(program, (driver) =>
      Effect.gen(function*() {
        yield* driver.waitFor((model) => model.note.pings === 1 ? Opt.some(true) : Opt.none())
        yield* driver.send((model) => input(model.changeText, 'milk'))
        yield* driver.send((model) => model.note.text === 'milk' ? tap(model.save) : Opt.none())
        return yield* driver.waitFor((model) => model.note.saved)
      })))
    expect(saved).toBe('milk')
    expect(stopped).toBe(true)
  })

  test('send waits for a frame that offers the action', async () => {
    const saved = await Effect.runPromise(drive(noteProgram(Effect.void), (driver) =>
      Effect.gen(function*() {
        // Not offered while the text is empty.
        yield* Effect.all([
          driver.send((model) => tap(model.save)),
          driver.send((model) => input(model.changeText, 'eggs')),
        ], { concurrency: 'unbounded' })
        return yield* driver.waitFor((model) => model.note.saved)
      })))
    expect(saved).toBe('eggs')
  })

  test('a defect of the program fails the scenario', async () => {
    const exit = await Effect.runPromiseExit(
      quietly(drive(noteProgram(Effect.void), (driver) =>
        Effect.gen(function*() {
          yield* driver.send((model) => tap(model.explode))
          return yield* Effect.never
        }))),
    )
    expect(Exit.isFailure(exit) && String(Cause.squash(exit.cause))).toContain('boom')
  })

  test('a wait longer than the patience fails, measured with the real clock even under a TestClock', async () => {
    const exit = await Effect.runPromiseExit(
      drive(
        noteProgram(Effect.void),
        (driver) => driver.waitFor(() => Opt.none()),
        { patience: '20 millis' },
      ).pipe(Effect.provide(TestClock.layer())),
    )
    expect(Exit.isFailure(exit) && String(Cause.squash(exit.cause))).toContain('No frame showed')
  })

  test('a message the model offered and update rejects always fails the scenario', async () => {
    const correct = noteProgram(Effect.void)
    // `save` is offered even with an empty text, which `update` rejects.
    const overOffering: Program<Note, NoteModel, Edit, NoteCommand, never> = {
      ...correct,
      makeModel: (note) => ({ ...correct.makeModel(note), save: Opt.some({ _tag: 'Save' } as Offered<Edit>) }),
    }
    const exit = await Effect.runPromiseExit(quietly(drive(overOffering, (driver) =>
      Effect.gen(function*() {
        yield* driver.send((model) => tap(model.save))
        return yield* Effect.never
      }))))
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause) instanceof RejectedMessage).toBe(true)
  })
})
