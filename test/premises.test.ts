/**
 * The premises of `docs/premises.md`, one test each, named after its entry: what `effect` (the lockfile's) or the
 * JavaScript engine does, checked on the smallest program that shows it, with nothing of the library. The premise of
 * the scheduler of the tests has a file of its own, `effect-scheduler.test.ts`, for the harness it needs, and those of
 * the bridges on their renderers lie in the bridges' tests, where the DOM is.
 */
import { describe, expect, test } from "bun:test"
import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
import * as Data from "effect/Data"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as FiberMap from "effect/FiberMap"
import * as FiberSet from "effect/FiberSet"
import * as Hash from "effect/Hash"
import * as HashMap from "effect/HashMap"
import * as Pull from "effect/Pull"
import * as Queue from "effect/Queue"
import * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import { collectGarbage } from "./gc.test_helper.ts"

const reasonsOf = <A, E>(exit: Exit.Exit<A, E>): ReadonlyArray<Cause.Reason<E>> =>
  Exit.isFailure(exit) ? exit.cause.reasons : []

/** The reasons of an exit, as tags with their defect or the fiber that interrupted. */
const described = <A, E>(exit: Exit.Exit<A, E>) =>
  reasonsOf(exit).map((reason) =>
    reason._tag === "Die"
      ? ["Die", reason.defect]
      : reason._tag === "Interrupt"
      ? ["Interrupt", reason.fiberId]
      : ["Fail", reason.error]
  )

/**
 * Forks the fiber `body` makes of the effect that says it runs, and waits until it does: `body` puts that effect where
 * the fiber has entered what the test is about.
 */
const started = Effect.fnUntraced(function*<A, E>(body: (running: Effect.Effect<void>) => Effect.Effect<A, E>) {
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
      note("Equal")
      return that instanceof Key && that.id === this.id
    }
    [Hash.symbol](): number {
      note("Hash")
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

test("HashMap calls a key's Equal and Hash only within the call it is given the key in", async () => {
  const { Key, within, late, calls } = watched()
  let map = within(() => HashMap.make([new Key(1), "one"], [new Key(2), "two"], [new Key(3), "three"]))
  map = within(() => HashMap.set(map, new Key(4), "four"))
  map = within(() => HashMap.remove(map, new Key(2)))
  within(() => HashMap.get(map, new Key(3)))
  within(() => HashMap.has(map, new Key(5)))
  map = within(() => HashMap.union(map, HashMap.make([new Key(6), "six"])))
  map = within(() => HashMap.set(map, new Key(1), "once more"))
  await new Promise((resolve) => setTimeout(resolve, 0))
  collectGarbage()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(calls()).toBeGreaterThan(0)
  expect(late).toEqual([])
  expect(HashMap.size(map)).toBe(4)
})

// What the test before fails with: a `FiberMap` compares a key in the observer of a fiber, as it ends. `Equal` keeps
// the result of each pair of objects it compared, so the observer calls a key's `Equal` only on a pair that no call
// compared: here, the key of a fiber replaced under an equal one, which ends once that key has left the map, and a key
// added after it left.
test("the watch of that test sees a FiberMap call a key's Equal after the call, in a fiber's observer", async () => {
  const { Key, within, late } = watched()
  const scope = Scope.makeUnsafe()
  const map = Effect.runSync(Scope.provide(FiberMap.make<InstanceType<typeof Key>>(), scope))
  const running = Deferred.makeUnsafe<void>()
  const release = Deferred.makeUnsafe<void>()
  // Once interrupted, it ends only when the test releases it.
  const replaced = within(() =>
    Effect.runSync(FiberMap.run(
      map,
      new Key(1),
      Deferred.succeed(running, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.onInterrupt(() => Deferred.await(release))
      )
    ))
  )
  await Effect.runPromise(Deferred.await(running))
  // Its observer, which runs before the wait's, takes the key away as it ends.
  const replacing = within(() => Effect.runSync(FiberMap.run(map, new Key(1), Effect.void)))
  await Effect.runPromise(Fiber.await(replacing))
  within(() => Effect.runSync(FiberMap.run(map, new Key(2), Effect.never)))
  expect(late).toEqual([])
  Effect.runSync(Deferred.succeed(release, undefined))
  await Effect.runPromise(Fiber.await(replaced))
  expect(late).toEqual(["Equal"])
  await Effect.runPromise(Scope.close(scope, Exit.void))
})

// Completed first by plain code, as `drive` completes its waits, then by a fiber.
test("a fiber that waits on a Deferred runs on the stack of whoever completes it, until it waits again", async () => {
  const steps = await Effect.runPromise(Effect.gen(function*() {
    const steps: Array<string> = []
    const first = yield* Deferred.make<void>()
    const second = yield* Deferred.make<void>()
    const fiber = yield* Effect.forkChild(
      Deferred.await(first).pipe(
        Effect.andThen(Effect.sync(() => steps.push("resumed"))),
        Effect.andThen(Deferred.await(second)),
        Effect.andThen(Effect.sync(() => steps.push("resumed again")))
      ),
      { startImmediately: true }
    )
    steps.push("completing")
    Deferred.doneUnsafe(first, Exit.void)
    steps.push("completed")
    yield* Deferred.succeed(second, undefined)
    steps.push("completed again")
    yield* Fiber.join(fiber)
    return steps
  }))
  expect(steps).toEqual(["completing", "resumed", "completed", "resumed again", "completed again"])
})

describe("code that a fiber runs on the stack of the fiber that forks it sees the forked fiber as its own", () => {
  /**
   * Forks, with `fork`, an effect that says which fiber it sees in each of its first steps, on the stack of the fiber
   * that forks it, and returns the ids it saw, beside the ids of the forked fiber and of the one that forked it.
   */
  const seen = <C>(
    make: Effect.Effect<C, never, Scope.Scope>,
    fork: (kept: C, self: Effect.Effect<void>) => Effect.Effect<Fiber.Fiber<void>>
  ) =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const container = yield* make
      const forker = yield* Effect.fiber
      const ids: Array<number | undefined> = []
      const looking = Effect.withFiber((fiber) => {
        ids.push(fiber.id, Fiber.getCurrent()?.id)
        return Effect.void
      }).pipe(
        Effect.andThen(Effect.fiber),
        Effect.map((fiber) => void ids.push(fiber.id))
      )
      const fiber = yield* fork(container, looking)
      yield* Fiber.join(fiber)
      return { ids, forked: fiber.id, forker: forker.id }
    })))

  const ownOnly = (
    { ids, forked, forker }: Readonly<{ ids: ReadonlyArray<number | undefined>; forked: number; forker: number }>
  ) => {
    expect(ids).toEqual([forked, forked, forked])
    expect(ids).not.toContain(forker)
  }

  test("Effect.forkChild with startImmediately", async () => {
    ownOnly(await seen(Effect.void, (_, self) => Effect.forkChild(self, { startImmediately: true })))
  })

  test("FiberSet.run", async () => {
    ownOnly(await seen(FiberSet.make<void>(), (set, self) => FiberSet.run(set, self)))
  })

  test("FiberMap.run", async () => {
    ownOnly(await seen(FiberMap.make<string, void>(), (map, self) => FiberMap.run(map, "k", self)))
  })
})

