/**
 * The result of a transition. `commands` are data, what `update` decided to do in the world, turned into
 * effects by the program's `runCommand`. `events` are for the parent (the "OutMsg" pattern): what happened
 * that the program itself does not handle, e.g. a page asking to be left. A program that emits none leaves
 * `Event` as `never`.
 */
export type Step<State, Command = never, Event = never> = Readonly<{
  state: State
  commands?: ReadonlyArray<Command>
  events?: ReadonlyArray<Event>
}>

/**
 * What `update` returns for a message that makes no sense in the current state.
 *
 * The engine decides what a rejection means from where the message came from:
 * - from a frame whose own state rejects it too: the frame offered an action
 *   that `update` does not accept, i.e. the model and `update` disagree. It is a
 *   bug, however many messages arrived in between.
 * - from a frame whose state accepted it (a click on a frame that was already
 *   outdated, a double tap, …), or from a command or subscription: the message
 *   is stale and is ignored.
 */
export const reject: unique symbol = Symbol.for('@fgaudo/effect-tea/Rejected')
export type Rejected = typeof reject

export const isRejected = (result: unknown): result is Rejected => result === reject

export type Transition<State, Command = never, Event = never> = Step<State, Command, Event> | Rejected

export type Update<State, Message, Command = never, Event = never> = (
  message: Message,
) => (state: State) => Transition<State, Command, Event>
