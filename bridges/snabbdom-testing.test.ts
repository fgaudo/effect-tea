// `messagesSentBy`, the snabbdom bridge's own way to find what a view sends, does what its comment says, without a DOM;
// then its premise on snabbdom (`docs/premises.md`), checked against snabbdom itself, in a DOM (happy-dom).
import { type Dispatch, forwardTo, type MessageOf, type ModelOf, program } from "@fgaudo/effect-tea"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import * as fc from "fast-check"
import { eventListenersModule, h, init, propsModule, thunk, type VNode } from "snabbdom"
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

  test("calls a listener drawn by a thunk as snabbdom does, with the thunk's node, its key and its data", () => {
    const button = (label: string, dispatch: Dispatch<string>) =>
      h("button", {
        key: "inner",
        on: {
          click: function(this: VNode, _event: Event, node: VNode) {
            dispatch(`${String(node.key)} ${typeof node.data?.["fn"]} ${node.children?.length} ${this === node}`)
          }
        }
      }, [h("span", label)])
    const seen: View<null, string> = (_, dispatch) => h("main", [thunk("button", "outer", button, ["x", dispatch])])
    expect(messagesSentBy(seen, null)).toEqual(["outer function 1 true"])
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

// A tree that a view may draw: text, comments, elements with listeners, and thunks, which may draw thunks.
type Tree =
  | Readonly<{ kind: "text"; text: string }>
  | Readonly<{ kind: "comment"; text: string }>
  | Readonly<{
    kind: "element"
    sel: "div" | "span" | "button"
    key: boolean
    // A listener alone, or a list of so many.
    click: "one" | number
    input: "one" | number
    children: ReadonlyArray<Tree>
  }>
  | Readonly<{ kind: "thunk"; key: boolean; tree: Tree }>

const { tree: trees } = fc.letrec<{ tree: Tree }>((tie) => ({
  tree: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    fc.record({ kind: fc.constant("text" as const), text: fc.string() }),
    fc.record({ kind: fc.constant("comment" as const), text: fc.string() }),
    fc.record({
      kind: fc.constant("element" as const),
      sel: fc.constantFrom("div" as const, "span" as const, "button" as const),
      key: fc.boolean(),
      click: fc.oneof(fc.constant("one" as const), fc.nat(3)),
      input: fc.oneof(fc.constant("one" as const), fc.nat(3)),
      children: fc.array(tie("tree"), { maxLength: 4 })
    }),
    fc.record({ kind: fc.constant("thunk" as const), key: fc.boolean(), tree: tie("tree") })
  )
}))

// What a listener sends: which it is, and what it is called with, as far as `messagesSentBy` can know it.
const seen = (label: string, self: VNode, node: VNode): string =>
  [
    label,
    self === node,
    node.sel,
    String(node.key),
    Object.keys(node.data ?? {}).sort().join(","),
    typeof node.data?.["fn"],
    node.children?.length,
    node.text
  ].join(" ")

// The selector of the element a tree draws, which a thunk of it takes, as a thunk is written.
const selOf = (tree: Tree): string =>
  tree.kind === "thunk" ? selOf(tree.tree) : tree.kind === "element" ? tree.sel : tree.kind === "text" ? "span" : "!"

// One function for every thunk, so that a thunk drawn again with the same tree is the same thunk to snabbdom.
const draw = (tree: Tree, path: string, dispatch: Dispatch<string>): VNode | string => {
  switch (tree.kind) {
    case "text":
      return tree.text
    case "comment":
      return h("!", tree.text)
    case "thunk":
      return thunk(selOf(tree.tree), tree.key ? path : undefined, drawThunk, [tree.tree, `${path}.0`, dispatch])
    case "element": {
      const listeners = (type: string, count: "one" | number) => {
        const one = (index: number) =>
          function(this: VNode, _event: Event, node: VNode) {
            dispatch(seen(`${path} ${type} ${index}`, this, node))
          }
        return count === "one" ? one(0) : Array.from({ length: count }, (_, index) => one(index))
      }
      return h(tree.sel, {
        ...(tree.key ? { key: path } : {}),
        on: { click: listeners("click", tree.click), input: listeners("input", tree.input) }
      }, tree.children.map((child, index) => draw(child, `${path}.${index}`, dispatch)))
    }
  }
}

// A thunk's function gives a node, as snabbdom's types say: a text is drawn in a span.
const drawThunk = (tree: Tree, path: string, dispatch: Dispatch<string>): VNode => {
  const node = draw(tree, path, dispatch)
  return typeof node === "string" ? h("span", node) : node
}

const viewOf = (tree: Tree): View<null, string> => (_, dispatch) => h("main", [draw(tree, "0", dispatch)])

describe("snabbdom, as messagesSentBy rests on it", () => {
  beforeAll(() => GlobalRegistrator.register())
  afterAll(() => GlobalRegistrator.unregister())

  test("snabbdom calls the listeners of a tree as messagesSentBy does, drawn once and drawn again", () => {
    fc.assert(fc.property(trees, (tree) => {
      const view = viewOf(tree)
      const sent: Array<string> = []
      const dispatch: Dispatch<string> = (message) => void sent.push(message)
      // Each element is clicked, then given an input, in the order of the document, and neither event bubbles: each
      // listener is called once, in the order of the tree.
      const fire = () => {
        sent.length = 0
        const main = document.querySelector("main")!
        for (const element of [main, ...main.querySelectorAll("*")]) {
          element.dispatchEvent(new Event("click"))
          element.dispatchEvent(new Event("input"))
        }
        return [...sent]
      }
      document.body.innerHTML = "<div id=\"app\"></div>"
      const patch = init([propsModule, eventListenersModule])
      const first = patch(document.querySelector("#app")!, view(null, dispatch))
      expect(messagesSentBy(view, null)).toEqual(fire())
      patch(first, view(null, dispatch))
      expect(messagesSentBy(view, null)).toEqual(fire())
    }))
  })
})
