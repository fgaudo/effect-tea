import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'

/**
 * What a message does to a state: the next state, and what to do and to tell.
 *
 * A program without events leaves `Event` as `never`, and one without commands leaves `Command` as `never`.
 *
 * - A command is data. Only the program's `runCommand` runs a command, and the command may answer with one message.
 * - A child raises an event to ask its parent for something.
 *
 * @example
 * ```ts
 * const step: Step<State, Command> = { state: { ...state, saving: true }, commands: [Command.Save({ name })] }
 * ```
 *
 * @see The guide, "Commands", "In short".
 * @see The guide, "Events and external messages", "A child raises an event".
 */
export type Step<State, Command = never, Event = never> = Readonly<{
  /** The next state. */
  state: State
  /** What `update` decided to do in the world, as data, for the program's `runCommand`. */
  commands?: ReadonlyArray<Command>
  /** The events for the program's parent: what the program asks of it, such as a page that asks to be left. */
  events?: ReadonlyArray<Event>
}>

/**
 * What `update` returns for a message that does not apply in the state, such as a second click or an answer that
 * came too late.
 *
 * A message that `update` rejects is ignored: the state stays as it was, however many messages came in between.
 *
 * @example
 * ```ts
 * case 'SaveClicked':
 *   return state.save._tag === 'Saving'
 *     ? reject
 *     : { state: { ...state, save: { _tag: 'Saving' } }, commands: [Command.Save({ name: state.name })] }
 * ```
 *
 * @see The guide, "Guarantees", "Outdated clicks are harmless".
 */
export const reject: unique symbol = Symbol.for('@fgaudo/effect-tea/Rejected')
/**
 * The type of `reject`, which has no other value.
 *
 * @example
 * ```ts
 * const result = update(message)(state)
 * if (result === reject) return
 * ```
 */
export type Rejected = typeof reject

/**
 * What `update` returns for a message in a state: a `Step`, or `reject` when the message does not apply in it.
 *
 * @example
 * ```ts
 * const decrement = (state: State): Transition<State> =>
 *   state.count === 0 ? reject : { state: { count: state.count - 1 } }
 * ```
 */
export type Transition<State, Command = never, Event = never> = Step<State, Command, Event> | Rejected

/**
 * A step with both its lists present: what a fold of steps accumulates, and what `applyAll` returns.
 *
 * @example
 * ```ts
 * const none: Folded<State, never, never> = { state, commands: [], events: [] }
 * ```
 *
 * @see The guide, "Testing", "The tools".
 */
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
 * A step followed by another, which is made from the first step's state.
 *
 * The result has the second step's state, and the commands and events of both steps, in order. Both lists are always
 * there. Do not take a step's `state` by hand to make the next step: you would drop its commands and events.
 *
 * It is dual: `andThen(next)` takes the step last, for a chain of steps written with `pipe`.
 *
 * @param step - The first step.
 * @param next - Makes the second step from the first one's state.
 * @returns The two steps as one.
 *
 * @example
 * ```ts
 * // A parent's own step, then a child's handle.
 * andThen(leave(state), children.Home.update({ _tag: 'ProductGone', at }))
 * ```
 *
 * @see The guide, "Events and external messages", "`andThen`".
 */
export const andThen: {
  <State, Command2, Event2>(
    next: (state: State) => Step<State, Command2, Event2>,
  ): <Command1 = never, Event1 = never>(
    step: Step<State, Command1, Event1>,
  ) => Step<State, Command1 | Command2, Event1 | Event2>
  <State, Command1, Event1, Command2, Event2>(
    step: Step<State, Command1, Event1>,
    next: (state: State) => Step<State, Command2, Event2>,
  ): Step<State, Command1 | Command2, Event1 | Event2>
} = dual(
  2,
  <State, Command1, Event1, Command2, Event2>(
    step: Step<State, Command1, Event1>,
    next: (state: State) => Step<State, Command2, Event2>,
  ): Step<State, Command1 | Command2, Event1 | Event2> =>
    appendStep<State, Command1 | Command2, Event1 | Event2>(
      { state: step.state, commands: step.commands ?? [], events: step.events ?? [] },
      next(step.state),
    ),
)

/**
 * A step followed by one more for each item, in order.
 *
 * Each step is made from the state the previous one left. The result has the last step's state, and the commands and
 * events of every step, in order. Both lists are always there.
 *
 * It is dual: `forEach(items, next)` takes the step last, for a chain of steps written with `pipe`.
 *
 * @param step - The first step.
 * @param items - One more step is made for each of them.
 * @param next - Makes the step of an item from the state the previous step left.
 * @returns All the steps as one.
 *
 * @example
 * ```ts
 * // A parent that tells each of its children by id the same thing.
 * forEach({ state }, state.rows, ({ id }) => children.Row.update(id, Cleared()))
 * ```
 *
 * @see The guide, "Events and external messages", "`forEach`".
 */
export const forEach: {
  <Item, State, Command2, Event2>(
    items: Iterable<Item>,
    next: (item: Item) => (state: State) => Step<State, Command2, Event2>,
  ): <Command1 = never, Event1 = never>(
    step: Step<State, Command1, Event1>,
  ) => Step<State, Command1 | Command2, Event1 | Event2>
  <State, Command1, Event1, Item, Command2, Event2>(
    step: Step<State, Command1, Event1>,
    items: Iterable<Item>,
    next: (item: Item) => (state: State) => Step<State, Command2, Event2>,
  ): Step<State, Command1 | Command2, Event1 | Event2>
} = dual(
  3,
  <State, Command1, Event1, Item, Command2, Event2>(
    step: Step<State, Command1, Event1>,
    items: Iterable<Item>,
    next: (item: Item) => (state: State) => Step<State, Command2, Event2>,
  ): Step<State, Command1 | Command2, Event1 | Event2> => {
    const first: Folded<State, Command1 | Command2, Event1 | Event2> = {
      state: step.state,
      commands: step.commands ?? [],
      events: step.events ?? [],
    }
    return Arr.reduce(items, first, (folded, item) => appendStep(folded, next(item)(folded.state)))
  },
)

/**
 * A program's `update`: given a message, then a state, what the message does in that state.
 *
 * It returns a step, or `reject` when the message makes no sense in the state.
 *
 * - Keep it pure: return commands instead of running effects.
 * - It may be called at any time. Never assume that it runs once per message, or only for a message that was sent.
 * - Never mutate the state, nested objects included. Return a new one.
 *
 * @example
 * ```ts
 * const update: Update<State, Message> = (message) => (state) =>
 *   message === 'Increment' ? { state: { count: state.count + 1 } } : { state: { count: state.count - 1 } }
 * ```
 *
 * @see The guide, "Update", "In short".
 * @see The guide, "Update", "Keep it pure".
 * @see The guide, "Update", "It may be called at any time".
 * @see The guide, "Update", "Never mutate the state".
 */
export type Update<State, Message, Command = never, Event = never> = (
  message: Message,
) => (state: State) => Transition<State, Command, Event>
