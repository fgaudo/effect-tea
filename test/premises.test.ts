/**
 * The premises of `docs/premises.md`, one test each, named after its entry: what `effect` (the lockfile's) or the
 * JavaScript engine does, checked on the smallest program that shows it, with nothing of the library. The premise of
 * the scheduler of the tests has a file of its own, `effect-scheduler.test.ts`, for the harness it needs, and those of
 * the bridges on their renderers lie in the bridges' tests, where the DOM is.
 */
import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Context from 'effect/Context'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Equal from 'effect/Equal'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as FiberMap from 'effect/FiberMap'
import * as FiberSet from 'effect/FiberSet'
import * as Hash from 'effect/Hash'
import * as HashMap from 'effect/HashMap'
import * as Logger from 'effect/Logger'
import * as Opt from 'effect/Option'
import * as Queue from 'effect/Queue'
import * as Scheduler from 'effect/Scheduler'
import * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import * as TestClock from 'effect/testing/TestClock'
import * as Tracer from 'effect/Tracer'
import { collectGarbage } from './gc.test_helper.ts'

const reasonsOf = <A, E>(exit: Exit.Exit<A, E>): ReadonlyArray<Cause.Reason<E>> =>
  Exit.isFailure(exit) ? exit.cause.reasons : []

/** The reasons of an exit, as tags with their defect or the fiber that interrupted. */
const described = <A, E>(exit: Exit.Exit<A, E>) =>
  reasonsOf(exit).map((reason) =>
    reason._tag === 'Die'
      ? ['Die', reason.defect]
      : reason._tag === 'Interrupt'
      ? ['Interrupt', reason.fiberId]
      : ['Fail', reason.error]
  )

/**
 * Forks the fiber `body` makes of the effect that says it runs, and waits until it does: `body` puts that effect where
 * the fiber has entered what the test is about.
 */
const started = <A, E>(body: (running: Effect.Effect<void>) => Effect.Effect<A, E>) =>
  Effect.gen(function*() {
    const running = yield* Deferred.make<void>()
    const fiber = yield* Effect.forkChild(body(Deferred.succeed(running, undefined).pipe(Effect.asVoid)))
    yield* Deferred.await(running)
    return fiber
  })

/** Keys that all collide, so that a map compares them, and that note each call made outside `within`. */
const watched = () => {
  let inside = false
  let calls = 0
  const late: Array<string> = []
  const note = (call: string) => {
    calls++
    if (!inside) late.push(call)
  }
  class Key implements Equal.Equal {
    readonly id: number
    constructor(id: number) {
      this.id = id
    }
    [Equal.symbol](that: Equal.Equal): boolean {
      note('Equal')
      return that instanceof Key && that.id === this.id
    }
    [Hash.symbol](): number {
      note('Hash')
      return 0
    }
  }
  const within = <A>(call: () => A): A => {
    inside = true
    try {
      return call()
    } finally {
      inside = false
    }
  }
  return { Key, within, late, calls: () => calls }
}

test('HashMap calls a key\'s Equal and Hash only within the call it is given the key in', async () => {
  const { Key, within, late, calls } = watched()
  let map = within(() => HashMap.make([new Key(1), 'one'], [new Key(2), 'two'], [new Key(3), 'three']))
  map = within(() => HashMap.set(map, new Key(4), 'four'))
  map = within(() => HashMap.remove(map, new Key(2)))
  within(() => HashMap.get(map, new Key(3)))
  within(() => HashMap.has(map, new Key(5)))
  map = within(() => HashMap.union(map, HashMap.make([new Key(6), 'six'])))
  map = within(() => HashMap.set(map, new Key(1), 'once more'))
  await new Promise((resolve) => setTimeout(resolve, 0))
  collectGarbage()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(calls()).toBeGreaterThan(0)
  expect(late).toEqual([])
  expect(HashMap.size(map)).toBe(4)
})

