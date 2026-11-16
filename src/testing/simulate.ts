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
 * the run reads them, so a state whose subscriptions are a defect fails the test, as it ends the run, a key whose
 * `Equal` throws against a key of the state before included; a command that interrupts itself is a defect too, as
 * in the run. A rejection of one of `messages` fails the test with a defect, and so does an error `update` throws; a
 * command's message that `update` rejects no longer applies: it is ignored, as when the program runs, and listed in
 * `ignored`. Each command completes in the state its message left, so an ignored message is usually a bug, unless
 * commands started together are meant to exclude one another: a test says which by asserting `ignored`.
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
  // A command runs in a fiber of its own, called where it is decided, and awaited, its exit then taken as the
  // simulation's (`Fiber.await`, whose interruption leaves the fiber running, `docs/premises.md`; a `Fiber.join`'s
  // interruption is not documented): interrupted, the simulation stops it
  // as the run does, with its mark, and fails with what it dies of as it releases, first. Run in the fiber of whoever
  // interrupts the simulation, it would be stopped as that fiber, which may have interrupted a fiber before. Its scope
  // is the run's (`scopedIn`), so that what it releases is given the exit the run gives it: its defect with where.
  const runOne = (deaths: Deaths, command: Command) =>
    Effect.uninterruptibleMask((restore) =>
      Effect.sync(() => runCommand(command)).pipe(
        diesIn('command'),
        // Interruptible by its own say, whatever its fork makes of the region it is forked in.
        Effect.flatMap((effect) => Effect.forkChild(Effect.interruptible(effect.pipe(scopedIn(deaths, 'command'))))),
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