describe("what the cleanup of Effect.onExit fails with comes after the cause of the effect", () => {
  test("of an effect that dies", async () => {
    const exit = await Effect.runPromiseExit(Effect.die("effect").pipe(Effect.onExit(() => Effect.die("cleanup"))))
    expect(described(exit)).toEqual([["Die", "effect"], ["Die", "cleanup"]])
  })

  test("of an effect that is interrupted", async () => {
    const [id, exit] = await Effect.runPromise(Effect.gen(function*() {
      const fiber = yield* started((running) =>
        Effect.andThen(running, Effect.never).pipe(Effect.onExit(() => Effect.die("cleanup")))
      )
      yield* Fiber.interrupt(fiber)
      return [yield* Effect.fiberId, yield* Fiber.await(fiber)] as const
    }))
    expect(described(exit)).toEqual([["Interrupt", id], ["Die", "cleanup"]])
  })
})

// `interruptUnsafe` gives the interruption with no wait, so that it is received before the gate opens:
// `Fiber.interrupt` is it followed by an await.
describe("a fiber that fails as it is interrupted keeps its own reasons and gets those it received added", () => {
  test("to an interruption of its own", async () => {
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
    expect(described(exit)).toEqual([["Interrupt", own], ["Interrupt", by]])
  })

  test("and Effect.interruptible, entered where it is uninterruptible, fails with exactly those it received", async () => {
    const [by, entered] = await Effect.runPromise(Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      const entered = yield* Deferred.make<Exit.Exit<void>>()
      const fiber = yield* started((running) =>
        Effect.uninterruptible(running.pipe(
          Effect.andThen(Deferred.await(gate)),
          Effect.andThen(Effect.exit(Effect.interruptible(Effect.void))),
          Effect.flatMap((exit) => Deferred.succeed(entered, exit))
        ))
      )
      const by = yield* Effect.fiberId
      fiber.interruptUnsafe(by)
      yield* Deferred.succeed(gate, undefined)
      return [by, yield* Deferred.await(entered)] as const
    }))
    expect(described(entered)).toEqual([["Interrupt", by]])
  })
})

