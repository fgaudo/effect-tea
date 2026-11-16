// For the tests of the named timer and of the list of named timers: a parent's reader calls its children's, so a
// child's is shared as its model is.
import type * as Named from './named.ts'
import { timerMessages } from './timer.test_reader.ts'

// #region reader
/**
 * What a named timer's model holds: its timer's messages, wrapped as it receives them, in the order the view draws
 * them. What is typed into the name is none of them.
 */
export const namedMessages = (model: Named.Model): ReadonlyArray<Named.Message> =>
  timerMessages(model.timer).map((message) => ({ _tag: 'Timer', message }))
// #endregion reader
