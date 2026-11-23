// A parent of each form, which draws its feed through `forwardTo`: what the spike asks of a parent's view.
import { forwardTo, type MessageOf, type ModelOf, program, type StateOf } from "@fgaudo/effect-tea"
import type { View } from "@fgaudo/effect-tea/snabbdom"
import { h } from "snabbdom"
import * as AsMessage from "./as-message.ts"
import * as AsWrite from "./as-write.ts"
import { viewAsMessage, viewAsWrite } from "./view-snabbdom.ts"

const shell = program<{ state: Readonly<{ title: string }> }>()

export const parentAsWrite = shell.withChildren({ Feed: shell.child(AsWrite.feed) }).make({
  init: { state: { title: "Rows" } },
  makeModel: (state, children) => ({ title: state.title, feed: children.Feed() })
})

export const parentAsMessage = shell.withChildren({ Feed: shell.child(AsMessage.feed) }).make({
  init: { state: { title: "Rows" } },
  makeModel: (state, children) => ({ title: state.title, feed: children.Feed() })
})

export type ModelAsWrite = ModelOf<typeof parentAsWrite>

export type MessageAsWrite = MessageOf<typeof parentAsWrite>

export type StateAsWrite = StateOf<typeof parentAsWrite>

export type ModelAsMessage = ModelOf<typeof parentAsMessage>

export type MessageAsMessage = MessageOf<typeof parentAsMessage>

export type StateAsMessage = StateOf<typeof parentAsMessage>

export const parentViewAsWrite: View<ModelAsWrite, MessageAsWrite> = (model, dispatch) =>
  h("section", [h("h2", model.title), viewAsWrite(model.feed, forwardTo(dispatch, "Feed"))])

export const parentViewAsMessage: View<ModelAsMessage, MessageAsMessage> = (model, dispatch) =>
  h("section", [h("h2", model.title), viewAsMessage(model.feed, forwardTo(dispatch, "Feed"))])
