// What `rehearse` and `simulate` share: the program on the engine itself (`engine.ts`), whose fiber of a command waits
// until the test runs it, the ledger of those commands, a message applied in one thunk with the check of the end and
// what the call waits for, a command taken and run, and the end that stops the engine. The engine is made by the tool,
// told what the stage gives it (`Staging`), and given to the stage once made (`on`): `rehearse` makes it through the
// handle the run makes, with the fibers of its starts, and `simulate` with starts that run nothing
// (`docs/records/tools-on-the-engine.md`).
import * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import type * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Opt from "effect/Option"
import * as Scope from "effect/Scope"
import type { RunCommand } from "../command.ts"
import { type Arrived, endedWith, fromCommand, type Generation, type Source } from "../core.ts"
import type * as Engine from "../engine.ts"
import { commandFiber, type Deaths, stopping } from "../shell.ts"
import * as Ledger from "./ledger.ts"

// What a `run` gives the fiber of the command it took: the effect `runCommand` returned, called in the thunk that took
// it, the services of the call, which the effect runs with, and where the fiber leaves what the call does last, once
// the answer is applied.
type Given<Message, R> = Readonly<{
  ticket: Ledger.Ticket
  effect: Effect.Effect<Opt.Option<Message>, never, R | Scope.Scope>
  context: Context.Context<Exclude<R, Scope.Scope>>
  answer: Deferred.Deferred<Effect.Effect<void>>
}>

/** The fiber the engine started for a command, once it has begun, and what a `run` gives it. */
export type Parked<Message, R> = Readonly<{
  fiber: Deferred.Deferred<Fiber.Fiber<void>>
  given: Deferred.Deferred<Given<Message, R>>
}>

/**
 * What a thunk that applied a message leaves to its call: the run had died, or it died there (`Dead`); a message the
 * test sent and `update` rejected (`Rejected`); or the completion of a job after its own, which the call awaits
 * (`Queued`).
 */
export type Outcome =
  | Readonly<{ _tag: "Dead" }>
  | Readonly<{ _tag: "Rejected" }>
  | Readonly<{ _tag: "Queued"; done: Opt.Option<Deferred.Deferred<void>> }>

const deadOutcome: Outcome = { _tag: "Dead" }

const rejectedOutcome: Outcome = { _tag: "Rejected" }

/** What a take of the oldest pending command a `select` matches came to: none, or the command and the wait for its job. */
export type Ran<Command> =
  | Readonly<{ _tag: "None"; pending: ReadonlyArray<Command> }>
  | Readonly<{ _tag: "Ran"; command: Command; answer: Effect.Effect<void> }>

type Taking<Message, Command, R> =
  | Readonly<{ _tag: "None"; pending: ReadonlyArray<Command> }>
  | Readonly<{
    _tag: "Running"
    ticket: Ledger.Ticket
    command: Command
    parked: Parked<Message, R>
    answer: Deferred.Deferred<Effect.Effect<void>>
  }>

/** The ledger of a stage: its commands, and how a tool that hears its starts hears them (`S`, `W`). */
export type StageLedger<Message, Command, CommandServices, S, W> = Ledger.Ledger<
  Command,
  Parked<Message, CommandServices>,
  S,
  W,
  Message
>

/**
 * Fails with the defects recorded so far, if any: else runs `effect`. It guards no call of the program: one that must
 * not follow a death has its own check, the only one, in the thunk that calls it, since the scheduler may yield between
 * this check and `effect`.
 */
export const deadOr = (register: Deaths) => <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.suspend(() => {
    const dies = register.all()
    return Arr.isReadonlyArrayNonEmpty(dies) ? Effect.failCause(Cause.fromReasons<never>(dies)) : effect
  })

/** What the engine is given by the stage, before it is made: what the thunk tells, and what a command's fiber runs. */
export type Staging<State, Message, Command, Event, CommandServices, Key, S, W> = Readonly<{
  told: Readonly<{
    stepped: (step: Engine.Stepped<State, Command, Key, Event>) => void
    answering: (command: Command) => Effect.Effect<void>
  }>
  /** The stage over the engine made with `told`. Called once, before the engine's effects start. */
  on: (
    engine: Engine.Engine<State, Message, never, Key>
  ) => Stage<State, Message, Command, Event, CommandServices, Key, S, W>
}>

