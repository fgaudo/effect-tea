// Prototype: a parent declares its children, and the library generates how their messages, commands,
// subscriptions and models reach them. A parent decides whether a child is there only with `get` (and
// `subscribed`), never by rejecting its messages, so an offer that its child's `update` accepts is accepted
// by the whole program.
import * as Arr from 'effect/Array'
import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import type { Execution, RunCommand } from '../command.ts'
import { type Interpreter, runCommandOf, subscriptionsOf } from '../program.ts'
import type { Subscription, Subscriptions } from '../subscription.ts'
import { isRejected, reject, type Step, type Transition, type Update } from '../update.ts'
import { type Context, type Offers, offersAt } from './offer.ts'

export type Program<State, Model, Message, Command = never, R = never, Event = never, K = unknown> =
  & Readonly<{
    init: Step<State, Command>
    update: Update<State, Message, Command, Event>
    subscriptions?: Subscriptions<State, Message, R, K>
    makeModel: (state: State, offers: Offers<Message>) => Model
  }>
  & Interpreter<Command, Message, R>

// Only what every program has: `Program<any, …>` would demand a `runCommand` (`[any] extends [never]` is false).
type AnyProgram = Readonly<{ init: Step<any, any>; update: any; makeModel: any }>

type StateOf<P> = P extends { readonly init: Step<infer S, any> } ? S : never
type ModelOf<P> = P extends { readonly makeModel: (state: any, offers: any) => infer M } ? M : never
type MessageOf<P> = P extends { readonly update: (message: infer M) => any } ? M : never
type CommandOf<P> = P extends { readonly init: Step<any, infer C> } ? C : never
type EventOf<P> = P extends { readonly update: Update<any, any, any, infer E> } ? E : never
type ServicesOf<P> =
  | (P extends { readonly runCommand: RunCommand<any, any, infer R> } ? R : never)
  | (P extends { readonly subscriptions?: Subscriptions<any, any, infer R, any> } ? R : never)

/** One child in its parent's state. `get` must find what `set` put, and depend on the state alone. */
export type Child<ParentState, P> = Readonly<{
  kind: 'one'
  program: P
  get: (state: ParentState) => Opt.Option<StateOf<P>>
  set: (state: ParentState, child: StateOf<P>) => ParentState
  /** Whether its subscriptions run; `get` when left out. */
  subscribed?: (state: ParentState) => Opt.Option<StateOf<P>>
}>

/**
 * Children told apart by an id (e.g. the rows of a list), each with its own state. Ids go into subscription
 * keys and messages, so they must compare by value (strings, numbers).
 */
export type Each<ParentState, Id, P> = Readonly<{
  kind: 'each'
  program: P
  get: (state: ParentState, id: Id) => Opt.Option<StateOf<P>>
  set: (state: ParentState, id: Id, child: StateOf<P>) => ParentState
  /** The children whose subscriptions run, with their state (all of them, or those in sight). */
  subscribed: (state: ParentState) => Iterable<readonly [Id, StateOf<P>]>
}>

export const child = <ParentState, P extends AnyProgram>(
  program: P,
  place: Omit<Child<ParentState, P>, 'program' | 'kind'>,
): Child<ParentState, P> => ({ kind: 'one', program, ...place })

export const each = <ParentState, Id, P extends AnyProgram>(
  program: P,
  place: Omit<Each<ParentState, Id, P>, 'program' | 'kind'>,
): Each<ParentState, Id, P> => ({ kind: 'each', program, ...place })

// `never` parameters: any `set` fits, whatever its child's state and id.
type Children<State> = Readonly<
  Record<
    string,
    | Readonly<{
      kind: 'one'
      program: AnyProgram
      get: (state: State) => Opt.Option<unknown>
      set: (state: State, child: never) => State
    }>
    | Readonly<{
      kind: 'each'
      program: AnyProgram
      get: (state: State, id: never) => Opt.Option<unknown>
      set: (state: State, id: never, child: never) => State
    }>
  >
>

type ProgramOf<C> = C extends { readonly program: infer P } ? P : never

// Told by `kind` and the id `get` takes: `Each<any, …>` would not match, its `set` taking `unknown` children.
type EachOf<Id, P> = Readonly<{ kind: 'each'; program: P; get: (state: any, id: Id) => any }>

/** Where a child's messages and commands carry its id: only for children by id. */
type At<C> = C extends EachOf<infer Id, any> ? Readonly<{ id: Id }> : unknown

/** A child's message, as its parent receives it: `{ _tag: <child>, message }`, and its `id` for each child. */
export type ChildMessages<C> = {
  [K in keyof C & string]: Readonly<{ _tag: K; message: MessageOf<ProgramOf<C[K]>> }> & At<C[K]>
}[keyof C & string]

