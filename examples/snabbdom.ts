// The renderer the examples use. The library knows nothing of it: any renderer that can draw a model and
// run `dispatch` works the same way. snabbdom's handlers are plain callbacks, so they use `dispatchUnsafe`.
// The run's dispatch, and each child's from `dispatchTo`, is the same in every frame, so a view can be
// memoized with snabbdom's own `thunk`, its dispatch among the arguments.
import { type Dispatch, dispatchUnsafe, type Frame, type View } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import { eventListenersModule, init, type Module, type On, propsModule, type VNode, type VNodeData } from 'snabbdom'

/**
 * The text an input starts with, written only when the input is created: from then on the user types into it,
 * and the program learns the text from the input's messages. Rewriting it from the model could draw a frame
 * older than the last keys, taking them back and moving the caret. To replace the text, the program changes
 * the input's `key`, so that a new input is created (see `field.ts`).
 */
export const initialValue = (text: string): VNodeData => ({ initialValue: text })

const initialValueModule: Module = {
  create: (_, vnode) => {
    const text: unknown = vnode.data?.initialValue
    const element = vnode.elm
    const hasValue = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      || element instanceof HTMLSelectElement
    if (typeof text === 'string' && hasValue) element.value = text
  },
}

const patch = init([propsModule, eventListenersModule, initialValueModule])

const animationFrame = Effect.callback<void>((resume) => {
  const id = requestAnimationFrame(() => resume(Effect.void))
  return Effect.sync(() => cancelAnimationFrame(id))
})

/**
 * The renderer `run` takes: patches the previous tree with each frame, starting from `root`. After a patch it
 * waits for the next animation frame before taking another, so it draws at most once per screen refresh: `run`
 * keeps only the latest frame meanwhile.
 */
export const renderInto =
  <Model, Message>(root: Element, view: View<Model, Message, VNode>) =>
  (frames: Stream.Stream<Frame<Model, Message>>) =>
    Stream.runFoldEffect(
      frames,
      (): Element | VNode => root,
      (previous, { model, dispatch }) =>
        Effect.sync(() => patch(previous, view(model, dispatch))).pipe(Effect.tap(() => animationFrame)),
    ).pipe(Effect.asVoid)

/** snabbdom's `on` for a click that sends `message`. */
export const onClick = <Message>(message: Message, dispatch: Dispatch<Message>): On => ({
  click: () => dispatchUnsafe(dispatch)(message),
})

/** snabbdom's `on` for a text input, whose text `toMessage` turns into a message. */
export const onInput = <Message>(toMessage: (text: string) => Message, dispatch: Dispatch<Message>): On => ({
  input: (event: Event) => dispatchUnsafe(dispatch)(toMessage((event.target as HTMLInputElement).value)),
})

/**
 * For tests: renders `view` and fires every event handler in the tree, `thunk`s drawn as the renderer would,
 * as if `typed` was in every input, and returns the messages they sent, as the root of the program receives
 * them.
 */
export const messagesSentBy = <Model, Message>(
  view: View<Model, Message, VNode>,
  model: Model,
  typed = '',
): ReadonlyArray<Message> => {
  const sent: Array<Message> = []
  const visit = (node: VNode | string): void => {
    if (typeof node === 'string') return
    const { fn, args } = (node.data ?? {}) as Readonly<{ fn?: unknown; args?: unknown }>
    if (typeof fn === 'function' && Array.isArray(args)) {
      visit(fn(...args))
      return
    }
    for (const [type, handler] of Object.entries(node.data?.on ?? {})) {
      // Without a DOM, a stand-in for the only parts of the event that the handlers read.
      const event = { type, target: { value: typed } } as unknown as Event
      if (typeof handler === 'function') (handler as (event: Event) => void)(event)
    }
    for (const child of node.children ?? []) visit(child)
  }
  visit(view(model, (message) => Effect.sync(() => sent.push(message))))
  return sent
}
