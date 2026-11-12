import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as HashMap from 'effect/HashMap'
import * as Inspectable from 'effect/Inspectable'
import * as Opt from 'effect/Option'
import * as Queue from 'effect/Queue'
import * as Scope from 'effect/Scope'
import { ProgramDefect } from '../defect.ts'
import { applyIn, diesIn } from '../engine.ts'
import { describeByTag } from '../log.ts'
import { runCommandOf, type Shape, startOf, subscriptionsOf } from '../program.ts'
import type { Subscription } from '../subscription.ts'
import { appendStep, isRejected, type Step } from '../update.ts'

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
   * end of the scenario, when it was interrupted before the command answered: commands cannot be cancelled.
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
   * the test until the key goes away and comes back. Fails the test when nothing listens under `key` in the
   * current state, and when the test has played that subscription with `hear`, until the key goes away and comes
   * back. It waits as long as the subscription does.
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

type Heard<Message> = Readonly<{ message: Message; last: boolean }>

// What `hearNext` keeps of a subscription it started: `waiting`, the calls waiting for a message, `asked`, the
// messages asked for and not heard yet, `ended` once it heard the last one. A call interrupted while it waits leaves
// what it asked for to the next one.
type Opened<Message> = {
  readonly fiber: Fiber.Fiber<void>
  readonly asks: Queue.Queue<void>
  readonly heard: Queue.Queue<Heard<Message>>
  waiting: number
  asked: number
  ended: boolean
}

// A start of a key, as the run keeps one, with the subscription listed when the key appeared, which the run starts
// then, `gone` once the key has gone away. It is heard one way: the test plays it with `hear` (`scripted`), or
// `hearNext` runs its subscription (`opened`), never both, since the run hears one subscription per start. A message
// the test adds to one that runs, or a subscription run from its start after the test heard it, is a history no run
// makes.
type Start<Message, R> = {
  readonly subscription: Subscription<Message, R>
  opened: Opt.Option<Opened<Message>>
  scripted: boolean
  gone: boolean
}

type Current<State, Message, Event> = Readonly<{
  state: State
  events: ReadonlyArray<Event>
  ignored: ReadonlyArray<Message>
}>

// A step of the loop, with the services of the fiber of the test's that asked for it, and where its result goes.
type Request = Readonly<{ step: Effect.Effect<unknown>; done: Deferred.Deferred<unknown> }>

