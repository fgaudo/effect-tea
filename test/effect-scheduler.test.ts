/**
 * What `scheduled.ts` asks of `effect` 4.1.4's `Scheduler` (ported from effect-tea-persistent's spike of its decision
 * 0104, at 4.1.3, whose run loop 4.1.4 keeps as it is): whether a test can choose where every fiber yields and
 * which runs next. Read in the source: a fiber asks `shouldYield` before each step of its run loop, and one that
 * yields, is forked, or is woken by a `Semaphore`, a `Queue` or a `Latch` goes through `scheduleTask` of a dispatcher
 * its scheduler makes (a wake is a task, which resumes the waiters inline when it runs); but a `Deferred`, a
 * `Fiber.join` and any `Effect.callback` resume their waiter inline, on the stack of the fiber that completes them,
 * without the dispatcher, and so does an interruption, on the stack of the fiber that interrupts. Such a fiber still
 * asks `shouldYield` before its first step, so a scheduler that makes a fiber yield once as it starts to run again has
 * each resumption wait in the dispatcher's queue, where the test picks it.
 *
 * Here the scheduler holds every task and the test runs them by hand, one at a time, synchronously: a run that ends
 * so needed nothing of the platform's, no timer and no microtask, or it would be left waiting.
 */
import { expect, test } from 'bun:test'
import * as Clock from 'effect/Clock'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Queue from 'effect/Queue'
import * as Scheduler from 'effect/Scheduler'
import * as Semaphore from 'effect/Semaphore'
import { TestClock } from 'effect/testing'

/** A generator of numbers in [0, 1) from a seed (mulberry32), so that a seed gives the same choices again. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * A scheduler that holds every task it is given, whatever its priority, and runs the one `choose` picks out of those
 * ready when the test steps it. A fiber that starts to run again yields once first, so that a fiber resumed inline
 * waits for its turn as one forked does; `preempt` says at which other steps a fiber yields.
 *
 * A fiber that yielded is let through only by the task that resumes it: the first fiber a task starts to run. An
 * interruption runs the fiber that yielded inline, on the stack of the fiber that interrupts (`interruptUnsafe` in
 * `internal/effect.ts`, read in the source); let through there, it would run without being picked.
 *
 * Nor is a fiber whose run has just ended made to yield: one with children Effect runs again at once, in the same
 * task, to interrupt them (`evaluate` in `internal/effect.ts`, read in the source), and a yield there would let its
 * children run on after its end. It is told by being the fiber let run last in the task under way; so a fiber resumed
 * inline while it is still that one, as in the step of another fiber that ran it, runs on without being picked.
 *
 * A fiber's first run is not made to yield: it is a task of the queue already, its fork, or runs inline where Effect
 * starts it, as the first fiber of the run does; unless it is interrupted before it starts, and then Effect runs the
 * interruption inline and the fork finds the fiber ended. Made to yield there, the fork's task would run the fiber's
 * body over the interruption.
 */
