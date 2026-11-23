import { forwardTo } from "@fgaudo/effect-tea"
import type { View } from "@fgaudo/effect-tea/snabbdom"
import * as Opt from "effect/Option"
import { h } from "snabbdom"
import type { Message, Model } from "./form.ts"

export const view: View<Model, Message> = (model, dispatch) => {
  const { editor } = model
  const name = forwardTo(dispatch, "Name")
  return h("main", [
    // A controlled element, the same one throughout: it shows the name the model holds, and where the model shows an
    // editor, what is typed is written over that name. While saving it is read-only, and has no handler: a write there
    // would find no place. Read-only and not disabled, so that it keeps the focus: a browser takes the focus from an
    // element disabled as the screen refreshes. snabbdom's props module never removes a prop, so both cases set
    // `readOnly`.
    editor._tag === "Saving"
      ? h("input", { props: { value: model.name, readOnly: true, placeholder: "A name" } })
      : h("input", {
        props: { value: model.name, readOnly: false, placeholder: "A name" },
        on: {
          input: (event: Event) => name({ _tag: "Written", value: (event.target as HTMLInputElement).value })
        }
      }),
    // The enabled button sets `disabled` too, for the same reason.
    editor._tag === "Named"
      ? h("button", { props: { disabled: false }, on: { click: () => dispatch(editor.save) } }, "Save")
      : h("button", { props: { disabled: true } }, editor._tag === "Saving" ? "Saving…" : "Save"),
    ...Opt.match(model.failed, {
      onNone: () => [],
      onSome: (name) => [h("p.error", `Could not save “${name}”: try again.`)]
    }),
    h("ul", model.saved.map((name) => h("li", name)))
  ])
}
