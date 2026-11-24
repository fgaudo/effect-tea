// `rehearse` runs the program on the engine itself (`engine.ts`), built with what the fiber of a command and that of a
// start run: a command waits until a `run` gives it the effect `runCommand` returned, and a subscription until a
// `hearNext` asks it for a message. The thunk, the jobs and their order, the fibers, their roots and records, and the
// end that stops them are the engine's; what is left here is what the test decides (`docs/records/one-engine.md`).
import * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import type * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as HashMap from "effect/HashMap"
import * as Inspectable from "effect/Inspectable"
import * as Opt from "effect/Option"
import * as Scope from "effect/Scope"
import * as Core from "../core.ts"
import * as Engine from "../engine.ts"
import { describeByTag } from "../log.ts"
import { type AnyProgram, type FlagsOption, listenOf, type Program, runCommandOf, startOf } from "../program.ts"
import { commandFiber, diesIn, makeDeaths, startFiber, stopping as stopFiber } from "../shell.ts"
import * as Ledger from "./ledger.ts"

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
   * @param key - The subscription's key, as the program lists it. A child's key names the child and its instance, as
   * its parent lists it: `{ _tag: 'Clock', instance: 1, key: 'ticks' }`, and
   * `{ _tag: 'Row', id, instance: 1, key: 'ticks' }` for children by id.
   * @param message - What the subscription sends, as a message of the program.
   *
   * @see The guide, "Testing tools", "A subscription's message is one the test says was heard".
   * @see The guide, "Testing tools", "How a subscription is heard".
   * @see The guide, "Testing tools", "What fails the test".
   */
  readonly hear: (key: unknown, message: Message) => Effect.Effect<void>
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

// A call of `hearNext`, by its identity: the key the test gave, and what it is told: the message it heard, once its job
// is done, or none once its start has ended.
type Call<Message> = Readonly<{ key: unknown; heard: Deferred.Deferred<Opt.Option<Message>> }>

// What the fiber of a start is given by the calls of `hearNext`: each ask for a message, with the services of the call,
// and the wait of the fiber for the next one. Its subscription runs with the services of the first. Made by plain code
// and completed by plain code, in the thunk that asks: a `Queue` is made by an effect, and resumes its taker by the
// scheduler of whoever made it.
type Asks<R> = { readonly asked: Array<Context.Context<R>>; wake: Deferred.Deferred<void> | undefined }

const ask = <R>(asks: Asks<R>, context: Context.Context<R>) => {
  asks.asked.push(context)
  const { wake } = asks
  if (wake === undefined) return
  asks.wake = undefined
  Deferred.doneUnsafe(wake, Exit.void)
}

const nextAsk = <R>(asks: Asks<R>): Effect.Effect<Context.Context<R>> =>
  Effect.suspend(() => {
    const next = asks.asked.shift()
    if (next !== undefined) return Effect.succeed(next)
    const wake = Deferred.makeUnsafe<void>()
    asks.wake = wake
    return Effect.andThen(Deferred.await(wake), nextAsk(asks))
  })

// What is made for a start in the thunk where its key appears: whether its fiber has begun, which `hear` waits for,
// and its asks.
type Start<R> = Readonly<{ begun: Deferred.Deferred<void>; asks: Asks<R> }>

// What a `run` gives the fiber of the command it took: the effect `runCommand` returned, called in the thunk that took
// it, the services of the call, which the effect runs with, and where the fiber leaves what the call does last, once
// the answer is applied.
type Given<Message, R> = Readonly<{
  ticket: Ledger.Ticket
  effect: Effect.Effect<Opt.Option<Message>, never, R | Scope.Scope>
  context: Context.Context<Exclude<R, Scope.Scope>>
  answer: Deferred.Deferred<Effect.Effect<void>>
}>

