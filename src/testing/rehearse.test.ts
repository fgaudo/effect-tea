import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Context from 'effect/Context'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Equal from 'effect/Equal'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Hash from 'effect/Hash'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import { ProgramDefect } from '../defect.ts'
import type { Program } from '../program.ts'
import { reject, type Update } from '../update.ts'
import { type Rehearsal, rehearse } from './rehearse.ts'

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

    test('runs the subscription under the key to its first message, applies it, and releases it at the end', async () => {
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

    // Pings twice, writing down each ping as it makes it; the second waits for `gate`.
    const twice = (log: Array<string>, gate: Effect.Effect<void>): typeof program => ({
      ...program,
      subscriptions: () =>
        HashMap.make([
          'ping',
          Channel.unwrap(Effect.sync(() => {
            log.push('first')
            return Channel.succeed<Edit>({ _tag: 'Pinged' })
          })).pipe(
            Channel.concatWith(() =>
              Channel.unwrap(Effect.as(Effect.andThen(gate, Effect.sync(() => log.push('second'))), Channel.succeed<Edit>({ _tag: 'Pinged' })))
            ),
            Channel.concatWith(() => Channel.never),
          ),
        ]),
    })

    test('each call hears the next message, and the subscription waits between two of them', async () => {
      const log: Array<string> = []
      const pings = await Effect.runPromise(withStorage(rehearse(
        twice(log, Effect.void),
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext('ping')
          yield* Effect.sleep('20 millis')
          expect(log).toEqual(['first'])
          yield* rehearsal.hearNext('ping')
          return (yield* rehearsal.state).pings
        }),
      )))
      expect(pings).toBe(2)
      expect(log).toEqual(['first', 'second'])
    })

    test('a call interrupted while the subscription waits leaves its message to the next one', async () => {
      const log: Array<string> = []
      const pings = await Effect.runPromise(Effect.gen(function*() {
        const gate = yield* Deferred.make<void>()
        return yield* withStorage(rehearse(
          twice(log, Deferred.await(gate)),
          Effect.fnUntraced(function*(rehearsal) {
            yield* rehearsal.hearNext('ping')
            expect(Opt.isNone(yield* Effect.timeoutOption(rehearsal.hearNext('ping'), '20 millis'))).toBe(true)
            yield* Deferred.succeed(gate, undefined)
            yield* rehearsal.hearNext('ping')
            return (yield* rehearsal.state).pings
          }),
        ))
      }))
      expect(pings).toBe(2)
      expect(log).toEqual(['first', 'second'])
    })

    test('a subscription first heard in a fiber that has ended since keeps running while its key stays', async () => {
      const log: Array<string> = []
      const { second, pings } = await Effect.runPromise(withStorage(rehearse(
        twice(log, Effect.void),
        Effect.fnUntraced(function*(rehearsal) {
          // `timeoutOption` runs the call in a fiber of its own, which ends with it.
          yield* Effect.timeoutOption(rehearsal.hearNext('ping'), '1 second')
          const second = yield* Effect.exit(rehearsal.hearNext('ping'))
          return { second: Exit.isSuccess(second), pings: (yield* rehearsal.state).pings }
        }),
      )))
      expect({ second, pings }).toEqual({ second: true, pings: 2 })
    })

    test('a subscription it started is released when whoever runs the rehearsal interrupts it', async () => {
      const log: Array<string> = []
      const ended = await Effect.runPromise(withStorage(rehearse(
        pinging(log),
        (rehearsal) => Effect.andThen(rehearsal.hearNext('ping'), Effect.never),
      )).pipe(Effect.timeoutOption('20 millis')))
      expect(Opt.isNone(ended)).toBe(true)
      expect(log).toEqual(['acquire', 'release'])
    })

    // The key goes away while a `hearNext` waits, in a fiber of the test's, for the message its subscription is about
    // to send: in the run, a message of a start whose key went away never reaches `update`.
    test('a message its subscription sends after its key went away does not reach update', async () => {
      type Listening = Readonly<{ listening: boolean; late: number }>
      type Said = 'Stop' | 'Heard'
      const late = await Effect.runPromise(Effect.gen(function*() {
        const gate = yield* Deferred.make<void>()
        const listening: Program<{ state: Listening; model: Listening; message: Said }> = {
          init: { state: { listening: true, late: 0 } },
          update: (message) => (state) =>
            message === 'Stop'
              ? { state: { ...state, listening: false } }
              : { state: { ...state, late: state.listening ? state.late : state.late + 1 } },
          subscriptions: ({ listening }) =>
            listening
              ? HashMap.make(['k', Channel.unwrap(Effect.as(Deferred.await(gate), Channel.end<Said>('Heard')))])
              : HashMap.empty(),
          makeModel: (state) => state,
        }
        return yield* rehearse(listening, Effect.fnUntraced(function*(rehearsal) {
          const waiting = yield* Effect.forkChild(rehearsal.hearNext('k'))
          yield* Effect.sleep('10 millis')
          yield* Deferred.succeed(gate, undefined)
          yield* rehearsal.send(() => Opt.some('Stop'))
          yield* Fiber.await(waiting)
          return (yield* rehearsal.state).late
        }))
      }))
      expect(late).toBe(0)
    })

    test('a call waiting when its key goes away fails the test, since nothing more arrives under it', async () => {
      const silent: Program<{ state: Readonly<{ listening: boolean }>; model: boolean; message: 'Stop' }> = {
        init: { state: { listening: true } },
        update: () => () => ({ state: { listening: false } }),
        subscriptions: ({ listening }) => listening ? HashMap.make(['k', Channel.never]) : HashMap.empty(),
        makeModel: ({ listening }) => listening,
      }
      const exit = await Effect.runPromise(rehearse(silent, Effect.fnUntraced(function*(rehearsal) {
        const waiting = yield* Effect.forkChild(rehearsal.hearNext('k'))
        yield* Effect.sleep('10 millis')
        yield* rehearsal.send(() => Opt.some('Stop'))
        return yield* Fiber.await(waiting)
      })))
      expect(Exit.isFailure(exit) && String(Cause.squash(exit.cause))).toContain(
        'The subscription under k was stopped while hearNext waited for its message',
      )
    })

    // A message that stops a subscription waits for its release before its state is written, as the run's loop
    // waits before it takes the next message: what arrives in the meantime waits for that state.
    type Counting = Readonly<{ listening: boolean; count: number }>
    type Counted = 'Stop' | 'Count'
    const counting = (
      answer: Effect.Effect<void>,
    ): Program<{ state: Counting; model: Counting; message: Counted; command: 'Count' }> => ({
      init: { state: { listening: true, count: 0 }, commands: ['Count'] },
      update: (message) => (state) =>
        message === 'Stop'
          ? { state: { ...state, listening: false } }
          : { state: { ...state, count: state.count + 1 } },
      runCommand: () => Effect.as(answer, Opt.some<Counted>('Count')),
      subscriptions: ({ listening }) =>
        listening
          ? HashMap.make([
            'k',
            Channel.succeed<Counted>('Stop').pipe(
              Channel.concatWith(() => Channel.never),
              Channel.ensuring(Effect.sleep('50 millis')),
            ),
          ])
          : HashMap.empty(),
      makeModel: (state) => state,
    })

    test('two messages that arrive together, one stopping a subscription, are both applied', async () => {
      const state = await Effect.runPromise(rehearse(
        counting(Effect.sleep('10 millis')),
        Effect.fnUntraced(function*(rehearsal) {
          yield* Effect.all([rehearsal.hearNext('k'), rehearsal.run(() => true)], { concurrency: 'unbounded' })
          return yield* rehearsal.state
        }),
      ))
      expect(state).toEqual({ listening: false, count: 1 })
    })

    test('a command run while a message waits for a release leaves pending once', async () => {
      const { state, pending } = await Effect.runPromise(rehearse(
        counting(Effect.void),
        Effect.fnUntraced(function*(rehearsal) {
          yield* Effect.all([
            rehearsal.hearNext('k'),
            Effect.andThen(Effect.sleep('10 millis'), rehearsal.run(() => true)),
          ], { concurrency: 'unbounded' })
          return { state: yield* rehearsal.state, pending: yield* rehearsal.pending }
        }),
      ))
      expect({ state, pending }).toEqual({ state: { listening: false, count: 1 }, pending: [] })
    })

    test('a subscription that ends before sending anything is heard by its last message', async () => {
      const ending: typeof program = {
        ...program,
        subscriptions: () => HashMap.make(['ping', Channel.end<Edit>({ _tag: 'Pinged' })]),
      }
      const message = await Effect.runPromise(withStorage(rehearse(ending, (rehearsal) => rehearsal.hearNext('ping'))))
      expect(message).toEqual({ _tag: 'Pinged' })
    })

    // Saving makes the key go away, and its answer brings it back.
    const comingBack = Effect.fnUntraced(function*(
      rehearsal: Rehearsal<Note, NoteModel, Edit, NoteCommand, 'Stored', Storage>,
    ) {
      yield* rehearsal.send(typing('milk'))
      yield* rehearsal.send(saving)
      yield* rehearsal.runAll
    })

    const failingWith = <A, R>(effect: Effect.Effect<A, never, R>) =>
      Effect.map(Effect.exit(effect), (exit) => Exit.isFailure(exit) ? String(Cause.squash(exit.cause)) : '')

    test('a start it runs takes no message from hear, until the key goes away and comes back', async () => {
      const log: Array<string> = []
      const { failure, pings } = await Effect.runPromise(withStorage(rehearse(
        pinging(log),
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext('ping')
          const failure = yield* failingWith(rehearsal.hear('ping', { _tag: 'Pinged' }))
          yield* comingBack(rehearsal)
          yield* rehearsal.hear('ping', { _tag: 'Pinged' })
          return { failure, pings: (yield* rehearsal.state).pings }
        }),
      )))
      expect(failure).toContain('The subscription under ping runs under hearNext')
      expect(pings).toBe(2)
    })

    test('a start the test played with hear is not run, until the key goes away and comes back', async () => {
      const log: Array<string> = []
      const { failure, pings } = await Effect.runPromise(withStorage(rehearse(
        pinging(log),
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hear('ping', { _tag: 'Pinged' })
          yield* rehearsal.hear('ping', { _tag: 'Pinged' })
          const failure = yield* failingWith(rehearsal.hearNext('ping'))
          yield* comingBack(rehearsal)
          yield* rehearsal.hearNext('ping')
          return { failure, pings: (yield* rehearsal.state).pings }
        }),
      )))
      expect(failure).toContain('The test plays the subscription under ping with hear')
      expect(pings).toBe(3)
      expect(log).toEqual(['acquire', 'release'])
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

    test('dies in subscriptions when a key\'s Equal throws, as the run does', async () => {
      class Key implements Equal.Equal {
        [Equal.symbol](): boolean {
          throw new Error('boom')
        }
        [Hash.symbol](): number {
          return 0
        }
      }
      const failure = await failureOf(rehearse(
        { ...program, subscriptions: () => HashMap.make([new Key(), Channel.never]) },
        (rehearsal) => rehearsal.hearNext(new Key()),
      ))
      expect(failure instanceof ProgramDefect && failure.where).toBe('subscriptions')
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

    // Commands cannot be cancelled: in the run, a command once started still answers.
    test('when a run interrupted while its command runs leaves the command unanswered', async () => {
      const failure = await failureOf(rehearse(
        { ...program, runCommand: () => Effect.never },
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.send(typing('milk'))
          yield* rehearsal.send(saving)
          yield* Effect.timeoutOption(rehearsal.run(isStore), '20 millis')
        }),
      ))
      expect(String(failure)).toContain('Commands whose run was interrupted before they answered: Store')
    })

    test('when a command is still under way at the end, since its answer would still arrive', async () => {
      const failure = await failureOf(rehearse(
        { ...program, runCommand: () => Effect.never },
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.send(typing('milk'))
          yield* rehearsal.send(saving)
          yield* Effect.forkChild(rehearsal.run(isStore))
          yield* Effect.sleep('10 millis')
        }),
      ))
      expect(String(failure)).toContain('Commands still under way when the scenario ended: Store')
    })
  })
})
