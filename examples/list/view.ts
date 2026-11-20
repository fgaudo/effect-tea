// Each stopwatch gets a dispatch of its own, which adds its id to its messages. Its model is kept while its state
// is the same, and `forwardTo` gives it the same dispatch every time it is drawn, so snabbdom's `thunk` draws again only
// the stopwatch that changed.
import { type Dispatch, forwardTo } from "@fgaudo/effect-tea"
import type { View } from "@fgaudo/effect-tea/snabbdom"
import * as Opt from "effect/Option"
import { h, thunk, type VNode } from "snabbdom"
import type { Message, Model } from "./list.ts"
import type * as Stopwatch from "./stopwatch.ts"

const stopwatchView = (model: Stopwatch.Model, dispatch: Dispatch<Stopwatch.Message>): VNode => {
  const { watch } = model
  return h("li", [
    h("output", `${model.seconds} s`),
    watch._tag === "Running"
      ? h("button", { on: { click: () => dispatch(watch.stop) } }, "Stop")
      : h("button", { on: { click: () => dispatch(watch.start) } }, "Start"),
    h("button.secondary", { on: { click: () => dispatch(model.remove) } }, "Remove")
  ])
}

export const view: View<Model, Message> = (model, dispatch) =>
  h("main", [
    h("button", { on: { click: () => dispatch(model.add) } }, "Add a stopwatch"),
    ...Opt.match(model.stopAll, {
      onNone: () => [],
      onSome: (stopAll) => [h("button.secondary", { on: { click: () => dispatch(stopAll) } }, "Stop all")]
    }),
    h(
      "ul",
      model.stopwatches.map(({ id, model }) =>
        thunk("li", String(id), stopwatchView, [model, forwardTo(dispatch, "Stopwatch", id)])
      )
    )
  ])
