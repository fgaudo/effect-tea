// A text field that the user types into, and that the program may replace. `revision` grows only when the
// program replaces the text: the view uses it as the input's `key`, so that a new input shows the new text,
// while what the user types stays in the input they are typing into (see `initialValue` in `snabbdom.ts`).
// Keeping both behind these functions means a replaced text cannot forget its revision.

export type Field = Readonly<{ text: string; revision: number }>

export const make = (text: string): Field => ({ text, revision: 0 })

/** What the user typed: the input already shows it. */
export const typed = (field: Field, text: string): Field => ({ ...field, text })

/** A text the program puts in the field, in place of what is there: a new input will show it. */
export const replace = (field: Field, text: string): Field => ({ text, revision: field.revision + 1 })
