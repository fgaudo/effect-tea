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
import * as Opt from "effect/Option"
import * as Scope from "effect/Scope"
import type { Generation } from "../core.ts"
import { type AnyProgram, type FlagsOption, listenOf, type Program, runCommandOf } from "../program.ts"
import { partsOf, readEach } from "../run.ts"
import { makeDeaths, startFiber, withExternalSpan } from "../shell.ts"
import { failure, type Names } from "./failure.ts"
import * as Ledger from "./ledger.ts"
import * as Stage from "./stage.ts"

/**
 * A rehearsal of a program, which its scenario plays step by step.
 *
 * Nothing reaches `update` by itself: each message comes through one of these calls.
 *
 * A program without commands or events leaves `Command` or `Event` as `never`. `run` and `runAll` ask for
 * `CommandServices`, the services that its commands need, and `hearNext` for `SubscriptionServices`, those that its
 * subscriptions need.
 *
 * - A call applies its message at once. It returns once what the message stops has released what it held, and its
 *   commands are pending. A message sent meanwhile, from another fiber of the test's, applies at once too.
 * - A message applies whole, even when the fiber that sent it is interrupted meanwhile. Its state, its model and its
 *   events show at once, and do not wait for a release under way, its own or one of a message before it.
 * - A call that fails the test fails the fiber that made it. Join a call forked from the scenario, or its failure is
 *   lost.
 * - A fiber detached from the scenario (`Effect.forkDetach`) is beyond the rehearsal's reach: what it asks for once
 *   the rehearsal has ended is interrupted, and a defect it meets then is lost.
 * - After a defect of the program, `send`, `run`, `runAll`, `hear`, `hearNext` and `model` fail with the defect. One
 *   that has applied its message, or its command's answer, waits for the job of that message first.
 *   `state`, `pending`, `events` and `ignored` stay readable.
 *
 * @example
 * ```ts
 * yield* rehearsal.runAll
 * expect(yield* rehearsal.ignored).toEqual([])
 * ```
 *
 * @see The guide, "Testing tools".
 */
export type Rehearsal<
  State,
  Model,
  Message,
  Command = never,
  Event = never,
  CommandServices = never,
  SubscriptionServices = never
> = {
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
   * @see The guide, "Testing tools".
   */
  readonly send: (select: (model: Model) => Opt.Option<Message>) => Effect.Effect<void>
  /**
   * The commands `update` started that have not run yet, oldest first. A step's commands are pending once what it
   * stops has released what it held.
   *
   * @see The guide, "Testing tools".
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
   *   One whose answer is applied returns the command once the job of the answer is done, though a fiber of the
   *   program dies meanwhile, its answer's model among them: the rehearsal then fails with the defect.
   *
   * @see The guide, "Testing tools".
   */
  readonly run: (
    select: (command: Command) => boolean
  ) => Effect.Effect<Command, never, Exclude<CommandServices, Scope.Scope>>
  /**
   * Runs the pending commands, and those they start, until none is left.
   *
   * It runs the oldest pending command again and again, as `run` does, until none is left. An answer that `update`
   * rejects is listed in `ignored`.
   *
   * @see The guide, "Testing tools".
   */
  readonly runAll: Effect.Effect<void, never, Exclude<CommandServices, Scope.Scope>>
  /**
   * Applies a message as the subscription under the key `select` matches would send it, without running the
   * subscription.
   *
   * - `select` is given each key of the current state, as the listing that started its subscription gave it. A key of a
   *   child's subscriptions names the child and its instance, as its parent lists it:
   *   `{ _tag: 'Row', id, instance, key: 'ticks' }`.
   * - It fails the test when `select` matches no key, or more than one, and with what `select` throws.
   * - The test answers for what it says was heard, and for whether the subscription had ended.
   * - A key that has just appeared is heard once its subscription would have started: once what the message before it
   *   stopped has released what it held. The keys are then read again, and `select` given them again.
   * - It fails the test on a key whose subscription `hearNext` runs, until the key goes away and comes back.
   * - After the subscription's end value, `hear` does not hear the key until the key goes away and comes back.
   * - A message that `update` rejects is listed in `ignored`.
   *
   * @param select - Whether a key is the one the test hears, as `(key) => key === 'ticks'`, or
   * `(key) => Equal.equals(key, { _tag: 'Clock', instance: 1, key: 'ticks' })` to compare by value, as the run does.
   * @param message - What the subscription sends, as a message of the program.
   *
   * @see The guide, "Testing tools".
   */
  readonly hear: (select: (key: unknown) => boolean, message: Message) => Effect.Effect<void>
  /**
   * Hears the next message of the subscription under the key `select` matches, applies it as `hear` would, and
   * returns it.
   *
   * - `select` is given each key of the current state, as `hear` gives them, and the test fails when it matches no
   *   key, or more than one, and with what it throws.
   * - The first call on a key starts its subscription, made by the program's `listen` from the key, with the services
   *   provided, in a scope of its own, once what the messages before it stopped has released what it held. The
   *   subscription runs for as long as the key stays in the state, whichever fiber of the test's heard it first.
   * - Each call waits for the subscription's next message, and the message waits for its call. The last message is
   *   the subscription's end value. After it, the key is not heard until the key goes away and comes back. A
   *   `hearNext` that was waiting at the same time as the one that heard the end fails the test.
   * - It fails the test when `hear` has played the key's current start.
   * - A key that goes away interrupts its subscription, and so does the end of the scenario or of the rehearsal,
   *   however it ends. A defect in what the subscription releases then fails the test. What it sent that `update` has
   *   not seen is dropped, as the run drops it, and a `hearNext` still waiting for it, or for its start, fails the
   *   test.
   * - After a defect of the program, `hearNext` fails with the defect, also when it was already waiting for its
   *   message. One whose message is applied returns it once the job of the message is done, though a fiber of the
   *   program dies meanwhile, its message's model among them: the rehearsal then fails with the defect.
   * - Under a `TestClock`, move the clock while `hearNext` waits: race the call against `TestClock.adjust` in a loop.
   *   Time moved before the subscription starts to sleep does not count.
   *
   * @param select - Whether a key is the one the test hears, as `hear` takes it.
   *
   * @see The guide, "Testing tools".
   */
  readonly hearNext: (
    select: (key: unknown) => boolean
  ) => Effect.Effect<Message, never, Exclude<SubscriptionServices, Scope.Scope>>
  /** The events `update` raised for the program's parent, in order. */
  readonly events: Effect.Effect<ReadonlyArray<Event>>
  /**
   * The messages of commands and subscriptions that `update` rejected, in order: an answer that came when the state
   * had moved on, a subscription's message about something no longer there.
   */
  readonly ignored: Effect.Effect<ReadonlyArray<Message>>
}

