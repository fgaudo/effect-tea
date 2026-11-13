import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as HashMap from 'effect/HashMap'
import * as Inspectable from 'effect/Inspectable'
import * as Opt from 'effect/Option'
import * as Queue from 'effect/Queue'
import * as Scope from 'effect/Scope'
import * as Core from '../core.ts'
import { ProgramDefect } from '../defect.ts'
import { diesIn, makeDeaths, runSubscription, scopedIn } from '../engine.ts'
import { describeByTag } from '../log.ts'
import { runCommandOf, type Shape, startOf, subscriptionsOf } from '../program.ts'
import type { Subscription } from '../subscription.ts'
import type { Step } from '../update.ts'
import * as Ledger from './ledger.ts'

/**
 * A rehearsal of a program, without a runtime: nothing happens unless the test does it. The test acts on what the
 * current model shows, decides when each command runs and what each subscription sends, and reads the result
 * at any point.
 */
export type Rehearsal<State, Model, Message, Command, Event = never, R = never> = Readonly<{
  /** The current state. */
  state: Effect.Effect<State>
  /** The model of the current state. */
  model: Effect.Effect<Model>
  /**
   * Applies the message that `select` finds on the current model, as a control drawn from it would send it.
   * Fails the test when `select` finds none, and when `update` rejects it: a control that the model shows and
   * its own state rejects does nothing.
   */
  send: (select: (model: Model) => Opt.Option<Message>) => Effect.Effect<void>
  /** The commands `update` started that have not run yet, oldest first. */
  pending: Effect.Effect<ReadonlyArray<Command>>
  /**
   * Runs the oldest pending command `select` matches through the program's `runCommand`, in a scope of its own,
   * and applies its message, then returns the command. Fails the test when no pending command matches, and, at the
   * end of the scenario, when it was interrupted before the command answered: commands cannot be cancelled. A
   * defect of the program, in whichever fiber, fails it while the command runs.
   */
  run: (select: (command: Command) => boolean) => Effect.Effect<Command, never, Exclude<R, Scope.Scope>>
  /** Runs the oldest pending command until none is left, the commands they start included. */
  runAll: Effect.Effect<void, never, Exclude<R, Scope.Scope>>
  /**
   * Applies `message` as the subscription under `key` would send it, without running it; fails the test when
   * nothing listens under `key` in the current state, and when `hearNext` runs that subscription, or has heard it
   * end, until the key goes away and comes back. Keys compare by value, as the engine compares them; a child's key
   * is under its name, as its parent lists it (`['Clock', 'ticks']`, with the id for children by id).
   */
  hear: (key: unknown, message: Message) => Effect.Effect<void>
  /**
   * Hears the next message of the subscription under `key`, applies it as `hear` would, and returns it. The
   * subscription is the one listed when its key appeared, as the run starts that one, though the state has changed
   * since. It starts at the first call for its key, with the services provided and in a scope of its own, and
   * waits after each message for the next call; it stays as it is for as long as its key does, as the run keeps a
   * key that stays, whichever fiber of the test's first heard it, and is interrupted when its key goes away, or
   * when the scenario ends: what it sent that `update` has not seen is dropped, as the run drops it, and a call
   * still waiting for it fails the test. Its end value is its last message: after it, `hearNext` and `hear` fail
   * the test until the key goes away and comes back, and so does a call that was waiting with the one that heard it.
   * Fails the test when nothing listens under `key` in the current state, and when the test has played that
   * subscription with `hear`, until the key goes away and comes back. It waits as long as the subscription does, or
   * until a defect of the program, in whichever fiber, fails it.
   */
  hearNext: (key: unknown) => Effect.Effect<Message, never, Exclude<R, Scope.Scope>>
  /** The events `update` raised for the program's parent, in order. */
  events: Effect.Effect<ReadonlyArray<Event>>
  /**
   * The messages of commands and subscriptions that `update` rejected, in order: an answer that came when the
   * state had moved on, an event about something no longer there.
   */
  ignored: Effect.Effect<ReadonlyArray<Message>>
}>

