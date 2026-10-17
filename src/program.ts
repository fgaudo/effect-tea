import * as Arr from 'effect/Array'
import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import { absurd } from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import type { Execution, RunCommand } from './command.ts'
import { type Offers, offers } from './offer.ts'
import type { Subscription, Subscriptions } from './subscription.ts'
import { isRejected, reject, type Step, type Transition, type Update } from './update.ts'

/** Required exactly when `Command` has values, so that none can go uninterpreted. */
export type Interpreter<Command, Message, R> = [Command] extends [never] ? object
  : Readonly<{ runCommand: RunCommand<Command, Message, R> }>

/** A program without its `init`, as `embed` takes a child, whose initial state is the parent's business. */
type Pieces<State, Model, Message, Command, R, Event, K> =
  & Readonly<{
    update: Update<State, Message, Command, Event>
    /** What the program listens to in each state; nothing when left out. */
    subscriptions?: Subscriptions<State, Message, R, K>
    makeModel: (state: State, offers: Offers<Message>) => Model
  }>
  & Interpreter<Command, Message, R>

/**
 * The view is not part of it: it lives in its own module, so it can be hot reloaded. `runCommand` is there
 * exactly when the program has commands. `makeModel` receives the offers of its own `update` in that very
 * state, so a model can offer nothing else.
 */
export type Program<State, Model, Message, Command = never, R = never, Event = never, K = unknown> =
  & Readonly<{ init: Step<State, Command> }>
  & Pieces<State, Model, Message, Command, R, Event, K>

// `runCommand` is missing only when `Command` is `never`, so that `absurd` is never called.
export const runCommandOf = <Command, Message, R>(
  program: Interpreter<Command, Message, R>,
): RunCommand<Command, Message, R> =>
  (program as Partial<Readonly<{ runCommand: RunCommand<Command, Message, R> }>>).runCommand
    ?? (absurd as RunCommand<Command, Message, R>)

export const subscriptionsOf = <State, Message, R, K>(
  program: Readonly<{ subscriptions?: Subscriptions<State, Message, R, K> }>,
): Subscriptions<State, Message, R, K> => program.subscriptions ?? (() => HashMap.empty())

/** The model of a program in `state`, with the offers of the program's own `update`, as `run` makes it. */
export const modelOf = <State, Model, Message, Command, Event>(
  program: Readonly<{
    update: Update<State, Message, Command, Event>
    makeModel: (state: State, offers: Offers<Message>) => Model
  }>,
) =>
(state: State): Model => program.makeModel(state, offers(program.update, state))

/**
 * `make`, made once for each state object, then kept while that object lives: a child whose state is the
 * same keeps the very same model, offers included, so that a renderer can memoize its view on it. A model
 * depends only on its state, since `update` and `makeModel` are pure; a state that is not an object is made
 * again each time.
 */
const keptByState = <State, Model>(make: (state: State) => Model) => {
  const made = new WeakMap<object, Model>()
  return (state: State): Model => {
    if (typeof state !== 'object' || state === null) return make(state)
    if (made.has(state)) return made.get(state) as Model
    const model = make(state)
    made.set(state, model)
    return model
  }
}

type ParentStep<ParentState, ParentCommand, ParentEvent> = (
  state: ParentState,
) => Step<ParentState, ParentCommand, ParentEvent>

/** Where a child lives in its parent, and how what it sends and asks for becomes the parent's. */
type Place<ParentState, ParentMessage, ParentCommand, ParentEvent, ChildState, ChildMessage, ChildCommand, ChildEvent> =
  Readonly<{
    get: (state: ParentState) => Opt.Option<ChildState>
    set: (state: ParentState, child: ChildState) => ParentState
    wrap: (message: ChildMessage) => ParentMessage
    wrapCommand: (command: ChildCommand) => ParentCommand
    onEvent: (event: ChildEvent) => ParentStep<ParentState, ParentCommand, ParentEvent>
  }>

/**
 * A child lifted into one place of its parent, shared by `embed` and by each child of `embedEach`. A child's
 * step is written back as its state, its commands (wrapped), then its events, in order, each handled by
 * `onEvent`, whose own commands and events (for the parent's parent) follow, in order too.
 */
const lift = <
  ParentState,
  ParentMessage,
  ParentCommand,
  ParentEvent,
  ChildState,
  ChildMessage,
  ChildCommand,
  R,
  ChildEvent,
  K,
