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
import { defect, type DefectSite, InvariantDefect, ProgramDefect } from './defect.ts'
import type { Applied, Ignored, RunOptions } from './engine.ts'
import { reject, type Step, type Update } from './update.ts'
import type { Program } from './program.ts'
import type { Dispatch } from './dispatch.ts'
import { type Frame, run } from './run.ts'

// A counter that accepts `Increment` and always rejects `Forbidden`; its model has `Increment`, and an input
// that types either (a view that lets the user type `false` is buggy). Its commands only start where a test
// puts them: `Ping` answers `Increment`, `Boom` dies.
type Message = 'Increment' | 'Forbidden'

type Command = 'Ping' | 'Boom'

type Count = Readonly<{ count: number }>

const update: Update<Count, Message, Command> = (message) => ({ count }) =>
  message === 'Increment' ? { state: { count: count + 1 } } : reject

type Model = Readonly<{
  count: number
  increment: Message
  type: (increments: boolean) => Message
}>

type Counter<M = Model> = Program<{ state: Count; model: M; message: Message; command: Command }>

const counter: Counter = {
  init: { state: { count: 0 } },
  update,
  runCommand: (command) => command === 'Ping' ? Effect.succeedSome<Message>('Increment') : Effect.die('boom'),
  makeModel: ({ count }) => ({
    count,
    increment: 'Increment',
    type: (increments) => increments ? 'Increment' : 'Forbidden',
  }),
}

const runCounter = (
  program: Counter,
  render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void>,
) => run(program, render)

