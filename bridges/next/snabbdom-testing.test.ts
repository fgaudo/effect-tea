// `messagesSentBy` over the dispatch of `src/next/` (`docs/records/synchronous-dispatch.md`, stage 3), the snabbdom
// bridge's own way to find what a view sends, does what its comment says, without a DOM.
import { type MessageOf, type ModelOf, program, type Written } from "@fgaudo/effect-tea"
import { describe, expect, test } from "bun:test"
import * as Optic from "effect/Optic"
import { h, thunk } from "snabbdom"
import { type Dispatch, forwardTo } from "../../src/next/dispatch.ts"
import { messagesSentBy } from "./snabbdom-testing.ts"
import type { View } from "./snabbdom.ts"

describe("messagesSentBy", () => {
  type Row = "Tapped"
  type Message =
    | Readonly<{ _tag: "Cleared" }>
    | Readonly<{ _tag: "Saved" }>
    | Readonly<{ _tag: "Row"; id: number; message: Row }>
  const rowView = (id: number, dispatch: Dispatch<Row>) =>
    h("button", { on: { click: () => dispatch("Tapped") } }, String(id))
  const view: View<ReadonlyArray<number>, Message> = (ids, dispatch) =>
    h("div", [
      h("button", {
        on: { click: [() => dispatch({ _tag: "Cleared" }), () => dispatch({ _tag: "Saved" })] }
      }),
      ...ids.map((id) => thunk("button", String(id), rowView, [id, forwardTo(dispatch, "Row", id)]))
    ])

  test("calls each listener of a list, in order", () => {
    expect(messagesSentBy(view, [])).toEqual([{ _tag: "Cleared" }, { _tag: "Saved" }])
  })

  test("draws each thunk, and records the message of a child as the root of the program receives it", () => {
    expect(messagesSentBy(view, [1, 2]).slice(2)).toEqual([
      { _tag: "Row", id: 1, message: "Tapped" },
      { _tag: "Row", id: 2, message: "Tapped" }
    ])
  })

  test("finds the writes of controlled elements, each over the value its model holds, with that value", () => {
    type Held = Readonly<{ name: string; agreed: boolean }>
    const heldOf = program<{ state: Held }>()
    const at = Optic.id<Held>()
    const form = heldOf.make({
      init: { state: { name: "", agreed: false } },
      inputs: { Name: heldOf.input({ at: at.key("name") }), Agreed: heldOf.input({ at: at.key("agreed") }) },
      makeModel: (state) => state
    })
    const write = <A>(dispatch: Dispatch<Written<A>>, was: A, value: A) => dispatch({ _tag: "Written", was, value })
    const formView: View<ModelOf<typeof form>, MessageOf<typeof form>> = (model, dispatch) =>
      h("main", [
        h("input", {
          props: { value: model.name },
          on: {
            input: (event) => write(forwardTo(dispatch, "Name"), model.name, (event.target as HTMLInputElement).value)
          }
        }),
        h("input", {
          props: { type: "checkbox", checked: model.agreed },
          on: {
            change: (event) =>
              write(forwardTo(dispatch, "Agreed"), model.agreed, (event.target as HTMLInputElement).checked)
          }
        })
      ])
    expect(messagesSentBy(formView, { name: "Ada", agreed: true })).toEqual([
      { _tag: "Name", message: { _tag: "Written", was: "Ada", value: "Ada" } },
      { _tag: "Agreed", message: { _tag: "Written", was: true, value: true } }
    ])
  })
})
