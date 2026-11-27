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
 * - Each listener gets an event whose `target` and `currentTarget` are one object, its element. The element holds the
 *   `value` and the `checked` of its `props`, as the view drew them. So a controlled element's handler sends the
 *   model's own value: each message it sends holds the value its model holds.
 * - `reports` gives what the element and its event report beyond that, as the offset of a scroll or the point of a
 *   press. Without it, a handler that reads another field gets `undefined`.
 * - It returns the messages recorded, as the root of the program receives them.
 *
 * A model holds what `update` accepts, which a test reads from the model itself. This checks that the view sends it.
 * Where the model holds a message without its values, the test draws one record of them, and gives it to its reader
 * and to `reports` alike.
 *
 * @param view The view, as the bridge draws it.
 * @param model The model the view draws.
 * @param reports Called for each listener, with the listener's node and the name of its event. The fields of its
 *   `element` are laid over what the view drew, and the fields of its `event` are the event's own. A field may be a
 *   method that only reads, as `getBoundingClientRect`.
 * @returns The messages the view sent, in the order of its listeners.
 *
 * @example
 * ```ts
 * expect(messagesSentBy(view, model)).toEqual(messagesOf(model))
 *
 * // A list whose handler reads the offset of its scroll.
 * expect(messagesSentBy(view, model, () => ({ element: { scrollTop: offset } }))).toEqual(messagesOf(model, offset))
 * ```
 *
 * @see The guide, "Testing".
 * @see The guide, "Writing a bridge".
 */
export const messagesSentBy = <Model, Message>(
  view: View<Model, Message>,
  model: Model,
  reports: (node: VNode, type: string) => {
    readonly element?: object
    readonly event?: object
  } = () => ({})
): ReadonlyArray<Message> => {
  const sent: Array<Message> = []
  // An event of no element: its target holds what the vnode's props say of a controlled element, and what the test
  // says the element and the event report.
  const eventOf = (node: VNode, type: string): Event => {
    const props = node.data?.props ?? {}
    const { element, event } = reports(node, type)
    const target = {
      ...("value" in props ? { value: props["value"] } : {}),
      ...("checked" in props ? { checked: props["checked"] } : {}),
      ...element
    }
    return { ...event, target, currentTarget: target } as unknown as Event
  }
  // Called as snabbdom calls a listener, with the node as `this` and as its second argument, and a list of them in
  // order: a listener or a list of them, as snabbdom's types say, and nothing they do not.
  const listen = (node: VNode, type: string, listeners: Listener | ReadonlyArray<Listener>): void => {
    for (const listener of Array.isArray(listeners) ? listeners : [listeners]) {
      listener.call(node, eventOf(node, type), node)
    }
  }
  // A thunk is drawn as snabbdom draws it: the node its function gives lends the thunk its data, with the thunk's `fn`
  // and `args`, its children and its text, and the thunk keeps its own selector and key. Its listeners get the thunk.
  const drawn = (node: VNode): VNode => {
    const { fn, args } = node.data ?? {}
    if (typeof fn !== "function" || !Array.isArray(args)) return node
    const inner: VNode = (fn as (...args: ReadonlyArray<unknown>) => VNode)(...args)
    return { ...node, data: { ...inner.data, fn, args }, children: inner.children, text: inner.text }
  }
  const visit = (vnode: VNode | string): void => {
    if (typeof vnode === "string") return
    const node = drawn(vnode)
    for (const [type, listeners] of Object.entries(node.data?.on ?? {})) listen(node, type, listeners)
    for (const child of node.children ?? []) visit(child)
  }
  visit(view(model, (message) => void sent.push(message)))
  return sent
}
