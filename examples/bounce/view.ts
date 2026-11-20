import { onClick, type View } from "@fgaudo/effect-tea/snabbdom"
import { h } from "snabbdom"
import type { Message, Model } from "./bounce.ts"

export const view: View<Model, Message> = (model, dispatch) =>
  h("main", [
    h("div.court", [h("div.ball", { style: { bottom: `calc((100% - 2rem) * ${model.height / 100})` } })]),
    h("button", { on: onClick<Message>(model.throw, dispatch) }, "Throw")
  ])
