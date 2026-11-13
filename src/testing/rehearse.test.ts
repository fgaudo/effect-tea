import { describe, expect, test } from 'bun:test'
import * as Arr from 'effect/Array'
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
import type * as Scope from 'effect/Scope'
import { prioritizedSchedules } from '../../test/scheduled.ts'
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

  // Each release waits a while for the other to have begun, as the run's do ("keys that go away together release
  // their subscriptions together", `engine.test.ts`): released one after the other, the first would wait in vain.
  test('keys that go away together release the subscriptions hearNext started together, as the run does', async () => {
    type Listening = Readonly<{ names: ReadonlyArray<string> }>
    const waited: Array<'together' | 'alone'> = []
    const released = await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      let begun = 0
      const release = Effect.suspend(() => {
        begun += 1
        return begun === 2
          ? Effect.asVoid(Deferred.succeed(releasing, undefined))
          : Deferred.await(releasing).pipe(
            Effect.timeoutOption('500 millis'),
            Effect.map((met) => {
              waited.push(Opt.isSome(met) ? 'together' : 'alone')
            }),
          )
      })
      const holding = Channel.unwrap(
        Effect.acquireRelease(Effect.void, () => release).pipe(
          Effect.as(Channel.succeed<'Tick'>('Tick').pipe(Channel.concatWith(() => Channel.never))),
        ),
      )
      const listening: Program<{ state: Listening; model: Listening; message: 'Tick' | 'Clear' }> = {
        init: { state: { names: ['a', 'b'] } },
        update: (message) => (state) => message === 'Clear' ? { state: { names: [] } } : { state },
        subscriptions: ({ names }) => HashMap.fromIterable(names.map((name) => [name, holding] as const)),
        makeModel: (state) => state,
      }
      return yield* rehearse(
        listening,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext('a')
          yield* rehearsal.hearNext('b')
          yield* rehearsal.send(() => Opt.some('Clear'))
          return begun
        }),
      )
    }))
    expect(released).toBe(2)
    expect(waited).toEqual(['together'])
  })
})