/** The program on the engine, as a tool plays it. */
export interface Stage<State, Message, Command, Event, CommandServices, Key, S, W> {
  readonly engine: Engine.Engine<State, Message, never, Key>
  /** Written by every fiber of the test's, and by the engine's thunk and its fiber of effects, by one transition. */
  ledger: StageLedger<Message, Command, CommandServices, S, W>
  /** The events `update` raised, in order. */
  readonly events: () => ReadonlyArray<Event>
  /** The answers and the subscriptions' messages that `update` rejected, in order. */
  readonly ignored: () => ReadonlyArray<Message>
  readonly deadOr: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  /**
   * Races a call that waits for a subscription or a command with a death, whichever fiber dies, as the run dies at
   * once: what it waits for would come in a run that died.
   */
  readonly orDead: <A, E, R>(waiting: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  /**
   * Runs `decide` in one thunk with the check of the end: once the end is marked, `decide` is not called, and the call
   * is `refused`, an interruption unless it says otherwise.
   */
  readonly submit: <A, E, R>(
    decide: () => Effect.Effect<A, E, R>,
    refused?: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>
  /**
   * A job that only tells, after every job offered so far, that of the step this thunk applied included: what it
   * tells, then its completion.
   */
  readonly afterJobs: (then?: () => void) => Deferred.Deferred<void>
  /**
   * In a thunk that has checked the end: the message given to the engine, and what the call waits for, the job of its
   * step and those before. A message `update` rejects is `Rejected` when `rejected` is `"fail"`, and listed in
   * `ignored` otherwise. `told` is called by the job, once done.
   */
  readonly apply: (
    source: Source<Key>,
    message: Message,
    rejected: "fail" | "list",
    told?: () => void
  ) => Outcome
  /** What the call that applied a message waits for: its job, or the defects, or `rejected`. */
  readonly outcomeOf: (outcome: Outcome, rejected?: () => Effect.Effect<void>) => Effect.Effect<void>
  /** Runs the oldest pending command `select` matches, and waits for the job of its answer; or finds none. */
  readonly runFirst: (
    select: (command: Command) => boolean
  ) => Effect.Effect<Ran<Command>, never, Exclude<CommandServices, Scope.Scope>>
  /** Runs the oldest pending command until none is left. */
  readonly runAll: Effect.Effect<void, never, Exclude<CommandServices, Scope.Scope>>
  /**
   * Starts the engine's effects in a scope of its own, plays `scenario`, and ends: what the scenario ended with, or
   * the defects first, with the ledger as the end was marked. `last` is done once the engine's fibers are stopped.
   */
  readonly play: <A, E, R>(
    scenario: Effect.Effect<A, E, R>,
    last?: () => Effect.Effect<void>
  ) => Effect.Effect<readonly [A, StageLedger<Message, Command, CommandServices, S, W>], E, R>
}

/**
 * Makes what a stage gives the engine, with the register the engine records its deaths in. `listened` is how the
 * ledger takes the starts that came and went, as the keys of each new state, the first one's included, are told;
 * `accepted` is told of each message `update` accepted, in the thunk that applied it.
 */
export const make = <State, Message, Command, Event, CommandServices, Key, S = never, W = never>(
  config: Readonly<{
    register: Deaths
    runCommand: RunCommand<Command, Message, CommandServices>
    listened?: (
      ledger: StageLedger<Message, Command, CommandServices, S, W>,
      gone: ReadonlyArray<readonly [Key, Generation]>,
      fresh: ReadonlyArray<readonly [Key, Generation]>
    ) => StageLedger<Message, Command, CommandServices, S, W>
    accepted?: (message: Message, arrived: Extract<Arrived<State, Command, Event>, { _tag: "Applied" }>) => void
  }>
): Staging<State, Message, Command, Event, CommandServices, Key, S, W> => {
  const { register, runCommand, listened: listenedTo = (ledger) => ledger, accepted = () => undefined } = config
  const { all: deaths, dead } = register
  const failedOr = deadOr(register)
  type CommandNeeds = Exclude<CommandServices, Scope.Scope>
  // Given once, by `on`, before anything below that reads it runs: the engine's thunk and its jobs run only once the
  // engine is made, and a call only once the stage is.
  let engine: Engine.Engine<State, Message, never, Key>
  const orDead = <A, E, R>(waiting: Effect.Effect<A, E, R>) =>
    Effect.raceFirst(waiting, Effect.andThen(register.died, failedOr(Effect.never)))
  const submit = <A, E, R>(decide: () => Effect.Effect<A, E, R>, refused: Effect.Effect<A, E, R> = Effect.interrupt) =>
    Effect.suspend(() => engine.ended() ? refused : decide())
  let events: ReadonlyArray<Event> = []
  let ignored: ReadonlyArray<Message> = []
  // The completions of the jobs that only tell that are not done yet: the end interrupts them, since a job it stops
  // before it is done does not tell.
  const undelivered = new Set<Deferred.Deferred<void>>()
  // What the engine's thunk tells of the message `apply` gives it, read by `apply` as `send` returns: what it came to,
  // told only once its state is current, with its keys. Written only by `stepped`, on this stack.
  let arrived: Opt.Option<Arrived<State, Command, Event>> = Opt.none()
  const stepped = (step: Engine.Stepped<State, Command, Key, Event>) => {
    if (step._tag === "Arrived") {
      arrived = Opt.some(step.arrived)
      if (step.arrived._tag === "Applied") events = [...events, ...step.arrived.events]
      return
    }
    stage.ledger = listenedTo(stage.ledger, step.gone, step.fresh)
  }
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
    source: Source<Key>,
    message: Message,
    rejected: "fail" | "list",
    told: () => void = () => undefined
  ): Outcome => {
    arrived = Opt.none()
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
        accepted(message, step)
    }
    return { _tag: "Queued", done: Opt.some(afterJobs(told)) }
  }
  const outcomeOf = (
    outcome: Outcome,
    rejected: () => Effect.Effect<void> = () => Effect.void
  ): Effect.Effect<void> => {
    switch (outcome._tag) {
      case "Dead":
        return failedOr(Effect.never)
      case "Rejected":
        return rejected()
      case "Queued":
        return Opt.match(outcome.done, { onNone: () => Effect.void, onSome: Deferred.await })
    }
  }
  // Calls the program where the call is decided, in the thunk that checks the register: what it throws is a defect of
  // the effect it would have returned, in the site and the scope that effect gets.
  const calling = <A, E, R>(call: () => Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
    try {
      return call()
    } catch (defect) {
      return Effect.die(defect)
    }
  }
  // What the fiber of a command runs, called by the job of its step, where the engine forks the fiber, and so once what
  // the step stops has released what it held: the command is pending from here on. Its fiber says what it is in its
  // first step, for a `run` interrupted to stop it, and waits until a `run` gives it the effect of the command. Once the
  // effect answers, nothing interrupts the fiber before its answer is applied, in its thunk, and the command is no
  // longer under way from that thunk on. Refused, as the stage has ended, the answer is applied by nobody, and the
  // command was under way when it ended: its fiber ends with nothing to do, since one that interrupts itself is a
  // defect. However the fiber ends, the command is no longer under way. It leaves what its `run` does last: the wait
  // for the job of its answer.
  const answering = (command: Command): Effect.Effect<void> => {
    const parked: Parked<Message, CommandServices> = { fiber: Deferred.makeUnsafe(), given: Deferred.makeUnsafe() }
    stage.ledger = Ledger.owe(stage.ledger, [{ command, handle: parked }])
    return Effect.flatMap(Effect.fiber, (own) => {
      // The engine forks it to run what this function returns, which succeeds with nothing and cannot fail.
      Deferred.doneUnsafe(parked.fiber, Exit.succeed(own as Fiber.Fiber<void>))
      return Effect.flatMap(Deferred.await(parked.given), ({ answer, context, effect, ticket }) => {
        const settle = () => {
          stage.ledger = Ledger.settle(stage.ledger, ticket)
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
                const then = outcomeOf(apply(fromCommand, message, "list"))
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
  // What a `run` waits for once it has given its command: the fiber's end, its root and its record included, and then
  // what it left to do last, the wait for the job of its answer.
  const answered = (
    { parked, answer }: Readonly<
      { parked: Parked<Message, CommandServices>; answer: Deferred.Deferred<Effect.Effect<void>> }
    >
  ) =>
    Deferred.await(parked.fiber).pipe(
      Effect.flatMap(Fiber.await),
      Effect.flatMap((exit) => Exit.isSuccess(exit) ? Deferred.await(answer) : Effect.failCause(exit.cause))
    )
  // Checks the register and that the stage has not ended, takes the oldest pending command `select` matches, or finds
  // none (`Ledger.take`), calls `runCommand`, and gives the effect it returned to the command's fiber, which the engine
  // started and keeps, all in one thunk, with no check in front of it. The command given and how an interrupted call
  // stops it are one primitive: the call cancels the command and stops its fiber, once it has begun, which may have
  // applied its answer already.
  const runFirst = (select: (command: Command) => boolean): Effect.Effect<Ran<Command>, never, CommandNeeds> =>
    Effect.flatMap(Effect.context<CommandNeeds>(), (context) =>
      Effect.acquireUseRelease(
        Effect.suspend(() => {
          if (dead()) return failedOr(Effect.never)
          if (engine.ended()) return Effect.interrupt
          const taking = Ledger.take(stage.ledger, select)
          if (Opt.isNone(taking)) {
            return Effect.succeed<Taking<Message, Command, CommandServices>>({
              _tag: "None",
              pending: Ledger.pendingOf(stage.ledger)
            })
          }
          const [{ ticket, command, handle: parked }, taken] = taking.value
          stage.ledger = taken
          const answer = Deferred.makeUnsafe<Effect.Effect<void>>()
          const effect = calling(() => runCommand(command))
          Deferred.doneUnsafe(parked.given, Exit.succeed({ ticket, effect, context, answer }))
          return Effect.succeed<Taking<Message, Command, CommandServices>>({
            _tag: "Running",
            ticket,
            command,
            parked,
            answer
          })
        }),
        (taking): Effect.Effect<Ran<Command>> =>
          taking._tag === "None"
            ? Effect.succeed(taking)
            : Effect.map(orDead(answered(taking)), (answer) => ({
              _tag: "Ran",
              command: taking.command,
              answer
            })),
        (taking, exit) =>
          taking._tag === "Running" && Exit.hasInterrupts(exit)
            ? Effect.andThen(
              Effect.sync(() => {
                stage.ledger = Ledger.cancel(stage.ledger, taking.ticket)
              }),
              Effect.flatMap(Deferred.await(taking.parked.fiber), stopping)
            )
            : Effect.void
      ).pipe(Effect.tap((ran) => ran._tag === "Ran" ? ran.answer : Effect.void)))
  // Ends on a take that finds nothing, never on a count of `pending` made before it: another call may take the last
  // command in between.
  const runAll: Effect.Effect<void, never, CommandNeeds> = Effect.flatMap(
    runFirst(() => true),
    (ran) => ran._tag === "None" ? Effect.void : runAll
  )
  // Waits until the engine has done every job offered before.
  const finish = Effect.suspend(() => Deferred.await(afterJobs()))
  // From its scope on, nothing interrupts the stage but in its scenario: the scope and the effects started in it are
  // one region with the end that closes and stops them, as `drive` forks its run, so that an interruption from outside
  // as it sets up meets the end too.
  const play = <A, E, R>(
    scenario: Effect.Effect<A, E, R>,
    last: () => Effect.Effect<void> = () => Effect.void
  ): Effect.Effect<readonly [A, StageLedger<Message, Command, CommandServices, S, W>], E, R> =>
    Effect.uninterruptibleMask(Effect.fnUntraced(function*(restore) {
      // Where the engine keeps its fibers, so that they outlive the fiber of the test's that asked for them, as the
      // run's outlive whoever dispatched. Closed at the end, however the stage ends. Made once the program has started,
      // so that a start that dies leaves no scope open.
      const forks = yield* Scope.make()
      // The jobs of the first state: its subscriptions start, and its commands are pending.
      yield* engine.effects.pipe(Scope.provide(forks))
      // However the stage ends, it stops the engine's fiber of effects, then interrupts the calls that wait for a job it
      // will not do, before it waits for the releases: such a call may hold what a release waits for. The close of the
      // scope is the engine's end: it stops every fiber of a command and of a subscription, all at once, and waits for
      // them to release what they hold. What they die of is in the register, read below with what the scenario ended
      // with. Then a `run` interrupted before the fiber of its command began, which the end stopped, waits no more, and
      // `last` is done.
      const end = Effect.gen(function*() {
        yield* engine.stop
        yield* Effect.forEach(Arr.fromIterable(undelivered), Deferred.interrupt, { discard: true })
        yield* Scope.close(forks, Exit.void)
        yield* Effect.forEach(stage.ledger.underWay.values(), ({ handle }) => Deferred.interrupt(handle.fiber), {
          discard: true
        })
        yield* Effect.suspend(last)
      })
      // A defect of the program comes first, as the run keeps first what ended it, then what the scenario ended with,
      // but for the defects already among them, by their identity.
      let owed = stage.ledger
      // Suspended, so that a scenario that throws before it returns its effect still meets the end.
      const result = yield* Effect.exit(restore(Effect.suspend(() => scenario))).pipe(
        // The commands under way and those cancelled are read as the exit is taken, in the thunk that marks the end,
        // before anything of the end: what happens while the end waits changes nothing of them.
        Effect.tap(() =>
          Effect.sync(() => {
            engine.end()
            owed = stage.ledger
          })
        ),
        // One that returned lets the engine finish the jobs it was offered before, in order: a message once applied has
        // its effects done whole. One that failed, or was interrupted, stops the fiber of effects at once: its result is
        // the failure.
        Effect.tap((exit) => Exit.isSuccess(exit) ? Effect.exit(finish) : Effect.void),
        Effect.tap(end),
        Effect.flatMap((exit) => endedWith(deaths(), exit))
      )
      return [result, owed] as const
    }))
  const stage: Stage<State, Message, Command, Event, CommandServices, Key, S, W> = {
    get engine() {
      return engine
    },
    ledger: Ledger.start(),
    events: () => events,
    ignored: () => ignored,
    deadOr: failedOr,
    orDead,
    submit,
    afterJobs,
    apply,
    outcomeOf,
    runFirst,
    runAll,
    play
  }
  return {
    told: { stepped, answering },
    on: (made) => {
      engine = made
      return stage
    }
  }
}
