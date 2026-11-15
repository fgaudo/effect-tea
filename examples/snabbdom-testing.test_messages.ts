import * as Effect from 'effect/Effect'
import type { On, VNode } from 'snabbdom'
import type { View } from './snabbdom.ts'

type Listener = Extract<NonNullable<On[string]>, (...args: never) => unknown>

/**
 * For tests, and no part of what a bridge must do: what `view` can send in `model`, found without a DOM. The
 * library asks that a model holds what `update` accepts, which a test reads from the model itself (the README's
 * "Testing"). That a view draws what its model holds is checked with the renderer's own tools, and this is one
 * way, for snabbdom: a test compares what it returns with what it reads from the model, as `list`'s does. It
 * draws the view with a dispatch that records, draws each `thunk` as the renderer would, calls every listener in
 * the tree, and returns the messages recorded, in the order the tree holds them, as the root of the program
 * receives them. What is written into an input is not among them: `shows` and
 * `slides` write only from an element on screen, which a tree drawn without a DOM has not, and a write is no message
 * of the model.
 */
export const messagesSentBy = <Model, Message>(
  view: View<Model, Message>,
  model: Model,
): ReadonlyArray<Message> => {
  const sent: Array<Message> = []
  // Without a DOM, an event of no element: the handlers of `shows` and `slides` find none on screen in it.
  const event = {} as Event
  // Called as snabbdom calls a listener, with the node as `this` and as its second argument, and a list of them in
  // order: a listener or a list of them, as snabbdom's types say, and nothing they do not.
  const listen = (node: VNode, listeners: Listener | ReadonlyArray<Listener>): void => {
    for (const listener of Array.isArray(listeners) ? listeners : [listeners]) listener.call(node, event, node)
  }
  const visit = (node: VNode | string): void => {
    if (typeof node === 'string') return
    const { fn, args } = (node.data ?? {}) as Readonly<{ fn?: unknown; args?: unknown }>
    if (typeof fn === 'function' && Array.isArray(args)) {
      visit(fn(...args))
      return
    }
    for (const listeners of Object.values(node.data?.on ?? {})) listen(node, listeners)
    for (const child of node.children ?? []) visit(child)
  }
  visit(view(model, (message) => Effect.sync(() => sent.push(message))))
  return sent
}
