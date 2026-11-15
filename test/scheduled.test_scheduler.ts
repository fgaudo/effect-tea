/**
 * A scheduler the tests control (ported from effect-tea-persistent's `src/testing.ts`, its decision 0104): it holds
 * every task Effect gives it, and runs the one a strategy picks, stepped by hand and synchronously, so that a test
 * chooses where every fiber yields and which runs next. What it rests on of Effect is checked by
 * `effect-scheduler.test.ts`, its rules by `scheduled.test.ts`. It is no part of the library: it is not packed. The
 * decisions it names are effect-tea-persistent's, under `docs/decisions/`.
 */
import * as Effect from 'effect/Effect'
import type * as Exit from 'effect/Exit'
import type * as Fiber from 'effect/Fiber'
import * as Scheduler from 'effect/Scheduler'


/**
 * A task ready to run, as a strategy sees it: the fiber that a preemption or a resumption made yield, by its id less
 * the run's first. It is `undefined` for any other task, which Effect schedules with no fiber this scheduler can
 * name: a fork, the wake of a `Queue` or a `Semaphore`, a fiber's own `yieldNow`.
 */
export type Ready = Readonly<{ fiber: number | undefined }>

/**
 * What decides a run under `controlled`. It is asked which ready task runs next, only when more than one is ready.
 * It is asked whether the fiber running yields at a step, only when another task is ready or the fiber runs on the
 * stack of another, which its yield gives back (decision 0117). Elsewhere a yield with no task ready would let the
 * same fiber run on, so it is not asked. So `ready` may be empty for `preempt`. The fiber is named by its id less
 * the run's first, since Effect counts ids for the process.
 */
export type Strategy = Readonly<{
  pick: (ready: ReadonlyArray<Ready>) => number
  preempt: (fiber: number, ready: ReadonlyArray<Ready>) => boolean
}>

/**
 * How a run under `controlled` takes a fiber that a `Deferred`, a `Fiber.join` or a callback resumes:
 * - `queued`, the default: it yields first, and waits for its pick as a fork does. Effect resumes it inline, on the
 *   stack of the fiber that completes it, so this reaches orders Effect's scheduler does not give at 4.1.3, as one
 *   whose resumptions were not inline would (decision 0104);
 * - `inline`: it runs on where Effect resumes it, as under Effect's scheduler, so that a run reaches only the orders
 *   it gives, but for the preemptions and picks a strategy decides.
 */
export type Resumptions = 'queued' | 'inline'

/** What a run under `controlled` decided, in order: its picks, and its answers of preemption. */
export type Schedule = Readonly<{ picks: ReadonlyArray<number>; preemptions: ReadonlyArray<boolean> }>

/**
 * A run under `controlled`. `exit` is `undefined` for a run that did not end: nothing was left to run, it took
 * `maxSteps`, as one that starves does, or it spun.
 */
export type Run<A, E> = Readonly<{
  exit: Exit.Exit<A, E> | undefined
  schedule: Schedule
  /** How many tasks it ran. */
  steps: number
  /**
   * Whether a task asked `maxOps` times to yield, as a fiber that never waits does. The run stops there, since that
   * fiber would run on in that task forever, and no count of tasks would stop it.
   */
  spun: boolean
  /**
   * How many tasks were ready still as it ended. They are not run: a fiber the root did not wait for, as a daemon,
   * stops where it was, so a check reads what the root waited for alone.
   */
  left: number
}>

/** How many tasks are ready, by the scheduler of each run under `controlled`. */
const readyCounts = new WeakMap<Scheduler.Scheduler, () => number>()

/** The fibers `unpreempted` has marked, which no run under `controlled` makes yield again. */
const unpreemptable = new WeakSet<Fiber.Fiber<unknown, unknown>>()

