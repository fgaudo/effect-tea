// The renderer the examples use. The library knows nothing of it: any renderer that can draw a model, run
// `dispatch`, and reach the element of each input after a frame, before the user can act on it, works the same way.
// A bridge does three things: it draws each frame whole and at once, runs `dispatch` in plain handlers, and settles
// each text input on screen with `drawn` after the frame. snabbdom's handlers are plain callbacks, so they run it with
// `send`; it patches synchronously, so each input is settled right after the patch. An input is a native text
// `<input>`, whose element changes only by what the user types, or by this bridge.
// A minimal example to start from, as the guide's "Writing a bridge" says: it settles native text fields alone, in
// the base case, and does not handle a value the element changes by itself. Another native widget would be connected
// by hand with `edited` and `drawn` where it meets their condition, or replaced by one the program draws; a root in a
// shadow tree and a form's reset are left to a bridge that needs them.
// The run's dispatch, and each child's from `forwardTo`, is the same in every frame, so a view can be
// memoized with snabbdom's own `thunk`, its dispatch among the arguments.
// Checked with snabbdom 3.6.4.
import { type Dispatch, drawn, edited, type Frame, type Shown, type Written } from "@fgaudo/effect-tea"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"
import * as Stream from "effect/Stream"
import {
  eventListenersModule,
  init,
  type Module,
  type On,
  propsModule,
  styleModule,
  type VNode,
  type VNodeData
} from "snabbdom"

/** A view of a program, drawn by this renderer: a pure function of its model, which sends its messages through
 * `dispatch`.
 */
export type View<Model, Message> = (model: Model, dispatch: Dispatch<Message>) => VNode

// #region held
// What the bridge holds of an element that shows an input: what the library made of it, `undefined` until the first
// frame that draws it is settled, and the value the last frame drawn gave it.
type Live = { held: Shown<string> | undefined; value: string }

const lives = new WeakMap<Element, Live>()
// #endregion held

// #region shows
/**
 * snabbdom's data for a text input that shows an input of the program, `value`, through the input's own dispatch
 * (`forwardTo(dispatch, 'Name')`): what is typed is written over what the element showed, and the element takes the
 * program's value only once a frame has seen what was typed (`drawn`). It needs no key: the element stays, with its
 * focus, while the program changes what it shows.
 */
export const shows = (value: string, dispatch: Dispatch<Written<string>>): VNodeData => ({
  shows: value,
  on: {
    input: (event: Event) => {
      const element = event.target as HTMLInputElement
      const live = lives.get(element)
      if (live?.held === undefined) return
      const { write, sent } = edited(live.held, element.value)
      live.held = sent(send(dispatch, write))
    }
  }
})
// #endregion shows

// #region module
// The elements on screen that show an input, of one renderer: every one is settled after each frame, whether the frame
// drew it again or a `thunk` skipped it. snabbdom patches an `<input>` into the next one drawn in its place, so an
// element starts showing an input when a frame draws it with `shows`, created or not, as a new element, and stops when
// a frame draws it without, or removes it.
const showsModule = (live: Set<HTMLInputElement>): Module => {
  const drawnAs = (vnode: VNode) => {
    const data = vnode.data
    const element = vnode.elm
    if (!(element instanceof HTMLInputElement)) return
    if (data === undefined || !("shows" in data)) {
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
    // meanwhile sends nothing, since the module of the listeners has taken them off.
    destroy: (vnode) => {
      if (vnode.elm instanceof HTMLInputElement) live.delete(vnode.elm)
    }
  }
}
// #endregion module

// #region settle
const settle = (live: Set<HTMLInputElement>, seen: number): void => {
  for (const element of live) {
    const known = lives.get(element)
    if (known === undefined) continue
    const { shown, taken } = drawn(known.held, known.value, seen)
    if (taken) element.value = shown.value
    known.held = shown
  }
}
// #endregion settle

// #region frames
const animationFrame = Effect.callback<void>((resume) => {
  const id = requestAnimationFrame(() => resume(Effect.void))
  return Effect.sync(() => cancelAnimationFrame(id))
})

/**
 * The renderer `run` takes: patches the previous tree with each frame, starting from `root`, then settles the inputs on
 * screen with the frame's `seen`. A frame whose model is the very one drawn last, which `run` gives for the very same
 * state, is not drawn again: its inputs are only settled. After each frame it waits for the next animation frame
 * before taking another, so it draws at most once per screen refresh: `run` keeps only the latest frame meanwhile.
 */
export const renderInto =
  <Model, Message>(root: Element, view: View<Model, Message>) => (frames: Stream.Stream<Frame<Model, Message>>) => {
    const live = new Set<HTMLInputElement>()
    const patch = init([propsModule, styleModule, eventListenersModule, showsModule(live)])
    return Stream.runFoldEffect(
      frames,
      (): Readonly<{ tree: Element | VNode; drawn: Opt.Option<Model> }> => ({ tree: root, drawn: Opt.none() }),
      (previous, { model, dispatch, seen }) =>
        Effect.sync(() => {
          const same = Opt.isSome(previous.drawn) && previous.drawn.value === model
          const tree = same ? previous.tree : patch(previous.tree, view(model, dispatch))
          settle(live, seen)
          return { tree, drawn: Opt.some(model) }
        }).pipe(Effect.tap(() => animationFrame))
    ).pipe(Effect.asVoid)
  }
// #endregion frames

// #region handlers
/**
 * Sends a message at once, from a plain callback, and returns its number. A dispatch needs no services and completes
 * synchronously, so `Effect.runSync` is enough: the run handles the message with its own services.
 */
const send = <Message>(dispatch: Dispatch<Message>, message: Message): number => Effect.runSync(dispatch(message))

/** snabbdom's `on` for a click that sends `message`. */
export const onClick = <Message>(message: Message, dispatch: Dispatch<Message>): On => ({
  click: () => send(dispatch, message)
})

/** snabbdom's `on` for a press of the pointer that sends `message`: where a drag the program draws starts. */
export const onPress = <Message>(message: Message, dispatch: Dispatch<Message>): On => ({
  pointerdown: () => send(dispatch, message)
})
// #endregion handlers
