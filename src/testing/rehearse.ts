import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as FiberSet from 'effect/FiberSet'
import * as HashMap from 'effect/HashMap'
import * as Inspectable from 'effect/Inspectable'
import * as Opt from 'effect/Option'
import * as Queue from 'effect/Queue'
import * as Scope from 'effect/Scope'
import * as Core from '../core.ts'
import { ProgramDefect } from '../defect.ts'
import type { Written } from '../input.ts'
import { describeByTag } from '../log.ts'
import { type FlagsOption, runCommandOf, type Shape, startOf, subscriptionsOf } from '../program.ts'
import { diesIn, makeDeaths, runSubscription, scopedIn, stopping as stopFiber } from '../shell.ts'
import type { Subscription } from '../subscription.ts'
import * as Ledger from './ledger.ts'
import * as Loop from './loop.ts'

/**
 * A rehearsal of a program, which its scenario plays step by step.
 *
 * Nothing reaches `update` by itself: each message comes through one of these calls.
 *
 * A program without commands or events leaves `Command` or `Event` as `never`. `RC` is the services its commands need,
 * and `RS` those its subscriptions need. `run` and `runAll` ask for `RC`, and `hearNext` for `RS`.
 *
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
 * @see The guide, "Testing tools", "`rehearse` asks for the services of what the test runs".
 * @see The guide, "Testing tools", "Fibers the test forks or detaches".
 * @see The guide, "Testing tools", "After a defect of the program".
 */
export type Rehearsal<State, Model, Message, Command = never, Event = never, RC = never, RS = never> = Readonly<{
  /** The current state. */
  state: Effect.Effect<State>
  /** The model of the current state. */
  model: Effect.Effect<Model>
  /**
   * Applies the message `select` finds on the current model, as a control drawn from it would send it.
   *
   * It sends only what the current model shows. It fails the test when `select` finds nothing, or when `update`
   * rejects the message.
   *
   * @see The guide, "Testing tools", "`rehearse` acts through what the current model shows".
   * @see The guide, "Testing tools", "What fails the test".
   */
  send: (select: (model: Model) => Opt.Option<Message>) => Effect.Effect<void>
  /** The commands `update` started that have not run yet, oldest first. */
  pending: Effect.Effect<ReadonlyArray<Command>>
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
  run: (select: (command: Command) => boolean) => Effect.Effect<Command, never, Exclude<RC, Scope.Scope>>
  /**
   * Runs the pending commands, and those they start, until none is left.
   *
   * It runs the oldest pending command again and again, as `run` does, until none is left. An answer that `update`
   * rejects is listed in `ignored`.
   *
   * @see The guide, "Testing tools", "Each command waits until the test runs it".
   * @see The guide, "Testing tools", "Commands at the end".
   */
  runAll: Effect.Effect<void, never, Exclude<RC, Scope.Scope>>
  /**
   * Applies a message as the subscription under `key` would send it, without running the subscription.
   *
   * - The test answers for what it says was heard, and for whether the subscription had ended.
   * - It fails the test when the key is not in the state. Keys compare by value, as the run compares them.
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
  hear: (key: unknown, message: Heard<Message>) => Effect.Effect<void>
  /**
   * Hears the next message of the subscription under `key`, applies it as `hear` would, and returns it.
   *
   * - The first call on a key starts its subscription, with the services provided, in a scope of its own. The
   *   subscription runs for as long as the key stays in the state.
   * - Each call waits for the subscription's next message. The last message is the subscription's end value. After
   *   it, the key is not heard until the key goes away and comes back. A `hearNext` that was waiting at the same time as
   *   the one that heard the end fails the test.
   * - It fails the test when the key is not in the state, or when `hear` has played the key's current start.
   * - A key that goes away interrupts its subscription. A `hearNext` still waiting for a message of that subscription
   *   fails the test.
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
  hearNext: (key: unknown) => Effect.Effect<Message, never, Exclude<RS, Scope.Scope>>
  /** The events `update` raised for the program's parent, in order. */
  events: Effect.Effect<ReadonlyArray<Event>>
  /**
   * The messages of commands and subscriptions that `update` rejected, in order: an answer that came when the state
   * had moved on, a subscription's message about something no longer there.
   */
  ignored: Effect.Effect<ReadonlyArray<Message>>
}>

