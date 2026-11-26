import { InvariantDefect, reject } from "@fgaudo/effect-tea"
import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import { applyAll, dispatchViolations, simulate, stateOf } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Opt from "effect/Option"
import * as fc from "fast-check"
import { cart, Command, isLocked, type Message, type Model, Payment, Shop, type State } from "./cart.ts"
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

// What may arrive in a state: what a user may send, and the answers that the cart and its rows wait for.
const arrivals = (state: State): ReadonlyArray<Message> => [
  ...userMessages(state),
  ...state.own.reserving.map((id): Message => ({ _tag: "Reserved", id })),
  ...(state.own.payment._tag === "Paying" ? [{ _tag: "PaySucceeded" } as const, { _tag: "PayFailed" } as const] : []),
  ...cart.makeModel(state).rows.flatMap(({ id, model }) =>
    model.price._tag === "Fetching" ? [to(id, { _tag: "PriceFetched", quantity: model.quantity, amount: 5 })] : []
  )
]

// Any valid state, made anew on each draw. An id is listed or still reserved, never both. A payment under way, or
// done, was asked for with a row listed, and no row leaves while the cart is locked. Each row knows the lock.
const states = (): fc.Arbitrary<State> =>
  fc.record({
    payment: fc.constantFrom("Idle", "Paying", "Paid"),
    entries: fc.uniqueArray(
      fc.record({
        id: fc.nat(9),
        listed: fc.boolean(),
        quantity: fc.integer({ min: 1, max: 5 }),
        amount: fc.option(fc.nat(50), { nil: undefined })
      }),
      { selector: (entry) => entry.id, maxLength: 4 }
    )
  })
    .filter(({ entries, payment }) => payment === "Idle" || entries.some((entry) => entry.listed))
    .map(({ entries, payment }) => {
      const listed = entries.filter((entry) => entry.listed)
      return stateOf(cart, {
        nextId: 10,
        ids: listed.map((entry) => entry.id),
        reserving: entries.filter((entry) => !entry.listed).map((entry) => entry.id),
        payment: payment === "Idle" ? Payment.Idle() : payment === "Paying" ? Payment.Paying() : Payment.Paid()
      }, {
        Row: listed.map(({ amount, id, quantity }) =>
          [id, {
            quantity,
            price: amount === undefined ? Row.Price.Fetching() : Row.Price.Fetched({ amount }),
            locked: payment !== "Idle"
          }] as const
        )
      })
    })

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
    test("adding reserves the next id, and the row starts once it is reserved", () => {
      const adding = applyAll(cart.update, [{ _tag: "AddClicked" }], cart.init.state)
      expect(adding.state.own).toEqual({ ...cart.init.state.own, nextId: 2, reserving: [1] })
      expect(adding.commands).toEqual([Command.Reserve({ id: 1 })])
      const reserved = applyAll(cart.update, [{ _tag: "Reserved", id: 1 }], adding.state)
      expect(reserved.state.own).toEqual({ ...adding.state.own, ids: [1], reserving: [] })
      expect(reserved.commands).toEqual([
        { _tag: "Row", id: 1, instance: 1, command: { _tag: "FetchPrice", quantity: 1 } }
      ])
    })

    test("paying asks the shop, and is rejected with no row and while a payment runs", () => {
      const filled = fold(added(1))
      const { state, commands } = applyAll(cart.update, [paid], filled)
      expect(state.own.payment).toEqual(Payment.Paying())
      expect(commands).toEqual([Command.Pay()])
      expect(cart.update(paid)(cart.init.state)).toBe(reject)
      expect(cart.update(paid)(state)).toBe(reject)
      expect(cart.update({ _tag: "AddClicked" })(state)).toBe(reject)
    })

    test("a payment locks every row, a success keeps them locked, and a failure unlocks them", () => {
      const filled = fold([...added(1), ...added(2)])
      agrees(filled)
      const paying = fold([paid], filled)
      expect(paying.own.payment._tag).toBe("Paying")
      agrees(paying)
      const done = fold([{ _tag: "PaySucceeded" }], paying)
      expect(done.own.payment).toEqual(Payment.Paid())
      agrees(done)
      agrees(fold([{ _tag: "PayFailed" }], paying))
    })

    test("a row reserved before the payment, which starts while it runs, starts locked", () => {
      const paying = fold([...added(1), { _tag: "AddClicked" }, paid])
      const late = fold([{ _tag: "Reserved", id: 2 }], paying)
      expect(late.own.ids).toEqual([1, 2])
      agrees(late)
    })

    test("a row's +1 fetches the price of its new quantity, and is rejected while locked", () => {
      const filled = fold(added(1))
      const { state, commands } = applyAll(cart.update, [to(1, { _tag: "Incremented" })], filled)
      expect(cart.makeModel(state).rows.map(({ model }) => [model.quantity, model.price])).toEqual([
        [2, Row.Price.Fetching()]
      ])
      expect(commands).toEqual([{ _tag: "Row", id: 1, instance: 1, command: { _tag: "FetchPrice", quantity: 2 } }])
      expect(cart.update(to(1, { _tag: "Incremented" }))(fold([paid], filled))).toBe(reject)
    })

    test("a row keeps its quantity when the lock changes", () => {
      const filled = fold([...added(1), to(1, { _tag: "Incremented" })])
      const back = fold([paid, { _tag: "PayFailed" }], filled)
      expect(cart.makeModel(back).rows.map(({ model }) => model.quantity)).toEqual([2])
    })

    test("a row that asks to be removed is removed, its late price is rejected, and it stays while locked", () => {
      const state = fold([...added(1), to(1, { _tag: "RemoveClicked" })])
      expect(state.own.ids).toEqual([])
      expect(cart.update(to(1, { _tag: "PriceFetched", quantity: 1, amount: 4 }))(state)).toBe(reject)
      expect(cart.update(to(1, { _tag: "RemoveClicked" }))(fold([...added(1), paid]))).toBe(reject)
    })

    test("a row takes the price of its quantity, and rejects one for a quantity it has left", () => {
      const fetching = { quantity: 2, price: Row.Price.Fetching(), locked: true }
      const { state } = applyAll(Row.update, [{ _tag: "PriceFetched", quantity: 2, amount: 8 }], fetching)
      expect(state).toEqual({ ...fetching, price: Row.Price.Fetched({ amount: 8 }) })
      expect(Row.update({ _tag: "PriceFetched", quantity: 1, amount: 4 })(fetching)).toBe(reject)
    })

    // Each answer is waited for in a state that only it leaves: one outside that state is a bug.
    test("dies on an answer that nothing waits for", () => {
      const fetched = { quantity: 2, price: Row.Price.Fetched({ amount: 8 }), locked: false }
      expect(() => Row.update({ _tag: "PriceFetched", quantity: 2, amount: 8 })(fetched)).toThrow(InvariantDefect)
      expect(() => Row.update({ _tag: "PriceFetched", quantity: 3, amount: 12 })(fetched)).toThrow(InvariantDefect)
      expect(() => cart.update({ _tag: "Reserved", id: 1 })(cart.init.state)).toThrow(InvariantDefect)
      expect(() => cart.update({ _tag: "PaySucceeded" })(cart.init.state)).toThrow(InvariantDefect)
      expect(() => cart.update({ _tag: "PayFailed" })(fold(added(1)))).toThrow(InvariantDefect)
    })
  })

  test("after any history, every row agrees with the cart on the lock", () => {
    fc.assert(fc.property(history, (states) => states.forEach(agrees)))
  })

  // A +1 is meant to act again when sent twice; a removal sent twice removes the row once.
  test("the model holds what update accepts, all of it, and each acts once when sent twice", () => {
    fc.assert(fc.property(states(), (state) => {
      expect(dispatchViolations(cart.update, {
        state,
        held: messagesOf(cart.makeModel(state)),
        candidates: userMessages(state),
        repeatable: (message) =>
          message._tag === "AddClicked" || (message._tag === "Row" && message.message._tag === "Incremented")
      })).toEqual([])
    }))
  })

  // The view draws what its model holds, each row through its own dispatch: `messagesSentBy` finds what it sends
  // without a DOM, and the test compares it with the reader.
  test("the view sends what its model holds", () => {
    fc.assert(fc.property(states(), (state) => {
      const model = cart.makeModel(state)
      expect(messagesSentBy<Model, Message>(view, model)).toEqual(messagesOf(model))
    }))
  })

  // Two equal states built apart, by the same seed drawn twice, give two equal models, which a function in a model
  // would break, being made anew by each `makeModel`.
  test("the model is data: equal states, built apart, have equal models", () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const [one] = fc.sample(states(), { seed, numRuns: 1 })
      const [other] = fc.sample(states(), { seed, numRuns: 1 })
      if (one === undefined || other === undefined) throw new Error("nothing sampled")
      expect(one).not.toBe(other)
      expect(Equal.equals(cart.makeModel(one), cart.makeModel(other))).toBe(true)
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
