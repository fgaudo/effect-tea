// `rehearse` runs the program on the engine itself (`engine.ts`), through the handle the run makes (`partsOf` in
// `run.ts`), built with what the fiber of a command and that of a start run: a command waits until a `run` gives it the
// effect `runCommand` returned, and a subscription until a `hearNext` asks it for a message. `init`, the models, the
// thunk, the jobs and their order, the fibers, their roots and records, and the end that stops them are the run's;
// what is left here is what the test decides (`docs/records/one-engine.md`).
import * as Arr from "effect/Array"
import type * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as HashMap from "effect/HashMap"
import * as Opt from "effect/Option"
import * as Scope from "effect/Scope"
import { fromDispatch, type Generation } from "../core.ts"
import * as Engine from "../engine.ts"
import { type AnyProgram, type FlagsOption, listenOf, type Program, runCommandOf } from "../program.ts"
import { partsOf, readEach } from "../run.ts"
import { makeDeaths, startFiber } from "../shell.ts"
import { failure, type Names } from "./failure.ts"
import * as Ledger from "./ledger.ts"
import * as Stage from "./stage.ts"

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
   * @param key - The subscription's key, as the program lists it. A key of a child's subscriptions names the child and
   * its instance, as its parent lists it: `{ _tag: 'Clock', instance: 1, key: 'ticks' }`, and
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

// What a call of `hearNext` is told: the message it heard, that its start has ended, or that its start was stopped
// while it waited, its key gone or the rehearsal ended. Data alone, told by the fiber of effects and by the end, where
// nothing builds a text: the call makes its error of it.
type Told<Message> =
  | Readonly<{ _tag: "Heard"; message: Message }>
  | Readonly<{ _tag: "Ended" }>
  | Readonly<{ _tag: "Stopped" }>

const ended: Told<never> = { _tag: "Ended" }

const stopped: Told<never> = { _tag: "Stopped" }

// A call of `hearNext`, by its identity: the key the test gave, and what it is told, once its job is done.
type Call<Message> = Readonly<{ key: unknown; heard: Deferred.Deferred<Told<Message>> }>

