// `messagesSentBy`, the snabbdom bridge's own way to find what a view sends, does what its comment says, without a DOM.
import { type Dispatch, forwardTo, type MessageOf, type ModelOf, program } from "@fgaudo/effect-tea"
import { describe, expect, test } from "bun:test"
import * as fc from "fast-check"
import { h, thunk, type VNode } from "snabbdom"
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

  test("calls a listener as snabbdom does, with its node as this and as its second argument", () => {
    const seen: View<null, string> = (_, dispatch) =>
      h("button#tap", {
        on: {
          click: function(this: VNode, _event: Event, node: VNode) {
            dispatch(`${this.sel} ${node.sel} ${this === node}`)
          }
        }
      })
    expect(messagesSentBy(seen, null)).toEqual(["button#tap button#tap true"])
  })

  test("draws each thunk, and records the message of a child as the root of the program receives it", () => {
    expect(messagesSentBy(view, [1, 2]).slice(2)).toEqual([
      { _tag: "Row", id: 1, message: "Tapped" },
      { _tag: "Row", id: 2, message: "Tapped" }
    ])
  })

  test("finds what controlled elements send, each filled with the value its model holds", () => {
    type Held = Readonly<{ name: string; agreed: boolean }>
    type Given =
      | Readonly<{ _tag: "NameTyped"; value: string }>
      | Readonly<{ _tag: "AgreedChecked"; value: boolean }>
    const heldOf = program<{ state: Held; message: Given }>()
    const form = heldOf.make({
      init: { state: { name: "", agreed: false } },
      update: (message) => (state) => ({
        state: message._tag === "NameTyped" ? { ...state, name: message.value } : { ...state, agreed: message.value }
      }),
      makeModel: (state) => ({
        ...state,
        nameTyped: { _tag: "NameTyped" } as const,
        agreedChecked: { _tag: "AgreedChecked" } as const
      })
    })
    const formView: View<ModelOf<typeof form>, MessageOf<typeof form>> = (model, dispatch) =>
      h("main", [
        h("input", {
          props: { value: model.name },
          on: { input: (event) => dispatch({ ...model.nameTyped, value: (event.target as HTMLInputElement).value }) }
        }),
        h("input", {
          props: { type: "checkbox", checked: model.agreed },
          on: {
            change: (event) => dispatch({ ...model.agreedChecked, value: (event.target as HTMLInputElement).checked })
          }
        })
      ])
    expect(messagesSentBy(formView, form.makeModel({ name: "Ada", agreed: true }))).toEqual([
      { _tag: "NameTyped", value: "Ada" },
      { _tag: "AgreedChecked", value: true }
    ])
  })

  test("sends what its reader returns, for handlers that read their element and their event, with the values drawn", () => {
    type Values = Readonly<{ offset: number; clientX: number; left: number; width: number }>
    type Sent =
      | Readonly<{ _tag: "ScrollEnded"; offset: number }>
      | Readonly<{ _tag: "Pressed"; clientX: number; left: number; width: number }>
    type Held = Readonly<{ scrollEnded: Readonly<{ _tag: "ScrollEnded" }>; pressed: Readonly<{ _tag: "Pressed" }> }>
    const held: Held = { scrollEnded: { _tag: "ScrollEnded" }, pressed: { _tag: "Pressed" } }
    const messagesOf = (model: Held, { clientX, left, offset, width }: Values): ReadonlyArray<Sent> => [
      { ...model.scrollEnded, offset },
      { ...model.pressed, clientX, left, width }
    ]
    const press = (model: Held, dispatch: Dispatch<Sent>) =>
      h("div.track", {
        on: {
          pointerdown: (event) => {
            const { left, width } = (event.currentTarget as HTMLElement).getBoundingClientRect()
            dispatch({ ...model.pressed, clientX: event.clientX, left, width })
          }
        }
      })
    const view: View<Held, Sent> = (model, dispatch) =>
      h("ul.list", {
        on: {
          scrollend: (event) =>
            dispatch({ ...model.scrollEnded, offset: (event.currentTarget as HTMLElement).scrollTop })
        }
      }, [thunk("div.track", press, [model, dispatch])])
    const values = fc.record({ offset: fc.nat(), clientX: fc.integer(), left: fc.integer(), width: fc.nat() })
    fc.assert(fc.property(values, (drawn) => {
      const reports = (node: VNode) =>
        node.sel === "ul.list"
          ? { element: { scrollTop: drawn.offset } }
          : {
            element: { getBoundingClientRect: () => ({ left: drawn.left, width: drawn.width }) },
            event: { clientX: drawn.clientX }
          }
      expect(messagesSentBy(view, held, reports)).toEqual(messagesOf(held, drawn))
    }))
  })

  test("without a reader, a handler that reads another field than value and checked gets undefined", () => {
    const scrolled: View<null, number | undefined> = (_, dispatch) =>
      h("ul.list", { on: { scrollend: (event) => dispatch((event.target as HTMLElement).scrollTop) } })
    expect(messagesSentBy(scrolled, null)).toEqual([undefined])
  })

  test("asks what is reported for each listener, with its node and its event, and lays it over what the view drew", () => {
    const asked: Array<string> = []
    const field: View<null, string> = (_, dispatch) =>
      h("input#name", {
        props: { value: "drawn" },
        on: {
          input: (event) => {
            const { currentTarget, target } = event as unknown as Readonly<{ target: unknown; currentTarget: unknown }>
            dispatch(`${(event.target as HTMLInputElement).value} ${currentTarget === target}`)
          },
          blur: [() => dispatch("left"), () => dispatch("left again")]
        }
      })
    const sent = messagesSentBy(field, null, (node, type) => {
      asked.push(`${node.sel} ${type}`)
      return type === "input" ? { element: { value: "typed" } } : {}
    })
    expect(sent).toEqual(["typed true", "left", "left again"])
    expect(asked).toEqual(["input#name input", "input#name blur", "input#name blur"])
  })
})
