import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Equal from 'effect/Equal'
import * as Opt from 'effect/Option'
import { describeByTag } from './bug.ts'
import type { Command } from './command.ts'
import { isRejected, type Step, type Update } from './update.ts'

/** Applies `messages` in order from `from`, collecting the commands; a rejection fails the test. */
export const applyAll =
  <State, Message, R, Event>(update: Update<State, Message, R, Event>) =>
  (messages: ReadonlyArray<Message>, from: State) =>
    messages.reduce(
      ({ state, commands }, message, index) => {
        const result = update(message)(state)
        if (isRejected(result)) {
          throw new Error(`update rejected message ${index} (${String(describeByTag(message))})`)
        }
        return { state: result.state, commands: [...commands, ...(result.commands ?? [])] }
      },
      { state: from, commands: [] as ReadonlyArray<Command<Message, R>> },
    )

/** Where a simulation ends: the last state, every message `update` accepted in order, and every event. */
export type Simulation<State, Message, Event> = Readonly<{
  state: State
  messages: ReadonlyArray<Message>
  events: ReadonlyArray<Event>
}>

/**
 * Runs a program's flow without a runtime: from `from` (e.g. the program's `init`), runs its commands, then
 * applies `messages` in order. Every command runs as soon as its message is applied, and the message it
 * produces is applied before anything else, as if each command completed at once. Subscriptions do not run:
 * pass the messages they would send in `messages`. A rejection of one of `messages` fails the test with a
 * defect; a command's message that `update` rejects is stale and ignored, as when the program runs.
 */
export const simulate = <State, Message, R, Event>(update: Update<State, Message, R, Event>) =>
(
  messages: ReadonlyArray<Message>,
  from: Step<State, Message, R>,
): Effect.Effect<Simulation<State, Message, Event>, never, R> => {
  const runCommands = (
    commands: ReadonlyArray<Command<Message, R>>,
    simulation: Simulation<State, Message, Event>,
  ): Effect.Effect<Simulation<State, Message, Event>, never, R> =>
    Effect.gen(function*() {
      let current = simulation
      for (const command of commands) {
        const message = yield* command
        if (Opt.isSome(message)) {
          current = yield* apply(message.value, current, Effect.succeed)
        }
      }
      return current
    })
  const apply = (
    message: Message,
    simulation: Simulation<State, Message, Event>,
    onRejected: (unchanged: Simulation<State, Message, Event>) => Effect.Effect<Simulation<State, Message, Event>>,
  ): Effect.Effect<Simulation<State, Message, Event>, never, R> =>
    Effect.suspend(() => {
      const result = update(message)(simulation.state)
      return isRejected(result) ? onRejected(simulation) : runCommands(result.commands ?? [], {
        state: result.state,
        messages: [...simulation.messages, message],
        events: [...simulation.events, ...(result.events ?? [])],
      })
    })
  return Effect.gen(function*() {
    let current = yield* runCommands(from.commands ?? [], { state: from.state, messages: [], events: [] })
    for (const [index, message] of messages.entries()) {
      current = yield* apply(
        message,
        current,
        () => Effect.die(new Error(`update rejected message ${index} (${String(describeByTag(message))})`)),
      )
    }
    return current
  })
}

/**
 * How a message a view can send breaks its agreement with `update`:
 * - `Rejected`: `update` rejects it in the state the view was drawn from, so the model offered too much;
 * - `ActsTwice`: sent twice from the same frame (a double tap), it acts again, so a one-shot action would
 *   happen twice.
 */
export type DispatchViolation<Message> = Readonly<{ _tag: 'Rejected' | 'ActsTwice'; message: Message }>

/**
 * Checks the messages a view can send from `state`, as collected from what the renderer draws for
 * `makeModel(state)`: `update` must accept each one, and the same message sent again from that frame must be
 * rejected (so it is ignored as stale) or change nothing (same state by `Equal`, no commands, no events).
 * Actions meant to repeat (a "+1") are excluded with `repeatable`. Returns every violation, so that a test
 * can assert there are none, e.g. for arbitrary states.
 */
export const dispatchViolations = <State, Message, R, Event>(
  update: Update<State, Message, R, Event>,
  { repeatable = () => false }: Readonly<{ repeatable?: (message: Message) => boolean }> = {},
) =>
(state: State, messages: Iterable<Message>): ReadonlyArray<DispatchViolation<Message>> =>
  Arr.flatMap(Arr.fromIterable(messages), (message): ReadonlyArray<DispatchViolation<Message>> => {
    const first = update(message)(state)
    if (isRejected(first)) return [{ _tag: 'Rejected', message }]
    if (repeatable(message)) return []
    const second = update(message)(first.state)
    const actsAgain = !isRejected(second)
      && (!Equal.equals(second.state, first.state)
        || (second.commands?.length ?? 0) > 0
        || (second.events?.length ?? 0) > 0)
    return actsAgain ? [{ _tag: 'ActsTwice', message }] : []
  })
