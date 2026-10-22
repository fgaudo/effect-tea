import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Ref from 'effect/Ref'
import type * as Scope from 'effect/Scope'
import { describeByTag } from '../log.ts'
import { type Dispatch, rootOffers, tokenOf } from '../offer.ts'
import { runCommandOf, type Shape, subscriptionsOf } from '../program.ts'
import { RejectedInput, type Revision } from '../rejection.ts'
import { isRejected, type Step } from '../update.ts'
import type { Action } from './action.ts'

/**
 * A rehearsal of a program, without a runtime: nothing happens unless the test does it. The test acts on what the
 * current model offers, decides when each command runs and what each subscription sends, and reads the result
 * at any point.
 */
export type Rehearsal<State, Model, Message, Command, Event = never, R = never> = Readonly<{
  /** The current state. */
  state: Effect.Effect<State>
  /** The model of the current state, with offers that this rehearsal applies. */
  model: Effect.Effect<Model>
  /**
   * Does the action that `select` finds on the current model, as a user would; fails the test when the model
   * offers none.
   */
  send: (select: (model: Model) => Opt.Option<Action>) => Effect.Effect<void>
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
  /** The events `update` raised for the program's parent, in order. */
  events: Effect.Effect<ReadonlyArray<Event>>
  /**
   * The messages `update` rejected as stale: a command's or a subscription's message, or an offer the state has
   * moved past, in order.
   */
  ignored: Effect.Effect<ReadonlyArray<Message>>
}>

/** Where a rehearsal starts: the program's `init` when left out. */
export type RehearseOptions<State, Command> = Readonly<{ from?: Step<State, Command> }>

type Current<State, Message, Command, Event> = Readonly<{
  state: State
  revision: Revision
  pending: ReadonlyArray<Command>
  events: ReadonlyArray<Event>
  ignored: ReadonlyArray<Message>
}>

/**
 * Rehearses `program` without a runtime, step by step, and returns what `scenario` returns. As in `drive`, the
 * test acts only through what the models offer; unlike it, nothing runs by itself: each command waits until the
 * test runs it, through the program's `runCommand` with the services provided, and each subscription message is
 * one the test says was heard. So the test decides what happens while a command is under way, and when its
 * answer arrives. Rejections are judged as when the program runs: an offer the state has moved past, or a late
 * message of a command or a subscription, is stale and ignored; a typed value that the model offered and `update`
 * rejected fails the test, and so do an offer of another run and a command still pending when `scenario` ends,
 * whose answer would still arrive.
 */
export const rehearse = Effect.fnUntraced(function*<State, Model, Message, Command, Event, R, A, E, RS>(
  program: Shape<State, Model, Message, Command, R, Event, unknown>,
  scenario: (rehearsal: Rehearsal<State, Model, Message, Command, Event, R>) => Effect.Effect<A, E, RS>,
  { from = program.init }: RehearseOptions<NoInfer<State>, NoInfer<Command>> = {},
): Effect.fn.Return<A, E, Exclude<R, Scope.Scope> | RS> {
  type Now = Current<State, Message, Command, Event>
  const self = {}
  const runCommand = runCommandOf(program)
  const current = yield* Ref.make<Now>({
    state: from.state,
    revision: 0,
    pending: from.commands ?? [],
    events: [],
    ignored: [],
  })
  // A typed value rejected in its offer's own state never gets here: every rejection left is stale, as in the engine.
  const apply = (message: Message) =>
    Ref.update(current, (now): Now => {
      const result = program.update(message)(now.state)
      if (isRejected(result)) return { ...now, ignored: [...now.ignored, message] }
      return {
        state: result.state,
        revision: result.state === now.state ? now.revision : now.revision + 1,
        pending: [...now.pending, ...(result.commands ?? [])],
        events: [...now.events, ...(result.events ?? [])],
        ignored: now.ignored,
      }
    })
  const dispatch: Dispatch = (offered) =>
    Effect.suspend(() => {
      const { message, revision, run: by, violation } = tokenOf(offered)
      if (by !== self) return Effect.die(new Error('An offer made by another run was dispatched to this one'))
      if (violation) return Effect.die(new RejectedInput({ rejected: message, revision }))
      return apply(message as Message)
    })
  const model = Effect.map(
    Ref.get(current),
    ({ state, revision }) => program.makeModel(state, rootOffers(program.update, state, { run: self, revision })),
  )
  const run = Effect.fnUntraced(function*(select: (command: Command) => boolean) {
    const { pending } = yield* Ref.get(current)
    const index = pending.findIndex(select)
    const command = pending[index]
    if (command === undefined) {
      return yield* Effect.die(new Error(`No pending command matches (pending: ${describeAll(pending)})`))
    }
    yield* Ref.update(current, (now): Now => ({ ...now, pending: Arr.remove(now.pending, index) }))
    const message = yield* Effect.scoped(runCommand(command))
    if (Opt.isSome(message)) yield* apply(message.value)
    return command
  })
  const runAll: Effect.Effect<void, never, Exclude<R, Scope.Scope>> = Effect.flatMap(
    Ref.get(current),
    ({ pending }) => pending.length === 0 ? Effect.void : Effect.andThen(run(() => true), runAll),
  )
  const rehearsal: Rehearsal<State, Model, Message, Command, Event, R> = {
    state: Effect.map(Ref.get(current), (now) => now.state),
    model,
    send: (select) =>
      Effect.flatMap(model, (shown) =>
        Opt.match(select(shown), {
          onNone: () => Effect.die(new Error('The model does not offer what the test sends', { cause: shown })),
          onSome: (action) => action(dispatch),
        })),
    pending: Effect.map(Ref.get(current), (now) => now.pending),
    run,
    runAll,
    hear: (key, message) =>
      Effect.flatMap(Ref.get(current), ({ state }) =>
        HashMap.has(subscriptionsOf(program)(state), key)
          ? apply(message)
          : Effect.die(new Error(`Nothing listens under ${JSON.stringify(key)} in the current state`))),
    events: Effect.map(Ref.get(current), (now) => now.events),
    ignored: Effect.map(Ref.get(current), (now) => now.ignored),
  }
  const result = yield* scenario(rehearsal)
  const { pending } = yield* Ref.get(current)
  if (pending.length > 0) {
    return yield* Effect.die(new Error(`Commands still pending when the scenario ended: ${describeAll(pending)}`))
  }
  return result
})

const describeAll = (values: ReadonlyArray<unknown>) =>
  values.length === 0 ? 'none' : values.map((value) => String(describeByTag(value))).join(', ')