// The run has one loop, which applies each message whole, whoever sent it: so does `rehearse`, however the fibers of
// the test's, and whoever runs it, interleave and interrupt. The first five cases were found by the second premise
// review of November 2026.
describe('rehearse, under fibers of the test\'s and of whoever runs it', () => {
  // Listens under `k` while `listening`, sending `first` at once, and tells `releasing` when its release starts, which
  // then waits for `gate`. `Drop` stops it and counts one; `Set` counts to the next number only; `Go` starts a command
  // whose answer is `Drop`.
  type Gated = Readonly<{ listening: boolean; count: number }>
  type GatedMessage =
    | Readonly<{ _tag: 'Tick' }>
    | Readonly<{ _tag: 'Drop' }>
    | Readonly<{ _tag: 'Set'; to: number }>
    | Readonly<{ _tag: 'Go' }>
  const gated = (
    releasing: Deferred.Deferred<void>,
    gate: Effect.Effect<void>,
    first: GatedMessage = { _tag: 'Tick' },
  ): Program<{ state: Gated; model: Gated; message: GatedMessage; command: 'Answer' }> => ({
    init: { state: { listening: true, count: 0 } },
    update: (message) => (state) =>
      message._tag === 'Tick'
        ? { state }
        : message._tag === 'Go'
        ? { state, commands: ['Answer'] }
        : message._tag === 'Drop'
        ? state.listening ? { state: { listening: false, count: state.count + 1 } } : reject
        : message.to === state.count + 1
        ? { state: { ...state, count: message.to } }
        : reject,
    runCommand: () => Effect.succeedSome<GatedMessage>({ _tag: 'Drop' }),
    subscriptions: ({ listening }) =>
      listening
        ? HashMap.make([
          'k',
          Channel.succeed<GatedMessage>(first).pipe(
            Channel.concatWith(() => Channel.never),
            Channel.ensuring(Effect.andThen(Deferred.succeed(releasing, undefined), gate)),
          ),
        ])
        : HashMap.empty(),
    makeModel: (state) => state,
  })

  // A `send` that arrives while the message before it waits for a release selects on the state that message leaves,
  // not on the one it found: selected on that one, it would say that `update` rejected what the same state shows.
  test('send selects on the model of the state its message is applied to', async () => {
    const count = await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      return yield* rehearse(gated(releasing, Deferred.await(gate)), Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.hearNext('k')
        const dropping = yield* Effect.forkChild(rehearsal.send(() => Opt.some({ _tag: 'Drop' })))
        yield* Deferred.await(releasing)
        const setting = yield* Effect.forkChild(rehearsal.send(({ count }) => Opt.some({ _tag: 'Set', to: count + 1 })))
        yield* Effect.sleep('10 millis')
        yield* Deferred.succeed(gate, undefined)
        yield* Fiber.join(dropping)
        yield* Fiber.join(setting)
        return (yield* rehearsal.state).count
      }))
    }))
    expect(count).toBe(2)
  })

  // Interrupted while the subscriptions its message stopped release, a `send` still writes the state that stopped
  // them: written by no one, the state would list `k` with nothing listening under it.
  test('a send interrupted while its message stops a subscription leaves the state that stopped it', async () => {
    const listening = await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      return yield* rehearse(gated(releasing, Deferred.await(gate)), Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.hearNext('k')
        const dropping = yield* Effect.forkChild(rehearsal.send(() => Opt.some({ _tag: 'Drop' })))
        yield* Deferred.await(releasing)
        const interrupting = yield* Effect.forkChild(Fiber.interrupt(dropping))
        yield* Effect.sleep('10 millis')
        yield* Deferred.succeed(gate, undefined)
        yield* Fiber.join(interrupting)
        return (yield* rehearsal.state).listening
      }))
    }))
    expect(listening).toBe(false)
  })

  // Pings twice, then waits forever.
  type Pings = Readonly<{ pings: number }>
  const pingingTwice: Program<{ state: Pings; model: Pings; message: 'Pinged' }> = {
    init: { state: { pings: 0 } },
    update: () => ({ pings }) => ({ state: { pings: pings + 1 } }),
    subscriptions: () =>
      HashMap.make([
        'k',
        Channel.succeed<'Pinged'>('Pinged').pipe(
          Channel.concatWith(() => Channel.succeed<'Pinged'>('Pinged')),
          Channel.concatWith(() => Channel.never),
        ),
      ]),
    makeModel: (state) => state,
  }

  // Each waiting call asks for a message of its own: asked for once by both, the second would wait for one nobody
  // asked for.
  test('two calls of hearNext at once on one key each hear a message of their own', async () => {
    const heard = await Effect.runPromise(rehearse(pingingTwice, Effect.fnUntraced(function*(rehearsal) {
      const both = yield* Effect.timeoutOption(
        Effect.all([rehearsal.hearNext('k'), rehearsal.hearNext('k')], { concurrency: 'unbounded' }),
        '200 millis',
      )
      return { both: Opt.isSome(both), pings: (yield* rehearsal.state).pings }
    })))
    expect(heard).toEqual({ both: true, pings: 2 })
  })

  // Ticks once, telling `started`, and dies as it releases what it holds; `Go` starts a command whose answer, `Done`,
  // makes its key go away.
  type Still = Readonly<{ listening: boolean }>
  type StillMessage = 'Tick' | 'Go' | 'Done'
  const dying = (
    started: Deferred.Deferred<void>,
  ): Program<{ state: Still; model: Still; message: StillMessage; command: 'Answer' }> => ({
    init: { state: { listening: true } },
    update: (message) => (state) =>
      message === 'Go'
        ? { state, commands: ['Answer'] }
        : message === 'Done'
        ? { state: { listening: false } }
        : { state },
    runCommand: () => Effect.succeedSome<StillMessage>('Done'),
    subscriptions: ({ listening }) =>
      listening
        ? HashMap.make([
          'ticks',
          Channel.unwrap(Effect.as(Deferred.succeed(started, undefined), Channel.succeed<StillMessage>('Tick'))).pipe(
            Channel.concatWith(() => Channel.never),
            Channel.onExit(() => Effect.die('release')),
          ),
        ])
        : HashMap.empty(),
    makeModel: (state) => state,
  })

  const diesOfRelease = (exit: Exit.Exit<unknown>) =>
    Exit.isFailure(exit)
    && exit.cause.reasons.some((reason) =>
      Cause.isDieReason(reason) && reason.defect instanceof ProgramDefect && reason.defect.where === 'subscription'
      && reason.defect.cause === 'release'
    )

  // As the run interrupted by whoever runs it keeps such a defect in its cause ("a subscription that dies while an
  // interrupted run releases it is in the cause", `run.test.ts`): the end stops what `hearNext` started however the
  // rehearsal ends, and a scope that closed over the subscription would discard its exit.
  test('interrupted by whoever runs it, it fails on a defect of what a subscription releases', async () => {
    const exit = await Effect.runPromise(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const fiber = yield* Effect.forkChild(
        rehearse(dying(started), (rehearsal) => Effect.andThen(rehearsal.hearNext('ticks'), Effect.never)),
      )
      yield* Deferred.await(started)
      yield* Effect.sleep('10 millis')
      yield* Fiber.interrupt(fiber)
      return yield* Fiber.await(fiber)
    }))
    expect(diesOfRelease(exit)).toBe(true)
  })

  // A defect of the program fails the rehearsal as it ends the run, whichever fiber of the test's it reached: had it
  // reached only the fiber that applied the message, one the scenario does not join would lose it, and the rehearsal
  // would succeed where the run dies.
  test('a defect of what a subscription releases fails it, in a fiber of the test\'s that nobody joins', async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      return yield* rehearse(dying(started), Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.hearNext('ticks')
        yield* rehearsal.send(() => Opt.some('Go'))
        yield* Effect.forkChild(rehearsal.run(() => true))
        yield* Effect.sleep('20 millis')
      }))
    }))
    expect(diesOfRelease(exit)).toBe(true)
  })

  // Counts each message; `Boom` makes `update` throw. Listens under `k` to a subscription that dies after `after`,
  // sending nothing.
  type Counted = 'Tick' | 'Boom'
  const counting = (after: Effect.Effect<void>): Program<{ state: Gated; model: Gated; message: Counted }> => ({
    init: { state: { listening: true, count: 0 } },
    update: (message) => (state) => {
      if (message === 'Boom') throw new Error('boom')
      return { state: { ...state, count: state.count + 1 } }
    },
    subscriptions: () =>
      HashMap.make([
        'k',
        Channel.unwrap(Effect.andThen(after, Effect.die('late')).pipe(Effect.as(Channel.end<Counted>('Tick')))),
      ]),
    makeModel: (state) => state,
  })

  const defectsOf = (exit: Exit.Exit<unknown>) =>
    Exit.isFailure(exit) ? exit.cause.reasons.flatMap((reason) => Cause.isDieReason(reason) ? [reason.defect] : []) : []

  // Nothing happens in a run that died: what the test asks the program for after a defect fails with it, though the
  // defect reached none of its calls, and what it reads of the state stays readable.
  test('after a defect of the program, what the test asks for fails with it, and the state is still read', async () => {
    let after: Opt.Option<Readonly<{ sent: Exit.Exit<void>; model: Exit.Exit<Gated>; count: number }>> = Opt.none()
    const exit = await Effect.runPromiseExit(rehearse(
      counting(Effect.sleep('10 millis')),
      Effect.fnUntraced(function*(rehearsal) {
        yield* Effect.timeoutOption(rehearsal.hearNext('k'), '1 millis')
        yield* Effect.sleep('30 millis')
        after = Opt.some({
          sent: yield* Effect.exit(rehearsal.send(() => Opt.some('Tick'))),
          model: yield* Effect.exit(rehearsal.model),
          count: (yield* rehearsal.state).count,
        })
      }),
    ))
    const [died] = defectsOf(exit)
    expect(died).toBeInstanceOf(ProgramDefect)
    expect(Opt.map(after, ({ sent, model, count }) => [defectsOf(sent), defectsOf(model), count])).toEqual(
      Opt.some([[died], [died], 0]),
    )
  })

  // A test that asserts a defect wraps `rehearse`, never the call: caught by the scenario, it fails the rehearsal at
  // the end all the same, first in its cause, before what the scenario ended with.
  test('a defect the scenario catches fails it all the same, first, and once', async () => {
    const caught = await Effect.runPromiseExit(rehearse(counting(Effect.never), (rehearsal) =>
      Effect.exit(rehearsal.send(() => Opt.some('Boom'))).pipe(Effect.andThen(Effect.die('after')))))
    const kept = await Effect.runPromiseExit(rehearse(counting(Effect.never), (rehearsal) =>
      rehearsal.send(() => Opt.some('Boom'))))
    const [died, ...rest] = defectsOf(caught)
    expect(died instanceof ProgramDefect && died.where).toBe('update')
    expect(rest).toEqual(['after'])
    expect(defectsOf(kept)).toHaveLength(1)
  })

  // An interruption by the scenario is no defect, but what the interrupted command releases may die: that defect is
  // the rehearsal's, and the rehearsal that died of it checks nothing more.
  test('a defect of what a command the scenario interrupts releases fails it, alone', async () => {
    const exit = await Effect.runPromiseExit(rehearse(
      {
        ...dying(Deferred.makeUnsafe()),
        runCommand: () =>
          Effect.acquireRelease(Effect.void, () => Effect.die('release')).pipe(Effect.andThen(Effect.never)),
      },
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send(() => Opt.some('Go'))
        const running = yield* Effect.forkChild(rehearsal.run(() => true))
        yield* Effect.sleep('10 millis')
        yield* Fiber.interrupt(running)
      }),
    ))
    const defects = defectsOf(exit)
    expect(defects.map((defect) => defect instanceof ProgramDefect && [defect.where, defect.cause])).toEqual([
      ['command', 'release'],
    ])
  })

  // The scenario returns while a message it sent waits for the release it started: the end waits for that release
  // before it reads what the fibers died of.
  test('a defect of a release still under way when the scenario returns fails it', async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      return yield* rehearse(
        gated(releasing, Effect.andThen(Effect.sleep('20 millis'), Effect.die('release'))),
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext('k')
          yield* Effect.forkChild(rehearsal.send(() => Opt.some({ _tag: 'Drop' })))
          yield* Deferred.await(releasing)
        }),
      )
    }))
    expect(diesOfRelease(exit)).toBe(true)
  })

  // The end interrupts the loop in the step that waits for the release, and the key has already left the state: only
  // the close of the scope the subscription was forked in reaches it, and the rehearsal returns once that close has
  // waited for the release (the `Effect.forkIn` premise in AGENTS.md).
  test('it returns once a release under way when the scenario returns has ended, its key already gone', async () => {
    let released = false
    await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      return yield* rehearse(
        gated(releasing, Effect.andThen(Effect.sleep('20 millis'), Effect.sync(() => {
          released = true
        }))),
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext('k')
          yield* Effect.forkChild(rehearsal.send(() => Opt.some({ _tag: 'Drop' })))
          yield* Deferred.await(releasing)
        }),
      )
    }))
    expect(released).toBe(true)
  })

  // A message once sent is applied whole, whichever call sent it: interrupting the call while its message waits for a
  // release leaves the step to end as it would have.
  test('a run interrupted while its answer stops a subscription has answered, and leaves its state', async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      return yield* rehearse(gated(releasing, Deferred.await(gate)), Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.hearNext('k')
        yield* rehearsal.send(() => Opt.some({ _tag: 'Go' }))
        const running = yield* Effect.forkChild(rehearsal.run(() => true))
        yield* Deferred.await(releasing)
        const interrupting = yield* Effect.forkChild(Fiber.interrupt(running))
        yield* Effect.sleep('10 millis')
        yield* Deferred.succeed(gate, undefined)
        yield* Fiber.join(interrupting)
        return (yield* rehearsal.state).listening
      }))
    }))
    expect(exit).toEqual(Exit.succeed(false))
  })

  test('a hearNext interrupted while its message stops a subscription leaves the state the message made', async () => {
    const listening = await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      return yield* rehearse(
        gated(releasing, Deferred.await(gate), { _tag: 'Drop' }),
        Effect.fnUntraced(function*(rehearsal) {
          const hearing = yield* Effect.forkChild(rehearsal.hearNext('k'))
          yield* Deferred.await(releasing)
          const interrupting = yield* Effect.forkChild(Fiber.interrupt(hearing))
          yield* Effect.sleep('10 millis')
          yield* Deferred.succeed(gate, undefined)
          yield* Fiber.join(interrupting)
          return (yield* rehearsal.state).listening
        }),
      )
    }))
    expect(listening).toBe(false)
  })
})

