import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Queue from 'effect/Queue'
import * as References from 'effect/References'
import * as Stream from 'effect/Stream'
import { RejectedMessage, RejectedOffer, type Rejection } from './rejection.ts'
import type { Applied, RunOptions } from './engine.ts'
import { reject, type Step, type Update } from './update.ts'
import type { Offered } from './offer.ts'
import type { Program } from './program.ts'
import { type Frame, run } from './run.ts'

// A counter that accepts `Increment` and always rejects `Forbidden`; its model offers `Increment`. Its
// commands only start where a test puts them: `Ping` answers `Increment`, `Boom` dies.
type Message = 'Increment' | 'Forbidden'

type Command = 'Ping' | 'Boom'

const update: Update<number, Message, Command> = (message) => (count) =>
  message === 'Increment' ? { state: count + 1 } : reject

type Model = Readonly<{ count: number; increment: Offered<Message> }>

const counter: Program<number, Model, Message, Command> = {
  init: { state: 0 },
  update,
  runCommand: (command) => command === 'Ping' ? Effect.succeedSome<Message>('Increment') : Effect.die('boom'),
  makeModel: (count, { offer }) => ({ count, increment: offer('Increment') }),
}

// The engine dies on purpose in some tests: what it logs then is expected.
const quietly = <A, E>(effect: Effect.Effect<A, E>) =>
  effect.pipe(Effect.provideService(References.MinimumLogLevel, 'None'))

const runDying = (
  program: Program<number, Model, Message, Command>,
  render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void>,
) => run(program, render, { onRejected: 'die' })

describe('run', () => {
  test('frames carry the model, and a dispatch that drives the program', async () => {
    const counts: Array<number> = []
    await Effect.runPromise(quietly(runDying(counter, (frames) =>
      frames.pipe(
        Stream.tap(({ model, dispatch }) =>
          Effect.gen(function*() {
            counts.push(model.count)
            if (model.count < 2) yield* dispatch(model.increment)
          })
        ),
        Stream.take(3),
        Stream.runDrain,
      ))))
    expect(counts).toEqual([0, 1, 2])
  })

  test('a message the current frame sends and update rejects makes the run fail', async () => {
    const exit = await Effect.runPromiseExit(quietly(runDying(counter, (frames) =>
      frames.pipe(
        Stream.tap(({ dispatch }) =>
          // A buggy view: it forges a message it was not offered.
          dispatch('Forbidden' as Offered<Message>)
        ),
        Stream.runDrain,
      ))))
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause) instanceof RejectedMessage).toBe(true)
  })

  test('with a function as onRejected, such a message is dropped, reported, and the program goes on', async () => {
    const counts: Array<number> = []
    const reported: Array<Rejection<Message>> = []
    const exit = await Effect.runPromiseExit(quietly(run(
      counter,
      (frames) =>
        frames.pipe(
          Stream.tap(({ model, dispatch }) =>
            Effect.gen(function*() {
              counts.push(model.count)
              // A buggy view: it forges a message, then sends the one it was offered.
              yield* dispatch('Forbidden' as Offered<Message>)
              yield* dispatch(model.increment)
            })
          ),
          Stream.take(2),
          Stream.runDrain,
        ),
      { onRejected: (rejection) => Effect.sync(() => reported.push(rejection)) },
    )))
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(counts).toEqual([0, 1])
    // The second frame's messages are never handled: the run ends with the renderer.
    expect(reported).toEqual([{ message: 'Forbidden', revision: 0 }])
  })

  test('there is no default for rejections, and no way to ignore one without reporting it', () => {
    const optionsAreRequired: undefined extends Parameters<typeof run>[2] ? false : true = true
    // @ts-expect-error a bug that is neither fatal nor reported would go unnoticed
    const unreported: RunOptions<Message> = { onRejected: 'ignore' }
    expect([optionsAreRequired, unreported.onRejected as unknown]).toEqual([true, 'ignore'])
  })

  test('the run ends when the renderer ends', async () => {
    const exit = await Effect.runPromiseExit(quietly(runDying(counter, (frames) => Stream.runHead(frames))))
    expect(Exit.isSuccess(exit)).toBe(true)
  })
})