describe("one channel runs afresh each time it is run, one run after another or several at once", () => {
  // Of the forms the guide and the examples give `listen` as one value for every start.
  const channels = {
    "Channel.fromIterator, then Channel.concatWith": Channel.fromIterator(() => [1, 2][Symbol.iterator]()).pipe(
      Channel.concatWith(() => Channel.succeed(3))
    ),
    "Channel.forever over Channel.fromIterator": Channel.forever(Channel.fromIterator(() => [1, 2][Symbol.iterator]())),
    "Channel.unwrap of Stream.toChannel, Channel.flattenArray, Channel.map and Channel.mapDone": Channel.unwrap(
      Effect.sync(() =>
        Stream.toChannel(Stream.fromIterable([1, 2, 3])).pipe(
          Channel.flattenArray,
          Channel.map((n) => n * 10),
          Channel.mapDone(() => 0)
        )
      )
    )
  }
  const expected = {
    "Channel.fromIterator, then Channel.concatWith": ["1", "2", "3", "end"],
    "Channel.forever over Channel.fromIterator": ["1", "2", "1", "2"],
    "Channel.unwrap of Stream.toChannel, Channel.flattenArray, Channel.map and Channel.mapDone": [
      "10",
      "20",
      "30",
      "end 0"
    ]
  }
  // Four pulls of a run, each a value, or the end, once the channel has ended.
  const pulled = (pull: Effect.Effect<number, Cause.Done<unknown>>) =>
    pull.pipe(
      Effect.map(String),
      Pull.catchDone((end) => Effect.succeed(end === undefined ? "end" : `end ${JSON.stringify(end)}`))
    )
  const runs = (channel: Channel.Channel<number, never, unknown>, together: boolean) =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const first = yield* Channel.toPull(channel)
      const firstPulls: Array<string> = []
      const secondPulls: Array<string> = []
      if (!together) {
        for (let n = 0; n < 4; n++) firstPulls.push(yield* pulled(first))
      }
      const second = yield* Channel.toPull(channel)
      for (let n = 0; n < 4; n++) {
        if (together) firstPulls.push(yield* pulled(first))
        secondPulls.push(yield* pulled(second))
      }
      return [firstPulls, secondPulls]
    })))

  test.each(Object.keys(channels) as Array<keyof typeof channels>)("%s, one run after another", async (form) => {
    expect(await runs(channels[form], false)).toEqual([expected[form], expected[form]])
  })

  test.each(Object.keys(channels) as Array<keyof typeof channels>)("%s, two runs at once", async (form) => {
    expect(await runs(channels[form], true)).toEqual([expected[form], expected[form]])
  })
})

