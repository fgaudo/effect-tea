// A cart of rows, which are children by id. A row is reserved with the shop before it is listed, and the cart is paid
// for as a whole: from the payment on, the cart is locked, and so is each row, those that start while it is too. The
// cart says once, in the declaration of its rows, what they are told: the library tells each row the lock as it
// starts, and again whenever it changes.
import { defect, type Execution, type MessageOf, type ModelOf, program, reject, type StateOf } from "@fgaudo/effect-tea"
import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"
import * as Row from "./row.ts"

/** Where the cart reserves its rows and pays. The program only knows this interface: `main.ts` and the tests provide it. */
export class Shop extends Context.Service<
  Shop,
  { readonly reserve: (id: number) => Effect.Effect<void>; readonly pay: Effect.Effect<boolean> }
>()("examples/cart/Shop") {}

export type Payment = Data.TaggedEnum<{ Idle: object; Paying: object; Paid: object }>

export const Payment = Data.taggedEnum<Payment>()

/** The cart's own state: the ids of its rows, those being reserved, and the payment. */
export type Own = Readonly<{
  nextId: number
  ids: ReadonlyArray<number>
  reserving: ReadonlyArray<number>
  payment: Payment
}>

type OwnMessage = Data.TaggedEnum<{
  AddClicked: object
  Reserved: { id: number }
  PayClicked: object
  PaySucceeded: object
  PayFailed: object
}>

const OwnMessage = Data.taggedEnum<OwnMessage>()

export type Command = Data.TaggedEnum<{ Reserve: { id: number }; Pay: object }>

export const Command = Data.taggedEnum<Command>()

/** The fact that the rows must know: the cart is locked from the payment on. */
export const isLocked = (state: Own): boolean => state.payment._tag !== "Idle"

/** The cart can be paid for while it is not locked and lists a row: `update` and `makeModel` both ask this. */
const canPay = (state: Own): boolean => !isLocked(state) && Arr.isReadonlyArrayNonEmpty(state.ids)

const { childById, withChildren } = program<{ state: Own; message: OwnMessage; command: Command }>()

export const cart = withChildren({
  Row: childById(Row.row, {
    ids: (state) => state.ids,
    tell: (state) => ({ _tag: "LockChanged", locked: isLocked(state) })
  })
}).make({
  init: { state: { nextId: 1, ids: [], reserving: [], payment: Payment.Idle() } },
  update: (message) => (state) => {
    switch (message._tag) {
      case "AddClicked":
        return isLocked(state) ? reject : {
          state: { ...state, nextId: state.nextId + 1, reserving: [...state.reserving, state.nextId] },
          commands: [Command.Reserve({ id: state.nextId })]
        }
      // The answer of a reservation arrives when it arrives, while a payment runs too: the row starts then.
      case "Reserved":
        return Arr.contains(state.reserving, message.id)
          ? {
            state: {
              ...state,
              reserving: Arr.filter(state.reserving, (id) => id !== message.id),
              ids: [...state.ids, message.id]
            }
          }
          : defect("A reservation completed that nothing asked for")
      case "PayClicked":
        return canPay(state) ? { state: { ...state, payment: Payment.Paying() }, commands: [Command.Pay()] } : reject
      case "PaySucceeded":
        return state.payment._tag === "Paying"
          ? { state: { ...state, payment: Payment.Paid() } }
          : defect("A payment succeeded while nothing was paying")
      case "PayFailed":
        return state.payment._tag === "Paying"
          ? { state: { ...state, payment: Payment.Idle() } }
          : defect("A payment failed while nothing was paying")
    }
  },
  onEvent: { Row: (id) => (state) => ({ state: { ...state, ids: Arr.filter(state.ids, (other) => other !== id) } }) },
  runCommand: (command): Execution<OwnMessage, Shop> =>
    Effect.flatMap(Effect.service(Shop), (shop) =>
      command._tag === "Reserve"
        ? Effect.as(shop.reserve(command.id), Opt.some<OwnMessage>(OwnMessage.Reserved({ id: command.id })))
        : Effect.map(
          shop.pay,
          (paid) => Opt.some<OwnMessage>(paid ? OwnMessage.PaySucceeded() : OwnMessage.PayFailed())
        )),
  makeModel: (state, children) => ({
    payment: state.payment._tag,
    add: isLocked(state) ? Opt.none() : Opt.some<OwnMessage>(OwnMessage.AddClicked()),
    pay: canPay(state) ? Opt.some<OwnMessage>(OwnMessage.PayClicked()) : Opt.none(),
    rows: Arr.map(state.ids, (id) => ({ id, model: children.Row(id) }))
  })
})

export type State = StateOf<typeof cart>

export type Model = ModelOf<typeof cart>

/** The cart's messages, made by the library: its own, and `{ _tag: 'Row', id, message }`. */
export type Message = MessageOf<typeof cart>