/** A child's command, as its parent's interpreter receives it. */
export type ChildCommands<C> = {
  [K in keyof C & string]: [CommandOf<ProgramOf<C[K]>>] extends [never] ? never
    : Readonly<{ _tag: K; command: CommandOf<ProgramOf<C[K]>> }> & At<C[K]>
}[keyof C & string]

type ChildServices<C> = { [K in keyof C]: ServicesOf<ProgramOf<C[K]>> }[keyof C]

/** What a parent can do with a child: send it a message (e.g. an external one), lift its commands. */
export type Handles<State, C, Command, Event> = {
  readonly [K in keyof C & string]: C[K] extends EachOf<infer Id, infer P> ? Readonly<{
      update: (id: Id, message: MessageOf<P>) => (state: State) => Transition<State, Command, Event>
      liftCommands: (id: Id, commands?: ReadonlyArray<CommandOf<P>>) => ReadonlyArray<Command>
    }>
    : Readonly<{
      update: (message: MessageOf<ProgramOf<C[K]>>) => (state: State) => Transition<State, Command, Event>
      liftCommands: (commands?: ReadonlyArray<CommandOf<ProgramOf<C[K]>>>) => ReadonlyArray<Command>
    }>
}

/** The children's models, made from the parent's state with `get`: a child that is not there is a defect. */
export type Models<State, C> = {
  readonly [K in keyof C & string]: C[K] extends EachOf<infer Id, infer P> ? (state: State, id: Id) => ModelOf<P>
    : (state: State) => ModelOf<ProgramOf<C[K]>>
}

type OnEvents<State, C, Command, Event> = {
  readonly [K in keyof C & string as [EventOf<ProgramOf<C[K]>>] extends [never] ? never : K]: C[K] extends
    EachOf<infer Id, infer P> ? (
      id: Id,
      event: EventOf<P>,
      children: Handles<State, C, Command, Event>,
    ) => (state: State) => Step<State, Command, Event>
    : (
      event: EventOf<ProgramOf<C[K]>>,
      children: Handles<State, C, Command, Event>,
    ) => (state: State) => Step<State, Command, Event>
}

export type Config<State, C, Own, OwnCommand, Event, Model, R, K> = Readonly<{
  init: Step<State, OwnCommand | ChildCommands<C>>
  children: C
  /** The parent's own messages: its children's are routed by the library. */
  update?: (
    message: Own,
    children: Handles<State, C, OwnCommand | ChildCommands<C>, Event>,
  ) => (state: State) => Transition<State, OwnCommand | ChildCommands<C>, Event>
  onEvent: OnEvents<State, C, OwnCommand | ChildCommands<C>, Event>
  runCommand?: (command: OwnCommand) => Execution<Own | ChildMessages<C>, R>
  subscriptions?: Subscriptions<State, Own, R, K>
  makeModel: (state: State, offers: Offers<Own> & Readonly<{ children: Models<State, C> }>) => Model
}>

/** How an `Offers` reaches the root, for the children's offers made from it. */
type Level = Readonly<{ context: Context; lift: (message: unknown) => unknown }>

const levels = new WeakMap<object, Level>()

/** The offers of a level, with what its children need to make theirs. */
export const offersOfLevel = <Message>(
  accepts: (message: Message) => boolean,
  lift: (message: Message) => unknown,
  context: Context,
): Offers<Message> => {
  const offers = offersAt(accepts, lift, context)
  levels.set(offers, { context, lift: lift as (message: unknown) => unknown })
  return offers
}

/** The offers of the root of a program in `state`. */
export const rootOffers = <State, Message>(
  update: Update<State, Message, unknown, unknown>,
  state: State,
  context: Context,
): Offers<Message> =>
  offersOfLevel((message: Message) => !isRejected(update(message)(state)), (message) => message, context)

/** Who made the offers of a model made outside `run` (e.g. in a test): no engine applies them. */
const outsideRun: Context = { run: {}, revision: 0 }

/** A program's model in `state`, with offers of its own, as `run` makes it (outside `run`, e.g. in a test). */
export const modelOf = <State, Model, Message>(
  program: Readonly<
    { update: Update<State, Message, unknown, unknown>; makeModel: (state: State, offers: Offers<Message>) => Model }
  >,
) =>
(state: State): Model => program.makeModel(state, rootOffers(program.update, state, outsideRun))

/** Who receives what a child at `id` sends: `undefined` for a child that is alone. */
type Place = Readonly<{ name: string; id: unknown }>

