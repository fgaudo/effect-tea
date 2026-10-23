import { describe, expect, test } from 'bun:test'
import * as Channel from 'effect/Channel'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import { absurd, identity } from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import type * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import * as Engine from './engine.ts'
import type { Execution } from './command.ts'
import type { Subscription } from './subscription.ts'
import { reject } from './update.ts'

// A counter that accepts `Increment`, `Decrement` only above zero, and never `Forbidden`. Its only commands are
// the initial ones, executions run as they are.
type Message = 'Increment' | 'Decrement' | 'Forbidden'

const make = (initCommands: ReadonlyArray<Execution<Message, never>> = []) =>
  Engine.make<number, Message, Execution<Message, never>, never, never>({
    init: { state: 0, commands: initCommands },
    runCommand: identity,
    update: (message) => (count) =>
      message === 'Increment'
        ? { state: count + 1 }
        : message === 'Decrement' && count > 0
        ? { state: count - 1 }
        : reject,
    subscriptions: () => HashMap.empty(),
  })

const revision = (engine: Engine.Engine<number, Message>, target: Engine.Revision) =>
  engine.states.pipe(
    Stream.filter(({ revision }) => revision >= target),
    Stream.runHead,
    Effect.map(Opt.getOrThrow),
  )

/** Runs `engine.await` for a short while: `None` means the engine is still alive. */
const failureWithin = (engine: Engine.Engine<number, Message>) =>
  engine.await.pipe(Effect.exit, Effect.timeoutOption('200 millis'))

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) => Effect.runPromise(Effect.scoped(effect))

describe('Engine reject', () => {
  test('a message update rejects is ignored, and the program goes on', async () => {
    const outcome = await run(Effect.gen(function*() {
      const engine = yield* make()
      yield* engine.dispatch('Forbidden')
      yield* engine.dispatch('Increment')
      const reached = yield* revision(engine, 1)
      return { reached, failure: yield* failureWithin(engine) }
    }))
    expect(outcome.reached).toEqual({ state: 1, revision: 1 })
    expect(Opt.isNone(outcome.failure)).toBe(true)
  })

  test('a message that no longer applies is ignored', async () => {
    const outcome = await run(Effect.gen(function*() {
      const engine = yield* make()
      yield* engine.dispatch('Increment') // revision 0 → 1
      yield* revision(engine, 1)
      yield* engine.dispatch('Decrement') // revision 1 → 2, back to 0
      yield* engine.dispatch('Decrement') // a double tap: fine at 1, rejected at 0
      yield* engine.dispatch('Increment') // revision 2 → 3
      const reached = yield* revision(engine, 3)
      return { reached, failure: yield* failureWithin(engine) }
    }))
    expect(outcome.reached).toEqual({ state: 1, revision: 3 })
    expect(Opt.isNone(outcome.failure)).toBe(true)
  })

  test('a message rejected after coming from a command is ignored', async () => {
    const outcome = await run(Effect.gen(function*() {
      const engine = yield* make([Effect.succeedSome<Message>('Forbidden')])
      yield* engine.dispatch('Increment')
      const reached = yield* revision(engine, 1)
      return { reached, failure: yield* failureWithin(engine) }
    }))
    expect(outcome.reached.state).toBe(1)
    expect(Opt.isNone(outcome.failure)).toBe(true)
  })

  test('a message sent from an older frame that still applies is applied', async () => {
    const reached = await run(Effect.gen(function*() {
      const engine = yield* make()
      yield* engine.dispatch('Increment')
      yield* engine.dispatch('Increment') // sent from the frame at revision 0, still makes sense
      return yield* revision(engine, 2)
    }))
    expect(reached).toEqual({ state: 2, revision: 2 })
  })
})

