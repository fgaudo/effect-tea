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
 * What `update` returns for a message that makes no sense in the current state: a second click, an answer
 * that came too late. The run ignores it, and the state stays as it was. The testing tools tell those from a
 * control the view shows where `update` rejects its message (`dispatchViolations`).
 */
export const reject: unique symbol = Symbol.for('@fgaudo/effect-tea/Rejected')
export type Rejected = typeof reject

export const isRejected = (result: unknown): result is Rejected => result === reject

export type Transition<State, Command = never, Event = never> = Step<State, Command, Event> | Rejected

/** A step with both its lists present: what a fold of steps accumulates. */
export type Folded<State, Command, Event> = Readonly<{
  state: State
  commands: ReadonlyArray<Command>
  events: ReadonlyArray<Event>
}>

/**
 * How steps add up, for the library's own folds: the state is the last one's, and the commands and the events
 * are everyone's, in order. A step without a list leaves that list as it was.
 */
export const appendStep = <State, Command, Event>(
  folded: Folded<State, Command, Event>,
  step: Step<State, Command, Event>,
): Folded<State, Command, Event> => ({
  state: step.state,
  commands: step.commands === undefined ? folded.commands : [...folded.commands, ...step.commands],
  events: step.events === undefined ? folded.events : [...folded.events, ...step.events],
})

export type Update<State, Message, Command = never, Event = never> = (
  message: Message,
) => (state: State) => Transition<State, Command, Event>
