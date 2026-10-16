import type { Offered } from './offer.ts'

/** Takes only offered messages (see `offer.ts`): the view cannot build one itself. */
export type Dispatch<Message> = (message: Offered<Message>) => void

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