describe('defects', () => {
  class Boom extends Error {}
  const boom = (): never => {
    throw new Boom()
  }

  /**
   * Runs `program`, sending `Increment` from the first frame and drawing every frame with `view`, and tells
   * whether the run failed with the defect thrown.
   */
  const failsWithBoom = async <Model>(
    program: Program<number, Model, Message, Command>,
    { view = () => undefined, ...options }: Partial<RunOptions<Message, number, Command>> & {
      view?: (model: Model) => void
    } = {},
  ) => {
    let sent = false
    const exit = await Effect.runPromiseExit(quietly(run(
      program,
      (frames) =>
        frames.pipe(
          Stream.tap(({ model, dispatch }) =>
            Effect.gen(function*() {
              view(model)
              if (sent) return
              sent = true
              yield* dispatch('Increment' as Offered<Message>)
            })
          ),
          Stream.runDrain,
        ),
      { onRejected: 'die', ...options },
    )))
    return Exit.isFailure(exit) && Cause.squash(exit.cause) instanceof Boom
  }

  const pinging = { state: 0, commands: ['Ping'] } as const satisfies Step<number, Command>

  // Whoever runs the program reports its defects: wherever one happens, the run fails with it.
  test.each<[string, () => Promise<boolean>]>([
    ['update', () => failsWithBoom({ ...counter, update: () => (count) => count === 0 ? boom() : { state: 1 } })],
    ['update, deciding an offer', () => failsWithBoom({ ...counter, update: () => boom })],
    ['makeModel', () => failsWithBoom({ ...counter, makeModel: boom })],
    ['the view', () => failsWithBoom(counter, { view: ({ count }) => count === 1 ? boom() : undefined })],
    [
      'subscriptions',
      () => failsWithBoom({ ...counter, subscriptions: (count) => count === 1 ? boom() : HashMap.empty() }),
    ],
    [
      'a subscription',
      () => failsWithBoom({ ...counter, subscriptions: () => HashMap.make(['k', Channel.die(new Boom())]) }),
    ],
    ['a command', () => failsWithBoom({ ...counter, init: pinging, runCommand: () => Effect.sync(boom) })],
    ['runCommand', () => failsWithBoom({ ...counter, init: pinging, runCommand: boom })],
    ['describeMessage', () => failsWithBoom(counter, { describeMessage: boom })],
    ['onApplied', () => failsWithBoom(counter, { onApplied: () => Effect.sync(boom) })],
  ])('a defect in %s ends the run, which fails with it', async (_, fails) => {
    expect(await fails()).toBe(true)
  })

  test('an offer that update rejects ends the run with RejectedOffer, as the model is made', async () => {
    const overOffering: Program<number, Offered<Message>, Message, Command> = {
      ...counter,
      makeModel: (_count, { offer }) => offer('Forbidden'),
    }
    const exit = await Effect.runPromiseExit(quietly(run(
      overOffering,
      (frames) => frames.pipe(Stream.tap(({ model }) => Effect.sync(() => model)), Stream.runDrain),
      { onRejected: 'die' },
    )))
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toEqual(new RejectedOffer({ message: 'Forbidden' }))
  })

  test('a rejected message from the current frame is fatal with onRejected: \'die\'', async () => {
    const exit = await Effect.runPromiseExit(
      quietly(runDying(counter, (frames) =>
        frames.pipe(
          Stream.tap(({ dispatch }) => dispatch('Forbidden' as Offered<Message>)),
          Stream.runDrain,
        ))),
    )
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause) instanceof RejectedMessage).toBe(true)
  })
})

describe('onApplied', () => {
  test('hears every accepted message in order, with the states around it, before its frame', async () => {
    const heard: Array<Applied<number, Message, Command>> = []
    const drawn: Array<number> = []
    await Effect.runPromise(quietly(run(
      counter,
      (frames) =>
        frames.pipe(
          Stream.tap(({ model, dispatch }) =>
            Effect.gen(function*() {
              drawn.push(heard.length)
              if (model.count < 2) yield* dispatch(model.increment)
            })
          ),
          Stream.take(3),
          Stream.runDrain,
        ),
      { onRejected: 'die', onApplied: (applied) => Effect.sync(() => heard.push(applied)) },
    )))
    expect(heard).toEqual([
      { message: 'Increment', before: 0, after: 1, revision: 1, commands: [] },
      { message: 'Increment', before: 1, after: 2, revision: 2, commands: [] },
    ])
    expect(drawn).toEqual([0, 1, 2])
  })

  test('a message that leaves the very same state is heard too, with an unchanged revision', async () => {
    const heard = await Effect.runPromise(quietly(Effect.gen(function*() {
      const applied = yield* Deferred.make<Applied<number, Message, Command>>()
      const still: Program<number, Model, Message, Command> = {
        ...counter,
        init: { state: 0, commands: ['Ping'] },
        update: () => (count) => ({ state: count }),
      }
      yield* run(still, () => Effect.asVoid(Deferred.await(applied)), {
        onRejected: 'die',
        onApplied: (message) => Effect.asVoid(Deferred.succeed(applied, message)),
      })
      return yield* Deferred.await(applied)
    })))
    expect(heard).toEqual({ message: 'Increment', before: 0, after: 0, revision: 0, commands: [] })
  })

  test('hears the commands each message started, as update returned them', async () => {
    const heard = await Effect.runPromise(quietly(Effect.gen(function*() {
      const applied: Array<Applied<number, Message, Command>> = []
      const two = yield* Deferred.make<ReadonlyArray<Applied<number, Message, Command>>>()
      // The first increment pings again, so a second one follows.
      const pinging: Program<number, Model, Message, Command> = {
        ...counter,
        init: { state: 0, commands: ['Ping'] },
        update: () => (count) => ({ state: count + 1, commands: count === 0 ? ['Ping'] : [] }),
      }
      yield* run(pinging, () => Effect.asVoid(Deferred.await(two)), {
        onRejected: 'die',
        onApplied: (step) =>
          Effect.suspend(() => {
            applied.push(step)
            return applied.length === 2 ? Effect.asVoid(Deferred.succeed(two, applied)) : Effect.void
          }),
      })
      return yield* Deferred.await(two)
    })))
    expect(heard.map((step) => step.commands)).toEqual([['Ping'], []])
  })
})

