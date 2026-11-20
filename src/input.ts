// A place of a program's state that the outside writes. A value a component of the renderer decides (a text, a
// slider's level) is no message of the program: the program declares where it goes (`inputs`, in `make`), the
// view writes over the value its model holds (a `Written`), and the library stores it.
import * as Equal from "effect/Equal"
import { reject, type Transition } from "./update.ts"

/**
 * A value written into an input, in place of the value its model held.
 *
 * A view sends it through the input's dispatch, `forwardTo(dispatch, 'Name')`, over the value its model holds. A test
 * writes it the same way.
 *
 * A write is stored when its place holds the value it was written over, compared by `Equal`. Otherwise it is rejected.
 * This holds whatever the value is, and whatever else the state says.
 *
 * @example
 * ```ts
 * const write: Written<string> = { _tag: 'Written', was: model.name, value: 'Ada' }
 * ```
 *
 * @see The guide, "Guarantees", "An input stores what is written over the value it holds".
 * @see The guide, "Inputs the user types into", "The view writes over the value its model holds".
 */
export type Written<A> = {
  readonly _tag: "Written"
  /** The value the model held, which the user wrote over. */
  readonly was: A
  /** The value written. */
  readonly value: A
}

/**
 * The one rule of an input: what was written over the value the place holds, by `Equal`, is stored, whatever it is and
 * whatever else the state says, since the input on screen already shows it; what was written over another value is
 * rejected, since the state has moved on without the input that wrote it. A value equal to the one held leaves the
 * very same value, so it makes no new model. It reads the state and the message alone: nothing is kept between two
 * writes.
 */
export const written = <A>(message: Written<A>) => (held: A): Transition<A> =>
  !Equal.equals(message.was, held)
    ? reject
    : Equal.equals(message.value, held)
    ? { state: held }
    : { state: message.value }