const controlled = (
  choose: (ready: number) => number,
  preempt: (fiber: Fiber.Fiber<unknown, unknown>) => boolean
) => {
  const ready: Array<Readonly<{ task: () => void; yielder: Fiber.Fiber<unknown, unknown> | undefined }>> = []
  // The fiber this scheduler has just made yield: the task Effect schedules next is its yield's.
  let yielding: Fiber.Fiber<unknown, unknown> | undefined
  const started = new WeakSet<Fiber.Fiber<unknown, unknown>>()
  const letThrough = new WeakSet<Fiber.Fiber<unknown, unknown>>()
  // Whether a task has started and no fiber has started to run in it yet.
  let entering = false
  // The fiber let run last in the task under way. Forgotten as each task starts, so that a fiber resumed inline in a
  // task that has run no fiber, as `TestClock` resumes the one that moves it as a task it follows ends, is not taken
  // for one whose run has ended.
  let running: Fiber.Fiber<unknown, unknown> | undefined
  // What the run did, by fiber: ids are counted from the first fiber of the run, since Effect counts them for the
  // process.
  const trace: Array<string> = []
  let first: number | undefined
  const id = (fiber: Fiber.Fiber<unknown, unknown>) => fiber.id - (first ??= fiber.id)
  const yields = (fiber: Fiber.Fiber<unknown, unknown>) => {
    if (fiber.currentOpCount === 1) {
      const firstRun = !started.has(fiber)
      const resumed = entering && letThrough.delete(fiber)
      const ended = fiber === running
      entering = false
      if (firstRun || resumed || ended) {
        started.add(fiber)
        trace.push(`runs ${id(fiber)}`)
        return false
      }
      letThrough.add(fiber)
      yielding = fiber
      return true
    }
    if (!preempt(fiber)) return false
    trace.push(`preempts ${id(fiber)}`)
    letThrough.add(fiber)
    yielding = fiber
    return true
  }
  const scheduler: Scheduler.Scheduler = {
    executionMode: 'async',
    shouldYield(fiber) {
      const answer = yields(fiber)
      if (!answer) running = fiber
      return answer
    },
    makeDispatcher: () => ({
      scheduleTask: (task) => {
        ready.push({ task, yielder: yielding })
        yielding = undefined
      },
      flush: () => {
        while (step()) {}
      }
    })
  }
  const step = () => {
    if (ready.length === 0) return false
    const [taken] = ready.splice(choose(ready.length), 1)
    if (taken === undefined) return false
    const { task, yielder } = taken
    entering = true
    running = undefined
    if (yielder !== undefined && letThrough.delete(yielder)) {
      // Effect resumes a fiber from a yield its scheduler asked for at the step it yielded, without asking
      // `shouldYield` there (`runLoop` in `internal/effect.ts`, read in the source), so it is let through here. A
      // yield an interruption cancelled leaves a task that runs no fiber.
      entering = false
      running = yielder
      trace.push(`runs ${id(yielder)}`)
    }
    task()
    return true
  }
  // A yield of a fiber that has ended is a task that runs nothing: an interruption cancelled it, and the fiber ran to
  // its end from another task.
  const live = () => ready.filter(({ yielder }) => yielder === undefined || yielder.pollUnsafe() === undefined).length
  return { scheduler, step, trace, firstId: () => first, ready: live }
}

interface Run<A> {
  readonly exit: Exit.Exit<A> | undefined
  readonly trace: ReadonlyArray<string>
  readonly choices: ReadonlyArray<number>
  readonly preemptions: ReadonlyArray<boolean>
  readonly firstId: number | undefined
  /** How many tasks that would run a fiber were still ready when the run ended. */
  readonly left: number
}

/**
 * Runs `effect` under a controlled scheduler, stepping it by hand until it ends, nothing is ready, or it has taken more
 * steps than any run here takes, so that a run that never ends fails instead of hanging the suite.
 */
const drive = <A>(
  effect: Effect.Effect<A>,
  choose: (ready: number) => number,
  preempt: (fiber: Fiber.Fiber<unknown, unknown>) => boolean = () => false
): Run<A> => {
  const choices: Array<number> = []
  const preemptions: Array<boolean> = []
  const run = controlled((ready) => {
    const choice = choose(ready)
    choices.push(choice)
    return choice
  }, (fiber) => {
    const preempts = preempt(fiber)
    preemptions.push(preempts)
    return preempts
  })
  const fiber = Effect.runFork(effect, { scheduler: run.scheduler })
  for (let steps = 0; fiber.pollUnsafe() === undefined && steps < 100_000 && run.step(); steps++) {}
  const exit = fiber.pollUnsafe()
  return { exit, trace: run.trace, choices, preemptions, firstId: run.firstId(), left: run.ready() }
}

