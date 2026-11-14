// A text field that the user types into, and that the program may replace. A frame may be older than the user's
// last keystroke (the README's "Inputs the user types into"), so rewriting an input from every frame can eat what
// was just typed. One side owns the text at a time:
// - while the user types, the input owns it. The view writes the text only when the input is created
//   (`initialValue` in `snabbdom.ts`; `defaultValue`, never `value`, in React and React Native), and the program
//   learns it from the input's messages, which `update` accepts in every state where the input exists;
// - when the program replaces it (clears the form after saving, say), `revision` grows. The view uses it as the
//   input's `key`, so that the renderer creates a new input with the new text.
// Keeping both behind these functions means a replaced text cannot forget its revision.

export type Field = Readonly<{ text: string; revision: number }>

export const make = (text: string): Field => ({ text, revision: 0 })

/** What the user typed: the input already shows it. */
export const typed = (field: Field, text: string): Field => ({ ...field, text })

/** A text the program puts in the field, in place of what is there: a new input will show it. */
export const replace = (field: Field, text: string): Field => ({ text, revision: field.revision + 1 })