describe('a fiber forked with FiberSet.run or FiberMap.run is no child of the fiber that forks it, which ends without waiting for it', () => {
  const ranOn = (fork: (self: Effect.Effect<string>) => Effect.Effect<Fiber.Fiber<string>, never, Scope.Scope>) =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      const forking = yield* Effect.forkChild(fork(Effect.as(Deferred.await(gate), 'ran on')))
      const forked = yield* Fiber.join(forking)
      yield* Deferred.succeed(gate, undefined)
      return yield* Fiber.await(forked)
    })))

  test('FiberSet.run', async () => {
    expect(await ranOn((self) => Effect.flatMap(FiberSet.make<string>(), (set) => FiberSet.run(set, self))))
      .toEqual(Exit.succeed('ran on'))
  })

  test('FiberMap.run', async () => {
    expect(await ranOn((self) => Effect.flatMap(FiberMap.make<string, string>(), (map) => FiberMap.run(map, 'k', self))))
      .toEqual(Exit.succeed('ran on'))
  })
})

test('a fiber forked with startImmediately runs on the stack of the fiber that forks it until it first waits', async () => {
  const steps = await Effect.runPromise(Effect.gen(function*() {
    const steps: Array<string> = []
    const gate = yield* Deferred.make<void>()
    const fiber = yield* Effect.forkChild(
      Effect.sync(() => steps.push('before the wait')).pipe(
        Effect.andThen(Deferred.await(gate)),
        Effect.andThen(Effect.sync(() => steps.push('after the wait'))),
      ),
      { startImmediately: true },
    )
    steps.push('forked')
    yield* Deferred.succeed(gate, undefined)
    yield* Fiber.join(fiber)
    return steps
  }))
  expect(steps).toEqual(['before the wait', 'forked', 'after the wait'])
})

describe('what the cleanup of Effect.onExit fails with comes after the cause of the effect', () => {
  test('of an effect that dies', async () => {
    const exit = await Effect.runPromiseExit(Effect.die('effect').pipe(Effect.onExit(() => Effect.die('cleanup'))))
    expect(described(exit)).toEqual([['Die', 'effect'], ['Die', 'cleanup']])
  })

  test('of an effect that is interrupted', async () => {
    const [id, exit] = await Effect.runPromise(Effect.gen(function*() {
      const fiber = yield* started((running) =>
        Effect.andThen(running, Effect.never).pipe(Effect.onExit(() => Effect.die('cleanup')))
      )
      yield* Fiber.interrupt(fiber)
      return [yield* Effect.fiberId, yield* Fiber.await(fiber)] as const
    }))
    expect(described(exit)).toEqual([['Interrupt', id], ['Die', 'cleanup']])
  })
})

describe('a fiber interrupted while interruptible runs no failure handler', () => {
  test('on its interruption', async () => {
    const handled: Array<string> = []
    const exit = await Effect.runPromise(Effect.gen(function*() {
      const fiber = yield* started((running) =>
        Effect.andThen(running, Effect.never).pipe(Effect.catchCause(() => Effect.sync(() => handled.push('handled'))))
      )
      yield* Fiber.interrupt(fiber)
      return yield* Fiber.await(fiber)
    }))
    expect(handled).toEqual([])
    expect(Exit.hasInterrupts(exit)).toBe(true)
  })

  test('beside a defect of its release', async () => {
    const handled: Array<string> = []
    const exit = await Effect.runPromise(Effect.gen(function*() {
      const fiber = yield* started((running) =>
        Effect.andThen(running, Effect.never).pipe(
          Effect.ensuring(Effect.die('release')),
          Effect.catchCause(() => Effect.sync(() => handled.push('handled'))),
        )
      )
      yield* Fiber.interrupt(fiber)
      return yield* Fiber.await(fiber)
    }))
    expect(handled).toEqual([])
    expect(described(exit).map(([tag]) => tag)).toEqual(['Interrupt', 'Die'])
  })
})

