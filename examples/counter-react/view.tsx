import type { Message, Model } from '../counter/counter.ts'
import { onClick, type View } from '../bridges/react.ts'

// The view of `counter/view.ts`, in React: the same model, the same messages.
export const view: View<Model, Message> = (model, dispatch) => (
  <main className="counter">
    {model._tag === 'Counting'
      ? <button type="button" onClick={onClick(model.decrement, dispatch)}>−</button>
      : <button type="button" disabled>−</button>}
    <output>{model.count}</output>
    <button type="button" onClick={onClick(model.increment, dispatch)}>+</button>
  </main>
)
