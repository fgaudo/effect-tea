// The renderer the examples use. The library knows nothing of it: any renderer that can draw a model, run
// `dispatch`, and reach the element of each input after a frame, before the user can act on it, works the same way.
// snabbdom's handlers are plain callbacks, so they run it with `send`; it patches synchronously, so each input is
// settled right after the patch. An input's element changes only by what the user types, or by this bridge.
// The run's dispatch, and each child's from `dispatchTo`, is the same in every frame, so a view can be
// memoized with snabbdom's own `thunk`, its dispatch among the arguments.
// Checked with snabbdom 3.6.4.
import { type Dispatch, drawn, type Frame, type Shown, typed, type Written } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import {
  eventListenersModule,
  init,
  type Module,
  type On,
  propsModule,
  styleModule,
  type VNode,
  type VNodeData,
} from 'snabbdom'

/** A view of a program, drawn by this renderer: a pure function of its model, which sends its messages through
 * `dispatch`.
 */
export type View<Model, Message> = (model: Model, dispatch: Dispatch<Message>) => VNode

// What the bridge holds of an element that shows an input: what the library made of it, `undefined` until the first
// frame that draws it is settled, and the value the last frame drawn gave it. A text input holds a string and a slider
// a number: the element's value is written as a text, and read back by what made the element (`shows` or `slides`).
type Live = { held: Shown<unknown> | undefined; value: unknown }

const lives = new WeakMap<Element, Live>()

// What the user gave the element, read back by `read`, is written over what the element showed, by the library's
// rule: `typed` makes the write, and the number the dispatch returns finishes what the element holds.
const showing = <A>(value: A, dispatch: Dispatch<Written<A>>, read: (element: HTMLInputElement) => A): VNodeData => ({
  shows: value,
  on: {
    input: (event: Event) => {
      const element = event.target as HTMLInputElement
      const live = lives.get(element)
      if (live?.held === undefined) return
      const { write, sent } = typed(live.held as Shown<A>, read(element))
      live.held = sent(send(dispatch, write))
    },
  },
})

/**
 * snabbdom's data for a text input that shows an input of the program, `value`, through the input's own dispatch
 * (`dispatchTo(dispatch, 'Name')`): what is typed is written over what the element showed, and the element takes the
 * program's value only when the state has moved on without it (`drawn`). It needs no key: the element stays, with its
 * focus, while the program changes what it shows.
 */
export const shows = (value: string, dispatch: Dispatch<Written<string>>): VNodeData =>
  showing(value, dispatch, (element) => element.value)

/**
 * The same for a slider, `<input type="range">`, over a number: where it is dragged, `valueAsNumber`, is written over
 * the number the element showed. The bounds are props, which snabbdom writes before the frame gives the element its
 * value, and must not narrow under a value the program holds: a range brings its value within its bounds by itself,
 * which no edit of the user reports, and the guarantees of inputs do not cover it. A slider whose bounds narrow is one
 * the program draws itself.
 */
export const slides = (value: number, dispatch: Dispatch<Written<number>>): VNodeData =>
  showing(value, dispatch, (element) => element.valueAsNumber)

// The elements on screen that show an input, of one renderer: every one is settled after each frame, whether the frame
// drew it again or a `thunk` skipped it.
const showsModule = (live: Set<HTMLInputElement>): Module => ({
  create: (_, vnode) => {
    const data = vnode.data
    const element = vnode.elm
    if (data === undefined || !('shows' in data) || !(element instanceof HTMLInputElement)) return
    lives.set(element, { held: undefined, value: data.shows })
    live.add(element)
  },
  update: (_, vnode) => {
    const data = vnode.data
    const known = vnode.elm === undefined ? undefined : lives.get(vnode.elm as Element)
    if (data !== undefined && 'shows' in data && known !== undefined) known.value = data.shows
  },
  destroy: (vnode) => {
    if (vnode.elm instanceof HTMLInputElement) live.delete(vnode.elm)
  },
})

