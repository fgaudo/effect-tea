import * as Arr from 'effect/Array'
import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import { identity } from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import * as Inspectable from 'effect/Inspectable'
import * as Opt from 'effect/Option'
import * as Ref from 'effect/Ref'
import type * as Scope from 'effect/Scope'
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
   * Applies `message` as the subscription under `key` would send it; fails the test when nothing listens under
   * `key` in the current state. Keys compare by value, as the engine compares them; a child's key is under its
   * name, as its parent lists it (`['Clock', 'ticks']`, with the id for children by id).
   */
  hear: (key: unknown, message: Message) => Effect.Effect<void>
  /**
   * Runs the subscription under `key`, with the services provided and in a scope of its own, until its first
   * message, or its last one if it ends before sending any, applies that message as `hear` would, and returns it.
   * Fails the test when nothing listens under `key` in the current state. Where `hear` applies a message the test
   * says was heard, `hearNext` hears what the subscription itself says first.
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
 * the test says was heard. So the test decides what happens while a command is under way, and when its answer
 * arrives. Since the test decides when each message arrives, a message it sends from the current model is applied
 * to the state that model shows, and a rejection is a control that does nothing: it fails the test. A command's or
 * a subscription's message may no longer apply when it arrives: as when the program runs, it is ignored, and
 * listed in `ignored`. A command still pending when `scenario` ends fails the test: its answer would still arrive.
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
  const current = yield* Ref.make<Now>({
    state: from.state,
    commands: from.commands ?? [],
    events: [],
    ignored: [],
  })
  const apply = (message: Message, onRejected: (now: Now) => Effect.Effect<Now>) =>
    Effect.flatMap(Ref.get(current), (now) => {
      const result = program.update(message)(now.state)
      if (isRejected(result)) return Effect.flatMap(onRejected(now), (next) => Ref.set(current, next))
      return Ref.set(current, { ...now, ...appendStep(now, result) })
    })
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
  const listeningUnder = (key: unknown): Effect.Effect<Subscription<Message, R>> =>
    Effect.flatMap(Ref.get(current), ({ state }) =>
      Opt.match(HashMap.get(subscriptionsOf(program)(state), key), {
        onNone: () =>
          Effect.die(new Error(`Nothing listens under ${Inspectable.toStringUnknown(key, 0)} in the current state`)),
        onSome: Effect.succeed,
      }))
  // The first message ends the run through the failure channel; a subscription that ends first succeeds with its
  // last message: either way, the message the subscription says first.
  const firstOf = (subscription: Subscription<Message, R>): Effect.Effect<Message, never, Exclude<R, Scope.Scope>> =>
    Channel.runForEach(subscription, (message: Message) => Effect.fail(message)).pipe(
      Effect.match({ onFailure: identity, onSuccess: identity }),
      Effect.scoped,
    )
  const run = Effect.fnUntraced(function*(select: (command: Command) => boolean) {
    const { commands: pending } = yield* Ref.get(current)
    const index = pending.findIndex(select)
    const command = pending[index]
    if (command === undefined) {
      return yield* Effect.die(new Error(`No pending command matches (pending: ${describeAll(pending)})`))
    }
    yield* Ref.update(current, (now): Now => ({ ...now, commands: Arr.remove(now.commands, index) }))
    const message = yield* Effect.scoped(runCommand(command))
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
      Effect.flatMap(listeningUnder(key), () => arrive(message)),
    hearNext: (key) =>
      Effect.flatMap(listeningUnder(key), (subscription) => Effect.tap(firstOf(subscription), arrive)),
    events: Effect.map(Ref.get(current), (now) => now.events),
    ignored: Effect.map(Ref.get(current), (now) => now.ignored),
  }
  const result = yield* scenario(rehearsal)
  const { commands: pending } = yield* Ref.get(current)
  if (pending.length > 0) {
    return yield* Effect.die(new Error(`Commands still pending when the scenario ended: ${describeAll(pending)}`))
  }
  return result
})

const describeAll = (values: ReadonlyArray<unknown>) =>
  values.length === 0 ? 'none' : values.map((value) => String(describeByTag(value))).join(', ')
