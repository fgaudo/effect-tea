import { describe, expect, test } from "bun:test"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Opt from "effect/Option"
import * as Scope from "effect/Scope"
import * as Loop from "./loop.ts"

const withLoop = <A>(use: (loop: Loop.Loop) => Effect.Effect<A>) =>
  Effect.gen(function*() {
    const forks = yield* Scope.make()
    const loop = yield* Loop.make(forks, (job) => job)
    return yield* Effect.ensuring(
      use(loop),
      Effect.sync(loop.end).pipe(Effect.andThen(loop.stop), Effect.andThen(Scope.close(forks, Exit.void)))
    )
  })

// Offers `job` in the thunk of the check of the end, and returns its completion.
const offered = (loop: Loop.Loop, job: Effect.Effect<void>, options?: Readonly<{ quiet?: boolean }>) =>
  loop.submit(() => {
    const done = Deferred.makeUnsafe<void>()
    loop.offer(job, done)
    return Effect.succeed(done)
  }, options)

describe("the loop of rehearse", () => {
  test("runs its jobs one at a time, in the order they were offered", async () => {
    const seen: Array<string> = []
    const job = (name: string, gate: Deferred.Deferred<void>) =>
      Effect.gen(function*() {
        seen.push(`${name} starts`)
        yield* Deferred.await(gate)
        seen.push(`${name} ends`)
      })
    await Effect.runPromise(withLoop((loop) =>
      Effect.gen(function*() {
        const gates = yield* Effect.forEach(["a", "b", "c"], () => Deferred.make<void>())
        const dones = yield* Effect.forEach(["a", "b", "c"], (name, index) => offered(loop, job(name, gates[index]!)))
        // Opened last first: a job that started before the one ahead of it had ended would end first.
        yield* Effect.forEach([...gates].reverse(), (gate) => Deferred.succeed(gate, undefined))
        yield* Effect.forEach(dones, Deferred.await)
      })
    ))
    expect(seen).toEqual(["a starts", "a ends", "b starts", "b ends", "c starts", "c ends"])
  })

  test("does a job whole though whoever offered it is interrupted", async () => {
    let done = false
    const asked = await Effect.runPromise(withLoop((loop) =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        const gate = yield* Deferred.make<void>()
        const asking = yield* Effect.forkChild(
          Effect.flatMap(
            offered(
              loop,
              Effect.gen(function*() {
                yield* Deferred.succeed(started, undefined)
                yield* Deferred.await(gate)
                done = true
              })
            ),
            Deferred.await
          )
        )
        yield* Deferred.await(started)
        yield* Fiber.interrupt(asking)
        const asked = yield* Fiber.await(asking)
        yield* Deferred.succeed(gate, undefined)
        yield* loop.finish
        return asked
      })
    ))
    expect(Exit.hasInterrupts(asked)).toBe(true)
    expect(done).toBe(true)
  })

  test("decides nothing once its end is marked: the call is interrupted, or waits when quiet", async () => {
    let decided = 0
    const deciding = () =>
      Effect.sync(() => {
        decided++
      })
    const [before, refused, quiet] = await Effect.runPromise(withLoop((loop) =>
      Effect.gen(function*() {
        yield* loop.submit(deciding)
        const before = decided
        loop.end()
        const refused = yield* Effect.timeoutOption(Effect.exit(loop.submit(deciding)), "1 second")
        // Started on this stack, the call has been refused, or is waiting, once the fork returns.
        const waiting = yield* Effect.forkChild(loop.submit(deciding, { quiet: true }), { startImmediately: true })
        const quiet = waiting.pollUnsafe()
        yield* Fiber.interrupt(waiting)
        return [before, refused, quiet] as const
      })
    ))
    expect(before).toBe(1)
    expect(Opt.isSome(refused) && Exit.hasInterrupts(refused.value)).toBe(true)
    expect(quiet).toBeUndefined()
    expect(decided).toBe(1)
  })

  test("finishes once it has done what it was offered before", async () => {
    const [early, first] = await Effect.runPromise(withLoop((loop) =>
      Effect.gen(function*() {
        const gate = yield* Deferred.make<void>()
        const first = yield* offered(loop, Deferred.await(gate))
        // Started on this stack, it has finished, or waits for the loop, once the fork returns.
        const finishing = yield* Effect.forkChild(loop.finish, { startImmediately: true })
        const early = finishing.pollUnsafe()
        yield* Deferred.succeed(gate, undefined)
        yield* Fiber.join(finishing)
        return [early, yield* Deferred.isDone(first)] as const
      })
    ))
    expect(early).toBeUndefined()
    expect(first).toBe(true)
  })

  test("interrupts at its stop what it has not delivered, its job under way included", async () => {
    const exits = await Effect.runPromise(withLoop((loop) =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        const holding = yield* offered(loop, Effect.andThen(Deferred.succeed(started, undefined), Effect.never))
        const queued = yield* offered(loop, Effect.void)
        yield* Deferred.await(started)
        yield* loop.stop
        const done = [yield* Deferred.isDone(holding), yield* Deferred.isDone(queued)]
        if (done.includes(false)) return done
        return [yield* Effect.exit(Deferred.await(holding)), yield* Effect.exit(Deferred.await(queued))]
      })
    ))
    expect(exits.map((exit) => Exit.isExit(exit) && Exit.hasInterrupts(exit))).toEqual([true, true])
  })

  // What closes the scope it is forked in would interrupt it too, but only after what the stop is followed by.
  test("interrupts its job under way before its stop returns", async () => {
    let interrupted = false
    const atStop = await Effect.runPromise(withLoop((loop) =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        yield* offered(
          loop,
          Effect.andThen(Deferred.succeed(started, undefined), Effect.never).pipe(
            Effect.onInterrupt(() =>
              Effect.sync(() => {
                interrupted = true
              })
            )
          )
        )
        yield* Deferred.await(started)
        yield* loop.stop
        return interrupted
      })
    ))
    expect(atStop).toBe(true)
  })

  test("completes a job with how it ended", async () => {
    const exit = await Effect.runPromise(
      withLoop((loop) => Effect.flatMap(offered(loop, Effect.die("boom")), (done) => Effect.exit(Deferred.await(done))))
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })
})