type UntypedChild = Readonly<{
  kind: 'one' | 'each'
  program: AnyProgram
  get: (state: unknown, id?: unknown) => Opt.Option<unknown>
  set: (state: unknown, idOrChild: unknown, child?: unknown) => unknown
  subscribed?: (state: unknown) => Opt.Option<unknown> | Iterable<readonly [unknown, unknown]>
}>

/**
 * A parent made of children: its own messages, commands and subscriptions, and the children's, routed by
 * `get` and `set`. Its `Message` is its own and `{ _tag: <child>, message }` for each child (with `id` for
 * children by id); its `Command` likewise.
 */
export const compose = <
  State,
  C extends Children<State>,
  Model,
  Own = never,
  OwnCommand = never,
  Event = never,
  R = never,
  K = unknown,
>(
  config: Config<State, C, Own, OwnCommand, Event, Model, R, K>,
): Program<State, Model, Own | ChildMessages<C>, OwnCommand | ChildCommands<C>, R | ChildServices<C>, Event> => {
  type Message = Own | ChildMessages<C>
  type Command = OwnCommand | ChildCommands<C>
  const children = config.children as unknown as Readonly<Record<string, UntypedChild>>
  const names = Object.keys(children)
  const childOf = (name: string) => children[name] as UntypedChild
  const isChildName = (tag: unknown): tag is string => typeof tag === 'string' && Object.hasOwn(children, tag)
  const field = (value: unknown, key: string): unknown =>
    typeof value === 'object' && value !== null && key in value ? (value as Readonly<Record<string, unknown>>)[key]
    : undefined
  const placeOf = (value: unknown): Place => ({ name: field(value, '_tag') as string, id: field(value, 'id') })
  const isEach = (name: string) => childOf(name).kind === 'each'
  const at = ({ name, id }: Place) => isEach(name) ? { id } : {}
  const wrapMessage = (place: Place) => (message: unknown) => ({ _tag: place.name, ...at(place), message }) as Message
  const wrapCommand = (place: Place) => (command: unknown) => ({ _tag: place.name, ...at(place), command }) as Command
  const getAt = ({ name, id }: Place, state: State) => isEach(name) ? childOf(name).get(state, id) : childOf(name).get(state)
  const setAt = ({ name, id }: Place, state: State, childState: unknown) =>
    (isEach(name) ? childOf(name).set(state, id, childState) : childOf(name).set(state, childState)) as State
  const onEvents = config.onEvent as Readonly<Record<string, (...args: ReadonlyArray<unknown>) => (state: State) => Step<State, Command, Event>>>
  const onEventAt = (place: Place, event: unknown): ((state: State) => Step<State, Command, Event>) => {
    const handle = onEvents[place.name]
    if (handle === undefined) throw new Error(`compose: the child "${place.name}" emitted an event, nothing handles it`)
    return isEach(place.name) ? handle(place.id, event, handles) : handle(event, handles)
  }
  const updateAt = (place: Place, message: unknown) => (state: State): Transition<State, Command, Event> =>
    Opt.match(getAt(place, state), {
      onNone: () => reject,
      onSome: (childState) => {
        const result = childOf(place.name).program.update(message)(childState) as Transition<unknown, unknown, unknown>
        if (isRejected(result)) return reject
        // A child's events are handled in order, each by the state its predecessors left.
        return Arr.reduce(
          result.events ?? [],
          {
            state: setAt(place, state, result.state),
            commands: Arr.map(result.commands ?? [], wrapCommand(place)),
            events: [] as ReadonlyArray<Event>,
          },
          (acc, event) => {
            const next = onEventAt(place, event)(acc.state)
            return {
              state: next.state,
              commands: [...acc.commands, ...(next.commands ?? [])],
              events: [...acc.events, ...(next.events ?? [])],
            }
          },
        )
      },
    })
  const liftAt = (place: Place) => (commands: ReadonlyArray<unknown> = []) => Arr.map(commands, wrapCommand(place))
  // Built once: a child's update calls `onEvent`, which may call any child's handle.
  const handles = Object.fromEntries(names.map((name) => [
    name,
    isEach(name)
      ? {
        update: (id: unknown, message: unknown) => updateAt({ name, id }, message),
        liftCommands: (id: unknown, commands?: ReadonlyArray<unknown>) => liftAt({ name, id })(commands),
      }
      : {
        update: (message: unknown) => updateAt({ name, id: undefined }, message),
        liftCommands: (commands?: ReadonlyArray<unknown>) => liftAt({ name, id: undefined })(commands),
      },
  ])) as unknown as Handles<State, C, Command, Event>
  const update: Update<State, Message, Command, Event> = (message) => (state) => {
    const place = placeOf(message)
    if (isChildName(place.name)) return updateAt(place, field(message, 'message'))(state)
    return config.update === undefined ? reject : config.update(message as Own, handles)(state)
  }
  const subscriptionsAt = (place: Place, childState: unknown) =>
    HashMap.map(
      subscriptionsOf(
        childOf(place.name).program as Readonly<{ subscriptions?: Subscriptions<unknown, unknown, unknown, unknown> }>,
      )(childState),
      (subscription) => subscription.pipe(Channel.map(wrapMessage(place)), Channel.mapDone(wrapMessage(place))),
    )
  const listening = (name: string, state: State): ReadonlyArray<readonly [Place, unknown]> => {
    const { get, subscribed } = childOf(name)
    if (isEach(name)) {
      const all = (subscribed as (state: unknown) => Iterable<readonly [unknown, unknown]>)(state)
      return Arr.map(Arr.fromIterable(all), ([id, childState]) => [{ name, id }, childState] as const)
    }
    const one = (subscribed ?? get) as (state: unknown) => Opt.Option<unknown>
    return Opt.match(one(state), { onNone: () => [], onSome: (childState) => [[{ name, id: undefined }, childState]] })
  }
  // A child's model, kept while its state is the same object and its id the same, in each run apart: its offers
  // carry the run that made them, and its id. New children often share one initial state object.
  const models = new Map(names.map((name) => [name, new WeakMap<object, WeakMap<object, Map<unknown, unknown>>>()]))
  const modelAt = (place: Place, parentState: State, level: Level) => {
    const { program } = childOf(place.name)
    const childState = Opt.getOrThrowWith(
      getAt(place, parentState),
      () => new Error(`compose: the model of "${place.name}", which is not in this state`),
    )
    const make = () =>
      program.makeModel(
        childState,
        offersOfLevel(
          (message) => !isRejected(program.update(message)(childState)),
          (message) => level.lift(wrapMessage(place)(message)),
          level.context,
        ),
      )
    if (typeof childState !== 'object' || childState === null) return make()
    const byRun = models.get(place.name) as WeakMap<object, WeakMap<object, Map<unknown, unknown>>>
    const byState = byRun.get(level.context.run) ?? new WeakMap<object, Map<unknown, unknown>>()
    byRun.set(level.context.run, byState)
    const byId = byState.get(childState) ?? new Map<unknown, unknown>()
    byState.set(childState, byId)
    if (byId.has(place.id)) return byId.get(place.id)
    const model = make()
    byId.set(place.id, model)
    return model
  }
  const program = {
    init: config.init,
    update,
    runCommand: (command: Command): Execution<Message, unknown> => {
      const place = placeOf(command)
      if (isChildName(place.name)) {
        const run = runCommandOf(childOf(place.name).program as unknown as Interpreter<unknown, unknown, unknown>)
        return Effect.map(run(field(command, 'command')), Opt.map(wrapMessage(place)))
      }
      if (config.runCommand === undefined) throw new Error('compose: a command of its own, and no runCommand')
      return config.runCommand(command as OwnCommand)
    },
    subscriptions: (state: State) =>
      Arr.reduce(
        names,
        HashMap.map(
          config.subscriptions?.(state) ?? HashMap.empty<K, Subscription<Own, R>>(),
          (subscription) => subscription as Subscription<Message, unknown>,
        ) as HashMap.HashMap<unknown, Subscription<Message, unknown>>,
        (acc, name) =>
          Arr.reduce(listening(name, state), acc, (all, [place, childState]) =>
            HashMap.reduce(subscriptionsAt(place, childState), all, (keyed, subscription, key) =>
              HashMap.set(keyed, isEach(name) ? [name, place.id, key] as const : [name, key] as const, subscription))),
      ),
    makeModel: (state: State, offers: Offers<Message>): Model => {
      const level = levels.get(offers)
      if (level === undefined) throw new Error('compose: offers that the library did not make')
      const models = Object.fromEntries(names.map((name) => [
        name,
        isEach(name)
          ? (parentState: State, id: unknown) => modelAt({ name, id }, parentState, level)
          : (parentState: State) => modelAt({ name, id: undefined }, parentState, level),
      ])) as Models<State, C>
      // The parent's own messages are among its messages: its offers of them are offers of its own.
      const own = offers as unknown as Offers<Own>
      return config.makeModel(state, { offer: own.offer, offerInput: own.offerInput, children: models })
    },
  }
  return program as unknown as Program<State, Model, Message, Command, R | ChildServices<C>, Event>
}
