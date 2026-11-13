import { describe, expect, test } from 'bun:test'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Scope from 'effect/Scope'
import * as Loop from './loop.ts'

const withLoop = <A>(use: (loop: Loop.Loop) => Effect.Effect<A>) =>
  Effect.gen(function*() {
    const forks = yield* Scope.make()
    const loop = yield* Loop.make(forks, (step) => step)
    return yield* Effect.ensuring(
      use(loop),
      Effect.sync(loop.end).pipe(Effect.andThen(loop.stop), Effect.andThen(Scope.close(forks, Exit.void))),
    )
  })

describe('the loop of rehearse', () => {
  test('runs its steps one at a time, in the order they were offered', async () => {
    const seen: Array<string> = []
    const step = (name: string) =>
      Effect.gen(function*() {
        seen.push(`${name} starts`)
        yield* Effect.sleep('1 millis')
        seen.push(`${name} ends`)
        return name
      })
    const results = await Effect.runPromise(withLoop((loop) =>
      Effect.forEach(['a', 'b', 'c'], (name) => loop.submit(step(name))).pipe(
        Effect.flatMap(Effect.forEach(Deferred.await)),
      )
    ))
    expect(results).toEqual(['a', 'b', 'c'])
    expect(seen).toEqual(['a starts', 'a ends', 'b starts', 'b ends', 'c starts', 'c ends'])
  })

  test('does a step whole though whoever asked for it is interrupted', async () => {
    let done = false
    const asked = await Effect.runPromise(withLoop((loop) =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        const gate = yield* Deferred.make<void>()
        const asking = yield* Effect.forkChild(loop.ask(Effect.gen(function*() {
          yield* Deferred.succeed(started, undefined)
          yield* Deferred.await(gate)
          done = true
        })))
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

  test('is offered nothing once its end is marked: the call is interrupted, or waits when quiet', async () => {
    let ran = false
    let offered = 0
    const step = Effect.sync(() => {
      ran = true
    })
    const counted = { offered: () => offered++ }
    const [before, refused, quiet] = await Effect.runPromise(withLoop((loop) =>
      Effect.gen(function*() {
        const gate = yield* Deferred.make<void>()
        yield* loop.submit(Deferred.await(gate), counted)
        const before = offered
        loop.end()
        const refused = yield* Effect.exit(loop.submit(step, counted))
        const waiting = yield* Effect.forkChild(loop.submit(step, { ...counted, quiet: true }))
        yield* Effect.sleep('10 millis')
        const quiet = waiting.pollUnsafe()
        yield* Fiber.interrupt(waiting)
        yield* Deferred.succeed(gate, undefined)
        yield* loop.finish
        return [before, refused, quiet] as const
      })
    ))
    expect(before).toBe(1)
    expect(Exit.hasInterrupts(refused)).toBe(true)
    expect(quiet).toBeUndefined()
    expect(offered).toBe(1)
    expect(ran).toBe(false)
  })

  test('finishes once it has done what it was offered before', async () => {
    const [early, first] = await Effect.runPromise(withLoop((loop) =>
      Effect.gen(function*() {
        const gate = yield* Deferred.make<void>()
        const first = yield* loop.submit(Deferred.await(gate))
        const finishing = yield* Effect.forkChild(loop.finish)
        yield* Effect.sleep('10 millis')
        const early = finishing.pollUnsafe()
        yield* Deferred.succeed(gate, undefined)
        yield* Fiber.join(finishing)
        return [early, yield* Deferred.isDone(first)] as const
      })
    ))
    expect(early).toBeUndefined()
    expect(first).toBe(true)
  })

  test('interrupts at its stop what it has not delivered, its step under way included', async () => {
    const exits = await Effect.runPromise(withLoop((loop) =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        const holding = yield* loop.submit(Effect.andThen(Deferred.succeed(started, undefined), Effect.never))
        const queued = yield* loop.submit(Effect.void)
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
  test('interrupts its step under way before its stop returns', async () => {
    let interrupted = false
    const atStop = await Effect.runPromise(withLoop((loop) =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        yield* loop.submit(Effect.andThen(Deferred.succeed(started, undefined), Effect.never).pipe(
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              interrupted = true
            })
          ),
        ))
        yield* Deferred.await(started)
        yield* loop.stop
        return interrupted
      })
    ))
    expect(atStop).toBe(true)
  })
})