describe('Engine subscriptions', () => {
  // The state lists the names of the subscriptions to run; `Bumped` changes it without touching them.
  type Listening = Readonly<{ names: ReadonlyArray<string>; bumps: number }>
  type Change = Readonly<{ _tag: 'Listened'; names: ReadonlyArray<string> }> | Readonly<{ _tag: 'Bumped' }>

  /** Runs an engine whose subscriptions write when they start and when they are stopped. */
  const listening = (log: Array<string>) =>
    Engine.make<Listening, Change, never, never, readonly [string, number]>({
      init: { state: { names: [], bumps: 0 } },
      runCommand: absurd,
      update: (change) => (state) =>
        change._tag === 'Listened'
          ? { state: { ...state, names: change.names } }
          : { state: { ...state, bumps: state.bumps + 1 } },
      // The keys are new tuples every time: only their values say whether they changed.
      subscriptions: ({ names }) =>
        HashMap.fromIterable(names.map((name) =>
          [
            [name, 1] as const,
            // The scope of the effect lasts as long as the channel: stopping it releases what it holds.
            Channel.unwrap(
              Effect.acquireRelease(
                Effect.sync(() => log.push(`start ${name}`)),
                () => Effect.sync(() => log.push(`stop ${name}`)),
              ).pipe(Effect.as(Channel.never)),
            ),
          ] as const
        )),
    })

  /** Sends `changes` one at a time, each once the previous one is applied, letting the subscriptions settle. */
  const send = (engine: Engine.Engine<Listening, Change>, changes: ReadonlyArray<Change>) =>
    Effect.forEach(
      changes,
      Effect.fnUntraced(function*(change, index) {
        yield* engine.states.pipe(Stream.filter(({ revision }) => revision >= index), Stream.runHead)
        yield* engine.dispatch(change)
        yield* engine.states.pipe(Stream.filter(({ revision }) => revision > index), Stream.runHead)
        yield* Effect.sleep('20 millis')
      }),
      { discard: true },
    )

  const logOf = async (changes: ReadonlyArray<Change>) => {
    const log: Array<string> = []
    await run(Effect.gen(function*() {
      const engine = yield* listening(log)
      yield* send(engine, changes)
    }))
    return log
  }

  test('a key that goes away interrupts its subscription, which releases what it holds', async () => {
    expect(await logOf([{ _tag: 'Listened', names: ['a'] }, { _tag: 'Listened', names: [] }])).toEqual([
      'start a',
      'stop a',
    ])
  })

  test('a key that comes back starts a new subscription', async () => {
    const log = await logOf([
      { _tag: 'Listened', names: ['a'] },
      { _tag: 'Listened', names: [] },
      { _tag: 'Listened', names: ['a'] },
    ])
    expect(log.slice(0, 3)).toEqual(['start a', 'stop a', 'start a'])
  })

  test('a key that changes stops the old subscription and starts the new one', async () => {
    const log = await logOf([{ _tag: 'Listened', names: ['a'] }, { _tag: 'Listened', names: ['b'] }])
    expect(log.slice(0, 3)).toEqual(['start a', 'stop a', 'start b'])
  })

  test('a key equal by value keeps its subscription running, untouched', async () => {
    const log = await logOf([{ _tag: 'Listened', names: ['a'] }, { _tag: 'Bumped' }, { _tag: 'Bumped' }])
    expect(log.slice(0, 1)).toEqual(['start a'])
    expect(log.filter((line) => line === 'start a').length).toBe(1)
    expect(log.slice(1)).toEqual(['stop a']) // only when the engine itself stops, at the end of the test
  })
})

describe('Engine same state', () => {
  // `Same` keeps the very same state; `Ping` keeps it too, but runs a command that sends `Increment`.
  type Signal = 'Same' | 'Ping' | 'Increment'

  const make = () =>
    Engine.make<number, Signal, 'Bump', never, never>({
      init: { state: 0 },
      runCommand: () => Effect.succeedSome<Signal>('Increment'),
      update: (signal) => (count) =>
        signal === 'Increment'
          ? { state: count + 1 }
          : signal === 'Same'
          ? { state: count }
          : { state: count, commands: ['Bump'] },
      subscriptions: () => HashMap.empty(),
    })

  const firstAfter = (engine: Engine.Engine<number, Signal>) =>
    engine.states.pipe(Stream.filter(({ revision }) => revision > 0), Stream.runHead, Effect.map(Opt.getOrThrow))

  test('a message that keeps the same state makes no new revision', async () => {
    const reached = await run(Effect.gen(function*() {
      const engine = yield* make()
      yield* engine.dispatch('Same')
      yield* engine.dispatch('Increment')
      return yield* firstAfter(engine)
    }))
    expect(reached).toEqual({ state: 1, revision: 1 })
  })

  test('its commands still run', async () => {
    const reached = await run(Effect.gen(function*() {
      const engine = yield* make()
      yield* engine.dispatch('Ping')
      return yield* firstAfter(engine)
    }))
    expect(reached).toEqual({ state: 1, revision: 1 })
  })
})

