// A line of the cart. It prices itself with a command of its own, so it is a child, and its parent locks it while a
// payment runs: the lock is a fact of the parent, which the row is told and keeps in its state.
import { defect, type Execution, program, reject, type Transition } from "@fgaudo/effect-tea"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"

/** What a quantity costs. The row only knows this interface: `main.ts` and the tests provide it. */
export class Prices extends Context.Service<
  Prices,
  { readonly of: (quantity: number) => Effect.Effect<number> }
>()("examples/cart/Prices") {}

export type Price = Data.TaggedEnum<{ Fetching: object; Fetched: { amount: number } }>

export const Price = Data.taggedEnum<Price>()

export type State = Readonly<{ quantity: number; price: Price; locked: boolean }>

export type Message = Data.TaggedEnum<{
  Incremented: object
  RemoveClicked: object
  PriceFetched: { quantity: number; amount: number }
}>

const Message = Data.taggedEnum<Message>()

export type Command = Readonly<{ _tag: "FetchPrice"; quantity: number }>

export type Event = Readonly<{ _tag: "RemoveRequested" }>

/** What its parent tells it: whether the cart is locked. */
export type External = Readonly<{ _tag: "LockChanged"; locked: boolean }>

export const update = (message: Message) => (state: State): Transition<State, Command, Event> => {
  switch (message._tag) {
    // What the view sends is rejected while the row is locked.
    case "Incremented":
      return state.locked ? reject : {
        state: { ...state, quantity: state.quantity + 1, price: Price.Fetching() },
        commands: [{ _tag: "FetchPrice", quantity: state.quantity + 1 }]
      }
    case "RemoveClicked":
      return state.locked ? reject : { state, events: [{ _tag: "RemoveRequested" }] }
    // The answer of its command is taken while locked too. One for a smaller quantity came too late. Each quantity is
    // fetched once, as the row reaches it, and only that answer leaves `Fetching`: an answer for the quantity once it
    // is fetched, or for a quantity not reached yet, is a bug.
    case "PriceFetched":
      if (message.quantity < state.quantity) return reject
      return message.quantity === state.quantity && state.price._tag === "Fetching"
        ? { state: { ...state, price: Price.Fetched({ amount: message.amount }) } }
        : defect("A price came that no fetch under way asked for")
  }
}

const external = (message: External) => (state: State) => ({ state: { ...state, locked: message.locked } })

const runCommand = (command: Command): Execution<Message, Prices> =>
  Effect.flatMap(Effect.service(Prices), (prices) => prices.of(command.quantity)).pipe(
    Effect.map((amount) => Opt.some(Message.PriceFetched({ quantity: command.quantity, amount })))
  )

export type Model = Readonly<{
  quantity: number
  price: Price
  controls: Opt.Option<Readonly<{ increment: Message; remove: Message }>>
}>

const makeModel = (state: State): Model => ({
  quantity: state.quantity,
  price: state.price,
  controls: state.locked
    ? Opt.none()
    : Opt.some({ increment: Message.Incremented(), remove: Message.RemoveClicked() })
})

/** A row starts unlocked, and is told the lock as it starts. */
export const row = program<{
  state: State
  model: Model
  message: Message
  command: Command
  event: Event
  external: External
}>().make({
  init: {
    state: { quantity: 1, price: Price.Fetching(), locked: false },
    commands: [{ _tag: "FetchPrice", quantity: 1 }]
  },
  update,
  external,
  runCommand,
  makeModel
})
