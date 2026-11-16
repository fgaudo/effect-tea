// The examples' second renderer, React's. With it, `counter-react` and `form-react` draw the programs of
// `counter` and `form`: only the view, `main.ts` and this bridge change with the renderer, and the program and
// its tests stay as they are.
// A bridge does three things: it draws each frame whole and at once, runs `dispatch` in plain handlers, and settles
// each text input on screen with `drawn` after the frame. A view is a plain function of its model, called here on each
// frame, outside React, so it uses no hooks itself: React draws the tree it returns, whole and at once with
// `flushSync`. An input is drawn by `Shows`, over a native, uncontrolled text `<input>`: its element changes only by
// what the user types, or by this bridge, which settles every input of its root after each frame with the frame's
// `seen`, once `flushSync` has committed it.
// A minimal example to start from, as the README's "View" says: it settles native text fields alone, in the base case,
// and does not handle a value the element changes by itself. Another native widget would be connected by hand with
// `typed` and `drawn` where it meets their condition, or replaced by one the program draws; a component with state or
// effects of its own, Suspense, a subtree skipped by `memo`, a portal, a root in a shadow tree, a form's reset, and a
// run whose root is inside another run's are left to a bridge that needs them. The inputs a frame settles are found
// in the root's own elements: a portal's are elsewhere, and a run inside another's root would be settled by both, so
// such a bridge would need to know the run each input belongs to, as a context of its own would tell it.
// Checked with react and react-dom 19.3.1.
import { type Dispatch, drawn, type Frame, type Shown, typed, type Written } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import { createElement, type InputHTMLAttributes, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

/** A view of a program, drawn by this renderer: a pure function of its model, which sends its messages through
 * `dispatch`.
 */
export type View<Model, Message> = (model: Model, dispatch: Dispatch<Message>) => ReactNode

// What the bridge holds of an element that shows an input: what the library made of it, `undefined` until the first
// frame that draws it is settled, the value the last frame drawn gave it, and the dispatch of its last render.
type Live = { held: Shown<string> | undefined; value: string; dispatch: Dispatch<Written<string>> }

const lives = new WeakMap<HTMLInputElement, Live>()

/**
 * A text input that shows an input of the program, `value`, through the input's own dispatch
 * (`dispatchTo(dispatch, 'Name')`): what is typed is written over what the element showed, and the element takes the
 * program's value only when the state has moved on without it (`drawn`). The `<input>` is uncontrolled and needs no
 * key: the element stays, with its focus, while the program changes what it shows. Its other props are the
 * `<input>`'s.
 */
export const Shows = ({
  value,
  dispatch,
  ...props
}:
  & Readonly<{ value: string; dispatch: Dispatch<Written<string>> }>
  & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange'>): ReactNode =>
  createElement('input', {
    ...props,
    // A new ref in every render, so that React gives it the frame's value. React calls it with `null` as it detaches
    // it.
    ref: (element: HTMLInputElement | null) => {
      if (element === null) return
      const known = lives.get(element)
      if (known !== undefined) {
        known.value = value
        known.dispatch = dispatch
        return
      }
      lives.set(element, { held: undefined, value, dispatch })
      // The element's own `input` event, not React's `onChange`: React leaves out an event that finds the value as
      // its tracking of the value last heard it, and that tracking is React's to change. Added once per element, it
      // goes with the element.
      element.addEventListener('input', () => {
        const current = lives.get(element)
        if (current?.held === undefined) return
        const { write, sent } = typed(current.held, element.value)
        current.held = sent(send(current.dispatch, write))
      })
    },
  })

// Every `<input>` of the root that `Shows` drew: React draws a `Shows` and a plain `<input>` as different elements.
const settle = (root: Element, seen: number): void => {
  for (const element of root.querySelectorAll('input')) {
    const known = lives.get(element)
    if (known === undefined) continue
    const { shown, taken } = drawn(known.held, known.value, seen)
    if (taken) element.value = shown.value
    known.held = shown
  }
}

const animationFrame = Effect.callback<void>((resume) => {
  const id = requestAnimationFrame(() => resume(Effect.void))
  return Effect.sync(() => cancelAnimationFrame(id))
})

/**
 * The renderer `run` takes: draws each frame into a React root made in `element`, settles its inputs with the frame's
 * `seen` once React has committed it, and unmounts the root when the run ends. After a frame it waits for the next
 * animation frame before taking another, as the snabbdom bridge does. A view that throws throws here, its components
 * included, so the run dies with it.
 */
export const renderInto =
  <Model, Message>(element: Element, view: View<Model, Message>) =>
  (frames: Stream.Stream<Frame<Model, Message>>) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        // React calls the components later, from its own scheduler, and reports what they throw to the root, not
        // to whoever rendered: drawn at once, an error is known before the frame is done.
        const thrown: Array<unknown> = []
        return { root: createRoot(element, { onUncaughtError: (error) => thrown.push(error) }), thrown }
      }),
      ({ root }) =>
        Effect.sync(() => {
          // Emptied at once, as `flushSync` promises of the DOM: `unmount` says no more than that React lets go of it.
          flushSync(() => root.render(null))
          root.unmount()
        }),
    ).pipe(
      Effect.flatMap(({ root, thrown }) =>
        Stream.runForEach(frames, ({ model, dispatch, seen }) =>
          Effect.sync(() => {
            flushSync(() => root.render(view(model, dispatch)))
            if (thrown.length > 0) throw thrown[0]
            // After the commit, not inside `flushSync`'s callback, where React has not committed the frame yet.
            settle(element, seen)
          }).pipe(Effect.tap(() => animationFrame)))
      ),
      Effect.scoped,
    )

/** Sends a message from a React callback, and returns its number: a dispatch needs no services and is synchronous. */
const send = <Message>(dispatch: Dispatch<Message>, message: Message): number => Effect.runSync(dispatch(message))

/** React's `onClick` for a click that sends `message`. */
export const onClick = <Message>(message: Message, dispatch: Dispatch<Message>) => () => send(dispatch, message)

/** React's `onPointerDown` for a press of the pointer that sends `message`: where a drag the program draws starts. */
export const onPress = <Message>(message: Message, dispatch: Dispatch<Message>) => () => send(dispatch, message)
