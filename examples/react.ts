// The examples' second renderer, React's. With it, `counter-react` and `form-react` draw the programs of
// `counter` and `form`: only the view, `main.ts` and this bridge change with the renderer, and the program and
// its tests stay as they are.
// A view is a plain function of its model, called here on each frame, outside React, so it uses no hooks
// itself: React draws the tree it returns. A component in that tree may keep what is only the screen's (a hover,
// an animation, the focus); what the program decides stays in its state, and reaches the view as its model (the
// README's "Structuring a program").
// Checked with react and react-dom 19.3.1.
import { type Dispatch, type Field, type Frame, type View, type Written, write } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import type { ChangeEvent, ReactNode } from 'react'
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
const send = <Message>(dispatch: Dispatch<Message>, message: Message): number => Effect.runSync(dispatch(message))

/** React's `onClick` for a click that sends `message`. */
export const onClick = <Message>(message: Message, dispatch: Dispatch<Message>) => () => send(dispatch, message)

/**
 * React's `onChange` for a text input, whose text `toMessage` turns into a message. The input is uncontrolled: the
 * view gives it a `defaultValue`, never a `value`, and a new `key`, its field's revision, to replace its text. A
 * controlled input would be rewritten from every frame, and a frame older than the last key would take it back.
 */
export const onInput =
  <Message>(toMessage: (text: string) => Message, dispatch: Dispatch<Message>) =>
  (event: ChangeEvent<HTMLInputElement>) => send(dispatch, toMessage(event.target.value))

/** React's `onChange` for a text input drawn from `field`: what is typed is written into it, at the revision drawn. */
export const onWrite = (field: Field<string>, dispatch: Dispatch<Written<string>>) =>
  onInput((text) => write(field, text), dispatch)

/**
 * React's `onChange` for a slider, `<input type="range">`, drawn from `field`, uncontrolled as a text input is
 * (`defaultValue`, and its field's revision as its `key`): where it is dragged is written into the field, at the
 * revision drawn. React calls it on every move, as the `input` event. The browser keeps a range's value a number
 * within its bounds, so `valueAsNumber` is never `NaN` there.
 */
export const onSlide =
  (field: Field<number>, dispatch: Dispatch<Written<number>>) =>
  (event: ChangeEvent<HTMLInputElement>) => send(dispatch, write(field, event.target.valueAsNumber))
