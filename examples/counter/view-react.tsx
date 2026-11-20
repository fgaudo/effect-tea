import type { View } from "@fgaudo/effect-tea/react"
import type { Message, Model } from "./counter.ts"

// The view of `counter/view-snabbdom.ts`, in React: the same model, the same messages.
export const view: View<Model, Message> = (model, dispatch) => (
  <main className="counter">
    {model._tag === "Counting"
      ? <button type="button" onClick={() => dispatch(model.decrement)}>−</button>
      : <button type="button" disabled>−</button>}
    <output>{model.count}</output>
    <button type="button" onClick={() => dispatch(model.increment)}>+</button>
  </main>
)