>(
  child: Pieces<ChildState, unknown, ChildMessage, ChildCommand, R, ChildEvent, K>,
  { get, set, wrap, wrapCommand, onEvent }: Place<
    ParentState,
    ParentMessage,
    ParentCommand,
    ParentEvent,
    ChildState,
    ChildMessage,
    ChildCommand,
    ChildEvent
  >,
) => ({
  liftCommands: (commands: ReadonlyArray<ChildCommand> = []): ReadonlyArray<ParentCommand> =>
    Arr.map(commands, wrapCommand),

  runCommand: (command: ChildCommand): Execution<ParentMessage, R> =>
    Effect.map(runCommandOf(child)(command), Opt.map(wrap)),

  update: (message: ChildMessage) => (state: ParentState): Transition<ParentState, ParentCommand, ParentEvent> =>
    Opt.match(get(state), {
      onNone: () => reject,
      onSome: (childState) => {
        const result = child.update(message)(childState)
        return isRejected(result) ? result : Arr.reduce(
          result.events ?? [],
          {
            state: set(state, result.state),
            commands: Arr.map(result.commands ?? [], wrapCommand),
            events: [] as ReadonlyArray<ParentEvent>,
          },
          (acc, event) => {
            const next = onEvent(event)(acc.state)
            return {
              state: next.state,
              commands: [...acc.commands, ...(next.commands ?? [])],
              events: [...acc.events, ...(next.events ?? [])],
            }
          },
        )
      },
    }),

  subscriptions: <NewK>(
    childState: ChildState,
    mapKey: (key: K) => NewK,
  ): HashMap.HashMap<NewK, Subscription<ParentMessage, R>> =>
    HashMap.reduce(
      subscriptionsOf(child)(childState),
      HashMap.empty<NewK, Subscription<ParentMessage, R>>(),
      (acc, subscription, key) =>
        HashMap.set(acc, mapKey(key), subscription.pipe(Channel.map(wrap), Channel.mapDone(wrap))),
    ),
})

/** Required exactly when the child emits events, so none can go unhandled. */
type OnEvent<ChildEvent, Handler> = [ChildEvent] extends [never] ? object : Readonly<{ onEvent: Handler }>

/** Required exactly when the child has commands. */
type WrapCommand<ChildCommand, Handler> = [ChildCommand] extends [never] ? object
  : Readonly<{ wrapCommand: Handler }>

// Unreachable through the types: `onEvent` and `wrapCommand` are required whenever the child needs them.
const missing = (name: string, key: string, what: string) => (): never => {
  throw new Error(`${name}("${key}"): the child emitted ${what}, but nothing handles it`)
}

const handlersOf = <OnEventHandler, WrapCommandHandler>(
  name: string,
  key: string,
  options: object,
) => ({
  onEvent: 'onEvent' in options ? options.onEvent as OnEventHandler : missing(name, key, 'an event') as OnEventHandler,
  wrapCommand: 'wrapCommand' in options
    ? options.wrapCommand as WrapCommandHandler
    : missing(name, key, 'a command') as WrapCommandHandler,
})

type EmbedOptions<
  ParentState,
  ParentMessage,
  ParentCommand,
  ParentEvent,
  ChildState,
  ChildMessage,
  ChildCommand,
  ChildEvent,
> =
  & Readonly<{
    key: string
    wrap: (message: ChildMessage) => ParentMessage
    get: (state: ParentState) => Opt.Option<ChildState>
    subscribed?: (state: ParentState) => Opt.Option<ChildState>
    set: (state: ParentState, child: ChildState) => ParentState
  }>
  & OnEvent<ChildEvent, (event: ChildEvent) => ParentStep<ParentState, ParentCommand, ParentEvent>>
  & WrapCommand<ChildCommand, (command: ChildCommand) => ParentCommand>

/**
 * Lifts a child program into its parent.
 *
 * - `wrap` turns a child message into a parent message (e.g. `GotHomeMsg`), and `wrapCommand` a child
 *   command into a parent command (required only when the child has commands).
 * - `get` reads the child state from the parent state; `None` means the child
 *   is not active (e.g. the page is not on the navigation stack), and its messages are rejected.
 * - `subscribed`, when given, decides instead of `get` whether the child's
 *   subscriptions run (e.g. only while the page is shown): a child can keep
 *   receiving the completions of its commands without listening to the world.
 * - `set` writes the child state back.
 * - `key` namespaces the child's subscription keys.
 * - `onEvent` handles the events the child emits, in the same transition, after
 *   the child state has been written back. The step it returns may emit events of the parent's own, for the
 *   parent's parent: they come out of the returned `update`.
 *
 * It returns `update`, `subscriptions`, `liftCommands(commands)`, which wraps a child's commands, e.g. those
 * of its `init` when the parent adds it (where the child's state goes is the parent's own business), and
 * `runCommand(command)`, the child's interpreter with its messages wrapped, for the parent's interpreter to
 * delegate to, and `makeModel(childState)`, the child's model with the offers of the child's own `update`, for
 * the parent's model, the very same object while the child's state is. The child's view sends through
 * `mapDispatch(dispatch, wrap)`.
 */
// `ParentCommand` and `ParentEvent` come last, so that they are `never` when nothing gives one.
export const embed = <
  ParentState,
  ParentMessage,
  ChildState,
  ChildModel,
  ChildMessage,
  ChildCommand,
  R = never,
  ChildEvent = never,
  K = unknown,
  ParentCommand = never,
  ParentEvent = never,
