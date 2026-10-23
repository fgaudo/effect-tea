import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import type * as Scope from 'effect/Scope'
import * as TestClock from 'effect/testing/TestClock'
import { ProgramDefect } from '../defect.ts'
import type { Program } from '../program.ts'
import { reject, type Update } from '../update.ts'
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

  // Typing is shown while not saving, and saving only for a text that is not empty.
  type NoteModel =
    | Readonly<{ _tag: 'Saving'; note: Note; explode: Edit }>
    | Readonly<{ _tag: 'Empty'; note: Note; changeText: (text: string) => Edit; explode: Edit }>
    | Readonly<{
      _tag: 'Written'
      note: Note
      changeText: (text: string) => Edit
      save: Edit
      explode: Edit
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
    makeModel: (note): NoteModel => {
      const explode: Edit = { _tag: 'Explode' }
      if (note.isSaving) return { _tag: 'Saving', note, explode }
      const changeText = (text: string): Edit => ({ _tag: 'Typed', text })
      return note.text === ''
        ? { _tag: 'Empty', note, changeText, explode }
        : { _tag: 'Written', note, changeText, save: { _tag: 'Save' }, explode }
    },
  })

  const typing = (text: string) => (model: NoteModel) =>
    model._tag === 'Saving' ? Opt.none() : Opt.some(model.changeText(text))

  const saving = (model: NoteModel) => model._tag === 'Written' ? Opt.some(model.save) : Opt.none()

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

  test('a program with flags starts from the flags the test gives it', async () => {
    const program = noteProgram(Effect.void)
    const seeded: Program<{ state: Note; model: NoteModel; message: Edit; command: NoteCommand; flags: string }> = {
      ...program,
      init: (text) => ({ state: { text, isSaving: false, saved: Opt.none(), pings: 0 } }),
    }
    const text = await Effect.runPromise(drive(
      seeded,
      (driver) => driver.waitFor((model) => Opt.some(model.note.text)),
      { flags: 'eggs' },
    ))
    expect(text).toBe('eggs')
    // @ts-expect-error: it has nothing to start from.
    expect(() => drive(seeded, () => Effect.void)).toBeDefined()
  })

  test('a program written as a plain object, without commands, needs no runCommand', async () => {
    const plain = {
      init: { state: { count: 0 } },
      update: () => ({ count }: Readonly<{ count: number }>) => ({ state: { count: count + 1 } }),
      makeModel: ({ count }: Readonly<{ count: number }>) => count,
    }
    expect(await Effect.runPromise(drive(plain, (driver) => driver.waitFor(Opt.some)))).toBe(0)
  })

  test('send waits for a frame that shows the message', async () => {
    const saved = await Effect.runPromise(drive(
      noteProgram(Effect.void),
      Effect.fnUntraced(function*(driver) {
        // Not shown while the text is empty.
        yield* Effect.all([driver.send(saving), driver.send(typing('eggs'))], { concurrency: 'unbounded' })
        return yield* driver.waitFor((model) => model.note.saved)
      }),
    ))
    expect(saved).toBe('eggs')
  })

  test('a defect of the program fails the scenario', async () => {
    const exit = await Effect.runPromiseExit(
      drive(
        noteProgram(Effect.void),
        Effect.fnUntraced(function*(driver) {
          yield* driver.send((model) => Opt.some(model.explode))
          return yield* Effect.never
        }),
      ),
    )
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(defect instanceof ProgramDefect && String(defect.cause)).toContain('boom')
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

  test('a message update rejects is ignored, as when the program runs', async () => {
    const saved = await Effect.runPromise(drive(
      noteProgram(Effect.void),
      Effect.fnUntraced(function*(driver) {
        yield* driver.send(typing('milk\neggs'))
        yield* driver.send(typing('milk'))
        yield* driver.send((model) => model.note.text === 'milk' ? saving(model) : Opt.none())
        return yield* driver.waitFor((model) => model.note.saved)
      }),
    ))
    expect(saved).toBe('milk')
  })

  test('a program whose commands acquire needs no scope: each command has its own', async () => {
    const released: Array<string> = []
    type Holding = Readonly<{ count: number }>
    const holding: Program<{ state: Holding; model: number; message: 'Held'; command: 'Hold'; services: Scope.Scope }> =
      {
        init: { state: { count: 0 }, commands: ['Hold'] },
        update: () => ({ count }) => ({ state: { count: count + 1 } }),
        runCommand: () =>
          Effect.acquireRelease(Effect.void, () => Effect.sync(() => released.push('resource'))).pipe(
            Effect.as(Opt.some<'Held'>('Held')),
          ),
        makeModel: ({ count }) => count,
      }
    const driven: Effect.Effect<number> = drive(
      holding,
      (driver) => driver.waitFor((count) => count === 1 ? Opt.some(released.length) : Opt.none()),
    )
    expect(await Effect.runPromise(driven)).toBe(1)
  })
})
