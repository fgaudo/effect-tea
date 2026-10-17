import * as Arr from 'effect/Array'
import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import type { Execution, RunCommand } from './command.ts'
import type { Subscribe, Subscription, Subscriptions } from './subscription.ts'
import { isRejected, reject, type Rejected, type Step, type Transition, type Update } from './update.ts'

/**
 * The view is not part of it: it lives in its own module, so it can be hot reloaded. A program without
 * commands has `never` as its `Command`, and `absurd` (from `effect/Function`) as its `runCommand`.
 */
export interface Program<State, Model, Message, Command, R, Event = never, K = unknown> {
  readonly init: Step<State, Command>
  readonly update: Update<State, Message, Command, Event>
  readonly runCommand: RunCommand<Command, Message, R>
  readonly subscriptions: Subscribe<State, Message, R, K>
  readonly makeModel: (state: State) => Model
}

const mapExecution = <A, B, R>(execution: Execution<A, R>, f: (message: A) => B): Execution<B, R> =>
  Effect.map(execution, Opt.map(f))

const mapSubscriptions = <A, B, R, K, NewK>(
  subscriptions: Subscriptions<K, A, R>,
  mapKey: (key: K) => NewK,
  mapMessage: (message: A) => B,
): Subscriptions<NewK, B, R> =>
  HashMap.reduce(
    subscriptions,
    HashMap.empty<NewK, Subscription<B, R>>(),
    (acc, subscription, key) =>
      HashMap.set(acc, mapKey(key), subscription.pipe(Channel.map(mapMessage), Channel.mapDone(mapMessage))),
  )

type ParentStep<ParentState, ParentCommand> = (state: ParentState) => Step<ParentState, ParentCommand>

/** Required exactly when the child emits events, so none can go unhandled. */
type OnEvent<ChildEvent, Handler> = [ChildEvent] extends [never] ? object : { onEvent: Handler }

/** Required exactly when the child has commands. */
type WrapCommand<ChildCommand, Handler> = [ChildCommand] extends [never] ? object : { wrapCommand: Handler }

/** Writes a child's step back into its parent: its state, its commands (wrapped), then its events, in order. */
const applyChild = <ParentState, ParentCommand, ChildState, ChildCommand, ChildEvent>(
  result: Step<ChildState, ChildCommand, ChildEvent>,
  wrapCommand: (command: ChildCommand) => ParentCommand,
  set: (state: ParentState, child: ChildState) => ParentState,
  onEvent: (event: ChildEvent) => ParentStep<ParentState, ParentCommand>,
) =>
(state: ParentState): Step<ParentState, ParentCommand> =>
  Arr.reduce(
    result.events ?? [],
    { state: set(state, result.state), commands: Arr.map(result.commands ?? [], wrapCommand) },
    (acc, event) => {
      const next = onEvent(event)(acc.state)
      return { state: next.state, commands: [...acc.commands, ...(next.commands ?? [])] }
    },
  )

// Unreachable through the types: `onEvent` and `wrapCommand` are required whenever the child needs them.
const missing = (name: string, key: string, what: string) => (): never => {
  throw new Error(`${name}("${key}"): the child emitted ${what}, but nothing handles it`)
}

type Child<ChildState, ChildMessage, ChildCommand, R, ChildEvent, K> = Pick<
  Program<ChildState, unknown, ChildMessage, ChildCommand, R, ChildEvent, K>,
  'update' | 'runCommand' | 'subscriptions'
>

type EmbedOptions<ParentState, ParentMessage, ParentCommand, ChildState, ChildMessage, ChildCommand, ChildEvent> =
  & {
    key: string
    wrap: (message: ChildMessage) => ParentMessage
    get: (state: ParentState) => Opt.Option<ChildState>
    getSubscribed?: (state: ParentState) => Opt.Option<ChildState>
    set: (state: ParentState, child: ChildState) => ParentState
  }
  & OnEvent<ChildEvent, (event: ChildEvent) => ParentStep<ParentState, ParentCommand>>
  & WrapCommand<ChildCommand, (command: ChildCommand) => ParentCommand>

/**
 * Lifts a child program into its parent.
 *
 * - `wrap` turns a child message into a parent message (e.g. `GotHomeMsg`), and `wrapCommand` a child
 *   command into a parent command (required only when the child has commands).
 * - `get` reads the child state from the parent state; `None` means the child
 *   is not active (e.g. the page is not on the navigation stack), and its messages are rejected.
 * - `getSubscribed`, when given, decides instead of `get` whether the child's
 *   subscriptions run (e.g. only while the page is shown): a child can keep
 *   receiving the completions of its commands without listening to the world.
 * - `set` writes the child state back.
 * - `key` namespaces the child's subscription keys.
 * - `onEvent` handles the events the child emits, in the same transition, after
 *   the child state has been written back.
 *
 * It returns `update`, `subscriptions`, `liftCommands(commands)`, which wraps a child's commands, e.g. those
 * of its `init` when the parent adds it (where the child's state goes is the parent's own business), and
 * `runCommand(command)`, the child's interpreter with its messages wrapped, for the parent's interpreter to
 * delegate to.
 */