>(
  child: Pieces<ChildState, ChildModel, ChildMessage, ChildCommand, R, ChildEvent, K>,
  options: EmbedOptions<
    ParentState,
    ParentMessage,
    ParentCommand,
    ParentEvent,
    ChildState,
    ChildMessage,
    ChildCommand,
    ChildEvent
  >,
) => {
  const { key, wrap, get, set, subscribed = get } = options
  const lifted = lift(child, {
    get,
    set,
    wrap,
    ...handlersOf<
      (event: ChildEvent) => ParentStep<ParentState, ParentCommand, ParentEvent>,
      (command: ChildCommand) => ParentCommand
    >('embed', key, options),
  })
  return {
    liftCommands: lifted.liftCommands,

    runCommand: lifted.runCommand,

    makeModel: keptByState(modelOf(child)),

    update: lifted.update,

    subscriptions: (state: ParentState): HashMap.HashMap<readonly [string, K], Subscription<ParentMessage, R>> =>
      Opt.match(subscribed(state), {
        onNone: () => HashMap.empty(),
        onSome: (childState) => lifted.subscriptions(childState, (childKey) => [key, childKey] as const),
      }),
  }
}

type EmbedEachOptions<
  ParentState,
  ParentMessage,
  ParentCommand,
  ParentEvent,
  Id,
  ChildState,
  ChildMessage,
  ChildCommand,
  ChildEvent,
> =
  & Readonly<{
    key: string
    wrap: (id: Id, message: ChildMessage) => ParentMessage
    get: (state: ParentState, id: Id) => Opt.Option<ChildState>
    set: (state: ParentState, id: Id, child: ChildState) => ParentState
    subscribed: (state: ParentState) => Iterable<readonly [Id, ChildState]>
  }>
  & OnEvent<ChildEvent, (id: Id, event: ChildEvent) => ParentStep<ParentState, ParentCommand, ParentEvent>>
  & WrapCommand<ChildCommand, (id: Id, command: ChildCommand) => ParentCommand>

/**
 * Lifts a collection of child programs, each identified by an `Id` (e.g. the cards of a list), into their
 * parent. Like `embed`, with the id passed along:
 *
 * - `wrap(id, message)` and `wrapCommand(id, command)` turn a child's message and command into the parent's,
 *   so that they reach that child;
 * - `get(state, id)` and `set(state, id, child)` read and write one child (`None`: gone, so its messages are
 *   rejected);
 * - `subscribed(state)` lists the children whose subscriptions run, with their state (all of them, or the
 *   visible ones); their keys are namespaced by `key` and the id, so ids must compare by value (strings,
 *   numbers, or Effect data);
 * - `onEvent(id, event)` handles what a child asks of its parent, and may emit events of the parent's own;
 * - `liftCommands(id, commands)` lifts a child's commands, e.g. those of its `init` when the parent adds it;
 * - `runCommand(id, command)` runs a child's command with its messages wrapped, for the parent's interpreter;
 * - `makeModel(childState)` makes a child's model with the offers of the child's own `update`, the very same
 *   object while the child's state is.
 */
export const embedEach = <
  ParentState,
  ParentMessage,
  Id,
  ChildState,
  ChildModel,
  ChildMessage,
  ChildCommand,
  R = never,
  ChildEvent = never,
  K = unknown,
  ParentCommand = never,
  ParentEvent = never,
>(
  child: Pieces<ChildState, ChildModel, ChildMessage, ChildCommand, R, ChildEvent, K>,
  options: EmbedEachOptions<
    ParentState,
    ParentMessage,
    ParentCommand,
    ParentEvent,
    Id,
    ChildState,
    ChildMessage,
    ChildCommand,
    ChildEvent
  >,
) => {
  const { key, wrap, get, set, subscribed } = options
  const { onEvent, wrapCommand } = handlersOf<
    (id: Id, event: ChildEvent) => ParentStep<ParentState, ParentCommand, ParentEvent>,
    (id: Id, command: ChildCommand) => ParentCommand
  >('embedEach', key, options)
  const at = (id: Id) =>
    lift(child, {
      get: (state: ParentState) => get(state, id),
      set: (state: ParentState, childState: ChildState) => set(state, id, childState),
      wrap: (message: ChildMessage) => wrap(id, message),
      wrapCommand: (command: ChildCommand) => wrapCommand(id, command),
      onEvent: (event: ChildEvent) => onEvent(id, event),
    })
  return {
    liftCommands: (id: Id, commands?: ReadonlyArray<ChildCommand>): ReadonlyArray<ParentCommand> =>
      at(id).liftCommands(commands),

    runCommand: (id: Id, command: ChildCommand): Execution<ParentMessage, R> => at(id).runCommand(command),

    makeModel: keptByState(modelOf(child)),

    update: (id: Id, message: ChildMessage) => at(id).update(message),

    subscriptions: (state: ParentState): HashMap.HashMap<readonly [string, Id, K], Subscription<ParentMessage, R>> =>
      Arr.reduce(
        Arr.fromIterable(subscribed(state)),
        HashMap.empty<readonly [string, Id, K], Subscription<ParentMessage, R>>(),
        (acc, [id, childState]) =>
          HashMap.union(acc, at(id).subscriptions(childState, (childKey) => [key, id, childKey] as const)),
      ),
  }
}
