// The examples' second renderer, React's. With it, `counter-react` and `form-react` draw the programs of
// `counter` and `form`: only the view, `main.ts` and this bridge change with the renderer, and the program and
// its tests stay as they are.
// A view is a plain function of its model, called here on each frame, outside React, so it uses no hooks
// itself: React draws the tree it returns, whole and at once with `flushSync`. A component in that tree keeps no state
// of its own beside the program's: the renderer draws frames and nothing else (the README's "View").
// An input is drawn by `Shows`, a component over an uncontrolled `<input>`: its element changes only by what the user
// types, or by this bridge, which settles every input of its root after each frame with the frame's `seen`, once
// `flushSync` has committed it, and hears a reset of its form as a key. An input drawn from a component's own state, outside a frame, is not supported: what
// an input shows is the program's, and the renderer draws frames and nothing else.
// Checked with react and react-dom 19.3.1.
import { type Dispatch, drawn, type Frame, type Shown, typed, type Written } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import {
  createContext,
  createElement,
  type InputHTMLAttributes,
  type ReactNode,
  useContext,
} from 'react'
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
      if (known === undefined) {
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
      } else {
        known.value = value
        known.dispatch = dispatch
      }
      live.add(element)
      // React detaches the old ref of a render before it attaches the new one, and runs this on unmount.
      return () => {
        live.delete(element)
      }
    },
  })
}

const settle = (live: Set<HTMLInputElement>, seen: number): void => {
  for (const element of live) {
    const known = lives.get(element)
    if (known === undefined) continue
    const { shown, taken } = drawn(known.held, known.value, seen)
    if (taken) element.value = shown.value
    known.held = shown
  }
}

// A form's reset gives each of its inputs its default value, with no input event (HTML, "Resetting a form"), after the
// `reset` event, as React's own resets do (after an Action, `requestFormReset`): once it has, each input of the root
// whose value it changed is heard as if the user had typed it.
const heardAfterReset = (live: Set<HTMLInputElement>) => (event: Event) =>
  queueMicrotask(() => {
    for (const element of live) {
      const known = lives.get(element)
      if (element.form !== event.target || known?.held === undefined) continue
      if (element.value !== known.held.value) element.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })

const animationFrame = Effect.callback<void>((resume) => {
  const id = requestAnimationFrame(() => resume(Effect.void))
  return Effect.sync(() => cancelAnimationFrame(id))
})

/**
 * The renderer `run` takes: draws each frame into a React root made in `element`, settles its inputs with the frame's
 * `seen` once React has committed it, and unmounts the root when the run ends. After a frame it waits for the next
 * animation frame before taking another, as the snabbdom bridge does. A view that throws throws here, its components
 * included, so the run dies with it. While it draws, it listens to the resets of the forms of its document, to hear
 * each input of its root that one changes.
 */
export const renderInto =
  <Model, Message>(element: Element, view: View<Model, Message>) =>
  (frames: Stream.Stream<Frame<Model, Message>>) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        // React calls the components later, from its own scheduler, and reports what they throw to the root, not
        // to whoever rendered: drawn at once, an error is known before the frame is done.
        const thrown: Array<unknown> = []
        const live = new Set<HTMLInputElement>()
        const heard = heardAfterReset(live)
        element.ownerDocument.addEventListener('reset', heard, true)
        return { root: createRoot(element, { onUncaughtError: (error) => thrown.push(error) }), thrown, live, heard }
      }),
      ({ root, heard }) =>
        Effect.sync(() => {
          element.ownerDocument.removeEventListener('reset', heard, true)
          // Emptied at once, as `flushSync` promises of the DOM: `unmount` says no more than that React lets go of it.
          flushSync(() => root.render(null))
          root.unmount()
        }),
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