/** Whether a run may be preempted yet, and a fiber it may not preempt: `chain` sets both. */
let preemptible = true
let unpreemptible: Fiber.Fiber<unknown, unknown> | undefined

/** Choices at random from `seed`, and a preemption at a step in `1 / every`. */
const seeded = <A>(effect: Effect.Effect<A>, seed: number, every = 8) => {
  const next = random(seed)
  preemptible = true
  unpreemptible = undefined
  return drive(effect, (ready) => Math.floor(next() * ready), (fiber) =>
    preemptible && fiber !== unpreemptible && next() < 1 / every)
}

/** The run again, given the choices it made and the answers it gave of preemption. */
const replay = <A>(effect: Effect.Effect<A>, run: Run<A>) => {
  let choice = 0
  let preemption = 0
  return drive(effect, () => run.choices[choice++] ?? 0, () => run.preemptions[preemption++] ?? false)
}

/** What a run of `chain` saw at the move of the clock that woke its sleeper. */
interface AtWake {
  /** Whether the sleeper had woken, and the chain had got to its end, as that `adjust` returned. */
  readonly woke: boolean
  readonly done: boolean
  /** How many of the three waiters had been counted at their wait, and whether the sleeper had, as it was called. */
  readonly waiting: number
  readonly sleeping: boolean
  /** How many of the three waiters reached their wait only once the clock stood at the sleeper's time. */
  readonly arrivedAfter: number
}

/**
 * A fiber `sleeper` sleeps 10 milliseconds and completes a `Deferred`; `joiner` waits on it in a scope, then forks a
 * fiber that offers to a `Queue` and joins it; `taker` takes from the queue and releases a `Semaphore`; and `holder`
 * waits for the permit and marks the chain done. So what the move of the clock sets going resumes through all of
 * them: a `Deferred` and a `Fiber.join` inline, a fork, a `Queue` and a `Semaphore` through the dispatcher. The test
 * moves the clock 10 milliseconds at a time until the sleeper wakes.
 *
 * The test reads what it reads of a move in the step `adjust` returns in, by `Effect.map` (`what a test reads by
 * Effect.map, or right after yield*, stands as the effect ended, and after a wrapper may not`). Read a step later,
 * after a preemption of the test's fiber, it would see what the other fibers did after `adjust` returned, as though
 * `adjust` had waited for it.
 *
 * `moverPreemptible` false runs the moves under `Scheduler.PreventSchedulerYield`, so that the fiber that moves the
 * clock is not preempted inside `adjust`.
 *
 * `settle` is what the test waits for before it moves the clock, with no preemption until then: nothing, the three
 * waiters, or the sleeper too. Each is counted in the step before its wait. For the three waiters nothing but a
 * preemption separates that step from the wait, and each reads the clock in it. The test clock's sleep puts its entry
 * in the clock's list, takes a permit of a semaphore that `adjust` takes too, and only then waits on the entry's latch
 * (`TestClock.ts`, read in the source): counted while no `adjust` is under way and with no preemption, the permit is
 * free and the sleeper reaches its latch in the same run. `sleeperPreemptible` false keeps the sleeper from being
 * preempted inside its sleep.
 */