/**
 * Where a rehearsal starts: `from`, or the program's `init`, from `flags` for a program with them, which then
 * needs one of the two.
 */
export type RehearseOptions<State, Command, Flags = never> = [Flags] extends [never]
  ? Readonly<{ from?: Step<State, Command> }>
  : Readonly<{ from: Step<State, Command>; flags?: never }> | Readonly<{ flags: Flags; from?: never }>

// A call of `hearNext`, by its identity, and what the loop tells it: the message it heard, once applied, or none once
// its start has ended.
type Call<Message> = Readonly<{ key: unknown; heard: Deferred.Deferred<Opt.Option<Message>> }>

// What `hearNext` holds of a subscription it started; what it sent and who waits on it are the ledger's
// (`Ledger.Hearing`). A message the test adds to a start that runs, or a subscription run from its start after the
// test heard it, is a history no run makes.
type Opened = Readonly<{ fiber: Fiber.Fiber<void>; asks: Queue.Queue<void> }>

type Current<State, Message, Event> = Readonly<{
  state: State
  revision: Core.Revision
  events: ReadonlyArray<Event>
  ignored: ReadonlyArray<Message>
}>

// A step of the loop, with the services of the fiber of the test's that asked for it, and where its result goes.
type Request = Readonly<{ step: Effect.Effect<unknown>; done: Deferred.Deferred<unknown> }>

/**
 * Rehearses `program` without a runtime, step by step, and returns what `scenario` returns. As in `drive`, the test
 * acts through what the models show; unlike it, nothing runs by itself: each command waits until the test runs it,
 * through the program's `runCommand` with the services provided, and each subscription message is one the test says was
 * heard, or the next one its subscription sends when the test asks for it. So the test decides what happens while a
 * command is under way, and when its answer arrives. Since the test decides when each message arrives, a message it
 * sends from the current model is applied to the state that model shows, and a rejection is a control that does
 * nothing: it fails the test, as an error `update` throws does, being a defect of the program. A command's or a
 * subscription's message may no longer apply when it arrives: as when the program runs, it is ignored, and listed in
 * `ignored`. A command under way when `scenario` ends, or still pending once what the test sent before is applied,
 * fails the test, and so does one whose `run` was interrupted before it answered: commands cannot be cancelled, and its
 * answer would still arrive. Subscriptions are read on each new state, as the run reads them, so a state whose
 * subscriptions are a defect fails the test, as it ends the run, a key whose `Equal` throws against a key of the state
 * before included; a command or a subscription that interrupts itself is a defect too, as in the run. Messages that
 * arrive together, from fibers of the test's, are applied one at a time, as the run takes them: each waits for the
 * state the one before left, the release of the subscriptions it stopped included, and `send` selects on the model of
 * that state. A message once sent is applied whole, even when the fiber that sent it is interrupted meanwhile, or
 * `scenario` returns: what was sent before it returned is applied, and not when it failed or was interrupted. A defect
 * of the program fails the rehearsal as it ends the run, whichever fiber of the test's it reached, one nobody joins
 * included, and however the rehearsal ends: what the test does after it fails with it, and so does a call waiting for a
 * subscription or a command.
 */