/**
 * A scheduler that holds every task Effect gives it and runs the one `strategy` picks, stepped by hand
 * (decision 0104). It keeps the rules its spike found, in `spikes/effect-scheduler-controlled.test.ts`:
 * - a fiber that starts to run again yields once first, so that one resumed inline, by a `Deferred`, a `Fiber.join`
 *   or a callback, waits for its pick as one forked does;
 * - but not at its first run, which is a task already, its fork, or runs inline where Effect starts it;
 * - nor where it yielded before and is the first fiber its own task runs: an interruption runs such a fiber inline,
 *   on the stack of the fiber that interrupts, and it waits for its pick there;
 * - nor where it is the fiber let run last in the task under way, which Effect runs again as its run ends, to
 *   interrupt its children. So a fiber resumed inline while it is still that one runs on unpicked, which takes a
 *   fiber started inline, by `startImmediately` or a `runFork`, as the runtime does not.
 * Under `inline` resumptions none of these yields is made, and a fiber is asked only of preemption.
 *
 * A fiber that began its run on the stack of another, started or resumed inline, is asked of preemption even with no
 * task ready, since its yield gives the other fiber back. The other fiber then goes on as the strategy decides. That
 * reaches every order Effect's budgets give such a pair, and some no budget gives this program, as the picks do
 * (decision 0117).
 */
const controlled = (strategy: Strategy, resumptions: Resumptions) => {
  type Task = Readonly<
    { task: () => void; fiber: number | undefined; yielder: Fiber.Fiber<unknown, unknown> | undefined }
  >
  const ready: Array<Task> = []
  const picks: Array<number> = []
  const preemptions: Array<boolean> = []
  const started = new WeakSet<Fiber.Fiber<unknown, unknown>>()
  const letThrough = new WeakSet<Fiber.Fiber<unknown, unknown>>()
  // Whether a task has started and no fiber has started to run in it yet.
  let entering = false
  // The fiber let run last in the task under way, forgotten as each task starts.
  let running: Fiber.Fiber<unknown, unknown> | undefined
  // How many tasks have started. A record below names its task, and is stale in any other.
  let tasks = 0
  // A fiber that began its run on the stack of another, by the task it began in: its yield gives that other one back.
  const nested = new WeakMap<Fiber.Fiber<unknown, unknown>, number>()
  // The fiber this scheduler has just made yield: the task Effect schedules next is its yield's.
  let yielding: Fiber.Fiber<unknown, unknown> | undefined
  let first: number | undefined
  // How many times the task under way has asked to yield, counted from each task's start.
  let ops = 0
  let spun = false
  // What a strategy or a flush threw. Thrown inside a fiber, Effect takes it for a defect of that fiber, which the
  // effect under test can catch, and asks again: so the run stops, and `scheduled` throws it.
  let failure: Readonly<{ error: unknown }> | undefined
  const stopped = () => spun || failure !== undefined
  const id = (fiber: Fiber.Fiber<unknown, unknown>) => fiber.id - (first ?? fiber.id)
  const readyTasks = () => ready.map(({ fiber }) => ({ fiber }))
  const yields = (fiber: Fiber.Fiber<unknown, unknown>) => {
    if (unpreemptable.has(fiber)) return false
    if (fiber.currentOpCount === 1) {
      const firstRun = !started.has(fiber)
      const resumed = entering && letThrough.delete(fiber)
      const ended = fiber === running
      // A run that begins after another fiber's, in the same task, begins on that fiber's stack.
      if (!entering && running !== undefined && !ended) nested.set(fiber, tasks)
      entering = false
      // Under `inline`, no fiber yields at its first step, as under Effect's scheduler with a budget above 1.
      if (resumptions === 'inline' || firstRun || resumed || ended) {
        started.add(fiber)
        return false
      }
    } else {
      // A preemption comes from a run's second step, where a budget of 2 makes Effect yield. A run resumed from a yield
      // this scheduler made is first asked at its third step, since Effect counts its resumption as one step and does
      // not ask at the next (decision 0244).
      if (fiber.currentOpCount < leastBudget) return false
      if (ready.length === 0 && nested.get(fiber) !== tasks) return false
      const preempts = strategy.preempt(id(fiber), readyTasks())
      preemptions.push(preempts)
      if (!preempts) return false
    }
    letThrough.add(fiber)
    yielding = fiber
    return true
  }
  const scheduler: Scheduler.Scheduler = {
    executionMode: 'async',
    shouldYield(fiber) {
      // The root asks first: Effect runs it inline as it forks it (`runForkWith` in `internal/effect.ts`).
      first ??= fiber.id
      // A run stopped makes each fiber that asks yield, which ends the task under way, and runs no other.
      if (stopped()) return true
      if (++ops > maxOps) {
        spun = true
        return true
      }
      let answer: boolean
      try {
        answer = yields(fiber)
      } catch (error) {
        failure = { error }
        return true
      }
      if (!answer) running = fiber
      return answer
    },
    makeDispatcher: () => ({
      scheduleTask: (task) => {
        ready.push({ task, fiber: yielding === undefined ? undefined : id(yielding), yielder: yielding })
        yielding = undefined
      },
      // Effect flushes only a dispatcher of its own `runSync`, and `scheduled` alone steps this one. A flush inside a
      // task would run other tasks within it, and the rules above, which read the task under way, would not hold.
      flush: () => {
        const error = new Error(
          'a dispatcher of the controlled scheduler is stepped by its run alone, and never flushed',
        )
        failure ??= { error }
        throw error
      },
    }),
  }
  const step = () => {
    if (stopped() || ready.length === 0) return false
    let index = 0
    if (ready.length > 1) {
      index = strategy.pick(readyTasks())
      if (!Number.isInteger(index) || index < 0 || index >= ready.length) {
        throw new Error(`a strategy picked task ${index} of ${ready.length}`)
      }
      picks.push(index)
    }
    const [taken] = ready.splice(index, 1)
    if (taken === undefined) return false
    const { task, yielder } = taken
    entering = true
    running = undefined
    if (yielder !== undefined) {
      // The task of a yield this scheduler made resumes its fiber at the step it yielded, and Effect does not ask
      // `shouldYield` there (`runLoop` in `internal/effect.ts` at 4.1.3, read in the source). So the fiber is let
      // through here, as it would be at that step: it is the first fiber its own task runs (decision 0244). A yield
      // cancelled by an interruption leaves a task that runs no fiber, so nothing reads what it sets.
      entering = false
      letThrough.delete(yielder)
      running = yielder
    }
    tasks += 1
    ops = 0
    task()
    return true
  }
  readyCounts.set(scheduler, () => ready.length)
  return {
    scheduler,
    step,
    schedule: (): Schedule => ({ picks, preemptions }),
    left: () => ready.length,
    spun: () => spun,
    failure: () => failure,
  }
}