// `drawn` returns the very value the element held when it stays, so it is written only when it must be.
const settle = (live: Set<HTMLInputElement>, seen: number): void => {
  for (const element of live) {
    const known = lives.get(element)
    if (known === undefined) continue
    const next = drawn(known.held, known.value, seen)
    if (known.held === undefined || next.value !== known.held.value) element.value = String(next.value)
    known.held = next
  }
}

const animationFrame = Effect.callback<void>((resume) => {
  const id = requestAnimationFrame(() => resume(Effect.void))
  return Effect.sync(() => cancelAnimationFrame(id))
})

/**
 * The renderer `run` takes: patches the previous tree with each frame, starting from `root`, then settles the inputs on
 * screen with the frame's `seen`. After a patch it waits for the next animation frame before taking another, so it
 * draws at most once per screen refresh: `run` keeps only the latest frame meanwhile.
 */
export const renderInto =
  <Model, Message>(root: Element, view: View<Model, Message>) =>
  (frames: Stream.Stream<Frame<Model, Message>>) => {
    const live = new Set<HTMLInputElement>()
    const patch = init([propsModule, styleModule, eventListenersModule, showsModule(live)])
    return Stream.runFoldEffect(
      frames,
      (): Element | VNode => root,
      (previous, { model, dispatch, seen }) =>
        Effect.sync(() => {
          const tree = patch(previous, view(model, dispatch))
          settle(live, seen)
          return tree
        }).pipe(Effect.tap(() => animationFrame)),
    ).pipe(Effect.asVoid)
  }

/**
 * Sends a message at once, from a plain callback, and returns its number. A dispatch needs no services and completes
 * synchronously, so `Effect.runSync` is enough: the run handles the message with its own services.
 */
const send = <Message>(dispatch: Dispatch<Message>, message: Message): number => Effect.runSync(dispatch(message))

/** snabbdom's `on` for a click that sends `message`. */
export const onClick = <Message>(message: Message, dispatch: Dispatch<Message>): On => ({
  click: () => send(dispatch, message),
})

/** snabbdom's `on` for a press of the pointer that sends `message`: where a drag the program draws starts. */
export const onPress = <Message>(message: Message, dispatch: Dispatch<Message>): On => ({
  pointerdown: () => send(dispatch, message),
})

/** snabbdom's `on` for a text field that is no input of the program, whose text `toMessage` turns into a message. */
export const onInput = <Message>(toMessage: (text: string) => Message, dispatch: Dispatch<Message>): On => ({
  input: (event: Event) => send(dispatch, toMessage((event.target as HTMLInputElement).value)),
})

/**
 * For tests, and no part of what a bridge must do: what `view` can send in `model`, found without a DOM. The
 * library asks that a model holds what `update` accepts, which a test reads from the model itself (the README's
 * "Testing"). That a view draws what its model holds is checked with the renderer's own tools, and this is one
 * way, for snabbdom: a test compares what it returns with what it reads from the model, as `list`'s does. It
 * draws the view with a dispatch that records, draws each `thunk` as the renderer would, calls every listener in
 * the tree as if `typed` was in every input, and returns the messages recorded, in the order the tree holds
 * them, as the root of the program receives them. What is written into an input is not among them: `shows` and
 * `slides` write only from an element on screen, which a tree drawn without a DOM has not, and a write is no message
 * of the model.
 */
export const messagesSentBy = <Model, Message>(
  view: View<Model, Message>,
  model: Model,
  typed = '',
): ReadonlyArray<Message> => {
  const sent: Array<Message> = []
  // Without a DOM, a stand-in for the only part of the event that the handlers read.
  const event = { target: { value: typed } } as unknown as Event
  // Called as snabbdom calls a listener, with the node as `this` and as its second argument, and lists of them,
  // nested or not, in order, as snabbdom walks them.
  const listen = (node: VNode, listeners: unknown): void => {
    if (Array.isArray(listeners)) {
      for (const listener of listeners) listen(node, listener)
      return
    }
    if (typeof listeners === 'function') {
      ;(listeners as (this: VNode, event: Event, vnode: VNode) => void).call(node, event, node)
    }
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