const chain = (settle: 'nothing' | 'waiters' | 'all', sleeperPreemptible = true, moverPreemptible = true) =>
  Effect.gen(function*() {
    const started = yield* Deferred.make<void>()
    const queue = yield* Queue.unbounded<number>()
    const semaphore = yield* Semaphore.make(1)
    yield* semaphore.take(1)
    let woke = false
    let wokeAt = Infinity
    let done = false
    let waiting = 0
    let sleeping = false
    const arrivals: Array<number> = []
    const waits = <A>(wait: Effect.Effect<A>) =>
      Effect.clockWith((clock) =>
        Effect.andThen(
          Effect.sync(() => {
            arrivals.push(clock.currentTimeMillisUnsafe())
            waiting++
          }),
          wait
        )
      )
    preemptible = settle === 'nothing'
    const scope = yield* Effect.scope
    const holder = yield* Effect.forkChild(waits(semaphore.withPermits(1)(Effect.sync(() => {
      done = true
    }))))
    yield* Effect.forkChild(Effect.andThen(waits(Queue.take(queue)), semaphore.release(1)))
    yield* Effect.forkIn(
      Effect.andThen(waits(Deferred.await(started)), Effect.flatMap(Effect.forkChild(Queue.offer(queue, 1)), Fiber.join)),
      scope
    )
    yield* Effect.forkChild(Effect.gen(function*() {
      if (!sleeperPreemptible) unpreemptible = yield* Effect.fiber
      sleeping = true
      yield* Effect.sleep('10 millis')
      unpreemptible = undefined
      wokeAt = yield* Clock.currentTimeMillis
      woke = true
      yield* Deferred.succeed(started, undefined)
    }))
    while (settle !== 'nothing' && (waiting < 3 || (settle === 'all' && !sleeping))) yield* Effect.yieldNow
    preemptible = true
    let adjusts = 0
    let atWake: Omit<AtWake, 'arrivedAfter'> | undefined
    while (!woke && adjusts < 100) {
      const before = { waiting, sleeping }
      const move = Effect.map(TestClock.adjust('10 millis'), () => ({ woke, done }))
      const read = yield* moverPreemptible ? move : Effect.provideService(move, Scheduler.PreventSchedulerYield, true)
      adjusts++
      // The sleeper may wake after the `adjust` that moved the clock to its time has returned: that move woke it.
      if (woke) atWake = { ...read, ...before }
    }
    if (atWake === undefined) return yield* Effect.die('the sleeper never woke')
    yield* Fiber.join(holder)
    return { ...atWake, arrivedAfter: arrivals.filter((at) => at >= wokeAt).length } satisfies AtWake
  }).pipe(Effect.scoped, Effect.provide(TestClock.layer()))

const scenario = chain('nothing')

/** Whether the move that woke the sleeper returned with the sleeper awake and the chain at its end. */
const waited = (atWake: AtWake) => atWake.woke && atWake.done

/** The runs of `effect` from seed 0 on, every one of which must end. */
const runs = (effect: Effect.Effect<AtWake>, seeds: number, every: number) => {
  const seen: Array<AtWake> = []
  for (let seed = 0; seed < seeds; seed++) {
    const run = seeded(effect, seed, every)
    if (run.exit === undefined || !Exit.isSuccess(run.exit)) throw new Error(`seed ${seed} did not end`)
    seen.push(run.exit.value)
  }
  return seen
}

test('driven by hand, every fiber resumes through the scheduler, that of the test clock included', () => {
  for (const effect of [scenario, chain('all'), chain('all', true, false)]) {
    for (const every of [2, 8, Infinity]) {
      for (let seed = 0; seed < 300; seed++) {
        const run = seeded(effect, seed, every)
        expect(run.exit !== undefined && Exit.isSuccess(run.exit)).toBe(true)
        // And nothing is left to run once it has ended.
        expect(run.left).toBe(0)
      }
    }
  }
})

test('the timers of the platform the test clock sets are all cleared by the end of a run', () => {
  // The test clock warns, after a second of the platform's, of a test that sleeps and does not move it; `adjust`
  // cancels the warning. A run needs none of these timers, and leaves none behind.
  const { setTimeout: set, clearTimeout: clear } = globalThis
  const pending = new Set<unknown>()
  let made = 0
  globalThis.setTimeout = ((...args: Parameters<typeof set>) => {
    const timer = set(...args)
    pending.add(timer)
    made++
    return timer
  }) as typeof set
  globalThis.clearTimeout = ((timer: Parameters<typeof clear>[0]) => {
    pending.delete(timer)
    clear(timer)
  }) as typeof clear
  try {
    for (let seed = 0; seed < 100; seed++) {
      seeded(scenario, seed, 3)
      seeded(chain('all'), seed, 3)
    }
  } finally {
    globalThis.setTimeout = set
    globalThis.clearTimeout = clear
  }
  expect(made).toBeGreaterThan(0)
  expect(pending.size).toBe(0)
})

