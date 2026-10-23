import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as HashMap from 'effect/HashMap'
import * as Logger from 'effect/Logger'
import * as Opt from 'effect/Option'
import * as Queue from 'effect/Queue'
import * as References from 'effect/References'
import type * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import type * as Tracer from 'effect/Tracer'
import type { Applied, RunOptions } from './engine.ts'
import { reject, type Step, type Update } from './update.ts'
import type { Program } from './program.ts'
import type { Dispatch } from './dispatch.ts'
import { type Frame, run } from './run.ts'

// A counter that accepts `Increment` and always rejects `Forbidden`; its model has `Increment`, and an input
// that types either (a view that lets the user type `false` is buggy). Its commands only start where a test
// puts them: `Ping` answers `Increment`, `Boom` dies.
type Message = 'Increment' | 'Forbidden'

type Command = 'Ping' | 'Boom'

const update: Update<number, Message, Command> = (message) => (count) =>
  message === 'Increment' ? { state: count + 1 } : reject

type Model = Readonly<{
  count: number
  increment: Message
  type: (increments: boolean) => Message
}>

type Counter<M = Model> = Program<{ state: number; model: M; message: Message; command: Command }>

const counter: Counter = {
  init: { state: 0 },
  update,
  runCommand: (command) => command === 'Ping' ? Effect.succeedSome<Message>('Increment') : Effect.die('boom'),
  makeModel: (count) => ({
    count,
    increment: 'Increment',
    type: (increments) => increments ? 'Increment' : 'Forbidden',
  }),
}

// The engine dies on purpose in some tests: what it logs then is expected.
const quietly = <A, E>(effect: Effect.Effect<A, E>) =>
  effect.pipe(Effect.provideService(References.MinimumLogLevel, 'None'))

const runCounter = (
  program: Counter,
  render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void>,
) => run(program, render)

