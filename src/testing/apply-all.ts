import { appendStep, type Folded, isRejected, type Update } from '../update.ts'
import { unexpectedRejection } from './unexpected.ts'

/**
 * Applies `messages` in order from `from`, collecting the commands and the events. A rejection fails the test, and
 * so does an error `update` throws: a defect of the program.
 */
export const applyAll =
  <State, Message, Command, Event>(update: Update<State, Message, Command, Event>) =>
  (messages: ReadonlyArray<Message>, from: State): Folded<State, Command, Event> =>
    messages.reduce(
      (folded, message, index) => {
        const result = update(message)(folded.state)
        if (isRejected(result)) throw unexpectedRejection(index, message)
        return appendStep(folded, result)
      },
      { state: from, commands: [], events: [] } as Folded<State, Command, Event>,
    )