describe('rehearse, while a fiber of the test\'s waits for what nothing will send', () => {
  // `Go` starts `Dies`, a command that dies after a while, and `Waits`, one that never answers; every other message
  // counts. Listens under `k` to `subscription`.
  type Counter = Readonly<{ count: number }>
  type Waited = 'Tick' | 'Go' | 'Last'
  const waiting = (
    subscription: Channel.Channel<Waited, never, Waited>,
  ): Program<{ state: Counter; model: Counter; message: Waited; command: 'Dies' | 'Waits' }> => ({
    init: { state: { count: 0 } },
    update: (message) => ({ count }) =>
      message === 'Go' ? { state: { count }, commands: ['Dies', 'Waits'] } : { state: { count: count + 1 } },
    runCommand: (command) =>
      command === 'Dies' ? Effect.andThen(Effect.sleep('10 millis'), Effect.die('boom')) : Effect.never,
    subscriptions: () => HashMap.make(['k', subscription]),
    makeModel: (state) => state,
  })

  // What the rehearsal ended with, or `hung` when it had not ended after 300 milliseconds.
  const outcomeOf = <A, E>(rehearsal: Effect.Effect<A, E>) =>
    Effect.runPromise(
      Effect.map(Effect.timeoutOption(Effect.exit(rehearsal), '300 millis'), Opt.getOrElse(() => 'hung' as const)),
    )

  const whereDied = (outcome: Exit.Exit<unknown, unknown> | 'hung') =>
    outcome === 'hung'
      ? 'hung'
      : Exit.isFailure(outcome)
      ? outcome.cause.reasons.flatMap((reason) =>
        Cause.isDieReason(reason) && reason.defect instanceof ProgramDefect ? [reason.defect.where] : []
      )
      : []

  // The run dies as soon as one of its fibers dies, and interrupts what still waits: a call of the test's that waits
  // for a message nothing will send ends with the defect, or the rehearsal never ends where the run has died.
  test('a hearNext waiting on its subscription fails as soon as another fiber of the test\'s dies', async () => {
    const outcome = await outcomeOf(rehearse(waiting(Channel.never), Effect.fnUntraced(function*(rehearsal) {
      yield* rehearsal.send(() => Opt.some('Go'))
      yield* Effect.forkChild(rehearsal.run((command) => command === 'Dies'))
      yield* rehearsal.hearNext('k')
    })))
    expect(whereDied(outcome)).toEqual(['command'])
  })

  test('a run waiting for its command fails as soon as another fiber of the test\'s dies', async () => {
    const outcome = await outcomeOf(rehearse(waiting(Channel.never), Effect.fnUntraced(function*(rehearsal) {
      yield* rehearsal.send(() => Opt.some('Go'))
      yield* Effect.forkChild(rehearsal.run((command) => command === 'Dies'))
      yield* rehearsal.run((command) => command === 'Waits')
    })))
    expect(whereDied(outcome)).toEqual(['command'])
  })

  // Two calls wait when the subscription ends: one hears its last message, after which it sends nothing, so the
  // other fails, as a call made after the end does; waiting for a message that cannot come, it would never return.
  test('of two hearNext waiting as the subscription ends, one hears its end, the other fails', async () => {
    const outcome = await outcomeOf(rehearse(waiting(Channel.end<Waited>('Last')), (rehearsal) =>
      Effect.all([Effect.exit(rehearsal.hearNext('k')), Effect.exit(rehearsal.hearNext('k'))], {
        concurrency: 'unbounded',
      })))
    expect(outcome !== 'hung' && Exit.isSuccess(outcome) && outcome.value.map(Exit.isSuccess).sort()).toEqual([
      false,
      true,
    ])
  })
})

