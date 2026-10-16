import type * as Brand from 'effect/Brand'
import * as Opt from 'effect/Option'
import { isRejected, type Update } from './update.ts'

/**
 * A message `update` accepts in the state the view is rendered from. Only
 * `offered` and `offeredInput` make one, and `Dispatch` only takes these: a view
 * cannot send a message it was not offered.
 */
export type Offered<Message> = Brand.Branded<Message, 'effect-tea.Offered'>

/** An action the model offers to the view: `Some` exactly when `update` accepts it. */
export type Offer<Message> = Opt.Option<Offered<Message>>

/** An action whose message carries what the user types or picks. */
export type InputOffer<Value, Message> = Opt.Option<(value: Value) => Offered<Message>>

// The update of any program: only whether it rejects matters here.
type AnyUpdate<State, Message> = Update<State, Message, unknown, unknown>

/** Asks `update` whether it would accept `message` in `state`: `update` is pure, and its commands only describe effects. */
const offered =
  <State, Message>(update: AnyUpdate<State, Message>, state: State) => (message: Message): Offer<Message> =>
    isRejected(update(message)(state))
      ? Opt.none()
      : Opt.some(message as Offered<Message>)

/**
 * Like `offered`, for a message built from a value the view supplies later.
 * It asks with `current`: what is typed or picked must never be a reason to
 * reject, so the answer holds for any value.
 */
const offeredInput =
  <State, Message>(update: AnyUpdate<State, Message>, state: State) =>
  <Value>(toMessage: (value: Value) => Message, current: Value): InputOffer<Value, Message> =>
    Opt.map(
      offered(update, state)(toMessage(current)),
      () => (value: Value) => toMessage(value) as Offered<Message>,
    )

/** Both ways of offering for one state, as `offers` returns them to the parts of a `makeModel`. */
export type Offers<Message> = Readonly<{
  offer: (message: Message) => Offer<Message>
  offerInput: <Value>(toMessage: (value: Value) => Message, current: Value) => InputOffer<Value, Message>
}>

export const offers = <State, Message>(update: AnyUpdate<State, Message>, state: State): Offers<Message> => ({
  offer: offered(update, state),
  offerInput: offeredInput(update, state),
})
