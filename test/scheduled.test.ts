/**
 * The scheduler the engine's tests run under (`scheduled.ts`): its rules are those of `effect-scheduler.test.ts`,
 * which tests them one by one against Effect; here, what the explorations add.
 */
import { expect, test } from 'bun:test'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import { TestClock } from 'effect/testing'
import {
  deviated,
  everySchedule,
  inOrder,
  prioritized,
  prioritizedSchedules,
  replayed,
  type Run,
  scheduled,
  seeds,
  type Strategy,
} from './scheduled.ts'

const value = <A, E>(run: Run<A, E>) => run.exit !== undefined && Exit.isSuccess(run.exit) ? run.exit.value : undefined

/** Two fibers that each write their letter four times, a step apart. */
const twoWriters = Effect.gen(function*() {
  const log: Array<string> = []
  const write = (letter: string) => Effect.replicateEffect(Effect.sync(() => log.push(letter)), 4, { discard: true })
  const a = yield* Effect.forkChild(write('a'))
  const b = yield* Effect.forkChild(write('b'))
  yield* Fiber.join(a)
  yield* Fiber.join(b)
  return log.join('')
})

/** Two fibers that each read a count in one step and write it one more in the next: an update one of them can lose. */
const twoIncrements = Effect.gen(function*() {
  let count = 0
  const increment = Effect.flatMap(Effect.sync(() => count), (read) =>
    Effect.sync(() => {
      count = read + 1
    }))
  const a = yield* Effect.forkChild(increment)
  const b = yield* Effect.forkChild(increment)
  yield* Fiber.join(a)
  yield* Fiber.join(b)
  return count
})

const counted = (expected: number) => (exit: Exit.Exit<number>) => {
  expect(Exit.isSuccess(exit) ? exit.value : undefined).toBe(expected)
}

test('a run in order runs each fiber to its wait before the next, the oldest first', () => {
  expect(value(scheduled(twoWriters, inOrder))).toBe('aaaabbbb')
  expect(value(scheduled(twoIncrements, inOrder))).toBe(2)
})

test('a run given the schedule another recorded takes the same decisions, and ends the same', () => {
  for (let seed = 0; seed < 50; seed++) {
    const run = scheduled(twoWriters, prioritized(seed, 3, 20))
    const again = replayed(twoWriters, run.schedule)
    expect(again.schedule).toEqual(run.schedule)
    expect(again.steps).toBe(run.steps)
    expect(value(again)).toBe(value(run))
  }
  // A schedule the run does not follow to its end is refused, and so is a pick of no task.
  const { schedule } = scheduled(twoWriters, inOrder)
  expect(() => replayed(twoWriters, { ...schedule, picks: [...schedule.picks, 0] })).toThrow(/asked/)
  expect(() => scheduled(twoWriters, { ...inOrder, pick: (ready) => ready.length })).toThrow(/picked task/)
})

test('a strategy is asked only where its answer can change the run', () => {
  // A pick with more than one task ready, a preemption with another ready; a run of one fiber asks nothing.
  const asked: Array<string> = []
  const run = scheduled(twoWriters, {
    pick: (ready) => {
      asked.push(`pick of ${ready.length}`)
      return 0
    },
    preempt: (_fiber, ready) => {
      asked.push(`preempt with ${ready.length}`)
      return false
    },
  })
  expect(value(run)).toBe('aaaabbbb')
  expect(asked.length).toBeGreaterThan(0)
  expect(asked.filter((question) => question === 'pick of 1' || question === 'preempt with 0')).toEqual([])
  expect(scheduled(Effect.succeed(1), inOrder).schedule).toEqual({ picks: [], preemptions: [] })
})

test('a strategy is told the fiber a preemption made yield, among the tasks ready', () => {
  let preempted: number | undefined
  const seen: Array<ReadonlyArray<number | undefined>> = []
  scheduled(twoWriters, {
    pick: (ready) => {
      seen.push(ready.map(({ fiber }) => fiber))
      return 0
    },
    preempt: (fiber) => {
      if (preempted !== undefined) return false
      preempted = fiber
      return true
    },
  })
  expect(preempted).toBeDefined()
  expect(seen.flat()).toContain(preempted)
})

