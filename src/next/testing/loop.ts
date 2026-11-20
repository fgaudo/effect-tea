// The loop of `rehearse` over the engine of `docs/records/synchronous-dispatch.md`, written beside `src/testing/loop.ts`
// until the swap of its stage 4: the fiber of effects of a rehearsal. A call applies its message in a thunk of its own,
// and offers the loop the job of its step, in that thunk.
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import type * as Scope from "effect/Scope"
import { stopping } from "../../shell.ts"

/**
 * One fiber that runs the jobs it is offered one at a time, in the order they were offered, as the engine's fiber of
 * effects takes the jobs of its states: whoever offers a job only waits for its completion, so that an interruption of
 * whoever asked never splits a job. It knows nothing of the program: `rehearse` gives it its jobs.
 */
export type Loop = Readonly<{
  /**
   * Runs `decide` in one thunk with the check of the end: once the end is marked, the call is interrupted, or waits for
   * ever when `quiet`, and `decide` is not called. `decide` may offer jobs with `offer`, in the same thunk.
   */
  submit: <A, E, R>(
    decide: () => Effect.Effect<A, E, R>,
    options?: Readonly<{ quiet?: boolean }>
  ) => Effect.Effect<A, E, R>
  /**
   * Offers `job`, whose completion `done` is: to be called only in a thunk that has checked the end, `submit`'s or a
   * job's own. Its services are those it is given.
   */
  offer: (job: Effect.Effect<void>, done: Deferred.Deferred<void>) => void
  /** Marks the end: from then on the loop is offered nothing more. To be called in the thunk that decides it. */
  end: () => void
  /** Whether the end is marked, to be read in the thunk of what it guards. */
  ended: () => boolean
  /** Waits until the loop has done what it was offered before. */
  finish: Effect.Effect<void>
  /**
   * Stops the loop, its job under way included, and interrupts the completion of every job not done. Follows `end`,
   * which alone keeps anything from being offered afterwards.
   */
  stop: Effect.Effect<void>
}>

// A job, with the services it was given, and its completion.
type Request = Readonly<{ job: Effect.Effect<void>; done: Deferred.Deferred<void> }>

/** Forks the loop in `forks`; each job runs as `wrap` makes it. */
export const make = Effect.fnUntraced(function*(
  forks: Scope.Scope,
  wrap: (job: Effect.Effect<void>) => Effect.Effect<void>
) {
  const requests = yield* Queue.unbounded<Request>()
  const undelivered = new Set<Deferred.Deferred<void>>()
  let ended = false
  const loop = yield* Queue.take(requests).pipe(
    Effect.flatMap(({ job, done }) =>
      Effect.flatMap(
        Effect.exit(wrap(job)),
        (exit) => Effect.andThen(Deferred.done(done, exit), Effect.sync(() => undelivered.delete(done)))
      )
    ),
    Effect.forever,
    Effect.forkIn(forks)
  )
  // The check and what it guards are one thunk, so that nothing is decided, nor offered, once the end is marked.
  const submit = <A, E, R>(
    decide: () => Effect.Effect<A, E, R>,
    { quiet = false }: Readonly<{ quiet?: boolean }> = {}
  ) => Effect.suspend(() => ended ? (quiet ? Effect.never : Effect.interrupt) : decide())
  const offer = (job: Effect.Effect<void>, done: Deferred.Deferred<void>) => {
    undelivered.add(done)
    Queue.offerUnsafe(requests, { job, done })
  }
  // The queue gives its items in order, so the loop has done them all once it has done this one.
  const finish = Effect.flatMap(
    Deferred.make<void>(),
    (done) => Effect.andThen(Queue.offer(requests, { job: Effect.void, done }), Deferred.await(done))
  )
  // Stopped as the run stops each fiber of the program, with its mark.
  const stop = Effect.gen(function*() {
    yield* stopping(loop)
    yield* Effect.forEach(undelivered, Deferred.interrupt, { discard: true })
  })
  return {
    submit,
    offer,
    end: () => {
      ended = true
    },
    ended: () => ended,
    finish,
    stop
  } satisfies Loop as Loop
})