test('adjust waits for what it wakes, and for what that sets going, whichever task is picked', () => {
  for (const moverPreemptible of [true, false]) {
    for (const every of [2, 3, 8, Infinity]) {
      for (const atWake of runs(chain('all', true, moverPreemptible), 1000, every)) {
        expect(atWake).toEqual({ woke: true, done: true, waiting: 3, sleeping: true, arrivedAfter: 0 })
      }
    }
  }
})

test('what a test reads by Effect.map, or right after yield*, stands as the effect ended, and after a wrapper may not', () => {
  // So what a test reads so of a move of the clock is what stood as `adjust` returned. Another fiber counts all along,
  // and every step is preempted at even odds. Effect hands a value on to the function given to `map`, and to the
  // generator that yielded the effect, in the step the effect ends in (`succeed` and `getCont` in
  // `internal/effect.ts`, read in the source); a wrapper such as `provideService` puts back what it changed in a step
  // of its own, where the fiber may be preempted.
  type Read = 'map' | 'after yield*' | 'map inside a wrapper' | 'after a wrapper'
  const reads = (read: Read) =>
    Effect.gen(function*() {
      let count = 0
      let stop = false
      const counter = yield* Effect.forkChild(Effect.whileLoop({
        while: () => !stop,
        body: () => Effect.sync(() => count++),
        step: () => {}
      }))
      const wrap = <A>(effect: Effect.Effect<A>) => Effect.provideService(effect, Scheduler.MaxOpsBeforeYield, 2048)
      let moved = 0
      for (let i = 0; i < 200; i++) {
        let before = 0
        const effect = Effect.sync(() => {
          before = count
        })
        let after: number
        if (read === 'map') after = yield* Effect.map(effect, () => count)
        else if (read === 'map inside a wrapper') after = yield* wrap(Effect.map(effect, () => count))
        else {
          yield* read === 'after yield*' ? effect : wrap(effect)
          after = count
        }
        if (after !== before) moved++
      }
      stop = true
      yield* Fiber.join(counter)
      return moved
    })
  const moved = (read: Read) => {
    const next = random(1)
    const exit = drive(reads(read), (ready) => Math.floor(next() * ready), () => next() < 0.5).exit
    return exit !== undefined && Exit.isSuccess(exit) ? exit.value : undefined
  }
  expect(moved('map')).toBe(0)
  expect(moved('after yield*')).toBe(0)
  expect(moved('map inside a wrapper')).toBe(0)
  expect(moved('after a wrapper')).toBeGreaterThan(0)
})

test('a fiber forked before adjust may reach its wait only once the clock has moved, and is not waited for', () => {
  // Under the default scheduler `adjust` gives such a fiber one turn first (decision 0101); here the order of the
  // tasks may not give it. A waiter that arrives after the move is not waited for; with no preemption nothing else
  // keeps the chain from its end, and every run whose waiters were at their waits when the clock moved got to it.
  const seen = runs(scenario, 1000, Infinity)
  expect(seen.filter((atWake) => atWake.arrivedAfter > 0 && !waited(atWake)).length).toBeGreaterThan(0)
  expect(seen.filter((atWake) => atWake.arrivedAfter === 0 && !waited(atWake))).toEqual([])
})