describe('run', () => {
  test('frames carry the model, and a dispatch that drives the program', async () => {
    const counts: Array<number> = []
    await Effect.runPromise(quietly(runCounter(counter, (frames) =>
      frames.pipe(
        Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
          counts.push(model.count)
          if (model.count < 2) yield* dispatch(model.increment)
        })),
        Stream.take(3),
        Stream.runDrain,
      ))))
    expect(counts).toEqual([0, 1, 2])
  })

  test('a message that update rejects is ignored, and the program goes on', async () => {
    const counts: Array<number> = []
    const exit = await Effect.runPromiseExit(quietly(runCounter(counter, (frames) =>
      frames.pipe(
        Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
          counts.push(model.count)
          // A buggy view: it lets the user type a value that `update` does not accept, then increments.
          yield* dispatch(model.type(false))
          yield* dispatch(model.increment)
        })),
        Stream.take(2),
        Stream.runDrain,
      ))))
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(counts).toEqual([0, 1])
  })

  test('a program with flags starts from the flags it is given, its commands included', async () => {
    const seeded: Program<{ state: number; model: Model; message: Message; command: Command; flags: number }> = {
      ...counter,
      init: (count) => ({ state: count, commands: ['Ping'] }),
    }
    const counts: Array<number> = []
    await Effect.runPromise(run(
      seeded,
      (frames) =>
        frames.pipe(
          Stream.tap(({ model }) => Effect.sync(() => counts.push(model.count))),
          Stream.takeUntil(({ model }) => model.count === 6),
          Stream.runDrain,
        ),
      { flags: 5 },
    ))
    expect(counts.at(-1)).toBe(6)
    // @ts-expect-error: it has nothing to start from.
    expect(() => run(seeded, () => Effect.void)).toBeDefined()
    // @ts-expect-error: it starts without flags.
    expect(() => run(counter, () => Effect.void, { flags: 5 })).toBeDefined()
  })

  test('a program written as a plain object needs a runCommand only for commands it has', async () => {
    const plain = {
      init: { state: 0 },
      update: () => (count: number) => ({ state: count + 1 }),
      makeModel: (count: number) => count,
    }
    const counts: Array<number> = []
    await Effect.runPromise(run(
      plain,
      (frames) => Stream.runForEach(Stream.take(frames, 1), ({ model }) => Effect.sync(() => counts.push(model))),
    ))
    expect(counts).toEqual([0])
    const pinging = { ...plain, update: () => (count: number) => ({ state: count, commands: ['Ping' as const] }) }
    // @ts-expect-error: its `Ping` would go uninterpreted.
    expect(() => run(pinging, () => Effect.void)).toBeDefined()
  })

  test('what a command and the renderer acquire is theirs: no scope to provide, released after they stop', async () => {
    const log: Array<string> = []
    const note = (line: string) => Effect.sync(() => void log.push(line))
    const resource = (name: string) => Effect.acquireRelease(note(`acquire ${name}`), () => note(`release ${name}`))
    const holding = Effect.runSync(Deferred.make<void>())
    const drawing = Effect.runSync(Deferred.make<void>())
    const program: Program<{ state: null; model: null; message: never; command: 'Hold'; services: Scope.Scope }> = {
      init: { state: null, commands: ['Hold'] },
      update: () => (state) => ({ state }),
      runCommand: () =>
        resource('command').pipe(
          Effect.andThen(Deferred.succeed(holding, undefined)),
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => note('command interrupted')),
        ),
      makeModel: (state) => state,
    }
    const running: Effect.Effect<void> = run(
      program,
      (frames) =>
        resource('renderer').pipe(
          Effect.andThen(Deferred.succeed(drawing, undefined)),
          Effect.andThen(Stream.runDrain(frames)),
          Effect.onInterrupt(() => note('renderer interrupted')),
        ),
    )
    await Effect.runPromise(quietly(Effect.gen(function*() {
      const fiber = yield* Effect.forkChild(running)
      yield* Deferred.await(holding)
      yield* Deferred.await(drawing)
      yield* Fiber.interrupt(fiber)
    })))
    for (const name of ['command', 'renderer']) {
      expect(log.indexOf(`${name} interrupted`)).toBeGreaterThan(log.indexOf(`acquire ${name}`))
      expect(log.indexOf(`release ${name}`)).toBeGreaterThan(log.indexOf(`${name} interrupted`))
    }
  })

  test('what runs in a run logs nothing into the span of whoever runs it, which stays the parent of their spans', async () => {
    const commands = 500
    const parents: Array<string> = []
    const logging: Program<{ state: number; model: number; message: 'Next'; command: 'Go' }> = {
      init: { state: 0, commands: ['Go'] },
      update: () => (count) => count < commands ? { state: count + 1, commands: ['Go'] } : { state: count },
      runCommand: () =>
        Effect.logInfo('a command').pipe(
          Effect.andThen(Effect.orDie(Effect.currentSpan)),
          Effect.map((span) => parents.push(span.parent._tag === 'Some' ? span.parent.value.spanId : '')),
          Effect.withSpan('Go'),
          Effect.andThen(Effect.succeedSome<'Next'>('Next')),
        ),
      subscriptions: () =>
        HashMap.make([
          'logs',
          Channel.fromEffectDrain(
            Effect.forever(Effect.logInfo('a subscription').pipe(Effect.andThen(Effect.sleep('1 millis')))),
          ).pipe(
            Channel.concatWith(() => Channel.never),
          ),
        ]),
      makeModel: (count) => count,
    }
    const caller = await Effect.runPromise(
      Effect.gen(function*() {
        yield* run(
          logging,
          (frames) =>
            frames.pipe(
              Stream.tap(() => Effect.logInfo('the renderer')),
              Stream.takeUntil(({ model }) => model >= commands),
              Stream.runDrain,
            ),
          { onApplied: () => Effect.logInfo('onApplied') },
        )
        return yield* Effect.orDie(Effect.currentSpan)
      }).pipe(
        Effect.withSpan('caller'),
        // Down to debug: the engine's own logs, such as a subscription starting, are among them.
        Effect.provideService(References.MinimumLogLevel, 'Debug'),
        Effect.provide(Logger.layer([Logger.tracerLogger])),
      ),
    )
    expect((caller as Tracer.NativeSpan).events).toEqual([])
    // The last command may be cut short by the end of the run.
    expect(parents.length).toBeGreaterThanOrEqual(commands)
    expect(parents.every((parent) => parent === caller.spanId)).toBe(true)
  })

  test('the run ends when the renderer ends', async () => {
    const exit = await Effect.runPromiseExit(quietly(runCounter(counter, (frames) => Stream.runHead(frames))))
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  // What a renderer's plain callbacks rely on: no services, nothing to wait for, whatever runs it.
  test('a dispatch runs with Effect.runSync from a plain callback, and after the run has ended too', async () => {
    let kept: Dispatch<Message> | undefined
    const counts: Array<number> = []
    await Effect.runPromise(quietly(runCounter(counter, (frames) =>
      frames.pipe(
        Stream.tap(({ model, dispatch }) =>
          Effect.sync(() => {
            counts.push(model.count)
            kept = dispatch
            // As a click handler would, outside the renderer's fiber.
            if (model.count === 0) setTimeout(() => Effect.runSync(dispatch(model.increment)), 0)
          })
        ),
        Stream.take(2),
        Stream.runDrain,
      ))))
    expect(counts).toEqual([0, 1])
    expect(() => kept && Effect.runSync(kept('Increment'))).not.toThrow()
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
  const failsWithBoom = async (
    program: Counter,
    { view = () => undefined, ...options }: Partial<RunOptions<Message, number, Command>> & {
      view?: (model: Model) => void
    } = {},
  ) => {
    let sent = false
    const exit = await Effect.runPromiseExit(quietly(run(
      program,
      (frames) =>
        frames.pipe(
          Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
            view(model)
            if (sent) return
            sent = true
            yield* dispatch(model.increment)
          })),
          Stream.runDrain,
        ),
      options,
    )))
    return Exit.isFailure(exit) && Cause.squash(exit.cause) instanceof Boom
  }

  const pinging = { state: 0, commands: ['Ping'] } as const satisfies Step<number, Command>

  // Whoever runs the program reports its defects: wherever one happens, the run fails with it.
  test.each<[string, () => Promise<boolean>]>([
    ['update', () => failsWithBoom({ ...counter, update: () => (count) => count === 0 ? boom() : { state: 1 } })],
    ['update, given a message', () => failsWithBoom({ ...counter, update: () => boom })],
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
})

describe('onApplied', () => {
  test('hears every accepted message in order, with the states around it, before its frame', async () => {
    const heard: Array<Applied<number, Message, Command>> = []
    const drawn: Array<number> = []
    await Effect.runPromise(quietly(run(
      counter,
      (frames) =>
        frames.pipe(
          Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
            drawn.push(heard.length)
            if (model.count < 2) yield* dispatch(model.increment)
          })),
          Stream.take(3),
          Stream.runDrain,
        ),
      { onApplied: (applied) => Effect.sync(() => heard.push(applied)) },
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
      const still: Counter = {
        ...counter,
        init: { state: 0, commands: ['Ping'] },
        update: () => (count) => ({ state: count }),
      }
      yield* run(still, () => Effect.asVoid(Deferred.await(applied)), {
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
      const pinging: Counter = {
        ...counter,
        init: { state: 0, commands: ['Ping'] },
        update: () => (count) => ({ state: count + 1, commands: count === 0 ? ['Ping'] : [] }),
      }
      yield* run(pinging, () => Effect.asVoid(Deferred.await(two)), {
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
    const counting: Counter = {
      ...counter,
      makeModel: (count) => {
        made++
        return counter.makeModel(count)
      },
    }
    const models: Array<number> = []
    let increment: Message | undefined
    await Effect.runPromise(quietly(run(
      counting,
      (frames) =>
        frames.pipe(
          // The second frame sends the first frame's message again, without reading its own model: three frames
          // in all.
          Stream.tap((frame) =>
            Effect.suspend(() => {
              increment ??= frame.model.increment
              return frame.dispatch(increment)
            })
          ),
          Stream.take(3),
          Stream.runLast,
          // Like a renderer that only draws the newest frame, and reads its model twice.
          Effect.map(Opt.map((last) => models.push(last.model.count, last.model.count))),
        ),
    )))
    expect(models).toEqual([2, 2])
    expect(made).toBe(2)
  })

  test('a renderer slower than the program gets only the latest frame', async () => {
    const counts: Array<number> = []
    await Effect.runPromise(quietly(runCounter(counter, (frames) =>
      frames.pipe(
        Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
          counts.push(model.count)
          if (model.count > 0) return
          // Three messages in a burst, while the renderer is still busy with this frame.
          yield* Effect.repeat(dispatch(model.increment), { times: 2 })
          yield* Effect.sleep('50 millis')
        })),
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
      const watch: Program<{
        state: Watch
        model: Readonly<{ watch: Watch; stop: WatchMessage }>
        message: WatchMessage
      }> = {
        init: { state: { isRunning: true, ticks: 0 } },
        update: (message) => (state) =>
          message === 'Tick'
            ? { state: { ...state, ticks: state.ticks + 1 } }
            : { state: { ...state, isRunning: false } },
        subscriptions: (state) => state.isRunning ? HashMap.make(['ticks', ticking]) : HashMap.empty(),
        makeModel: (watch) => ({ watch, stop: 'Stop' }),
      }
      yield* run(watch, (frames) =>
        frames.pipe(
          Stream.tap(({ model, dispatch }) =>
            Effect.suspend(() => {
              latest = model.watch
              return model.watch.isRunning ? dispatch(model.stop) : Deferred.succeed(stopped, undefined)
            })
          ),
          Stream.runDrain,
          // Long enough for a late tick to be applied and drawn, if the engine let it through.
          Effect.raceFirst(Deferred.await(stopped).pipe(Effect.andThen(Effect.sleep('50 millis')))),
        ), {
        // After `update` stopped the watch and before the key goes away: a tick is sent meanwhile.
        onApplied: ({ message }) =>
          message === 'Stop' ? Queue.offer(source, 'Tick').pipe(Effect.andThen(Deferred.await(sent))) : Effect.void,
      })
      return latest.ticks
    })))
    expect(ticks).toBe(0)
  })
})
