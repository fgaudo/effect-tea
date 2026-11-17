import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Context from 'effect/Context'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Opt from 'effect/Option'
import * as Pull from 'effect/Pull'
import type * as Scope from 'effect/Scope'
import * as Tracer from 'effect/Tracer'
import * as Core from './core.ts'
import type { DefectSite } from './defect.ts'
import type { Subscription } from './subscription.ts'

// What the run and the testing tools share that has effects, beside what they share as data (`core.ts`): how a fiber
// of the program is stopped, where its defects die and are recorded, how a subscription runs, and what its fibers see
// of the span of whoever runs them. The shells, `engine.ts` with `run.ts` and `src/testing/`, each have a loop of
// their own (`docs/records/shared-core.md`).

/**
 * Interrupts `fiber` as the current fiber does, with a mark of its own (`Core.Stopped`), and waits for it to end, its
 * release included: how the run stops each fiber of the program, so that `diesIn` tells this interruption from one the
 * program makes with the same fiber id.
 */
export const stopping = <A, E>(fiber: Fiber.Fiber<A, E>): Effect.Effect<void> =>
  Effect.flatMap(Effect.fiberId, (id) => Fiber.interruptAs(fiber, id, Context.make(Core.Stopped, {})))

/**
 * Where a defect happened is known only where it is caught: the run dies with it, and with where, and leaves
 * reporting it to whoever runs the program. Every defect of the cause is wrapped (`wrapDefects`), and a
 * self-interruption, or a failure the types rule out, is a defect too (`otherwiseDefect`). An interruption by the
 * run, or by whoever runs it, is never taken for one: the fiber is asked, where it is uninterruptible, which
 * interruptions it received, and those are kept as they are. An effect that interrupts itself as the run interrupts
 * it ends with both in its cause (Effect adds what the fiber received to a failure that skips its handlers), and its
 * own is still a defect, as a defect would be. The defects are wrapped there too, so that those of an interrupted
 * effect are: what a subscription the run stopped dies with while it releases what it holds.
 */
// The details are made only when there is a defect to carry them: a message is described on every call otherwise.
export const diesIn =
  (
    where: DefectSite,
    details: () => Readonly<{ key?: unknown; on?: unknown }> = () => ({}),
    wrapped: (defect: unknown) => boolean = () => false,
  ) =>
  <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.uninterruptibleMask((restore) =>
      restore(self).pipe(
        Effect.catchCause((cause) =>
          Effect.exit(Effect.interruptible(Effect.void)).pipe(Effect.flatMap((received) => {
            const own = Core.otherwiseDefect(cause, Exit.isFailure(received) ? received.cause : Cause.empty)
            return Effect.failCause(Cause.hasDies(own) ? Core.wrapDefects(own, where, details(), wrapped) : own)
          }))
        ),
      )
    )

/**
 * `Effect.scoped`, for a fiber of the run with a scope of its own, whose defects die in `where`: what `self` dies of
 * is recorded as it dies, before its scope releases what it holds, and what the release dies of as it ends. A
 * defect is in the order it happened, though the release of what died first lets another fiber die before it ends.
 * What `self` died of is told from what the release dies of by what this fiber kept of it, never by the register: a
 * release may die with a defect another fiber recorded, handed to the program by whoever runs it, and that is a
 * defect of its own.
 */
export const scopedIn =
  (deaths: Deaths, where: DefectSite, details?: () => Readonly<{ key?: unknown; on?: unknown }>) =>
  <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, Exclude<R, Scope.Scope>> =>
    Effect.suspend(() => {
      let own: Cause.Cause<unknown> = Cause.empty
      return Effect.scoped(self.pipe(
        diesIn(where, details),
        Effect.onExit((exit) =>
          Effect.sync(() => {
            if (Exit.isFailure(exit)) own = exit.cause
          })
        ),
        deaths.recorded,
      )).pipe(
        diesIn(
          where,
          details,
          (defect) => own.reasons.some((reason) => Cause.isDieReason(reason) && reason.defect === defect),
        ),
        deaths.recorded,
      )
    })