test('a sleeper woken before it is at its latch is not waited for', () => {
  // The clock opens the latch with no fiber at it, has nothing to follow, and returns; the sleeper goes on after it.
  // The waiters are at their waits in every run here. Preempted inside its sleep, the sleeper is kept from its latch
  // between the entry and the latch. Not preempted there, what keeps it is the permit, the one wait of the sleep
  // before the latch, which an `adjust` under way holds long enough only when the fiber that moves the clock is
  // preempted holding it: rarely, about once in a thousand runs; never with that fiber kept from preemption.
  const late = (seen: ReadonlyArray<AtWake>) => seen.filter((atWake) => !waited(atWake)).length
  expect(late(runs(chain('waiters'), 1000, 4))).toBeGreaterThan(0)
  expect(late(runs(chain('waiters', false), 3000, 12))).toBeGreaterThan(0)
  expect(late(runs(chain('waiters', false, false), 3000, 12))).toBe(0)
  expect(late(runs(chain('waiters', false, false), 3000, 2))).toBe(0)
})

test('a run given the same choices takes the same steps, its fibers counted from its first', () => {
  for (const effect of [scenario, chain('all')]) {
    for (let seed = 0; seed < 100; seed++) {
      const run = seeded(effect, seed, 3)
      const again = replay(effect, run)
      expect(again.exit).toEqual(run.exit)
      expect(again.trace).toEqual(run.trace)
      // As many choices and answers asked for as were given, no more and no fewer.
      expect(again.choices).toEqual(run.choices)
      expect(again.preemptions).toEqual(run.preemptions)
      // Effect counts fiber ids for the process, so the second run's start further on.
      expect(again.firstId).toBeGreaterThan(run.firstId ?? Number.POSITIVE_INFINITY)
    }
  }
})

test('the choices change the run', () => {
  const traces = new Set<string>()
  for (let seed = 0; seed < 50; seed++) traces.add(seeded(scenario, seed).trace.join('\n'))
  expect(traces.size).toBeGreaterThan(40)
})

/** Two fibers that each write their letter four times, a step apart. */
const twoWriters = Effect.gen(function*() {
  const log: Array<string> = []
  const write = (letter: string) =>
    Effect.replicateEffect(Effect.sync(() => log.push(letter)), 4, { discard: true })
  const a = yield* Effect.forkChild(write('a'))
  const b = yield* Effect.forkChild(write('b'))
  yield* Fiber.join(a)
  yield* Fiber.join(b)
  return log.join('')
})

test('fibers a Deferred resumes inline run in the order the test picks', () => {
  // The oldest task is picked until the Deferred is completed, so that both waiters reach it, `a` first; after that,
  // `then` picks. Picking the newest from the start would starve them: the yield of the fiber that waits for them is
  // always the newest task.
  let completed = false
  const body = Effect.gen(function*() {
    const log: Array<string> = []
    const deferred = yield* Deferred.make<void>()
    let waiting = 0
    // Counted in the step before the wait, which with no preemption nothing separates from it.
    const waiter = (letter: string) =>
      Effect.andThen(
        Effect.sync(() => waiting++),
        Effect.andThen(Deferred.await(deferred), Effect.sync(() => log.push(letter)))
      )
    const a = yield* Effect.forkChild(waiter('a'))
    const b = yield* Effect.forkChild(waiter('b'))
    while (waiting < 2) yield* Effect.yieldNow
    completed = true
    yield* Deferred.succeed(deferred, undefined)
    yield* Fiber.join(a)
    yield* Fiber.join(b)
    return log.join('')
  })
  const order = (then: (ready: number) => number) => {
    completed = false
    const exit = drive(body, (ready) => completed ? then(ready) : 0).exit
    return exit !== undefined && Exit.isSuccess(exit) ? exit.value : undefined
  }
  expect(order((_ready) => 0)).toBe('ab')
  expect(order((ready) => ready - 1)).toBe('ba')
})

