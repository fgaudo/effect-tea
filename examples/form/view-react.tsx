import { forwardTo } from "@fgaudo/effect-tea"
import type { View } from "@fgaudo/effect-tea/react"
import * as Opt from "effect/Option"
import type { Message, Model } from "./form.ts"

// The view of `form/view-snabbdom.ts`, in React: the same model, the same messages.
export const view: View<Model, Message> = (model, dispatch) => {
  const { editor } = model
  const name = forwardTo(dispatch, "Name")
  return (
    <main>
      {
        /* A controlled element, as with snabbdom: read-only while saving, so that it keeps the focus, with no handler,
          since a write would find no place. */
      }
      {editor._tag === "Saving"
        ? <input value={model.name} readOnly placeholder="A name" />
        : (
          <input
            value={model.name}
            onChange={(event) => name({ _tag: "Written", value: event.target.value })}
            placeholder="A name"
          />
        )}
      {editor._tag === "Named"
        ? <button type="button" onClick={() => dispatch(editor.save)}>Save</button>
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
