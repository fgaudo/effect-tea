// Both forms drawn with snabbdom: the list listens to the end of its scroll only where its model says it may load.
import { forwardTo } from "@fgaudo/effect-tea"
import type { View } from "@fgaudo/effect-tea/snabbdom"
import { h } from "snabbdom"
import type * as AsMessage from "./as-message.ts"
import type * as AsWrite from "./as-write.ts"

const offsetOf = (event: Event): number => (event.target as HTMLElement).scrollTop

const rows = (items: ReadonlyArray<string>) => items.map((item) => h("li", { key: item }, item))

// Today's form: the handler writes the offset, then sends the message its model holds.
export const viewAsWrite: View<AsWrite.Model, AsWrite.Message> = (model, dispatch) => {
  const { more } = model
  return h("main", [
    h(
      "ul.feed",
      more._tag === "Idle"
        ? {
          on: {
            scrollend: (event: Event) => {
              forwardTo(dispatch, "Offset")({ _tag: "Written", value: offsetOf(event) })
              dispatch(more.scrollEnded)
            }
          }
        }
        : {},
      rows(model.items)
    ),
    ...(more._tag === "Loading" ? [h("p", "Loading…")] : [])
  ])
}

// The spike's form: the handler fills the offset into the message its model holds, and sends it.
export const viewAsMessage: View<AsMessage.Model, AsMessage.Message> = (model, dispatch) => {
  const { more } = model
  return h("main", [
    h(
      "ul.feed",
      more._tag === "Idle"
        ? { on: { scrollend: (event: Event) => dispatch({ ...more.scrollEnded, offset: offsetOf(event) }) } }
        : {},
      rows(model.items)
    ),
    ...(more._tag === "Loading" ? [h("p", "Loading…")] : [])
  ])
}