describe('Engine subscriptions that end', () => {
  // While `listening`, a subscription sends `a`, then ends with `end`; `Bumped` changes the state, not the keys.
  type Heard = Readonly<{ listening: boolean; heard: ReadonlyArray<string>; bumps: number }>
  type Signal =
    | Readonly<{ _tag: 'Listened'; listening: boolean }>
    | Readonly<{ _tag: 'Heard'; value: string }>
    | Readonly<{ _tag: 'Bumped' }>

  const heard = (value: string): Signal => ({ _tag: 'Heard', value })

  const make = (starts: Array<number>) =>
    Engine.make<Heard, Signal, never, never, string>({
      init: { state: { listening: false, heard: [], bumps: 0 } },
      runCommand: absurd,
      update: (signal) => (state) =>
        signal._tag === 'Listened'
          ? { state: { ...state, listening: signal.listening } }
          : signal._tag === 'Heard'
          ? { state: { ...state, heard: [...state.heard, signal.value] } }
          : { state: { ...state, bumps: state.bumps + 1 } },
      subscriptions: ({ listening }) =>
        listening
          ? HashMap.make([
            'feed',
            Channel.suspend(() => {
              starts.push(starts.length + 1)
              return Channel.mapDone(Channel.succeed(heard('a')), () => heard('end'))
            }),
          ])
          : HashMap.empty(),
    })

  const until = (engine: Engine.Engine<Heard, Signal>, done: (state: Heard) => boolean) =>
    engine.states.pipe(Stream.filter(({ state }) => done(state)), Stream.runHead, Effect.map(Opt.getOrThrow))

  const send = (engine: Engine.Engine<Heard, Signal>, signal: Signal) => engine.dispatch(signal)

  test('a subscription that ends sends its last message to update', async () => {
    const reached = await run(Effect.gen(function*() {
      const engine = yield* make([])
      yield* send(engine, { _tag: 'Listened', listening: true })
      return yield* until(engine, (state) => state.heard.length === 2)
    }))
    expect(reached.state.heard).toEqual(['a', 'end'])
  })

  test('it does not start again while its key stays', async () => {
    const starts: Array<number> = []
    await run(Effect.gen(function*() {
      const engine = yield* make(starts)
      yield* send(engine, { _tag: 'Listened', listening: true })
      yield* until(engine, (state) => state.heard.length === 2)
      yield* send(engine, { _tag: 'Bumped' })
      yield* send(engine, { _tag: 'Bumped' })
      yield* until(engine, (state) => state.bumps === 2)
      yield* Effect.sleep('20 millis')
    }))
    expect(starts).toEqual([1])
  })

  test('it starts again when its key goes away and comes back', async () => {
    const starts: Array<number> = []
    const reached = await run(Effect.gen(function*() {
      const engine = yield* make(starts)
      yield* send(engine, { _tag: 'Listened', listening: true })
      yield* until(engine, (state) => state.heard.length === 2)
      yield* send(engine, { _tag: 'Listened', listening: false })
      yield* until(engine, (state) => !state.listening)
      yield* send(engine, { _tag: 'Listened', listening: true })
      return yield* until(engine, (state) => state.heard.length === 4)
    }))
    expect(starts).toEqual([1, 2])
    expect(reached.state.heard).toEqual(['a', 'end', 'a', 'end'])
  })
})