test('a strategy is told the fibers counted from the root, and a fork names none', () => {
  // The root, fiber 0, is preempted at its first two steps with another task ready: as it forks `a`, and as it
  // forks `b`. Each time its own task is named, and the fork beside it names no fiber.
  let preempted = 0
  const seen: Array<ReadonlyArray<number | undefined>> = []
  const run = scheduled(twoWriters, {
    pick: (ready) => {
      seen.push(ready.map(({ fiber }) => fiber))
      return 0
    },
    preempt: (fiber) => fiber === 0 && preempted++ < 2,
  })
  expect(value(run)).toBe('aaaabbbb')
  expect(preempted).toBeGreaterThanOrEqual(2)
  expect(seen.filter((ready) => ready.length === 2 && ready[0] === undefined && ready[1] === 0).length).toBe(2)
})

test('a strategy is told the fiber a resumption made yield', () => {
  // Two waiters a Deferred resumes inline, `a` then `b`, fibers 1 and 2: each yields before it goes on, its task
  // named.
  const body = Effect.gen(function*() {
    const deferred = yield* Deferred.make<void>()
    const a = yield* Effect.forkChild(Deferred.await(deferred))
    const b = yield* Effect.forkChild(Deferred.await(deferred))
    yield* Effect.yieldNow
    yield* Deferred.succeed(deferred, undefined)
    yield* Fiber.join(a)
    yield* Fiber.join(b)
  })
  const seen: Array<ReadonlyArray<number | undefined>> = []
  scheduled(body, {
    pick: (ready) => {
      seen.push(ready.map(({ fiber }) => fiber))
      return 0
    },
    preempt: () => false,
  })
  expect(seen).toContainEqual([1, 2])
})

test('a run counts the tasks it leaves ready, which a fiber the root did not wait for leaves', () => {
  expect(scheduled(twoWriters, inOrder).left).toBe(0)
  const detached = Effect.andThen(Effect.forkDetach(Effect.forever(Effect.yieldNow)), Effect.yieldNow)
  const run = scheduled(detached, inOrder)
  expect(run.exit !== undefined && Exit.isSuccess(run.exit)).toBe(true)
  expect(run.left).toBe(1)
})

test('a dispatcher of the scheduler refuses a flush inside a run, even one the effect catches', () => {
  const flushes = Effect.withFiber((fiber) => Effect.sync(() => fiber.currentDispatcher.flush()))
  expect(() => scheduled(Effect.catchDefect(flushes, () => Effect.void), inOrder)).toThrow(/never flushed/)
})

test('a strategy that throws stops its run, which throws it, even where the effect catches it', () => {
  // Effect asks the scheduler within the fiber's loop, and takes what it throws for a defect of that fiber.
  let thrown = false
  const throwsOnce: Strategy = {
    pick: () => 0,
    preempt: () => {
      if (thrown) return false
      thrown = true
      throw new Error('a strategy failed')
    },
  }
  expect(() => scheduled(Effect.catchDefect(twoWriters, () => Effect.succeed('caught')), throwsOnce))
    .toThrow(/a strategy failed/)
  expect(thrown).toBe(true)
})

test('a fiber that never waits stops its run, rather than running it forever', () => {
  // It runs within one task, which a count of tasks never stops. Effect's own scheduler would preempt it.
  const spins = Effect.forever(Effect.void, { disableYield: true })
  const run = scheduled(spins, inOrder)
  expect({ exit: run.exit, spun: run.spun }).toEqual({ exit: undefined, spun: true })
  expect(scheduled(twoWriters, inOrder).spun).toBe(false)
  const forked = Effect.flatMap(Effect.forkChild(spins), Fiber.join)
  expect(() => everySchedule(forked, { bound: 0 }, () => {})).toThrow(/never waited/)
})

test('every schedule within two deviations is every one, each run once', () => {
  // An independent count: each decision of the run in order can deviate, each of the run that deviated once after
  // its deviation, and the run in order is one.
  const decisions = (deviation?: readonly [number, number]) => {
    const asked: Array<number> = []
    scheduled(twoIncrements, {
      pick: (ready) => {
        asked.push(ready.length)
        return deviation !== undefined && deviation[0] === asked.length - 1 ? deviation[1] : 0
      },
      preempt: () => {
        asked.push(2)
        return deviation !== undefined && deviation[0] === asked.length - 1
      },
    })
    return asked
  }
  const ways = (asked: ReadonlyArray<number>, after: number) =>
    asked.slice(after + 1).reduce((sum, options) => sum + options - 1, 0)
  let count = 1
  decisions().forEach((options, decision) => {
    for (let choice = 1; choice < options; choice++) count += 1 + ways(decisions([decision, choice]), decision)
  })
  expect(count).toBeGreaterThan(10)
  expect(everySchedule(twoIncrements, { bound: 2 }, () => {})).toBe(count)
  expect(everySchedule(twoIncrements, { bound: 1 }, () => {})).toBe(1 + ways(decisions(), -1))
})

