// The snabbdom bridge for the prototype (`@fgaudo/effect-tea/next`). One dispatch serves the whole run, so a
// view can be memoized with snabbdom's own `thunk`, its dispatch among the arguments.
import {
  type Dispatch,
  dispatchUnsafe,
  type Frame,
  messageOf,
  type Offered,
  type View,
} from '@fgaudo/effect-tea/next'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import { eventListenersModule, init, type On, propsModule, type VNode } from 'snabbdom'

const patch = init([propsModule, eventListenersModule])

export const renderInto = <Model>(root: Element, view: View<Model, VNode>) => (frames: Stream.Stream<Frame<Model>>) =>
  Stream.runFold(
    frames,
    (): Element | VNode => root,
    (previous, { model, dispatch }) => patch(previous, view(model, dispatch)),
  ).pipe(Effect.asVoid)

/**
 * For tests: renders `view` and fires every event handler in the tree, `thunk`s drawn as the renderer would,
 * and returns the messages the offers sent stand for, as the root of the program receives them.
 */
export const messagesSentBy = <Model, Message>(view: View<Model, VNode>, model: Model): ReadonlyArray<Message> => {
  const sent: Array<Message> = []
  const visit = (node: VNode | string): void => {
    if (typeof node === 'string') return
    const { fn, args } = (node.data ?? {}) as Readonly<{ fn?: unknown; args?: unknown }>
    if (typeof fn === 'function' && Array.isArray(args)) {
      visit(fn(...args))
      return
    }
    for (const [type, handler] of Object.entries(node.data?.on ?? {})) {
      const event = { type } as unknown as Event
      if (typeof handler === 'function') (handler as (event: Event) => void)(event)
    }
    for (const child of node.children ?? []) visit(child)
  }
  visit(view(model, (offered) => Effect.sync(() => sent.push(messageOf<Message>(offered)))))
  return sent
}

/** snabbdom's `on` for a click that sends an offer, of any level of the program. */
export const onClick = (offered: Offered<unknown>, dispatch: Dispatch): On => ({
  click: () => dispatchUnsafe(dispatch)(offered),
})
