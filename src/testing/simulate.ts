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
 * applies `messages` in order. Every command runs through `runCommand` as soon as its message is applied, and
 * the message it produces is applied before anything else, as if each command completed at once. As when the
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
  const runCommands = Effect.fnUntraced(function*(
    commands: ReadonlyArray<Command>,
    simulation: Current,
  ): Effect.fn.Return<Current, never, Exclude<R, Scope.Scope>> {
    let current: Current = { ...simulation, commands: [...simulation.commands, ...commands] }
    for (const command of commands) {
      const message = yield* Effect.suspend(() => runCommand(command)).pipe(Effect.scoped, diesIn('command'))
      if (Opt.isSome(message)) {
        current = yield* apply(
          message.value,
          current,
          (unchanged) => Effect.succeed({ ...unchanged, ignored: [...unchanged.ignored, message.value] }),
        )
      }
    }
    return current
  })
  const apply = (
    message: Message,
    simulation: Current,
    onRejected: (unchanged: Current) => Effect.Effect<Current>,
  ): Effect.Effect<Current, never, Exclude<R, Scope.Scope>> =>
    Effect.suspend(() => {
      const result = update(message)(simulation.state)
      if (isRejected(result)) return onRejected(simulation)
      // The commands are listed as they run, by `runCommands`: only the state and the events are folded here.
      return Effect.andThen(
        result.state === simulation.state ? Effect.void : listen(result.state),
        runCommands(result.commands ?? [], {
          ...simulation,
          ...appendStep(simulation, { state: result.state, events: result.events ?? [] }),
          messages: [...simulation.messages, message],
        }),
      )
    })
  return Effect.fnUntraced(function*(
    messages: ReadonlyArray<Message>,
    from: Step<State, Command>,
  ): Effect.fn.Return<Current, never, Exclude<R, Scope.Scope>> {
    yield* listen(from.state)
    let current = yield* runCommands(from.commands ?? [], {
      state: from.state,
      messages: [],
      commands: [],
      events: [],
      ignored: [],
    })
    for (const [index, message] of messages.entries()) {
      current = yield* apply(
        message,
        current,
        () => Effect.die(unexpectedRejection(index, message)),
      )
    }
    return current
  })
}
