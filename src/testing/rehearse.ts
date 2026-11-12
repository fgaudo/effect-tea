import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as HashMap from 'effect/HashMap'
import * as Inspectable from 'effect/Inspectable'
import * as Opt from 'effect/Option'
import * as Queue from 'effect/Queue'
import * as Ref from 'effect/Ref'
import type * as Scope from 'effect/Scope'
import * as Semaphore from 'effect/Semaphore'
import { diesIn } from '../engine.ts'
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
   * and applies its message, then returns the command. Fails the test when no pending command matches.
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
   * key that stays, and is interrupted when its key goes away, or when the scenario ends. Its end value is its last
   * message: after it, `hearNext` and `hear` fail the test until the key goes away and comes back. Fails the test
   * when nothing listens under `key` in the current state, and when the test has played that subscription with
   * `hear`, until the key goes away and comes back. It waits as long as the subscription does.
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

// What `hearNext` keeps of a subscription it started: `owed` while a `hearNext` has asked for a message it has not
// heard yet, `ended` once it heard the last one.
type Opened<Message> = {
  readonly fiber: Fiber.Fiber<void>
  readonly asked: Queue.Queue<void>
  readonly heard: Queue.Queue<Heard<Message>>
  owed: boolean
  ended: boolean
}

// A start of a key, as the run keeps one, with the subscription listed when the key appeared, which the run starts
// then. It is heard one way: the test plays it with `hear` (`scripted`), or `hearNext` runs its subscription
// (`opened`), never both, since the run hears one subscription per start. A message the test adds to one that runs,
// or a subscription run from its start after the test heard it, is a history no run makes.
type Start<Message, R> = {
  readonly subscription: Subscription<Message, R>
  opened: Opt.Option<Opened<Message>>
  scripted: boolean
}

type Current<State, Message, Command, Event> = Readonly<{
  state: State
  commands: ReadonlyArray<Command>
  events: ReadonlyArray<Event>
  ignored: ReadonlyArray<Message>
}>

