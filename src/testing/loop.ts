import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Queue from 'effect/Queue'
import type * as Scope from 'effect/Scope'

/**
 * One fiber that runs the steps it is offered one at a time, in the order they were offered, as the run's loop takes
 * its messages: whoever offers a step only waits for its result, so that an interruption of whoever asked never
 * splits a step. It knows nothing of the program: `rehearse` gives it its steps.
 */
export type Loop = Readonly<{
  /**
   * Offers `step`, with the services of the fiber that offers it, and returns where its result goes. Once the loop
   * has ended, the call is interrupted, or waits for ever when `quiet`. `offered` runs in the thunk of the offer, and
   * only when the step is offered.
   */
  submit: <A, RA>(
    step: Effect.Effect<A, never, RA>,
    options?: Readonly<{ offered?: () => void; quiet?: boolean }>,
  ) => Effect.Effect<Deferred.Deferred<A>, never, RA>
  /** Offers `step` and waits for its result. */
  ask: <A, RA>(step: Effect.Effect<A, never, RA>) => Effect.Effect<A, never, RA>
  /** Marks the end: from then on the loop is offered nothing more. To be called in the thunk that decides it. */
  end: () => void
  /** Whether the end is marked, to be read in the thunk of what it guards. */
  ended: () => boolean
  /** Waits until the loop has done what it was offered before. */
  finish: Effect.Effect<void>
  /** Stops the loop, its step under way included, and interrupts the result of every step not done. */
  stop: Effect.Effect<void>
}>

// A step, with the services of the fiber that asked for it, and where its result goes.
type Request = Readonly<{ step: Effect.Effect<unknown>; done: Deferred.Deferred<unknown> }>

/** Forks the loop in `forks`; each step runs as `wrap` makes it. */
export const make = Effect.fnUntraced(function*(
  forks: Scope.Scope,
  wrap: (step: Effect.Effect<unknown>) => Effect.Effect<unknown>,
) {
  const requests = yield* Queue.unbounded<Request>()
  const undelivered = new Set<Deferred.Deferred<unknown>>()
  let ended = false
  const loop = yield* Queue.take(requests).pipe(
    Effect.flatMap(({ step, done }) =>
      Effect.flatMap(Effect.exit(wrap(step)), (exit) =>
        Effect.andThen(Deferred.done(done, exit), Effect.sync(() => undelivered.delete(done))))
    ),
    Effect.forever,
    Effect.forkIn(forks),
  )
  // The check and the offer are one thunk, so that nothing is offered once the end is marked, and `offered` is in it
  // too.
  const submit = <A, RA>(
    step: Effect.Effect<A, never, RA>,
    { offered, quiet = false }: Readonly<{ offered?: () => void; quiet?: boolean }> = {},
  ) =>
    Effect.flatMap(Effect.context<RA>(), (context) =>
      Effect.flatMap(Deferred.make<unknown>(), (done) =>
        Effect.suspend(() => {
          undelivered.add(done)
          if (!ended && Queue.offerUnsafe(requests, { step: Effect.provideContext(step, context), done })) {
            offered?.()
            return Effect.succeed(done as Deferred.Deferred<A>)
          }
          undelivered.delete(done)
          return quiet ? Effect.never : Effect.interrupt
        })))
  // The queue gives its items in order, so the loop has done them all once it has done this one.
  const finish = Effect.flatMap(Deferred.make<unknown>(), (done) =>
    Effect.andThen(Queue.offer(requests, { step: Effect.void, done }), Deferred.await(done)))
  const stop = Effect.gen(function*() {
    yield* Fiber.interrupt(loop)
    yield* Queue.shutdown(requests)
    yield* Effect.forEach(undelivered, Deferred.interrupt, { discard: true })
  })
  return {
    submit,
    ask: <A, RA>(step: Effect.Effect<A, never, RA>) => Effect.flatMap(submit(step), Deferred.await),
    end: () => {
      ended = true
    },
    ended: () => ended,
    finish,
    stop,
  } satisfies Loop as Loop
})