// What a call of `hearNext` is told: the message it heard, by the thunk that applies it, with how the call waits for
// its job (`applyFor` of the stage); that its start has ended; or that its start was stopped while it waited, its key
// gone or the rehearsal ended. Data alone, told by the fiber of effects and by the end, where nothing builds a text:
// the call makes its error of it.
type Told<Message> =
  | Readonly<{ _tag: "Heard"; message: Message; applied: Effect.Effect<void> }>
  | Readonly<{ _tag: "Ended" }>
  | Readonly<{ _tag: "Stopped" }>

const ended: Told<never> = { _tag: "Ended" }

const stopped: Told<never> = { _tag: "Stopped" }

// A call of `hearNext`, by its identity: the key the test gave, and what it is told, once its job is done.
type Call<Message> = Readonly<{ key: unknown; heard: Deferred.Deferred<Told<Message>> }>

// What the job of a call of `hearNext` decides, which the call turns into its effect: it waits on the start, or the
// test plays the start with `hear`, or the start has ended.
type Opened = "Waits" | "Scripted" | "Ended"

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
    // oxlint-disable-next-line no-restricted-properties -- the wait of a start's fiber for an ask, which is no call's
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
  CommandServices = never,
  SubscriptionServices = never,
  A = unknown,
  E = never,
  R = never,
  Flags = never,
  Key = never
