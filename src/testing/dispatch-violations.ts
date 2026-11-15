import * as Arr from 'effect/Array'
import * as Equal from 'effect/Equal'
import { isRejected, type Step, type Update } from '../update.ts'

/**
 * How a model breaks its agreement with `update` in a state, by the messages it holds there:
 * - `Rejected`: it holds a message that `update` rejects, so the control that sends it does nothing: a button
 *   shown in the wrong state;
 * - `ActsTwice`: a message it holds acts again when sent twice from the same frame (a double tap), so a one-shot
 *   action would happen twice;
 * - `Missing`: `update` accepts a message that it does not hold, and the message would do something: a control
 *   missing from the screen.
 */
export type DispatchViolation<Message> = Readonly<{ _tag: 'Rejected' | 'ActsTwice' | 'Missing'; message: Message }>

// The one meaning the tool gives to "changes nothing", for a message sent twice and for a candidate alike.
const doesNothing = <State, Command, Event>(step: Step<State, Command, Event>, state: State): boolean =>
  Equal.equals(step.state, state)
  && (step.commands?.length ?? 0) === 0
  && (step.events?.length ?? 0) === 0

/**
 * Checks a model against `update` in `state`, both ways, from the messages it holds there, `sent`, as a test
 * reads them from `program.makeModel(state)`. Each of them must be accepted, and, sent again from
 * that frame, rejected (so it is ignored) or do nothing (the same state by `Equal`, no commands, no events);
 * actions meant to repeat (a "+1") are excluded with `repeatable`. States compare by value, so keep them data: a
 * state holding a function compares it by reference, and a message that rebuilds it would count as acting twice.
 * Each of the `candidates`, what a user could ask for (the program's fixed messages), that `update` accepts and
 * whose step would do something must be among `sent`, compared with `Equal`: a control that would do nothing is
 * no control missing. A model may hold less on purpose (e.g. the controls of a page that another covers, which
 * would act on its hidden state), which `withheld` excludes. Without candidates, only the messages given are
 * checked. Returns every violation, so that a test can assert there are none, e.g. for arbitrary states.
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
  sent: Iterable<Message>,
  candidates: Iterable<Message> = [],
): ReadonlyArray<DispatchViolation<Message>> => {
  const shown = Arr.fromIterable(sent)
  const wrong = Arr.flatMap(shown, (message): ReadonlyArray<DispatchViolation<Message>> => {
    const first = update(message)(state)
    if (isRejected(first)) return [{ _tag: 'Rejected', message }]
    if (repeatable(message)) return []
    const second = update(message)(first.state)
    return !isRejected(second) && !doesNothing(second, first.state) ? [{ _tag: 'ActsTwice', message }] : []
  })
  const missing = Arr.flatMap(
    Arr.fromIterable(candidates),
    (message): ReadonlyArray<DispatchViolation<Message>> => {
      const step = update(message)(state)
      return !isRejected(step) && !doesNothing(step, state) && !withheld(message, state)
          && !Arr.some(shown, (each) => Equal.equals(each, message))
        ? [{ _tag: 'Missing', message }]
        : []
    },
  )
  return [...wrong, ...missing]
}
