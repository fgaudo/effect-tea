import * as Arr from 'effect/Array'
import * as Equal from 'effect/Equal'
import { isRejected, type Update } from '../update.ts'

/**
 * The other half of `dispatchViolations`: of the `candidates`, the messages `update` accepts in `state` that
 * the view does not send, as collected from what the renderer draws for `modelOf(program)(state)`. Each one
 * is an action the state allows and the model left out, a control missing from the screen. A model may offer
 * less on purpose (e.g. typing while a save is in progress): `withheld` excludes those. Messages compare with
 * `Equal`, so a candidate for an input carries the text the test types into it.
 */
export const missingOffers = <State, Message, Command, Event>(
  update: Update<State, Message, Command, Event>,
  { withheld = () => false }: Readonly<{ withheld?: (message: Message, state: State) => boolean }> = {},
) =>
(state: State, sent: Iterable<Message>, candidates: Iterable<Message>): ReadonlyArray<Message> => {
  const offered = Arr.fromIterable(sent)
  return Arr.filter(
    Arr.fromIterable(candidates),
    (message) =>
      !isRejected(update(message)(state)) && !withheld(message, state)
      && !Arr.some(offered, (each) => Equal.equals(each, message)),
  )
}
