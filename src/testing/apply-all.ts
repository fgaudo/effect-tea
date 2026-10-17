import { isRejected, type Update } from '../update.ts'
import { unexpectedRejection } from './unexpected.ts'

/** Applies `messages` in order from `from`, collecting the commands and the events; a rejection fails the test. */
export const applyAll =
  <State, Message, Command, Event>(update: Update<State, Message, Command, Event>) =>
  (messages: ReadonlyArray<Message>, from: State) =>
    messages.reduce(
      ({ state, commands, events }, message, index) => {
        const result = update(message)(state)
        if (isRejected(result)) throw unexpectedRejection(index, message)
        return {
          state: result.state,
          commands: [...commands, ...(result.commands ?? [])],
          events: [...events, ...(result.events ?? [])],
        }
      },
      {
        state: from,
        commands: [] as ReadonlyArray<Command>,
        events: [] as ReadonlyArray<Event>,
      },
    )
