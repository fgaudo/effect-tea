// A place of a program's state that the outside writes. A value a component of the renderer decides (a text, a
// slider's level) is no message of the program: the program declares where it goes (`inputs`, in `make`), the
// view writes it (a `Written`), and the library stores it.
import * as Equal from "effect/Equal"
import { type Transition } from "./update.ts"

/**
 * A value written into an input.
 *
 * A view sends it through the input's dispatch, `forwardTo(dispatch, 'Name')`. A test writes it the same way.
 *
 * A write is stored wherever its place is there, in the form its input declares, whatever the value is, and whatever
 * else the state says.
 *
 * @example
 * ```ts
 * const write: Written<string> = { _tag: 'Written', value: 'Ada' }
 * ```
 *
 * @see The guide, "Guarantees", "An input stores what is written, where its place is there".
 * @see The guide, "Inputs", "The view writes what the element holds".
 */
export type Written<A> = {
  readonly _tag: "Written"
  /** The value written. */
  readonly value: A
}

/**
 * The one rule of an input: what is written is stored, in the form the input declares, whatever it is and whatever
 * else the state says, since the input on screen already shows it. A place that is not there is the routing's to
 * reject, before this is called, so the form is called only where the place is there. A stored form equal to the one
 * held, by `Equal`, leaves the very same value, so it makes no new model. It reads the message alone: nothing is kept
 * between two writes.
 */
export const written = <A>(message: Written<A>, store?: (value: A) => A) => (held: A): Transition<A> => {
  const value = store === undefined ? message.value : store(message.value)
  return Equal.equals(value, held) ? { state: held } : { state: value }
}
