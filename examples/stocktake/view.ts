// An item is no child: a function of the sheet's view draws it, given what it shows and the dispatch of its count,
// `forwardTo(dispatch, 'Count', id)`.
import { type Dispatch, forwardTo, type Written } from "@fgaudo/effect-tea"
import type { View } from "@fgaudo/effect-tea/snabbdom"
import * as Opt from "effect/Option"
import { h, type VNode } from "snabbdom"
import type { ItemLine, ItemModel, Message, Model } from "./stocktake.ts"

// snabbdom patches the one `<input>` in each case, and its props module never removes a prop: the editable count sets
// `readOnly` too, or a sheet given back after a failed submit would keep the lock it was drawn with before. The editable
// count is a controlled element: it shows the text the model holds, and what is typed is written over that text.
const itemView = (model: ItemModel, write: Dispatch<Written<string>>): VNode =>
  h("li", [
    h("span.name", model.name),
    h("span.expected", `of ${model.expected}`),
    model.entry._tag === "Editable"
      ? h("input.count", {
        props: { value: model.entry.text, readOnly: false },
        on: {
          input: (event: Event) =>
            write({ _tag: "Written", was: model.entry.text, value: (event.target as HTMLInputElement).value })
        }
      })
      : h("input.count", { props: { value: model.entry.text, readOnly: true } }),
    ...(model.count._tag === "Invalid" ? [h("span.invalid", "not a whole number")] : [])
  ])

const itemsView = (items: ReadonlyArray<ItemLine>, dispatch: Dispatch<Message>): VNode =>
  h("ul", items.map(({ id, model }) => itemView(model, forwardTo(dispatch, "Count", id))))

export const view: View<Model, Message> = (model, dispatch) => {
  switch (model._tag) {
    case "Loading":
      return h("main.stocktake", [h("p", "Loading…")])
    case "LoadFailed":
      return h("main.stocktake", [
        h("p.error", model.error),
        h("button", { on: { click: () => dispatch(model.retry) } }, "Retry")
      ])
    case "Counting": {
      const { scanner, submit } = model
      return h("main.stocktake", [
        scanner._tag === "Listening"
          ? h("p.scanner", "Scanner connected")
          : h("p.scanner", [
            "Scanner disconnected ",
            h("button.secondary", { on: { click: () => dispatch(scanner.reconnect) } }, "Reconnect")
          ]),
        ...(model.unknown.length === 0 ? [] : [
          h("p.unknown", `Unknown codes: ${model.unknown.join(", ")}`)
        ]),
        itemsView(model.items, dispatch),
        h("p", ["Total ", h("output.total", String(model.total))]),
        submit._tag === "Ready"
          ? h(
            "button",
            { props: { disabled: false }, on: { click: () => dispatch(submit.submit) } },
            "Submit count"
          )
          : h("button", { props: { disabled: true } }, "Submit count"),
        ...Opt.match(model.error, { onNone: () => [], onSome: (error) => [h("p.error", error)] })
      ])
    }
    case "Closed":
      return h("main.stocktake", [
        itemsView(model.items, dispatch),
        h("p", ["Total ", h("output.total", String(model.total))]),
        h("p.summary", `${model.differing} of ${model.items.length} items differ from their expected quantity`)
      ])
  }
}