describe('rehearse, as the release of what died lets another fiber die', () => {
  // Dies of `first`, then releases, which lets `second` die; uninterruptible, so that the end of the rehearsal, which
  // `first` starts, lets it.
  const diesThenReleases = (released: Deferred.Deferred<void>) =>
    Effect.addFinalizer(() => Deferred.succeed(released, undefined)).pipe(
      Effect.andThen(Effect.yieldNow),
      Effect.andThen(Effect.die('first')),
    )
  const diesOnceReleased = (released: Deferred.Deferred<void>) =>
    Effect.uninterruptible(Deferred.await(released).pipe(Effect.andThen(Effect.die('second'))))

  type Still = Readonly<{ still: true }>
  // `First` and the subscription under `first` die of `first`; `Second` and the one under `second`, of `second`.
  const ordered = (
    released: Deferred.Deferred<void>,
  ): Program<{ state: Still; model: Still; message: 'Heard'; command: 'First' | 'Second'; services: Scope.Scope }> => ({
    init: { state: { still: true }, commands: ['First', 'Second'] },
    update: () => (state) => ({ state }),
    runCommand: (command) => command === 'First' ? diesThenReleases(released) : diesOnceReleased(released),
    subscriptions: () =>
      HashMap.make(
        ['first', Channel.fromEffectDone(diesThenReleases(released))],
        ['second', Channel.fromEffectDone(diesOnceReleased(released))],
      ),
    makeModel: (state) => state,
  })

  const defectsOf = (exit: Exit.Exit<unknown, unknown>) =>
    Exit.isFailure(exit)
      ? exit.cause.reasons.flatMap((reason) =>
        Cause.isDieReason(reason) && reason.defect instanceof ProgramDefect ? [reason.defect.cause] : []
      )
      : []

  test('a command that dies before another, which its release lets die, fails it first', async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const released = yield* Deferred.make<void>()
      return yield* rehearse(ordered(released), Effect.fnUntraced(function*(rehearsal) {
        yield* Effect.forkChild(rehearsal.run((command) => command === 'Second'))
        yield* Effect.sleep('10 millis')
        yield* rehearsal.run((command) => command === 'First')
      }))
    }))
    expect(defectsOf(exit)).toEqual(['first', 'second'])
  })

  test('a subscription that dies before another, which its release lets die, fails it first', async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const released = yield* Deferred.make<void>()
      return yield* rehearse(ordered(released), Effect.fnUntraced(function*(rehearsal) {
        yield* Effect.forkChild(rehearsal.hearNext('second'))
        yield* Effect.sleep('10 millis')
        yield* rehearsal.hearNext('first')
      }), { from: { state: { still: true } } })
    }))
    expect(defectsOf(exit)).toEqual(['first', 'second'])
  })

  test('a subscription dying in a scope of its channel, before one its release lets die, fails it first', async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const released = yield* Deferred.make<void>()
      const dying = yield* Deferred.make<void>()
      const program: Program<{ state: Still; model: Still; message: 'Heard'; services: Scope.Scope }> = {
        init: { state: { still: true } },
        update: () => (state) => ({ state }),
        subscriptions: () =>
          HashMap.make(
            [
              'first',
              // Dies inside a scope of the channel's own, whose release lets `second` die, and ends once it has.
              Channel.unwrap(
                Effect.addFinalizer(() =>
                  Deferred.succeed(released, undefined).pipe(
                    Effect.andThen(Deferred.await(dying)),
                    Effect.andThen(Effect.yieldNow),
                  )
                ).pipe(Effect.as(Channel.fromEffectDone(Effect.yieldNow.pipe(Effect.andThen(Effect.die('first')))))),
              ),
            ],
            [
              'second',
              Channel.fromEffectDone(Effect.uninterruptible(
                Deferred.await(released).pipe(
                  Effect.andThen(Deferred.succeed(dying, undefined)),
                  Effect.andThen(Effect.die('second')),
                ),
              )),
            ],
          ),
        makeModel: (state) => state,
      }
      return yield* rehearse(program, Effect.fnUntraced(function*(rehearsal) {
        yield* Effect.forkChild(rehearsal.hearNext('second'))
        yield* Effect.sleep('10 millis')
        yield* rehearsal.hearNext('first')
      }))
    }))
    expect(defectsOf(exit)).toEqual(['first', 'second'])
  })

  // `run` loses its race with the death of its own command, and interrupts it while it still releases what it holds:
  // the race waits for that release, which then dies too.
  const diesThenDiesInItsRelease = Effect.addFinalizer(() =>
    Effect.sleep('20 millis').pipe(Effect.andThen(Effect.die('release')))
  ).pipe(Effect.andThen(Effect.die('first')))

  test('a run whose command dies, then dies again as it slowly releases, fails with both', async () => {
    const exit = await Effect.runPromiseExit(rehearse(
      {
        init: { state: { still: true }, commands: ['First'] },
        update: () => (state: Still) => ({ state }),
        runCommand: () => diesThenDiesInItsRelease,
        makeModel: (state: Still) => state,
      },
      (rehearsal) => rehearsal.run(() => true),
    ))
    expect(defectsOf(exit)).toEqual(['first', 'release'])
  })
})

