// A place of a program's state that the outside writes. A value a component of the renderer decides (a text, a
// slider's level) is no message of the program: the program declares where it goes (`input`, in `composition`), the view
// writes into the field its model holds (`write`), and the library stores it.
import * as Equal from 'effect/Equal'
import { reject, type Transition } from './update.ts'

/**
 * What an input holds, in the state of the program that reads it: the `value` the outside wrote last, or the one
 * the program put there, and the `revision` of the input, which is the library's: the key of the input a view
 * draws, and nothing else. The program replaces the value by leaving a field that holds another in its place,
 * `field(value)`: the library then gives it the next revision, whatever revision it was made with, so that a view
 * draws a new input for it and what was written into the old one no longer applies. So the state stored differs
 * from the state a step wrote in the revision: a program reads `value` alone, and so does a test, which asserts
 * `state.name.value`, never `toEqual(field(''))`.
 */
export type Field<A> = Readonly<{ value: A; revision: number }>

/** A field that holds `value`: what a program starts an input with, and what it replaces one with. */
export const field = <A>(value: A): Field<A> => ({ value, revision: 0 })

/** What the outside wrote into the input drawn from a field: its value, and the revision it was drawn at. */
export type Written<A> = Readonly<{ _tag: 'Written'; value: A; revision: number }>

/**
 * What a view sends for a value the user gave to the input it drew from `into`, through that input's dispatch
 * (`dispatchTo(dispatch, 'Name')`). It carries the revision of the field drawn, so that a value given to an input
 * the program has since replaced is rejected: the input on screen is another one, which does not show it.
 */
export const write = <A>(into: Field<A>, value: A): Written<A> => ({ _tag: 'Written', value, revision: into.revision })

/**
 * The one rule of an input: what is written into the field of the state is stored, whatever it is and whatever
 * else the state says, since the input on screen already shows it; what was written into a field replaced since is
 * rejected. A value equal to the one held leaves the very same field, so it draws no frame.
 */
export const written = <A>(message: Written<A>) => (held: Field<A>): Transition<Field<A>> =>
  message.revision !== held.revision
    ? reject
    : Equal.equals(message.value, held.value)
    ? { state: held }
    : { state: { value: message.value, revision: held.revision } }

/**
 * A new input for the value `held` holds: what a program leaves in an input's place when what the input on screen
 * means has changed and its value has not (a slider whose bounds narrow), so that what was written into the old one
 * no longer applies. A value that changes needs none: `field(value)` in its place is a new input already.
 */
export const renewed = <A>(held: Field<A>): Field<A> => ({ value: held.value, revision: held.revision + 1 })

/**
 * The field a step of the program left where `before` was, by value: the same input while it holds the same value
 * (by `Equal`), whatever object holds it and whatever revision the program wrote, and a new one, at the next
 * revision, once the value differs. A revision the step raised itself is kept (`renewed`): a revision never stands
 * still under a value the program changed, and never comes back.
 */
export const replaced = <A>(before: Field<A>, after: Field<A>): Field<A> =>
  after === before || after.revision > before.revision
    ? after
    : Equal.equals(after.value, before.value)
    ? before
    : { value: after.value, revision: before.revision + 1 }
