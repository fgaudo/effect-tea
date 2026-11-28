import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Opt from "effect/Option"
import * as Pull from "effect/Pull"
import * as Scope from "effect/Scope"
import * as Tracer from "effect/Tracer"
import * as Core from "./core.ts"
import type { DefectSite } from "./defect.ts"
import type { Subscription } from "./subscription.ts"

// What the run and the testing tools share that has effects, beside what they share as data (`core.ts`): how a fiber
// of the program is stopped, where its defects die and are recorded, how a subscription runs, and what its fibers see
// of the span of whoever runs them. The shells, `engine.ts` with `run.ts` and `src/testing/`, each run the effects of
// a step in a fiber of their own (`docs/records/shared-core.md`).

/**
 * Interrupts `fiber` as the current fiber does, with a mark of the run made for this stop, which names `fiber` and
 * the fiber that stops it (`Core.Stopped`), and waits for it to end, its release included: how the run stops each
 * fiber of the program, so that `diesIn` tells this interruption from one the program makes, with the same fiber id
 * too, and from the stop of another fiber.
 */
export const stopping = <A, E>(fiber: Fiber.Fiber<A, E>): Effect.Effect<void> =>
  Effect.flatMap(Effect.fiberId, (id) => Fiber.interruptAs(fiber, id, Context.make(Core.Stopped, { fiber, by: id })))

/** What a defect of a fiber of the run says besides where it happened: the key of a subscription's, or nothing. */
export type Details = Readonly<{ key?: unknown }>

/**
 * Where a defect happened is known only where it is caught: the run dies with it, and with where, and leaves
 * reporting it to whoever runs the program. Every defect of the cause is wrapped (`wrapDefects`), and a
 * self-interruption, or a failure the types rule out, is a defect too (`otherwiseDefect`). The fiber is one the run
 * forks, which only the run stops: an interruption is the run's stop of it only with the mark that names it and the
 * fiber that stopped it, and is kept as it is, and any other is the program's, by whatever fiber. An effect that
 * interrupts itself as the run stops it ends with both in its cause (Effect adds what the fiber received to a failure
 * that skips its handlers), and its own is still a defect, as a defect would be. The defects are wrapped there too, so
 * that those of an interrupted effect are: what a subscription the run stopped dies with while it releases what it
 * holds.
 */
// The details are data, a key or nothing, so that saying where a defect happened throws nothing.
const diesIn = (
  where: DefectSite,
  details: Details = {},
  wrapped: (defect: unknown) => boolean = () => false
) =>
<A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.uninterruptibleMask((restore) =>
    restore(self).pipe(Effect.catchCause((cause) => dying(cause, where, details, wrapped)))
  )

/**
 * The root of a fiber the run forks: one that ends with interruptions only, none of them the run's stop of it, was
 * interrupted by the program, by whatever fiber, and dies in `where`. Only the run stops such a fiber, with its
 * mark, and before anything else could: a fiber forked with `FiberSet.run` or `FiberMap.run` is no child of the fiber
 * that forks it, and the sets close only after the end has stopped their fibers. So it holds where `scopedIn` cannot,
 * which takes the same interruption for a defect while the fiber's effect runs and as its scope releases: one made once
 * `scopedIn` has returned, before the answer or the last message is sent. A cause with a defect is the fiber's death
 * already, recorded by `scopedIn`, which an interruption beside it, as Effect adds what the fiber received, does not
 * change.
 */
export const rootedIn =
  (where: DefectSite, details: Details = {}) => <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.uninterruptibleMask((restore) =>
      restore(self).pipe(
        Effect.catchCauseIf(Cause.hasInterruptsOnly, (cause) => dying(cause, where, details, () => false))
      )
    )