/**
 * Rehearses `program` without a runtime, step by step, and returns what `scenario` returns. As in `drive`, the
 * test acts through what the models show; unlike it, nothing runs by itself: each command waits until the test
 * runs it, through the program's `runCommand` with the services provided, and each subscription message is one
 * the test says was heard, or the next one its subscription sends when the test asks for it. So the test decides what happens while a command is under way, and when its answer
 * arrives. Since the test decides when each message arrives, a message it sends from the current model is applied
 * to the state that model shows, and a rejection is a control that does nothing: it fails the test, as an error
 * `update` throws does, being a defect of the program. A command's or a subscription's message may no longer
 * apply when it arrives: as when the program runs, it is ignored, and listed in `ignored`. A command still pending
 * when `scenario` ends fails the test: its answer would still arrive. Subscriptions are read on each new state, as
 * the run reads them, so a state whose subscriptions are a defect fails the test, as it ends the run, a key whose
 * `Equal` throws against a key of the state before included; a command or
 * a subscription that interrupts itself is a defect too, as in the run. Messages that arrive together, from fibers of
 * the test's, are applied one at a time, as the run takes them: each waits for the state the one before left, the
 * release of the subscriptions it stopped included.
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
  const from = given ?? startOf(program.init, flags)
  type Now = Current<State, Message, Command, Event>
  const runCommand = runCommandOf(program)
  const subscriptions = subscriptionsOf(program)
  // The keys of the current state, each with its start, as the run keeps them: a key that stays keeps its start as
  // it is, and one that went away takes it with it. Keys are compared only in `subscriptions`, as in the run.
  let active = HashMap.empty<unknown, Start<Message, R>>()
  // Interrupts them together, as the run stops the keys that went away, and fails the test on a defect of what
  // they release.
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
          Opt.isSome(kept) ? kept.value : { subscription, opened: Opt.none(), scripted: false },
        )
      }
      active = next
      return Arr.flatMap(gone, ([, { opened }]) => Opt.toArray(opened))
    }).pipe(diesIn('subscriptions'), Effect.flatMap(stop))
  yield* listen(from.state)
  const current = yield* Ref.make<Now>({
    state: from.state,
    commands: from.commands ?? [],
    events: [],
    ignored: [],
  })
  // One message at a time, as the run's loop takes them: a message that stops a subscription waits for its release
  // before its state is written, and one that arrives meanwhile waits for that state.
  const exclusively = Semaphore.withPermit(yield* Semaphore.make(1))
  const apply = (message: Message, onRejected: (now: Now) => Effect.Effect<Now>) =>
    exclusively(Effect.flatMap(Ref.get(current), (now) => {
      const result = program.update(message)(now.state)
      if (isRejected(result)) return Effect.flatMap(onRejected(now), (next) => Ref.set(current, next))
      return Effect.andThen(
        result.state === now.state ? Effect.void : listen(result.state),
        Ref.set(current, { ...now, ...appendStep(now, result) }),
      )
    }))
  // From the world: it may arrive when it no longer applies.
  const arrive = (message: Message) =>
    apply(message, (now) => Effect.succeed({ ...now, ignored: [...now.ignored, message] }))
  const fromModel = (message: Message) =>
    apply(message, () =>
      Effect.die(
        new Error(
          `update rejected ${
            String(describeByTag(message))
          }, which the model of the same state shows: a control that does nothing. A tap on an older frame is a `
            + 'message applied to a later state: test it with applyAll, or with update itself.',
        ),
      ))
  const model = Effect.map(Ref.get(current), ({ state }) => program.makeModel(state))
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
  // Started as the run starts a subscription, but held after each message until the next `hearNext` asks for one:
  // between two of them, it waits where the run's would wait for the loop to take its message. Its last message
  // follows the end of its scope, as in the run.
  const open = Effect.fnUntraced(function*(key: unknown, start: Start<Message, R>) {
    const asked = yield* Queue.unbounded<void>()
    const heard = yield* Queue.unbounded<Heard<Message>>()
    const fiber = yield* Queue.take(asked).pipe(
      Effect.andThen(Channel.runForEach(start.subscription, (message: Message) =>
        Queue.offer(heard, { message, last: false }).pipe(Effect.andThen(Queue.take(asked))))),
      Effect.scoped,
      diesIn('subscription', () => ({ key })),
      Effect.flatMap((last) => Queue.offer(heard, { message: last, last: true })),
      Effect.asVoid,
      Effect.forkChild,
    )
    const each: Opened<Message> = { fiber, asked, heard, owed: false, ended: false }
    start.opened = Opt.some(each)
    return each
  })
  const hearNext = Effect.fnUntraced(function*(key: unknown) {
    const start = yield* startUnder(key)
    if (start.scripted) {
      return yield* Effect.die(
        new Error(
          `The test plays the subscription under ${Inspectable.toStringUnknown(key, 0)} with hear: hearNext would `
            + `start it again, which the run does not do ${untilItComesBack}`,
        ),
      )
    }
    const each = Opt.isSome(start.opened)
      ? yield* notEnded(key, start.opened.value)
      : yield* open(key, start)
    // Asked once until it is heard: a `hearNext` interrupted while it waits leaves its message to the next one,
    // which does not ask for another.
    yield* Effect.uninterruptible(Effect.suspend(() =>
      each.owed ? Effect.void : Effect.andThen(Queue.offer(each.asked, undefined), Effect.sync(() => {
        each.owed = true
      }))
    ))
    // A defect of the subscription ends the wait, as it ends the run.
    return yield* Effect.uninterruptibleMask((restore) =>
      restore(Effect.raceFirst(Queue.take(each.heard), Effect.andThen(Fiber.join(each.fiber), Effect.never))).pipe(
        Effect.flatMap(({ message, last }) => {
          each.owed = false
          each.ended = last
          return Effect.as(arrive(message), message)
        }),
      )
    )
  })
  const run = Effect.fnUntraced(function*(select: (command: Command) => boolean) {
    // Taken at once, so that two calls never take the same command.
    const command = yield* exclusively(Ref.modify(current, (now): [Opt.Option<Command>, Now] => {
      const index = now.commands.findIndex(select)
      return index === -1
        ? [Opt.none(), now]
        : [Opt.some(now.commands[index] as Command), { ...now, commands: Arr.remove(now.commands, index) }]
    })).pipe(Effect.flatMap(Opt.match({
      onNone: () =>
        Effect.flatMap(Ref.get(current), ({ commands }) =>
          Effect.die(new Error(`No pending command matches (pending: ${describeAll(commands)})`))),
      onSome: Effect.succeed,
    })))
    const message = yield* Effect.suspend(() => runCommand(command)).pipe(Effect.scoped, diesIn('command'))
    if (Opt.isSome(message)) yield* arrive(message.value)
    return command
  })
  const runAll: Effect.Effect<void, never, Exclude<R, Scope.Scope>> = Effect.flatMap(
    Ref.get(current),
    ({ commands }) => commands.length === 0 ? Effect.void : Effect.andThen(run(() => true), runAll),
  )
  const rehearsal: Rehearsal<State, Model, Message, Command, Event, R> = {
    state: Effect.map(Ref.get(current), (now) => now.state),
    model,
    send: (select) =>
      Effect.flatMap(model, (shown) =>
        Opt.match(select(shown), {
          onNone: () => Effect.die(new Error('The model does not show what the test sends', { cause: shown })),
          onSome: fromModel,
        })),
    pending: Effect.map(Ref.get(current), (now) => now.commands),
    run,
    runAll,
    hear: (key, message) =>
      startUnder(key).pipe(Effect.flatMap((start) => script(key, start)), Effect.andThen(arrive(message))),
    hearNext,
    events: Effect.map(Ref.get(current), (now) => now.events),
    ignored: Effect.map(Ref.get(current), (now) => now.ignored),
  }
  const exit = yield* Effect.exit(scenario(rehearsal))
  // The end of the scenario stops what `hearNext` started, as the end of the run interrupts its subscriptions.
  const stopped = yield* Effect.exit(Effect.suspend(() => stop(Arr.flatMap(Arr.fromIterable(HashMap.values(active)), ({ opened }) => Opt.toArray(opened)))))
  const result = yield* exit
  yield* stopped
  const { commands: pending } = yield* Ref.get(current)
  if (pending.length > 0) {
    return yield* Effect.die(new Error(`Commands still pending when the scenario ended: ${describeAll(pending)}`))
  }
  return result
})

const nothingListensUnder = (key: unknown) =>
  new Error(`Nothing listens under ${Inspectable.toStringUnknown(key, 0)} in the current state`)

const describeAll = (values: ReadonlyArray<unknown>) =>
  values.length === 0 ? 'none' : values.map((value) => String(describeByTag(value))).join(', ')
