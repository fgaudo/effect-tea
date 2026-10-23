import * as Arr from 'effect/Array'
import * as Equal from 'effect/Equal'
import { isRejected, type Update } from '../update.ts'

/**
 * How a view breaks its agreement with `update` in a state:
 * - `Rejected`: it sends a message that `update` rejects, so the control that sends it does nothing: a button
 *   shown in the wrong state, or a value typed that `update` does not store;
 * - `ActsTwice`: a message it sends acts again when sent twice from the same frame (a double tap), so a one-shot
 *   action would happen twice;
 * - `Missing`: `update` accepts a message that it does not send: a control missing from the screen.
 */
export type DispatchViolation<Message> = Readonly<{ _tag: 'Rejected' | 'ActsTwice' | 'Missing'; message: Message }>

/**
 * Checks a view against `update` in `state`, both ways, from the messages it sends there, as collected from what
 * the renderer draws for `program.makeModel(state)`. Each message `sent` must be accepted, and, sent again from
 * that frame, rejected (so it is ignored) or change nothing (same state by `Equal`, no commands, no events);
 * actions meant to repeat (a "+1") are excluded with `repeatable`. Each of the `candidates`, what a user could ask
 * for (with the text typed into each input), that `update` accepts must be among `sent`, compared with `Equal`;
 * a view may show less on purpose (e.g. typing while a save is in progress), which `withheld` excludes. Without
 * candidates, only the messages sent are checked. Returns every violation, so that a test can assert there are
 * none, e.g. for arbitrary states.
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
    const actsAgain = !isRejected(second)
      && (!Equal.equals(second.state, first.state)
        || (second.commands?.length ?? 0) > 0
        || (second.events?.length ?? 0) > 0)
    return actsAgain ? [{ _tag: 'ActsTwice', message }] : []
  })
  const missing = Arr.flatMap(
    Arr.fromIterable(candidates),
    (message): ReadonlyArray<DispatchViolation<Message>> =>
      !isRejected(update(message)(state)) && !withheld(message, state)
        && !Arr.some(shown, (each) => Equal.equals(each, message))
        ? [{ _tag: 'Missing', message }]
        : [],
  )
  return [...wrong, ...missing]
}
