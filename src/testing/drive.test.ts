import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as References from 'effect/References'
import * as TestClock from 'effect/testing/TestClock'
import type { InputOffer, Offer, Offered } from '../offer.ts'
import type { Program } from '../program.ts'
import { RejectedMessage } from '../rejection.ts'
import { reject, type Update } from '../update.ts'
import { drive, input, tap } from './drive.ts'

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

  const noteProgram = (onStop: Effect.Effect<void>): Program<Note, NoteModel, Edit, NoteCommand> => ({
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
    makeModel: (note, { offer, offerInput }) => ({
      note,
      changeText: offerInput((text: string) => ({ _tag: 'Typed', text }), note.text),
      save: offer({ _tag: 'Save' }),
      explode: offer({ _tag: 'Explode' }),
    }),
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
    const overOffering: Program<Note, NoteModel, Edit, NoteCommand> = {
      ...correct,
      makeModel: (note, offers) => ({
        ...correct.makeModel(note, offers),
        save: Opt.some({ _tag: 'Save' } as Offered<Edit>),
      }),
    }
    const exit = await Effect.runPromiseExit(quietly(drive(overOffering, (driver) =>
      Effect.gen(function*() {
        yield* driver.send((model) => tap(model.save))
        return yield* Effect.never
      }))))
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause) instanceof RejectedMessage).toBe(true)
  })
})
