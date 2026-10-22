import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import type { Offered } from '../offer.ts'
import { modelOf, type Program } from '../program.ts'
import { RejectedInput } from '../rejection.ts'
import { reject, type Update } from '../update.ts'
import { input, tap } from './action.ts'
import { rehearse } from './rehearse.ts'

describe('rehearse', () => {
  class Storage extends Context.Service<Storage, { readonly store: (text: string) => Effect.Effect<void> }>()(
    'Storage',
  ) {}

  // A note of one line, stored by `Store`, after which `Announce` tells the world and the parent hears `Stored`.
  // It listens to pings only while it is not saving.
  type Note = Readonly<{ text: string; isSaving: boolean; saved: Opt.Option<string>; pings: number }>
  type Edit =
    | Readonly<{ _tag: 'Typed'; text: string }>
    | Readonly<{ _tag: 'Save' }>
    | Readonly<{ _tag: 'Saved'; text: string }>
    | Readonly<{ _tag: 'Pinged' }>
  type NoteCommand = Readonly<{ _tag: 'Store'; text: string }> | Readonly<{ _tag: 'Announce' }>

  const editNote: Update<Note, Edit, NoteCommand, 'Stored'> = (message) => (note) => {
    switch (message._tag) {
      case 'Typed':
        return message.text.includes('\n') ? reject : { state: { ...note, text: message.text } }
      case 'Save':
        return note.isSaving || note.text === ''
          ? reject
          : { state: { ...note, isSaving: true }, commands: [{ _tag: 'Store', text: note.text }] }
      case 'Saved':
        return note.isSaving
          ? {
            state: { ...note, isSaving: false, saved: Opt.some(message.text) },
            commands: [{ _tag: 'Announce' }],
            events: ['Stored'],
          }
          : reject
      case 'Pinged':
        return { state: { ...note, pings: note.pings + 1 } }
    }
  }

  type NoteModel =
    | Readonly<{ _tag: 'Saving'; note: Note }>
    | Readonly<{ _tag: 'Empty'; note: Note; changeText: (text: string) => Offered<Edit> }>
    | Readonly<{ _tag: 'Written'; note: Note; changeText: (text: string) => Offered<Edit>; save: Offered<Edit> }>

  const announced: Array<string> = []

  const program: Program<
    { state: Note; model: NoteModel; message: Edit; command: NoteCommand; services: Storage; event: 'Stored' }
  > = {
    init: { state: { text: '', isSaving: false, saved: Opt.none(), pings: 0 } },
    update: editNote,
    runCommand: (command) =>
      command._tag === 'Store'
        ? Effect.flatMap(Effect.service(Storage), (storage) => storage.store(command.text)).pipe(
          Effect.as(Opt.some<Edit>({ _tag: 'Saved', text: command.text })),
        )
        : Effect.sync(() => {
          announced.push('announced')
          return Opt.none()
        }),
    subscriptions: (note) => note.isSaving ? HashMap.empty() : HashMap.make(['ping', Channel.never]),
    makeModel: (note, { offer, offerInput }): NoteModel => {
      if (note.isSaving) return { _tag: 'Saving', note }
      const changeText = offerInput((text: string): Edit => ({ _tag: 'Typed', text }), note.text)
      return note.text === ''
        ? { _tag: 'Empty', note, changeText }
        : { _tag: 'Written', note, changeText, save: offer({ _tag: 'Save' }) }
    },
  }

  const typing = (text: string) => (model: NoteModel) =>
    model._tag === 'Saving' ? Opt.none() : Opt.some(input(model.changeText, text))

  const saving = (model: NoteModel) => model._tag === 'Written' ? Opt.some(tap(model.save)) : Opt.none()

  const isStore = (command: NoteCommand) => command._tag === 'Store'

  const stored: Array<string> = []

  const withStorage = <A, E>(effect: Effect.Effect<A, E, Storage>) =>
    effect.pipe(Effect.provideService(Storage, { store: (text) => Effect.sync(() => stored.push(text)) }))

  const failureOf = async (effect: Effect.Effect<unknown, never, Storage>) => {
    const exit = await Effect.runPromiseExit(withStorage(effect))
    return Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
  }

  test('a command waits until the test runs it, while the program goes on', async () => {
    stored.length = 0
    const result = await Effect.runPromise(withStorage(rehearse(
      program,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send(typing('milk'))
        yield* rehearsal.send(saving)
        const whileSaving = yield* rehearsal.model
        expect(whileSaving._tag).toBe('Saving')
        expect(yield* rehearsal.pending).toEqual([{ _tag: 'Store', text: 'milk' }])
        expect(stored).toEqual([])
        const ran = yield* rehearsal.run(isStore)
        yield* rehearsal.runAll
        return { ran, state: yield* rehearsal.state, events: yield* rehearsal.events }
      }),
    )))
    expect(stored).toEqual(['milk'])
    expect(result).toEqual({
      ran: { _tag: 'Store', text: 'milk' },
      state: { text: 'milk', isSaving: false, saved: Opt.some('milk'), pings: 0 },
      events: ['Stored'],
    })
  })

  test('runAll runs the commands that the commands it runs start', async () => {
    announced.length = 0
    const pending = await Effect.runPromise(withStorage(rehearse(
      program,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.runAll
        return yield* rehearsal.pending
      }),
      {
        from: {
          state: { ...program.init.state, text: 'tea', isSaving: true },
          commands: [{ _tag: 'Store', text: 'tea' }],
        },
      },
    )))
    expect(pending).toEqual([])
    expect(announced).toEqual(['announced'])
  })

  test('an offer the state has moved past and an answer update rejects are stale: ignored and listed', async () => {
    const ignored = await Effect.runPromise(withStorage(rehearse(
      program,
      Effect.fnUntraced(function*(rehearsal) {
        // Answered while nothing is saving.
        yield* rehearsal.run(isStore)
        yield* rehearsal.send(typing('milk'))
        const written = yield* rehearsal.model
        yield* rehearsal.send(saving)
        // A double tap: the second one comes from the frame that offered saving.
        yield* rehearsal.send(() => saving(written))
        yield* rehearsal.runAll
        return yield* rehearsal.ignored
      }),
      { from: { state: program.init.state, commands: [{ _tag: 'Store', text: 'old' }] } },
    )))
    expect(ignored).toEqual([{ _tag: 'Saved', text: 'old' }, { _tag: 'Save' }])
  })

  test('a subscription\'s message is heard while its key is in the state, and fails the test otherwise', async () => {
    const pings = await Effect.runPromise(withStorage(rehearse(
      program,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.hear('ping', { _tag: 'Pinged' })
        return (yield* rehearsal.state).pings
      }),
    )))
    expect(pings).toBe(1)
    const failure = await failureOf(rehearse(
      program,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send(typing('milk'))
        yield* rehearsal.send(saving)
        yield* rehearsal.hear('ping', { _tag: 'Pinged' })
      }),
      { from: program.init },
    ))
    expect(String(failure)).toContain('Nothing listens under "ping"')
  })

  describe('fails the test', () => {
    test('when the model does not offer what the test sends', async () => {
      expect(String(await failureOf(rehearse(program, (rehearsal) => rehearsal.send(saving)))))
        .toContain('does not offer')
    })

    test('when no pending command matches', async () => {
      expect(String(await failureOf(rehearse(program, (rehearsal) => rehearsal.run(isStore)))))
        .toContain('No pending command matches (pending: none)')
    })

    test('when a command is still pending at the end, since its answer would still arrive', async () => {
      const failure = await failureOf(rehearse(
        program,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.send(typing('milk'))
          yield* rehearsal.send(saving)
        }),
      ))
      expect(String(failure)).toContain('Commands still pending when the scenario ended: Store')
    })

    test('when a typed value the model offered is rejected by update', async () => {
      const failure = await failureOf(rehearse(program, (rehearsal) => rehearsal.send(typing('a\nb'))))
      expect(failure).toBeInstanceOf(RejectedInput)
      // What was typed is in `rejected`, never in the error's message.
      expect(failure instanceof RejectedInput && failure.rejected).toEqual({ _tag: 'Typed', text: 'a\nb' })
      expect(String(failure)).not.toContain('a\nb')
    })

    test('when an offer comes from another run', async () => {
      const outside = modelOf(program)(program.init.state)
      const failure = await failureOf(rehearse(program, (rehearsal) => rehearsal.send(() => typing('milk')(outside))))
      expect(String(failure)).toContain('another run')
    })
  })
})
