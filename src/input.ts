// A place of a program's state that the outside writes. A value a component of the renderer decides (a text, a
// slider's level) is no message of the program: the program declares where it goes (`input`, in `composition`), the
// view writes over the value its model holds (a `Written`), and the library stores it. What an element on screen holds
// of an input, and what a frame makes of it, is the rule a bridge calls (`typed`, `drawn`): the library's, so that
// every bridge applies the same one.
import * as Equal from 'effect/Equal'
import { reject, type Transition } from './update.ts'

/**
 * What the outside wrote into an input: the `value` it gives now, written over the value it showed, `was`. A view
 * sends it through that input's dispatch (`dispatchTo(dispatch, 'Name')`), and it is stored only while the input's
 * place holds `was`, so that a value typed over a value the program has since replaced is rejected. A bridge makes it
 * with `typed`; a view without one, and a test, write it as data, over the value the model holds:
 * `{ _tag: 'Written', was: model.name, value: 'Ada' }`.
 */
export type Written<A> = Readonly<{ _tag: 'Written'; was: A; value: A }>

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
 * What an element on screen holds of an input: the `value` it shows, which a bridge reads, and the writes it sent that
 * no frame has seen yet, which only `typed` and `drawn` make and read.
 */
export type Shown<A> = Readonly<{
  value: A
  [Unseen]: ReadonlyArray<Readonly<{ sent: number; was: A }>>
}>

const shownOf = <A>(value: A): Shown<A> => ({ value, [Unseen]: [] })

/**
 * The element after the user gave it `value`: `write`, which the bridge sends through the input's dispatch, written
 * over what the element showed, and `sent`, which takes the number that dispatch returned and gives the element as it
 * now is. The write and what the element records of it are made from the one value, so they cannot differ; a bridge
 * calls `sent` once, with the number of that write, or `drawn` may replace what the user typed.
 */
export const typed = <A>(
  held: Shown<A>,
  value: A,
): Readonly<{ write: Written<A>; sent: (number: number) => Shown<A> }> => ({
  write: { _tag: 'Written', was: held.value, value },
  sent: (number) => ({ value, [Unseen]: [...held[Unseen], { sent: number, was: held.value }] }),
})

/**
 * What a frame makes of an element, `held`, or of one just made, `undefined`: `value` is the input's in the frame, and
 * `seen` the frame's own. `shown` is what the element then holds, and `taken` whether it takes the frame's value, which
 * the bridge then writes into it, `shown.value`. There are three cases:
 * - a new element: it shows the frame's very `value`, and is always taken;
 * - the element's own past or present, when the frame holds, by `Equal`, what the element showed before its first write
 *   the frame has not seen, or what it shows when the frame has seen them all: the element stays as it is, showing the
 *   very value it held, and is not taken; only the writes the frame has seen are forgotten;
 * - a state that has moved on without the element, in any other case: the element's writes the frame has not seen will
 *   be rejected, and it shows the frame's very `value`, taken unless it is the very value the element showed.
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