// What `cause` makes the fiber die of in `where`: the fiber is asked nothing of what it received, since the mark of a
// stop names the fiber it stops, and the cause is read against the fiber that runs this.
const dying = <E>(
  cause: Cause.Cause<E>,
  where: DefectSite,
  details: Details,
  wrapped: (defect: unknown) => boolean
): Effect.Effect<never, E> =>
  Effect.withFiber((fiber) => {
    const own = Core.otherwiseDefect(cause, fiber)
    return Effect.failCause(Cause.hasDies(own) ? Core.wrapDefects(own, where, details, wrapped) : own)
  })

/**
 * A scope of its own, for a fiber of the run, whose defects die in `where`: what `self` dies of is recorded as it
 * dies, before its scope releases what it holds, and what the release dies of as it ends. The fiber is one the run
 * forks, so an interruption that is not the run's stop of it is a defect too (`diesIn`), by another fiber of the
 * program as by itself, recorded before the release: from it on, the run applies no message. A defect is in the order
 * it happened, though the release of what died first lets another fiber die before it ends. What `self` died of is told
 * from what the release dies of by what this fiber kept of it, never by the register: a release may die with a defect
 * another fiber recorded, handed to the program by whoever runs it, and that is a defect of its own.
 */
// The scope is closed here, not by `Effect.scoped`, which joins what the effect ended with and what the release died of
// with `Cause.combine`: that keeps one of two defects equal by `Equal`, before the register sees them. What the close
// dies of is taken as it is (`docs/premises.md`), and joined by `Core.released`.
export const scopedIn = (
  deaths: Deaths,
  where: DefectSite,
  details?: Details
) =>
<A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, Exclude<R, Scope.Scope>> =>
  Effect.uninterruptibleMask((restore) =>
    Effect.flatMap(
      Scope.make(),
      (scope) =>
        Effect.exit(
          restore(self.pipe(diesIn(where, details), deaths.recorded, Scope.provide(scope)))
        ).pipe(
          Effect.flatMap((exit) => {
            const own: Cause.Cause<E> = Exit.isFailure(exit) ? exit.cause : Cause.empty
            return Scope.close(scope, exit).pipe(
              diesIn(
                where,
                details,
                (defect) => own.reasons.some((reason) => Cause.isDieReason(reason) && reason.defect === defect)
              ),
              deaths.recorded,
              Effect.exit,
              Effect.flatMap((closed) =>
                Exit.isSuccess(closed) ? exit : Effect.failCause(Core.released(own, closed.cause))
              )
            )
          })
        )
    )
  )

/**
 * Runs a subscription, sending each of its messages, in the scope of the fiber that runs it, and returns its last
 * message: what the channel adds to that scope is released as it closes, after `scopedIn` has recorded what the
 * subscription died of. `Channel.runForEach` would run the channel in a scope it makes and closes first, so that a
 * defect would wait for that release, while the run goes on applying messages.
 */
const runSubscription = <Message, R, RSend>(
  subscription: Subscription<Message, R>,
  send: (message: Message) => Effect.Effect<void, never, RSend>
): Effect.Effect<Message, never, R | RSend | Scope.Scope> =>
  Channel.toPull(subscription).pipe(
    // No yield of its own after each message, which made a pull of messages taken one by one three times slower: the
    // budget of operations of the runtime still yields the fiber (`Scheduler.MaxOpsBeforeYield`), and no invariant
    // rests on either.
    Effect.flatMap((pull) => Effect.forever(Effect.flatMap(pull, send), { disableYield: true })),
    Pull.catchDone(Effect.succeed)
  )

/**
 * What the fiber of a start runs, in the run and in a testing tool alike: the subscription `listen` makes, made inside
 * the fiber, so that what it throws is the subscription's, run in a scope of its own whose defects die in
 * `'subscription'` with the key (`scopedIn`), each message given to `send` as it comes, and the last to `last` once the
 * scope has closed. The tool decides only what `listen`, `send` and `last` do besides.
 */
export const startFiber = <Message, R, RSend, RL>(
  deaths: Deaths,
  key: unknown,
  listen: () => Subscription<Message, R>,
  send: (message: Message) => Effect.Effect<void, never, RSend>,
  last: (message: Message) => Effect.Effect<void, never, RL>
): Effect.Effect<void, never, Exclude<R | RSend, Scope.Scope> | RL> =>
  Effect.suspend(() => runSubscription(listen(), send)).pipe(
    scopedIn(deaths, "subscription", { key }),
    Effect.flatMap(last)
  )

