// For the tests of the named timer and of the list of named timers: a parent's reader calls its children's, so a
// child's is shared as its model is.
import type * as Named from "./named.ts"
import { timerMessages } from "./timer.test_reader.ts"

// #region reader
/**
 * What a named timer's model holds, in the order the view draws it: what is typed into the name, filled with the text
 * given, then its timer's messages, wrapped as it receives them.
 */
export const namedMessages = (model: Named.Model, text: string): ReadonlyArray<Named.Message> => [
  { ...model.typed, value: text },
  ...timerMessages(model.timer).map((message) => ({ _tag: "Timer", message }) as const)
]
// #endregion reader