// `interruptUnsafe` gives the interruption with no wait, so that it is received before the gate opens:
// `Fiber.interrupt` is it followed by an await.
describe('a fiber that fails as it is interrupted keeps its own reasons and gets those it received added', () => {
  test('to an interruption of its own', async () => {
    const [own, by, exit] = await Effect.runPromise(Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      const fiber = yield* started((running) =>
        Effect.uninterruptible(running.pipe(Effect.andThen(Deferred.await(gate)), Effect.andThen(Effect.interrupt)))
      )
      const by = yield* Effect.fiberId
      fiber.interruptUnsafe(by)
      yield* Deferred.succeed(gate, undefined)
      return [fiber.id, by, yield* Fiber.await(fiber)] as const
    }))
    expect(described(exit)).toEqual([['Interrupt', own], ['Interrupt', by]])
  })

  test('and Effect.interruptible, entered where it is uninterruptible, fails with exactly those it received', async () => {
    const [by, entered] = await Effect.runPromise(Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      const entered = yield* Deferred.make<Exit.Exit<void>>()
      const fiber = yield* started((running) =>
        Effect.uninterruptible(running.pipe(
          Effect.andThen(Deferred.await(gate)),
          Effect.andThen(Effect.exit(Effect.interruptible(Effect.void))),
          Effect.flatMap((exit) => Deferred.succeed(entered, exit)),
        ))
      )
      const by = yield* Effect.fiberId
      fiber.interruptUnsafe(by)
      yield* Deferred.succeed(gate, undefined)
      return [by, yield* Deferred.await(entered)] as const
    }))
    expect(described(entered)).toEqual([['Interrupt', by]])
  })
})

class Mark extends Context.Service<Mark, object>()('test/premises/Mark') {}

const markOf = <A, E>(exit: Exit.Exit<A, E>) =>
  reasonsOf(exit).filter(Cause.isInterruptReason).map((reason) =>
    Context.getOrUndefined(Cause.reasonAnnotations(reason), Mark)
  )

describe('an interruption made with Fiber.interruptAs carries the annotations it is given on its reason', () => {
  test('on a fiber interrupted where it waits', async () => {
    const exit = await Effect.runPromise(Effect.gen(function*() {
      const fiber = yield* started((running) => Effect.andThen(running, Effect.never))
      yield* Fiber.interruptAs(fiber, yield* Effect.fiberId, Context.make(Mark, {}))
      return yield* Fiber.await(fiber)
    }))
    expect(markOf(exit)).toEqual([{}])
  })

  test('and the runtime keeps them as it annotates the reason further, in a traced function', async () => {
    const traced = Effect.fn('traced')(function*() {
      yield* Effect.interruptible(Effect.void)
    })
    const exit = await Effect.runPromise(Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      const fiber = yield* started((running) =>
        Effect.uninterruptible(running.pipe(Effect.andThen(Deferred.await(gate)), Effect.andThen(traced())))
      )
      fiber.interruptUnsafe(yield* Effect.fiberId, Context.make(Mark, {}))
      yield* Deferred.succeed(gate, undefined)
      return yield* Fiber.await(fiber)
    }))
    // The fiber gets what it received added to what the interruptible region failed with: a copy, annotated further.
    expect(markOf(exit).length).toBeGreaterThan(0)
    expect(markOf(exit)).not.toContain(undefined)
  })
})

