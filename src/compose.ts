// A parent declares its children, and the library generates how their messages, commands,
// subscriptions and models reach them.
import * as Arr from 'effect/Array'
import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import type { Execution } from './command.ts'
import {
  type AnyProgram,
  type CommandOf,
  type EventOf,
  type ExternalOf,
  type Field,
  type FlagsOf,
  type Init,
  type Interpreter,
  type MessageOf,
  type ModelOf,
  runCommandOf,
  type ServicesOf,
  type Shape,
  startOf,
  type StateOf,
  subscriptionsOf,
} from './program.ts'
import type { Subscription, Subscriptions } from './subscription.ts'
import { isRejected, reject, type Step, type Transition, type Update } from './update.ts'

/** One child in its parent's state. `get` must find what `set` put, and depend on the state alone. */
type Child<ParentState, P> = Readonly<{
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
type Each<ParentState, Id, P> = Readonly<{
  kind: 'each'
  program: P
  get: (state: ParentState, id: Id) => Opt.Option<StateOf<P>>
  set: (state: ParentState, id: Id, child: StateOf<P>) => ParentState
  /** The children whose subscriptions run, with their state (all of them, or those in sight). */
  subscribed: (state: ParentState) => Iterable<readonly [Id, StateOf<P>]>
}>

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
type ChildMessages<C> = {
  [K in keyof C & string]: Readonly<{ _tag: K; message: MessageOf<ProgramOf<C[K]>> }> & At<C[K]>
}[keyof C & string]

/** A child's command, as its parent's interpreter receives it. */
type ChildCommands<C> = {
  [K in keyof C & string]: [CommandOf<ProgramOf<C[K]>>] extends [never] ? never
    : Readonly<{ _tag: K; command: CommandOf<ProgramOf<C[K]>> }> & At<C[K]>
}[keyof C & string]

type ChildServices<C> = { [K in keyof C]: ServicesOf<ProgramOf<C[K]>> }[keyof C]

/** A new child: the state its parent puts where `get` finds it, and the commands it starts with, lifted. */
type Start<P, Command> = Readonly<{ state: StateOf<P>; commands: ReadonlyArray<Command> }>

/**
 * What a parent can do with a child (`children` in `init`, `update` and `onEvent`): start one (`init`, from its
 * flags when it has them), and apply to it one of the messages its type says a parent may send (`update`, e.g. a
 * back button), which returns the parent's transition. Its other messages are its own: only its view and its
 * effects send them.
 */
type Handles<State, C, Command, Event> = {
  readonly [K in keyof C & string]: C[K] extends EachOf<infer Id, infer P> ? Readonly<{
      update: (id: Id, message: ExternalOf<P>) => (state: State) => Transition<State, Command, Event>
      init: [FlagsOf<P>] extends [never] ? (id: Id) => Start<P, Command>
        : (id: Id, flags: FlagsOf<P>) => Start<P, Command>
    }>
    : Readonly<{
      update: (message: ExternalOf<ProgramOf<C[K]>>) => (state: State) => Transition<State, Command, Event>
      init: [FlagsOf<ProgramOf<C[K]>>] extends [never] ? Start<ProgramOf<C[K]>, Command>
        : (flags: FlagsOf<ProgramOf<C[K]>>) => Start<ProgramOf<C[K]>, Command>
    }>
}

/**
 * The children's models (`children` in `makeModel`), made from the parent's state with `get`: a child that is
 * not there is a defect. A child's model is the same object while its state is, so that a view can skip it.
 */
type Models<State, C> = {
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

/** `onEvent` is required exactly when a child emits events, so that none goes unhandled. */
type OnEventOf<State, C, Command, Event> = [keyof OnEvents<State, C, Command, Event>] extends [never]
  ? Readonly<{ onEvent?: OnEvents<State, C, Command, Event> }>
  : Readonly<{ onEvent: OnEvents<State, C, Command, Event> }>

/** `runCommand` is required exactly when the parent has commands of its own, so that none goes uninterpreted. */
type RunCommandOf<OwnCommand, Message, R> = [OwnCommand] extends [never] ? Readonly<{ runCommand?: never }>
  : Readonly<{ runCommand: (command: OwnCommand) => Execution<Message, R> }>

type TagOf<M> = M extends { readonly _tag: infer T } ? T : never

/** An own message that takes a child's name would be routed to the child: it does not compile. */
type NoClash<Own, C> = [Extract<TagOf<Own>, keyof C>] extends [never] ? unknown
  : Readonly<{ 'an own message takes the name of a child': Extract<TagOf<Own>, keyof C> }>

type Config<State, C, Own, OwnCommand, Event, Model, R, K, Flags> =
  & OnEventOf<State, C, OwnCommand | ChildCommands<C>, Event>
  & RunCommandOf<OwnCommand, Own | ChildMessages<C>, R>
  & NoClash<Own, C>
  & Readonly<{
    /**
     * The first state and commands, or, for a parent with flags, the function that makes them from its flags
     * (`(children) => (flags) => …`). A child there from the start is started with `children.<child>.init`, so
     * that its own commands are not lost.
     */
    init: (
      children: Handles<State, C, OwnCommand | ChildCommands<C>, Event>,
    ) => Init<State, OwnCommand | ChildCommands<C>, Flags>
    children: C
    /** The parent's own messages: its children's are routed by the library. */
    update?: (
      message: Own,
      children: Handles<State, C, OwnCommand | ChildCommands<C>, Event>,
    ) => (state: State) => Transition<State, OwnCommand | ChildCommands<C>, Event>
    subscriptions?: Subscriptions<State, Own, R, K>
    makeModel: (state: State, children: Models<State, C>) => Model
  }>

// `makeModel` is pure, so a program's model depends on its state alone: it is kept for as long as that state
// object lives, whoever shows it (two children that share a state, or two runs).
const models = new WeakMap<object, WeakMap<object, unknown>>()

const modelsOf = (program: object) => {
  const found = models.get(program)
  if (found !== undefined) return found
  const kept = new WeakMap<object, unknown>()
  models.set(program, kept)
  return kept
}

/** Who receives what a child at `id` sends: `undefined` for a child that is alone. */
type Place = Readonly<{ name: string; id: unknown }>

type UntypedChild = Readonly<{
  kind: 'one' | 'each'
  program: AnyProgram
  get: (state: unknown, id?: unknown) => Opt.Option<unknown>
  set: (state: unknown, idOrChild: unknown, child?: unknown) => unknown
  subscribed?: (state: unknown) => Opt.Option<unknown> | Iterable<readonly [unknown, unknown]>
}>

const compose = <State, C extends Children<State>, Model, Own, OwnCommand, Event, R, K, External, Flags>(
  config: Config<State, C, Own, OwnCommand, Event, Model, R, K, Flags>,
): Shape<
  State,
  Model,
  Own | ChildMessages<C>,
  OwnCommand | ChildCommands<C>,
  R | ChildServices<C>,
  Event,
  External,
  Flags
> => {
  type Message = Own | ChildMessages<C>
  type Command = OwnCommand | ChildCommands<C>
  const children = config.children as unknown as Readonly<Record<string, UntypedChild>>
  const names = Object.keys(children)
  const childOf = (name: string) => children[name] as UntypedChild
  const isChildName = (tag: unknown): tag is string => typeof tag === 'string' && Object.hasOwn(children, tag)
  const field = (value: unknown, key: string): unknown =>
    typeof value === 'object' && value !== null && key in value
      ? (value as Readonly<Record<string, unknown>>)[key]
      : undefined
  const placeOf = (value: unknown): Place => ({ name: field(value, '_tag') as string, id: field(value, 'id') })
  const isEach = (name: string) => childOf(name).kind === 'each'
  const at = ({ name, id }: Place) => isEach(name) ? { id } : {}
  const wrapMessage = (place: Place) => (message: unknown) => ({ _tag: place.name, ...at(place), message }) as Message
  const wrapCommand = (place: Place) => (command: unknown) => ({ _tag: place.name, ...at(place), command }) as Command
  const getAt = ({ name, id }: Place, state: State) =>
    isEach(name) ? childOf(name).get(state, id) : childOf(name).get(state)
  const setAt = ({ name, id }: Place, state: State, childState: unknown) =>
    (isEach(name) ? childOf(name).set(state, id, childState) : childOf(name).set(state, childState)) as State
  const onEvents = ((config as Readonly<{ onEvent?: unknown }>).onEvent ?? {}) as Readonly<
    Record<string, (...args: ReadonlyArray<unknown>) => (state: State) => Step<State, Command, Event>>
  >
  const onEventAt = (place: Place, event: unknown): (state: State) => Step<State, Command, Event> => {
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
        // A child's events are handled in order, each by the state its predecessors left. An unchanged child
        // leaves its parent's state as it is, so that the very same state draws no new frame.
        return Arr.reduce(
          result.events ?? [],
          {
            state: result.state === childState ? state : setAt(place, state, result.state),
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
  const startAt = (place: Place, flags: unknown) => {
    const { state, commands = [] } = startOf(childOf(place.name).program.init, flags)
    return { state, commands: Arr.map(commands, wrapCommand(place)) }
  }
  const hasFlags = (name: string) => typeof childOf(name).program.init === 'function'
  // Built once: a child's update calls `onEvent`, which may call any child's handle.
  const handles = Object.fromEntries(names.map((name) => [
    name,
    isEach(name)
      ? {
        update: (id: unknown, message: unknown) => updateAt({ name, id }, message),
        init: (id: unknown, flags: unknown) => startAt({ name, id }, flags),
      }
      : {
        update: (message: unknown) => updateAt({ name, id: undefined }, message),
        init: hasFlags(name)
          ? (flags: unknown) => startAt({ name, id: undefined }, flags)
          : startAt({ name, id: undefined }, undefined),
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
  const modelAt = (place: Place, parentState: State) => {
    const { program } = childOf(place.name)
    const childState = Opt.getOrThrowWith(
      getAt(place, parentState),
      () => new Error(`compose: the model of "${place.name}", which is not in this state`),
    )
    if (typeof childState !== 'object' || childState === null) return program.makeModel(childState)
    const kept = modelsOf(program)
    if (kept.has(childState)) return kept.get(childState)
    const model = program.makeModel(childState)
    kept.set(childState, model)
    return model
  }
  const childModels = Object.fromEntries(names.map((name) => [
    name,
    isEach(name)
      ? (parentState: State, id: unknown) => modelAt({ name, id }, parentState)
      : (parentState: State) => modelAt({ name, id: undefined }, parentState),
  ])) as Models<State, C>
  const ownRunCommand = (config as Readonly<{ runCommand?: (command: OwnCommand) => Execution<Message, R> }>)
    .runCommand
  const program = {
    init: config.init(handles),
    update,
    runCommand: (command: Command): Execution<Message, unknown> => {
      const place = placeOf(command)
      if (isChildName(place.name)) {
        const run = runCommandOf(childOf(place.name).program as unknown as Interpreter<unknown, unknown, unknown>)
        return Effect.map(run(field(command, 'command')), Opt.map(wrapMessage(place)))
      }
      // Unreachable through the types: `runCommand` is required whenever the parent has commands of its own.
      if (ownRunCommand === undefined) throw new Error('compose: a command of its own, and no runCommand')
      return ownRunCommand(command as OwnCommand)
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
    makeModel: (state: State): Model => config.makeModel(state, childModels),
  }
  return program as unknown as Shape<State, Model, Message, Command, R | ChildServices<C>, Event, External, Flags>
}

/**
 * What a parent declares of itself, by name: its state, and its own commands, events, external messages and
 * flags.
 */
export type ParentTypes = Readonly<{
  state: unknown
  command?: unknown
  event?: unknown
  external?: unknown
  flags?: unknown
}>

/**
 * The way to make a parent: its types fixed once, by name (`parent<{ state: State; event: Event }>()`), then
 * its children declared with `child` (one) or `each` (by id), and the parent made with `compose`. Its messages
 * are its own and `{ _tag: <child>, message }` for each child (with `id` for children by id); its commands
 * likewise. Fixing the types first is what lets `get`, `set` and the rest be typed without annotations, and
 * the parent's own commands, events, external messages and flags, which nothing it returns can reveal, be known.
 */
export const parent = <T extends ParentTypes>() => {
  type State = Field<T, 'state'>
  type OwnCommand = Field<T, 'command'>
  type Event = Field<T, 'event'>
  return {
    child: <P extends AnyProgram>(program: P, place: Omit<Child<State, P>, 'program' | 'kind'>): Child<State, P> => ({
      kind: 'one',
      program,
      ...place,
    }),
    each: <Id, P extends AnyProgram>(
      program: P,
      place: Omit<Each<State, Id, P>, 'program' | 'kind'>,
    ): Each<State, Id, P> => ({ kind: 'each', program, ...place }),
    // Its external messages are among its own: the intersection keeps only those.
    compose: <C extends Children<State>, Model, Own = never, R = never, K = unknown>(
      config: Config<State, C, Own, OwnCommand, Event, Model, R, K, Field<T, 'flags'>>,
    ) => compose<State, C, Model, Own, OwnCommand, Event, R, K, Field<T, 'external'> & Own, Field<T, 'flags'>>(config),
  }
}
