// `rehearse` models both halves of the engine: each call that applies a message applies it in one
// synchronous thunk, in the fiber that makes the call, and offers the job of its step to the rehearsal's loop, its fiber
// of effects, which stops the subscriptions the step stopped and owes its commands.
import * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as FiberMap from "effect/FiberMap"
import * as FiberSet from "effect/FiberSet"
import * as HashMap from "effect/HashMap"
import * as Inspectable from "effect/Inspectable"
import * as Opt from "effect/Option"
import * as Queue from "effect/Queue"
import * as Scope from "effect/Scope"
import * as Core from "../core.ts"
import { ProgramDefect } from "../defect.ts"
import { recordThrown } from "../engine.ts"
import type { Written } from "../input.ts"
import { describeByTag } from "../log.ts"
import { type AnyProgram, type FlagsOption, runCommandOf, type Shape, startOf } from "../program.ts"
import { diesIn, makeDeaths, rootedIn, runSubscription, scopedIn, stopping as stopFiber } from "../shell.ts"
import type { Subscription } from "../subscription.ts"
import * as Ledger from "./ledger.ts"
import * as Loop from "./loop.ts"

/**
 * A rehearsal of a program, which its scenario plays step by step.
 *
 * Nothing reaches `update` by itself: each message comes through one of these calls.
 *
 * A program without commands or events leaves `Command` or `Event` as `never`. `RC` is the services its commands need,
 * and `RS` those its subscriptions need. `run` and `runAll` ask for `RC`, and `hearNext` for `RS`.
 *
 * - A call applies its message at once. It returns once what the message stops has released what it held, and its
 *   commands are pending. A message sent meanwhile, from another fiber of the test's, applies at once too.
 * - A call that fails the test fails the fiber that made it. Join a call forked from the scenario, or its failure is
 *   lost.
 * - A fiber detached from the scenario (`Effect.forkDetach`) is beyond the rehearsal's reach.
 * - After a defect of the program, `send`, `run`, `runAll`, `hear`, `hearNext` and `model` fail with the defect.
 *   `state`, `pending`, `events` and `ignored` stay readable.
 *
 * @example
 * ```ts
 * yield* rehearsal.runAll
 * expect(yield* rehearsal.ignored).toEqual([])
 * ```
 *
 * @see The guide, "Testing tools", "Nothing reaches `update` by itself".
 * @see The guide, "Testing tools", "A message is applied at once".
 * @see The guide, "Testing tools", "`rehearse` asks for the services of what the test runs".
 * @see The guide, "Testing tools", "Messages that arrive together".
 * @see The guide, "Testing tools", "Fibers the test forks or detaches".
 * @see The guide, "Testing tools", "After a defect of the program".
 */