describe('run', () => {
  test('frames carry the model, and a dispatch that drives the program', async () => {
    const counts: Array<number> = []
    await Effect.runPromise(runCounter(counter, (frames) =>
      frames.pipe(
        Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
          counts.push(model.count)
          if (model.count < 2) yield* dispatch(model.increment)
        })),
        Stream.take(3),
        Stream.runDrain,
      )))
    expect(counts).toEqual([0, 1, 2])
  })

  test('a message that update rejects is ignored, and the program goes on', async () => {
    const counts: Array<number> = []
    const exit = await Effect.runPromiseExit(runCounter(counter, (frames) =>
      frames.pipe(
        Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
          counts.push(model.count)
          // A buggy view: it lets the user type a value that `update` does not accept, then increments.
          yield* dispatch(model.type(false))
          yield* dispatch(model.increment)
        })),
        Stream.take(2),
        Stream.runDrain,
      )))
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(counts).toEqual([0, 1])
  })

  test('a program with flags starts from the flags it is given, its commands included', async () => {
    const seeded: Program<{ state: Count; model: Model; message: Message; command: Command; flags: number }> = {
      ...counter,
      init: (count) => ({ state: { count }, commands: ['Ping'] }),
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
      init: { state: { count: 0 } },
      update: () => ({ count }: Count) => ({ state: { count: count + 1 } }),
      makeModel: ({ count }: Count) => count,
    }
    const counts: Array<number> = []
    await Effect.runPromise(run(
      plain,
      (frames) => Stream.runForEach(Stream.take(frames, 1), ({ model }) => Effect.sync(() => counts.push(model))),
    ))
    expect(counts).toEqual([0])
    const pinging = { ...plain, update: () => (state: Count) => ({ state, commands: ['Ping' as const] }) }
    // @ts-expect-error: its `Ping` would go uninterpreted.
    expect(() => run(pinging, () => Effect.void)).toBeDefined()
  })

  test('what a command and the renderer acquire is theirs: no scope to provide, released after they stop', async () => {
    const log: Array<string> = []
    const note = (line: string) => Effect.sync(() => void log.push(line))
    const resource = (name: string) => Effect.acquireRelease(note(`acquire ${name}`), () => note(`release ${name}`))
    const holding = Deferred.makeUnsafe<void>()
    const drawing = Deferred.makeUnsafe<void>()
    const program: Program<{ state: object; model: null; message: never; command: 'Hold'; services: Scope.Scope }> = {
      init: { state: {}, commands: ['Hold'] },
      update: () => (state) => ({ state }),
      runCommand: () =>
        resource('command').pipe(
          Effect.andThen(Deferred.succeed(holding, undefined)),
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => note('command interrupted')),
        ),
      makeModel: () => null,
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
    await Effect.runPromise(Effect.gen(function*() {
      const fiber = yield* Effect.forkChild(running)
      yield* Deferred.await(holding)
      yield* Deferred.await(drawing)
      yield* Fiber.interrupt(fiber)
    }))
    for (const name of ['command', 'renderer']) {
      expect(log.indexOf(`${name} interrupted`)).toBeGreaterThan(log.indexOf(`acquire ${name}`))
      expect(log.indexOf(`release ${name}`)).toBeGreaterThan(log.indexOf(`${name} interrupted`))
    }
  })

  test('what runs in a run logs nothing into the span of whoever runs it, which stays the parent of their spans', async () => {
    const commands = 500
    const parents: Array<string> = []
    const logging: Program<{ state: Count; model: number; message: 'Next'; command: 'Go' }> = {
      init: { state: { count: 0 }, commands: ['Go'] },
      update: () => (state) =>
        state.count < commands ? { state: { count: state.count + 1 }, commands: ['Go'] } : { state },
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
      makeModel: ({ count }) => count,
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
    const exit = await Effect.runPromiseExit(runCounter(counter, (frames) => Stream.runHead(frames)))
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  // What a renderer's plain callbacks rely on: no services, nothing to wait for, whatever runs it.
  test('a dispatch runs with Effect.runSync from a plain callback, and after the run has ended too', async () => {
    let kept: Dispatch<Message> | undefined
    const counts: Array<number> = []
    await Effect.runPromise(runCounter(counter, (frames) =>
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
      )))
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
   * Runs `program`, sending `Increment` from the first frame and drawing every frame with `view`, with debug logs
   * enabled, and tells where the run says its defect happened, if it died with the one thrown, and what it
   * logged above the debug level.
   */
  const failsWithBoom = async (
    program: Counter,
    { view = () => undefined, ...options }: Partial<RunOptions<Message, Count, Command>> & {
      view?: (model: Model) => void
    } = {},
  ) => {
    let sent = false
    const logged: Array<unknown> = []
    const aboveDebug = Logger.make(({ message, logLevel }) => {
      if (logLevel !== 'Debug') logged.push(message)
    })
    const exit = await Effect.runPromiseExit(
      run(
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
      ).pipe(
        Effect.provideService(References.MinimumLogLevel, 'Debug'),
        Effect.provide(Logger.layer([aboveDebug])),
      ),
    )
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    return defect instanceof ProgramDefect && defect.cause instanceof Boom
      ? { where: defect.where, logged }
      : { defect, logged }
  }

  const pinging = { state: { count: 0 }, commands: ['Ping'] } as const satisfies Step<Count, Command>

  // Whoever runs the program reports its defects: wherever one happens, the run dies with it and with where it
  // happened, and logs nothing about it.
  test.each<[string, DefectSite, () => ReturnType<typeof failsWithBoom>]>([
    [
      'update',
      'update',
      () => failsWithBoom({ ...counter, update: () => ({ count }) => count === 0 ? boom() : { state: { count: 1 } } }),
    ],
    ['update, given a message', 'update', () => failsWithBoom({ ...counter, update: () => boom })],
    ['makeModel', 'render', () => failsWithBoom({ ...counter, makeModel: boom })],
    ['the view', 'render', () => failsWithBoom(counter, { view: ({ count }) => count === 1 ? boom() : undefined })],
    [
      'subscriptions',
      'subscriptions',
      () => failsWithBoom({ ...counter, subscriptions: ({ count }) => count === 1 ? boom() : HashMap.empty() }),
    ],
    [
      'a subscription',
      'subscription',
      () => failsWithBoom({ ...counter, subscriptions: () => HashMap.make(['k', Channel.die(new Boom())]) }),
    ],
    [
      'a command',
      'command',
      () => failsWithBoom({ ...counter, init: pinging, runCommand: () => Effect.sync(boom) }),
    ],
    ['runCommand', 'command', () => failsWithBoom({ ...counter, init: pinging, runCommand: boom })],
    ['describeMessage', 'describeMessage', () => failsWithBoom(counter, { describeMessage: boom })],
    [
      'describeCommand',
      'describeCommand',
      () =>
        failsWithBoom({
          ...counter,
          update: () => ({ count }) => ({ state: { count: count + 1 }, commands: ['Ping'] }),
        }, {
          describeCommand: boom,
        }),
    ],
    ['onApplied', 'onApplied', () => failsWithBoom(counter, { onApplied: () => Effect.sync(boom) })],
    [
      'onIgnored',
      'onIgnored',
      () => failsWithBoom({ ...counter, update: () => () => reject }, { onIgnored: () => Effect.sync(boom) }),
    ],
  ])('a defect in %s ends the run, which dies with it and with where it happened', async (_, where, outcome) => {
    expect(await outcome()).toEqual({ where, logged: [] })
  })

  test('a defect in update says which message it was given, by its tags, in its message too', async () => {
    const exit = await Effect.runPromiseExit(run(
      { ...counter, update: (message) => message === 'Increment' ? boom : () => reject },
      (frames) => Stream.runForEach(frames, ({ model, dispatch }) => dispatch(model.increment)),
    ))
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(defect instanceof ProgramDefect && [defect.on, defect.message]).toEqual([
      'Increment',
      'A defect in update on Increment',
    ])
  })

  test('defect in update dies in update, on its message, with the InvariantDefect as its cause', async () => {
    const exit = await Effect.runPromiseExit(run(
      { ...counter, update: () => () => defect('An increment cannot arrive') },
      (frames) => Stream.runForEach(frames, ({ model, dispatch }) => dispatch(model.increment)),
    ))
    const thrown = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(thrown instanceof ProgramDefect && [thrown.where, thrown.on, thrown.cause]).toEqual([
      'update',
      'Increment',
      new InvariantDefect({ reason: 'An increment cannot arrive' }),
    ])
  })

  test('a defect in a subscription carries its key', async () => {
    const exit = await Effect.runPromiseExit(run(
      { ...counter, subscriptions: () => HashMap.make(['k', Channel.die(new Boom())]) },
      () => Effect.never,
    ))
    const defect = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(defect instanceof ProgramDefect && defect.key).toBe('k')
  })

  test('every defect of the cause is kept, each with where it happened', async () => {
    const exit = await Effect.runPromiseExit(run(
      { ...counter, init: pinging, runCommand: () => Effect.die(new Boom()).pipe(Effect.ensuring(Effect.die('also'))) },
      () => Effect.never,
    ))
    const defects = Exit.isFailure(exit) ? exit.cause.reasons.filter(Cause.isDieReason).map(({ defect }) => defect) : []
    expect(defects.map((defect) => defect instanceof ProgramDefect && [defect.where, defect.cause])).toEqual([
      ['command', new Boom()],
      ['command', 'also'],
    ])
  })
})

describe('logs', () => {
  /** How many times the run describes a message or a command, for an accepted message and a rejected one. */
  const descriptionsAt = async (level: 'Info' | 'Debug') => {
    let described = 0
    const count = () => {
      described += 1
      return 'described'
    }
    await Effect.runPromise(run(
      counter,
      (frames) =>
        frames.pipe(
          Stream.tap(({ model, dispatch }) => dispatch(model.count === 0 ? model.increment : model.type(false))),
          Stream.take(2),
          Stream.runDrain,
        ),
      { describeMessage: count, describeCommand: count },
    ).pipe(
      Effect.provideService(References.MinimumLogLevel, level),
      // Written nowhere: the level alone decides whether they are described.
      Effect.provide(Logger.layer([])),
    ))
    return described
  }

  test('messages and commands are described only while debug logs are enabled', async () => {
    expect(await descriptionsAt('Info')).toBe(0)
    expect(await descriptionsAt('Debug')).toBeGreaterThan(0)
  })
})

describe('onApplied', () => {
  test('hears every accepted message in order, with the states around it, before its frame', async () => {
    const heard: Array<Applied<Count, Message, Command>> = []
    const drawn: Array<number> = []
    await Effect.runPromise(run(
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
    ))
    const fromView = { _tag: 'View' } as const
    expect(heard).toEqual([
      { message: 'Increment', origin: fromView, before: { count: 0 }, after: { count: 1 }, revision: 1, commands: [] },
      { message: 'Increment', origin: fromView, before: { count: 1 }, after: { count: 2 }, revision: 2, commands: [] },
    ])
    expect(drawn).toEqual([0, 1, 2])
  })

  test('says where each message came from: the view, a command, or a subscription with its key', async () => {
    const origins: Array<unknown> = []
    const pinging: Counter = {
      ...counter,
      init: { state: { count: 0 }, commands: ['Ping'] },
      subscriptions: () =>
        HashMap.make(['k', Channel.succeed<Message>('Increment').pipe(Channel.concatWith(() => Channel.never))]),
    }
    await Effect.runPromise(run(
      pinging,
      (frames) =>
        frames.pipe(
          Stream.tap(({ model, dispatch }) => model.count === 2 ? dispatch(model.increment) : Effect.void),
          Stream.takeUntil(({ model }) => model.count === 3),
          Stream.runDrain,
        ),
      { onApplied: ({ origin }) => Effect.sync(() => origins.push(origin)) },
    ))
    expect(origins).toHaveLength(3)
    expect(origins).toContainEqual({ _tag: 'View' })
    expect(origins).toContainEqual({ _tag: 'Command' })
    expect(origins).toContainEqual({ _tag: 'Subscription', key: 'k' })
  })

  test('a message that leaves the very same state is heard too, with an unchanged revision', async () => {
    const heard = await Effect.runPromise(Effect.gen(function*() {
      const applied = yield* Deferred.make<Applied<Count, Message, Command>>()
      const still: Counter = {
        ...counter,
        init: { state: { count: 0 }, commands: ['Ping'] },
        update: () => (state) => ({ state }),
      }
      yield* run(still, () => Effect.asVoid(Deferred.await(applied)), {
        onApplied: (message) => Effect.asVoid(Deferred.succeed(applied, message)),
      })
      return yield* Deferred.await(applied)
    }))
    expect(heard).toEqual({
      message: 'Increment',
      origin: { _tag: 'Command' },
      before: { count: 0 },
      after: { count: 0 },
      revision: 0,
      commands: [],
    })
  })

  test('hears the commands each message started, as update returned them', async () => {
    const heard = await Effect.runPromise(Effect.gen(function*() {
      const applied: Array<Applied<Count, Message, Command>> = []
      const two = yield* Deferred.make<ReadonlyArray<Applied<Count, Message, Command>>>()
      // The first increment pings again, so a second one follows.
      const pinging: Counter = {
        ...counter,
        init: { state: { count: 0 }, commands: ['Ping'] },
        update: () => ({ count }) => ({ state: { count: count + 1 }, commands: count === 0 ? ['Ping'] : [] }),
      }
      yield* run(pinging, () => Effect.asVoid(Deferred.await(two)), {
        onApplied: (step) =>
          Effect.suspend(() => {
            applied.push(step)
            return applied.length === 2 ? Effect.asVoid(Deferred.succeed(two, applied)) : Effect.void
          }),
      })
      return yield* Deferred.await(two)
    }))
    expect(heard.map((step) => step.commands)).toEqual([['Ping'], []])
  })
})

describe('onIgnored', () => {
  test('hears every message update rejects, with where it came from and the state it did not apply in', async () => {
    const ignored: Array<Ignored<Count, Message>> = []
    const applied: Array<Message> = []
    await Effect.runPromise(run(
      {
        ...counter,
        init: { state: { count: 0 }, commands: ['Ping'] },
        runCommand: () => Effect.succeedSome<Message>('Forbidden'),
      },
      (frames) =>
        frames.pipe(
          Stream.tap(({ model, dispatch }) => model.count === 0 ? dispatch(model.type(false)) : Effect.void),
          Stream.runDrain,
          // Long enough for both rejections to be heard.
          Effect.timeoutOption('100 millis'),
        ),
      {
        onApplied: ({ message }) => Effect.sync(() => applied.push(message)),
        onIgnored: (each) => Effect.sync(() => ignored.push(each)),
      },
    ))
    expect(applied).toEqual([])
    expect(ignored).toHaveLength(2)
    expect(ignored).toContainEqual({ message: 'Forbidden', origin: { _tag: 'View' }, state: { count: 0 } })
    expect(ignored).toContainEqual({ message: 'Forbidden', origin: { _tag: 'Command' }, state: { count: 0 } })
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
    await Effect.runPromise(run(
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
    ))
    expect(models).toEqual([2, 2])
    expect(made).toBe(2)
  })

  test('a renderer slower than the program gets only the latest frame', async () => {
    const counts: Array<number> = []
    await Effect.runPromise(runCounter(counter, (frames) =>
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
      )))
    expect(counts).toEqual([0, 3])
  })
})

describe('subscriptions', () => {
  test('what a subscription leaves in the queue after its key went away does not reach update', async () => {
    // A stopwatch: `Tick` counts in any state, so that only the engine can keep a late one out; `Stop` drops
    // the key of the ticks.
    type Watch = Readonly<{ isRunning: boolean; ticks: number }>
    type WatchMessage = 'Tick' | 'Stop'
    const ticks = await Effect.runPromise(Effect.gen(function*() {
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
    }))
    expect(ticks).toBe(0)
  })
})
