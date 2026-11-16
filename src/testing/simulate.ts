import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Opt from 'effect/Option'
import type * as Scope from 'effect/Scope'
import * as Core from '../core.ts'
import { describeByTag } from '../log.ts'
import { type Interpreter, type ObjectState, runCommandOf, subscriptionsOf } from '../program.ts'
import { type Deaths, diesIn, makeDeaths, scopedIn, stopping } from '../shell.ts'
import type { Subscriptions } from '../subscription.ts'
import type { Step, Update } from '../update.ts'
import { unexpectedRejection } from './unexpected.ts'

/**
 * What a simulation ends with.
 *
 * @example
 * ```ts
 * const { state, commands, ignored } = yield* simulate(form)(typedAndSaved, form.init)
 * ```
 */
export type Simulation<State, Message, Command, Event> = Readonly<{
  /** The last state. */
  state: State
  /** Every message `update` accepted, the test's and the commands' answers, in order. */
  messages: ReadonlyArray<Message>
  /** Every command started, in order, those of the step it started from included. */
  commands: ReadonlyArray<Command>
  /** Every event `update` raised, in order. */
  events: ReadonlyArray<Event>
  /** Every command's answer that `update` rejected, in order. */
  ignored: ReadonlyArray<Message>
}>

/**
 * Plays a program's flow without a runtime, each command answered as soon as it runs.
 *
 * @param program - The program, or the pieces of it a simulation calls: `update`, and `runCommand` and `subscriptions`
 * when it has them. Give it the program's own `runCommand`, with its services provided, or one of the test's that
 * answers each command without any.
 * @returns A function of `messages`, the test's, and of `from`, the step to start from, e.g. the program's `init`. Its
 * effect runs the commands of `from`, then applies each message in turn, and succeeds with the {@link Simulation}.
 *
 * @example
 * ```ts
 * const { state } = yield* simulate(form)(typedAndSaved, form.init).pipe(Effect.provideService(Storage, working))
 * ```
 *
 * @remarks
 * From the guide, "Testing", "`simulate`":
 *
 * `simulate` tests a flow with its commands answered at once, without a runtime.
 *
 * - It takes the test's messages, and among them those a subscription would send.
 * - It fails when `update` rejects one of them.
 * - Each command runs after those started before it. So the commands of one step all answer before those their answers
 *   start, as when the program runs commands that answer at once. All of them run before the next of the test's
 *   messages is applied.
 * - Each command has a scope of its own, as when the program runs. The scope is closed before the command's message is
 *   applied.
 * - The command answers that `update` rejected are listed in `ignored`. Assert `ignored` when one being dropped would
 *   be a bug.
 * - Its subscriptions do not run. What it reads of them is under "precisely".
 * - It starts from the step it is given, and calls no `init`.
 * - It succeeds with the last `state` and, each in order: `messages`, every message `update` accepted, the test's and
 *   the commands' answers; `commands`, every command started, those of the step it started from included; `events`,
 *   every event `update` raised; and `ignored`.
 *
 * From the guide, "Testing", "`simulate`, as the run dies":
 *
 * - Its subscriptions do not run, but it reads them on each new state, as the run does.
 * - It fails on a state whose subscriptions are a defect, as the run dies of one. A key whose `Equal` throws against a
 *   key of the state before is such a defect too.
 * - It fails on a command that interrupts itself, as the run dies of one.
 *
 * From the guide, "Testing", "Defects of the program":
 *
 * A defect of the program fails `simulate`, `rehearse` and `drive` as it ends the run when the program runs. They fail
 * with the `ProgramDefect` the run dies with, in the same `where`, with the same `on` or `key`. That holds wherever the
 * tool calls the program: `init`, `update`, `makeModel`, `subscriptions`, a subscription, `runCommand`. (`simulate`
 * calls no `init`.)
 *
 * **`applyAll` and `dispatchViolations` call `update` without a run**, and fail with the defect itself.
 */