export type Rehearsal<State, Model, Message, Command = never, Event = never, RC = never, RS = never> = {
  /** The current state. */
  readonly state: Effect.Effect<State>
  /** The model of the current state. */
  readonly model: Effect.Effect<Model>
  /**
   * Applies the message `select` finds on the current model, as a control drawn from it would send it.
   *
   * It sends only what the current model shows. It fails the test when `select` finds nothing, or when `update`
   * rejects the message.
   *
   * @see The guide, "Testing tools", "`rehearse` acts through what the current model shows".
   * @see The guide, "Testing tools", "What fails the test".
   */
  readonly send: (select: (model: Model) => Opt.Option<Message>) => Effect.Effect<void>
  /**
   * The commands `update` started that have not run yet, oldest first. A step's commands are pending once what it
   * stops has released what it held.
   *
   * @see The guide, "Testing tools", "A message is applied at once".
   */
  readonly pending: Effect.Effect<ReadonlyArray<Command>>
  /**
   * Runs a pending command that `select` matches, applies its message, and returns the command.
   *
   * - It runs the oldest pending command that `select` matches. It fails the test when `select` matches nothing.
   * - The command runs through the program's `runCommand`, with the services provided, in a scope of its own.
   * - An answer that `update` rejects is listed in `ignored`.
   * - The test fails when this `run` is interrupted before the command answers: a command cannot be cancelled.
   * - After a defect of the program, `run` fails with the defect, also when it was already waiting for its command.
   *
   * @see The guide, "Testing tools", "Each command waits until the test runs it".
   * @see The guide, "Testing tools", "What fails the test".
   * @see The guide, "Testing tools", "Commands at the end".
   * @see The guide, "Testing tools", "After a defect of the program".
   */
  readonly run: (select: (command: Command) => boolean) => Effect.Effect<Command, never, Exclude<RC, Scope.Scope>>
  /**
   * Runs the pending commands, and those they start, until none is left.
   *
   * It runs the oldest pending command again and again, as `run` does, until none is left. An answer that `update`
   * rejects is listed in `ignored`.
   *
   * @see The guide, "Testing tools", "Each command waits until the test runs it".
   * @see The guide, "Testing tools", "Commands at the end".
   */
  readonly runAll: Effect.Effect<void, never, Exclude<RC, Scope.Scope>>
  /**
   * Applies a message as the subscription under `key` would send it, without running the subscription.
   *
   * - The test answers for what it says was heard, and for whether the subscription had ended.
   * - It fails the test when the key is not in the state. Keys compare by value, as the run compares them.
   * - A key that has just appeared is heard once its subscription would have started: once what the message before it
   *   stopped has released what it held.
   * - It fails the test on a key whose subscription `hearNext` runs, until the key goes away and comes back.
   * - After the subscription's end value, `hear` does not hear the key until the key goes away and comes back.
   * - A message that `update` rejects is listed in `ignored`.
   *
   * @param key - The subscription's key, as the program lists it. A child's key is under the child's name, as its
   * parent lists it: `['Clock', 'ticks']`, with the id for children by id.
   * @param message - What the subscription sends: any message of the program but a write into an input, the program's
   * or a child's, which only a view sends.
   *
   * @see The guide, "Testing tools", "A subscription's message is one the test says was heard".
   * @see The guide, "Testing tools", "How a subscription is heard".
   * @see The guide, "Testing tools", "What fails the test".
   */
  readonly hear: (key: unknown, message: Heard<Message>) => Effect.Effect<void>
  /**
   * Hears the next message of the subscription under `key`, applies it as `hear` would, and returns it.
   *
   * - The first call on a key starts its subscription, with the services provided, in a scope of its own, once what
   *   the messages before it stopped has released what it held. The subscription runs for as long as the key stays in
   *   the state.
   * - Each call waits for the subscription's next message. The last message is the subscription's end value. After
   *   it, the key is not heard until the key goes away and comes back. A `hearNext` that was waiting at the same time
   *   as the one that heard the end fails the test.
   * - It fails the test when the key is not in the state, or when `hear` has played the key's current start.
   * - A key that goes away interrupts its subscription. A `hearNext` still waiting for a message of that subscription,
   *   or for its start, fails the test.
   * - After a defect of the program, `hearNext` fails with the defect, also when it was already waiting.
   * - Under a `TestClock`, move the clock while `hearNext` waits: race the call against `TestClock.adjust` in a loop.
   *   Time moved before the subscription starts to sleep does not count.
   *
   * @param key - The subscription's key, as `hear` takes it.
   *
   * @see The guide, "Testing tools", "A subscription's message is one the test says was heard".
   * @see The guide, "Testing tools", "How a subscription is heard".
   * @see The guide, "Testing tools", "What fails the test".
   * @see The guide, "Testing tools", "After a defect of the program".
   */
  readonly hearNext: (key: unknown) => Effect.Effect<Message, never, Exclude<RS, Scope.Scope>>
  /** The events `update` raised for the program's parent, in order. */
  readonly events: Effect.Effect<ReadonlyArray<Event>>
  /**
   * The messages of commands and subscriptions that `update` rejected, in order: an answer that came when the state
   * had moved on, a subscription's message about something no longer there.
   */
  readonly ignored: Effect.Effect<ReadonlyArray<Message>>
}

/**
 * What a subscription may send of a program's `Message`: all of it but a write into an input, the program's or a
 * child's, `{ _tag: <input>, message: { _tag: 'Written', … } }` however deep, which only a view sends.
 */
type Heard<Message> = 0 extends 1 & Message ? Message
  : Message extends Readonly<{ _tag: string; message: infer Inner }> ? [Inner] extends [Unwritten<Inner>] ? Message
    : [Unwritten<Inner>] extends [never] ? never
    : Omit<Message, "message"> & Readonly<{ message: Unwritten<Inner> }>
  : Message

/** What a parent's wrapped message may hold, as a subscription sends it: no write, at that level or below. */
type Unwritten<Inner> = Inner extends Written<unknown> ? never : Heard<Inner>

// A call of `hearNext`, by its identity, and what the loop tells it: the message it heard, once its job is done, or none
// once its start has ended.
type Call<Message> = Readonly<{ key: unknown; heard: Deferred.Deferred<Opt.Option<Message>> }>

// What the ledger holds of a start nobody hears yet: the subscription listed when its key appeared, and the completion
// of the job that starts it, which `hear` waits for. A start of the first state has no job, and one completed at once.
type Unheard<Message, RS> = Readonly<{ subscription: Subscription<Message, RS>; begun: Deferred.Deferred<void> }>

// What `hearNext` holds of a subscription it started: the queue of its asks. Its fiber is kept by its start, apart, and
// stopped by the job of the step that stops the start, as the engine stops its subscriptions.
type Asks = Queue.Queue<void>

type Current<State, Message, Event> = Readonly<{
  state: State
  revision: Core.Revision
  events: ReadonlyArray<Event>
  ignored: ReadonlyArray<Message>
}>

// What a thunk that applied a message leaves to its call: the run had died, or it died there (`Dead`); a message the
// test sent and `update` rejected (`Rejected`); or the job offered, whose completion the call awaits (`Queued`).
type Outcome =
  | Readonly<{ _tag: "Dead" }>
  | Readonly<{ _tag: "Rejected" }>
  | Readonly<{ _tag: "Queued"; done: Opt.Option<Deferred.Deferred<void>> }>