// The fiber the engine started for a command, once it has begun, and what a `run` gives it.
type Parked<Message, R> = Readonly<{
  fiber: Deferred.Deferred<Fiber.Fiber<void>>
  given: Deferred.Deferred<Given<Message, R>>
}>

// What a thunk that applied a message leaves to its call: the run had died, or it died there (`Dead`); a message the
// test sent and `update` rejected (`Rejected`); or the completion of a job after its own, which the call awaits
// (`Queued`).
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
  State extends object,
  Model,
  Message,
  Command = never,
  Event = never,
  RC = never,
  RS = never,
  A = unknown,
  E = never,
  RT = never,
  Flags = never,
  Key = never
>(
  program: Program<{
    state: State
    model: Model
    message: Message
    command: Command
    commandServices: RC
    subscriptionServices: RS
    event: Event
    flags: Flags
    key: Key
  }>,
  scenario: (rehearsal: Rehearsal<State, Model, Message, Command, Event, RC, RS>) => Effect.Effect<A, E, RT>,
  ...[{ flags } = {}]: [Flags] extends [never] ? [options?: FlagsOption<never>]
    : [options: FlagsOption<NoInfer<Flags>>]
): Effect.fn.Return<A, E, RT> {
  const first = yield* Effect.sync(() => startOf(program.init, flags)).pipe(diesIn("init"))
  const runCommand = runCommandOf(program)
  const listenTo = listenOf(program)
  // The register of the run: what the engine's thunk and its fibers die of, the program's defects and what is thrown
  // outside every function of the program alike, as the run keeps them. The tool's own failures of a call (nothing to
  // send, a control that does nothing) are returned to the fiber that made the call, and never die in a fiber of the
  // engine's. The rehearsal fails with what is recorded at its end, and what the test asks for after the first defect
  // fails with it, as nothing happens in a run that died.
  const register = makeDeaths(() => true)
  const { all: deaths, dead } = register
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
  // once: what it waits for would come in a run that died. One that waits for a job waits for a release, which the
  // end of the rehearsal awaits all the same.
  const orDead = <A, E, R>(waiting: Effect.Effect<A, E, R>) =>
    Effect.raceFirst(waiting, Effect.andThen(register.died, deadOr(Effect.never)))
  type RSOf = Exclude<RS, Scope.Scope>
  type CallOf = Call<Message>
  // The commands, and how each start is heard, by its generation. Written by every fiber of the test's, by the engine's
  // thunk as it tells each step, and by its fiber of effects as its jobs begin a start, owe a command and release a
  // start, each time by one transition in one thunk.
  let ledger: Ledger.Ledger<Command, Parked<Message, RC>, Start<RSOf>, CallOf, Message> = Ledger.start()
  let events: ReadonlyArray<Event> = []
  let ignored: ReadonlyArray<Message> = []
  // The completions of the jobs that only tell that are not done yet: the end interrupts them, since a job it stops
  // before it is done does not tell.
  const undelivered = new Set<Deferred.Deferred<void>>()
  const stoppedWhileWaiting = (key: unknown) =>
    new Error(
      `The subscription under ${Inspectable.toStringUnknown(key, 0)} was stopped while hearNext waited for its `
        + "message: its key went away, or the scenario ended"
    )
  // What the engine's thunk tells of the message `apply` gives it, read by `apply` as `send` returns: what it came to,
  // and whether the keys of its new state were reconciled. Written only by `stepped`, on this stack.
  let arrived: Opt.Option<Core.Arrived<State, Command, Event>> = Opt.none()
  let listened = false
  // Told in the thunk, the first keys' as the engine is made: a start that appears is unheard and starting, with its
  // asks made, and one that went away is forgotten.
  const stepped = (step: Engine.Stepped<State, Command, Key, Event>) => {
    if (step._tag === "Arrived") {
      arrived = Opt.some(step.arrived)
      if (step.arrived._tag === "Applied") events = [...events, ...step.arrived.events]
      return
    }
    listened = true
    ledger = Ledger.listened(
      ledger,
      step.gone.map(([, generation]) => generation),
      step.fresh.map(([, generation]) =>
        [generation, { begun: Deferred.makeUnsafe<void>(), asks: { asked: [], wake: undefined } }] as const
      )
    )
  }
  // Runs `decide` in one thunk with the check of the end: once the end is marked, `decide` is not called, and the call
  // is `refused`, an interruption unless it says otherwise.
  const submit = <A, E, R>(decide: () => Effect.Effect<A, E, R>, refused: Effect.Effect<A, E, R> = Effect.interrupt) =>
    Effect.suspend(() => engine.ended() ? refused : decide())
  // A job that only tells, after every job offered so far, that of the step this thunk applied included: what it
  // tells, then its completion.
  const afterJobs = (then: () => void = () => undefined): Deferred.Deferred<void> => {
    const done = Deferred.makeUnsafe<void>()
    undelivered.add(done)
    engine.after(() => {
      then()
      undelivered.delete(done)
      Deferred.doneUnsafe(done, Exit.void)
    })
    return done
  }
  // The pure half of a step is the engine's, called in a thunk that has checked the end: what it came to decides what
  // the call waits for, the job of its step and those before. A step that a defect stopped leaves the call to the
  // defect: `update` or `subscriptions` threw, which the engine recorded where it happened, or the run had died. A
  // defect of a later model is recorded by the engine where its listener reads it, and the step goes on whole.
  const apply = (
    source: Core.Source<Key>,
    message: Message,
    rejected: "fail" | "list",
    hearer: Opt.Option<Hearer<Message>>
  ): Outcome => {
    arrived = Opt.none()
    listened = false
    engine.send(message, source)
    if (Opt.isNone(arrived)) return deadOutcome
    const step = arrived.value
    switch (step._tag) {
      case "Dead":
        return deadOutcome
      // No call gives the engine a message whose start is no longer active: `hear` fails on a key gone from the
      // current state, and the ledger forgets a start in the thunk that stops it, so that `hearNext` hears nothing
      // more of it.
      case "Dropped":
        return { _tag: "Queued", done: Opt.none() }
      case "Ignored":
        if (rejected === "fail") return rejectedOutcome
        ignored = [...ignored, message]
        break
      case "Applied":
        if (step.changed && !listened) return deadOutcome
    }
    return {
      _tag: "Queued",
      done: Opt.some(afterJobs(() => {
        if (Opt.isNone(hearer)) return
        for (const { heard } of hearer.value.told) Deferred.doneUnsafe(heard, Exit.succeed(Opt.none()))
        Deferred.doneUnsafe(hearer.value.call.heard, Exit.succeed(Opt.some(hearer.value.message)))
      }))
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
  const untilItComesBack = "until its key goes away and comes back"
  const hasEnded = (key: unknown) =>
    Effect.die(
      new Error(
        `The subscription under ${Inspectable.toStringUnknown(key, 0)} has ended: it sends nothing ${untilItComesBack}`
      )
    )
  const runsUnderHearNext = (key: unknown) =>
    Effect.die(
      new Error(
        `The subscription under ${Inspectable.toStringUnknown(key, 0)} runs under hearNext: only it sends messages `
          + `under its key, ${untilItComesBack}`
      )
    )
  // In a thunk that has checked the end: while a call waits on the start and a message it sent is not heard, the
  // first call hears the first message, applied as `hear` would apply it, and told once its job is done; its last one
  // tells the calls still waiting that it has ended. A call interrupted once it is told is told all the same: what
  // the message applies, it applies whole.
  const hearHeld = (key: Key, generation: Core.Generation) => {
    while (true) {
      const found = Ledger.hear(ledger, generation)
      if (Opt.isNone(found)) return
      const { call, sent: { message }, ended: told } = found.value
      ledger = found.value.ledger
      apply({ _tag: "Subscription", key, generation }, message, "list", Opt.some({ call, message, told }))
    }
  }
  // The subscription's fiber gives what it sends, applied in its thunk at once when a call waits for it, as the run's
  // applies it as it is sent, and waits for the next ask. Refused once the rehearsal has ended, it waits for the end to
  // stop it, since one that interrupts itself is a defect.
  const sends = (key: Key, generation: Core.Generation, message: Message, last: boolean) =>
    submit(() => {
      ledger = Ledger.send(ledger, generation, { message, last })
      hearHeld(key, generation)
      return Effect.void
    }, Effect.never)
  // What the fiber of a start runs, called by the job of its step, where the engine forks the fiber, and so after the
  // stops of every step before: the start has begun from here on. The fiber waits for the first ask of a `hearNext`
  // before anything of the program runs, then runs the subscription `listen` makes of the key, with the services of
  // that call, in a scope of its own, and waits between two messages. `listen` runs inside the fiber, as in the run: a
  // defect in it is the subscription's. The messages are applied by `hearHeld`, in the thunk that finds a call waiting,
  // never by the engine's `send`, which would apply them as they come. Its last message follows the end of its scope,
  // as in the run. Every start the job begins appeared in a thunk before it; one the ledger had not would be asked by
  // nothing.
  const listening = (key: Key, generation: Core.Generation): Effect.Effect<void> => {
    const [start, begun] = Ledger.begin(ledger, generation)
    ledger = begun
    if (Opt.isNone(start)) return Effect.never
    const { asks } = start.value
    Deferred.doneUnsafe(start.value.begun, Exit.void)
    return nextAsk(asks).pipe(
      Effect.flatMap((context) =>
        startFiber(
          register,
          key,
          () => listenTo(key),
          (message: Message) => sends(key, generation, message, false).pipe(Effect.andThen(nextAsk(asks))),
          (last: Message) => sends(key, generation, last, true)
        ).pipe(Effect.provideContext(context))
      )
    )
  }
  // Told by the job once its stops have ended: the calls that waited on those starts as their key went away, and those
  // whose job found their key gone, fail as stopped, once what the start held is released.
  const released = (gone: ReadonlyArray<readonly [Key, Core.Generation]>) => {
    const [told, next] = Ledger.release(ledger, gone.map(([, generation]) => generation))
    ledger = next
    for (const { key, heard } of told) Deferred.doneUnsafe(heard, Exit.die(stoppedWhileWaiting(key)))
  }
  // What the fiber of a command runs, called by the job of its step, where the engine forks the fiber, and so once what
  // the step stops has released what it held: the command is pending from here on. Its fiber says what it is in its
  // first step, for a `run` interrupted to stop it, and waits until a `run` gives it the effect of the command. Once the
  // effect answers, nothing interrupts the fiber before its answer is applied, in its thunk, and the command is no
  // longer under way from that thunk on. Refused, as the rehearsal has ended, the answer is applied by nobody, and the
  // command was under way when it ended: its fiber ends with nothing to do, since one that interrupts itself is a
  // defect. However the fiber ends, the command is no longer under way. It leaves what its `run` does last: the wait
  // for the job of its answer.
  const answering = (command: Command): Effect.Effect<void> => {
    const parked: Parked<Message, RC> = { fiber: Deferred.makeUnsafe(), given: Deferred.makeUnsafe() }
    ledger = Ledger.owe(ledger, [{ command, handle: parked }])
    return Effect.flatMap(Effect.fiber, (own) => {
      // The engine forks it to run what this function returns, which succeeds with nothing and cannot fail.
      Deferred.doneUnsafe(parked.fiber, Exit.succeed(own as Fiber.Fiber<void>))
      return Effect.flatMap(Deferred.await(parked.given), ({ answer, context, effect, ticket }) => {
        const settle = () => {
          ledger = Ledger.settle(ledger, ticket)
        }
        // What the `run` does last is the wait for the job of the answer, once it is applied, and nothing otherwise:
        // with no answer, or one the end refused. The completion that follows the fiber's body leaves an earlier one as
        // it is.
        return Effect.uninterruptibleMask((restore) =>
          commandFiber(
            register,
            restore(effect),
            (message: Message) =>
              submit(() => {
                settle()
                const then = outcomeOf(apply(Core.fromCommand, message, "list", Opt.none()), message)
                return Effect.asVoid(Deferred.succeed(answer, then))
              }, Effect.void)
          ).pipe(
            Effect.provideContext(context),
            Effect.andThen(Deferred.succeed(answer, Effect.void)),
            Effect.ensuring(Effect.sync(settle)),
            Effect.asVoid
          )
        )
      })
    })
  }
  const engine = Engine.build<State, Message, Command, never, Key, Event>({
    deaths: register,
    stepped,
    listening,
    answering,
    released,
    init: first,
    update: program.update,
    subscriptions: program.subscriptions
  })
  // The first model, made whatever the first keys did, as a renderer reads it to draw, and the run dies of both.
  const firstModel = (): Opt.Option<Model> => {
    try {
      return Opt.some(program.makeModel(engine.current().state))
    } catch (thrown) {
      Engine.recordThrown(register, "render", thrown)
      return Opt.none()
    }
  }
  const shown = firstModel()
  yield* deadOr(Effect.void)
  if (Opt.isNone(shown)) return yield* deadOr(Effect.never)
  let model: Model = shown.value
  // There is no renderer: the rehearsal is one told of every state that reads each one, so that the model of each new
  // state is made in the thunk that makes the state, and a defect of `makeModel` is the engine's to record, in
  // `'render'`, as a listener's, the step going on whole.
  engine.subscribe(() => {
    model = program.makeModel(engine.current().state)
  })
  // From its scope on, nothing interrupts the rehearsal but in its scenario: the scope and the effects started in it
  // are one region with the end that closes and stops them, as `drive` forks its run, so that an interruption from
  // outside as it sets up meets the end too.
  return yield* Effect.uninterruptibleMask(Effect.fnUntraced(function*(restore) {
    // Where the engine keeps its fibers, so that they outlive the fiber of the test's that asked for them, as the run's
    // outlive whoever dispatched. Closed at the end, however the rehearsal ends. Made once the program has started, so
    // that a start that dies leaves no scope open.
    const forks = yield* Scope.make()
    // The jobs of the first state: its subscriptions wait for their first ask, and its commands are pending.
    yield* engine.effects.pipe(Scope.provide(forks))
    // Selected on the model of the state it applies to, in the thunk that applies it.
    const send = (select: (model: Model) => Opt.Option<Message>) =>
      submit(() =>
        Opt.match(select(model), {
          onNone: () => Effect.die(new Error("The model does not show what the test sends", { cause: model })),
          onSome: (message) => outcomeOf(apply(Core.fromDispatch, message, "fail", Opt.none()), message)
        })
      )
    // The program's keys are compared with the test's, by their `Equal`: a defect of theirs is in `subscriptions`, as
    // in the run. In a thunk: the key's start, or the effect the call ends with. The test's key stands for the program's
    // where the engine is given a message as a subscription's, whose key only says where it came from.
    const startUnder = (key: unknown): Core.Generation | Effect.Effect<never> => {
      try {
        const found = HashMap.get(engine.active().keys, key as Key)
        return Opt.isSome(found) ? found.value : Effect.die(nothingListensUnder(key))
      } catch (thrown) {
        Engine.recordThrown(register, "subscriptions", thrown)
        return deadOr(Effect.never)
      }
    }
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
          return outcomeOf(
            apply({ _tag: "Subscription", key: key as Key, generation }, message, "list", Opt.none()),
            message
          )
      }
    }
    // In one thunk: the key looked up in the current state; a start whose fiber has not begun waited for, and the key
    // looked up again after it, since it may have gone, or come back with another start, so that the start played is
    // always the current state's.
    const hear = (key: unknown, message: Message): Effect.Effect<void> =>
      submit(() => {
        const generation = startUnder(key)
        if (typeof generation !== "number") return generation
        const starting = ledger.starting.get(generation)
        if (starting !== undefined) return Effect.andThen(Deferred.await(starting.begun), hear(key, message))
        return play(key, generation, message)
      })
    // The job of a call of `hearNext`, after the stops of every step before it, and so after the job that begins its
    // start, in a thunk that has checked the end and the register: the call waits on the start and asks it for a
    // message, the start it opens included, so that a later step that stops the start finds the call waiting. A call
    // that left before its job starts nothing: the test no longer asks for it.
    const openFor = (
      generation: Core.Generation,
      call: CallOf,
      context: Context.Context<RSOf>
    ): Effect.Effect<void> => {
      const found = Ledger.opening(ledger, generation, call)
      switch (found._tag) {
        case "Left":
          return Effect.void
        case "Open": {
          ledger = Ledger.open(ledger, generation)
          const [asks, asked] = Ledger.ask(ledger, generation, call)
          ledger = asked
          if (asks) ask(found.start.asks, context)
          return Effect.void
        }
        case "Opened": {
          const [asks, asked] = Ledger.ask(ledger, generation, call)
          ledger = asked
          hearHeld(call.key as Key, generation)
          if (asks) ask(found.start.asks, context)
          return Effect.void
        }
        case "Scripted":
          return Effect.die(
            new Error(
              `The test plays the subscription under ${Inspectable.toStringUnknown(call.key, 0)} with hear: hearNext `
                + `would start it again, which the run does not do ${untilItComesBack}`
            )
          )
        case "Ended":
          return hasEnded(call.key)
        // Its key went away after the call, before its job: the job that stops its start tells it, once what the start
        // held is released, as a call waiting on the start is told (`released`).
        case "Gone":
          return Effect.void
      }
    }
    // The call looks its key up in the current state, is among the calls from then on, and asks for its job, in one
    // thunk; it leaves however it ends: what it is told meanwhile is what it hears, and what it asked for and did not
    // hear is the next call's. A defect of the program, in whichever fiber, ends the wait, as it ends the run.
    const hearNext = Effect.fnUntraced(function*(key: unknown) {
      const context = yield* Effect.context<RSOf>()
      const call: CallOf = { key, heard: yield* Deferred.make<Opt.Option<Message>>() }
      const heard = yield* submit(() => {
        const generation = startUnder(key)
        if (typeof generation !== "number") return generation
        ledger = Ledger.enter(ledger, call, generation)
        let opened: Effect.Effect<void> = Effect.void
        const done = afterJobs(() => {
          if (engine.ended()) return
          opened = dead() ? deadOr(Effect.never) : openFor(generation, call, context)
        })
        return Effect.andThen(Deferred.await(done), Effect.suspend(() => opened))
      }).pipe(
        Effect.andThen(orDead(Deferred.await(call.heard))),
        Effect.ensuring(Effect.sync(() => {
          ledger = Ledger.leave(ledger, call)
        }))
      )
      return Opt.isSome(heard) ? heard.value : yield* hasEnded(key)
    })
    type Ran =
      | Readonly<{ _tag: "None"; pending: ReadonlyArray<Command> }>
      | Readonly<{ _tag: "Ran"; command: Command; answer: Effect.Effect<void> }>
    type Taking =
      | Readonly<{ _tag: "None"; pending: ReadonlyArray<Command> }>
      | Readonly<{
        _tag: "Running"
        ticket: Ledger.Ticket
        command: Command
        parked: Parked<Message, RC>
        answer: Deferred.Deferred<Effect.Effect<void>>
      }>
    // What a `run` waits for once it has given its command: the fiber's end, its root and its record included, and
    // then what it left to do last, the wait for the job of its answer.
    const answered = (
      { parked, answer }: Readonly<{ parked: Parked<Message, RC>; answer: Deferred.Deferred<Effect.Effect<void>> }>
    ) =>
      Deferred.await(parked.fiber).pipe(
        Effect.flatMap(Fiber.await),
        Effect.flatMap((exit) => Exit.isSuccess(exit) ? Deferred.await(answer) : Effect.failCause(exit.cause))
      )
    // Checks the register and that the rehearsal has not ended, takes the oldest pending command `select` matches, or
    // finds none (`Ledger.take`), calls `runCommand`, and gives the effect it returned to the command's fiber, which
    // the engine started and keeps, all in one thunk, with no check in front of it. The command given and how an
    // interrupted call stops it are one primitive: the call cancels the command and stops its fiber, once it has begun,
    // which may have applied its answer already.
    const runFirst = (select: (command: Command) => boolean) =>
      Effect.flatMap(Effect.context<Exclude<RC, Scope.Scope>>(), (context) =>
        Effect.acquireUseRelease(
          Effect.suspend(() => {
            if (dead()) return deadOr(Effect.never)
            if (engine.ended()) return Effect.interrupt
            const taking = Ledger.take(ledger, select)
            if (Opt.isNone(taking)) return Effect.succeed<Taking>({ _tag: "None", pending: Ledger.pendingOf(ledger) })
            const [{ ticket, command, handle: parked }, taken] = taking.value
            ledger = taken
            const answer = Deferred.makeUnsafe<Effect.Effect<void>>()
            const effect = calling(() => runCommand(command))
            Deferred.doneUnsafe(parked.given, Exit.succeed({ ticket, effect, context, answer }))
            return Effect.succeed<Taking>({ _tag: "Running", ticket, command, parked, answer })
          }),
          (taking): Effect.Effect<Ran> =>
            taking._tag === "None"
              ? Effect.succeed(taking)
              : Effect.map(orDead(answered(taking)), (answer) => ({ _tag: "Ran", command: taking.command, answer })),
          (taking, exit) =>
            taking._tag === "Running" && Exit.hasInterrupts(exit)
              ? Effect.andThen(
                Effect.sync(() => {
                  ledger = Ledger.cancel(ledger, taking.ticket)
                }),
                Effect.flatMap(Deferred.await(taking.parked.fiber), stopFiber)
              )
              : Effect.void
        ).pipe(Effect.tap((ran) => ran._tag === "Ran" ? ran.answer : Effect.void)))
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
      state: Effect.sync(() => engine.current().state),
      model: deadOr(Effect.sync(() => model)),
      send: (select) => deadOr(send(select)),
      pending: Effect.sync(() => Ledger.pendingOf(ledger)),
      run,
      runAll,
      hear: (key, message) => deadOr(hear(key, message)),
      hearNext: (key) => deadOr(hearNext(key)),
      events: Effect.sync(() => events),
      ignored: Effect.sync(() => ignored)
    }
    // However the rehearsal ends, it stops the engine's fiber of effects, then interrupts the calls that wait for a job
    // it will not do, before it waits for the releases: such a call may hold what a release waits for. The close of the
    // scope is the engine's end: it stops every fiber of a command and of a subscription, all at once, and waits for
    // them to release what they hold. What it dies of is the register, read below with what the scenario ended with.
    // Then a `run` interrupted before the fiber of its command began, which the end stopped, waits no more, and every
    // call of `hearNext` that has not ended is told, never only what the ledger still says of a start, which the thunk
    // forgets in the transition that stops it.
    const end = Effect.gen(function*() {
      yield* engine.stop
      yield* Effect.forEach(Arr.fromIterable(undelivered), Deferred.interrupt, { discard: true })
      yield* Effect.exit(Scope.close(forks, Exit.void))
      yield* Effect.forEach(ledger.underWay.values(), ({ handle }) => Deferred.interrupt(handle.fiber), {
        discard: true
      })
      yield* Effect.forEach(
        Arr.fromIterable(ledger.calls),
        ({ key, heard }) => Deferred.die(heard, stoppedWhileWaiting(key)),
        { discard: true }
      )
    })
    // Waits until the engine has done every job offered before.
    const finish = Effect.suspend(() => Deferred.await(afterJobs()))
    // A defect of the program comes first, as the run keeps first what ended it, then what the scenario ended with,
    // but for the defects already among them, by their identity. A rehearsal that died checks nothing more: its
    // commands are the run's, which died with it.
    let owed = ledger
    // Suspended, so that a scenario that throws before it returns its effect still meets the end.
    const result = yield* Effect.exit(restore(Effect.suspend(() => scenario(rehearsal)))).pipe(
      // The commands under way and those cancelled are read as the exit is taken, in the thunk that marks the end,
      // before anything of the end: what happens while the end waits changes nothing of them.
      Effect.tap(() =>
        Effect.sync(() => {
          engine.end()
          owed = ledger
        })
      ),
      // One that returned lets the engine finish the jobs it was offered before, in order: a message once applied has
      // its effects done whole. One that failed, or was interrupted, stops the fiber of effects at once: its result is
      // the failure.
      Effect.tap((exit) => Exit.isSuccess(exit) ? Effect.exit(finish) : Effect.void),
      Effect.tap(end),
      Effect.flatMap((exit) => Core.endedWith(deaths(), exit))
    )
    // Pending once the engine has finished: a command that a job it finished owes fails the rehearsal too.
    const { cancelled, underWay } = owed
    const pending = Ledger.pendingOf(ledger)
    if (cancelled.length > 0) {
      return yield* Effect.die(
        new Error(
          `Commands whose run was interrupted before they answered: ${describeAll(cancelled)}. A command cannot be `
            + "cancelled: its answer would still arrive"
        )
      )
    }
    if (underWay.size > 0) {
      const running = Arr.map(Arr.fromIterable(underWay.values()), ({ command }) => command)
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
 *     yield* rehearsal.send(({ editor }) =>
 *       editor._tag === 'Saving'
 *         ? Opt.none()
 *         : Opt.some({ _tag: 'Name', message: { _tag: 'Written', value: 'Ada' } })
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
  State extends object,
  Model,
  Message,
  Command = never,
  Event = never,
  RC = never,
  RS = never,
  A = unknown,
  E = never,
  RT = never,
  Flags = never,
  Key = never
>(
  program:
    & P
    & Program<{
      state: State
      model: Model
      message: Message
      command: Commanded<P, Command>
      commandServices: Commanded<P, RC>
      subscriptionServices: Listened<P, RS>
      event: Event
      flags: Flags
      key: Listened<P, Key>
    }>,
  scenario: (
    rehearsal: Rehearsal<State, Model, Message, Commanded<P, Command>, Event, Commanded<P, RC>, Listened<P, RS>>
  ) => Effect.Effect<A, E, RT>,
  ...options: [Flags] extends [never] ? [options?: FlagsOption<never>] : [options: FlagsOption<NoInfer<Flags>>]
): Effect.Effect<A, E, RT> => rehearsing(program, scenario, ...options)

// A program without commands gives `Command` and `RC` nothing to be inferred from, and an alias that carries one still
// unfixed leaves the errors and the services of a scenario written `Effect.fnUntraced(function*(rehearsal) { … })`
// `unknown` wherever it reads `rehearsal`. So each is read through the program, whose type is always inferred: `never`
// when it has no `runCommand`, and otherwise inferred as any type, from every piece that names it.
type Commanded<P, T> = P extends { readonly runCommand: unknown } ? T : never
// The same for a program without keys, which gives `Key` and `RS` nothing to be inferred from.
type Listened<P, T> = P extends { readonly listen: unknown } ? T : never
