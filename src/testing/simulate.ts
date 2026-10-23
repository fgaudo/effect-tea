import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import type * as Scope from 'effect/Scope'
import { type Interpreter, runCommandOf } from '../program.ts'
import { isRejected, type Step, type Update } from '../update.ts'
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
 * Subscriptions do not run: pass the messages they would send in `messages`. A rejection of one of `messages`
 * fails the test with a defect; a command's message that `update` rejects no longer applies: it is ignored, as
 * when the program runs, and listed in `ignored`. Each command completes in the state its message left,
 * so an ignored message is usually a bug, unless commands started together are meant to exclude one another:
 * a test says which by asserting `ignored`.
 */
export const simulate = <State, Message, Command, Event, R = never>(
  program: Readonly<{ update: Update<State, Message, Command, Event> }> & Interpreter<Command, Message, R>,
) => {
  type Current = Simulation<State, Message, Command, Event>
  const { update } = program
  const runCommand = runCommandOf(program)
  const runCommands = Effect.fnUntraced(function*(
    commands: ReadonlyArray<Command>,
    simulation: Current,
  ): Effect.fn.Return<Current, never, Exclude<R, Scope.Scope>> {
    let current: Current = { ...simulation, commands: [...simulation.commands, ...commands] }
    for (const command of commands) {
      const message = yield* Effect.scoped(runCommand(command))
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
      return isRejected(result) ? onRejected(simulation) : runCommands(result.commands ?? [], {
        state: result.state,
        messages: [...simulation.messages, message],
        commands: simulation.commands,
        events: [...simulation.events, ...(result.events ?? [])],
        ignored: simulation.ignored,
      })
    })
  return Effect.fnUntraced(function*(
    messages: ReadonlyArray<Message>,
    from: Step<State, Command>,
  ): Effect.fn.Return<Current, never, Exclude<R, Scope.Scope>> {
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
