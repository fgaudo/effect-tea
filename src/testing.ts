import * as Arr from 'effect/Array'
import * as Equal from 'effect/Equal'
import { describeByTag } from './bug.ts'
import type { Command } from './command.ts'
import { isRejected, type Update } from './update.ts'

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