describe('an unbounded Queue takes an offer at once, and a shut one refuses it without interrupting', () => {
  test('an offer to an unbounded queue completes synchronously', () => {
    const queue = Effect.runSync(Queue.unbounded<number>())
    for (let message = 0; message < 1_000; message++) expect(Effect.runSync(Queue.offer(queue, message))).toBe(true)
    expect(Effect.runSync(Queue.size(queue))).toBe(1_000)
  })

  test('an offer to a shut queue returns false, synchronously', () => {
    const queue = Effect.runSync(Queue.unbounded<number>())
    Effect.runSync(Queue.shutdown(queue))
    expect(Effect.runSyncExit(Queue.offer(queue, 1))).toEqual(Exit.succeed(false))
  })

  test('it wakes its taker through the scheduler of the fiber that made it, never in the stack of the offer', async () => {
    const base = new Scheduler.MixedScheduler()
    let offering = false
    let woken = 0
    const scheduler: Scheduler.Scheduler = {
      executionMode: base.executionMode,
      shouldYield: (fiber) => base.shouldYield(fiber),
      makeDispatcher: () => {
        const dispatcher = base.makeDispatcher()
        return {
          scheduleTask: (task, priority) => {
            if (offering) woken++
            dispatcher.scheduleTask(task, priority)
          },
          flush: () => dispatcher.flush(),
        }
      },
    }
    const taken: Array<number> = []
    const [takenAsOffered] = await Effect.runPromise(Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number>()
      // Forked as a task of the dispatcher, it offers once this fiber waits in `take`; `Effect.runSync` offers on a
      // scheduler of its own.
      const offer = yield* Effect.forkChild(Effect.sync(() => {
        offering = true
        Effect.runSync(Queue.offer(queue, 1))
        offering = false
        return taken.length
      }))
      taken.push(yield* Queue.take(queue))
      return [yield* Fiber.join(offer)] as const
    }).pipe(Effect.provideService(Scheduler.Scheduler, scheduler)))
    expect(woken).toBe(1)
    expect(takenAsOffered).toBe(0)
    expect(taken).toEqual([1])
  })
})

test('a Stream.map after Stream.buffer runs only for the elements the consumer pulls, in the consumer\'s fiber', async () => {
  const mapped: Array<Readonly<{ element: number; fiber: number | undefined }>> = []
  const [consumer, pulled] = await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const fed = yield* Deferred.make<void>()
    const pull = yield* Stream.make(1, 2, 3, 4).pipe(
      Stream.rechunk(1),
      Stream.concat(Stream.fromEffectDrain(Deferred.succeed(fed, undefined))),
      Stream.concat(Stream.never),
      Stream.buffer({ capacity: 1, strategy: 'sliding' }),
      Stream.map((element) => {
        mapped.push({ element, fiber: Fiber.getCurrent()?.id })
        return element
      }),
      Stream.toPull,
    )
    yield* Deferred.await(fed)
    return [yield* Effect.fiberId, yield* pull] as const
  })))
  expect(mapped.map(({ element }) => element)).toEqual([...pulled])
  expect(mapped.map(({ fiber }) => fiber)).toEqual(pulled.map(() => consumer))
  expect(pulled.length).toBeLessThan(4)
})

test('Effect calls each Logger synchronously, in the fiber that logs', async () => {
  const thrown = new Error('the logger')
  const loggedBy: Array<number> = []
  const throwing = Logger.make(({ fiber }) => {
    loggedBy.push(fiber.id)
    throw thrown
  })
  const [logging, exit] = await Effect.runPromise(Effect.gen(function*() {
    return [yield* Effect.fiberId, yield* Effect.exit(Effect.logInfo('a log'))] as const
  }).pipe(Effect.provide(Logger.layer([throwing]))))
  expect(loggedBy).toEqual([logging])
  expect(described(exit)).toEqual([['Die', thrown]])
})

test('an external span keeps no event of the logs written under it', async () => {
  const span = Tracer.externalSpan({ spanId: 'span', traceId: 'trace' })
  const before = { ...span }
  const current = await Effect.runPromise(Effect.gen(function*() {
    yield* Effect.logInfo('a log')
    return yield* Effect.orDie(Effect.currentParentSpan)
  }).pipe(
    Effect.provideService(Tracer.ParentSpan, span),
    Effect.provide(Logger.layer([Logger.tracerLogger])),
  ))
  expect(current).toBe(span)
  expect('events' in current ? current.events : []).toEqual([])
  expect({ ...current }).toEqual(before)
})

const dies = Channel.fromEffectDone(Effect.die('boom'))

