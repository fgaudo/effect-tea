import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as References from 'effect/References'
import type * as Scope from 'effect/Scope'
import * as TestClock from 'effect/testing/TestClock'
import type { Offered } from '../offer.ts'
import type { Program } from '../program.ts'
import { RejectedInput } from '../rejection.ts'
import { reject, type Update } from '../update.ts'
import { input, tap } from './action.ts'
import { drive } from './drive.ts'

describe('drive', () => {
  // A note of one line, saved by `Store`, and pinged once by a subscription that stops with the program.
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
        return note.isSaving || message.text.includes('\n') ? reject : { state: { ...note, text: message.text } }
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

  // Typing is offered while not saving, and saving only for a text that is not empty.
  type NoteModel =
    | Readonly<{ _tag: 'Saving'; note: Note; explode: Offered<Edit> }>
    | Readonly<{ _tag: 'Empty'; note: Note; changeText: (text: string) => Offered<Edit>; explode: Offered<Edit> }>
    | Readonly<{
      _tag: 'Written'
      note: Note
      changeText: (text: string) => Offered<Edit>
      save: Offered<Edit>
      explode: Offered<Edit>
    }>

  const noteProgram = (
    onStop: Effect.Effect<void>,
  ): Program<{ state: Note; model: NoteModel; message: Edit; command: NoteCommand }> => ({
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
    makeModel: (note, { offer, offerInput }): NoteModel => {
      const explode = offer({ _tag: 'Explode' })
      if (note.isSaving) return { _tag: 'Saving', note, explode }
      const changeText = offerInput((text: string): Edit => ({ _tag: 'Typed', text }), note.text)
      return note.text === ''
        ? { _tag: 'Empty', note, changeText, explode }
        : { _tag: 'Written', note, changeText, save: offer({ _tag: 'Save' }), explode }
    },
  })

  const typing = (text: string) => (model: NoteModel) =>
    model._tag === 'Saving' ? Opt.none() : Opt.some(input(model.changeText, text))

  const saving = (model: NoteModel) => model._tag === 'Written' ? Opt.some(tap(model.save)) : Opt.none()

  // The program dies on purpose in some tests: what it logs then is expected.
  const quietly = <A, E>(effect: Effect.Effect<A, E>) =>
    effect.pipe(Effect.provideService(References.MinimumLogLevel, 'None'))

  test('runs the commands and subscriptions, returns what the scenario returns, then stops the program', async () => {
    let stopped = false
    const program = noteProgram(Effect.sync(() => {
      stopped = true
    }))
    const saved = await Effect.runPromise(drive(
      program,
      Effect.fnUntraced(function*(driver) {
        yield* driver.waitFor((model) => model.note.pings === 1 ? Opt.some(true) : Opt.none())
        yield* driver.send(typing('milk'))
        yield* driver.send((model) => model.note.text === 'milk' ? saving(model) : Opt.none())
        return yield* driver.waitFor((model) => model.note.saved)
      }),
    ))
    expect(saved).toBe('milk')
    expect(stopped).toBe(true)
  })

  test('send waits for a frame that offers the action', async () => {
    const saved = await Effect.runPromise(drive(
      noteProgram(Effect.void),
      Effect.fnUntraced(function*(driver) {
        // Not offered while the text is empty.
        yield* Effect.all([driver.send(saving), driver.send(typing('eggs'))], { concurrency: 'unbounded' })
        return yield* driver.waitFor((model) => model.note.saved)
      }),
    ))
    expect(saved).toBe('eggs')
  })

  test('a defect of the program fails the scenario', async () => {
    const exit = await Effect.runPromiseExit(
      quietly(drive(
        noteProgram(Effect.void),
        Effect.fnUntraced(function*(driver) {
          yield* driver.send((model) => Opt.some(tap(model.explode)))
          return yield* Effect.never
        }),
      )),
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

  test('a typed value that update rejects always fails the scenario', async () => {
    const exit = await Effect.runPromiseExit(
      quietly(drive(
        noteProgram(Effect.void),
        Effect.fnUntraced(function*(driver) {
          yield* driver.send(typing('milk\neggs'))
          return yield* Effect.never
        }),
      )),
    )
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause) instanceof RejectedInput).toBe(true)
  })

  test('a program whose commands acquire needs no scope: each command has its own', async () => {
    const released: Array<string> = []
    const holding: Program<{ state: number; model: number; message: 'Held'; command: 'Hold'; services: Scope.Scope }> =
      {
        init: { state: 0, commands: ['Hold'] },
        update: () => (count) => ({ state: count + 1 }),
        runCommand: () =>
          Effect.acquireRelease(Effect.void, () => Effect.sync(() => released.push('resource'))).pipe(
            Effect.as(Opt.some<'Held'>('Held')),
          ),
        makeModel: (count) => count,
      }
    const driven: Effect.Effect<number> = drive(
      holding,
      (driver) => driver.waitFor((count) => count === 1 ? Opt.some(released.length) : Opt.none()),
    )
    expect(await Effect.runPromise(driven)).toBe(1)
  })
})