export const simulate = <State, Message, Command, Event, R = never>(
  program:
    & Readonly<{ update: Update<State, Message, Command, Event> }>
    & Interpreter<Command, Message, R>
    & Readonly<{ subscriptions?: Subscriptions<State, Message, unknown, unknown> }>
    & ObjectState<State>,
) => {
  // What a simulation has made so far, but for its state, which `Listening` holds.
  type Current = Omit<Simulation<State, Message, Command, Event>, 'state'>
  const { update } = program
  const runCommand = runCommandOf(program)
  const subscriptions = subscriptionsOf(program)
  // The current state, at its revision, and the keys of the state before, which a new state's are compared with.
  type Listening = { current: Core.Revisioned<State>; active: Core.Active<unknown> }
  // Read, never run, as the run reads them on each new state, and reconciled with those of the state before as the
  // run reconciles them: a state whose subscriptions are a defect ends it, and so does a key whose `Equal` throws
  // against a key of the state before.
  const listen = (listening: Listening) =>
    Effect.sync(() => {
      listening.active = Core.reconcile(listening.active, subscriptions(listening.current.state)).active
    }).pipe(diesIn('subscriptions'))
  // A message `update` accepts, folded with its step: the commands it starts join `commands`, after those already
  // started, and `runFrom` runs them in that order. Nothing dies between the steps of a simulation, which fails on the
  // first defect.
  const apply = (
    source: Core.Source<never>,
    message: Message,
    simulation: Current,
    listening: Listening,
  ): Effect.Effect<Opt.Option<Current>> =>
    Effect.sync(() => Core.arrive(update, listening.current, listening.active, source, message, () => false)).pipe(
      diesIn('update', () => ({ on: describeByTag(message) })),
      Effect.flatMap((arrived) => {
        if (arrived._tag !== 'Applied') return Effect.succeedNone
        listening.current = arrived.next
        const applied: Current = {
          ...simulation,
          messages: [...simulation.messages, message],
          commands: [...simulation.commands, ...arrived.commands],
          events: [...simulation.events, ...arrived.events],
        }
        return arrived.changed ? Effect.as(listen(listening), Opt.some(applied)) : Effect.succeedSome(applied)
      }),
    )
  // A command runs in a fiber of its own, called where it is decided, begun at once as `FiberSet.run` begins it in the
  // run (`startImmediately`, `docs/premises.md`), so that an interruption that reaches the simulation as it awaits finds
  // its effect begun, and awaited, its exit then taken as the simulation's (`Fiber.await`, whose interruption leaves the
  // fiber running, `docs/premises.md`; a `Fiber.join`'s interruption is not documented): interrupted, the simulation
  // stops it as the run does, with its mark, and fails with what it dies of as it releases, first. Run in the fiber of
  // whoever interrupts the simulation, it would be stopped as that fiber, which may have interrupted a fiber before. Its
  // scope is the run's (`scopedIn`), so that what it releases is given the exit the run gives it: its defect with where.
  const runOne = (deaths: Deaths, command: Command) =>
    Effect.uninterruptibleMask((restore) =>
      Effect.sync(() => runCommand(command)).pipe(
        diesIn('command'),
        Effect.flatMap((effect) =>
          Effect.forkChild(effect.pipe(scopedIn(deaths, 'command')), { startImmediately: true })
        ),
        Effect.flatMap((fiber) =>
          Effect.flatMap(Effect.exit(restore(Effect.flatten(Fiber.await(fiber)))), (joined) =>
            Exit.isFailure(joined) && Cause.hasInterrupts(joined.cause)
              ? Effect.andThen(stopping(fiber), Effect.suspend(() => Core.endedWith(deaths.all(), joined)))
              : joined)
        ),
      )
    )
  // Runs the commands from `ran` on, oldest first, as the run starts them: those a command's answer starts wait
  // behind those started before it.
  const runFrom = Effect.fnUntraced(function*(
    deaths: Deaths,
    simulation: Current,
    ran: number,
    listening: Listening,
  ): Effect.fn.Return<Current, never, Exclude<R, Scope.Scope>> {
    let current = simulation
    for (let index = ran; index < current.commands.length; index++) {
      const command = current.commands[index] as Command
      const message = yield* runOne(deaths, command)
      if (Opt.isNone(message)) continue
      const applied = yield* apply(Core.fromCommand, message.value, current, listening)
      current = Opt.isSome(applied) ? applied.value : { ...current, ignored: [...current.ignored, message.value] }
    }
    return current
  })
  return Effect.fnUntraced(function*(
    messages: ReadonlyArray<Message>,
    from: Step<State, Command>,
  ): Effect.fn.Return<Simulation<State, Message, Command, Event>, never, Exclude<R, Scope.Scope>> {
    const started = Core.init(from)
    // What the commands of this simulation die of, recorded as the run's fibers record theirs: one command runs at a
    // time, and the first that dies fails the simulation.
    const deaths = yield* makeDeaths(() => true)
    const listening: Listening = { current: started.current, active: Core.noneActive }
    yield* listen(listening)
    const first: Current = { messages: [], commands: started.commands, events: [], ignored: [] }
    let current = yield* runFrom(deaths, first, 0, listening)
    for (const [index, message] of messages.entries()) {
      const applied = yield* apply(Core.fromDispatch, message, current, listening)
      if (Opt.isNone(applied)) return yield* Effect.die(unexpectedRejection(index, message))
      current = yield* runFrom(deaths, applied.value, current.commands.length, listening)
    }
    return { state: listening.current.state, ...current }
  })
}
