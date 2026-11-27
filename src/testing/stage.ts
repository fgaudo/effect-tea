// What `rehearse` and `simulate` share: the program on the engine itself (`engine.ts`), whose fiber of a command waits
// until the test runs it, the ledger of those commands, a message applied in one thunk with the check of the end and
// what the call waits for, a command taken and run, and the end that stops the engine. The engine is made by the tool,
// told what the stage gives it (`Staging`), and given to the stage once made (`on`): `rehearse` makes it through the
// handle the run makes, with the fibers of its starts, and `simulate` with starts that run nothing
// (`docs/records/tools-on-the-engine.md`). A call of a tool waits in two ways only, both given here: before it has
// applied anything, raced with a death (`waiting`, `afterJobs`, a `run` until its command answers), and once it has
// applied its message, for the job whole (what `apply` and `dispatch` return, and a `run` once its command answers).
// The lint holds the tools to them: they await no `Deferred` themselves.
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
import { type Arrived, endedWith, fromCommand, fromDispatch, type Generation, type Source } from "../core.ts"
import type * as Engine from "../engine.ts"
import { commandFiber, type Deaths, stopping, withExternalSpan } from "../shell.ts"
import * as Ledger from "./ledger.ts"

// What a `run` gives the fiber of the command it took: the effect `runCommand` returned, called in the thunk that took
// it, the services of the call, its span seen as an external one (`withExternalSpan`), which the effect runs with, and
// where the fiber leaves what the call does last, once the answer is applied.
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
   * How a call waits before it has applied anything, for a start, a subscription's message or a command: raced with a
   * death, whichever fiber dies, as the run dies at once, since what it waits for would come in a run that died. A call
   * that was told what it heard (`told`, `deferred` by default) as the death came waits on for `deferred`.
   */
  readonly waiting: <A, T = A>(deferred: Deferred.Deferred<A>, told?: Deferred.Deferred<T>) => Effect.Effect<A>
  /**
   * Runs `decide` in one thunk with the check of the end: once the end is marked, `decide` is not called, and the call
   * is `refused`, an interruption unless it says otherwise.
   */
  readonly submit: <A, E, R>(
    decide: () => Effect.Effect<A, E, R>,
    refused?: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>
  /**
   * Offers, at once, a job that only tells, after every job offered so far: `then`, then its completion, which the
   * effect returned waits for, as a call waits before it has applied anything (`waiting`, with `told`).
   */
  readonly afterJobs: <T>(then: () => void, told?: Deferred.Deferred<T>) => Effect.Effect<void>
  /**
   * In a thunk that has checked the end: a message of a subscription given to the engine, and how its call waits once
   * it is applied, for the job of its step and those before, whole, though another fiber dies meanwhile; or for the
   * defects, where the step died. A message `update` rejects is listed in `ignored`.
   */
  readonly apply: (source: Source<Key>, message: Message) => Effect.Effect<void>
  /**
   * As `apply`, for a call that waits, in another fiber, to be told what it heard: `tell` is given how the call waits
   * for the job, and called before the message is applied, so that the call is told before any death the message
   * meets, and waits for its job (`waiting`).
   */
  readonly applyFor: (source: Source<Key>, message: Message, tell: (applied: Effect.Effect<void>) => void) => void
  /**
   * Applies a message of the test's as a dispatch: once the register is checked, in a thunk that checks the end,
   * `decide` is called and gives the call's effect, through `applying` where it applies `message`, which waits as
   * `apply` waits. A message `update` rejects ends the call with `rejected`.
   */
  readonly dispatch: (
    decide: (
      applying: (message: Message, rejected: () => Effect.Effect<void>) => Effect.Effect<void>
    ) => Effect.Effect<void>
  ) => Effect.Effect<void>
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
  // A death fails the wait, unless the call was told what it heard as it came (`waiting`).
  const orDead = <A, E, R>(wait: Effect.Effect<A, E, R>, told: () => boolean = () => false) =>
    Effect.raceFirst(
      wait,
      Effect.andThen(register.died, Effect.suspend(() => told() ? wait : failedOr(Effect.never)))
    )
  const submit = <A, E, R>(decide: () => Effect.Effect<A, E, R>, refused: Effect.Effect<A, E, R> = Effect.interrupt) =>
    Effect.suspend(() => engine.ended() ? refused : decide())
  // Added to in place, and copied as they are read: a copy at each message would make a long test quadratic.
  const events: Array<Event> = []
  const ignored: Array<Message> = []
  // The completions of the jobs that only tell that are not done yet: the end interrupts them, since a job it stops
  // before it is done does not tell.
  const undelivered = new Set<Deferred.Deferred<void>>()
  // What the engine's thunk tells of the message `apply` gives it, read by `apply` as `send` returns: what it came to,
  // told only once its state is current, with its keys. Written only by `stepped`, on this stack, into the box of the
  // call that gave the message last: each call reads its own, since the release that ends `send` may wake, on this
  // stack, a fiber that applies another message, as a command's answer, before `send` returns.
  let arrival: { arrived: Opt.Option<Arrived<State, Command, Event>> } = { arrived: Opt.none() }
  const stepped = (step: Engine.Stepped<State, Command, Key, Event>) => {
    if (step._tag === "Arrived") {
      arrival.arrived = Opt.some(step.arrived)
      if (step.arrived._tag === "Applied") events.push(...step.arrived.events)
      return
    }
    stage.ledger = listenedTo(stage.ledger, step.gone, step.fresh)
  }
  const told = (then: () => void = () => undefined): Deferred.Deferred<void> => {
    const done = Deferred.makeUnsafe<void>()
    undelivered.add(done)
    engine.after(() => {
      then()
      undelivered.delete(done)
      Deferred.doneUnsafe(done, Exit.void)
    })
    return done
  }
  // A death that comes once the call is told what it heard, in the thunk that applies its message (`applyFor`), as a
  // defect of the model of its state, leaves the call to what it was told: its message is applied, and it waits for
  // its job. That thunk may run inside the job the call waits for, which wakes a subscription on its stack: the fiber
  // of effects then applies the message, as a job that only tells may (`docs/invariants.md`).
  const waiting = <A, T = A>(deferred: Deferred.Deferred<A>, told?: Deferred.Deferred<T>) =>
    orDead(
      Deferred.await(deferred),
      () => told === undefined ? Deferred.isDoneUnsafe(deferred) : Deferred.isDoneUnsafe(told)
    )
  // The pure half of a step is the engine's, called in a thunk that has checked the end: what it came to decides what
  // the call waits for, the job of its step and those before. A step that a defect stopped leaves the call to the
  // defect: `update` or `subscriptions` threw, which the engine recorded where it happened, or the run had died. A
  // defect of a later model is recorded by the engine where its listener reads it, and the step goes on whole.
  const applying = (
    source: Source<Key>,
    message: Message,
    rejected: Opt.Option<() => Effect.Effect<void>>
  ): Effect.Effect<void> => {
    const own: typeof arrival = { arrived: Opt.none() }
    arrival = own
    engine.send(message, source)
    const { arrived } = own
    if (Opt.isNone(arrived)) return failedOr(Effect.never)
    const step = arrived.value
    switch (step._tag) {
      case "Dead":
        return failedOr(Effect.never)
      // No call gives the engine a message whose start is no longer active: `hear` fails on a key gone from the
      // current state, and the ledger forgets a start in the thunk that stops it, so that `hearNext` hears nothing
      // more of it.
      case "Dropped":
        return Effect.void
      case "Ignored":
        if (Opt.isSome(rejected)) return rejected.value()
        ignored.push(message)
        break
      case "Applied":
        accepted(message, step)
    }
    return Deferred.await(told())
  }
  const apply = (source: Source<Key>, message: Message) => applying(source, message, Opt.none())
  const applyFor = (source: Source<Key>, message: Message, tell: (applied: Effect.Effect<void>) => void) => {
    const applied = Deferred.makeUnsafe<Effect.Effect<void>>()
    tell(Effect.flatten(Deferred.await(applied)))
    Deferred.doneUnsafe(applied, Exit.succeed(apply(source, message)))
  }
  const dispatch = (
    decide: (
      applying: (message: Message, rejected: () => Effect.Effect<void>) => Effect.Effect<void>
    ) => Effect.Effect<void>
  ) => failedOr(submit(() => decide((message, rejected) => applying(fromDispatch, message, Opt.some(rejected)))))
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
  // first step, for a `run` interrupted to stop it, waits until a `run` gives it the effect of the command, and runs it
  // as the engine's fiber does (`commandFiber`), interruptible throughout: an interruption that lands before the thunk
  // of the answer leaves it unapplied, and the root makes one without the run's mark a defect. The thunk leaves what
  // its `run` does last, the wait for the job of the answer, and then applies the answer, as `applyFor` tells a call
  // before its message: so a death that the answer meets, as a defect of its model, finds the `run` told, and the
  // `run` waits for the job of the answer. Nobody awaits `answer` before the fiber has ended, so nothing resumes on
  // the stack before the answer is applied. The command is no longer under way from that thunk on. Refused, as the
  // stage has ended, or as its run was interrupted before it and cancelled it (`Ledger.settle`), the answer is applied
  // by nobody: its fiber ends with nothing to do, since one that interrupts itself is a defect. However the fiber
  // ends, the command is no longer under way.
  const answering = (command: Command): Effect.Effect<void> => {
    const parked: Parked<Message, CommandServices> = { fiber: Deferred.makeUnsafe(), given: Deferred.makeUnsafe() }
    stage.ledger = Ledger.owe(stage.ledger, [{ command, handle: parked }])
    return Effect.flatMap(Effect.fiber, (own) => {
      // The engine forks it to run what this function returns, which succeeds with nothing and cannot fail.
      Deferred.doneUnsafe(parked.fiber, Exit.succeed(own as Fiber.Fiber<void>))
      return Effect.flatMap(Deferred.await(parked.given), ({ answer, context, effect, ticket }) => {
        // What the `run` does last is the wait for the job of the answer, once it is applied, and nothing otherwise:
        // with no answer, or one refused. The completion that follows the fiber's body leaves an earlier one as it is.
        return commandFiber(
          register,
          effect,
          (message: Message) =>
            submit(() => {
              const settled = Ledger.settle(stage.ledger, ticket)
              if (Opt.isNone(settled)) return Effect.void
              stage.ledger = settled.value
              applyFor(fromCommand, message, (applied) => Deferred.doneUnsafe(answer, Exit.succeed(applied)))
              return Effect.void
            }, Effect.void)
        ).pipe(
          Effect.provideContext(context),
          Effect.andThen(Deferred.succeed(answer, Effect.void)),
          Effect.ensuring(Effect.sync(() => {
            stage.ledger = Opt.getOrElse(Ledger.settle(stage.ledger, ticket), () => stage.ledger)
          })),
          Effect.asVoid
        )
      })
    })
  }
  // What a `run` waits for once it has given its command: the fiber's end, its root and its record included, and then
  // what it left to do last, the wait for the job of its answer. Raced with a death until the fiber has told the call
  // what it left (`answer`): from then on, the call waits for the job of its answer whole, as `apply` waits.
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
    Effect.flatMap(Effect.map(Effect.context<CommandNeeds>(), withExternalSpan), (context) =>
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
            : Effect.map(orDead(answered(taking), () => Deferred.isDoneUnsafe(taking.answer)), (answer) => ({
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
  const finish = Effect.suspend(() => Deferred.await(told()))
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
        yield* Effect.forEach(
          [...stage.ledger.underWay.values(), ...stage.ledger.cancelled],
          ({ handle }) => Deferred.interrupt(handle.fiber),
          { discard: true }
        )
        yield* Effect.suspend(last)
      })
      // A defect of the program comes first, as the run keeps first what ended it, then what the scenario ended with,
      // but for the defects already among them, by their identity.
      let owed = stage.ledger
      // Suspended, so that a scenario that throws before it returns its effect still meets the end.
      const result = yield* Effect.exit(restore(Effect.suspend(() => scenario))).pipe(
        // The commands under way and those cancelled are read as the end is marked, before anything else of the end:
        // what happens while the end waits changes nothing of them.
        Effect.tap(() =>
          engine.end(() => {
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
    events: () => [...events],
    ignored: () => [...ignored],
    deadOr: failedOr,
    waiting,
    submit,
    afterJobs: (then, heard) => waiting(told(then), heard),
    apply,
    applyFor,
    dispatch,
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
