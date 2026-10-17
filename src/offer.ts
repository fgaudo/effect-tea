import type * as Brand from 'effect/Brand'
import * as Effect from 'effect/Effect'
import { RejectedOffer } from './rejection.ts'
import { isRejected, type Update } from './update.ts'

/**
 * A message `update` accepts in the state the view is rendered from, and the only kind that `Dispatch` takes:
 * a view cannot send a message it was not offered. This module is the only place that makes one: `offers`,
 * by asking `update`, and `mapDispatch`, for a child's message the parent accepts exactly when the child does.
 */
export type Offered<Message> = Brand.Branded<Message, 'effect-tea.Offered'>

/**
 * How `makeModel` offers actions in one state. The model's shape says which actions exist in each case of the
 * state, and each offer is checked against `update`: one that `update` rejects throws `RejectedOffer`, so a
 * model that promises an action the state does not allow dies as it is made, instead of drawing a control
 * that does nothing or sends a rejected message.
 */
export type Offers<Message> = Readonly<{
  offer: (message: Message) => Offered<Message>
  /** An action whose message carries what the user types or picks, checked with `current`. */
  offerInput: <Value>(toMessage: (value: Value) => Message, current: Value) => (value: Value) => Offered<Message>
}>

/**
 * Asks `update` about `state`: `update` is pure, and its commands only describe effects. `offerInput` asks
 * with `current`: what is typed or picked must never be a reason to reject, so the answer holds for any value.
 */
export const offers = <State, Message>(
  update: Update<State, Message, unknown, unknown>,
  state: State,
): Offers<Message> => {
  const offer = (message: Message): Offered<Message> => {
    // `makeModel` is pure code outside Effect: a throw is how it dies, and the run fails with the defect.
    if (isRejected(update(message)(state))) throw new RejectedOffer({ message })
    return message as Offered<Message>
  }
  return {
    offer,
    offerInput: (toMessage, current) => {
      offer(toMessage(current))
      return (value) => toMessage(value) as Offered<Message>
    },
  }
}

/** Sends an offered message: an effect, so nothing is sent until it runs; it never fails and needs no services. */
export type Dispatch<Message> = (message: Offered<Message>) => Effect.Effect<void>

/** A pure view, independent of the renderer: `Node` is what the renderer draws (e.g. snabbdom's `VNode`). */
export type View<Model, Message, Node> = (model: Model, dispatch: Dispatch<Message>) => Node

/**
 * Equivalent to Elm's `Html.map`: lets a child view dispatch parent messages. `wrap` must be the one the child
 * is embedded with: the parent then accepts `wrap(message)` exactly when the child accepts `message`, so it
 * stays offered.
 */
export const mapDispatch = <A, B>(dispatch: Dispatch<B>, wrap: (message: A) => B): Dispatch<A> => (message) =>
  dispatch(wrap(message) as Offered<B>)

/**
 * A dispatch that sends at once, for the callbacks of a renderer outside Effect (e.g. a DOM event handler).
 * Running it synchronously is safe: sending only enqueues the message.
 */
export const dispatchUnsafe = <Message>(dispatch: Dispatch<Message>) => (message: Offered<Message>): void =>
  Effect.runSync(dispatch(message))