>(
  program: Program<{
    state: State
    model: Model
    message: Message
    command: Command
    commandServices: CommandServices
    subscriptionServices: SubscriptionServices
    event: Event
    flags: Flags
    key: Key
  }>,
  scenario: (
    rehearsal: Rehearsal<State, Model, Message, Command, Event, CommandServices, SubscriptionServices>
  ) => Effect.Effect<A, E, R>,
  ...[{ flags } = {}]: [Flags] extends [never] ? [options?: FlagsOption<never>]
    : [options: FlagsOption<NoInfer<Flags>>]
): Effect.fn.Return<A, E, R> {
  const listenTo = listenOf(program)
  // The register of the run: what the engine's thunk and its fibers die of, the program's defects and what is thrown
  // outside every function of the program alike, as the run keeps them. The tool's own failures of a call (nothing to
  // send, a control that does nothing) are returned to the fiber that made the call, and never die in a fiber of the
  // engine's. The rehearsal fails with what is recorded at its end, and what the test asks for after the first defect
  // fails with it, as nothing happens in a run that died.
  const register = makeDeaths(() => true)
  const deadOr = Stage.deadOr(register)
  type SubscriptionNeeds = Exclude<SubscriptionServices, Scope.Scope>
  type CallOf = Call<Message>
  // The commands, and how each start is heard, by its generation, in the ledger of the stage: a start that appears is
  // unheard and starting, with its asks made, and one that went away is forgotten.
  const staging = Stage.make<State, Message, Command, Event, CommandServices, Key, Start<SubscriptionNeeds>, CallOf>({
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
  // first call hears the first message, applied as `hear` would apply it, and is told so with how it waits for the job
  // of the message, whole; its last one tells the calls still waiting that it has ended. A call interrupted once it is
  // told is told all the same: what the message applies, it applies whole. The call that hears is told before its
  // message is applied, and waits on it; those told of the end, once it is applied, so that none of them sends before
  // the end value is applied.
  const hearHeld = (key: Key, generation: Generation) => {
    while (true) {
      const found = Ledger.hear(stage.ledger, generation)
      if (Opt.isNone(found)) return
      const { call, sent: { message }, ended: told } = found.value
      stage.ledger = found.value.ledger
      stage.applyFor({ _tag: "Subscription", key, generation }, message, (applied) => {
        Deferred.doneUnsafe(call.heard, Exit.succeed({ _tag: "Heard", message, applied }))
      })
      for (const { heard } of told) Deferred.doneUnsafe(heard, Exit.succeed(ended))
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
    stage.dispatch((applying) => {
      const model = app.model()
      return Opt.match(select(model), {
        onNone: () => Effect.die(new Error("The model does not show what the test sends", { cause: model })),
        onSome: (message) => applying(message, doesNothing(message))
      })
    })
  // In a thunk: the one key of the current state that `select` matches, as the program listed it, with its start, or
  // the effect the call ends with. What `select` throws is the test's, and fails the call.
  const startOf = (select: (key: unknown) => boolean): readonly [Key, Generation] | Effect.Effect<never> => {
    const keys = Arr.fromIterable(engine.active().keys)
    const matched = keys.filter(([key]) => select(key))
    if (matched.length === 1) return matched[0]!
    return Effect.die(
      matched.length === 0 ? noKeyMatches(Arr.map(keys, ([key]) => key)) : keysMatch(Arr.map(matched, ([key]) => key))
    )
  }
  // In a thunk that has checked the end and found the start under the key in the current state: the start played,
  // unless `hearNext` runs it, and the message applied.
  const play = (key: Key, generation: Generation, message: Message): Effect.Effect<void> => {
    const scripted = Ledger.script(stage.ledger, generation)
    switch (scripted._tag) {
      case "Opened":
        return runsUnderHearNext(key)
      case "Ended":
        return hasEnded(key)
      case "Scripted":
        stage.ledger = scripted.ledger
        return stage.apply({ _tag: "Subscription", key, generation }, message)
    }
  }
  // In one thunk: the key `select` matches in the current state; a start whose fiber has not begun waited for, as a
  // call waits before it has applied anything, and `select` given the keys again after it, since it may have gone, or
  // come back with another start, so that the start played is always the current state's.
  const hear = (select: (key: unknown) => boolean, message: Message): Effect.Effect<void> =>
    stage.submit(() => {
      const found = startOf(select)
      if (Effect.isEffect(found)) return found
      const [key, generation] = found
      const starting = stage.ledger.starting.get(generation)
      if (starting !== undefined) {
        return Effect.andThen(stage.waiting(starting.begun), hear(select, message))
      }
      return play(key, generation, message)
    })
  // The job of a call of `hearNext`, after the stops of every step before it, and so after the job that begins its
  // start, in a thunk that has checked the end: the call waits on the start and asks it for a message, the start it
  // opens included, so that a later step that stops the start finds the call waiting. A call that left before its job
  // starts nothing: the test no longer asks for it. One whose job comes after a defect, the call still there, opens
  // its start all the same, as a job of the run goes on whole: the call fails with the defect, and nothing the start
  // sends reaches `update` (`arrive` in `core.ts`).
  const openFor = (generation: Generation, call: CallOf, context: Context.Context<SubscriptionNeeds>): Opened => {
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
        return stage.waiting(call.heard)
      case "Scripted":
        return Effect.die(playedWithHear(call.key))
      case "Ended":
        return Effect.succeed(ended)
    }
  }
  // The call finds the key `select` matches in the current state, is among the calls from then on, and asks for its
  // job, in one thunk; it leaves however it ends: what it is told meanwhile is what it hears, and what it asked for and
  // did not hear is the next call's. A defect of the program, in whichever fiber, ends each wait until its message is
  // applied, as it ends the run; once applied, the call waits for the job of its message whole.
  const hearNext = Effect.fnUntraced(function*(select: (key: unknown) => boolean) {
    const context = withExternalSpan(yield* Effect.context<SubscriptionNeeds>())
    const heard = yield* Deferred.make<Told<Message>>()
    let entered: CallOf | undefined
    const [key, told] = yield* stage.submit(() => {
      const found = startOf(select)
      if (Effect.isEffect(found)) return found
      const [key, generation] = found
      const call: CallOf = { key, heard }
      entered = call
      stage.ledger = Ledger.enter(stage.ledger, call, generation)
      let opened: Opened = "Waits"
      const opening = stage.afterJobs(() => {
        if (engine.ended()) return
        opened = openFor(generation, call, context)
      }, heard)
      return Effect.andThen(
        opening,
        Effect.suspend(() => Effect.map(toldOf(call, opened), (told) => [key, told] as const))
      )
    }).pipe(
      Effect.ensuring(Effect.sync(() => {
        if (entered !== undefined) stage.ledger = Ledger.leave(stage.ledger, entered)
      }))
    )
    switch (told._tag) {
      case "Heard":
        yield* told.applied
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
  const rehearsal: Rehearsal<State, Model, Message, Command, Event, CommandServices, SubscriptionServices> = {
    state: Effect.sync(() => engine.current()),
    model: deadOr(Effect.sync(() => app.model())),
    send,
    pending: Effect.sync(() => Ledger.pendingOf(stage.ledger)),
    run,
    runAll: stage.runAll,
    hear: (select, message) => deadOr(hear(select, message)),
    hearNext: (select) => deadOr(hearNext(select)),
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
    const interrupted = Arr.map(cancelled, ({ command }) => command)
    return yield* Effect.die(
      failure(({ tags }) =>
        `Commands whose run was interrupted before they answered: ${
          describeAll(tags, interrupted)
        }. A command cannot be `
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
const noKeyMatches = (keys: ReadonlyArray<unknown>) =>
  failure((names) =>
    `No key of the current state matches what the test selects: its keys are ${
      keys.length === 0 ? "none" : Arr.map(keys, names.key).join(", ")
    }`
  )

const keysMatch = (keys: ReadonlyArray<unknown>) =>
  failure((names) =>
    `More than one key of the current state matches what the test selects: ${Arr.map(keys, names.key).join(", ")}`
  )

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
 * - The test fails when a command is left at the end: under way as the scenario ends, or pending once what the
 *   scenario sent is applied. A command's answer would still arrive, since a command cannot be cancelled.
 * - Each message applies at once, whole, one at a time, whichever fiber of the test's sends it. What it stops releases
 *   what it held before its commands are pending, and before any subscription of a later state starts. Once the
 *   scenario returns, the rehearsal finishes what the messages sent before still had to do. Once it fails or is
 *   interrupted, the rehearsal stops at once.
 * - It reads the subscriptions and makes the model of each new state, as the run and a renderer told of each state
 *   do, and makes the first model even when the first subscriptions die. So a defect there fails it, as the run dies
 *   of one, and so does a command or a subscription that the program interrupts, itself or by another fiber.
 * - A defect of the program fails the rehearsal with the `ProgramDefect` the run dies with, whichever fiber of the
 *   test's it reached, even when the scenario catches it, once what the defect stopped has released what it held.
 *   The defect comes first in the cause, and the rehearsal checks nothing more of its commands. A test that expects
 *   a defect wraps `rehearse` itself.
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
 * @see The guide, "Testing tools".
 * @see The guide, "Running".
 */
export const rehearse = <
  P extends AnyProgram,
  State,
  Model,
  Message,
  Command = never,
  Event = never,
  CommandServices = never,
  SubscriptionServices = never,
  A = unknown,
  E = never,
  R = never,
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
      commandServices: Commanded<P, CommandServices>
      subscriptionServices: Listened<P, SubscriptionServices>
      event: Event
      flags: Flags
      key: Listened<P, Key>
    }>,
  scenario: (
    rehearsal: Rehearsal<
      State,
      Model,
      Message,
      Commanded<P, Command>,
      Event,
      Commanded<P, CommandServices>,
      Listened<P, SubscriptionServices>
    >
  ) => Effect.Effect<A, E, R>,
  ...options: [Flags] extends [never] ? [options?: FlagsOption<never>] : [options: FlagsOption<NoInfer<Flags>>]
): Effect.Effect<A, E, R> => rehearsing(program, scenario, ...options)

// A program without commands gives `Command` and `CommandServices` nothing to be inferred from, and an alias that
// carries one still unfixed leaves the errors and the services of a scenario written
// `Effect.fnUntraced(function*(rehearsal) { … })` `unknown` wherever it reads `rehearsal`. So each is read through
// the program, whose type is always inferred: `never` when it has no `runCommand`, and otherwise inferred as any type,
// from every piece that names it.
type Commanded<P, T> = P extends { readonly runCommand: unknown } ? T : never
// The same for a program without keys, which gives `Key` and `SubscriptionServices` nothing to be inferred from.
type Listened<P, T> = P extends { readonly listen: unknown } ? T : never
