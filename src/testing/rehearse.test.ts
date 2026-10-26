import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import type { Program } from '../program.ts'
import { reject, type Update } from '../update.ts'
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
    | Readonly<{ _tag: 'Empty'; note: Note; changeText: (text: string) => Edit }>
    | Readonly<{ _tag: 'Written'; note: Note; changeText: (text: string) => Edit; save: Edit }>

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
    makeModel: (note): NoteModel => {
      if (note.isSaving) return { _tag: 'Saving', note }
      const changeText = (text: string): Edit => ({ _tag: 'Typed', text })
      return note.text === ''
        ? { _tag: 'Empty', note, changeText }
        : { _tag: 'Written', note, changeText, save: { _tag: 'Save' } }
    },
  }

  const typing = (text: string) => (model: NoteModel) =>
    model._tag === 'Saving' ? Opt.none() : Opt.some(model.changeText(text))

  const saving = (model: NoteModel) => model._tag === 'Written' ? Opt.some(model.save) : Opt.none()

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

  test('a program with flags starts from the flags the test gives it', async () => {
    const seeded: Program<
      {
        state: Note
        model: NoteModel
        message: Edit
        command: NoteCommand
        services: Storage
        event: 'Stored'
        flags: string
      }
    > = { ...program, init: (text) => ({ state: { text, isSaving: false, saved: Opt.none(), pings: 0 } }) }
    const text = await Effect.runPromise(withStorage(rehearse(
      seeded,
      (rehearsal) => Effect.map(rehearsal.state, (note) => note.text),
      { flags: 'eggs' },
    )))
    expect(text).toBe('eggs')
    const from = { state: { text: 'milk', isSaving: false, saved: Opt.none(), pings: 0 } }
    const fromStep = await Effect.runPromise(withStorage(rehearse(
      seeded,
      (rehearsal) => Effect.map(rehearsal.state, (note) => note.text),
      { from },
    )))
    expect(fromStep).toBe('milk')
    // @ts-expect-error: it has nothing to start from.
    expect(() => rehearse(seeded, () => Effect.void)).toBeDefined()
    // @ts-expect-error: it starts from one or the other.
    expect(() => rehearse(seeded, () => Effect.void, { flags: 'eggs', from })).toBeDefined()
  })

  test('a program written as a plain object, without commands, needs no runCommand', async () => {
    const plain = {
      init: { state: { count: 0 } },
      update: () => ({ count }: Readonly<{ count: number }>) => ({ state: { count: count + 1 } }),
      makeModel: ({ count }: Readonly<{ count: number }>) => count,
    }
    expect(await Effect.runPromise(rehearse(plain, (rehearsal) => rehearsal.state))).toEqual({ count: 0 })
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

  test('a command\'s answer that no longer applies is ignored, and listed', async () => {
    const ignored = await Effect.runPromise(withStorage(rehearse(
      program,
      Effect.fnUntraced(function*(rehearsal) {
        // Answered while nothing is saving.
        yield* rehearsal.run(isStore)
        return yield* rehearsal.ignored
      }),
      { from: { state: program.init.state, commands: [{ _tag: 'Store', text: 'old' }] } },
    )))
    expect(ignored).toEqual([{ _tag: 'Saved', text: 'old' }])
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
    expect(String(failure)).toContain('Nothing listens under ping in the current state')
    // Keys may hold any value a `HashMap` compares, JSON or not.
    const unheard = await failureOf(rehearse(program, (rehearsal) => rehearsal.hear(['Row', 1n], { _tag: 'Pinged' })))
    expect(String(unheard)).toContain('Nothing listens under ["Row","1n"] in the current state')
  })

  describe('hearNext', () => {
    // Pings once at once, and holds a resource while it listens.
    const pinging = (log: Array<string>): typeof program => ({
      ...program,
      subscriptions: (note) =>
        note.isSaving ? HashMap.empty() : HashMap.make([
          'ping',
          Channel.unwrap(
            Effect.acquireRelease(
              Effect.sync(() => log.push('acquire')),
              () => Effect.sync(() => log.push('release')),
            ).pipe(Effect.as(Channel.succeed<Edit>({ _tag: 'Pinged' }).pipe(Channel.concatWith(() => Channel.never)))),
          ),
        ]),
    })

    test('runs the subscription under the key to its first message, applies it, and releases what it held', async () => {
      const log: Array<string> = []
      const { message, pings } = await Effect.runPromise(withStorage(rehearse(
        pinging(log),
        Effect.fnUntraced(function*(rehearsal) {
          const message = yield* rehearsal.hearNext('ping')
          return { message, pings: (yield* rehearsal.state).pings }
        }),
      )))
      expect(message).toEqual({ _tag: 'Pinged' })
      expect(pings).toBe(1)
      expect(log).toEqual(['acquire', 'release'])
    })

    test('a subscription that ends before sending anything is heard by its last message', async () => {
      const ending: typeof program = {
        ...program,
        subscriptions: () => HashMap.make(['ping', Channel.end<Edit>({ _tag: 'Pinged' })]),
      }
      const message = await Effect.runPromise(withStorage(rehearse(ending, (rehearsal) => rehearsal.hearNext('ping'))))
      expect(message).toEqual({ _tag: 'Pinged' })
    })

    test('fails the test when nothing listens under the key', async () => {
      const failure = await failureOf(rehearse(
        program,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.send(typing('milk'))
          yield* rehearsal.send(saving)
          yield* rehearsal.hearNext('ping')
        }),
      ))
      expect(String(failure)).toContain('Nothing listens under ping in the current state')
    })
  })

  describe('fails the test', () => {
    test('when the model does not show what the test sends', async () => {
      expect(String(await failureOf(rehearse(program, (rehearsal) => rehearsal.send(saving)))))
        .toContain('does not show')
    })

    test('when update rejects what the model of the same state shows: a control that does nothing', async () => {
      expect(String(await failureOf(rehearse(program, (rehearsal) => rehearsal.send(typing('a\nb'))))))
        .toContain('a control that does nothing')
      // A tap on an older frame is a message applied to a later state: `send` is not the way to test it.
      const failure = await failureOf(rehearse(
        program,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.send(typing('milk'))
          const written = yield* rehearsal.model
          yield* rehearsal.send(saving)
          yield* rehearsal.send(() => saving(written))
        }),
      ))
      expect(String(failure)).toContain('test it with applyAll')
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
  })
})
