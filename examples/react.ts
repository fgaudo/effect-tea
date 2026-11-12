// The examples' second renderer, React's. With it, `counter-react` and `form-react` draw the programs of
// `counter` and `form`: only the view, `main.ts` and this bridge change with the renderer, and the program and
// its tests stay as they are.
// A view is a plain function of its model, called here on each frame, and so are its children's views: React
// only draws the tree it returns. No component holds state or uses hooks, so the frames are the only truth.
// Checked with react and react-dom 19.3.1.
import type { Dispatch, Frame, View } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import { type ChangeEvent, isValidElement, type ReactElement, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

const animationFrame = Effect.callback<void>((resume) => {
  const id = requestAnimationFrame(() => resume(Effect.void))
  return Effect.sync(() => cancelAnimationFrame(id))
})

/**
 * The renderer `run` takes: draws each frame into a React root made in `element`, and unmounts it when the run
 * ends. After a frame it waits for the next animation frame before taking another, as the snabbdom bridge does.
 * A view that throws throws here, its components included, so the run dies with it.
 */
export const renderInto =
  <Model, Message>(element: Element, view: View<Model, Message, ReactNode>) =>
  (frames: Stream.Stream<Frame<Model, Message>>) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        // React calls the components later, from its own scheduler, and reports what they throw to the root, not
        // to whoever rendered: drawn at once, an error is known before the frame is done.
        const thrown: Array<unknown> = []
        return { root: createRoot(element, { onUncaughtError: (error) => thrown.push(error) }), thrown }
      }),
      ({ root }) => Effect.sync(() => root.unmount()),
    ).pipe(
      Effect.flatMap(({ root, thrown }) =>
        Stream.runForEach(frames, ({ model, dispatch }) =>
          Effect.sync(() => {
            flushSync(() => root.render(view(model, dispatch)))
            if (thrown.length > 0) throw thrown[0]
          }).pipe(Effect.tap(() => animationFrame)))
      ),
      Effect.scoped,
    )

/** Sends a message from a React callback: a dispatch needs no services and completes synchronously. */
const send = <Message>(dispatch: Dispatch<Message>, message: Message): void => Effect.runSync(dispatch(message))

/** React's `onClick` for a click that sends `message`. */
export const onClick = <Message>(message: Message, dispatch: Dispatch<Message>) => () => send(dispatch, message)

/**
 * React's `onChange` for a text input, whose text `toMessage` turns into a message. The input is uncontrolled,
 * as the README's "Inputs the user types into" says: the view gives it a `defaultValue`, never a `value`, and a
 * new `key` to replace its text. A controlled input would be rewritten from every frame, and a frame older than
 * the last key would take it back.
 */
export const onInput =
  <Message>(toMessage: (text: string) => Message, dispatch: Dispatch<Message>) =>
  (event: ChangeEvent<HTMLInputElement>) => send(dispatch, toMessage(event.target.value))

const memo = Symbol.for('react.memo')

const forwardRef = Symbol.for('react.forward_ref')

type Draw = (props: Readonly<Record<string, unknown>>) => ReactNode

/**
 * What React would call to draw a component: a function, the `render` of a class (made with its props), of a
 * `forwardRef` (with no ref: nothing is mounted), or of what a `memo` wraps.
 */
const componentOf = (type: unknown): Draw | undefined => {
  if (typeof type === 'function') {
    const prototype = (type as Readonly<{ prototype?: Readonly<{ isReactComponent?: unknown }> }>).prototype
    if (prototype?.isReactComponent === undefined) return type as Draw
    const Class = type as new(props: unknown) => Readonly<{ render: () => ReactNode }>
    return (props) => new Class(props).render()
  }
  const { $$typeof, type: inner, render } = (type ?? {}) as Readonly<
    { $$typeof?: unknown; type?: unknown; render?: (props: unknown, ref: null) => ReactNode }
  >
  if ($$typeof === memo) return componentOf(inner)
  if ($$typeof === forwardRef && render !== undefined) return (props) => render(props, null)
  return undefined
}

/**
 * For tests: what `view` can send in `model`, as the README's "Testing" asks of a bridge. Draws the view without
 * React, with a dispatch that records, drawing every component in the tree (functions, classes, `memo`s and
 * `forwardRef`s), calls every `on…` callback of an element as if `typed` was in every input, and returns the
 * messages recorded, as the root of the program receives them.
 */
export const messagesSentBy = <Model, Message>(
  view: View<Model, Message, ReactNode>,
  model: Model,
  typed = '',
): ReadonlyArray<Message> => {
  const sent: Array<Message> = []
  // Without a DOM, a stand-in for the only part of the event that the handlers read.
  const event = { target: { value: typed } }
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (!isValidElement(node)) return
    const { type, props } = node as ReactElement<Record<string, unknown>>
    const component = componentOf(type)
    if (component !== undefined) {
      visit(component(props))
      return
    }
    for (const [name, handler] of Object.entries(props)) {
      if (name.startsWith('on') && typeof handler === 'function') handler(event)
    }
    visit(props.children as ReactNode)
  }
  visit(view(model, (message) => Effect.sync(() => sent.push(message))))
  return sent
}
