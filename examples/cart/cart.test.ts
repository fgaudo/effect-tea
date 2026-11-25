import { reject } from "@fgaudo/effect-tea"
import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import { applyAll, dispatchViolations, simulate } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"
import * as fc from "fast-check"
import { cart, isLocked, type Message, type Model, Shop, type State } from "./cart.ts"
import * as Row from "./row.ts"
import { view } from "./view.ts"

const to = (id: number, message: Row.Message): Message => ({ _tag: "Row", id, message })
const added = (id: number): ReadonlyArray<Message> => [{ _tag: "AddClicked" }, { _tag: "Reserved", id }]
const paid: Message = { _tag: "PayClicked" }

const fold = (messages: ReadonlyArray<Message>, from: State = cart.init.state): State =>
  applyAll(cart.update, messages, from).state

// What a row's model holds, then the cart's: its own messages, and each row's with its id, wrapped as the cart
// receives them. In the order the view draws them, for the test of the view below.
const rowMessages = ({ controls }: Row.Model): ReadonlyArray<Row.Message> =>
  Opt.match(controls, { onNone: () => [], onSome: ({ increment, remove }) => [increment, remove] })

const messagesOf = (model: Model): ReadonlyArray<Message> => [
  ...Opt.toArray(model.add),
  ...Opt.toArray(model.pay),
  ...model.rows.flatMap(({ id, model }) => rowMessages(model).map((message) => to(id, message)))
]

// What a user could ask of a row, a tag at a time: not the price, which only its command answers with.
const rowClicks: ReadonlyArray<Row.Message> = Object.values(
  {
    Incremented: [{ _tag: "Incremented" }],
    RemoveClicked: [{ _tag: "RemoveClicked" }],
    PriceFetched: []
  } satisfies { [Tag in Row.Message["_tag"]]: ReadonlyArray<Extract<Row.Message, { _tag: Tag }>> }
).flat()

// What a user can ask of the cart in `state`: adding, paying, and each row's clicks. The answers of the shop are
// no user's: only the cart's commands send them.
const userMessages = (state: State): ReadonlyArray<Message> =>
  Object.values(
    {
      AddClicked: [{ _tag: "AddClicked" }],
      PayClicked: [{ _tag: "PayClicked" }],
      Reserved: [],
      PaySucceeded: [],
      PayFailed: [],
      Row: state.own.ids.flatMap((id) => rowClicks.map((message) => ({ _tag: "Row", id, message })))
    } satisfies { [Tag in Message["_tag"]]: ReadonlyArray<Extract<Message, { _tag: Tag }>> }
  ).flat()

// What may arrive in a state: what a user may send, and the answers of the commands that may be running.
const arrivals = (state: State): ReadonlyArray<Message> => [
  ...userMessages(state),
  ...state.own.reserving.map((id): Message => ({ _tag: "Reserved", id })),
  ...(state.own.payment._tag === "Paying" ? [{ _tag: "PaySucceeded" } as const, { _tag: "PayFailed" } as const] : []),
  ...cart.makeModel(state).rows.map(({ id, model }) =>
    to(id, { _tag: "PriceFetched", quantity: model.quantity, amount: 5 })
  )
]

// The states of any history: what may arrive, a message at a time, each applied or rejected.
const history: fc.Arbitrary<ReadonlyArray<State>> = fc.array(fc.nat(), { maxLength: 30 }).map((choices) =>
  choices.reduce<ReadonlyArray<State>>((states, choice) => {
    const state = states.at(-1) ?? cart.init.state
    const candidates = arrivals(state)
    const result = cart.update(candidates[choice % candidates.length] as Message)(state)
    return [...states, result === reject ? state : result.state]
  }, [cart.init.state])
)

// Every row shows its controls, and takes what they send, exactly where the cart is not locked.
const agrees = (state: State) => {
  const locked = isLocked(state.own)
  for (const { id, model } of cart.makeModel(state).rows) {
    expect([id, Opt.isNone(model.controls)]).toEqual([id, locked])
    expect([id, cart.update(to(id, { _tag: "Incremented" }))(state) === reject]).toEqual([id, locked])
  }
}

describe("cart", () => {
  describe("update", () => {
    test("a payment locks every row, and one that fails unlocks them", () => {
      const filled = fold([...added(1), ...added(2)])
      agrees(filled)
      const paying = fold([paid], filled)
      expect(paying.own.payment._tag).toBe("Paying")
      agrees(paying)
      agrees(fold([{ _tag: "PayFailed" }], paying))
    })

    test("a row reserved before the payment, which starts while it runs, starts locked", () => {
      const paying = fold([...added(1), { _tag: "AddClicked" }, paid])
      const late = fold([{ _tag: "Reserved", id: 2 }], paying)
      expect(late.own.ids).toEqual([1, 2])
      agrees(late)
    })

    test("a row keeps its quantity when the lock changes", () => {
      const filled = fold([...added(1), to(1, { _tag: "Incremented" })])
      const back = fold([paid, { _tag: "PayFailed" }], filled)
      expect(cart.makeModel(back).rows.map(({ model }) => model.quantity)).toEqual([2])
    })

    test("a row that asks to be removed is removed, and its late price is rejected", () => {
      const state = fold([...added(1), to(1, { _tag: "RemoveClicked" })])
      expect(state.own.ids).toEqual([])
      expect(cart.update(to(1, { _tag: "PriceFetched", quantity: 1, amount: 4 }))(state)).toBe(reject)
    })
  })

  test("after any history, every row agrees with the cart on the lock", () => {
    fc.assert(fc.property(history, (states) => states.forEach(agrees)))
  })

  test("the model holds what update accepts, all of it, and each acts once when sent twice", () => {
    fc.assert(fc.property(history, (states) => {
      for (const state of states) {
        expect(dispatchViolations(cart.update, {
          state,
          held: messagesOf(cart.makeModel(state)),
          candidates: userMessages(state),
          repeatable: (message) => message._tag === "AddClicked" || message._tag === "Row"
        })).toEqual([])
      }
    }))
  })

  // Beyond what the library asks: that the view draws what its model holds, each row through its own dispatch.
  test("the view sends what its model holds", () => {
    fc.assert(fc.property(history, (states) => {
      for (const state of states) {
        const model = cart.makeModel(state)
        expect(messagesSentBy<Model, Message>(view, model)).toEqual(messagesOf(model))
      }
    }))
  })

  // The commands, with the shop and the prices provided: a row added and priced, then a payment declined.
  test("a row is reserved and priced, and a declined payment unlocks the cart", async () => {
    const shop = Shop.of({ reserve: () => Effect.void, pay: Effect.succeed(false) })
    const prices = Row.Prices.of({ of: (quantity) => Effect.succeed(quantity * 4) })
    const { state, ignored } = await Effect.runPromise(
      simulate(cart, [{ _tag: "AddClicked" }, to(1, { _tag: "Incremented" }), paid], cart.init).pipe(
        Effect.provideService(Shop, shop),
        Effect.provideService(Row.Prices, prices)
      )
    )
    expect(state.own.payment._tag).toBe("Idle")
    expect(cart.makeModel(state).rows).toEqual([{
      id: 1,
      model: {
        quantity: 2,
        price: Row.Price.Fetched({ amount: 8 }),
        controls: Opt.some({ increment: { _tag: "Incremented" }, remove: { _tag: "RemoveClicked" } })
      }
    }])
    // Every answer reached `update`: one rejected would be a row, or a cart, stuck waiting.
    expect(ignored).toEqual([])
  })
})