describe('frames', () => {
  test('a model is made only for the frames whose model is read, once each', async () => {
    let made = 0
    const counting: Program<number, number, Message, Command> = {
      ...counter,
      makeModel: (count) => {
        made++
        return count
      },
    }
    const models: Array<number> = []
    let seen = 0
    await Effect.runPromise(quietly(run(
      counting,
      (frames) =>
        frames.pipe(
          // The first two frames send an increment without reading their model: three frames in all.
          Stream.tap(({ dispatch }) =>
            Effect.gen(function*() {
              if (seen++ < 2) yield* dispatch('Increment' as Offered<Message>)
            })
          ),
          Stream.take(3),
          Stream.runLast,
          // Like a renderer that only draws the newest frame, and reads its model twice.
          Effect.map(Opt.map((last) => models.push(last.model, last.model))),
        ),
      { onRejected: 'die' },
    )))
    expect(models).toEqual([2, 2])
    expect(made).toBe(1)
  })

  test('a renderer slower than the program gets only the latest frame', async () => {
    const counts: Array<number> = []
    await Effect.runPromise(quietly(runDying(counter, (frames) =>
      frames.pipe(
        Stream.tap(({ model, dispatch }) =>
          Effect.gen(function*() {
            counts.push(model.count)
            if (model.count > 0) return
            // Three messages in a burst, while the renderer is still busy with this frame.
            yield* Effect.repeat(dispatch(model.increment), { times: 2 })
            yield* Effect.sleep('50 millis')
          })
        ),
        Stream.take(2),
        Stream.runDrain,
      ))))
    expect(counts).toEqual([0, 3])
  })
})

describe('subscriptions', () => {
  test('what a subscription leaves in the queue after its key went away does not reach update', async () => {
    // A stopwatch: `Tick` counts in any state, so that only the engine can keep a late one out; `Stop` drops
    // the key of the ticks.
    type Watch = Readonly<{ isRunning: boolean; ticks: number }>
    type WatchMessage = 'Tick' | 'Stop'
    const ticks = await Effect.runPromise(quietly(Effect.gen(function*() {
      const source = yield* Queue.unbounded<'Tick'>()
      const sent = yield* Deferred.make<void>()
      const stopped = yield* Deferred.make<void>()
      let latest: Watch = { isRunning: true, ticks: 0 }
      // The engine asks for what follows the tick only once it has queued the tick: then `sent` completes.
      const ticking = Channel.unwrap(Effect.map(Queue.take(source), (tick) => Channel.succeed(tick))).pipe(
        Channel.concatWith(() => Channel.unwrap(Effect.as(Deferred.succeed(sent, undefined), Channel.never))),
      )
      const watch: Program<Watch, Watch, WatchMessage> = {
        init: { state: { isRunning: true, ticks: 0 } },
        update: (message) => (state) =>
          message === 'Tick'
            ? { state: { ...state, ticks: state.ticks + 1 } }
            : { state: { ...state, isRunning: false } },
        subscriptions: (state) => state.isRunning ? HashMap.make(['ticks', ticking]) : HashMap.empty(),
        makeModel: (state) => state,
      }
      yield* run(watch, (frames) =>
        frames.pipe(
          Stream.tap(({ model, dispatch }) =>
            Effect.suspend(() => {
              latest = model
              return model.isRunning ? dispatch('Stop' as Offered<WatchMessage>) : Deferred.succeed(stopped, undefined)
            })
          ),
          Stream.runDrain,
          // Long enough for a late tick to be applied and drawn, if the engine let it through.
          Effect.raceFirst(Deferred.await(stopped).pipe(Effect.andThen(Effect.sleep('50 millis')))),
        ), {
        onRejected: 'die',
        // After `update` stopped the watch and before the key goes away: a tick is sent meanwhile.
        onApplied: ({ message }) =>
          message === 'Stop' ? Queue.offer(source, 'Tick').pipe(Effect.andThen(Deferred.await(sent))) : Effect.void,
      })
      return latest.ticks
    })))
    expect(ticks).toBe(0)
  })
})