describe("a collection reclaims what nobody holds, and a FinalizationRegistry then calls back for each target it reclaimed", () => {
  // Made by a function of its own, whose frame is gone when collecting: JavaScriptCore scans the stack conservatively,
  // and may take a stale slot there for a live reference, so a few targets are allowed to stay.
  const registered = (registry: FinalizationRegistry<number>, count: number) =>
    Array.from({ length: count }, (_, held) => {
      const target = {}
      registry.register(target, held)
      return new WeakRef(target)
    })

  test("of a hundred targets nobody holds, a few collections reclaim nearly all, and each reclaimed is called back", async () => {
    const called = new Set<number>()
    const registry = new FinalizationRegistry<number>((held) => {
      called.add(held)
    })
    const refs = registered(registry, 100)
    const left = () => refs.filter((ref) => ref.deref() !== undefined).length
    // A WeakRef keeps its target until the current job ends, and the callbacks run in a job of their own.
    for (let collection = 0; collection < 10 && (left() > 10 || called.size < 100 - left()); collection++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      collectGarbage()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    expect(left()).toBeLessThanOrEqual(10)
    expect(called.size).toBe(100 - left())
    // Held to the end, as `forwardTo` holds its own for as long as its module lives: a registry nobody holds calls back
    // for nothing.
    registry.unregister({})
  })
})

/** The targets of `refs` that a few collections leave, each after the current job has ended. */
const leftAfterCollections = async (refs: ReadonlyArray<WeakRef<object>>) => {
  const left = () => refs.filter((ref) => ref.deref() !== undefined).length
  // A WeakRef keeps its target until the current job ends, and JavaScriptCore scans the stack conservatively, so a
  // few targets are allowed to stay.
  for (let collection = 0; collection < 10 && left() > 10; collection++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    collectGarbage()
  }
  return left()
}

describe("a Queue keeps nothing of a value taken from it", () => {
  // Offered one at a time and in batches, as the engine offers its jobs, and taken as they come, at times with more
  // left behind them in the queue. Made by a function of its own, whose frame is gone when collecting.
  const offeredAndTaken = (queue: Queue.Queue<object>, count: number) =>
    Array.from({ length: count }, (_, index) => {
      const batch = index % 3 === 0 ? [{}] : [{}, {}, {}]
      if (batch.length === 1) Queue.offerUnsafe(queue, batch[0] ?? {})
      else Queue.offerAllUnsafe(queue, batch)
      if (index % 2 === 1) { while (Queue.takeUnsafe(queue) !== undefined); }
      return batch.map((value) => new WeakRef(value))
    }).flat()

  test("of a thousand values taken, a few collections leave a few at most, while the queue lives", async () => {
    const queue = Effect.runSync(Queue.unbounded<object>())
    const refs = offeredAndTaken(queue, 500)
    while (Queue.takeUnsafe(queue) !== undefined);
    expect(refs.length).toBeGreaterThanOrEqual(1_000)
    expect(await leftAfterCollections(refs)).toBeLessThanOrEqual(10)
    // Held to the end: a queue nobody holds keeps nothing, whatever it does.
    expect(Queue.sizeUnsafe(queue)).toBe(0)
  })
})

describe("Effect keeps nothing of a fiber that has ended, nor of what its scope released", () => {
  // Each fiber makes a scope of its own, acquires into it, closes it with its exit, and ends with a value, as a command
  // or a subscription of the engine does, in a set that removes it once it ends. Made by a function of its own, whose
  // frame is gone when collecting.
  const ran = Effect.fnUntraced(function*(set: FiberSet.FiberSet<object>, count: number) {
    const refs: Array<WeakRef<object>> = []
    const hold = <A extends object>(target: A): A => {
      refs.push(new WeakRef(target))
      return target
    }
    for (let index = 0; index < count; index++) {
      const fiber = yield* Effect.flatMap(Scope.make(), (scope) =>
        Effect.acquireRelease(
          Effect.sync(() => hold({})),
          (acquired) => Effect.sync(() => void acquired)
        ).pipe(
          Scope.provide(scope),
          Effect.exit,
          Effect.flatMap((exit) => Effect.andThen(Scope.close(scope, exit), exit)),
          Effect.map(() => hold({}))
        )).pipe(FiberSet.run(set))
      hold(fiber)
      yield* Fiber.await(fiber)
    }
    return refs
  })

  test("of a thousand fibers ended, a few collections leave a few at most, with what they acquired and ended with", async () => {
    const scope = Scope.makeUnsafe()
    const set = Effect.runSync(Scope.provide(FiberSet.make<object>(), scope))
    const refs = await Effect.runPromise(ran(set, 1_000))
    expect(refs).toHaveLength(3_000)
    expect(await leftAfterCollections(refs)).toBeLessThanOrEqual(10)
    // Held to the end, open: a set nobody holds keeps nothing, whatever it does.
    expect(Effect.runSync(FiberSet.size(set))).toBe(0)
    await Effect.runPromise(Scope.close(scope, Exit.void))
  })
})

describe("Scope.close dies with every defect its finalizers die of, none merged by Equal", () => {
  class Closing extends Data.TaggedError("Closing")<object> {}

  // One function makes each, so that no engine tells them apart by where they were made.
  const closing = () => new Closing()

  const closed = (exit: Exit.Exit<unknown, unknown>, fill: (scope: Scope.Scope) => Effect.Effect<void>) =>
    Effect.runPromiseExit(Effect.gen(function*() {
      const scope = yield* Scope.make()
      yield* fill(scope)
      return yield* Scope.close(scope, exit)
    }))

  const twoDie = (scope: Scope.Scope) =>
    Effect.andThen(Scope.addFinalizer(scope, Effect.die(closing())), Scope.addFinalizer(scope, Effect.die(closing())))

  test("two finalizers that die of defects equal by Equal, closed with a success", async () => {
    expect(Equal.equals(closing(), closing())).toBe(true)
    expect(described(await closed(Exit.void, twoDie))).toEqual([["Die", closing()], ["Die", closing()]])
  })

  test("two finalizers that die of defects equal by Equal, closed with a defect", async () => {
    expect(described(await closed(Exit.die("own"), twoDie))).toEqual([["Die", closing()], ["Die", closing()]])
  })

  test("a finalizer of a scope forked from it, beside one of its own", async () => {
    const exit = await closed(
      Exit.void,
      Effect.fnUntraced(function*(scope) {
        yield* Scope.addFinalizer(scope, Effect.die(closing()))
        const child = yield* Scope.fork(scope)
        yield* Scope.addFinalizer(child, Effect.die(closing()))
      })
    )
    expect(described(exit)).toEqual([["Die", closing()], ["Die", closing()]])
  })
})