/**
 * Yields until it resumes with no other task ready: every other fiber of the run then waits on something only the
 * fiber that runs `idle` can give, or that never comes. It dies outside a run of `scheduled`, where nothing tells it.
 * Under `prioritized`, it may spin while a fiber lowered beneath its yield waits, until the strategy turns fair.
 */
export const idle: Effect.Effect<void> = Effect.withFiber((fiber) => {
  const count = readyCounts.get(fiber.getRef(Scheduler.Scheduler))
  if (count === undefined) return Effect.die(new Error('idle runs under the scheduler of scheduled alone'))
  const wait: Effect.Effect<void> = Effect.yieldNow.pipe(
    Effect.andThen(Effect.suspend(() => count() === 0 ? Effect.void : wait)),
  )
  return wait
})

/**
 * Marks the fiber that runs it, which no run under `controlled` makes yield from then on, at a step or as it resumes:
 * it runs on until it waits, yields of itself, or ends. So what it does in between is one step to every other fiber,
 * as a failure on its way out is, which an interruption that reaches the fiber at a yield would take the place of.
 */
export const unpreempted: Effect.Effect<void> = Effect.withFiberSucceed((fiber) => {
  unpreemptable.add(fiber)
})

/**
 * The least budget of steps whose yield is not the one a `queued` resumption makes: the step a preemption first
 * comes at.
 */
const leastBudget = 2

/** How many tasks a run may take before it is taken for one that never ends. */
const maxSteps = 1_000_000

/** How many times a task may ask to yield before it is taken for a fiber that never waits. */
const maxOps = 1_000_000

/**
 * Runs `effect` under a scheduler `strategy` decides, stepped by hand and synchronously, until it ends, nothing is
 * ready, it has taken `maxSteps` tasks, or a task spins. So a run needs nothing of the platform's, no timer and no
 * microtask: what does is left waiting, and the run does not end. Throws what the strategy throws, or a flush, even
 * where the effect catches it.
 */
export const scheduled = <A, E>(
  effect: Effect.Effect<A, E>,
  strategy: Strategy,
  resumptions: Resumptions = 'queued',
): Run<A, E> => {
  const run = controlled(strategy, resumptions)
  const fiber = Effect.runFork(effect, { scheduler: run.scheduler })
  let steps = 0
  while (fiber.pollUnsafe() === undefined && steps < maxSteps && run.step()) steps++
  const failure = run.failure()
  if (failure !== undefined) throw failure.error
  return { exit: fiber.pollUnsafe(), schedule: run.schedule(), steps, spun: run.spun(), left: run.left() }
}

