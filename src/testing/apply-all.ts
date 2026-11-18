import { appendStep, type Folded, reject, type Update } from '../update.ts'
import { unexpectedRejection } from './unexpected.ts'

/**
 * Applies messages to a state with `update`, one after the other, and collects their commands and events.
 *
 * It tests the rules of `update` alone, without a run. It takes only the test's messages. It fails when `update`
 * rejects one of them, and with the defect itself when `update` dies.
 *
 * @param update - The program's `update`.
 * @returns A function of `messages`, applied in order, and of the state `from`. It returns the last state, with the
 * commands and the events of every step, in order.
 *
 * @example
 * ```ts
 * expect(applyAll(update)(['Increment', 'Increment', 'Decrement'], { count: 0 }).state).toEqual({ count: 1 })
 * ```
 *
 * @see The guide, "Testing tools", "applyAll".
 * @see The guide, "Testing tools", "`applyAll` and `dispatchViolations` call `update` without a run".
 */
export const applyAll =
  <State, Message, Command, Event>(update: Update<State, Message, Command, Event>) =>
  (messages: ReadonlyArray<Message>, from: State): Folded<State, Command, Event> =>
    messages.reduce(
      (folded, message, index) => {
        const result = update(message)(folded.state)
        if (result === reject) throw unexpectedRejection(index, message)
        return appendStep(folded, result)
      },
      { state: from, commands: [], events: [] } as Folded<State, Command, Event>,
    )