// A call of `hearNext` that heard the message, with the calls told that its start has ended.
type Hearer<Message> = Readonly<{ call: Call<Message>; message: Message; told: ReadonlyArray<Call<Message>> }>

const deadOutcome: Outcome = { _tag: "Dead" }

const rejectedOutcome: Outcome = { _tag: "Rejected" }

// The rehearsal itself: `rehearse`, below, gives it its types (`Commanded`).
const rehearsing = Effect.fnUntraced(function*<
  State,
  Model,
  Message,
  Command = never,
  Event = never,
  RC = never,
  RS = never,
  A = unknown,
  E = never,
  RT = never,
  Flags = never
>(
  program: Shape<State, Model, Message, Command, RC, RS, Event, never, Flags>,
  scenario: (rehearsal: Rehearsal<State, Model, Message, Command, Event, RC, RS>) => Effect.Effect<A, E, RT>,
  ...[{ flags } = {}]: [Flags] extends [never] ? [options?: FlagsOption<never>]
    : [options: FlagsOption<NoInfer<Flags>>]
): Effect.fn.Return<A, E, RT> {
  const started = Core.init(yield* Effect.sync(() => startOf(program.init, flags)).pipe(diesIn("init")))
  type Now = Current<State, Message, Event>
  const runCommand = runCommandOf(program)
  const { subscriptions } = program
  // Each fiber of the rehearsal, and each thunk, records the defects of the program it dies of, as the engine's do: a
  // thunk, a command's fiber, a subscription's. The run dies of the first, so the rehearsal fails with them at its end,
  // and what the test asks for after the first fails with them, as nothing happens in a run that died. The tool's own
  // failures of a call (nothing to send, a control that does nothing) are the caller's alone, so only a
  // `ProgramDefect` is recorded.
  const register = yield* makeDeaths((defect) => defect instanceof ProgramDefect)
  const { recorded, all: deaths, dead } = register
  // Fails with the defects recorded so far, if any: else runs `effect`. It guards no call of the program: one that
  // must not follow a death has its own check, the only one, in the thunk that calls it, since the scheduler may
  // yield between this check and `effect`.
  const deadOr = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.suspend(() => {
      const dies = deaths()
      return Arr.isReadonlyArrayNonEmpty(dies) ? Effect.failCause(Cause.fromReasons<never>(dies)) : effect
    })
  // Calls the program where the call is decided, in the thunk that checks the register: what it throws is a defect of
  // the effect it would have returned, in the site and the scope that effect gets.
  const calling = <A, E, R>(call: () => Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
    try {
      return call()
    } catch (defect) {
      return Effect.die(defect)
    }
  }
  // A call that waits for a subscription or a command fails as soon as a fiber dies, whichever, as the run dies at
  // once: what it waits for would come in a run that died. One that waits for the loop waits for a release, which the
  // end of the rehearsal awaits all the same.
  const orDead = <A, E, R>(waiting: Effect.Effect<A, E, R>) =>
    Effect.raceFirst(waiting, Effect.andThen(register.died, deadOr(Effect.never)))
  // The keys of the current state, each with its start, as the engine keeps them (`Core.reconcile`), made true of each
  // state in the thunk that makes it. Keys are compared only in `subscriptions`, as in the run.
  let active: Core.Active<unknown> = Core.noneActive
  // The commands, and how each start is heard, by its generation. Written by every fiber of the test's and by the loop,
  // each time by one transition in one thunk.
  type LedgerOf = Ledger.Ledger<Command, Unheard<Message, RS>, Asks, Call<Message>, Message>
  let ledger: LedgerOf = Ledger.start(started.commands)
  const stoppedWhileWaiting = (key: unknown) =>
    new Error(
      `The subscription under ${Inspectable.toStringUnknown(key, 0)} was stopped while hearNext waited for its `
        + "message: its key went away, or the scenario ended"
    )
  // The calls still waiting on a start that was stopped would wait for ever: they fail, as a call made after the end
  // does. One told already hears nothing of it.
  const tellStopped = (calls: ReadonlyArray<Call<Message>>) =>
    Effect.forEach(calls, ({ key, heard }) => Deferred.die(heard, stoppedWhileWaiting(key)), { discard: true })
  // The first state's starts have no job: they run from the start.
  const begun = yield* Deferred.make<void>()
  yield* Deferred.succeed(begun, undefined)
  yield* Effect.sync(() => {
    const { fresh, active: next } = Core.reconcile(active, subscriptions(started.current.state))
    active = next
    ledger = Ledger.listened(
      ledger,
      [],
      fresh.map(([, subscription, generation]) => [generation, { subscription, begun }] as const)
    )[2]
  }).pipe(diesIn("subscriptions"))
  let now: Now = { ...started.current, events: [], ignored: [] }
  // There is no renderer: the model of each new state is made in the thunk that makes the state, as a renderer told of
  // every state that reads each one makes it, and a defect of `makeModel` is in `'render'` all the same.
  let shown: Model = yield* Effect.sync(() => program.makeModel(started.current.state)).pipe(diesIn("render"))
  // From its scope on, nothing interrupts the rehearsal but in its scenario: the scope and the loop forked in it are
  // one region with the end that closes and stops them, as `drive` forks its run, so that an interruption from outside
  // as it sets up meets the end too.
  return yield* Effect.uninterruptibleMask(Effect.fnUntraced(function*(restore) {
    // Where the loop is forked, and the commands and the subscriptions `hearNext` starts are kept, so that they outlive
    // the fiber of the test's that asked for them, as the run's fibers outlive whoever dispatched. Closed at the end,
    // however the rehearsal ends, once what it holds is stopped. Made once the program has started, so that a start
    // that dies leaves no scope open.
    const forks = yield* Scope.make()
    // The commands under way, kept as they are forked, so that the end stops them as the run does, with its mark,
    // before it closes the scope, which would interrupt them as the fiber that ends the rehearsal. Each gives what its
    // `run` waits for once it has answered.
    const commands = yield* FiberSet.make<Effect.Effect<void>, never>().pipe(Scope.provide(forks))
    // The subscriptions `hearNext` started, kept by their start, as the engine keeps its own: the job of the step that
    // stops a start stops its fiber, and the end stops those that still run, never by what the ledger says of them,
    // which forgets a start in the thunk that stops it.
    const listeners = yield* FiberMap.make<Core.Generation, void, never>().pipe(Scope.provide(forks))
    // The fiber of effects: it takes the jobs one at a time, in the order of the states, as the engine's does. A job of
    // a step applied before the first defect goes on whole: what must not follow a death checks the register in its own
    // thunk. Once the rehearsal has ended, what a fiber of the test's still running asks is refused, and the call is
    // interrupted: nothing would apply it.
    const loop = yield* Loop.make(forks, recorded)
    // What a step leaves to the fiber of effects, in the order the engine does it: the starts whose key went away,
    // stopped together and awaited, then the calls that waited on them told, then its commands owed, then, for a
    // message `hearNext` heard, the call told what it heard.
    const jobOf = (
      gone: ReadonlyArray<Core.Generation>,
      stopped: ReadonlyArray<Call<Message>>,
      owed: ReadonlyArray<Command>,
      hearer: Opt.Option<Hearer<Message>>
    ): Effect.Effect<void> =>
      Effect.forEach(
        gone,
        (generation) =>
          FiberMap.get(listeners, generation).pipe(Effect.flatMap(Opt.match({
            onNone: () => Effect.void,
            onSome: stopFiber
          }))),
        { concurrency: "unbounded", discard: true }
      ).pipe(
        Effect.andThen(tellStopped(stopped)),
        Effect.andThen(Effect.sync(() => {
          ledger = Ledger.owe(ledger, owed)
        })),
        Effect.andThen(Opt.match(hearer, {
          onNone: () => Effect.void,
          onSome: ({ call, message, told }) =>
            Effect.forEach(told, ({ heard }) => Deferred.succeed(heard, Opt.none()), { discard: true }).pipe(
              Effect.andThen(Deferred.succeed(call.heard, Opt.some(message)))
            )
        }))
      )
    // The pure half of a step, to be called in a thunk that has checked the end: the check of a death and of the
    // message's start, `update`, the new state, its keys and the ledger's hearings with them, its model, and last the
    // job, so that a fiber the offer wakes on this stack finds the step written whole. What the program throws is
    // recorded where it happened, and the step stops there, but for a defect of `makeModel`, after which it goes on.
    const apply = (
      source: Core.Source<unknown>,
      message: Message,
      rejected: "fail" | "list",
      hearer: Opt.Option<Hearer<Message>>
    ): Outcome => {
      const before = now
      let arrived: Core.Arrived<State, Command, Event>
      try {
        arrived = Core.arrive(program.update, before, active, source, message, dead)
      } catch (thrown) {
        recordThrown(register, "update", thrown, () => ({ on: describeByTag(message) }))
        return deadOutcome
      }
      const done = Deferred.makeUnsafe<void>()
      const queued = (job: Effect.Effect<void>): Outcome => {
        loop.offer(job, done)
        return { _tag: "Queued", done: Opt.some(done) }
      }
      switch (arrived._tag) {
        case "Dead":
          return deadOutcome
        // No call gives `arrive` a message whose start is no longer active: `hear` fails on a key gone from the
        // current state, and the ledger forgets a start in the thunk that stops it, so that `hearNext` hears nothing
        // more of it.
        case "Dropped":
          return { _tag: "Queued", done: Opt.none() }
        case "Ignored":
          if (rejected === "fail") return rejectedOutcome
          now = { ...before, ignored: [...before.ignored, message] }
          return queued(jobOf([], [], [], hearer))
        case "Applied": {
          const { next, changed, commands: owed, events } = arrived
          now = { ...before, ...next, events: [...before.events, ...events] }
          if (!changed) return queued(jobOf([], [], owed, hearer))
          // Compared with the keys of the state before, as the run reconciles them: a state whose subscriptions are a
          // defect ends the run, and so does a key whose `Equal` throws against a key of the state before.
          let reconciled: Core.Reconciled<unknown, Subscription<Message, RS>>
          try {
            reconciled = Core.reconcile(active, subscriptions(next.state))
          } catch (thrown) {
            recordThrown(register, "subscriptions", thrown)
            return deadOutcome
          }
          const { gone, fresh, active: keys } = reconciled
          active = keys
          const generations = gone.map(([, generation]) => generation)
          const [, stopped, listening] = Ledger.listened(
            ledger,
            generations,
            fresh.map(([, subscription, generation]) => [generation, { subscription, begun: done }] as const)
          )
          ledger = listening
          // Recorded, never raised into the step, which goes on whole: what is asked after it fails with the defect.
          try {
            shown = program.makeModel(next.state)
          } catch (thrown) {
            recordThrown(register, "render", thrown)
          }
          return queued(jobOf(generations, stopped, owed, hearer))
        }
      }
    }
    // What the call that applied a message waits for: its job, or the defects, or its own failure.
    const outcomeOf = (outcome: Outcome, message: Message): Effect.Effect<void> => {
      switch (outcome._tag) {
        case "Dead":
          return deadOr(Effect.never)
        case "Rejected":
          return Effect.die(
            new Error(
              `update rejected ${
                String(describeByTag(message))
              }, which the model of the same state shows: a control that does nothing. A tap on a model drawn before is `
                + "a message applied to a later state: test it with applyAll, or with update itself."
            )
          )
        case "Queued":
          return Opt.match(outcome.done, { onNone: () => Effect.void, onSome: Deferred.await })
      }
    }
    // Selected on the model of the state it applies to, in the thunk that applies it.
    const send = (select: (model: Model) => Opt.Option<Message>) =>
      loop.submit(() =>
        Opt.match(select(shown), {
          onNone: () => Effect.die(new Error("The model does not show what the test sends", { cause: shown })),
          onSome: (message) => outcomeOf(apply(Core.fromDispatch, message, "fail", Opt.none()), message)
        })
      )
    // The program's keys are compared with the test's, by their `Equal`: a defect of theirs is in `subscriptions`, as
    // in the run. In a thunk: the key's start, or the effect the call ends with.
    const startUnder = (key: unknown): Core.Generation | Effect.Effect<never> => {
      try {
        const found = HashMap.get(active.keys, key)
        return Opt.isSome(found) ? found.value : Effect.die(nothingListensUnder(key))
      } catch (thrown) {
        recordThrown(register, "subscriptions", thrown)
        return deadOr(Effect.never)
      }
    }
    const untilItComesBack = "until its key goes away and comes back"
    const hasEnded = (key: unknown) =>
      Effect.die(
        new Error(
          `The subscription under ${
            Inspectable.toStringUnknown(key, 0)
          } has ended: it sends nothing ${untilItComesBack}`
        )
      )
    const runsUnderHearNext = (key: unknown) =>
      Effect.die(
        new Error(
          `The subscription under ${Inspectable.toStringUnknown(key, 0)} runs under hearNext: only it sends messages `
            + `under its key, ${untilItComesBack}`
        )
      )
    // In a thunk that has checked the end and found the start under the key in the current state: the start played,
    // unless `hearNext` runs it, and the message applied.
    const play = (key: unknown, generation: Core.Generation, message: Message): Effect.Effect<void> => {
      const scripted = Ledger.script(ledger, generation)
      switch (scripted._tag) {
        case "Opened":
          return runsUnderHearNext(key)
        case "Ended":
          return hasEnded(key)
        case "Scripted":
          ledger = scripted.ledger
          return outcomeOf(apply({ _tag: "Subscription", key, generation }, message, "list", Opt.none()), message)
      }
    }
    // In one thunk: the key looked up in the current state; a start whose job has not run yet waited for, and the key
    // looked up again after it, since it may have gone, or come back with another start, so that the start played is
    // always the current state's.
    const hear = (key: unknown, message: Message): Effect.Effect<void> =>
      loop.submit(() => {
        const generation = startUnder(key)
        if (typeof generation !== "number") return generation
        const hearing = ledger.hearings.get(generation)
        if (hearing?._tag === "Unheard" && !Deferred.isDoneUnsafe(hearing.subscription.begun)) {
          return Effect.andThen(Deferred.await(hearing.subscription.begun), hear(key, message))
        }
        return play(key, generation, message)
      })
    // In a thunk that has checked the end: while a call waits on the start and a message it sent is not heard, the
    // first call hears the first message, applied as `hear` would apply it, and told once its job is done; its last one
    // tells the calls still waiting that it has ended. A call interrupted once it is told is told all the same: what
    // the message applies, it applies whole.
    const hearHeld = (key: unknown, generation: Core.Generation) => {
      while (true) {
        const found = Ledger.hear(ledger, generation)
        if (Opt.isNone(found)) return
        const { call, sent: { message }, ended: told } = found.value
        ledger = found.value.ledger
        apply({ _tag: "Subscription", key, generation }, message, "list", Opt.some({ call, message, told }))
      }
    }
    // The subscription's own fiber gives what it sends, applied in its thunk at once when a call waits for it, as the
    // run's applies it as it is sent, and waits for the next ask. Refused once the rehearsal has ended, it waits
    // (`quiet`) for the end to stop it, since one that interrupts itself is a defect.
    const sends = (key: unknown, generation: Core.Generation, message: Message, last: boolean) =>
      loop.submit(() => {
        ledger = Ledger.send(ledger, generation, { message, last })
        hearHeld(key, generation)
        return Effect.void
      }, { quiet: true })
    // Started as the run starts a subscription, but held after each message until a `hearNext` asks for one: between
    // two of them, it waits where the run's would be sending its next message. Its last message follows the end of its
    // scope, as in the run. Kept by its start, so that the job that stops the start finds it.
    const listen = (key: unknown, generation: Core.Generation, subscription: Subscription<Message, RS>, asks: Asks) =>
      Queue.take(asks).pipe(
        Effect.andThen(
          runSubscription(
            subscription,
            (message: Message) => sends(key, generation, message, false).pipe(Effect.andThen(Queue.take(asks)))
          )
        ),
        scopedIn(register, "subscription", () => ({ key })),
        Effect.flatMap((last) => sends(key, generation, last, true)),
        Effect.asVoid,
        rootedIn("subscription", () => ({ key })),
        recorded,
        FiberMap.run(listeners, generation)
      )
    // The job of a call of `hearNext`, after the stops of every step before it, and so after the job that starts its
    // start. One thunk checks the end, the register and the start, and makes the call wait on it, a start it opens
    // included: a later step that stops the start finds the call waiting, and its job, after this one, finds the fiber.
    // A call that left before the loop took it starts nothing: the test no longer asks for it.
    const opening = (key: unknown, generation: Core.Generation, call: Call<Message>) =>
      Effect.flatMap(Queue.unbounded<void>(), (fresh) =>
        Effect.suspend(() => {
          if (loop.ended()) return Effect.void
          if (dead()) return deadOr(Effect.never)
          const found = Ledger.opening(ledger, generation, call)
          switch (found._tag) {
            case "Left":
              return Effect.void
            case "Open": {
              ledger = Ledger.open(ledger, generation, fresh)
              const [asks, asked] = Ledger.ask(ledger, generation, call)
              ledger = asked
              return Effect.andThen(
                listen(key, generation, found.subscription.subscription, fresh),
                asks ? Queue.offer(fresh, undefined) : Effect.void
              )
            }
            case "Opened": {
              const [asks, asked] = Ledger.ask(ledger, generation, call)
              ledger = asked
              hearHeld(key, generation)
              return asks ? Queue.offer(found.handle, undefined) : Effect.void
            }
            case "Scripted":
              return Effect.die(
                new Error(
                  `The test plays the subscription under ${Inspectable.toStringUnknown(key, 0)} with hear: hearNext `
                    + `would start it again, which the run does not do ${untilItComesBack}`
                )
              )
            case "Ended":
              return hasEnded(key)
            // Its key went away after the call, before its subscription would have started: the thunk that took it away
            // offered its job before this one ran, so the call is told after that job, once what it stops is released,
            // as a call waiting on the start would be, and a defect of that release fails it first.
            case "Gone":
              loop.offer(tellStopped([call]), Deferred.makeUnsafe<void>())
              return Effect.void
          }
        }))
    // The call looks its key up in the current state, is among the calls from then on, and offers its job, in one
    // thunk; it leaves however it ends: what it is told meanwhile is what it hears, and what it asked for and did not
    // hear is the next call's. A defect of the program, in whichever fiber, ends the wait, as it ends the run.
    const hearNext = Effect.fnUntraced(function*(key: unknown) {
      const call: Call<Message> = { key, heard: yield* Deferred.make<Opt.Option<Message>>() }
      const context = yield* Effect.context<Exclude<RS, Scope.Scope>>()
      const heard = yield* loop.submit(() => {
        const generation = startUnder(key)
        if (typeof generation !== "number") return generation
        ledger = Ledger.enter(ledger, call)
        const done = Deferred.makeUnsafe<void>()
        loop.offer(Effect.provideContext(opening(key, generation, call), context), done)
        return Deferred.await(done)
      }).pipe(
        Effect.andThen(orDead(Deferred.await(call.heard))),
        Effect.ensuring(Effect.sync(() => {
          ledger = Ledger.leave(ledger, call)
        }))
      )
      return Opt.isSome(heard) ? heard.value : yield* hasEnded(key)
    })
    // The effect of a command, in a fiber of the rehearsal's scope: once it answers, nothing interrupts it before its
    // answer is applied, in its thunk, and the command is no longer under way from that thunk on. Refused, as the
    // rehearsal has ended, the answer is applied by nobody, and the command was under way when it ended. However the
    // fiber ends, the command is no longer under way. It gives what its `run` waits for: the job of its answer.
    const answering = <RC>(ticket: Ledger.Ticket, effect: Effect.Effect<Opt.Option<Message>, never, RC>) => {
      const settle = (before: LedgerOf) => Ledger.settle(before, ticket)
      return Effect.uninterruptibleMask((restore) =>
        restore(effect.pipe(scopedIn(register, "command"))).pipe(
          Effect.flatMap(Opt.match({
            onNone: () => Effect.succeed<Effect.Effect<void>>(Effect.void),
            onSome: (message) =>
              loop.submit(() => {
                ledger = settle(ledger)
                return Effect.succeed(outcomeOf(apply(Core.fromCommand, message, "list", Opt.none()), message))
              })
          })),
          Effect.ensuring(Effect.sync(() => {
            ledger = settle(ledger)
          }))
        )
      )
    }
    type Ran =
      | Readonly<{ _tag: "None"; pending: ReadonlyArray<Command> }>
      | Readonly<{ _tag: "Ran"; command: Command; answer: Effect.Effect<void> }>
    type Taking =
      | Readonly<{ _tag: "None"; pending: ReadonlyArray<Command> }>
      | Readonly<{
        _tag: "Running"
        ticket: Ledger.Ticket
        command: Command
        fiber: Fiber.Fiber<Effect.Effect<void>>
      }>
    // Checks the register and that the rehearsal has not ended, takes the oldest pending command `select` matches, or
    // finds none (`Ledger.take`), and calls `runCommand`, all in one thunk, with no check in front of it; then forks
    // the effect it returned in the rehearsal's scope. The fiber and how an interrupted call stops it are one
    // primitive: the call cancels the command and interrupts its fiber, which may have applied its answer already.
    const runFirst = (select: (command: Command) => boolean) =>
      Effect.acquireUseRelease(
        Effect.suspend(() => {
          if (dead()) return deadOr(Effect.never)
          if (loop.ended()) return Effect.interrupt
          const taking = Ledger.take(ledger, select)
          if (Opt.isNone(taking)) return Effect.succeed<Taking>({ _tag: "None", pending: ledger.pending })
          const [{ ticket, command }, taken] = taking.value
          ledger = taken
          // Forked in the acquisition, where nothing interrupts, the command is interruptible all the same
          // (`docs/premises.md`).
          return answering(ticket, calling(() => runCommand(command))).pipe(
            rootedIn("command"),
            FiberSet.run(commands),
            Effect.map((fiber): Taking => ({ _tag: "Running", ticket, command, fiber }))
          )
        }),
        (taking): Effect.Effect<Ran> =>
          taking._tag === "None"
            ? Effect.succeed(taking)
            // Awaited, not joined, as `simulate`'s `runOne` says.
            : Effect.map(orDead(Effect.flatten(Fiber.await(taking.fiber))), (answer) => ({
              _tag: "Ran",
              command: taking.command,
              answer
            })),
        (taking, exit) =>
          taking._tag === "Running" && Exit.hasInterrupts(exit)
            ? Effect.andThen(
              Effect.sync(() => {
                ledger = Ledger.cancel(ledger, taking.ticket)
              }),
              stopFiber(taking.fiber)
            )
            : Effect.void
      ).pipe(Effect.tap((ran) => ran._tag === "Ran" ? ran.answer : Effect.void))
    const run = (select: (command: Command) => boolean) =>
      Effect.flatMap(runFirst(select), (ran) =>
        ran._tag === "Ran"
          ? Effect.succeed(ran.command)
          : Effect.die(new Error(`No pending command matches (pending: ${describeAll(ran.pending)})`)))
    // Ends on a take that finds nothing, never on a count of `pending` made before it: another call may take the last
    // command in between.
    const runAll: Effect.Effect<void, never, Exclude<RC, Scope.Scope>> = Effect.flatMap(
      runFirst(() => true),
      (ran) => ran._tag === "None" ? Effect.void : runAll
    )
    // What the test reads of the state stays readable once the rehearsal died; what it asks of the program, its model
    // included, fails.
    const rehearsal: Rehearsal<State, Model, Message, Command, Event, RC, RS> = {
      state: Effect.sync(() => now.state),
      model: deadOr(Effect.sync(() => shown)),
      send: (select) => deadOr(send(select)),
      pending: Effect.sync(() => ledger.pending),
      run,
      runAll,
      // Its type rules out only what no subscription sends.
      hear: (key, message) => deadOr(hear(key, message as Message)),
      hearNext: (key) => deadOr(hearNext(key)),
      events: Effect.sync(() => now.events),
      ignored: Effect.sync(() => now.ignored)
    }
    // However the rehearsal ends, it stops the loop and what `hearNext` started, as the end of the run interrupts its
    // fibers, and waits for them to release what they hold: only then does it read what they died of. The job it
    // interrupted may have been stopping a subscription, or telling a call: the end reads the fibers that still run and
    // the calls that have not ended, so that it leaves none of them out, whatever that job had done of its own.
    const end = Effect.gen(function*() {
      yield* loop.stop
      // What they die of is recorded as they end.
      yield* Effect.forEach(listeners, ([, fiber]) => stopFiber(fiber), { concurrency: "unbounded", discard: true })
      yield* tellStopped(Arr.fromIterable(ledger.calls))
      yield* Effect.forEach(commands, stopFiber, { concurrency: "unbounded", discard: true })
      yield* Scope.close(forks, Exit.void)
    })
    // A defect of the program comes first, as the run keeps first what ended it, then what the scenario ended with,
    // but for the defects already among them, by their identity. A rehearsal that died checks nothing more: its
    // commands are the run's, which died with it.
    let owed = ledger
    // Suspended, so that a scenario that throws before it returns its effect still meets the end.
    const result = yield* Effect.exit(restore(Effect.suspend(() => scenario(rehearsal)))).pipe(
      // The commands under way and those cancelled are read as the exit is taken, before anything of the end: what
      // happens while the end waits changes nothing of them.
      Effect.tap(() =>
        Effect.sync(() => {
          loop.end()
          owed = ledger
        })
      ),
      // One that returned lets the loop finish the jobs it was offered before, in order: a message once applied has its
      // effects done whole. One that failed, or was interrupted, stops the loop at once: its result is the failure.
      Effect.tap((exit) => Exit.isSuccess(exit) ? Effect.exit(loop.finish) : Effect.void),
      Effect.tap(end),
      Effect.flatMap((exit) => Core.endedWith(deaths(), exit))
    )
    // Pending once the loop has finished: a command that a job it finished owes fails the rehearsal too.
    const { cancelled, underWay } = owed
    const { pending } = ledger
    if (cancelled.length > 0) {
      return yield* Effect.die(
        new Error(
          `Commands whose run was interrupted before they answered: ${describeAll(cancelled)}. A command cannot be `
            + "cancelled: its answer would still arrive"
        )
      )
    }
    if (underWay.size > 0) {
      const running = Arr.fromIterable(underWay.values())
      return yield* Effect.die(new Error(`Commands still under way when the scenario ended: ${describeAll(running)}`))
    }
    if (pending.length > 0) {
      return yield* Effect.die(new Error(`Commands still pending when the scenario ended: ${describeAll(pending)}`))
    }
    return result
  }))
})