// The form of the engine's window between a check of its register and what it guards: the loop of `rehearse` checks
// the register as it takes a step (`deadOr`), and may yield before it calls `update`, as `run` may before it calls
// `runCommand` and `model` before it calls `makeModel`, while another fiber dies. Each checks again in the thunk that
// calls the program, which a scheduler the test controls reaches.
describe('rehearse, after the first defect, a yield of the scheduler in between', () => {
  type Count = Readonly<{ n: number }>

  const lateCalls = (what: 'send' | 'run' | 'model', late: { n: number }) =>
    Effect.suspend(() => {
      let probing = false
      let rehearsing: Rehearsal<Count, Count, 'Go' | 'Hit', 'Die' | 'Start'> | undefined
      // `model` reads `makeModel`, which this probe is called from.
      const dead = () => {
        if (rehearsing === undefined || probing) return false
        probing = true
        const died = Exit.isFailure(Effect.runSync(Effect.exit(rehearsing.model)))
        probing = false
        return died
      }
      const program: Program<{ state: Count; model: Count; message: 'Go' | 'Hit'; command: 'Die' | 'Start' }> = {
        init: { state: { n: 0 } },
        update: (message) => ({ n }) => {
          if (message === 'Hit' && dead()) late.n += 1
          return message === 'Go'
            ? { state: { n: n + 1 }, commands: ['Die', 'Start', 'Start'] }
            : { state: { n: n + 1 } }
        },
        runCommand: (command) => {
          if (command === 'Start' && dead()) late.n += 1
          return command === 'Die' ? Effect.die('boom') : Effect.succeedNone
        },
        makeModel: (state) => {
          if (what === 'model' && !probing && dead()) late.n += 1
          return state
        },
      }
      return rehearse(program, Effect.fnUntraced(function*(rehearsal) {
        rehearsing = rehearsal
        yield* rehearsal.send(() => Opt.some('Go'))
        const dying = yield* Effect.forkChild(Effect.exit(rehearsal.run((command) => command === 'Die')))
        const call: Effect.Effect<unknown> = what === 'send'
          ? rehearsal.send(() => Opt.some('Hit'))
          : what === 'run'
          ? rehearsal.run((command) => command === 'Start')
          : rehearsal.model
        yield* Effect.all(Arr.makeBy(2, () => Effect.exit(call)), { concurrency: 'unbounded', discard: true })
        yield* Fiber.await(dying)
      })).pipe(Effect.exit)
    })

  for (const [what, called] of [['send', 'update'], ['run', 'runCommand'], ['model', 'makeModel']] as const) {
    test(`${what} calls no ${called} once a command has died, under prioritized schedules`, () => {
      const late = { n: 0 }
      prioritizedSchedules(lateCalls(what, late), { runs: 2000, depth: 4 }, () => {})
      expect(late.n).toBe(0)
    })
  }
})

