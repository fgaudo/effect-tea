// An offer is an opaque token that carries the message its whole program receives, not the message a child
// made. A view sends the token as it is, through one dispatch for every level and every frame: there is
// nothing to wrap, and nothing that changes from a frame to the next.
import * as Effect from 'effect/Effect'
import { RejectedOffer, type Revision } from './rejection.ts'
import { isRejected, type Update } from './update.ts'

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

/** The frame offers are made for. */
export type Context = Readonly<{ run: object; revision: Revision }>

/** Who made the offers of a model made outside `run` (e.g. in a test): no engine applies them. */
export const outsideRun: Context = { run: {}, revision: 0 }

export type Offers<Message> = Readonly<{
  offer: (message: Message) => Offered<Message>
  /**
   * An action whose message carries what the user types or picks, checked with `current`, then each value. Its
   * value type is `current`'s, widened (`true` is a `boolean`), so `toMessage` needs no annotation.
   */
  offerInput: <Value>(
    toMessage: (value: NoInfer<Value>) => Message,
    current: Value,
  ) => (value: Value) => Offered<Message>
}>

/**
 * A level of a program, as its offers know it: their frame, the call of the root's `makeModel` they were made
 * in (`frame`, a new object for each), the way from the root to the level (`at`: the name and id of each child
 * on it), and how a message of the level reaches the root.
 */
export type Level = Readonly<{
  context: Context
  frame: object
  at: ReadonlyArray<unknown>
  lift: (message: unknown) => unknown
}>

// A composed program's `makeModel` gets the offers of its level, and makes its children's from them: from the
// offers it finds their level. Offers are made and read only on the program's side, in one copy of the library.
const levels = new WeakMap<object, Level>()

export const levelOf = (offers: Offers<unknown>): Level => {
  const level = levels.get(offers)
  if (level === undefined) throw new Error('A composed program got offers that the library did not make')
  return level
}

/**
 * Offers of one level of a program. `accepts` asks the update of this level, in the state its model is made
 * from; `level.lift` wraps a message of this level as each parent does, up to the root. Asking this level is
 * enough: its parents route its messages by `get`, which the library generates and the model was made by.
 */
export const offersAt = <Message>(accepts: (message: Message) => boolean, level: Level): Offers<Message> => {
  const token = (message: Message, violation: boolean) =>
    toOffered<Message>({
      message: level.lift(message),
      revision: level.context.revision,
      run: level.context.run,
      violation,
    })
  const offer = (message: Message) => {
    if (!accepts(message)) throw new RejectedOffer({ rejected: message })
    return token(message, false)
  }
  const offers: Offers<Message> = {
    offer,
    offerInput: (toMessage, current) => {
      offer(toMessage(current))
      return (value) => {
        const message = toMessage(value)
        return token(message, !accepts(message))
      }
    },
  }
  levels.set(offers, level)
  return offers
}

/** The offers of the root of a program in `state`. */
export const rootOffers = <State, Message>(
  update: Update<State, Message, unknown, unknown>,
  state: State,
  context: Context,
): Offers<Message> =>
  offersAt((message: Message) => !isRejected(update(message)(state)), {
    context,
    frame: {},
    at: [],
    lift: (message) => message,
  })

/** Sends an offer, from any level and any frame: one function for the whole run. */
export type Dispatch = (offered: Offered<unknown>) => Effect.Effect<void>

/** A pure view, independent of the renderer: `Node` is what the renderer draws. */
export type View<Model, Node> = (model: Model, dispatch: Dispatch) => Node

/** A dispatch that sends at once, for the callbacks of a renderer outside Effect. */
export const dispatchUnsafe = (dispatch: Dispatch) => (offered: Offered<unknown>): void =>
  Effect.runSync(dispatch(offered))