const nothingListensUnder = (key: unknown) =>
  new Error(`Nothing listens under ${Inspectable.toStringUnknown(key, 0)} in the current state`)

const describeAll = (values: ReadonlyArray<unknown>) =>
  values.length === 0 ? "none" : values.map((value) => String(describeByTag(value))).join(", ")

/**
 * Rehearses a program without running it, step by step: the test decides when each message arrives.
 *
 * - It starts from the program's `init`. To start elsewhere, give it the program with another `init`.
 * - It acts through what the current model shows. Commands wait until the test runs them, and a subscription's
 *   message is one the test hears.
 * - The test fails when a command is still pending or under way at the end.
 * - Each message applies at once, whole, whichever fiber of the test's sends it. What it stops releases what it held
 *   before its commands are pending, and before any subscription of a later state starts.
 * - A defect of the program fails the rehearsal with the `ProgramDefect` the run dies with, even when the scenario
 *   catches it. The defect comes first in the cause.
 *
 * @param program - The program to rehearse.
 * @param scenario - What the test does, through the {@link Rehearsal} it is given.
 * @param options - `flags`, when the program has them.
 * @returns What `scenario` returns.
 *
 * @example
 * ```ts
 * rehearse(
 *   form,
 *   Effect.fnUntraced(function*(rehearsal) {
 *     yield* rehearsal.send(({ name, editor }) =>
 *       editor._tag === 'Saving'
 *         ? Opt.none()
 *         : Opt.some({ _tag: 'Name', message: { _tag: 'Written', was: name, value: 'Ada' } })
 *     )
 *     yield* rehearsal.send(({ editor }) => (editor._tag === 'Named' ? Opt.some(editor.save) : Opt.none()))
 *     expect((yield* rehearsal.model).editor._tag).toBe('Saving')
 *     yield* rehearsal.run((command) => command._tag === 'Save')
 *   }),
 * )
 * ```
 *
 * @see The guide, "Testing tools", "rehearse".
 * @see The guide, "Testing tools", "`rehearse`, in detail".
 * @see The guide, "Testing tools", "Defects of the program".
 * @see The guide, "Running", "Starting from another state".
 */
export const rehearse = <
  P extends AnyProgram,
  State,
  Model,
  Message,
  Command = never,
  Event = never,
  RC = never,
  RS = never,
  A = unknown,
  E = never,
  RT = never,
  Flags = never
>(
  program: P & Shape<State, Model, Message, Commanded<P, Command>, Commanded<P, RC>, RS, Event, never, Flags>,
  scenario: (
    rehearsal: Rehearsal<State, Model, Message, Commanded<P, Command>, Event, Commanded<P, RC>, RS>
  ) => Effect.Effect<A, E, RT>,
  ...options: [Flags] extends [never] ? [options?: FlagsOption<never>] : [options: FlagsOption<NoInfer<Flags>>]
): Effect.Effect<A, E, RT> => rehearsing(program, scenario, ...options)

// A program without commands gives `Command` and `RC` nothing to be inferred from, and an alias that carries one still
// unfixed leaves the errors and the services of a scenario written `Effect.fnUntraced(function*(rehearsal) { … })`
// `unknown` wherever it reads `rehearsal`. So each is read through the program, whose type is always inferred: `never`
// when it has no `runCommand`, and otherwise inferred as any type, from every piece that names it.
type Commanded<P, T> = P extends { readonly runCommand: unknown } ? T : never
