// An item is no child: a function of the sheet's view draws it, given what it shows and the sheet's dispatch.
import type { Dispatch } from "@fgaudo/effect-tea"
import type { View } from "@fgaudo/effect-tea/snabbdom"
import * as Opt from "effect/Option"
import { h, type VNode } from "snabbdom"
import type { ItemLine, ItemModel, Message, Model } from "./stocktake.ts"

// snabbdom patches the one `<input>` in each case, and its props module never removes a prop: the editable count sets
// `readOnly` too, or a sheet given back after a failed submit would keep the lock it was drawn with before. The editable
// count is a controlled element: it shows the text the model holds, and sends what is typed, filled with the text that
// it holds.
const itemView = ({ name, expected, entry, count }: ItemModel, dispatch: Dispatch<Message>): VNode =>
  h("li", [
    h("span.name", name),
    h("span.expected", `of ${expected}`),
    entry._tag === "Editable"
      ? h("input.count", {
        props: { value: entry.text, readOnly: false },
        on: {
          input: (event: Event) => dispatch({ ...entry.typed, value: (event.target as HTMLInputElement).value })
        }
      })
      : h("input.count", { props: { value: entry.text, readOnly: true } }),
    ...(count._tag === "Invalid" ? [h("span.invalid", "not a whole number")] : [])
  ])

const itemsView = (items: ReadonlyArray<ItemLine>, dispatch: Dispatch<Message>): VNode =>
  h("ul", items.map(({ model }) => itemView(model, dispatch)))

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
        ...Opt.match(model.unknown, {
          onNone: () => [],
          onSome: (codes) => [h("p.unknown", `Unknown codes: ${codes.join(", ")}`)]
        }),
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
