import * as Effect from 'effect/Effect'
import type { Offered } from './offer.ts'

/**
 * Takes only offered messages (see `offer.ts`): the view cannot build one itself. Sending is an effect, so
 * nothing is sent until it runs; it never fails and needs no services.
 */
export type Dispatch<Message> = (message: Offered<Message>) => Effect.Effect<void>

/** A pure view, independent of the renderer: `Node` is what the renderer draws (e.g. snabbdom's `VNode`). */
export type View<Model, Message, Node> = (
  model: Model,
  dispatch: Dispatch<Message>,
) => Node

/**
 * Equivalent to Elm's `Html.map`: lets a child view dispatch parent messages.
 * `wrap` must be the one the child is embedded with: the parent then accepts
 * `wrap(message)` exactly when the child accepts `message`, so it stays offered.
 */
export const mapDispatch = <A, B>(
  dispatch: Dispatch<B>,
  wrap: (message: A) => B,
): Dispatch<A> =>
(message) => dispatch(wrap(message) as Offered<B>)

/**
 * A dispatch that sends at once, for the callbacks of a renderer outside Effect (e.g. a DOM event handler).
 * Running it synchronously is safe: sending only enqueues the message.
 */
export const dispatchUnsafe = <Message>(dispatch: Dispatch<Message>) => (message: Offered<Message>): void =>
  Effect.runSync(dispatch(message))