test('a run that does not end fails its exploration', () => {
  expect(() => everySchedule(Effect.never, { bound: 0 }, () => {})).toThrow(/did not end/)
})

test('under prioritized schedules a fiber yields to a higher one ready, and at a change of priority', () => {
  for (let seed = 0; seed < 50; seed++) {
    // With no change, of two fibers exactly one yields to the other.
    const strategy = prioritized(seed, 1, 100)
    expect(strategy.preempt(0, [{ fiber: 1 }])).not.toBe(strategy.preempt(1, [{ fiber: 0 }]))
    // Its first priority above any task that names no fiber, a fiber yields to one only at its change.
    expect(prioritized(seed, 2, 1).preempt(0, [{ fiber: undefined }])).toBe(true)
    expect(prioritized(seed, 1, 1).preempt(0, [{ fiber: undefined }])).toBe(false)
  }
})

test('every schedule within no deviation is the run in order alone', () => {
  expect(everySchedule(twoIncrements, { bound: 0 }, counted(2))).toBe(1)
})

test('every schedule within one deviation reaches the lost update, and names what replays it', () => {
  let named = ''
  try {
    everySchedule(twoIncrements, { bound: 1 }, counted(2))
  } catch (error) {
    named = error instanceof Error ? error.message : ''
  }
  const found = /^under deviated\((\[\[\d+,1\]\]), 'queued'\)/.exec(named)
  expect(found).not.toBeNull()
  // What it names replays the lost update alone.
  expect(value(deviated(twoIncrements, JSON.parse(found?.[1] ?? '[]')))).toBe(1)
  // And it is exhaustive there: each end is reached, and the two orders of the writers.
  const ends = new Set<number>()
  everySchedule(twoIncrements, { bound: 1 }, (exit) => {
    if (Exit.isSuccess(exit)) ends.add(exit.value)
  })
  expect([...ends].sort()).toEqual([1, 2])
  const orders = new Set<string>()
  everySchedule(twoWriters, { bound: 1 }, (exit) => {
    if (Exit.isSuccess(exit)) orders.add(exit.value)
  })
  expect(orders).toContain('bbbbaaaa')
  expect([...orders].some((order) => /a+b+a/.test(order))).toBe(true)
})

test('every schedule within a bound stops past its runs, rather than running for hours', () => {
  expect(() => everySchedule(twoWriters, { bound: 3, runs: 10 }, () => {})).toThrow(/more than 10 schedules/)
})

test('prioritized schedules reach the lost update at depth 2, and name the seed that replays it', () => {
  expect(() => prioritizedSchedules(twoIncrements, { runs: 50, depth: 2 }, counted(2)))
    .toThrow(/^under prioritized\(\d+, 2, \d+\)/)
  // At depth 1 no priority changes: a fiber is preempted only by a higher one woken, and none is here.
  prioritizedSchedules(twoIncrements, { runs: 50, depth: 1 }, counted(2))
})

test('the seeds of prioritized schedules are those pinned, each once, then the range from the first', () => {
  expect(seeds({ count: 3 })).toEqual([0, 1, 2])
  expect(seeds({ first: 1_000, count: 3, pinned: [7, 1_001, 7] })).toEqual([7, 1_001, 1_000, 1_002])
})

