import { forwardTo } from "@fgaudo/effect-tea"
import * as Opt from "effect/Option"
import { onClick, Shows, type View } from "../../bridges/react.ts"
import type { Message, Model } from "./form.ts"

// The view of `form/view-snabbdom.ts`, in React: the same model, the same messages.
export const view: View<Model, Message> = (model, dispatch) => {
  const { editor } = model
  return (
    <main>
      {/* The same element throughout, as with snabbdom: disabled while saving. */}
      <Shows
        value={model.name}
        dispatch={forwardTo(dispatch, "Name")}
        disabled={editor._tag === "Saving"}
        placeholder="A name"
      />
      {editor._tag === "Named"
        ? <button type="button" onClick={onClick<Message>(editor.save, dispatch)}>Save</button>
        : <button type="button" disabled>{editor._tag === "Saving" ? "Saving…" : "Save"}</button>}
      {Opt.match(model.failed, {
        onNone: () => null,
        onSome: (name) => <p className="error">Could not save “{name}”: try again.</p>
      })}
      <ul>
        {model.saved.map((name, index) => (
          // Names may repeat, and the list only grows at its end: a row's place is its identity.
          <li key={index}>{name}</li>
        ))}
      </ul>
    </main>
  )
}
