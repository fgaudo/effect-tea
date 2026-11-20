import { forwardTo } from "@fgaudo/effect-tea"
import type { View } from "@fgaudo/effect-tea/snabbdom"
import * as Opt from "effect/Option"
import { h } from "snabbdom"
import type { Message, Model } from "./form.ts"

export const view: View<Model, Message> = (model, dispatch) => {
  const { editor } = model
  const name = forwardTo(dispatch, "Name")
  return h("main", [
    // A controlled element, the same one throughout: it shows the name the model holds, and what is typed is written
    // over that name. Disabled while saving, so that nothing is typed into it.
    h("input", {
      props: { value: model.name, disabled: editor._tag === "Saving", placeholder: "A name" },
      on: {
        input: (event: Event) =>
          name({ _tag: "Written", was: model.name, value: (event.target as HTMLInputElement).value })
      }
    }),
    // snabbdom's props module never removes a prop: the enabled button sets `disabled` too.
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
