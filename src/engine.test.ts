import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as References from 'effect/References'
import type * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import * as Engine from './engine.ts'
import { RejectedMessage } from './bug.ts'
import type { Command } from './command.ts'
import { reject } from './update.ts'

// A counter that accepts `Increment`, `Decrement` only above zero, and never `Forbidden`.
type Message = 'Increment' | 'Decrement' | 'Forbidden'

const make = (initCommands: ReadonlyArray<Command<Message, never>> = []) =>
  Engine.make<number, Message, never, never, never>({
    init: { state: 0, commands: initCommands },
    update: (message) => (count) =>
      message === 'Increment'
        ? { state: count + 1 }
        : message === 'Decrement' && count > 0
        ? { state: count - 1 }
        : reject,
    subscriptions: () => HashMap.empty(),
    onRejected: 'die',
  })

const first: Engine.Revisioned<number> = { state: 0, revision: 0 }

const revision = (engine: Engine.Engine<number, Message>, target: Engine.Revision) =>
  engine.state$.pipe(
    Stream.filter(({ revision }) => revision >= target),
    Stream.runHead,
    Effect.map(Opt.getOrThrow),
  )

/** Runs `engine.await` for a short while: `None` means the engine is still alive. */
const failureWithin = (engine: Engine.Engine<number, Message>) =>
  engine.await.pipe(Effect.exit, Effect.timeoutOption('200 millis'))

const diedWithRejectedMessage = (exit: Opt.Option<Exit.Exit<never>>) =>
  Opt.isSome(exit) && Exit.isFailure(exit.value) && Cause.squash(exit.value.cause) instanceof RejectedMessage

// Some tests make the engine die on purpose: what it logs then is expected.
const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect).pipe(Effect.provideService(References.MinimumLogLevel, 'None')))

describe('Engine reject', () => {
  test('a message the current frame sent and update rejects kills the engine with RejectedMessage', async () => {
    const exit = await run(Effect.gen(function*() {
      const engine = yield* make()
      engine.dispatchFrom(first)('Forbidden')
      return yield* failureWithin(engine)
    }))
    expect(diedWithRejectedMessage(exit)).toBe(true)
  })

  test('so does one an older frame sent, if its own state rejects it too', async () => {
    const exit = await run(Effect.gen(function*() {
      const engine = yield* make()
      const dispatchFromFirstFrame = engine.dispatchFrom(first)
      dispatchFromFirstFrame('Increment') // revision 0 → 1
      yield* revision(engine, 1)
      // The first frame never had a reason to offer it: a bug, even though the state moved on since.
      dispatchFromFirstFrame('Forbidden')
      return yield* failureWithin(engine)
    }))
    expect(diedWithRejectedMessage(exit)).toBe(true)
  })

  test('a message an older frame offered rightly, and that no longer applies, is ignored', async () => {
    const outcome = await run(Effect.gen(function*() {
      const engine = yield* make()
      engine.dispatchFrom(first)('Increment') // revision 0 → 1
      const atOne = yield* revision(engine, 1)
      const dispatchFromSecondFrame = engine.dispatchFrom(atOne)
      dispatchFromSecondFrame('Decrement') // revision 1 → 2, back to 0
      dispatchFromSecondFrame('Decrement') // a double tap: fine at 1, stale at 0
      engine.dispatchFrom(atOne)('Increment') // revision 2 → 3
      const reached = yield* revision(engine, 3)
      return { reached, failure: yield* failureWithin(engine) }
    }))
    expect(outcome.reached).toEqual({ state: 1, revision: 3 })
    expect(Opt.isNone(outcome.failure)).toBe(true)
  })

  test('a message rejected after coming from a command is ignored', async () => {
    const outcome = await run(Effect.gen(function*() {
      const engine = yield* make([Effect.succeedSome<Message>('Forbidden')])
      engine.dispatchFrom(first)('Increment')
      const reached = yield* revision(engine, 1)
      return { reached, failure: yield* failureWithin(engine) }
    }))
    expect(outcome.reached.state).toBe(1)
    expect(Opt.isNone(outcome.failure)).toBe(true)
  })

  test('a stale message that is still accepted is applied', async () => {
    const reached = await run(Effect.gen(function*() {
      const engine = yield* make()
      const dispatchFromFirstFrame = engine.dispatchFrom(first)
      dispatchFromFirstFrame('Increment')
      dispatchFromFirstFrame('Increment') // drawn from revision 0, still makes sense
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
      onRejected: 'die',
    })

  /** Sends `changes` one at a time, from the frame of the state each one finds, letting the subscriptions settle. */
  const send = (engine: Engine.Engine<Listening, Change>, changes: ReadonlyArray<Change>) =>
    Effect.forEach(changes, (change, index) =>
      Effect.gen(function*() {
        const frame = yield* engine.state$.pipe(
          Stream.filter(({ revision }) => revision >= index),
          Stream.runHead,
          Effect.map(Opt.getOrThrow),
        )
        engine.dispatchFrom(frame)(change)
        yield* engine.state$.pipe(Stream.filter(({ revision }) => revision > index), Stream.runHead)
        yield* Effect.sleep('20 millis')
      }), { discard: true })

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
    Engine.make<number, Signal, never, never, never>({
      init: { state: 0 },
      update: (signal) => (count) =>
        signal === 'Increment'
          ? { state: count + 1 }
          : signal === 'Same'
          ? { state: count }
          : { state: count, commands: [Effect.succeedSome<Signal>('Increment')] },
      subscriptions: () => HashMap.empty(),
      onRejected: 'die',
    })

  const firstAfter = (engine: Engine.Engine<number, Signal>) =>
    engine.state$.pipe(Stream.filter(({ revision }) => revision > 0), Stream.runHead, Effect.map(Opt.getOrThrow))

  test('a message that keeps the same state makes no new revision', async () => {
    const reached = await run(Effect.gen(function*() {
      const engine = yield* make()
      engine.dispatchFrom({ state: 0, revision: 0 })('Same')
      engine.dispatchFrom({ state: 0, revision: 0 })('Increment')
      return yield* firstAfter(engine)
    }))
    expect(reached).toEqual({ state: 1, revision: 1 })
  })

  test('its commands still run', async () => {
    const reached = await run(Effect.gen(function*() {
      const engine = yield* make()
      engine.dispatchFrom({ state: 0, revision: 0 })('Ping')
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
      onRejected: 'die',
    })

  const until = (engine: Engine.Engine<Heard, Signal>, done: (state: Heard) => boolean) =>
    engine.state$.pipe(Stream.filter(({ state }) => done(state)), Stream.runHead, Effect.map(Opt.getOrThrow))

  const send = (engine: Engine.Engine<Heard, Signal>, signal: Signal) =>
    Effect.flatMap(
      Stream.runHead(engine.state$),
      (frame) => Effect.sync(() => engine.dispatchFrom(Opt.getOrThrow(frame))(signal)),
    )

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
