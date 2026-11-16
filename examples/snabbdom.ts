// The renderer the examples use. The library knows nothing of it: any renderer that can draw a model, run
// `dispatch`, and reach the element of each input after a frame, before the user can act on it, works the same way.
// snabbdom's handlers are plain callbacks, so they run it with `send`; it patches synchronously, so each input is
// settled right after the patch. An input's element changes only by what the user types, or by this bridge, which hears
// a reset of its form as a key.
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
 * which no edit of the user reports, and what the README promises of an input's element does not cover it. A slider
 * whose bounds narrow is one the program draws itself.
 */
export const slides = (value: number, dispatch: Dispatch<Written<number>>): VNodeData =>
  showing(value, dispatch, (element) => element.valueAsNumber)

// The elements on screen that show an input, of one renderer: every one is settled after each frame, whether the frame
// drew it again or a `thunk` skipped it. snabbdom patches an `<input>` into the next one drawn in its place, so an
// element starts showing an input when a frame draws it with `shows`, created or not, as a new element, and stops when
// a frame draws it without, or removes it.
const showsModule = (live: Set<HTMLInputElement>): Module => {
  const drawnAs = (vnode: VNode) => {
    const data = vnode.data
    const element = vnode.elm
    if (!(element instanceof HTMLInputElement)) return
    if (data === undefined || !('shows' in data)) {
      live.delete(element)
      lives.delete(element)
      return
    }
    const known = live.has(element) ? lives.get(element) : undefined
    if (known !== undefined) {
      known.value = data.shows
      return
    }
    lives.set(element, { held: undefined, value: data.shows })
    live.add(element)
  }
  return {
    create: (_, vnode) => drawnAs(vnode),
    update: (_, vnode) => drawnAs(vnode),
    // Forgotten as a frame removes it, though the style module may keep it on screen while it fades: what it hears
    // meanwhile sends nothing, whatever the module of the listeners does with them.
    destroy: (vnode) => {
      if (!(vnode.elm instanceof HTMLInputElement)) return
      live.delete(vnode.elm)
      lives.delete(vnode.elm)
    },
  }
}

const settle = (live: Set<HTMLInputElement>, seen: number): void => {
  for (const element of live) {
    const known = lives.get(element)
    if (known === undefined) continue
    const { shown, taken } = drawn(known.held, known.value, seen)
    if (taken) element.value = String(shown.value)
    known.held = shown
  }
}

// A form's reset gives each of its inputs its default value, with no input event (HTML, "Resetting a form"), after the
// `reset` event: once it has, each input of the renderer whose value it changed is heard as if the user had typed it.
const heardAfterReset = (live: Set<HTMLInputElement>) => (event: Event) =>
  queueMicrotask(() => {
    for (const element of live) {
      const known = lives.get(element)
      if (element.form !== event.target || known?.held === undefined) continue
      if (element.value !== String(known.held.value)) element.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })

const animationFrame = Effect.callback<void>((resume) => {
  const id = requestAnimationFrame(() => resume(Effect.void))
  return Effect.sync(() => cancelAnimationFrame(id))
})

/**
 * The renderer `run` takes: patches the previous tree with each frame, starting from `root`, then settles the inputs on
 * screen with the frame's `seen`. After a patch it waits for the next animation frame before taking another, so it
 * draws at most once per screen refresh: `run` keeps only the latest frame meanwhile. While it draws, it listens to the
 * resets of the forms of its document, to hear each input of its own that one changes.
 */
export const renderInto =
  <Model, Message>(root: Element, view: View<Model, Message>) =>
  (frames: Stream.Stream<Frame<Model, Message>>) => {
    const live = new Set<HTMLInputElement>()
    const patch = init([propsModule, styleModule, eventListenersModule, showsModule(live)])
    const document = root.ownerDocument
    return Effect.acquireRelease(
      Effect.sync(() => {
        const heard = heardAfterReset(live)
        document.addEventListener('reset', heard, true)
        return heard
      }),
      (heard) => Effect.sync(() => document.removeEventListener('reset', heard, true)),
    ).pipe(
      Effect.andThen(Stream.runFoldEffect(
        frames,
        (): Element | VNode => root,
        (previous, { model, dispatch, seen }) =>
          Effect.sync(() => {
            const tree = patch(previous, view(model, dispatch))
            settle(live, seen)
            return tree
          }).pipe(Effect.tap(() => animationFrame)),
      )),
      Effect.asVoid,
      Effect.scoped,
    )
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
