// A place of a program's state that the outside writes. A value a component of the renderer decides (a text, a
// slider's level) is no message of the program: the program declares where it goes (`inputs`, in `compose`), the
// view writes over the value its model holds (a `Written`), and the library stores it. What an element on screen holds
// of an input, and what a frame makes of it, is the rule a bridge calls (`edited`, `drawn`): the library's, so that
// every bridge applies the same one.
import * as Equal from 'effect/Equal'
import { reject, type Transition } from './update.ts'

/**
 * A value written into an input, in place of the value the input showed.
 *
 * A view sends it through the input's dispatch, `forwardTo(dispatch, 'Name')`. A bridge makes it with `edited`. A
 * view without a bridge, and a test, write it by hand, over the value the model holds.
 *
 * @example
 * ```ts
 * const write: Written<string> = { _tag: 'Written', was: model.name, value: 'Ada' }
 * ```
 *
 * @remarks
 * From the guide, "Guarantees", "An input stores what is written over the value it holds":
 *
 * **An input stores what is written over the value it holds.** A write is stored when its place holds the value it was
 * written over, and rejected otherwise.
 * - The two values are compared by `Equal`.
 * - This holds whatever the value is, and whatever else the state says.
 * - For the element that shows an input, `drawn` keeps the element as it is while the frame is the element's own past
 *   or present.
 * - Once the state has moved on without it, `drawn` gives the element the frame's value.
 * - What that makes of a screen, and for which elements and renderers, is in "Inputs the user types into".
 */
export type Written<A> = Readonly<{
  _tag: 'Written'
  /** The value the input showed when the user wrote over it. */
  was: A
  /** The value written. */
  value: A
}>

/**
 * The one rule of an input: what was written over the value the place holds, by `Equal`, is stored, whatever it is and
 * whatever else the state says, since the input on screen already shows it; what was written over another value is
 * rejected, since the state has moved on without the input that wrote it. A value equal to the one held leaves the
 * very same value, so it draws no frame. It reads the state and the message alone: nothing is kept between two writes.
 */
export const written = <A>(message: Written<A>) => (held: A): Transition<A> =>
  !Equal.equals(message.was, held)
    ? reject
    : Equal.equals(message.value, held)
    ? { state: held }
    : { state: message.value }

// Hidden: what a bridge holds of an element is the library's to make and read, but for the value it shows.
const Unseen = Symbol('@fgaudo/effect-tea/Shown/unseen')

/**
 * What the element of an input holds: the value it shows, and the writes it sent that no frame has seen yet (see
 * {@link Frame}'s `seen`).
 *
 * A bridge keeps one for each element on screen. Only `drawn` and `edited` make one: the bridge reads only
 * `value`.
 */
export type Shown<A> = Readonly<{
  /** The value the element shows. */
  value: A
  [Unseen]: ReadonlyArray<Readonly<{ sent: number; was: A }>>
}>

const shownOf = <A>(value: A): Shown<A> => ({ value, [Unseen]: [] })

/**
 * What a bridge sends when the user gives an element a new value, and what the element holds once it is sent.
 *
 * @param held - What the element holds now.
 * @param value - The value the user gave it.
 * @returns `write`, to send through the input's dispatch, and `sent`. Call `sent` once, with the number
 * `dispatch(write)` returned: it gives what the element holds from then on, which `drawn` then settles.
 *
 * @example
 * ```ts
 * const { write, sent } = edited(held, element.value)
 * held = sent(Effect.runSync(inputDispatch(write)))
 * ```
 */
export const edited = <A>(
  held: Shown<A>,
  value: A,
): Readonly<{ write: Written<A>; sent: (number: number) => Shown<A> }> => ({
  write: { _tag: 'Written', was: held.value, value },
  sent: (number) => ({ value, [Unseen]: [...held[Unseen], { sent: number, was: held.value }] }),
})

/**
 * What the element of an input holds after a frame, and whether the bridge must write the frame's value into it.
 *
 * @param held - What the element holds, or `undefined` for an element just made.
 * @param value - The input's value in the frame.
 * @param seen - The frame's `seen`.
 * @returns `shown`, what the element holds from then on, and `taken`: when it is true, the bridge writes `shown.value`
 * into the element.
 *
 * @example
 * ```ts
 * // `value`: what the view drew for the input in this frame
 * const { shown, taken } = drawn(held, value, frame.seen)
 * if (taken) element.value = shown.value
 * held = shown
 * ```
 *
 * @remarks
 * From the guide, "Inputs the user types into", "Settling an element":
 *
 * After each frame, a bridge settles the element of each input with `drawn(held, value, seen)`. It is given what the
 * element holds, `held`, or `undefined` for an element just made. `value` is the input's value in the frame, and `seen`
 * is the frame's own `seen`. It gives what the element then holds, `shown`, and whether the element takes the frame's
 * value, `taken`. When it is taken, the bridge writes `shown.value` into the element.
 *
 * There are three cases:
 *
 * - **A new element** shows the frame's very `value`. It is always taken.
 * - **The element's own past or present.** The frame holds, by `Equal`:
 *   - when the frame has not seen all the element's writes, what the element showed before the first of them;
 *   - when it has seen them all, what the element shows.
 *
 *   The element stays as it is, showing the very value it held, and is not taken. Only the writes that the frame has
 *   seen are forgotten.
 * - **A state that has moved on without the element**, in any other case. The element forgets all its writes. The
 *   writes that the frame has not seen are rejected, unless the input's place again holds the value they were written
 *   over (see "two limits"). The element shows the frame's very `value`. It is taken, unless it is the very value the
 *   element showed.
 *
 * `drawn` tells which writes a frame has seen by the numbers that `sent` was given. So a bridge calls the `sent` of
 * `edited` once, with the number its dispatch returned for that write. Otherwise `drawn` may replace what the user
 * typed.
 */
export const drawn = <A>(
  held: Shown<A> | undefined,
  value: A,
  seen: number,
): Readonly<{ shown: Shown<A>; taken: boolean }> => {
  if (held === undefined) return { shown: shownOf(value), taken: true }
  const unseen = held[Unseen].filter((write) => write.sent > seen)
  const first = unseen[0]
  if (!Equal.equals(value, first === undefined ? held.value : first.was)) {
    return { shown: shownOf(value), taken: !Object.is(value, held.value) }
  }
  const shown = unseen.length === held[Unseen].length ? held : { value: held.value, [Unseen]: unseen }
  return { shown, taken: false }
}