describe('Channel.toPull keeps what a channel adds to the scope it is given, and releases none of it as the pull fails', () => {
  test('a finalizer the channel adds to its scope runs only as that scope closes', async () => {
    const log: Array<string> = []
    await Effect.runPromise(Effect.gen(function*() {
      const scope = yield* Scope.make()
      const channel = Channel.unwrap(
        Effect.as(Effect.addFinalizer(() => Effect.sync(() => log.push('released'))), dies),
      )
      const pull = yield* Channel.toPull(channel).pipe(Scope.provide(scope))
      const exit = yield* Effect.exit(pull)
      log.push(`pull ${Exit.isFailure(exit) && Cause.hasDies(exit.cause) ? 'died' : 'did not die'}`)
      yield* Scope.close(scope, Exit.void)
    }))
    expect(log).toEqual(['pull died', 'released'])
  })
})

describe('while a release the channel wraps around itself runs as its pull fails, before the failure leaves it', () => {
  const wrapped = (release: Effect.Effect<void>) => ({
    'Channel.onExit': Channel.onExit(dies, () => release),
    'Channel.acquireUseRelease': Channel.acquireUseRelease(Effect.void, () => dies, () => release),
    'Channel.ensuring': Channel.ensuring(dies, release),
  })

  test.each(['Channel.onExit', 'Channel.acquireUseRelease', 'Channel.ensuring'] as const)('%s', async (operator) => {
    const log: Array<string> = []
    await Effect.runPromise(Effect.gen(function*() {
      const scope = yield* Scope.make()
      const channel = wrapped(Effect.sync(() => void log.push('released')))[operator]
      const pull = yield* Channel.toPull(channel).pipe(Scope.provide(scope))
      const exit = yield* Effect.exit(pull)
      log.push(`pull ${Exit.isFailure(exit) && Cause.hasDies(exit.cause) ? 'died' : 'did not die'}`)
      yield* Scope.close(scope, Exit.void)
    }))
    expect(log).toEqual(['released', 'pull died'])
  })
})

test('Effect.raceFirst waits for the effect it interrupts to end, its release included', async () => {
  const log: Array<string> = []
  await Effect.runPromise(Effect.gen(function*() {
    const running = yield* Deferred.make<void>()
    const losing = Effect.andThen(Deferred.succeed(running, undefined), Effect.never).pipe(
      Effect.onInterrupt(() => Effect.andThen(Effect.yieldNow, Effect.sync(() => log.push('released')))),
    )
    yield* Effect.raceFirst(losing, Deferred.await(running))
    log.push('race ended')
  }))
  expect(log).toEqual(['released', 'race ended'])
})

test('a thunk of Effect.suspend that throws makes the effect die with what it threw', async () => {
  const thrown = new Error('the thunk')
  const exit = await Effect.runPromiseExit(Effect.suspend(() => {
    throw thrown
  }))
  expect(described(exit)).toEqual([['Die', thrown]])
})

test('interrupting Fiber.await leaves the awaited fiber running', async () => {
  const [running, exit] = await Effect.runPromise(Effect.gen(function*() {
    const gate = yield* Deferred.make<void>()
    const awaited = yield* started((running) => Effect.andThen(running, Effect.as(Deferred.await(gate), 'ran on')))
    const awaiting = yield* Effect.forkChild(Fiber.await(awaited), { startImmediately: true })
    yield* Fiber.interrupt(awaiting)
    const running = awaited.pollUnsafe() === undefined
    yield* Deferred.succeed(gate, undefined)
    return [running, yield* Fiber.await(awaited)] as const
  }))
  expect(running).toBe(true)
  expect(exit).toEqual(Exit.succeed('ran on'))
})

test('Effect.timeoutOption measures with the Clock of its context', async () => {
  const ended = await Effect.runPromise(Effect.gen(function*() {
    const waiting = yield* Effect.forkChild(Effect.timeoutOption(Effect.never, '1 hour'))
    yield* TestClock.adjust('1 hour')
    return yield* Fiber.join(waiting)
  }).pipe(Effect.provide(TestClock.layer())))
  expect(ended).toEqual(Opt.none())
})