/**
 * Rehearses `program` without a runtime, step by step, and returns what `scenario` returns. As in `drive`, the
 * test acts through what the models show; unlike it, nothing runs by itself: each command waits until the test
 * runs it, through the program's `runCommand` with the services provided, and each subscription message is one
 * the test says was heard, or the next one its subscription sends when the test asks for it. So the test decides what happens while a command is under way, and when its answer
 * arrives. Since the test decides when each message arrives, a message it sends from the current model is applied
 * to the state that model shows, and a rejection is a control that does nothing: it fails the test, as an error
 * `update` throws does, being a defect of the program. A command's or a subscription's message may no longer
 * apply when it arrives: as when the program runs, it is ignored, and listed in `ignored`. A command still pending
 * or under way when `scenario` ends fails the test, and so does one whose `run` was interrupted before it answered:
 * commands cannot be cancelled, and its answer would still arrive. Subscriptions are read on each new state, as
 * the run reads them, so a state whose subscriptions are a defect fails the test, as it ends the run, a key whose
 * `Equal` throws against a key of the state before included; a command or a subscription that interrupts itself is
 * a defect too, as in the run. Messages that arrive together, from fibers of the test's, are applied one at a time,
 * as the run takes them: each waits for the state the one before left, the release of the subscriptions it stopped
 * included, and `send` selects on the model of that state. A message once sent is applied whole, even when the
 * fiber that sent it is interrupted meanwhile. A defect of the program fails the rehearsal as it ends the run,
 * whichever fiber of the test's it reached, one nobody joins included, and however the rehearsal ends: what the
 * test does after it fails with it.
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
  // The defects of the program, wherever they happened, each once: the run dies of the first, so the rehearsal fails
  // with them at its end, and every step asked for after the first fails with them, as nothing happens in a run that
  // died. The tool's own failures of a call (nothing to send, a control that does nothing) are the caller's alone.
  const died: Array<Cause.Die> = []
  const record = (exit: Exit.Exit<unknown, unknown>) =>
    Effect.sync(() => {
      if (Exit.isSuccess(exit)) return
      for (const reason of exit.cause.reasons) {
        if (
          Cause.isDieReason(reason) && reason.defect instanceof ProgramDefect
          && !died.some(({ defect }) => defect === reason.defect)
        ) died.push(reason)
      }
    })
  const watched = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.onExit(effect, record)
  const deadOr = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.suspend(() => Arr.isArrayNonEmpty(died) ? Effect.failCause(Cause.fromReasons<never>(died)) : effect)
  // The keys of the current state, each with its start, as the run keeps them: a key that stays keeps its start as
  // it is, and one that went away takes it with it. Keys are compared only in `subscriptions`, as in the run.
  let active = HashMap.empty<unknown, Start<Message, R>>()
  // Where the loop and the subscriptions `hearNext` starts are forked, so that they outlive the fiber of the test's
  // that asked for them, as the run's loop and subscriptions outlive whoever dispatched. Closed at the end, however
  // the rehearsal ends, once what it holds is stopped.
  const forks = yield* Scope.make()
  // Interrupts them together, as the run stops the keys that went away, and fails the step on a defect of what they
  // release.
  const stop = (stopping: Iterable<Opened<Message>>) =>
    Effect.forEach(stopping, ({ fiber }) => Effect.andThen(Fiber.interrupt(fiber), Fiber.await(fiber)), {
      concurrency: 'unbounded',
    }).pipe(Effect.flatMap((exits) => {
      const dies = exits.flatMap((exit) => Exit.isFailure(exit) ? exit.cause.reasons.filter(Cause.isDieReason) : [])
      return Arr.isArrayNonEmpty(dies) ? Effect.failCause(Cause.fromReasons<never>(dies)) : Effect.void
    }))
  // Read on each new state and compared with the keys of the state before, as the run reconciles them, though only
  // `hear` and `hearNext` act on them: a state whose subscriptions are a defect ends the run, and so does a key
  // whose `Equal` throws against a key of the state before.
  const listen = (state: State) =>
    Effect.sync(() => {
      const listed = subscriptions(state)
      const gone = Arr.filter(Arr.fromIterable(active), ([key]) => !HashMap.has(listed, key))
      let next = HashMap.empty<unknown, Start<Message, R>>()
      for (const [key, subscription] of listed) {
        const kept = HashMap.get(active, key)
        next = HashMap.set(
          next,
          key,
          Opt.isSome(kept) ? kept.value : { subscription, opened: Opt.none(), scripted: false, gone: false },
        )
      }
      active = next
      return Arr.flatMap(gone, ([, start]) => {
        start.gone = true
        return Opt.toArray(start.opened)
      })
    }).pipe(diesIn('subscriptions'), Effect.flatMap(stop))
  yield* listen(from.state)
  // Written only by the loop, but for `pending`, which `run` takes a command from at once, and the loop adds to when
  // it writes a state, so that neither writes over the other.
  let now: Now = { state: from.state, events: [], ignored: [] }
  let pending: ReadonlyArray<Command> = from.commands ?? []
  // One loop applies every message, one at a time, as the run's loop takes them: the fibers of the test's only offer
  // it a step and wait for its result, so that a message that stops a subscription waits for its release before its
  // state is written, one that arrives meanwhile waits for that state, and an interruption of whoever asked never
  // splits a step.
  const requests = yield* Queue.unbounded<Request>()
  const undelivered = new Set<Deferred.Deferred<unknown>>()
  const loop = yield* Queue.take(requests).pipe(
    Effect.flatMap(({ step, done }) =>
      Effect.flatMap(Effect.exit(watched(deadOr(step))), (exit) =>
        Effect.andThen(Deferred.done(done, exit), Effect.sync(() => undelivered.delete(done))))
    ),
    Effect.forever,
    Effect.forkIn(forks),
  )
  const submit = <A, RA>(step: Effect.Effect<A, never, RA>) =>
    Effect.flatMap(Effect.context<RA>(), (context) =>
      Effect.flatMap(Deferred.make<unknown>(), (done) => {
        undelivered.add(done)
        return Effect.as(
          Queue.offer(requests, { step: Effect.provideContext(step, context), done }),
          done as Deferred.Deferred<A>,
        )
      }))
  const ask = <A, RA>(step: Effect.Effect<A, never, RA>) => Effect.flatMap(submit(step), Deferred.await)
  const applyNow = (message: Message, onRejected: () => Effect.Effect<void>) =>
    Effect.suspend(() => {
      const before = now
      return Effect.flatMap(applyIn(program.update, message, before.state), (result) => {
        if (isRejected(result)) return onRejected()
        return Effect.andThen(
          result.state === before.state ? Effect.void : listen(result.state),
          Effect.sync(() => {
            const { commands, events } = appendStep({ ...before, commands: pending }, result)
            now = { ...before, state: result.state, events }
            pending = commands
          }),
        )
      })
    })
  // From the world: it may arrive when it no longer applies.
  const arriveNow = (message: Message) =>
    applyNow(message, () =>
      Effect.sync(() => {
        now = { ...now, ignored: [...now.ignored, message] }
      }))
  // There is no renderer: the test reads the model where the run's renderer would, and a defect of `makeModel` is
  // in `'render'` all the same.
  const modelOf = (state: State) => Effect.sync(() => program.makeModel(state)).pipe(diesIn('render'))
  // Selected on the model of the state it applies to, in the loop.
  const send = (select: (model: Model) => Opt.Option<Message>) =>
    Effect.flatMap(modelOf(now.state), (shown) =>
      Opt.match(select(shown), {
        onNone: () => Effect.die(new Error('The model does not show what the test sends', { cause: shown })),
        onSome: (message) =>
          applyNow(message, () =>
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
    Effect.sync(() => HashMap.get(active, key)).pipe(
      diesIn('subscriptions'),
      Effect.flatMap(Opt.match({ onNone: () => Effect.die(nothingListensUnder(key)), onSome: Effect.succeed })),
    )
  const untilItComesBack = 'until its key goes away and comes back'
  const notEnded = (key: unknown, each: Opened<Message>) =>
    each.ended
      ? Effect.die(
        new Error(
          `The subscription under ${Inspectable.toStringUnknown(key, 0)} has ended: it sends nothing `
            + untilItComesBack,
        ),
      )
      : Effect.succeed(each)
  // `hear` plays the subscription of a start that `hearNext` has not run.
  const script = (key: unknown, start: Start<Message, R>) =>
    Opt.match(start.opened, {
      onNone: () =>
        Effect.sync(() => {
          start.scripted = true
        }),
      onSome: (each) =>
        Effect.andThen(
          notEnded(key, each),
          Effect.die(
            new Error(
              `The subscription under ${Inspectable.toStringUnknown(key, 0)} runs under hearNext: only it sends `
                + `messages under its key, ${untilItComesBack}`,
            ),
          ),
        ),
    })
  // Started as the run starts a subscription, but held after each message until a `hearNext` asks for one: between
  // two of them, it waits where the run's would wait for the loop to take its message. Its last message follows the
  // end of its scope, as in the run.
  const open = Effect.fnUntraced(function*(key: unknown, start: Start<Message, R>) {
    const asks = yield* Queue.unbounded<void>()
    const heard = yield* Queue.unbounded<Heard<Message>>()
    const fiber = yield* Queue.take(asks).pipe(
      Effect.andThen(Channel.runForEach(start.subscription, (message: Message) =>
        Queue.offer(heard, { message, last: false }).pipe(Effect.andThen(Queue.take(asks))))),
      Effect.scoped,
      diesIn('subscription', () => ({ key })),
      Effect.flatMap((last) => Queue.offer(heard, { message: last, last: true })),
      Effect.asVoid,
      watched,
      Effect.forkIn(forks),
    )
    const each: Opened<Message> = { fiber, asks, heard, waiting: 0, asked: 0, ended: false }
    start.opened = Opt.some(each)
    return each
  })
  // Looked up, and started, in the loop, so that the key is the current state's and two calls start it once.
  const opening = (key: unknown) =>
    Effect.flatMap(startUnder(key), (start) => {
      if (start.scripted) {
        return Effect.die(
          new Error(
            `The test plays the subscription under ${Inspectable.toStringUnknown(key, 0)} with hear: hearNext would `
              + `start it again, which the run does not do ${untilItComesBack}`,
          ),
        )
      }
      return Effect.map(
        Opt.isSome(start.opened) ? notEnded(key, start.opened.value) : open(key, start),
        (each) => ({ start, each }),
      )
    })
  const hearNext = Effect.fnUntraced(function*(key: unknown) {
    const { start, each } = yield* ask(opening(key))
    // The subscription stopped, its key gone or the scenario ended, sends nothing more to wait for; a defect of it
    // ends the wait, as it ends the run.
    const stopped = () =>
      Effect.die(
        new Error(
          `The subscription under ${Inspectable.toStringUnknown(key, 0)} was stopped while hearNext waited for its `
            + 'message: its key went away, or the scenario ended',
        ),
      )
    const ends = Effect.flatMap(Fiber.await(each.fiber), (exit) => {
      if (Exit.isSuccess(exit)) return Effect.never
      return Cause.hasInterruptsOnly(exit.cause) ? stopped() : Effect.failCause(exit.cause)
    })
    // A message once taken is given to the loop before anything can interrupt the call: what it applies, it applies
    // whole.
    const applied = yield* Effect.uninterruptibleMask((restore) =>
      Effect.suspend(() => {
        each.waiting++
        if (each.asked >= each.waiting) return Effect.void
        each.asked++
        return Queue.offer(each.asks, undefined)
      }).pipe(
        Effect.andThen(restore(Effect.raceFirst(Queue.take(each.heard), ends))),
        Effect.ensuring(Effect.sync(() => {
          each.waiting--
        })),
        Effect.flatMap(({ message, last }) => {
          each.asked--
          each.ended = last
          // Applied only while its start is: what a start sends after its key went away does not reach `update`,
          // as in the run.
          return submit(Effect.suspend(() => start.gone ? stopped() : Effect.as(arriveNow(message), message)))
        }),
      )
    )
    return yield* Deferred.await(applied)
  })
  // The commands that left `pending` and have not answered yet, and those whose `run` was interrupted before they
  // answered: commands cannot be cancelled, so in the run each of them would still answer.
  const underWay = new Set<Readonly<{ command: Command }>>()
  const cancelled: Array<Command> = []
  const run = (select: (command: Command) => boolean) =>
    Effect.uninterruptibleMask((restore) =>
      deadOr(Effect.suspend(() => {
        // Taken at once, so that two calls never take the same command.
        const index = pending.findIndex(select)
        if (index === -1) return Effect.die(new Error(`No pending command matches (pending: ${describeAll(pending)})`))
        const command = pending[index] as Command
        pending = Arr.remove(pending, index)
        const running = { command }
        underWay.add(running)
        return restore(Effect.suspend(() => runCommand(command)).pipe(
          Effect.scoped,
          diesIn('command'),
          watched,
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              cancelled.push(command)
            })
          ),
        )).pipe(
          Effect.flatMap(Opt.match({
            onNone: () => Effect.succeedNone,
            onSome: (message) => Effect.asSome(submit(arriveNow(message))),
          })),
          Effect.ensuring(Effect.sync(() => underWay.delete(running))),
          Effect.map((answer) => ({ command, answer })),
        )
      }))
    ).pipe(
      Effect.flatMap(({ command, answer }) =>
        Opt.match(answer, {
          onNone: () => Effect.succeed(command),
          onSome: (done) => Effect.as(Deferred.await(done), command),
        })
      ),
    )
  const runAll: Effect.Effect<void, never, Exclude<R, Scope.Scope>> = Effect.suspend(() =>
    pending.length === 0 ? Effect.void : Effect.andThen(run(() => true), runAll)
  )
  const rehearsal: Rehearsal<State, Model, Message, Command, Event, R> = {
    state: Effect.sync(() => now.state),
    model: Effect.suspend(() => watched(modelOf(now.state))),
    send: (select) => ask(Effect.suspend(() => send(select))),
    pending: Effect.sync(() => pending),
    run,
    runAll,
    // Looked up and applied at once, so that the key is the current state's.
    hear: (key, message) =>
      ask(startUnder(key).pipe(Effect.flatMap((start) => script(key, start)), Effect.andThen(arriveNow(message)))),
    hearNext,
    events: Effect.sync(() => now.events),
    ignored: Effect.sync(() => now.ignored),
  }
  // However the rehearsal ends, it stops the loop, and what `hearNext` started, as the end of the run interrupts its
  // fibers, and fails with the defects of the program it has not failed with yet: what a subscription releases as it
  // stops, and what reached a fiber of the test's that nobody joined.
  const end = Effect.fnUntraced(function*(exit: Exit.Exit<unknown, unknown>) {
    yield* Fiber.interrupt(loop)
    yield* Effect.forEach(undelivered, Deferred.interrupt, { discard: true })
    // What they die of is recorded as they end.
    yield* Effect.exit(stop(Arr.flatMap(Arr.fromIterable(HashMap.values(active)), ({ opened }) => Opt.toArray(opened))))
    yield* Scope.close(forks, Exit.void)
    const known = Exit.isFailure(exit) ? exit.cause.reasons.filter(Cause.isDieReason).map(({ defect }) => defect) : []
    const left = died.filter(({ defect }) => !known.includes(defect))
    if (Arr.isArrayNonEmpty(left)) return yield* Effect.failCause(Cause.fromReasons<never>(left))
  })
  const result = yield* Effect.onExit(scenario(rehearsal), end)
  if (cancelled.length > 0) {
    return yield* Effect.die(
      new Error(
        `Commands whose run was interrupted before they answered: ${describeAll(cancelled)}. A command cannot be `
          + 'cancelled: its answer would still arrive',
      ),
    )
  }
  if (underWay.size > 0) {
    const running = Arr.map(Arr.fromIterable(underWay), ({ command }) => command)
    return yield* Effect.die(new Error(`Commands still under way when the scenario ended: ${describeAll(running)}`))
  }
  if (pending.length > 0) {
    return yield* Effect.die(new Error(`Commands still pending when the scenario ended: ${describeAll(pending)}`))
  }
  return result
})

const nothingListensUnder = (key: unknown) =>
  new Error(`Nothing listens under ${Inspectable.toStringUnknown(key, 0)} in the current state`)

const describeAll = (values: ReadonlyArray<unknown>) =>
  values.length === 0 ? 'none' : values.map((value) => String(describeByTag(value))).join(', ')