test('a fiber interrupted before it starts does not run, as under the scheduler of Effect', () => {
  const body = Effect.gen(function*() {
    let ran = false
    const fiber = yield* Effect.forkChild(Effect.sync(() => {
      ran = true
    }))
    yield* Fiber.interrupt(fiber)
    return ran
  })
  // With no preemption the fiber that forks goes on to the interruption in the same run, whatever is picked.
  for (let seed = 0; seed < 100; seed++) {
    const exit = seeded(body, seed, Infinity).exit
    expect(exit !== undefined && Exit.isSuccess(exit) ? exit.value : undefined).toBe(false)
  }
})

test('a fiber that yielded and is interrupted waits for its turn, as one resumed inline does', () => {
  // The fiber is preempted at the third step of each run, and yields nowhere else: so it has always yielded when the
  // fiber that forked it, never preempted, interrupts it. From the interruption on no fiber is preempted, so that only
  // a pick keeps the fiber from running to its end inline, before the one that interrupts goes on.
  let interrupting = false
  const body = Effect.gen(function*() {
    let started = false
    let finalized = false
    const fiber = yield* Effect.forkChild(Effect.onInterrupt(
      Effect.whileLoop({ while: () => true, body: () => Effect.sync(() => started = true), step: () => {} }),
      () => Effect.sync(() => finalized = true)
    ))
    while (!started) yield* Effect.yieldNow
    const finalizedInline = yield* Effect.sync(() => {
      interrupting = true
      fiber.interruptUnsafe()
      return finalized
    })
    const exit = yield* Fiber.await(fiber)
    return { finalizedInline, interrupted: Exit.hasInterrupts(exit), finalized }
  })
  for (let seed = 0; seed < 100; seed++) {
    const next = random(seed)
    let root: Fiber.Fiber<unknown, unknown> | undefined
    interrupting = false
    const exit = drive(body, (ready) => Math.floor(next() * ready), (fiber) =>
      fiber !== (root ??= fiber) && !interrupting && fiber.currentOpCount >= 3).exit
    expect(exit !== undefined && Exit.isSuccess(exit) ? exit.value : undefined).toEqual({
      finalizedInline: false,
      interrupted: true,
      finalized: true
    })
  }
})

test('a fiber whose run ends interrupts its children before they go on, as under the scheduler of Effect', async () => {
  // A child counts, a step at a time, while its parent waits for it to start; then the parent starts another child,
  // which runs inline on its stack, and ends. Effect interrupts the children of a fiber that ends in the same run
  // (`evaluate` in `internal/effect.ts`, read in the source), so the first child counts no further after the parent's
  // last step. With no preemption only a yield of the parent there would let it; the second child is the last fiber
  // let run but for the parent's steps after it.
  const body = Effect.gen(function*() {
    let count = 0
    let atEnd = -1
    const parent = yield* Effect.forkChild(Effect.gen(function*() {
      yield* Effect.forkChild(Effect.forever(Effect.andThen(Effect.sync(() => count++), Effect.yieldNow)))
      while (count === 0) yield* Effect.yieldNow
      yield* Effect.forkChild(Effect.never, { startImmediately: true })
      atEnd = count
    }))
    yield* Fiber.await(parent)
    return count - atEnd
  })
  for (let seed = 0; seed < 200; seed++) {
    const exit = seeded(body, seed, Infinity).exit
    expect(exit !== undefined && Exit.isSuccess(exit) ? exit.value : undefined).toBe(0)
  }
  expect(await Effect.runPromise(body)).toBe(0)
})