/**
 * Runs a subscription, sending each of its messages, in the scope of the fiber that runs it, and returns its last
 * message: what the channel adds to that scope is released as it closes, after `scopedIn` has recorded what the
 * subscription died of. `Channel.runForEach` would run the channel in a scope it makes and closes first, so that a
 * defect would wait for that release, while the loop goes on applying messages.
 */
export const runSubscription = <Message, R, RS>(
  subscription: Subscription<Message, R>,
  send: (message: Message) => Effect.Effect<void, never, RS>,
): Effect.Effect<Message, never, R | RS | Scope.Scope> =>
  Channel.toPull(subscription).pipe(
    // No yield of its own after each message, which made a pull of messages taken one by one three times slower: the
    // budget of operations of the runtime still yields the fiber (`Scheduler.MaxOpsBeforeYield`), and no invariant
    // rests on either.
    Effect.flatMap((pull) => Effect.forever(Effect.flatMap(pull, send), { disableYield: true })),
    Pull.catchDone(Effect.succeed),
  )

/**
 * Where the fibers of a run, or of a rehearsal, record what they die of, as they end, however they end: nothing is
 * lost to a `join` that nobody awaits any more, or to a `FiberSet` or a `FiberMap` that discards the exits of the
 * fibers it interrupts as it closes. Each defect is kept once, by its identity, in the order the fibers died: a
 * fiber that joins one that died dies of the same defect.
 */
export interface Deaths {
  /** Records the defects that `self` dies of, those `keeps` accepts, however it ends. */
  readonly recorded: <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  /** Succeeds once a defect has been recorded. */
  readonly died: Effect.Effect<void>
  /** The defects recorded so far, in the order they died. */
  readonly all: () => ReadonlyArray<Cause.Die>
  /** Whether a defect has been recorded. */
  readonly dead: () => boolean
  /** Whether `defect` has been recorded, by its identity, never by `Equal`. */
  readonly has: (defect: unknown) => boolean
  /** Dies with the defects recorded since it last ran, in the order they died; succeeds when there is none. */
  readonly report: Effect.Effect<void>
}

export const makeDeaths = Effect.fnUntraced(function*(keeps: (defect: unknown) => boolean) {
  let register = Core.noDeaths
  const died = yield* Deferred.make<void>()
  return {
    recorded: (self) =>
      Effect.onExit(self, (exit) =>
        Effect.suspend(() => {
          if (Exit.isSuccess(exit)) return Effect.void
          const before = register
          register = Core.record(register, exit.cause, keeps)
          return register !== before ? Deferred.succeed(died, undefined) : Effect.void
        })),
    died: Deferred.await(died),
    all: () => register.deaths,
    dead: () => register.deaths.length > 0,
    has: (defect) => Core.hasDied(register, defect),
    report: Effect.suspend(() => {
      const [dies, after] = Core.report(register)
      register = after
      return Opt.match(dies, { onNone: () => Effect.void, onSome: Effect.failCause })
    }),
  } satisfies Deaths
})

/**
 * What the fibers of a run get from the context of whoever ran it: the same, but for its span, seen by them as
 * an external one. Every log is also an event of the current span, kept in memory until the span is exported:
 * a fiber that lives as long as the run (the loop, a subscription, the renderer), or one of its many
 * commands, would add to it for as long as the run lasts. An external span takes no events, and the spans
 * that commands and subscriptions open (`Effect.fn`) are still its children in the trace.
 */
export const withExternalSpan = <R>(context: Context.Context<R>): Context.Context<R> => {
  const span = Context.getOrUndefined(context, Tracer.ParentSpan)
  if (span === undefined || span._tag === 'ExternalSpan') return context
  const { spanId, traceId, sampled } = span
  return Context.add(context, Tracer.ParentSpan, Tracer.externalSpan({ spanId, traceId, sampled }))
}