/**
 * The oldest task first and no preemption: a fiber runs on until it waits, as under Effect's own scheduler with an
 * unbounded budget. The one difference is the yield before each resumption, which queues a fiber Effect would
 * resume inline.
 */
export const inOrder: Strategy = { pick: () => 0, preempt: () => false }

/**
 * The run `schedule` recorded, again: the same steps, given the same decisions. Throws if the run asks more or fewer
 * decisions than were recorded, since it did not take the same steps then.
 */
export const replayed = <A, E>(
  effect: Effect.Effect<A, E>,
  schedule: Schedule,
  resumptions: Resumptions = 'queued',
): Run<A, E> => {
  let pick = 0
  let preemption = 0
  const run = scheduled(effect, {
    pick: () => schedule.picks[pick++] ?? 0,
    preempt: () => schedule.preemptions[preemption++] ?? false,
  }, resumptions)
  if (pick !== schedule.picks.length || preemption !== schedule.preemptions.length) {
    throw new Error(`the run asked ${pick} picks and ${preemption} preemptions, and its schedule has ${
      schedule.picks.length
    } and ${schedule.preemptions.length}`)
  }
  return run
}

/**
 * The decisions where a run deviates from `inOrder`, by their place in the order the run asks them, each with what
 * it decides there: the task picked, or 1 for a preemption.
 */
type Deviations = ReadonlyMap<number, number>

/** `inOrder`, but at the decisions `deviations` names. `asked` gets, for each decision, how many ways it can go. */
const deviating = (deviations: Deviations, asked: Array<number>): Strategy => ({
  pick: (ready) => {
    asked.push(ready.length)
    return deviations.get(asked.length - 1) ?? 0
  },
  preempt: () => {
    asked.push(2)
    return deviations.has(asked.length - 1)
  },
})

/**
 * The run in order, but at the decisions `deviations` names, as `everySchedule` names them when a run fails: so that
 * a test replays that run alone.
 */
export const deviated = <A, E>(
  effect: Effect.Effect<A, E>,
  deviations: ReadonlyArray<readonly [decision: number, choice: number]>,
  resumptions: Resumptions = 'queued',
): Run<A, E> => scheduled(effect, deviating(new Map(deviations), []), resumptions)

