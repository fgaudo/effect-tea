// Each row gets a dispatch of its own, and is drawn again only when its model changes. A locked row has no controls
// in its model, so the view draws none: it decides nothing.
import { type Dispatch, forwardTo } from "@fgaudo/effect-tea"
import type { View } from "@fgaudo/effect-tea/snabbdom"
import * as Opt from "effect/Option"
import { h, thunk, type VNode } from "snabbdom"
import type { Message, Model } from "./cart.ts"
import type * as Row from "./row.ts"

const rowView = (model: Row.Model, dispatch: Dispatch<Row.Message>): VNode =>
  h("li", [
    h("output", `${model.quantity} × ${model.price._tag === "Fetched" ? `${model.price.amount} €` : "…"}`),
    ...Opt.match(model.controls, {
      onNone: () => [],
      onSome: (controls) => [
        h("button", { on: { click: () => dispatch(controls.increment) } }, "+1"),
        h("button.secondary", { on: { click: () => dispatch(controls.remove) } }, "Remove")
      ]
    })
  ])

const paymentText: Readonly<Record<Model["payment"], string>> = {
  Idle: "Not paid",
  Paying: "Paying…",
  Paid: "Paid"
}

export const view: View<Model, Message> = (model, dispatch) =>
  h("main", [
    h("p", paymentText[model.payment]),
    ...Opt.match(model.add, {
      onNone: () => [],
      onSome: (add) => [h("button", { on: { click: () => dispatch(add) } }, "Add an item")]
    }),
    ...Opt.match(model.pay, {
      onNone: () => [],
      onSome: (pay) => [h("button", { on: { click: () => dispatch(pay) } }, "Pay")]
    }),
    h(
      "ul",
      model.rows.map(({ id, model }) => thunk("li", String(id), rowView, [model, forwardTo(dispatch, "Row", id)]))
    )
  ])