// `ParentCommand` comes last, so that it is `never` when neither `wrapCommand` nor `onEvent` gives one.
export const embed = <
  ParentState,
  ParentMessage,
  ChildState,
  ChildMessage,
  ChildCommand,
  R,
  ChildEvent = never,
  K = unknown,
  ParentCommand = never,
>(
  child: Child<ChildState, ChildMessage, ChildCommand, R, ChildEvent, K>,
  options: EmbedOptions<ParentState, ParentMessage, ParentCommand, ChildState, ChildMessage, ChildCommand, ChildEvent>,
) => {
  const { key, wrap, get, set, getSubscribed = get } = options
  const onEvent = 'onEvent' in options ? options.onEvent : missing('embed', key, 'an event')
  const wrapCommand = 'wrapCommand' in options ? options.wrapCommand : missing('embed', key, 'a command')
  return {
    liftCommands: (commands: ReadonlyArray<ChildCommand> = []): ReadonlyArray<ParentCommand> =>
      Arr.map(commands, wrapCommand),

    runCommand: (command: ChildCommand): Execution<ParentMessage, R> => mapExecution(child.runCommand(command), wrap),

    update: (message: ChildMessage) => (state: ParentState): Transition<ParentState, ParentCommand> =>
      Opt.match(get(state), {
        onNone: (): Rejected => reject,
        onSome: (childState) => {
          const result = child.update(message)(childState)
          return isRejected(result) ? result : applyChild(result, wrapCommand, set, onEvent)(state)
        },
      }),

    subscriptions: (state: ParentState): Subscriptions<readonly [string, K], ParentMessage, R> =>
      Opt.match(getSubscribed(state), {
        onNone: () => HashMap.empty(),
        onSome: (childState) =>
          mapSubscriptions(
            child.subscriptions(childState),
            (childKey) => [key, childKey] as const,
            wrap,
          ),
      }),
  }
}

type EmbedEachOptions<
  ParentState,
  ParentMessage,
  ParentCommand,
  Id,
  ChildState,
  ChildMessage,
  ChildCommand,
  ChildEvent,
> =
  & {
    key: string
    wrap: (id: Id, message: ChildMessage) => ParentMessage
    get: (state: ParentState, id: Id) => Opt.Option<ChildState>
    set: (state: ParentState, id: Id, child: ChildState) => ParentState
    subscribed: (state: ParentState) => Iterable<readonly [Id, ChildState]>
  }
  & OnEvent<ChildEvent, (id: Id, event: ChildEvent) => ParentStep<ParentState, ParentCommand>>
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
 * - `onEvent(id, event)` handles what a child asks of its parent;
 * - `liftCommands(id, commands)` lifts a child's commands, e.g. those of its `init` when the parent adds it;
 * - `runCommand(id, command)` runs a child's command with its messages wrapped, for the parent's interpreter.
 */
export const embedEach = <
  ParentState,
  ParentMessage,
  Id,
  ChildState,
  ChildMessage,
  ChildCommand,
  R,
  ChildEvent = never,
  K = unknown,
  ParentCommand = never,
>(
  child: Child<ChildState, ChildMessage, ChildCommand, R, ChildEvent, K>,
  options: EmbedEachOptions<
    ParentState,
    ParentMessage,
    ParentCommand,
    Id,
    ChildState,
    ChildMessage,
    ChildCommand,
    ChildEvent
  >,
) => {
  const { key, wrap, get, set, subscribed } = options
  const onEvent = 'onEvent' in options ? options.onEvent : missing('embedEach', key, 'an event')
  const wrapCommand = 'wrapCommand' in options ? options.wrapCommand : missing('embedEach', key, 'a command')
  return {
    liftCommands: (id: Id, commands: ReadonlyArray<ChildCommand> = []): ReadonlyArray<ParentCommand> =>
      Arr.map(commands, (command) => wrapCommand(id, command)),

    runCommand: (id: Id, command: ChildCommand): Execution<ParentMessage, R> =>
      mapExecution(child.runCommand(command), (message) => wrap(id, message)),

    update: (id: Id, message: ChildMessage) => (state: ParentState): Transition<ParentState, ParentCommand> =>
      Opt.match(get(state, id), {
        onNone: (): Rejected => reject,
        onSome: (childState) => {
          const result = child.update(message)(childState)
          return isRejected(result)
            ? result
            : applyChild(
              result,
              (command: ChildCommand) => wrapCommand(id, command),
              (parent: ParentState, updated: ChildState) => set(parent, id, updated),
              (event: ChildEvent) => onEvent(id, event),
            )(state)
        },
      }),

    subscriptions: (state: ParentState): Subscriptions<readonly [string, Id, K], ParentMessage, R> =>
      Arr.reduce(
        Arr.fromIterable(subscribed(state)),
        HashMap.empty<readonly [string, Id, K], Subscription<ParentMessage, R>>(),
        (acc, [id, childState]) =>
          HashMap.union(
            acc,
            mapSubscriptions(
              child.subscriptions(childState),
              (childKey) => [key, id, childKey] as const,
              (message: ChildMessage) => wrap(id, message),
            ),
          ),
      ),
  }
}