// What the job of a call of `hearNext` decides, which the call turns into its effect: it waits on the start, or the
// run has died, or the test plays the start with `hear`, or the start has ended.
type Opened = "Waits" | "Dead" | "Scripted" | "Ended"

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
  const listenTo = listenOf(program)
  // The register of the run: what the engine's thunk and its fibers die of, the program's defects and what is thrown
  // outside every function of the program alike, as the run keeps them. The tool's own failures of a call (nothing to
  // send, a control that does nothing) are returned to the fiber that made the call, and never die in a fiber of the
  // engine's. The rehearsal fails with what is recorded at its end, and what the test asks for after the first defect
  // fails with it, as nothing happens in a run that died.
  const register = makeDeaths(() => true)
  const { dead } = register
  const deadOr = Stage.deadOr(register)
  type RSOf = Exclude<RS, Scope.Scope>
  type CallOf = Call<Message>
  // The commands, and how each start is heard, by its generation, in the ledger of the stage: a start that appears is
  // unheard and starting, with its asks made, and one that went away is forgotten.
  const staging = Stage.make<State, Message, Command, Event, RC, Key, Start<RSOf>, CallOf>({
    register,
    runCommand: runCommandOf(program),
    listened: (ledger, gone, fresh) =>
      Ledger.listened(
        ledger,
        gone.map(([, generation]) => generation),
        fresh.map(([, generation]) =>
          [generation, { begun: Deferred.makeUnsafe<void>(), asks: { asked: [], wake: undefined } }] as const
        )
      )
  })
  // What the call of a `send` that `update` rejected fails with.
  const doesNothing = (message: Message) => () =>
    Effect.die(
      failure(({ tags }) =>
        `update rejected ${
          tags(message)
        }, which the model of the same state shows: a control that does nothing. A tap on a model drawn before is `
        + "a message applied to a later state: test it with applyAll, or with update itself."
      )
    )
  // In a thunk that has checked the end: while a call waits on the start and a message it sent is not heard, the
  // first call hears the first message, applied as `hear` would apply it, and told once its job is done; its last one
  // tells the calls still waiting that it has ended. A call interrupted once it is told is told all the same: what
  // the message applies, it applies whole.
  const hearHeld = (key: Key, generation: Generation) => {
    while (true) {
      const found = Ledger.hear(stage.ledger, generation)
      if (Opt.isNone(found)) return
      const { call, sent: { message }, ended: told } = found.value
      stage.ledger = found.value.ledger
      stage.apply({ _tag: "Subscription", key, generation }, message, "list", () => {
        for (const { heard } of told) Deferred.doneUnsafe(heard, Exit.succeed(ended))
        Deferred.doneUnsafe(call.heard, Exit.succeed({ _tag: "Heard", message }))
      })
    }
  }
  // The subscription's fiber gives what it sends, applied in its thunk at once when a call waits for it, as the run's
  // applies it as it is sent, and waits for the next ask. Refused once the rehearsal has ended, it waits for the end to
  // stop it, since one that interrupts itself is a defect.
  const sends = (key: Key, generation: Generation, message: Message, last: boolean) =>
    stage.submit(() => {
      stage.ledger = Ledger.send(stage.ledger, generation, { message, last })
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
  const listening = (key: Key, generation: Generation): Effect.Effect<void> => {
    const [start, begun] = Ledger.begin(stage.ledger, generation)
    stage.ledger = begun
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
  const released = (gone: ReadonlyArray<readonly [Key, Generation]>) => {
    const [told, next] = Ledger.release(stage.ledger, gone.map(([, generation]) => generation))
    stage.ledger = next
    for (const { heard } of told) Deferred.doneUnsafe(heard, Exit.succeed(stopped))
  }
  // The handle the run makes, `init` called with the flags and a defect of it recorded in `'init'`, over the engine
  // with the rehearsal's fibers. An `init` that threw leaves no engine: the rehearsal fails with the register.
  const { app, engine } = partsOf(program, { flags }, register, () => undefined, {
    ...staging.told,
    listening,
    released
  })
  if (engine === undefined) return yield* deadOr(Effect.never)
  const stage = staging.on(engine)
  // There is no renderer: the rehearsal reads the model of each state through the handle, as `drive` does, so that
  // the model of each new state is made in the thunk that makes the state, and the first whatever the first keys did,
  // and a defect of `makeModel` is recorded where it is read, in `'render'`, the step going on whole.
  readEach(app, () => undefined)
  yield* deadOr(Effect.void)
  // Selected on the model of the state it applies to, in the thunk that applies it.
  const send = (select: (model: Model) => Opt.Option<Message>) =>
    stage.submit(() => {
      const model = app.model()
      return Opt.match(select(model), {
        onNone: () => Effect.die(new Error("The model does not show what the test sends", { cause: model })),
        onSome: (message) => stage.outcomeOf(stage.apply(fromDispatch, message, "fail"), doesNothing(message))
      })
    })
  // The program's keys are compared with the test's, by their `Equal`: a defect of theirs is in `subscriptions`, as
  // in the run. In a thunk: the key's start, or the effect the call ends with. The test's key stands for the program's
  // where the engine is given a message as a subscription's, whose key only says where it came from.
  const startUnder = (key: unknown): Generation | Effect.Effect<never> => {
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
  const play = (key: unknown, generation: Generation, message: Message): Effect.Effect<void> => {
    const scripted = Ledger.script(stage.ledger, generation)
    switch (scripted._tag) {
      case "Opened":
        return runsUnderHearNext(key)
      case "Ended":
        return hasEnded(key)
      case "Scripted":
        stage.ledger = scripted.ledger
        return stage.outcomeOf(stage.apply({ _tag: "Subscription", key: key as Key, generation }, message, "list"))
    }
  }
  // In one thunk: the key looked up in the current state; a start whose fiber has not begun waited for, and the key
  // looked up again after it, since it may have gone, or come back with another start, so that the start played is
  // always the current state's.
  const hear = (key: unknown, message: Message): Effect.Effect<void> =>
    stage.submit(() => {
      const generation = startUnder(key)
      if (typeof generation !== "number") return generation
      const starting = stage.ledger.starting.get(generation)
      if (starting !== undefined) return Effect.andThen(Deferred.await(starting.begun), hear(key, message))
      return play(key, generation, message)
    })
  // The job of a call of `hearNext`, after the stops of every step before it, and so after the job that begins its
  // start, in a thunk that has checked the end and the register: the call waits on the start and asks it for a
  // message, the start it opens included, so that a later step that stops the start finds the call waiting. A call
  // that left before its job starts nothing: the test no longer asks for it.
  const openFor = (generation: Generation, call: CallOf, context: Context.Context<RSOf>): Opened => {
    const found = Ledger.opening(stage.ledger, generation, call)
    switch (found._tag) {
      case "Left":
        return "Waits"
      case "Open": {
        stage.ledger = Ledger.open(stage.ledger, generation)
        const [asks, asked] = Ledger.ask(stage.ledger, generation, call)
        stage.ledger = asked
        if (asks) ask(found.start.asks, context)
        return "Waits"
      }
      case "Opened": {
        const [asks, asked] = Ledger.ask(stage.ledger, generation, call)
        stage.ledger = asked
        hearHeld(call.key as Key, generation)
        if (asks) ask(found.start.asks, context)
        return "Waits"
      }
      case "Scripted":
        return "Scripted"
      case "Ended":
        return "Ended"
      // Its key went away after the call, before its job: the job that stops its start tells it, once what the start
      // held is released, as a call waiting on the start is told (`released`).
      case "Gone":
        return "Waits"
    }
  }
  // In the call, once its job is done: what it is told, or how it fails.
  const toldOf = (call: CallOf, opened: Opened): Effect.Effect<Told<Message>> => {
    switch (opened) {
      case "Waits":
        return stage.orDead(Deferred.await(call.heard))
      case "Dead":
        return deadOr(Effect.never)
      case "Scripted":
        return Effect.die(playedWithHear(call.key))
      case "Ended":
        return Effect.succeed(ended)
    }
  }
  // The call looks its key up in the current state, is among the calls from then on, and asks for its job, in one
  // thunk; it leaves however it ends: what it is told meanwhile is what it hears, and what it asked for and did not
  // hear is the next call's. A defect of the program, in whichever fiber, ends the wait, as it ends the run.
  const hearNext = Effect.fnUntraced(function*(key: unknown) {
    const context = yield* Effect.context<RSOf>()
    const call: CallOf = { key, heard: yield* Deferred.make<Told<Message>>() }
    const told = yield* stage.submit(() => {
      const generation = startUnder(key)
      if (typeof generation !== "number") return generation
      stage.ledger = Ledger.enter(stage.ledger, call, generation)
      let opened: Opened = "Waits"
      const done = stage.afterJobs(() => {
        if (engine.ended()) return
        opened = dead() ? "Dead" : openFor(generation, call, context)
      })
      return Effect.andThen(Deferred.await(done), Effect.suspend(() => toldOf(call, opened)))
    }).pipe(
      Effect.ensuring(Effect.sync(() => {
        stage.ledger = Ledger.leave(stage.ledger, call)
      }))
    )
    switch (told._tag) {
      case "Heard":
        return told.message
      case "Ended":
        return yield* hasEnded(key)
      case "Stopped":
        return yield* Effect.die(stoppedWhileWaiting(key))
    }
  })
  const run = (select: (command: Command) => boolean) =>
    Effect.flatMap(stage.runFirst(select), (ran) =>
      ran._tag === "Ran"
        ? Effect.succeed(ran.command)
        : Effect.die(failure(({ tags }) => `No pending command matches (pending: ${describeAll(tags, ran.pending)})`)))
  // What the test reads of the state stays readable once the rehearsal died; what it asks of the program, its model
  // included, fails.
  const rehearsal: Rehearsal<State, Model, Message, Command, Event, RC, RS> = {
    state: Effect.sync(() => engine.current()),
    model: deadOr(Effect.sync(() => app.model())),
    send: (select) => deadOr(send(select)),
    pending: Effect.sync(() => Ledger.pendingOf(stage.ledger)),
    run,
    runAll: stage.runAll,
    hear: (key, message) => deadOr(hear(key, message)),
    hearNext: (key) => deadOr(hearNext(key)),
    events: Effect.sync(stage.events),
    ignored: Effect.sync(stage.ignored)
  }
  // Once the engine's fibers are stopped, every call of `hearNext` that has not ended is told, never only what the
  // ledger still says of a start, which the thunk forgets in the transition that stops it. A rehearsal that died
  // checks nothing more: its commands are the run's, which died with it.
  const [result, owed] = yield* stage.play(
    Effect.suspend(() => scenario(rehearsal)),
    () =>
      Effect.forEach(Arr.fromIterable(stage.ledger.calls), ({ heard }) => Deferred.succeed(heard, stopped), {
        discard: true
      })
  )
  // Pending once the engine has finished: a command that a job it finished owes fails the rehearsal too.
  const { cancelled, underWay } = owed
  const pending = Ledger.pendingOf(stage.ledger)
  if (cancelled.length > 0) {
    return yield* Effect.die(
      failure(({ tags }) =>
        `Commands whose run was interrupted before they answered: ${describeAll(tags, cancelled)}. A command cannot be `
        + "cancelled: its answer would still arrive"
      )
    )
  }
  if (underWay.size > 0) {
    const running = Arr.map(Arr.fromIterable(underWay.values()), ({ command }) => command)
    return yield* Effect.die(
      failure(({ tags }) => `Commands still under way when the scenario ended: ${describeAll(tags, running)}`)
    )
  }
  if (pending.length > 0) {
    return yield* Effect.die(
      failure(({ tags }) => `Commands still pending when the scenario ended: ${describeAll(tags, pending)}`)
    )
  }
  return result
})

// The errors of a call that name its key, each made in the call's fiber.
const nothingListensUnder = (key: unknown) =>
  failure((names) => `Nothing listens under ${names.key(key)} in the current state`)

const untilItComesBack = "until its key goes away and comes back"

const hasEnded = (key: unknown) =>
  Effect.die(
    failure((names) => `The subscription under ${names.key(key)} has ended: it sends nothing ${untilItComesBack}`)
  )

const runsUnderHearNext = (key: unknown) =>
  Effect.die(
    failure((names) =>
      `The subscription under ${names.key(key)} runs under hearNext: only it sends messages under its key, `
      + untilItComesBack
    )
  )

const playedWithHear = (key: unknown) =>
  failure((names) =>
    `The test plays the subscription under ${names.key(key)} with hear: hearNext would start it again, which the run `
    + `does not do ${untilItComesBack}`
  )

const stoppedWhileWaiting = (key: unknown) =>
  failure((names) =>
    `The subscription under ${
      names.key(key)
    } was stopped while hearNext waited for its message: its key went away, or the scenario ended`
  )

const describeAll = (tags: Names["tags"], values: ReadonlyArray<unknown>) =>
  values.length === 0 ? "none" : values.map(tags).join(", ")

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
 *       editor._tag === 'Saving' ? Opt.none() : Opt.some({ ...editor.typed, value: 'Ada' })
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
 * @see The guide, "Running".
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