/** Checks a run's end, a run that did not end failing, and says on failure what replays it. */
const checked = <A, E>(run: Run<A, E>, check: (exit: Exit.Exit<A, E>) => void, replay: string): void => {
  try {
    if (run.spun) throw new Error(`a task of the run asked ${maxOps} times to yield, and never waited`)
    if (run.exit === undefined) throw new Error(`the run did not end after ${run.steps} tasks`)
    check(run.exit)
  } catch (error) {
    throw new Error(`under ${replay}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

/**
 * Runs `effect` under every schedule that deviates from `inOrder` at most `bound` times, and has `check` read each
 * end. This is delay bounding: preemption bounding, as in CHESS, with the picks counted as well, since a pick is a
 * choice at every step here and would leave the schedules unbounded otherwise (decision 0104). A deviation is a pick
 * of any task but the oldest, or a preemption. Within its bound it is exhaustive, and a failure names the deviations
 * that replay it. It throws past `runs` runs, so that a bound too large for a scenario says so instead of running
 * for hours. Returns how many runs it took.
 */
export const everySchedule = <A, E>(
  effect: Effect.Effect<A, E>,
  { bound, runs = 100_000, resumptions = 'queued' }: Readonly<
    { bound: number; runs?: number; resumptions?: Resumptions }
  >,
  check: (exit: Exit.Exit<A, E>) => void,
): number => {
  let ran = 0
  const visit = (deviations: Deviations, after: number) => {
    if (++ran > runs) throw new Error(`more than ${runs} schedules within ${bound} deviations`)
    const asked: Array<number> = []
    checked(
      scheduled(effect, deviating(deviations, asked), resumptions),
      check,
      `deviated(${JSON.stringify([...deviations])}, '${resumptions}')`,
    )
    if (deviations.size === bound) return
    // The decisions before the last deviation went the same way in this run as in the one that found it.
    for (let decision = after + 1; decision < asked.length; decision++) {
      for (let choice = 1; choice < (asked[decision] ?? 0); choice++) {
        visit(new Map([...deviations, [decision, choice]]), decision)
      }
    }
  }
  visit(new Map(), -1)
  return ran
}

/** A generator of numbers in [0, 1) from a seed (mulberry32), so that a seed gives the same choices again. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * Probabilistic concurrency testing (Burckhardt et al., 2010) over `steps` decisions of preemption, from `seed`.
 * Each fiber is given a random priority above 2 as it is first seen; the ready task of the highest runs, and a fiber
 * yields as soon as a higher one is ready. At `depth - 1` of the steps, drawn at random, the fiber running is lowered
 * beneath 1, to a priority each change has of its own, and yields. A task no fiber names, a fork or a wake among
 * them, has priority 1, the oldest first: so a fiber lowered lets a fork run.
 *
 * Strict priorities starve a fiber lowered beneath one that spins waiting for it, on `yieldNow`. So after ten times
 * `steps` decisions the strategy runs `inOrder`, which is fair, as Coyote's PCT turns fair after its unfair steps:
 * a run that ends under a fair scheduler ends here too.
 */
export const prioritized = (seed: number, depth: number, steps: number): Strategy => {
  const next = random(seed)
  const priorities = new Map<number, number>()
  // Distinct steps, or two changes at one step would be one, and the depth one less.
  const changes: Array<number> = []
  while (changes.length < Math.min(depth - 1, steps)) {
    const change = Math.floor(next() * steps)
    if (!changes.includes(change)) changes.push(change)
  }
  let step = 0
  let decisions = 0
  const unfair = () => ++decisions <= 10 * steps
  const priority = (fiber: number | undefined) => {
    if (fiber === undefined) return 1
    let held = priorities.get(fiber)
    if (held === undefined) priorities.set(fiber, held = 2 + next())
    return held
  }
  const highest = (ready: ReadonlyArray<Ready>) =>
    ready.reduce((best, task, index) => priority(task.fiber) > priority(ready[best]?.fiber) ? index : best, 0)
  return {
    pick: (ready) => unfair() ? highest(ready) : 0,
    preempt: (fiber, ready) => {
      if (!unfair()) return false
      const change = changes.indexOf(step++)
      if (change !== -1) {
        priorities.set(fiber, (depth - 1 - change) / depth)
        return true
      }
      // A fiber on the stack of another is asked with no task ready, and yields there at a change alone.
      if (ready.length === 0) return false
      return priority(ready[highest(ready)]?.fiber) > priority(fiber)
    },
  }
}

/**
 * The seeds a run of prioritized schedules runs: `pinned` first, each once, then `count` seeds from `first` on. A
 * seed pinned is one a run once failed on, kept as a check against its bug's return whatever range the run explores.
 */
export const seeds = (
  { first = 0, count, pinned = [] }: Readonly<{ first?: number; count: number; pinned?: ReadonlyArray<number> }>,
): ReadonlyArray<number> => {
  const range = Array.from({ length: count }, (_, index) => first + index)
  return [...new Set([...pinned, ...range])]
}

/**
 * Runs `effect` under `runs` schedules of `prioritized` at `depth`, from seed `first` (0 unless given), after the
 * seeds `pinned`, and has `check` read each end. A bug of depth `d`, `d` orderings that must all fall one way, is
 * found by each run with a probability of at least 1 / (n k^(d - 1)), for n fibers and k steps. The steps are those
 * a run `inOrder` is asked of preemption. A failure names the seed that replays it.
 */
export const prioritizedSchedules = <A, E>(
  effect: Effect.Effect<A, E>,
  { runs, depth, first = 0, pinned = [], resumptions = 'queued' }: Readonly<
    { runs: number; depth: number; first?: number; pinned?: ReadonlyArray<number>; resumptions?: Resumptions }
  >,
  check: (exit: Exit.Exit<A, E>) => void,
): void => {
  const steps = Math.max(1, scheduled(effect, inOrder, resumptions).schedule.preemptions.length)
  for (const seed of seeds({ first, count: runs, pinned })) {
    checked(
      scheduled(effect, prioritized(seed, depth, steps), resumptions),
      check,
      `prioritized(${seed}, ${depth}, ${steps}) under '${resumptions}'`,
    )
  }
}
