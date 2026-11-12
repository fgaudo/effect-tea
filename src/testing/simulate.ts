import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import type * as Scope from 'effect/Scope'
import { diesIn } from '../engine.ts'
import { type Interpreter, type ObjectState, runCommandOf, subscriptionsOf } from '../program.ts'
import type { Subscriptions } from '../subscription.ts'
import { appendStep, isRejected, type Step, type Update } from '../update.ts'
import { unexpectedRejection } from './unexpected.ts'

/**
 * Where a simulation ends: the last state, every message `update` accepted and every command it started, in
 * order, every event, and every message of a command that `update` rejected (`ignored`).
 */
export type Simulation<State, Message, Command, Event> = Readonly<{
  state: State
  messages: ReadonlyArray<Message>
  commands: ReadonlyArray<Command>
  events: ReadonlyArray<Event>
  ignored: ReadonlyArray<Message>
}>

/**
 * Runs a program's flow without a runtime: from `from` (e.g. the program's `init`), runs its commands, then
 * applies `messages` in order. Every command runs through `runCommand`, after those started before it, and its
 * message is applied at once: the commands of one step all answer before those their answers start, as when the
 * program runs commands that answer at once. All of them run before the next of `messages`. As when the
 * program runs, each command has a scope of its own, closed before its message is applied. Pass the program's
 * own `runCommand` with its services provided, or one of the test's that answers each command without any.
 * Subscriptions do not run: pass the messages they would send in `messages`. They are read on each new state, as
 * the run reads them, so a state whose subscriptions are a defect fails the test, as it ends the run; a command
 * that interrupts itself is a defect too, as in the run. A rejection of one of `messages`
 * fails the test with a defect, and so does an error `update` throws; a command's message that `update` rejects
 * no longer applies: it is ignored, as when the program runs, and listed in `ignored`. Each command completes in
 * the state its message left, so an ignored message is usually a bug, unless commands started together are meant
 * to exclude one another: a test says which by asserting `ignored`.
 */
export const simulate = <State, Message, Command, Event, R = never>(
  program:
    & Readonly<{ update: Update<State, Message, Command, Event> }>
    & Interpreter<Command, Message, R>
    & Readonly<{ subscriptions?: Subscriptions<State, Message, unknown, unknown> }>
    & ObjectState<State>,
) => {
  type Current = Simulation<State, Message, Command, Event>
  const { update } = program
  const runCommand = runCommandOf(program)
  const subscriptions = subscriptionsOf(program)
  // Read, never run, as the run reads them on each new state: a state whose subscriptions are a defect ends it.
  const listen = (state: State) => Effect.sync(() => void subscriptions(state)).pipe(diesIn('subscriptions'))
  // A message `update` accepts, folded with its step: the commands it starts join `commands`, after those already
  // started, and `runFrom` runs them in that order.
  const apply = (message: Message, simulation: Current): Effect.Effect<Opt.Option<Current>> =>
    Effect.suspend(() => {
      const result = update(message)(simulation.state)
      if (isRejected(result)) return Effect.succeedNone
      const applied: Current = {
        ...simulation,
        ...appendStep(simulation, result),
        messages: [...simulation.messages, message],
      }
      return result.state === simulation.state
        ? Effect.succeedSome(applied)
        : Effect.as(listen(result.state), Opt.some(applied))
    })
  // Runs the commands from `ran` on, oldest first, as the run starts them: those a command's answer starts wait
  // behind those started before it.
  const runFrom = Effect.fnUntraced(function*(
    simulation: Current,
    ran: number,
  ): Effect.fn.Return<Current, never, Exclude<R, Scope.Scope>> {
    let current = simulation
    for (let index = ran; index < current.commands.length; index++) {
      const command = current.commands[index] as Command
      const message = yield* Effect.suspend(() => runCommand(command)).pipe(Effect.scoped, diesIn('command'))
      if (Opt.isNone(message)) continue
      const applied = yield* apply(message.value, current)
      current = Opt.isSome(applied) ? applied.value : { ...current, ignored: [...current.ignored, message.value] }
    }
    return current
  })
  return Effect.fnUntraced(function*(
    messages: ReadonlyArray<Message>,
    from: Step<State, Command>,
  ): Effect.fn.Return<Current, never, Exclude<R, Scope.Scope>> {
    yield* listen(from.state)
    let current = yield* runFrom({
      state: from.state,
      messages: [],
      commands: from.commands ?? [],
      events: [],
      ignored: [],
    }, 0)
    for (const [index, message] of messages.entries()) {
      const applied = yield* apply(message, current)
      if (Opt.isNone(applied)) return yield* Effect.die(unexpectedRejection(index, message))
      current = yield* runFrom(applied.value, current.commands.length)
    }
    return current
  })
}
