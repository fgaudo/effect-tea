// The examples' second renderer, React's. With it, `counter-react` and `form-react` draw the programs of
// `counter` and `form`: only the view, `main.ts` and this bridge change with the renderer, and the program and
// its tests stay as they are.
// A view is a plain function of its model, called here on each frame, outside React, so it uses no hooks
// itself: React draws the tree it returns, whole and at once with `flushSync`. A component in that tree keeps no state
// of its own beside the program's: the renderer draws frames and nothing else (the README's "View").
// An input is drawn by `Shows`, a component over an uncontrolled `<input>`: its element changes only by what the user
// types, or by this bridge, which settles every input of its root after each frame with the frame's `seen`, once
// `flushSync` has committed it. An input drawn from a component's own state, outside a frame, is not supported: what
// an input shows is the program's, and the renderer draws frames and nothing else.
// Checked with react and react-dom 19.3.1.
import { type Dispatch, drawn, type Frame, type Shown, typed, type View, type Written } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import {
  type ChangeEvent,
  createContext,
  createElement,
  type InputHTMLAttributes,
  type ReactNode,
  useContext,
} from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

// What the bridge holds of an element that shows an input: what the library made of it, `undefined` until the first
// frame that draws it is settled, and the value the last frame drawn gave it.
type Live = { held: Shown<string> | undefined; value: string }

const lives = new WeakMap<HTMLInputElement, Live>()

// The inputs on screen of one renderer, which its frames settle: React passes it down to every input drawn in its
// root, through a portal too.
const Registry = createContext<Set<HTMLInputElement>>(new Set())

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
  & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange'>): ReactNode => {
  const live = useContext(Registry)
  return createElement('input', {
    ...props,
    // A new ref in every render, so that React gives it the frame's value; a component a memoized subtree skips keeps
    // the last, which is the value of the state it skipped.
    ref: (element: HTMLInputElement) => {
      const known = lives.get(element)
      if (known === undefined) lives.set(element, { held: undefined, value })
      else known.value = value
      live.add(element)
      // React detaches the old ref of a render before it attaches the new one, and runs this on unmount.
      return () => {
        live.delete(element)
      }
    },
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const element = event.target
      const known = lives.get(element)
      if (known?.held === undefined) return
      const { write, sent } = typed(known.held, element.value)
      known.held = sent(send(dispatch, write))
    },
  })
}

// `drawn` returns the very value the element held when it stays, so it is written only when it must be, through the
// element's own setter, which React's tracking of the value hears.
const settle = (live: Set<HTMLInputElement>, seen: number): void => {
  for (const element of live) {
    const known = lives.get(element)
    if (known === undefined) continue
    const next = drawn(known.held, known.value, seen)
    if (known.held === undefined || next.value !== known.held.value) element.value = next.value
    known.held = next
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
  <Model, Message>(element: Element, view: View<Model, Message, ReactNode>) =>
  (frames: Stream.Stream<Frame<Model, Message>>) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        // React calls the components later, from its own scheduler, and reports what they throw to the root, not
        // to whoever rendered: drawn at once, an error is known before the frame is done.
        const thrown: Array<unknown> = []
        const live = new Set<HTMLInputElement>()
        return { root: createRoot(element, { onUncaughtError: (error) => thrown.push(error) }), thrown, live }
      }),
      ({ root }) => Effect.sync(() => root.unmount()),
    ).pipe(
      Effect.flatMap(({ root, thrown, live }) =>
        Stream.runForEach(frames, ({ model, dispatch, seen }) =>
          Effect.sync(() => {
            flushSync(() => root.render(createElement(Registry, { value: live }, view(model, dispatch))))
            if (thrown.length > 0) throw thrown[0]
            // After the commit, not inside `flushSync`'s callback, where React has not committed the frame yet.
            settle(live, seen)
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
