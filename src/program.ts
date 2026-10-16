import * as Arr from 'effect/Array'
import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import type { Command } from './command.ts'
import type { Subscribe, Subscription, Subscriptions } from './subscription.ts'
import { isRejected, reject, type Rejected, type Step, type Transition, type Update } from './update.ts'

/** The view is not part of it: it lives in its own module, so it can be hot reloaded. */
export interface Program<State, Model, Message, R, Event = never, K = unknown> {
  readonly init: Step<State, Message, R>
  readonly update: Update<State, Message, R, Event>
  readonly subscriptions: Subscribe<State, Message, R, K>
  readonly makeModel: (state: State) => Model
}

const mapCommands = <A, B, R>(
  commands: ReadonlyArray<Command<A, R>>,
  f: (message: A) => B,
): ReadonlyArray<Command<B, R>> => Arr.map(commands, Effect.map(Opt.map(f)))

/** Maps the commands of a step; its events are left to the caller. */
const mapStep = <State, A, B, R, Event>(
  { state, commands = [] }: Step<State, A, R, Event>,
  f: (message: A) => B,
): Step<State, B, R> => ({ state, commands: mapCommands(commands, f) })

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

type ParentStep<ParentState, ParentMessage, R> = (state: ParentState) => Step<ParentState, ParentMessage, R>

/** Required exactly when the child emits events, so none can go unhandled. */
type OnEvent<ChildEvent, Handler> = [ChildEvent] extends [never] ? object : { onEvent: Handler }

/** Writes a child's step back into its parent: its state, its commands (wrapped), then its events, in order. */
const applyChild = <ParentState, ParentMessage, ChildState, ChildMessage, R, ChildEvent>(
  result: Step<ChildState, ChildMessage, R, ChildEvent>,
  wrap: (message: ChildMessage) => ParentMessage,
  set: (state: ParentState, child: ChildState) => ParentState,
  onEvent: (event: ChildEvent) => ParentStep<ParentState, ParentMessage, R>,
) =>
(state: ParentState): Step<ParentState, ParentMessage, R> => {
  const step = mapStep(result, wrap)
  return Arr.reduce(
    result.events ?? [],
    { state: set(state, step.state), commands: step.commands ?? [] },
    (acc, event) => {
      const next = onEvent(event)(acc.state)
      return { state: next.state, commands: [...acc.commands, ...(next.commands ?? [])] }
    },
  )
}

// Unreachable through the types: `onEvent` is required whenever the child has events.
const missingOnEvent = (name: string, key: string) => (): never => {
  throw new Error(`${name}("${key}"): the child emitted an event, but no onEvent was given`)
}

type EmbedOptions<ParentState, ParentMessage, ChildState, ChildMessage, ChildEvent, R> =
  & {
    key: string
    wrap: (message: ChildMessage) => ParentMessage
    get: (state: ParentState) => Opt.Option<ChildState>
    getSubscribed?: (state: ParentState) => Opt.Option<ChildState>
    set: (state: ParentState, child: ChildState) => ParentState
  }
  & OnEvent<ChildEvent, (event: ChildEvent) => ParentStep<ParentState, ParentMessage, R>>

/**
 * Lifts a child program into its parent.
 *
 * - `wrap` turns a child message into a parent message (e.g. `GotHomeMsg`).
 * - `get` reads the child state from the parent state; `None` means the child
 *   is not active (e.g. the page is not on the navigation stack), and its messages are rejected.
 * - `getSubscribed`, when given, decides instead of `get` whether the child's
 *   subscriptions run (e.g. only while the page is shown): a child can keep
 *   receiving the completions of its commands without listening to the world.
 * - `set` writes the child state back.
 * - `key` namespaces the child's subscription keys.
 * - `onEvent` handles the events the child emits, in the same transition, after
 *   the child state has been written back.
 */
export const embed = <ParentState, ParentMessage, ChildState, ChildMessage, R, ChildEvent = never, K = unknown>(
  child: Pick<Program<ChildState, unknown, ChildMessage, R, ChildEvent, K>, 'update' | 'subscriptions'>,
  options: EmbedOptions<ParentState, ParentMessage, ChildState, ChildMessage, ChildEvent, R>,
) => {
  const { key, wrap, get, set, getSubscribed = get } = options
  const onEvent = 'onEvent' in options ? options.onEvent : missingOnEvent('embed', key)
  return {
    init: (step: Step<ChildState, ChildMessage, R>) => mapStep(step, wrap),

    update: (message: ChildMessage) => (state: ParentState): Transition<ParentState, ParentMessage, R> =>
      Opt.match(get(state), {
        onNone: (): Rejected => reject,
        onSome: (childState) => {
          const result = child.update(message)(childState)
          return isRejected(result) ? result : applyChild(result, wrap, set, onEvent)(state)
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

type EmbedEachOptions<ParentState, ParentMessage, Id, ChildState, ChildMessage, ChildEvent, R> =
  & {
    key: string
    wrap: (id: Id, message: ChildMessage) => ParentMessage
    get: (state: ParentState, id: Id) => Opt.Option<ChildState>
    set: (state: ParentState, id: Id, child: ChildState) => ParentState
    subscribed: (state: ParentState) => Iterable<readonly [Id, ChildState]>
  }
  & OnEvent<ChildEvent, (id: Id, event: ChildEvent) => ParentStep<ParentState, ParentMessage, R>>

/**
 * Lifts a collection of child programs, each identified by an `Id` (e.g. the cards of a list), into their
 * parent. Like `embed`, with the id passed along:
 *
 * - `wrap(id, message)` turns a child's message into a parent message, so that it reaches that child;
 * - `get(state, id)` and `set(state, id, child)` read and write one child (`None`: gone, so its messages are
 *   rejected);
 * - `subscribed(state)` lists the children whose subscriptions run, with their state (all of them, or the
 *   visible ones); their keys are namespaced by `key` and the id, so ids must compare by value (strings,
 *   numbers, or Effect data);
 * - `onEvent(id, event)` handles what a child asks of its parent;
 * - `init(id, step)` lifts the initial step of a new child, for the parent's update that adds it.
 */
export const embedEach = <
  ParentState,
  ParentMessage,
  Id,
  ChildState,
  ChildMessage,
  R,
  ChildEvent = never,
  K = unknown,
>(
  child: Pick<Program<ChildState, unknown, ChildMessage, R, ChildEvent, K>, 'update' | 'subscriptions'>,
  options: EmbedEachOptions<ParentState, ParentMessage, Id, ChildState, ChildMessage, ChildEvent, R>,
) => {
  const { key, wrap, get, set, subscribed } = options
  const onEvent = 'onEvent' in options ? options.onEvent : missingOnEvent('embedEach', key)
  return {
    init: (id: Id, step: Step<ChildState, ChildMessage, R>) =>
      mapStep(step, (message: ChildMessage) => wrap(id, message)),

    update: (id: Id, message: ChildMessage) => (state: ParentState): Transition<ParentState, ParentMessage, R> =>
      Opt.match(get(state, id), {
        onNone: (): Rejected => reject,
        onSome: (childState) => {
          const result = child.update(message)(childState)
          return isRejected(result)
            ? result
            : applyChild(
              result,
              (message: ChildMessage) => wrap(id, message),
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
