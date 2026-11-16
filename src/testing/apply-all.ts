import { appendStep, type Folded, reject, type Update } from '../update.ts'
import { unexpectedRejection } from './unexpected.ts'

/**
 * Applies messages to a state with `update`, one after the other, and collects their commands and events.
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
 * @remarks
 * From the guide, "Testing", "`applyAll`":
 *
 * `applyAll` tests `update`'s rules, as `counts up and down` does in "how a program is tested".
 *
 * - It takes only the test's messages.
 * - It fails when `update` rejects one of them.
 *
 * From the guide, "Testing", "`applyAll` and `dispatchViolations` call `update` without a run":
 *
 * **`applyAll` and `dispatchViolations` call `update` without a run**, and fail with the defect itself.
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