describe('Engine scopes', () => {
  // `Run` and `Fork` start a command that answers `Done`, `Hold` one that never ends; `Listen` starts the
  // subscription a test gives, `Stop` stops it. The log says what happens, in order.
  type Signal = 'Run' | 'Fork' | 'Hold' | 'Listen' | 'Stop' | 'Done'

  type Track = Readonly<{
    note: (line: string) => Effect.Effect<void>
    resource: (name: string) => Effect.Effect<void, never, Scope.Scope>
  }>

  const tracked = Effect.fnUntraced(function*(
    subscription: (track: Track) => Subscription<Signal, Scope.Scope> = () => Channel.never,
  ) {
    const log: Array<string> = []
    const note = (line: string) => Effect.sync(() => void log.push(line))
    const resource = (name: string) => Effect.acquireRelease(note(`acquire ${name}`), () => note(`release ${name}`))
    const held = yield* Deferred.make<void>()
    const runCommand = (command: Signal): Execution<Signal, Scope.Scope> => {
      switch (command) {
        case 'Run':
          return resource('command').pipe(Effect.as(Opt.some<Signal>('Done')))
        case 'Fork':
          return Effect.gen(function*() {
            const started = yield* Deferred.make<void>()
            yield* Effect.forkScoped(
              Deferred.succeed(started, undefined).pipe(
                Effect.andThen(Effect.never),
                Effect.onInterrupt(() => note('forked fiber interrupted')),
              ),
            )
            yield* Deferred.await(started)
            return Opt.some<Signal>('Done')
          })
        default:
          return resource('held command').pipe(
            Effect.andThen(Deferred.succeed(held, undefined)),
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => note('held command interrupted')),
          )
      }
    }
    const engine = yield* Engine.make<boolean, Signal, Signal, Scope.Scope, string>({
      init: { state: false },
      update: (signal) => (listening) =>
        signal === 'Listen'
          ? { state: true }
          : signal === 'Stop'
          ? { state: false }
          : signal === 'Done'
          ? { state: listening }
          : { state: listening, commands: [signal] },
      runCommand,
      subscriptions: (listening) =>
        listening ? HashMap.make(['subscription', subscription({ note, resource })]) : HashMap.empty(),
      onApplied: ({ message }) => note(`applied ${message}`),
    })
    const send = (signal: Signal) => engine.dispatch(signal)
    const until = Effect.fnUntraced(function*(line: string) {
      while (!log.includes(line)) yield* Effect.sleep('1 millis')
    }, Effect.timeoutOption('1 second'))
    return { log, send, until, held }
  })

  test('what a command acquires is released when it ends, before update hears its message', async () => {
    const log = await run(Effect.gen(function*() {
      const { log, send, until } = yield* tracked()
      yield* send('Run')
      yield* until('applied Done')
      return [...log]
    }))
    expect(log).toEqual(['applied Run', 'acquire command', 'release command', 'applied Done'])
  })

  test('a fiber that a command forks in its scope is interrupted when the command ends', async () => {
    const log = await run(Effect.gen(function*() {
      const { log, send, until } = yield* tracked()
      yield* send('Fork')
      yield* until('applied Done')
      return [...log]
    }))
    expect(log).toEqual(['applied Fork', 'forked fiber interrupted', 'applied Done'])
  })

  const fromEffect = ({ resource }: Track): Subscription<Signal, Scope.Scope> =>
    Channel.fromEffectDrain(resource('subscription')).pipe(Channel.concatWith(() => Channel.never))

  const fromStream = ({ resource }: Track): Subscription<Signal, Scope.Scope> =>
    Stream.fromEffect(resource('subscription')).pipe(
      Stream.drain,
      Stream.concat(Stream.never),
      Stream.toChannel,
      Channel.map((): Signal => 'Done'),
      Channel.concatWith(() => Channel.never),
    )

  for (const [name, subscription] of [['Channel.fromEffect', fromEffect], ['Stream.fromEffect', fromStream]] as const) {
    test(`what a subscription acquires (${name}) is released when its key goes away`, async () => {
      const log = await run(Effect.gen(function*() {
        const { log, send, until } = yield* tracked(subscription)
        yield* send('Listen')
        yield* until('acquire subscription')
        yield* send('Stop')
        yield* until('release subscription')
        return [...log]
      }))
      expect(log).toEqual(['applied Listen', 'acquire subscription', 'applied Stop', 'release subscription'])
    })
  }

  test('when the run ends, what still runs is interrupted before its resources are released', async () => {
    const holding = ({ note, resource }: Track): Subscription<Signal, Scope.Scope> =>
      Channel.fromEffectDrain(
        resource('subscription').pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => note('subscription interrupted')),
        ),
      ).pipe(
        Channel.concatWith(() => Channel.never),
      )
    const log = await run(Effect.gen(function*() {
      const log = yield* Effect.scoped(Effect.gen(function*() {
        const { log, send, until, held } = yield* tracked(holding)
        yield* send('Hold')
        yield* send('Listen')
        yield* Deferred.await(held)
        yield* until('acquire subscription')
        return log
      }))
      return [...log]
    }))
    expect(log.indexOf('held command interrupted')).toBeGreaterThan(log.indexOf('acquire held command'))
    expect(log.indexOf('release held command')).toBeGreaterThan(log.indexOf('held command interrupted'))
    expect(log.indexOf('subscription interrupted')).toBeGreaterThan(log.indexOf('acquire subscription'))
    expect(log.indexOf('release subscription')).toBeGreaterThan(log.indexOf('subscription interrupted'))
  })
})