export const rehearse = Effect.fnUntraced(function*<
  State,
  Model,
  Message,
  Command = never,
  Event = never,
  R = never,
  A = unknown,
  E = never,
  RS = never,
  Flags = never,
>(
  program: Shape<State, Model, Message, Command, R, Event, unknown, Flags>,
  scenario: (rehearsal: Rehearsal<State, Model, Message, Command, Event, R>) => Effect.Effect<A, E, RS>,
  ...[options = {}]: [Flags] extends [never] ? [options?: RehearseOptions<NoInfer<State>, NoInfer<Command>>]
    : [options: RehearseOptions<NoInfer<State>, NoInfer<Command>, NoInfer<Flags>>]
): Effect.fn.Return<A, E, Exclude<R, Scope.Scope> | RS> {
  const { from: given, flags } = options as Readonly<{ from?: Step<State, Command>; flags?: unknown }>
  const from = given ?? (yield* Effect.sync(() => startOf(program.init, flags)).pipe(diesIn('init')))
  type Now = Current<State, Message, Event>
  const runCommand = runCommandOf(program)
  const subscriptions = subscriptionsOf(program)
  // Each fiber of the rehearsal records the defects of the program it dies of, as the engine's fibers record theirs:
  // the loop, a command's, a subscription's, a read of the model. The run dies of the first, so the rehearsal fails
  // with them at its end, and what the test asks for after the first fails with them, as nothing happens in a run
  // that died. The tool's own failures of a call (nothing to send, a control that does nothing) are the caller's
  // alone, so only a `ProgramDefect` is recorded.
  const register = yield* makeDeaths((defect) => defect instanceof ProgramDefect)
  const { recorded, all: deaths, has: isRecorded, dead } = register
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
  // The keys of the current state, each with its start, as the run keeps them (`Core.reconcile`): a key that stays
  // keeps its start as it is, and one that went away takes it with it. Keys are compared only in `subscriptions`, as
  // in the run. Written only by the loop.
  let active: Core.Active<unknown> = Core.noneActive
  // The commands, and how each start is heard, by its generation, as the run keeps its fibers. Written by every fiber
  // of the test's, each time by one transition in one thunk.
  let ledger = Ledger.start<Command, Subscription<Message, R>, Opened, Call<Message>, Message>(from.commands ?? [])
  const stoppedWhileWaiting = (key: unknown) =>
    new Error(
      `The subscription under ${Inspectable.toStringUnknown(key, 0)} was stopped while hearNext waited for its `
        + 'message: its key went away, or the scenario ended',
    )
  // The calls still waiting on a start that was stopped would wait for ever: they fail, as a call made after the end
  // does.
  const tellStopped = (calls: ReadonlyArray<Call<Message>>) =>
    Effect.forEach(calls, ({ key, heard }) => Deferred.die(heard, stoppedWhileWaiting(key)), { discard: true })
  // Where the loop and the subscriptions `hearNext` starts are forked, so that they outlive the fiber of the test's
  // that asked for them, as the run's loop and subscriptions outlive whoever dispatched. Closed at the end, however
  // the rehearsal ends, once what it holds is stopped.
  const forks = yield* Scope.make()
  // Interrupts them together, as the run stops the keys that went away, and fails the step on a defect of what they
  // release.
  const stop = (stopping: Iterable<Opened>) =>
    Effect.forEach(stopping, ({ fiber }) => Effect.andThen(Fiber.interrupt(fiber), Fiber.await(fiber)), {
      concurrency: 'unbounded',
    }).pipe(Effect.flatMap((exits) => {
      const dies = exits.flatMap((exit) => Exit.isFailure(exit) ? exit.cause.reasons.filter(Cause.isDieReason) : [])
      return Arr.isArrayNonEmpty(dies) ? Effect.failCause(Cause.fromReasons<never>(dies)) : Effect.void
    }))
  // Read on each new state and compared with the keys of the state before, as the run reconciles them, though only
  // `hear` and `hearNext` act on them: a state whose subscriptions are a defect ends the run, and so does a key
  // whose `Equal` throws against a key of the state before. The calls that waited on a start stopped are told once it
  // is released: a defect of its release fails them first, as it ends the run.
  const listen = (state: State) =>
    Effect.sync(() => {
      const { gone, fresh, active: next } = Core.reconcile(active, subscriptions(state))
      active = next
      const [stopping, stopped, listening] = Ledger.listened(
        ledger,
        gone.map(([, generation]) => generation),
        fresh.map(([, subscription, generation]) => [generation, subscription] as const),
      )
      ledger = listening
      return [stopping, stopped] as const
    }).pipe(
      diesIn('subscriptions'),
      Effect.flatMap(([stopping, stopped]) => Effect.andThen(stop(stopping), tellStopped(stopped))),
    )
  yield* listen(from.state)
  // Written only by the loop.
  let now: Now = { state: from.state, revision: 0, events: [], ignored: [] }
  // One loop applies every message, one at a time, as the run's loop takes them: the fibers of the test's only offer
  // it a step and wait for its result, so that a message that stops a subscription waits for its release before its
  // state is written, one that arrives meanwhile waits for that state, and an interruption of whoever asked never
  // splits a step.
  const requests = yield* Queue.unbounded<Request>()
  const undelivered = new Set<Deferred.Deferred<unknown>>()
  // Set in the thunk that takes the scenario's exit: from then on the loop is offered nothing more.
  let ended = false
  const loop = yield* Queue.take(requests).pipe(
    Effect.flatMap(({ step, done }) =>
      Effect.flatMap(Effect.exit(recorded(deadOr(step))), (exit) =>
        Effect.andThen(Deferred.done(done, exit), Effect.sync(() => undelivered.delete(done))))
    ),
    Effect.forever,
    Effect.forkIn(forks),
  )
  // Once the rehearsal has ended, what a fiber of the test's still running asks is refused, and the call is
  // interrupted: nothing would apply it. A subscription's own fiber waits instead (`quiet`) for the end to stop it,
  // since one that interrupts itself is a defect. The check and the offer are one thunk, so that nothing is offered
  // once the scenario's exit is taken, and `offered` runs in it too.
  const submit = <A, RA>(
    step: Effect.Effect<A, never, RA>,
    { offered = () => {}, quiet = false }: Readonly<{ offered?: () => void; quiet?: boolean }> = {},
  ) =>
    Effect.flatMap(Effect.context<RA>(), (context) =>
      Effect.flatMap(Deferred.make<unknown>(), (done) =>
        Effect.suspend(() => {
          undelivered.add(done)
          if (!ended && Queue.offerUnsafe(requests, { step: Effect.provideContext(step, context), done })) {
            offered()
            return Effect.succeed(done as Deferred.Deferred<A>)
          }
          undelivered.delete(done)
          return quiet ? Effect.never : Effect.interrupt
        })))
  const ask = <A, RA>(step: Effect.Effect<A, never, RA>) => Effect.flatMap(submit(step), Deferred.await)
  // A message of a start that is no longer active (`onDropped`) reaches nothing of the program, as in the run: only a
  // message of `hearNext`'s can be one, since `hear` looks its start up in the loop.
  const applyNow = (
    source: Core.Source<unknown>,
    message: Message,
    onRejected: () => Effect.Effect<void>,
    onDropped: () => Effect.Effect<void> = () => Effect.void,
  ) =>
    Effect.suspend(() => {
      const before = now
      return Effect.sync(() => Core.arrive(program.update, before, active, source, message, dead)).pipe(
        diesIn('update', () => ({ on: describeByTag(message) })),
        Effect.flatMap((arrived) => {
          switch (arrived._tag) {
            case 'Dropped':
              return onDropped()
            case 'Dead':
              return deadOr(Effect.never)
            case 'Ignored':
              return onRejected()
            case 'Applied': {
              const { next, changed, commands, events } = arrived
              return Effect.andThen(
                changed ? listen(next.state) : Effect.void,
                Effect.sync(() => {
                  now = { ...before, ...next, events: [...before.events, ...events] }
                  ledger = Ledger.owe(ledger, commands)
                }),
              )
            }
          }
        }),
      )
    })
  // From the world: it may arrive when it no longer applies.
  const arriveNow = (source: Core.Source<unknown>, message: Message, onDropped?: () => Effect.Effect<void>) =>
    applyNow(source, message, () =>
      Effect.sync(() => {
        now = { ...now, ignored: [...now.ignored, message] }
      }), onDropped)
  // There is no renderer: the test reads the model where the run's renderer would, and a defect of `makeModel` is
  // in `'render'` all the same. Its check is the only one before the call, and outside the site: the defects it fails
  // with were wrapped where they happened.
  const modelOf = (state: State) =>
    Effect.suspend(() =>
      dead()
        ? deadOr(Effect.never)
        : calling(() => Effect.succeed(program.makeModel(state))).pipe(diesIn('render'))
    )
  // Selected on the model of the state it applies to, in the loop.
  const send = (select: (model: Model) => Opt.Option<Message>) =>
    Effect.flatMap(modelOf(now.state), (shown) =>
      Opt.match(select(shown), {
        onNone: () => Effect.die(new Error('The model does not show what the test sends', { cause: shown })),
        onSome: (message) =>
          applyNow(fromView, message, () =>
            Effect.die(
              new Error(
                `update rejected ${
                  String(describeByTag(message))
                }, which the model of the same state shows: a control that does nothing. A tap on an older frame is `
                  + 'a message applied to a later state: test it with applyAll, or with update itself.',
              ),
            )),
      }))
  // The program's keys are compared with the test's, by their `Equal`: a defect of theirs is in `subscriptions`, as
  // in the run.
  const startUnder = (key: unknown) =>
    Effect.sync(() => HashMap.get(active.keys, key)).pipe(
      diesIn('subscriptions'),
      Effect.flatMap(Opt.match({
        onNone: () => Effect.die(nothingListensUnder(key)),
        onSome: Effect.succeed,
      })),
    )
  const untilItComesBack = 'until its key goes away and comes back'
  const hasEnded = (key: unknown) =>
    Effect.die(
      new Error(
        `The subscription under ${Inspectable.toStringUnknown(key, 0)} has ended: it sends nothing ${untilItComesBack}`,
      ),
    )
  const runsUnderHearNext = (key: unknown) =>
    Effect.die(
      new Error(
        `The subscription under ${Inspectable.toStringUnknown(key, 0)} runs under hearNext: only it sends messages `
          + `under its key, ${untilItComesBack}`,
      ),
    )
  // `hear` plays the subscription of a start that `hearNext` has not run.
  const script = (key: unknown, generation: Core.Generation) =>
    Effect.suspend(() => {
      const scripted = Ledger.script(ledger, active, generation)
      switch (scripted._tag) {
        case 'Scripted':
          ledger = scripted.ledger
          return Effect.void
        case 'Opened':
          return runsUnderHearNext(key)
        case 'Ended':
          return hasEnded(key)
      }
    })
  // In the loop: while a call waits on the start and a message it sent is not heard, the first call hears the first
  // message, applied as `hear` would apply it, and its last one tells the calls still waiting that it has ended. A
  // call interrupted once it is told is told all the same: what the message applies, it applies whole.
  const heardBy = (key: unknown, generation: Core.Generation): Effect.Effect<void> =>
    Effect.suspend(() => {
      const found = Ledger.hear(ledger, generation)
      if (Opt.isNone(found)) return Effect.void
      const { call, sent: { message, last }, ended: told } = found.value
      ledger = found.value.ledger
      if (last) active = Core.ended(active, generation)
      return Effect.forEach(told, ({ heard }) => Deferred.succeed(heard, Opt.none()), { discard: true }).pipe(
        // Applied only while its start is: what a start sends after its key went away does not reach `update`, as in
        // the run.
        Effect.andThen(Effect.exit(
          arriveNow(
            { _tag: 'Subscription', key, generation },
            message,
            () => Effect.die(stoppedWhileWaiting(call.key)),
          ),
        )),
        Effect.flatMap((exit) => Effect.andThen(Deferred.done(call.heard, Exit.map(exit, () => Opt.some(message))), exit)),
        Effect.andThen(heardBy(key, generation)),
      )
    })
  // The subscription's own fiber gives the loop what it sends, as the run's gives it to the queue, and waits for the
  // next ask: the loop keeps it until a call waits for it.
  const sends = (key: unknown, generation: Core.Generation, message: Message, last: boolean) =>
    submit(
      Effect.suspend(() => {
        ledger = Ledger.send(ledger, generation, { message, last })
        return heardBy(key, generation)
      }),
      { quiet: true },
    )
  // Started as the run starts a subscription, but held after each message until a `hearNext` asks for one: between
  // two of them, it waits where the run's would wait for the loop to take its message. Its last message follows the
  // end of its scope, as in the run.
  const open = Effect.fnUntraced(function*(
    key: unknown,
    generation: Core.Generation,
    subscription: Subscription<Message, R>,
  ) {
    const asks = yield* Queue.unbounded<void>()
    const fiber = yield* Queue.take(asks).pipe(
      Effect.andThen(runSubscription(subscription, (message: Message) =>
        sends(key, generation, message, false).pipe(Effect.andThen(Queue.take(asks))))),
      scopedIn(register, 'subscription', () => ({ key })),
      Effect.flatMap((last) => sends(key, generation, last, true)),
      Effect.asVoid,
      recorded,
      Effect.forkIn(forks),
    )
    return { fiber, asks }
  })
  // The call waits on the start, after the calls waiting already, and asks its subscription for a message unless one
  // asked for is not heard yet; one that left meanwhile waits on nothing.
  const waitOn = (key: unknown, generation: Core.Generation, each: Opened, call: Call<Message>) =>
    Effect.suspend(() => {
      const [asks, asked] = Ledger.ask(ledger, generation, call)
      ledger = asked
      return Effect.andThen(asks ? Queue.offer(each.asks, undefined) : Effect.void, heardBy(key, generation))
    })
  // In the loop, so that the key is the current state's and two calls start it once. A call that left before the
  // loop took its step starts nothing: the test no longer asks for it.
  const hearing = (key: unknown, call: Call<Message>) =>
    Effect.flatMap(startUnder(key), (generation) =>
      Effect.suspend(() => {
        const found = Ledger.opening(ledger, active, generation, call)
        switch (found._tag) {
          case 'Left':
            return Effect.void
          case 'Open':
            return Effect.flatMap(open(key, generation, found.subscription), (each) =>
              Effect.suspend(() => {
                ledger = Ledger.open(ledger, generation, each)
                return waitOn(key, generation, each, call)
              }))
          case 'Opened':
            return waitOn(key, generation, found.handle, call)
          case 'Scripted':
            return Effect.die(
              new Error(
                `The test plays the subscription under ${Inspectable.toStringUnknown(key, 0)} with hear: hearNext `
                  + `would start it again, which the run does not do ${untilItComesBack}`,
              ),
            )
          case 'Ended':
            return hasEnded(key)
          case 'Gone':
            return Effect.die(nothingListensUnder(key))
        }
      }))
  // The call is among those offered from the thunk of its offer on, and leaves however it ends: what the loop tells
  // it meanwhile is what it hears, and what it asked for and did not hear is the next call's. A defect of the program,
  // in whichever fiber, ends the wait, as it ends the run.
  const hearNext = Effect.fnUntraced(function*(key: unknown) {
    const call: Call<Message> = { key, heard: yield* Deferred.make<Opt.Option<Message>>() }
    const heard = yield* submit(hearing(key, call), {
      offered: () => {
        ledger = Ledger.enter(ledger, call)
      },
    }).pipe(
      Effect.flatMap((done) => Effect.andThen(Deferred.await(done), orDead(Deferred.await(call.heard)))),
      Effect.ensuring(Effect.sync(() => {
        ledger = Ledger.leave(ledger, call)
      })),
    )
    return Opt.isSome(heard) ? heard.value : yield* hasEnded(key)
  })
  // The effect of a command, in a fiber of the rehearsal's scope: once it answers, nothing interrupts it before its
  // answer is offered to the loop, and the command is no longer under way from the thunk of the offer on. Refused, as
  // the rehearsal has ended, the answer is applied by nobody, and the command was under way when it ended.
  const answering = <RC>(ticket: Ledger.Ticket, effect: Effect.Effect<Opt.Option<Message>, never, RC>) => {
    const settle = () => {
      ledger = Ledger.settle(ledger, ticket)
    }
    return Effect.uninterruptibleMask((restore) =>
      restore(effect.pipe(scopedIn(register, 'command'))).pipe(
        Effect.flatMap(Opt.match({
          onNone: () => Effect.succeedNone,
          onSome: (message) => Effect.asSome(submit(arriveNow(fromCommand, message), { offered: settle })),
        })),
        Effect.onExit((exit) => Exit.isSuccess(exit) && Opt.isSome(exit.value) ? Effect.void : Effect.sync(settle)),
      )
    )
  }
  // Checks that the rehearsal has not ended and the register, takes the oldest pending command `select` matches, or
  // finds none (`Ledger.take`), and calls `runCommand`, all in one thunk, with no check in front of it; then forks the
  // effect it returned in the rehearsal's scope, nothing interrupting the call in between, and waits for that fiber.
  // Interrupted, the call cancels the command and interrupts its fiber, which may have offered its answer already.
  type Ran =
    | Readonly<{ _tag: 'None'; pending: ReadonlyArray<Command> }>
    | Readonly<{ _tag: 'Ran'; command: Command; answer: Opt.Option<Deferred.Deferred<void>> }>
  const runFirst = (select: (command: Command) => boolean) =>
    Effect.uninterruptibleMask((restore) =>
      Effect.suspend((): Effect.Effect<Ran, never, Exclude<R, Scope.Scope>> => {
        if (dead()) return deadOr(Effect.never)
        if (ended) return Effect.interrupt
        const taking = Ledger.take(ledger, select)
        if (Opt.isNone(taking)) return Effect.succeed({ _tag: 'None', pending: ledger.pending })
        const [{ ticket, command }, taken] = taking.value
        ledger = taken
        return answering(ticket, calling(() => runCommand(command))).pipe(
          Effect.forkIn(forks),
          Effect.flatMap((fiber) =>
            restore(orDead(Fiber.join(fiber))).pipe(
              Effect.onInterrupt(() =>
                Effect.andThen(
                  Effect.sync(() => {
                    ledger = Ledger.cancel(ledger, ticket)
                  }),
                  Fiber.interrupt(fiber),
                )
              ),
            )
          ),
          Effect.map((answer): Ran => ({ _tag: 'Ran', command, answer })),
        )
      })
    ).pipe(
      Effect.tap((ran: Ran) =>
        ran._tag === 'Ran' && Opt.isSome(ran.answer) ? Deferred.await(ran.answer.value) : Effect.void
      ),
    )
  const run = (select: (command: Command) => boolean) =>
    Effect.flatMap(runFirst(select), (ran) =>
      ran._tag === 'Ran'
        ? Effect.succeed(ran.command)
        : Effect.die(new Error(`No pending command matches (pending: ${describeAll(ran.pending)})`)))
  // Ends on a take that finds nothing, never on a count of `pending` made before it: another call may take the last
  // command in between.
  const runAll: Effect.Effect<void, never, Exclude<R, Scope.Scope>> = Effect.flatMap(
    runFirst(() => true),
    (ran) => ran._tag === 'None' ? Effect.void : runAll,
  )
  // What the test reads of the state stays readable once the rehearsal died; what asks the program for more fails.
  const rehearsal: Rehearsal<State, Model, Message, Command, Event, R> = {
    state: Effect.sync(() => now.state),
    model: Effect.suspend(() => recorded(modelOf(now.state))),
    send: (select) => ask(Effect.suspend(() => send(select))),
    pending: Effect.sync(() => ledger.pending),
    run,
    runAll,
    // Looked up and applied at once, so that the key is the current state's.
    hear: (key, message) =>
      ask(startUnder(key).pipe(
        Effect.flatMap((generation) =>
          Effect.andThen(script(key, generation), arriveNow({ _tag: 'Subscription', key, generation }, message))
        ),
      )),
    hearNext,
    events: Effect.sync(() => now.events),
    ignored: Effect.sync(() => now.ignored),
  }
  // A scenario that returned lets the loop finish what it was offered before, in order: a message once sent is applied
  // whole. The queue gives its items in order, so the loop has done them all once it has done this one.
  const finish = Effect.flatMap(Deferred.make<unknown>(), (done) =>
    Effect.andThen(Queue.offer(requests, { step: Effect.void, done }), Deferred.await(done)))
  // However the rehearsal ends, it closes the queue, stops the loop and what `hearNext` started, as the end of the run
  // interrupts its fibers, and waits for them to release what they hold: only then does it read what they died of.
  const end = Effect.gen(function*() {
    yield* Fiber.interrupt(loop)
    yield* Queue.shutdown(requests)
    yield* Effect.forEach(undelivered, Deferred.interrupt, { discard: true })
    // What they die of is recorded as they end.
    const [opened, waiting] = Ledger.opened(ledger)
    yield* Effect.exit(stop(opened))
    yield* tellStopped(waiting)
    yield* Scope.close(forks, Exit.void)
  })
  // A defect of the program comes first, as the run keeps first what ended it, then what the scenario ended with,
  // but for the defects already among them, by their identity. A rehearsal that died checks nothing more: its
  // commands are the run's, which died with it.
  let owed = ledger
  const result = yield* Effect.uninterruptibleMask((restore) =>
    // Suspended, so that a scenario that throws before it returns its effect still meets the end.
    Effect.exit(restore(Effect.suspend(() => scenario(rehearsal)))).pipe(
      // The commands under way and those cancelled are read as the exit is taken, before anything of the end: what
      // happens while the end waits changes nothing of them.
      Effect.tap(() =>
        Effect.sync(() => {
          ended = true
          owed = ledger
        })
      ),
      // One that failed, or was interrupted, stops the loop at once: its result is the failure.
      Effect.tap((exit) => Exit.isSuccess(exit) ? Effect.exit(finish) : Effect.void),
      Effect.tap(end),
      Effect.flatMap((exit) => {
        const dies = deaths()
        if (!Arr.isReadonlyArrayNonEmpty(dies)) return exit
        const rest = Exit.isFailure(exit)
          ? exit.cause.reasons.filter((reason) => !(Cause.isDieReason(reason) && isRecorded(reason.defect)))
          : []
        return Effect.failCause(Cause.fromReasons<E>([...dies, ...rest]))
      }),
    )
  )
  // Pending once the loop has finished: a command that a message it finished starts fails the rehearsal too.
  const { cancelled, underWay } = owed
  const { pending } = ledger
  if (cancelled.length > 0) {
    return yield* Effect.die(
      new Error(
        `Commands whose run was interrupted before they answered: ${describeAll(cancelled)}. A command cannot be `
          + 'cancelled: its answer would still arrive',
      ),
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
})

const fromView: Core.Source<never> = { _tag: 'View' }

const fromCommand: Core.Source<never> = { _tag: 'Command' }

const nothingListensUnder = (key: unknown) =>
  new Error(`Nothing listens under ${Inspectable.toStringUnknown(key, 0)} in the current state`)

const describeAll = (values: ReadonlyArray<unknown>) =>
  values.length === 0 ? 'none' : values.map((value) => String(describeByTag(value))).join(', ')
