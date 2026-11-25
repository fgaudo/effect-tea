import { dual } from "effect/Function"

/**
 * What a message does to a state: the next state, and what to do and to tell.
 *
 * A program without events leaves `Event` as `never`, one without commands leaves `Command` as `never`, and one
 * without children leaves `Tell` as `never`.
 *
 * - A command is data. Only the program's `runCommand` runs a command, and the command may answer with one message.
 * - A child raises an event to ask its parent for something.
 * - A parent tells its children what to do as data too: each item of `tell` is given to the child's `external`, once
 *   the step is taken and the children it lists are there.
 *
 * @example
 * ```ts
 * const step: Step<State, Command> = { state: { ...state, saving: true }, commands: [Command.Save({ name })] }
 * ```
 *
 * @see The guide, "Commands".
 * @see The guide, "Events and external messages".
 */
export type Step<State, Command = never, Event = never, Tell = never> = {
  /** The next state. */
  readonly state: State
  /** What `update` decided to do in the world, as data, for the program's `runCommand`. */
  readonly commands?: ReadonlyArray<Command>
  /** The events for the program's parent: what the program asks of it, such as a page that asks to be left. */
  readonly events?: ReadonlyArray<Event>
  /** What a parent tells its children: `{ _tag: <child>, message }`, and the `id` for children by id. */
  readonly tell?: ReadonlyArray<Tell>
}

/**
 * What `update` returns for a message that does not apply in the state, such as a second click or an answer that
 * came too late.
 *
 * A message that `update` rejects is ignored: the state stays as it was, however many messages came in between.
 *
 * Type a function written apart from `make` that returns it, such as the `update` of a module, with `Update` or
 * `Transition`. Returned through a generic function, such as `Opt.match`, `reject` is otherwise widened to `symbol`,
 * which `make` refuses.
 *
 * @example
 * ```ts
 * case 'SaveClicked':
 *   return state.save._tag === 'Saving'
 *     ? reject
 *     : { state: { ...state, save: { _tag: 'Saving' } }, commands: [Command.Save({ name: state.name })] }
 * ```
 *
 * @see The guide, "Guarantees".
 */
export const reject: unique symbol = Symbol.for("@fgaudo/effect-tea/Rejected")
/**
 * The type of `reject`, which has no other value.
 *
 * @example
 * ```ts
 * const result = update(message)(state)
 * if (result === reject) return
 * ```
 *
 * @see The guide, "Update".
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
 *
 * @see The guide, "Update".
 */
export type Transition<State, Command = never, Event = never, Tell = never> =
  | Step<State, Command, Event, Tell>
  | Rejected

/**
 * A step with both its lists present: what a fold of steps accumulates, and what `andThen` and `applyAll` return.
 * What a parent tells is there where a step of the fold told something.
 *
 * @example
 * ```ts
 * const none: Folded<State, never, never> = { state, commands: [], events: [] }
 * ```
 *
 * @see The guide, "Events and external messages".
 * @see The guide, "Testing tools".
 */
export type Folded<State, Command, Event, Tell = never> = {
  readonly state: State
  readonly commands: ReadonlyArray<Command>
  readonly events: ReadonlyArray<Event>
  readonly tell?: ReadonlyArray<Tell>
}

/**
 * How steps add up, for the library's own folds: the state is the last one's, and the commands, the events and what
 * is told are everyone's, in order. A step without a list leaves that list as it was, and `tell` is there only where a
 * step has one.
 */
export const appendStep = <State, Command, Event, Tell>(
  folded: Folded<State, Command, Event, Tell>,
  step: Step<State, Command, Event, Tell>
): Folded<State, Command, Event, Tell> => ({
  state: step.state,
  commands: step.commands === undefined ? folded.commands : [...folded.commands, ...step.commands],
  events: step.events === undefined ? folded.events : [...folded.events, ...step.events],
  ...(step.tell === undefined ? folded.tell === undefined ? {} : { tell: folded.tell } : {
    tell: folded.tell === undefined ? step.tell : [...folded.tell, ...step.tell]
  })
})

/**
 * A step followed by another, which is made from the first step's state.
 *
 * The result has the second step's state, and the commands, the events and what is told of both steps, in order. Both
 * lists are always there. Do not take a step's `state` by hand to make the next step: you would drop its commands,
 * its events and what it tells.
 *
 * It is dual: `andThen(next)` takes the step last, for a chain of steps written with `pipe`.
 *
 * @param step - The first step.
 * @param next - Makes the second step from the first one's state.
 * @returns The two steps as one.
 *
 * @example
 * ```ts
 * // A parent's own step, then one that tells a child.
 * andThen(leave(state), (state) => ({ state, tell: [{ _tag: 'Home', message: { _tag: 'ProductGone', at } }] }))
 * ```
 *
 * @see The guide, "Events and external messages".
 */
export const andThen: {
  <State, Command2 = never, Event2 = never, Tell2 = never>(
    next: (state: State) => Step<State, Command2, Event2, Tell2>
  ): <Command1 = never, Event1 = never, Tell1 = never>(
    step: Step<State, Command1, Event1, Tell1>
  ) => Folded<State, Command1 | Command2, Event1 | Event2, Tell1 | Tell2>
  <State, Command1 = never, Event1 = never, Tell1 = never, Command2 = never, Event2 = never, Tell2 = never>(
    step: Step<State, Command1, Event1, Tell1>,
    next: (state: State) => Step<State, Command2, Event2, Tell2>
  ): Folded<State, Command1 | Command2, Event1 | Event2, Tell1 | Tell2>
} = dual(
  2,
  <State, Command1, Event1, Tell1, Command2, Event2, Tell2>(
    step: Step<State, Command1, Event1, Tell1>,
    next: (state: State) => Step<State, Command2, Event2, Tell2>
  ): Folded<State, Command1 | Command2, Event1 | Event2, Tell1 | Tell2> =>
    appendStep<State, Command1 | Command2, Event1 | Event2, Tell1 | Tell2>(
      {
        state: step.state,
        commands: step.commands ?? [],
        events: step.events ?? [],
        ...(step.tell === undefined ? {} : { tell: step.tell })
      },
      next(step.state)
    )
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
 * @see The guide, "Update".
 */
export type Update<State, Message, Command = never, Event = never> = (
  message: Message
) => (state: State) => Transition<State, Command, Event>
