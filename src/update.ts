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

/**
 * A step followed by another, made from its state: e.g. a parent's own step, then a child's handle,
 * `andThen(leave(state), children.Home.update({ _tag: 'ProductGone', at }))`. The state is the second's, and the
 * commands and the events are both steps', in order; its lists are always present. Taking a step's `state` by
 * hand to make the next one would drop its commands and its events.
 */
export const andThen = <State, Command1, Event1, Command2, Event2>(
  step: Step<State, Command1, Event1>,
  next: (state: State) => Step<State, Command2, Event2>,
): Step<State, Command1 | Command2, Event1 | Event2> =>
  appendStep<State, Command1 | Command2, Event1 | Event2>(
    { state: step.state, commands: step.commands ?? [], events: step.events ?? [] },
    next(step.state),
  )

/**
 * An event a parent has nothing to say about, raised as its own for its own parent to handle, the state
 * unchanged: `onEvent: { Products: raise }`, or `raise(event)(state)` in a handler that decides. It compiles
 * only where the parent's `Event` includes the child's. A handler of children by id takes the id first:
 * `(_, event) => raise(event)`.
 */
export const raise = <Event>(event: Event) => <State>(state: State): Step<State, never, Event> => ({
  state,
  events: [event],
})

export type Update<State, Message, Command = never, Event = never> = (
  message: Message,
) => (state: State) => Transition<State, Command, Event>