/**
 * What a subscription may send of a program's `Message`: all of it but a write into an input, the program's or a
 * child's, `{ _tag: <input>, message: { _tag: 'Written', … } }` however deep, which only a view sends.
 */
type Heard<Message> = 0 extends 1 & Message ? Message
  : Message extends Readonly<{ _tag: string; message: infer Inner }>
    ? [Inner] extends [Unwritten<Inner>] ? Message
    : [Unwritten<Inner>] extends [never] ? never
    : Omit<Message, 'message'> & Readonly<{ message: Unwritten<Inner> }>
  : Message

/** What a parent's wrapped message may hold, as a subscription sends it: no write, at that level or below. */
type Unwritten<Inner> = Inner extends Written<unknown> ? never : Heard<Inner>

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

/**
 * Rehearses a program without a runtime, step by step: the test decides when each message arrives.
 *
 * It takes the program to rehearse; the scenario, what the test does through the {@link Rehearsal} it is given; and
 * its options: `flags`, when the program has them.
 *
 * - It starts from the program's `init`. To start elsewhere, give it the program with another `init`.
 * - It acts through what the current model shows. Commands wait until the test runs them, and a subscription's
 *   message is one the test hears.
 * - The test fails when a command is still pending or under way at the end.
 * - Messages sent from fibers of the test are applied one at a time, each one whole.
 * - A defect of the program fails the rehearsal with the `ProgramDefect` the run dies with, even when the scenario
 *   catches it. The defect comes first in the cause.
 *
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
export const rehearse = Effect.fnUntraced(function*<
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
>(
  program: Shape<State, Model, Message, Command, RC, RS, Event, unknown, Flags>,
  scenario: (rehearsal: Rehearsal<State, Model, Message, Command, Event, RC, RS>) => Effect.Effect<A, E, RT>,
  ...[{ flags } = {}]: [Flags] extends [never] ? [options?: FlagsOption<never>]
    : [options: FlagsOption<NoInfer<Flags>>]
): Effect.fn.Return<A, E, RT> {
  const started = Core.init(yield* Effect.sync(() => startOf(program.init, flags)).pipe(diesIn('init')))
  type Now = Current<State, Message, Event>
  const runCommand = runCommandOf(program)
  const subscriptions = subscriptionsOf(program)
  // Each fiber of the rehearsal records the defects of the program it dies of, as the engine's fibers record theirs:
  // the loop, a command's, a subscription's. The run dies of the first, so the rehearsal fails with them at its end,
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
  // The keys of the current state, each with its start, as the run keeps them (`Core.reconcile`): a key that stays
  // keeps its start as it is, and one that went away takes it with it. Keys are compared only in `subscriptions`, as
  // in the run. Written only by the loop.
  let active: Core.Active<unknown> = Core.noneActive
  // The commands, and how each start is heard, by its generation, as the run keeps its fibers. Written by every fiber
  // of the test's, each time by one transition in one thunk.
  type LedgerOf = Ledger.Ledger<Command, Subscription<Message, RS>, Opened, Call<Message>, Message>
  let ledger: LedgerOf = Ledger.start(started.commands)
  const stoppedWhileWaiting = (key: unknown) =>
    new Error(
      `The subscription under ${Inspectable.toStringUnknown(key, 0)} was stopped while hearNext waited for its `
        + 'message: its key went away, or the scenario ended',
    )
  // The calls still waiting on a start that was stopped would wait for ever: they fail, as a call made after the end
  // does. One told already hears nothing of it.
  const tellStopped = (calls: ReadonlyArray<Call<Message>>) =>
    Effect.forEach(calls, ({ key, heard }) => Deferred.die(heard, stoppedWhileWaiting(key)), { discard: true })
  // Interrupts them together, as the run stops the keys that went away, and waits for their release. A defect of what
  // they release is recorded by the fiber that dies of it, as in the run: the step goes on whole.
  const stop = (stopping: Iterable<Opened>) =>
    Effect.forEach(stopping, ({ fiber }) => stopFiber(fiber), { concurrency: 'unbounded', discard: true })
  // Read on each new state and compared with the keys of the state before, as the run reconciles them, though only
  // `hear` and `hearNext` act on them: a state whose subscriptions are a defect ends the run, and so does a key
  // whose `Equal` throws against a key of the state before. The calls that waited on a start stopped are told once it
  // is released: a defect of its release fails them first, as it ends the run. The keys are read here, and the
  // release is what this returns, so that the step makes its model in between, as the run's renderer draws a state
  // the run has read the subscriptions of, while those it stops release what they hold.
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
      Effect.map(([stopping, stopped]) => Effect.andThen(stop(stopping), tellStopped(stopped))),
    )
  yield* Effect.flatten(listen(started.current.state))
  // Written only by the loop.
  let now: Now = { ...started.current, events: [], ignored: [] }
  // There is no renderer: the model of each new state is made in the step that makes the state, as the run's renderer
  // makes it for each frame it pulls, and a defect of `makeModel` is in `'render'` all the same. The test, which reads
  // every state, is a renderer that pulls every frame. Written only by the loop.
  let shown: Model = yield* Effect.sync(() => program.makeModel(started.current.state)).pipe(diesIn('render'))
  const draw = (state: State) =>
    Effect.sync(() => {
      shown = program.makeModel(state)
    }).pipe(diesIn('render'))
  // From its scope on, nothing interrupts the rehearsal but in its scenario: the scope and the loop forked in it are
  // one region with the end that closes and stops them, as `drive` forks its run, so that an interruption from outside
  // as it sets up meets the end too.
  return yield* Effect.uninterruptibleMask(Effect.fnUntraced(function*(restore) {
    // Where the loop is forked, and the commands and the subscriptions `hearNext` starts are kept, so that they outlive
    // the fiber of the test's that asked for them, as the run's loop and subscriptions outlive whoever dispatched.
    // Closed at the end, however the rehearsal ends, once what it holds is stopped. Made once the program has started,
    // so that a start that dies leaves no scope open.
    const forks = yield* Scope.make()
    // The commands under way, kept as they are forked, so that the end stops them as the run does, with its mark,
    // before it closes the scope, which would interrupt them as the fiber that ends the rehearsal.
    const commands = yield* FiberSet.make<Opt.Option<Deferred.Deferred<void>>, never>().pipe(Scope.provide(forks))
    // The subscriptions `hearNext` started, kept likewise, until each has ended: the end stops those that still run by
    // their fibers, as the end of the run does, never by what the ledger says of them, which forgets a start in the
    // transition that stops it, while the step that stops it may be interrupted before its release has ended.
    const listeners = yield* FiberSet.make<void, never>().pipe(Scope.provide(forks))
    // One loop applies every message, one at a time, as the run's loop takes them: the fibers of the test's only offer
    // it a step and wait for its result, so that a message that stops a subscription waits for its release before its
    // commands are owed, one that arrives meanwhile waits for that release, and an interruption of whoever asked never
    // splits a step. Once the rehearsal has ended, what a fiber of the test's still running asks is refused, and the
    // call is interrupted: nothing would apply it.
    const loop = yield* Loop.make(forks, (step) => recorded(deadOr(step)))
    const { submit, ask } = loop
    // A message of a start that is no longer active reaches nothing of the program, as in the run. None comes here:
    // `hear` looks its start up in the loop, and the ledger forgets a start in the transition that stops it, so that
    // `hearNext` hears nothing more of it.
    const applyNow = (source: Core.Source<unknown>, message: Message, onRejected: () => Effect.Effect<void>) =>
      Effect.suspend(() => {
        const before = now
        return Effect.sync(() => Core.arrive(program.update, before, active, source, message, dead)).pipe(
          diesIn('update', () => ({ on: describeByTag(message) })),
          Effect.flatMap((arrived) => {
            switch (arrived._tag) {
              case 'Dropped':
                return Effect.void
              case 'Dead':
                return deadOr(Effect.never)
              case 'Ignored':
                return onRejected()
              // The state is written, and its model made, before the subscriptions it stops release what they hold,
              // as the run publishes it first; its commands are owed after, as the run starts them after.
              case 'Applied': {
                const { next, changed, commands, events } = arrived
                return Effect.sync(() => {
                  now = { ...before, ...next, events: [...before.events, ...events] }
                }).pipe(
                  Effect.andThen(
                    changed
                      ? Effect.flatMap(listen(next.state), (release) => Effect.andThen(draw(next.state), release))
                      : Effect.void,
                  ),
                  Effect.andThen(Effect.sync(() => {
                    ledger = Ledger.owe(ledger, commands)
                  })),
                )
              }
            }
          }),
        )
      })
    // From the world: it may arrive when it no longer applies.
    const arriveNow = (source: Core.Source<unknown>, message: Message) =>
      applyNow(source, message, () =>
        Effect.sync(() => {
          now = { ...now, ignored: [...now.ignored, message] }
        }))
    // Selected on the model of the state it applies to, in the loop.
    const send = (select: (model: Model) => Opt.Option<Message>) =>
      Effect.suspend(() =>
        Opt.match(select(shown), {
          onNone: () => Effect.die(new Error('The model does not show what the test sends', { cause: shown })),
          onSome: (message) =>
            applyNow(Core.fromDispatch, message, () =>
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
          `The subscription under ${
            Inspectable.toStringUnknown(key, 0)
          } has ended: it sends nothing ${untilItComesBack}`,
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
        const scripted = Ledger.script(ledger, generation)
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
        const { call, sent: { message }, ended: told } = found.value
        ledger = found.value.ledger
        return Effect.forEach(told, ({ heard }) => Deferred.succeed(heard, Opt.none()), { discard: true }).pipe(
          Effect.andThen(Effect.exit(arriveNow({ _tag: 'Subscription', key, generation }, message))),
          Effect.flatMap((exit) =>
            Effect.andThen(Deferred.done(call.heard, Exit.map(exit, () => Opt.some(message))), exit)
          ),
          Effect.andThen(heardBy(key, generation)),
        )
      })
    // The subscription's own fiber gives the loop what it sends, as the run's gives it to the queue, and waits for the
    // next ask: the loop keeps it until a call waits for it. Refused once the rehearsal has ended, it waits (`quiet`)
    // for the end to stop it, since one that interrupts itself is a defect.
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
      subscription: Subscription<Message, RS>,
    ) {
      const asks = yield* Queue.unbounded<void>()
      const fiber = yield* Queue.take(asks).pipe(
        Effect.andThen(runSubscription(subscription, (message: Message) =>
          sends(key, generation, message, false).pipe(Effect.andThen(Queue.take(asks))))),
        scopedIn(register, 'subscription', () => ({ key })),
        Effect.flatMap((last) => sends(key, generation, last, true)),
        Effect.asVoid,
        recorded,
        FiberSet.run(listeners),
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
          const found = Ledger.opening(ledger, generation, call)
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
    // it meanwhile is what it hears, and what it asked for and did not hear is the next call's. A defect of the
    // program, in whichever fiber, ends the wait, as it ends the run.
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
    // the rehearsal has ended, the answer is applied by nobody, and the command was under way when it ended. However
    // the fiber ends, the command is no longer under way.
    const answering = <RC>(ticket: Ledger.Ticket, effect: Effect.Effect<Opt.Option<Message>, never, RC>) => {
      const settle = (before: LedgerOf) => Ledger.settle(before, ticket)
      return Effect.uninterruptibleMask((restore) =>
        restore(effect.pipe(scopedIn(register, 'command'))).pipe(
          Effect.flatMap(Opt.match({
            onNone: () => Effect.succeedNone,
            onSome: (message) =>
              Effect.asSome(submit(arriveNow(Core.fromCommand, message), {
                offered: () => {
                  ledger = settle(ledger)
                },
              })),
          })),
          Effect.ensuring(Effect.sync(() => {
            ledger = settle(ledger)
          })),
        )
      )
    }
    type Ran =
      | Readonly<{ _tag: 'None'; pending: ReadonlyArray<Command> }>
      | Readonly<{ _tag: 'Ran'; command: Command; answer: Opt.Option<Deferred.Deferred<void>> }>
    type Taking =
      | Readonly<{ _tag: 'None'; pending: ReadonlyArray<Command> }>
      | Readonly<{
        _tag: 'Running'
        ticket: Ledger.Ticket
        command: Command
        fiber: Fiber.Fiber<Opt.Option<Deferred.Deferred<void>>>
      }>
    // Checks the register and that the rehearsal has not ended, takes the oldest pending command `select` matches, or
    // finds none (`Ledger.take`), and calls `runCommand`, all in one thunk, with no check in front of it; then forks
    // the effect it returned in the rehearsal's scope. The fiber and how an interrupted call stops it are one
    // primitive: the call cancels the command and interrupts its fiber, which may have offered its answer already.
    const runFirst = (select: (command: Command) => boolean) =>
      Effect.acquireUseRelease(
        Effect.suspend(() => {
          if (dead()) return deadOr(Effect.never)
          if (loop.ended()) return Effect.interrupt
          const taking = Ledger.take(ledger, select)
          if (Opt.isNone(taking)) return Effect.succeed<Taking>({ _tag: 'None', pending: ledger.pending })
          const [{ ticket, command }, taken] = taking.value
          ledger = taken
          // Forked in the acquisition, where nothing interrupts, the command is interruptible all the same
          // (`docs/premises.md`).
          return answering(ticket, calling(() => runCommand(command))).pipe(
            FiberSet.run(commands),
            Effect.map((fiber): Taking => ({ _tag: 'Running', ticket, command, fiber })),
          )
        }),
        (taking): Effect.Effect<Ran> =>
          taking._tag === 'None'
            ? Effect.succeed(taking)
            // Awaited, not joined, as `simulate`'s `runOne` says.
            : Effect.map(orDead(Effect.flatten(Fiber.await(taking.fiber))), (answer) => ({
              _tag: 'Ran',
              command: taking.command,
              answer,
            })),
        (taking, exit) =>
          taking._tag === 'Running' && Exit.hasInterrupts(exit)
            ? Effect.andThen(
              Effect.sync(() => {
                ledger = Ledger.cancel(ledger, taking.ticket)
              }),
              stopFiber(taking.fiber),
            )
            : Effect.void,
      ).pipe(
        Effect.tap((ran) =>
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
    const runAll: Effect.Effect<void, never, Exclude<RC, Scope.Scope>> = Effect.flatMap(
      runFirst(() => true),
      (ran) => ran._tag === 'None' ? Effect.void : runAll,
    )
    // What the test reads of the state stays readable once the rehearsal died; what it asks of the program, its model
    // included, fails.
    const rehearsal: Rehearsal<State, Model, Message, Command, Event, RC, RS> = {
      state: Effect.sync(() => now.state),
      model: deadOr(Effect.sync(() => shown)),
      send: (select) => ask(Effect.suspend(() => send(select))),
      pending: Effect.sync(() => ledger.pending),
      run,
      runAll,
      // Looked up and applied at once, so that the key is the current state's.
      hear: (key, message) =>
        ask(startUnder(key).pipe(
          Effect.flatMap((generation) =>
            // Its type rules out only what no subscription sends.
            Effect.andThen(
              script(key, generation),
              arriveNow({ _tag: 'Subscription', key, generation }, message as Message),
            )
          ),
        )),
      hearNext,
      events: Effect.sync(() => now.events),
      ignored: Effect.sync(() => now.ignored),
    }
    // However the rehearsal ends, it stops the loop and what `hearNext` started, as the end of the run interrupts its
    // fibers, and waits for them to release what they hold: only then does it read what they died of. The step it
    // interrupted may have been stopping a subscription, or telling a call: the end reads the fibers that still run and
    // the calls that have not ended, so that it leaves none of them out, whatever that step had done of its own.
    const end = Effect.gen(function*() {
      yield* loop.stop
      // What they die of is recorded as they end.
      yield* Effect.forEach(listeners, stopFiber, { concurrency: 'unbounded', discard: true })
      yield* tellStopped(Arr.fromIterable(ledger.calls))
      yield* Effect.forEach(commands, stopFiber, { concurrency: 'unbounded', discard: true })
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
      // One that returned lets the loop finish what it was offered before, in order: a message once sent is applied
      // whole. One that failed, or was interrupted, stops the loop at once: its result is the failure.
      Effect.tap((exit) => Exit.isSuccess(exit) ? Effect.exit(loop.finish) : Effect.void),
      Effect.tap(end),
      Effect.flatMap((exit) => Core.endedWith(deaths(), exit)),
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
  }))
})

const nothingListensUnder = (key: unknown) =>
  new Error(`Nothing listens under ${Inspectable.toStringUnknown(key, 0)} in the current state`)

const describeAll = (values: ReadonlyArray<unknown>) =>
  values.length === 0 ? 'none' : values.map((value) => String(describeByTag(value))).join(', ')
