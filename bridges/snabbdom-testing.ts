// What a test of a snabbdom view may use, the entry `@fgaudo/effect-tea/snabbdom/testing`.
/**
 * What a test of a snabbdom view may use: `messagesSentBy`.
 *
 * @module @fgaudo/effect-tea/snabbdom/testing
 */
import type { On, VNode } from "snabbdom"
import type { View } from "./snabbdom.ts"

type Listener = Extract<NonNullable<On[string]>, (...args: never) => unknown>

/**
 * For tests, and no part of what a bridge must do: what `view` can send in `model`, found without a DOM.
 *
 * - It draws the view with a dispatch that records, draws each `thunk` as the renderer would, and calls every listener
 *   in the tree, in the order the tree holds them.
 * - Each listener gets an event whose `target` holds the `value` and the `checked` of its element's `props`, as the
 *   view drew them. So a controlled element's handler writes the model's own value: each write recorded holds the
 *   value its model holds.
 * - It returns the messages recorded, as the root of the program receives them.
 *
 * A model holds what `update` accepts, which a test reads from the model itself. This checks that the view sends it.
 *
 * @example
 * ```ts
 * expect(messagesSentBy(view, model)).toEqual(messagesOf(model))
 * ```
 *
 * @see The guide, "Testing", "The view".
 * @see The guide, "Writing a bridge", "Their tests".
 */
export const messagesSentBy = <Model, Message>(
  view: View<Model, Message>,
  model: Model
): ReadonlyArray<Message> => {
  const sent: Array<Message> = []
  // An event of no element: its target holds only what the vnode's props say of a controlled element.
  const eventOf = (node: VNode): Event => {
    const props = node.data?.props ?? {}
    const target = {
      ...("value" in props ? { value: props["value"] } : {}),
      ...("checked" in props ? { checked: props["checked"] } : {})
    }
    return { target } as unknown as Event
  }
  // Called as snabbdom calls a listener, with the node as `this` and as its second argument, and a list of them in
  // order: a listener or a list of them, as snabbdom's types say, and nothing they do not.
  const listen = (node: VNode, listeners: Listener | ReadonlyArray<Listener>): void => {
    for (const listener of Array.isArray(listeners) ? listeners : [listeners]) listener.call(node, eventOf(node), node)
  }
  const visit = (node: VNode | string): void => {
    if (typeof node === "string") return
    const { fn, args } = (node.data ?? {}) as Readonly<{ fn?: unknown; args?: unknown }>
    if (typeof fn === "function" && Array.isArray(args)) {
      visit(fn(...args))
      return
    }
    for (const listeners of Object.values(node.data?.on ?? {})) listen(node, listeners)
    for (const child of node.children ?? []) visit(child)
  }
  visit(view(model, (message) => void sent.push(message)))
  return sent
}
