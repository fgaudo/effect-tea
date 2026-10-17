// The renderer the examples use. The library knows nothing of it: any renderer that can draw a model and
// call `dispatch` works the same way.
import type { Dispatch, Frame, InputOffer, Offer, View } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import * as Stream from 'effect/Stream'
import { eventListenersModule, init, type On, propsModule, type VNode } from 'snabbdom'

const patch = init([propsModule, eventListenersModule])

/** The renderer `run` takes: patches the previous tree with each frame, starting from `root`. */
export const renderInto =
  <Model, Message>(root: Element, view: View<Model, Message, VNode>) =>
  (frames: Stream.Stream<Frame<Model, Message>>) =>
    Stream.runFold(
      frames,
      (): Element | VNode => root,
      (previous, { model, dispatch }) => patch(previous, view(model, dispatch)),
    ).pipe(Effect.asVoid)

/** snabbdom's `on` for a click: the handler exists only while the action is offered. */
export const onClick = <Message>(offer: Offer<Message>, dispatch: Dispatch<Message>): On =>
  Opt.match(offer, {
    onNone: () => ({}),
    onSome: (message) => ({ click: () => dispatch(message) }),
  })

/** snabbdom's `on` for a text input: the handler exists only while typing is offered. */
export const onInput = <Message>(offer: InputOffer<string, Message>, dispatch: Dispatch<Message>): On =>
  Opt.match(offer, {
    onNone: () => ({}),
    onSome: (toMessage) => ({
      input: (event: Event) => dispatch(toMessage((event.target as HTMLInputElement).value)),
    }),
  })

/**
 * For tests: renders `view` and fires every event handler in the tree, as if `typed` was in every input, and
 * returns what they send.
 */
export const messagesSentBy = <Model, Message>(
  view: View<Model, Message, VNode>,
  model: Model,
  typed = '',
): ReadonlyArray<Message> => {
  const sent: Array<Message> = []
  const visit = (node: VNode | string): void => {
    if (typeof node === 'string') return
    for (const [type, handler] of Object.entries(node.data?.on ?? {})) {
      // Without a DOM, a stand-in for the only parts of the event that the handlers read.
      const event = { type, target: { value: typed } } as unknown as Event
      if (typeof handler === 'function') (handler as (event: Event) => void)(event)
    }
    for (const child of node.children ?? []) visit(child)
  }
  visit(view(model, (message) => sent.push(message)))
  return sent
}
