import * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"
import { fromDispatch } from "../core.ts"
import * as Engine from "../engine.ts"
import { runCommandOf, type WithRunCommand } from "../program.ts"
import { makeDeaths } from "../shell.ts"
import type { Subscriptions } from "../subscription.ts"
import type { Step, Update } from "../update.ts"
import { unexpectedRejection } from "./failure.ts"
import * as Stage from "./stage.ts"

/**
 * What a simulation ends with.
 *
 * A program without commands leaves `Command` as `never`, and one without events leaves `Event` as `never`.
 *
 * @example
 * ```ts
 * const { state, commands, ignored } = yield* simulate(form, typedAndSaved, form.init)
 * ```
 */
export type Simulated<State, Message, Command = never, Event = never> = {
  /** The last state. */
  readonly state: State
  /** Every message `update` accepted, the test's and the commands' answers, in order. */
  readonly messages: ReadonlyArray<Message>
  /** Every command started, in order, including the commands of the step the simulation started from. */
  readonly commands: ReadonlyArray<Command>
  /** Every event `update` raised, in order. */
  readonly events: ReadonlyArray<Event>
  /** Every command's answer that `update` rejected, in order. */
  readonly ignored: ReadonlyArray<Message>
}

/**
 * Plays a program's flow without running the program, each command answered as soon as it runs.
 *
 * - It takes the test's messages, including those a subscription would send. It fails when `update` rejects one of
 *   the test's messages.
 * - Each command runs after the commands started before it, in a scope of its own. All these commands answer before
 *   the next of the test's messages is applied.
 * - The command answers that `update` rejects are listed in `ignored`.
 * - Subscriptions do not run. It reads the subscriptions on each new state, and fails on a defect there, as the run
 *   dies of one. It asks only for the services of the commands.
 * - It fails on a command that interrupts itself, as the run dies of one.
 * - It starts from the step it is given, and calls no `init`.
 * - A defect of the program fails it with the `ProgramDefect` the run dies with.
 *
 * It takes the program, or the pieces of it a simulation calls: `update`, `subscriptions`, and `runCommand` when it has
 * commands, which alone give the types; the test's messages; and `from`, the step to start from, e.g. the program's
 * `init`. Give it the program's own `runCommand`, with its services provided, or one of the test's that answers each
 * command without any.
 *
 * @returns An effect that runs the commands of `from`, then applies each message in turn, and succeeds with the
 * {@link Simulated}.
 *
 * @example
 * ```ts
 * const { state } = yield* simulate(form, typedAndSaved, form.init).pipe(Effect.provideService(Storage, working))
 * ```
 *
 * @see The guide, "Testing tools", "simulate".
 * @see The guide, "Testing tools", "`simulate`, as the run dies".
 * @see The guide, "Testing tools", "Defects of the program".
 */
export const simulate = Effect.fnUntraced(function*<State, Message, Command = never, Event = never, R = never>(
  program:
    // Never called, and read only for the types: the state of a program is the one its `init` names, as in
    // `Program<…>` and every function that takes a program, and the literal that `update` returns would otherwise be
    // the state of one spread from a typed program, `{ n: number }` for one that names `Readonly<{ n: number }>`.
    & Readonly<{ init?: Step<State, Command> | ((flags: never) => Step<State, Command>) }>
    & Readonly<{ update: Update<State, Message, Command, Event> }>
    // Inferred from `update` alone, as in `Program<…>`.
    & WithRunCommand<Command, NoInfer<Message>, R>
    & Readonly<{ subscriptions: Subscriptions<State, unknown> }>,
  messages: ReadonlyArray<NoInfer<Message>>,
  from: Step<NoInfer<State>, NoInfer<Command>>
): Effect.fn.Return<Simulated<State, Message, Command, Event>, never, Exclude<R, Scope.Scope>> {
  const { update, subscriptions } = program
  const runCommand = runCommandOf(program)
  // The register of the run, as `rehearse` keeps it: the simulation fails with what is recorded at its end.
  const register = makeDeaths(() => true)
  let accepted: ReadonlyArray<Message> = []
  let commands: ReadonlyArray<Command> = from.commands ?? []
  const staging = Stage.make<State, Message, Command, Event, R, unknown>({
    register,
    runCommand,
    accepted: (message, arrived) => {
      accepted = [...accepted, message]
      commands = [...commands, ...arrived.commands]
    }
  })
  // Its subscriptions are read and reconciled on each new state by the engine, as in the run, and never run: the fiber
  // of each start ends at once.
  const stage = staging.on(Engine.build({
    ...staging.told,
    listening: () => Effect.void,
    deaths: register,
    init: from,
    update,
    subscriptions
  }))
  yield* stage.deadOr(Effect.void)
  // The commands run oldest first until none is pending, the first step's, then each of the test's messages is
  // applied as a dispatch, and the commands run again.
  const [state] = yield* stage.play(Effect.gen(function*() {
    yield* stage.runAll
    for (const [index, message] of messages.entries()) {
      yield* stage.deadOr(stage.submit(() =>
        stage.outcomeOf(
          stage.apply(fromDispatch, message, "fail"),
          () => Effect.die(unexpectedRejection(index, message))
        )
      ))
      yield* stage.runAll
    }
    return stage.engine.current()
  }))
  return { state, messages: accepted, commands, events: stage.events(), ignored: stage.ignored() }
})
