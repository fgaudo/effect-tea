import * as Arr from 'effect/Array'
import * as Equal from 'effect/Equal'
import { reject, type Step, type Update } from '../update.ts'

/**
 * A way a model breaks its agreement with `update` in a state, as `dispatchViolations` finds it.
 *
 * @example
 * ```ts
 * const check = dispatchViolations(update)
 * expect(check({ count: 0 }, ['Decrement'])).toEqual([{ _tag: 'Rejected', message: 'Decrement' }])
 * ```
 *
 * @remarks
 * From the guide, "Testing", "`dispatchViolations`":
 *
 * `dispatchViolations` tests that the model holds what `update` accepts, all of it, and that a double tap acts once, as
 * the second test of "how a program is tested" does. It checks both ways:
 *
 * - **Each message the model holds must be accepted** (`Rejected`).
 * - **Each one must act once when sent twice** (`ActsTwice`). Sent again from the same frame, it is rejected or changes
 *   nothing: the same state by `Equal`, with no commands and no events. Keep states data, since a value without
 *   structural equality compares by reference. Actions meant to repeat (a "+1") are marked `repeatable`.
 * - **Each candidate `update` accepts must be among those held** (`Missing`), compared by `Equal`. The `candidates` are
 *   what the test lists: what a user could ask for, the program's fixed messages. A candidate whose step does nothing,
 *   by the rule of `ActsTwice`, is excepted: a control that would do nothing is not a missing control. The candidates
 *   `withheld` on purpose are excepted too, for example the controls of a page that another page covers, which would
 *   act on its hidden state.
 *
 * Without candidates, it checks only the messages it is given.
 */
export type DispatchViolation<Message> = Readonly<{
  /**
   * Which check the message breaks:
   * - `Rejected`, a message the model holds that `update` rejects: a button shown in the wrong state;
   * - `ActsTwice`, one the model holds that acts again when sent twice from the same frame, as a double tap would: a
   *   one-shot action would happen twice;
   * - `Missing`, a candidate `update` accepts that the model does not hold: a control missing from the screen.
   */
  _tag: 'Rejected' | 'ActsTwice' | 'Missing'
  /** The message that breaks it. */
  message: Message
}>

// The one meaning the tool gives to "changes nothing", for a message sent twice and for a candidate alike.
const doesNothing = <State, Command, Event>(step: Step<State, Command, Event>, state: State): boolean =>
  Equal.equals(step.state, state)
  && (step.commands?.length ?? 0) === 0
  && (step.events?.length ?? 0) === 0

/**
 * Checks a model against `update` in a state, both ways, by the messages the model holds there.
 *
 * @param update - The program's `update`.
 * @param options - `repeatable`, the messages meant to act again when sent twice (a "+1"); `withheld`, the messages a
 * model may leave out on purpose in a state.
 * @returns A function of `state`; of `held`, the messages the model of that state holds, as the test reads them from
 * `program.makeModel(state)`; and of `candidates`, what a user could ask for. It returns every violation it finds, so
 * that a test asserts there are none.
 *
 * @example
 * ```ts
 * const check = dispatchViolations(update, { repeatable: () => true })
 * expect(check({ count }, messagesOf(counter.makeModel({ count })), ['Increment', 'Decrement'])).toEqual([])
 * ```
 *
 * @remarks
 * From the guide, "Testing", "`dispatchViolations`":
 *
 * `dispatchViolations` tests that the model holds what `update` accepts, all of it, and that a double tap acts once, as
 * the second test of "how a program is tested" does. It checks both ways:
 *
 * - **Each message the model holds must be accepted** (`Rejected`).
 * - **Each one must act once when sent twice** (`ActsTwice`). Sent again from the same frame, it is rejected or changes
 *   nothing: the same state by `Equal`, with no commands and no events. Keep states data, since a value without
 *   structural equality compares by reference. Actions meant to repeat (a "+1") are marked `repeatable`.
 * - **Each candidate `update` accepts must be among those held** (`Missing`), compared by `Equal`. The `candidates` are
 *   what the test lists: what a user could ask for, the program's fixed messages. A candidate whose step does nothing,
 *   by the rule of `ActsTwice`, is excepted: a control that would do nothing is not a missing control. The candidates
 *   `withheld` on purpose are excepted too, for example the controls of a page that another page covers, which would
 *   act on its hidden state.
 *
 * Without candidates, it checks only the messages it is given.
 *
 * From the guide, "Testing", "`applyAll` and `dispatchViolations` call `update` without a run":
 *
 * **`applyAll` and `dispatchViolations` call `update` without a run**, and fail with the defect itself.
 */
export const dispatchViolations = <State, Message, Command, Event>(
  update: Update<State, Message, Command, Event>,
  { repeatable = () => false, withheld = () => false }: Readonly<{
    repeatable?: (message: Message) => boolean
    withheld?: (message: Message, state: State) => boolean
  }> = {},
) =>
(
  state: State,
  held: Iterable<Message>,
  candidates: Iterable<Message> = [],
): ReadonlyArray<DispatchViolation<Message>> => {
  const shown = Arr.fromIterable(held)
  const wrong = Arr.flatMap(shown, (message): ReadonlyArray<DispatchViolation<Message>> => {
    const first = update(message)(state)
    if (first === reject) return [{ _tag: 'Rejected', message }]
    if (repeatable(message)) return []
    const second = update(message)(first.state)
    return second !== reject && !doesNothing(second, first.state) ? [{ _tag: 'ActsTwice', message }] : []
  })
  const missing = Arr.flatMap(
    Arr.fromIterable(candidates),
    (message): ReadonlyArray<DispatchViolation<Message>> => {
      const step = update(message)(state)
      return step !== reject && !doesNothing(step, state) && !withheld(message, state)
          && !Arr.some(shown, (each) => Equal.equals(each, message))
        ? [{ _tag: 'Missing', message }]
        : []
    },
  )
  return [...wrong, ...missing]
}