test('prioritized schedules run the seeds pinned, then those from the first seed given, and name each that fails', () => {
  // A seed of the first 50 that reaches the lost update fails again alone, as the first or as a seed pinned.
  let failed = -1
  try {
    prioritizedSchedules(twoIncrements, { runs: 50, depth: 2 }, counted(2))
  } catch (error) {
    failed = Number(/^under prioritized\((\d+),/.exec((error as Error).message)?.[1])
  }
  expect(failed).toBeGreaterThanOrEqual(0)
  const alone = new RegExp(`^under prioritized\\(${failed}, 2,`)
  expect(() => prioritizedSchedules(twoIncrements, { runs: 1, depth: 2, first: failed }, counted(2))).toThrow(alone)
  expect(() => prioritizedSchedules(twoIncrements, { runs: 0, depth: 2, pinned: [failed] }, counted(2))).toThrow(alone)
})

test('prioritized schedules change the priority at as many steps as their depth asks', () => {
  // Over 2 steps, a depth of 3 changes the priority at both, whatever the seed. A fiber with only its own task
  // ready yields at a change alone.
  for (let seed = 0; seed < 50; seed++) {
    const strategy = prioritized(seed, 3, 2)
    expect([strategy.preempt(0, [{ fiber: 0 }]), strategy.preempt(0, [{ fiber: 0 }])]).toEqual([true, true])
  }
})

test('fibers a Deferred resumes inline wait for their pick, in either order', () => {
  const body = Effect.gen(function*() {
    const log: Array<string> = []
    const deferred = yield* Deferred.make<void>()
    const waiter = (letter: string) => Effect.andThen(Deferred.await(deferred), Effect.sync(() => log.push(letter)))
    const a = yield* Effect.forkChild(waiter('a'))
    const b = yield* Effect.forkChild(waiter('b'))
    yield* Effect.yieldNow
    yield* Deferred.succeed(deferred, undefined)
    yield* Fiber.join(a)
    yield* Fiber.join(b)
    return log.join('')
  })
  const orders = new Set<string>()
  everySchedule(body, { bound: 1 }, (exit) => {
    if (Exit.isSuccess(exit)) orders.add(exit.value)
  })
  expect([...orders].sort()).toEqual(['ab', 'ba'])
})

test('a fiber interrupted before it starts does not run, under every schedule', () => {
  // A fiber of one step either ran to its end before the interruption, or is interrupted without running.
  const body = Effect.gen(function*() {
    let ran = false
    const fiber = yield* Effect.forkChild(Effect.sync(() => {
      ran = true
    }))
    yield* Fiber.interrupt(fiber)
    const exit = yield* Fiber.await(fiber)
    return `${Exit.isSuccess(exit) ? 'ended' : 'interrupted'}, ${ran ? 'ran' : 'did not run'}`
  })
  const ends = new Set<string>()
  everySchedule(body, { bound: 2 }, (exit) => {
    if (Exit.isSuccess(exit)) ends.add(exit.value)
  })
  expect([...ends].sort()).toEqual(['ended, ran', 'interrupted, did not run'])
})

test('a fiber that yielded and is interrupted runs its finalizer only once picked, under every schedule', () => {
  const body = Effect.gen(function*() {
    let started = false
    let finalized = false
    const fiber = yield* Effect.forkChild(Effect.onInterrupt(
      Effect.forever(Effect.andThen(Effect.sync(() => started = true), Effect.yieldNow)),
      () => Effect.sync(() => finalized = true),
    ))
    while (!started) yield* Effect.yieldNow
    const finalizedInline = yield* Effect.sync(() => {
      fiber.interruptUnsafe()
      return finalized
    })
    const exit = yield* Fiber.await(fiber)
    return { finalizedInline, interrupted: Exit.hasInterrupts(exit), finalized }
  })
  everySchedule(body, { bound: 2 }, (exit) => {
    expect(Exit.isSuccess(exit) ? exit.value : undefined).toEqual({
      finalizedInline: false,
      interrupted: true,
      finalized: true,
    })
  })
})

test('a fiber whose run ends interrupts its children before they go on, under every schedule', () => {
  const body = Effect.gen(function*() {
    let count = 0
    let atEnd = -1
    const parent = yield* Effect.forkChild(Effect.gen(function*() {
      yield* Effect.forkChild(Effect.forever(Effect.andThen(Effect.sync(() => count++), Effect.yieldNow)))
      while (count === 0) yield* Effect.yieldNow
      atEnd = count
    }))
    yield* Fiber.await(parent)
    return count - atEnd
  })
  const run = everySchedule(body, { bound: 2 }, (exit) => {
    expect(Exit.isSuccess(exit) ? exit.value : undefined).toBe(0)
  })
  expect(run).toBeGreaterThan(1)
})

test('a fiber that spins on its own yield starves no other under prioritized schedules', () => {
  // The root waits for a sleeper to call its sleep by yielding, then moves the test clock. Lowered beneath the root,
  // the sleeper would never run again under strict priorities; the strategy turns fair, and it does.
  const spins = Effect.gen(function*() {
    const woke = yield* Deferred.make<void>()
    let sleeping = false
    yield* Effect.forkChild(Effect.andThen(
      Effect.sync(() => {
        sleeping = true
      }),
      Effect.andThen(Effect.sleep('10 millis'), Deferred.succeed(woke, undefined)),
    ))
    while (!sleeping) yield* Effect.yieldNow
    while (!(yield* Deferred.isDone(woke))) yield* TestClock.adjust('10 millis')
    return 'woke'
  }).pipe(Effect.provide(TestClock.layer()))
  prioritizedSchedules(spins, { runs: 200, depth: 3 }, (exit) => {
    expect(Exit.isSuccess(exit) ? exit.value : undefined).toBe('woke')
  })
})

test('under inline resumptions a fiber a Deferred resumes runs before its resumer goes on, as under Effect', () => {
  // Effect resumes the waiter on the stack of the fiber that completes the Deferred. Queued, the waiter waits for
  // its pick, and the resumer goes on first.
  const body = Effect.gen(function*() {
    const log: Array<string> = []
    const deferred = yield* Deferred.make<void>()
    const waits = Effect.andThen(Deferred.await(deferred), Effect.sync(() => log.push('waiter')))
    const waiter = yield* Effect.forkChild(waits)
    yield* Effect.yieldNow
    yield* Deferred.succeed(deferred, undefined)
    log.push('resumer')
    yield* Fiber.join(waiter)
    return log.join(' ')
  })
  expect(Effect.runSync(body)).toBe('waiter resumer')
  expect(value(scheduled(body, inOrder, 'inline'))).toBe('waiter resumer')
  expect(value(scheduled(body, inOrder))).toBe('resumer waiter')
  // Preempted, the waiter lets the resumer go on, as Effect's budget may make it: both orders inline. Queued, the
  // waiter never runs before the resumer's next step, which Effect's own order is: so queued is no superset of it.
  const orders = (resumptions: 'inline' | 'queued') => {
    const ends = new Set<string>()
    everySchedule(body, { bound: 1, resumptions }, (exit) => {
      if (Exit.isSuccess(exit)) ends.add(exit.value)
    })
    return [...ends].sort()
  }
  expect(orders('inline')).toEqual(['resumer waiter', 'waiter resumer'])
  expect(orders('queued')).toEqual(['resumer waiter'])
})

test('a strategy is asked to preempt a fiber from the second step of its run, never at its first', () => {
  // Effect yields at the second step of a run under a budget of 2, and a yield at the first is a `queued` resumption's
  // (decision 0244).
  const resumes = Effect.gen(function*() {
    const deferred = yield* Deferred.make<void>()
    const waiter = yield* Effect.forkChild(Effect.andThen(Deferred.await(deferred), Effect.yieldNow))
    yield* Effect.yieldNow
    yield* Deferred.succeed(deferred, undefined)
    yield* Fiber.join(waiter)
    return 'ended'
  })
  const steps: Array<number> = []
  const always: Strategy = {
    pick: () => 0,
    preempt: () => {
      steps.push(Fiber.getCurrent()?.currentOpCount ?? 0)
      return true
    },
  }
  for (const resumptions of ['inline', 'queued'] as const) {
    expect(value(scheduled(twoWriters, always, resumptions))).toBeDefined()
    expect(value(scheduled(resumes, always, resumptions))).toBe('ended')
  }
  expect(steps.length).toBeGreaterThan(0)
  expect(Math.min(...steps)).toBe(2)
})

test('a fiber started inline yields with no task ready, and gives its parent back as a budget of Effect does', () => {
  // A child started inline, on its parent's stack, gives its parent back when it yields. Effect does so under a
  // budget the child reaches first, which gives the two orders below (spikes/effect-inline-start-yields.test.ts).
  // The scheduler of the tests asks the child even with no task ready, and so reaches both (decision 0117).
  const body = Effect.gen(function*() {
    const log: Array<string> = []
    const step = (name: string) => Effect.sync(() => log.push(name))
    const child = yield* Effect.forkChild(
      Effect.gen(function*() {
        yield* step('c1')
        yield* step('c2')
        yield* step('c3')
        yield* step('c4')
      }),
      { startImmediately: true },
    )
    log.push('p')
    yield* Fiber.join(child)
    return log.join(' ')
  })
  for (const resumptions of ['inline', 'queued'] as const) {
    const ends = new Set<string>()
    everySchedule(body, { bound: 1, resumptions }, (exit) => {
      if (Exit.isSuccess(exit)) ends.add(exit.value)
    })
    expect([...ends]).toContain('c1 p c2 c3 c4')
    expect([...ends]).toContain('c1 c2 c3 p c4')
  }
  // Under prioritized schedules the child yields with no task ready at a change of priority alone: so a run in which
  // no change falls on the child keeps it going, and one in which a change does gives its parent back.
  const ends = new Set<string>()
  prioritizedSchedules(body, { runs: 200, depth: 2, resumptions: 'inline' }, (exit) => {
    if (Exit.isSuccess(exit)) ends.add(exit.value)
  })
  expect([...ends]).toContain('c1 c2 c3 c4 p')
  expect([...ends]).toContain('c1 p c2 c3 c4')
})