test('a fiber resumed in the step of another that ran it runs on without a pick, taken for one whose run has ended', () => {
  // In one step the root starts a fiber inline and then resumes it, by a Deferred or by an interruption, with no fiber
  // let run between: the fiber is still the one let run last in the task, and is let through as the run of a fiber
  // that has ended. The end is the one Effect's scheduler gives, which resumes it inline too; only the pick is lost.
  // The fiber interrupted is preempted once at its third step, before the interruption, so that it has yielded.
  let root: Fiber.Fiber<unknown, unknown> | undefined
  let interrupting = false
  const resumed = Effect.withFiber((parent) => {
    root = parent
    const deferred = Deferred.makeUnsafe<void>()
    let continued = false
    const fiber = Effect.runForkWith(parent.context)(Effect.andThen(Deferred.await(deferred), Effect.sync(() => {
      continued = true
    })))
    Deferred.doneUnsafe(deferred, Exit.void)
    return Effect.as(Fiber.await(fiber), continued)
  })
  const interrupted = Effect.withFiber((parent) => {
    root = parent
    let finalized = false
    const fiber = Effect.runForkWith(parent.context)(Effect.onInterrupt(
      Effect.forever(Effect.sync(() => {})),
      () => Effect.sync(() => finalized = true)
    ))
    interrupting = true
    fiber.interruptUnsafe()
    return Effect.as(Fiber.await(fiber), finalized)
  })
  const inline = (effect: Effect.Effect<boolean>) => {
    const exit = drive(effect, () => 0, (fiber) => fiber !== root && !interrupting && fiber.currentOpCount === 3).exit
    return exit !== undefined && Exit.isSuccess(exit) ? exit.value : undefined
  }
  expect(inline(resumed)).toBe(true)
  expect(inline(interrupted)).toBe(true)
  root = undefined
  interrupting = false
  expect(Effect.runSync(resumed)).toBe(true)
  expect(Effect.runSync(interrupted)).toBe(true)
})

test('an interruption racing a resumption ends as under the scheduler of Effect, one way or the other', () => {
  // A fiber whose Deferred is completed, then interrupted before it has gone on. Under Effect's scheduler it is
  // interrupted without going on under a budget of 3 steps, ends either way under 4, and goes on to its end from 5 up
  // (seen, by a check not kept); it never does both, or neither. Here both ends are reached, and only they.
  const body = Effect.gen(function*() {
    const deferred = yield* Deferred.make<void>()
    let waiting = false
    let continued = false
    const waiter = yield* Effect.forkChild(Effect.andThen(
      Effect.sync(() => {
        waiting = true
      }),
      Effect.andThen(Deferred.await(deferred), Effect.sync(() => {
        continued = true
      }))
    ))
    while (!waiting) yield* Effect.yieldNow
    yield* Deferred.succeed(deferred, undefined)
    yield* Fiber.interrupt(waiter)
    const exit = yield* Fiber.await(waiter)
    return `${Exit.isSuccess(exit) ? 'ended' : Exit.hasInterrupts(exit) ? 'interrupted' : 'failed'}, ${
      continued ? 'went on' : 'did not go on'
    }`
  })
  const ends = new Set<string>()
  for (let seed = 0; seed < 300; seed++) {
    const exit = seeded(body, seed, 3).exit
    ends.add(exit !== undefined && Exit.isSuccess(exit) ? exit.value : 'did not end')
  }
  expect([...ends].sort()).toEqual(['ended, went on', 'interrupted, did not go on'])
})

test('a fiber yields where the scheduler says, and another runs between two of its steps', () => {
  const oldest = (_ready: number) => 0
  const run = (preempt: (fiber: Fiber.Fiber<unknown, unknown>) => boolean) => {
    const exit = drive(twoWriters, oldest, preempt).exit
    return exit !== undefined && Exit.isSuccess(exit) ? exit.value : undefined
  }
  // With no preemption a fiber runs to its end before the next is picked.
  expect(run(() => false)).toBe('aaaabbbb')
  // Preempted at every third step of its turn, each gives the other a turn: a's writes are not all together.
  expect(run((fiber) => fiber.currentOpCount % 3 === 0)).toMatch(/a+b+a/)
  // And picking the newest instead changes which goes first.
  const newest = (ready: number) => ready - 1
  const exit = drive(twoWriters, newest).exit
  expect(exit !== undefined && Exit.isSuccess(exit) ? exit.value : undefined).toBe('bbbbaaaa')
})