// A release that interrupts itself after its command died is a second defect, as in the run ("a release that
// interrupts itself", `run.test.ts`): never a bare interruption in the cause.
const quitting = 'rehearse fails on a release that interrupts itself after its command died, with two defects'

test(quitting, async () => {
  type Still = Readonly<{ still: boolean }>
  const exit = await Effect.runPromiseExit(rehearse(
    {
      init: { state: { still: true }, commands: ['Boom'] },
      update: () => (state: Still) => ({ state }),
      runCommand: () => Effect.addFinalizer(() => Effect.interrupt).pipe(Effect.andThen(Effect.die('boom'))),
      makeModel: (state: Still) => state,
    },
    (rehearsal) => rehearsal.run(() => true),
  ))
  const said = Exit.isFailure(exit)
    ? exit.cause.reasons.map((reason) =>
      Cause.isDieReason(reason) && reason.defect instanceof ProgramDefect
        ? reason.defect.cause instanceof Error ? reason.defect.cause.message : reason.defect.cause
        : reason._tag
    )
    : []
  expect(said).toEqual(['boom', 'It interrupted itself, which only the run may do'])
})

describe('rehearse, as another call takes what it checked, a yield of the scheduler in between', () => {
  test('runAll runs what is pending, though another call takes the last command, under prioritized schedules', () => {
    type Done = Readonly<{ done: boolean }>
    const program: Program<{ state: Done; model: Done; message: 'Go' | 'Worked'; command: 'Work' }> = {
      init: { state: { done: false } },
      update: (message) => (state) => message === 'Go' ? { state, commands: ['Work'] } : { state: { done: true } },
      runCommand: () => Effect.succeedSome('Worked'),
      makeModel: (state) => state,
    }
    const failed = { n: 0 }
    prioritizedSchedules(
      rehearse(program, Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send(() => Opt.some('Go'))
        const [all] = yield* Effect.all([Effect.exit(rehearsal.runAll), Effect.exit(rehearsal.run(() => true))], {
          concurrency: 'unbounded',
        })
        if (Exit.isFailure(all)) failed.n += 1
      })).pipe(Effect.exit),
      { runs: 2000, depth: 4 },
      () => {},
    )
    expect(failed.n).toBe(0)
  })
})
