// Each link is a real one, with its address: the browser opens it in a tab of its own, or copies it, as it does any
// link. A plain click is the program's: the view keeps the browser from loading the address, and sends the message
// that its model holds, whose command pushes the address. Which click is plain only the event says, so the handler
// decides it: the case where "Let the view draw, and `makeModel` decide" does not hold.
import type { Dispatch } from "@fgaudo/effect-tea"
import type { View } from "@fgaudo/effect-tea/snabbdom"
import { h, type VNode } from "snabbdom"
import type { Entry, Message, Model, Page } from "./routing.ts"

// A click with a modifier key, or with a button other than the main one, is the browser's.
const opensHere = (event: MouseEvent): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

const entryView = (entry: Entry, dispatch: Dispatch<Message>): VNode =>
  entry._tag === "Here"
    ? h("li", h("strong", { attrs: { "aria-current": "page" } }, entry.title))
    : h(
      "li",
      h("a", {
        props: { href: entry.href },
        on: {
          click: (event: MouseEvent) => {
            if (!opensHere(event)) return
            event.preventDefault()
            dispatch(entry.follow)
          }
        }
      }, entry.title)
    )

const pageView = (page: Page): VNode => {
  switch (page._tag) {
    case "Contents":
      return h("p", "Three topics of the library, each at an address of its own: back and forward go between them.")
    case "Topic":
      return h("p", page.text)
    case "NotFound":
      return h("p", "This address names no topic.")
  }
}

export const view: View<Model, Message> = (model, dispatch) =>
  h("main", [
    h("nav", h("ul", model.menu.map((entry) => entryView(entry, dispatch)))),
    h("h2", model.title),
    pageView(model.page)
  ])
