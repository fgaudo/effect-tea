// Prototype: an offer is an opaque token that carries the message its whole program receives, not the
// message a child made. A view sends the token as it is, through one dispatch for every level and every
// frame: there is nothing to wrap, and nothing that changes from a frame to the next.
import * as Effect from 'effect/Effect'
import { RejectedOffer, type Revision } from '../rejection.ts'

declare const OfferedTypeId: unique symbol

/**
 * An action the model offers: the message of a program's `Message` it stands for is checked against
 * `update` when the offer is made, and the token knows where its program's parents put it. Only the library
 * makes one; a view passes it to `dispatch` without looking inside.
 */
export interface Offered<out Message> {
  readonly [OfferedTypeId]: (_: never) => Message
}

/**
 * What a token holds. Only the engine reads it, and only by its fields: in development a view may be bundled
 * with a copy of this library of its own, whose classes and symbols would not be the program's.
 */
export type Token = Readonly<{
  /** The message for the root of the program, with every parent's wrapping. */
  message: unknown
  /** The revision of the frame whose model made the offer, for reports. */
  revision: Revision
  /** The run that made the offer: another run's engine must not apply it. */
  run: object
  /** A typed value that `update` rejected in the state the offer was made in: the model and `update` disagree. */
  violation: boolean
}>

export const tokenOf = (offered: Offered<unknown>): Token => offered as unknown as Token

const toOffered = <Message>(token: Token): Offered<Message> => token as unknown as Offered<Message>

/** Where offers are made: the frame they belong to, and how a message of this level reaches the root. */
export type Context = Readonly<{ run: object; revision: Revision }>

export type Offers<Message> = Readonly<{
  offer: (message: Message) => Offered<Message>
  /** An action whose message carries what the user types or picks, checked with `current`, then each value. */
  offerInput: <Value>(toMessage: (value: Value) => Message, current: Value) => (value: Value) => Offered<Message>
}>

/**
 * Offers of one level of a program. `accepts` asks the update of this level, in the state its model is made
 * from; `lift` wraps a message of this level as each parent does, up to the root. Asking this level is
 * enough: its parents route its messages by `get`, which the library generates and the model was made by.
 */
export const offersAt = <Message>(
  accepts: (message: Message) => boolean,
  lift: (message: Message) => unknown,
  context: Context,
): Offers<Message> => {
  const token = (message: Message, violation: boolean) =>
    toOffered<Message>({ message: lift(message), revision: context.revision, run: context.run, violation })
  const offer = (message: Message) => {
    if (!accepts(message)) throw new RejectedOffer({ message })
    return token(message, false)
  }
  return {
    offer,
    offerInput: (toMessage, current) => {
      offer(toMessage(current))
      return (value) => {
        const message = toMessage(value)
        return token(message, !accepts(message))
      }
    },
  }
}

/** Sends an offer, from any level and any frame: one function for the whole run. */
export type Dispatch = (offered: Offered<unknown>) => Effect.Effect<void>

/** A pure view, independent of the renderer: `Node` is what the renderer draws. */
export type View<Model, Node> = (model: Model, dispatch: Dispatch) => Node

/** A dispatch that sends at once, for the callbacks of a renderer outside Effect. */
export const dispatchUnsafe = (dispatch: Dispatch) => (offered: Offered<unknown>): void =>
  Effect.runSync(dispatch(offered))