/**
 * What the fiber of a command runs, in the run and in a testing tool alike, of the effect `runCommand` returned: in a
 * scope of its own whose defects die in `'command'` (`scopedIn`), and its answer given to `send` once the scope has
 * closed, so that `update` never learns of a command whose resources are still open. The tool decides only when the
 * effect is made, and what `send` does besides.
 */
export const commandFiber = <Message, R, RSend>(
  deaths: Deaths,
  effect: Effect.Effect<Opt.Option<Message>, never, R>,
  send: (message: Message) => Effect.Effect<void, never, RSend>
): Effect.Effect<void, never, Exclude<R, Scope.Scope> | RSend> =>
  effect.pipe(scopedIn(deaths, "command"), Effect.flatMap(Opt.match({ onNone: () => Effect.void, onSome: send })))

/**
 * Where the fibers of a run, or of a rehearsal, record what they die of, as they end, however they end: nothing is
 * lost to a `join` that nobody awaits any more, or to a `FiberSet` or a `FiberMap` that discards the exits of the
 * fibers it interrupts as it closes. Each defect is kept once, by its identity, in the order the fibers died: a
 * fiber that joins one that died dies of the same defect.
 */
export interface Deaths {
  /** Records the defects that `self` dies of, those `keeps` accepts, however it ends. */
  readonly recorded: <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  /**
   * Records the defects of `cause` that `keeps` accepts, at once, in the caller's stack, as `recorded` does when an
   * effect ends: for what a function of the program throws where plain code calls it, outside any fiber of the run.
   */
  readonly record: (cause: Cause.Cause<unknown>) => void
  /**
   * Succeeds once a defect has been recorded, on the stack that records it, a step's too: what must not wake inside a
   * step waits on the engine's `died`.
   */
  readonly died: Effect.Effect<void>
  /** The defects recorded so far, in the order they died. */
  readonly all: () => ReadonlyArray<Cause.Die>
  /** Whether a defect has been recorded. */
  readonly dead: () => boolean
  /** Whether `defect` has been recorded, by its identity, never by `Equal`. */
  readonly has: (defect: unknown) => boolean
}

// Plain code: a program is started, and its register made, outside any fiber.
export const makeDeaths = (keeps: (defect: unknown) => boolean): Deaths => {
  let register = Core.noDeaths
  const died = Deferred.makeUnsafe<void>()
  const record = (cause: Cause.Cause<unknown>) => {
    const before = register
    register = Core.record(register, cause, keeps)
    if (register !== before) Deferred.doneUnsafe(died, Exit.void)
  }
  return {
    recorded: (self) =>
      Effect.onExit(self, (exit) =>
        Effect.sync(() => {
          if (Exit.isFailure(exit)) record(exit.cause)
        })),
    record,
    died: Deferred.await(died),
    all: () => register,
    dead: () => register.length > 0,
    has: (defect) => Core.hasDied(register, defect)
  }
}

/**
 * What the fibers of a run get from the context of whoever ran it: the same, but for its span, seen by them as an
 * external one. Every log is also an event of the current span, kept in memory until the span is exported: a fiber that
 * lives as long as the run (the fiber of effects, a subscription), or one of its many commands, would add to it for as
 * long as the run lasts. An external span takes no events, and the spans that commands and subscriptions open
 * (`Effect.fn`) are still its children in the trace.
 */
export const withExternalSpan = <R>(context: Context.Context<R>): Context.Context<R> => {
  const span = Context.getOrUndefined(context, Tracer.ParentSpan)
  if (span === undefined || span._tag === "ExternalSpan") return context
  const { spanId, traceId, sampled } = span
  return Context.add(context, Tracer.ParentSpan, Tracer.externalSpan({ spanId, traceId, sampled }))
}
