// A parent declares its children and its inputs, and the library generates how their messages, commands,
// subscriptions and models reach them, and stores what is written into each input.
import * as Arr from 'effect/Array'
import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import * as Equal from 'effect/Equal'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import type * as Optic from 'effect/Optic'
import * as Predicate from 'effect/Predicate'
import * as Record from 'effect/Record'
import * as Result from 'effect/Result'
import type { Execution, RunCommand } from './command.ts'
import { CompositionDefect } from './defect.ts'
import { type Written, written } from './input.ts'
import { describeByTag } from './log.ts'
import {
  type AnyProgram,
  type CommandOf,
  type EventOf,
  type ExternalAmong,
  type ExternalOf,
  type Field,
  type FlagsOf,
  type Init,
  type Interpreter,
  type MessageOf,
  type ModelOf,
  type ObjectState,
  type ServicesOf,
  type Shape,
  startOf,
  type StateOf,
  subscriptionsOf,
} from './program.ts'
import type { Subscription, Subscriptions } from './subscription.ts'
import { appendStep, type Folded, isRejected, reject, type Step, type Transition, type Update } from './update.ts'

/**
 * Where a child lives in its parent's state: `get`, which finds what `set` put and depends on the state alone,
 * or an optic that is both (`Optic.id<State>().key('clock')`, or `.compose(Optic.some())` for a child that may
 * not be there).
 */
type Placement<ParentState, ChildState> =
  | Readonly<{
    get: (state: ParentState) => Opt.Option<ChildState>
    set: (state: ParentState, child: ChildState) => ParentState
    at?: never
  }>
  | Readonly<{ at: Optic.Optional<ParentState, ChildState>; get?: never; set?: never }>

/** Where a child by id lives: `get` and `set` take the id, or the optic is a function of it. */
type EachPlacement<ParentState, Id, ChildState> =
  | Readonly<{
    get: (state: ParentState, id: Id) => Opt.Option<ChildState>
    set: (state: ParentState, id: Id, child: ChildState) => ParentState
    at?: never
  }>
  | Readonly<{ at: (id: Id) => Optic.Optional<ParentState, ChildState>; get?: never; set?: never }>

/** One child in its parent's state. */
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
 * keys, messages and their dispatches, which tell them apart with `Equal`: strings, numbers, or tuples and
 * structs of them.
 */
type Each<ParentState, Id, P> = Readonly<{
  kind: 'each'
  program: P
  get: (state: ParentState, id: Id) => Opt.Option<StateOf<P>>
  set: (state: ParentState, id: Id, child: StateOf<P>) => ParentState
  /** The children whose subscriptions run, with their state (all of them, or those in sight). */
  subscribed: (state: ParentState) => Iterable<readonly [Id, StateOf<P>]>
}>

// An optic focuses or not: `None` where it does not, and `replace` is only called where `get` focused.
const placed = <S, A>(
  place: Placement<S, A>,
): Readonly<{ get: (state: S) => Opt.Option<A>; set: (state: S, child: A) => S }> =>
  place.at === undefined
    ? { get: place.get, set: place.set }
    : {
      get: (state) => Result.getSuccess(place.at.getResult(state)),
      set: (state, child) => place.at.replace(child, state),
    }

const placedEach = <S, Id, A>(
  place: EachPlacement<S, Id, A>,
): Readonly<{ get: (state: S, id: Id) => Opt.Option<A>; set: (state: S, id: Id, child: A) => S }> =>
  place.at === undefined
    ? { get: place.get, set: place.set }
    : {
      get: (state, id) => Result.getSuccess(place.at(id).getResult(state)),
      set: (state, id, child) => place.at(id).replace(child, state),
    }

/**
 * An input in its program's state: where the value the outside writes over lives. It is no child: the value is the
 * program's own state, which its `update` and its `makeModel` read as they read the rest.
 */
type InputAt<State, A> = Readonly<{
  kind: 'input'
  get: (state: State) => Opt.Option<A>
  set: (state: State, value: A) => State
}>

/** The inputs a parent declares, by name: `{ Name: input(at) }`. */
type Inputs<State> = Readonly<
  Record<
    string,
    Readonly<{
      kind: 'input'
      get: (state: State) => Opt.Option<any>
      set: (state: State, value: never) => State
    }>
  >
>

/** No children, or no inputs: what a parent that declares none has. */
type None = Readonly<Record<never, never>>

/** What is written into an input, as its program receives it: `{ _tag: <input>, message }`, as a child's message. */
type InputMessages<I> = {
  [K in keyof I & string]: I[K] extends Readonly<{ get: (state: any) => Opt.Option<infer A> }>
    ? Readonly<{ _tag: K; message: Written<A> }>
    : never
}[keyof I & string]

// What an input is to the routing: a place with one rule, the library's.
const inputProgram: AnyProgram = {
  init: { state: undefined },
  update: written,
  makeModel: (held: unknown) => held,
}

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

/** A child's external message, as its parent receives it: what a parent's command may answer for the child. */
type ChildExternals<C> = {
  [K in keyof C & string]: Readonly<{ _tag: K; message: ExternalOf<ProgramOf<C[K]>> }> & At<C[K]>
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
 * flags when it has them), and give it one of the messages its type says a parent may send (`update`, e.g. a
 * back button), which returns the parent's step. Its other messages are its own: only its view and its effects
 * send them. A child answers what its parent tells it with its state, or with an event: one that rejects it, or is
 * not there, is a defect, since the parent decides when to send and the child's type says it takes the message.
 */
type Handles<State, C, Command, Event> = {
  readonly [K in keyof C & string]: C[K] extends EachOf<infer Id, infer P> ? Readonly<{
      update: (id: Id, message: ExternalOf<P>) => (state: State) => Step<State, Command, Event>
      init: [FlagsOf<P>] extends [never] ? (id: Id) => Start<P, Command>
        : (id: Id, flags: FlagsOf<P>) => Start<P, Command>
    }>
    : Readonly<{
      update: (message: ExternalOf<ProgramOf<C[K]>>) => (state: State) => Step<State, Command, Event>
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

/** An own message or command that takes a child's name would be routed to the child: it does not compile. */
type NoClash<Own, OwnCommand, C> =
  & ([Extract<TagOf<Own>, keyof C>] extends [never] ? unknown
    : Readonly<{ 'an own message takes the name of a child': Extract<TagOf<Own>, keyof C> }>)
  & ([Extract<TagOf<OwnCommand>, keyof C>] extends [never] ? unknown
    : Readonly<{ 'an own command takes the name of a child': Extract<TagOf<OwnCommand>, keyof C> }>)

/** An input that takes a child's name would replace the child, whose messages would then be the input's. */
type NoShared<C, I> = [keyof C & keyof I] extends [never] ? unknown
  : Readonly<{ 'an input takes the name of a child': keyof C & keyof I }>

type Config<State, C, I, Own, OwnCommand, Event, Model, R, K, Flags> =
  & OnEventOf<State, C, OwnCommand | ChildCommands<C>, Event>
  // A command's answer is an own message, or one its parent may send a child: never a write into an input, the
  // parent's or a child's, since only what is drawn writes, nor a child's own message.
  & RunCommandOf<OwnCommand, Own | ChildExternals<C>, R>
  & NoClash<Own, OwnCommand, C>
  & NoClash<Own, OwnCommand, I>
  & NoShared<C, I>
  & Readonly<{
    /**
     * The first state and commands, or, for a parent with flags, the function that makes them from its flags
     * (`(children) => (flags) => …`). A child there from the start is started with `children.<child>.init`, so
     * that its own commands are not lost.
     */
    init: (
      children: Handles<State, C, OwnCommand | ChildCommands<C>, Event>,
    ) => Init<State, OwnCommand | ChildCommands<C>, Flags>
    children?: C
    /**
     * The places of the state that the outside writes into, each a plain value: `{ Name: input(at) }`. What is
     * written reaches no `update` of the program's: the library stores it while the place holds the value it was
     * written over, and rejects it once the place holds another. Only a view writes into one: a subscription and a
     * command answer with messages of the program.
     */
    inputs?: I
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

/** A child's subscriptions under its parent's keys, `[<child>, key]` or `[<child>, id, key]`. */
type Lifted = ReadonlyArray<readonly [unknown, Subscription<unknown, unknown>]>

/**
 * The places a child's state object held, in the order of `call`, the last call that met it, each with the
 * subscriptions lifted there; `met` of them so far in that call.
 */
type Kept = { call: number; met: number; readonly places: Array<readonly [Place, Lifted]> }

type UntypedChild = Readonly<{
  kind: 'one' | 'each' | 'input'
  program: AnyProgram
  get: (state: unknown, id?: unknown) => Opt.Option<unknown>
  set: (state: unknown, idOrChild: unknown, child?: unknown) => unknown
  subscribed?: (state: unknown) => Opt.Option<unknown> | Iterable<readonly [unknown, unknown]>
}>

const compose = <
  State,
  C extends Children<State>,
  I extends Inputs<State>,
  Model,
  Own,
  OwnCommand,
  Event,
  R,
  K,
  External,
  Flags,
>(
  config: Config<State, C, I, Own, OwnCommand, Event, Model, R, K, Flags>,
): Shape<
  State,
  Model,
  Own | ChildMessages<C> | InputMessages<I>,
  OwnCommand | ChildCommands<C>,
  R | ChildServices<C>,
  Event,
  External,
  Flags
> => {
  type Message = Own | ChildMessages<C> | InputMessages<I>
  type Command = OwnCommand | ChildCommands<C>
  const programs = (config.children ?? {}) as unknown as Readonly<Record<string, UntypedChild>>
  const inputs = Record.map(
    (config.inputs ?? {}) as unknown as Readonly<Record<string, Omit<UntypedChild, 'program'>>>,
    (input): UntypedChild => ({ ...input, program: inputProgram }),
  )
  // An input is routed to as a child is: by its name, to its place.
  const children: Readonly<Record<string, UntypedChild>> = { ...programs, ...inputs }
  const names = Record.keys(programs)
  const childOf = (name: string) => children[name] as UntypedChild
  const isChildName = (tag: unknown): tag is string => typeof tag === 'string' && Record.has(children, tag)
  const field = (value: unknown, key: string): unknown => Predicate.hasProperty(value, key) ? value[key] : undefined
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
  const defectAt = (place: Place, message: string, on?: unknown) =>
    new CompositionDefect({
      message,
      child: place.name,
      ...(isEach(place.name) ? { id: place.id } : {}),
      ...(on === undefined ? {} : { on }),
    })
  // The types require an object, by which a child's model and lifted subscriptions are kept: only a cast, or a
  // caller without TypeScript, gets a primitive this far, which a `WeakMap` would refuse with a `TypeError`.
  const objectAt = (place: Place, childState: unknown): object => {
    if (Predicate.isObjectKeyword(childState)) return childState
    const kind = childState === null || childState === undefined ? String(childState) : `a ${typeof childState}`
    throw defectAt(place, `The state of "${place.name}" is ${kind}, where a program keeps its state in an object`)
  }
  const onEventAt = (place: Place, event: unknown): (state: State) => Step<State, Command, Event> => {
    const handle = onEvents[place.name]
    if (handle === undefined) {
      const on = describeByTag(event)
      throw defectAt(place, `The child "${place.name}" emitted the event ${String(on)}, which nothing handles`, on)
    }
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
        const lifted: Folded<State, Command, Event> = {
          state: result.state === childState ? state : setAt(place, state, result.state),
          commands: Arr.map(result.commands ?? [], wrapCommand(place)),
          events: [],
        }
        return Arr.reduce(result.events ?? [], lifted, (acc, event) =>
          appendStep(acc, onEventAt(place, event)(acc.state)))
      },
    })
  const startAt = (place: Place, flags: unknown) => {
    const { state, commands = [] } = startOf(childOf(place.name).program.init, flags)
    return { state, commands: Arr.map(commands, wrapCommand(place)) }
  }
  const hasFlags = (name: string) => typeof childOf(name).program.init === 'function'
  const tell = (place: Place, message: unknown) => (state: State): Step<State, Command, Event> => {
    if (Opt.isNone(getAt(place, state))) {
      const on = describeByTag(message)
      throw defectAt(place, `The external message ${String(on)} to "${place.name}", which is not in this state`, on)
    }
    const result = updateAt(place, message)(state)
    if (isRejected(result)) {
      const on = describeByTag(message)
      throw defectAt(place, `"${place.name}" rejected the external message ${String(on)}, which it takes`, on)
    }
    return result
  }
  // Built once: a child's update calls `onEvent`, which may call any child's handle.
  const handles = Record.map(programs, (child, name) =>
    child.kind === 'each'
      ? {
        update: (id: unknown, message: unknown) => tell({ name, id }, message),
        init: (id: unknown, flags: unknown) => startAt({ name, id }, flags),
      }
      : {
        update: (message: unknown) => tell({ name, id: undefined }, message),
        init: hasFlags(name)
          ? (flags: unknown) => startAt({ name, id: undefined }, flags)
          : startAt({ name, id: undefined }, undefined),
      }) as unknown as Handles<State, C, Command, Event>
  // An input keeps nothing between two writes: a step of the program leaves its value as it wrote it.
  const update: Update<State, Message, Command, Event> = (message) => (state) => {
    const place = placeOf(message)
    return isChildName(place.name)
      ? updateAt(place, field(message, 'message'))(state)
      : config.update === undefined
      ? reject
      : config.update(message as Own, handles)(state)
  }
  const subscriptionsAt = (place: Place, childState: unknown) =>
    HashMap.map(
      subscriptionsOf(
        childOf(place.name).program as Readonly<{ subscriptions?: Subscriptions<unknown, unknown, unknown, unknown> }>,
      )(childState),
      (subscription) => subscription.pipe(Channel.map(wrapMessage(place)), Channel.mapDone(wrapMessage(place))),
    )
  // `subscriptions` is pure, as `makeModel` is: a child's, lifted under its place, are kept by its state object, for
  // every run of this parent, at the places that object held in the last call that met it, in their order. So
  // children that share a state, as those a step's `init` starts do, keep theirs, and the ids of a long list never
  // pile up under a state that lives as long as the program: the next call that meets the object lets go of the
  // places it no longer holds. A place met out of that order is lifted again.
  const lifted = new WeakMap<object, Kept>()
  let calls = 0
  const liftedAt = (call: number, place: Place, childState: unknown): Lifted => {
    const state = objectAt(place, childState)
    let kept = lifted.get(state)
    if (kept === undefined) {
      kept = { call, met: 0, places: [] }
      lifted.set(state, kept)
    } else if (kept.call !== call) {
      kept.places.length = kept.met
      kept.met = 0
      kept.call = call
    }
    const at = kept.places[kept.met]
    if (at !== undefined && at[0].name === place.name && Equal.equals(at[0].id, place.id)) {
      kept.met++
      return at[1]
    }
    const subscriptions = Arr.map(
      Arr.fromIterable(subscriptionsAt(place, childState)),
      ([key, subscription]) =>
        [isEach(place.name) ? [place.name, place.id, key] : [place.name, key], subscription] as const,
    )
    kept.places[kept.met++] = [place, subscriptions]
    return subscriptions
  }
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
    const childState = objectAt(
      place,
      Opt.getOrThrowWith(
        getAt(place, parentState),
        () => defectAt(place, `The model of "${place.name}", which is not in this state`),
      ),
    )
    const kept = modelsOf(program)
    if (kept.has(childState)) return kept.get(childState)
    const model = program.makeModel(childState)
    kept.set(childState, model)
    return model
  }
  const childModels = Record.map(programs, (child, name) =>
    child.kind === 'each'
      ? (parentState: State, id: unknown) => modelAt({ name, id }, parentState)
      : (parentState: State) => modelAt({ name, id: undefined }, parentState)) as Models<State, C>
  const ownRunCommand = (
    config as Readonly<{ runCommand?: (command: OwnCommand) => Execution<Own | ChildExternals<C>, R> }>
  ).runCommand
  const program = {
    init: config.init(handles),
    update,
    runCommand: (command: Command): Execution<Message, unknown> => {
      const place = placeOf(command)
      if (isChildName(place.name)) {
        const childCommand = field(command, 'command')
        // Unreachable through the types: `child` and `each` ask for a `runCommand` whenever the child has commands.
        const run = (childOf(place.name).program as Readonly<{ runCommand?: RunCommand<unknown, unknown, unknown> }>)
          .runCommand
        if (run === undefined) {
          const on = describeByTag(childCommand)
          throw defectAt(place, `The command ${String(on)} of "${place.name}", which has no runCommand`, on)
        }
        return Effect.map(run(childCommand), Opt.map(wrapMessage(place)))
      }
      // Unreachable through the types: `runCommand` is required whenever the parent has commands of its own.
      if (ownRunCommand === undefined) throw new Error('compose: a command of its own, and no runCommand')
      return ownRunCommand(command as OwnCommand)
    },
    // A child's keys are under its name and id, so two children never clash: only an own key shaped like one
    // of theirs could, and would silently take the child's place. Built in place: a list of a thousand children
    // makes a thousand keys on every change of state.
    // Two children's keys clash only when `subscribed` lists one id twice.
    subscriptions: (state: State) => {
      const own = HashMap.map(
        config.subscriptions?.(state) ?? HashMap.empty<K, Subscription<Own, R>>(),
        (subscription) => subscription as Subscription<Message, unknown>,
      ) as HashMap.HashMap<unknown, Subscription<Message, unknown>>
      const call = ++calls
      return HashMap.mutate(
        own,
        (keyed) => {
          for (const name of names) {
            for (const [place, childState] of listening(name, state)) {
              for (const [key, subscription] of liftedAt(call, place, childState)) {
                if (HashMap.has(own, key)) {
                  throw defectAt(place, `An own subscription key is the key of a subscription of "${name}"`)
                }
                if (HashMap.has(keyed, key)) {
                  throw defectAt(place, `The subscribed children of "${name}" list the same id twice`)
                }
                HashMap.set(keyed, key, subscription as Subscription<Message, unknown>)
              }
            }
          }
        },
      )
    },
    makeModel: (state: State): Model => config.makeModel(state, childModels),
  }
  return program as unknown as Shape<State, Model, Message, Command, R | ChildServices<C>, Event, External, Flags>
}

/**
 * What a composed program declares of itself, by name: its state, and its own commands, events, external messages
 * and flags.
 */
export type CompositionTypes = Readonly<{
  state: object
  command?: unknown
  event?: unknown
  external?: unknown
  flags?: unknown
}>

/**
 * The way to make a program of children, inputs or both: its types fixed once, by name
 * (`composition<{ state: State; event: Event }>()`), then its children declared with `child` (one) or `each` (by
 * id), its inputs with `input`, and the program made with `compose`. Its messages are its own,
 * `{ _tag: <child>, message }` for each child (with `id` for children by id), and
 * `{ _tag: <input>, message: write(was, value) }` for each input; its commands are its own and its children's,
 * each run by its child's `runCommand`, which a child with commands must have. Fixing the types first is what lets
 * `get`, `set` and the rest be typed without annotations, and the program's own commands, events, external messages
 * and flags, which nothing it returns can reveal, be known.
 */
export const composition = <T extends CompositionTypes>() => {
  type State = Field<T, 'state'>
  type OwnCommand = Field<T, 'command'>
  type Event = Field<T, 'event'>
  return {
    child: <P extends AnyProgram>(
      program: P & Interpreter<CommandOf<P>, unknown, unknown> & ExternalAmong<MessageOf<P>, ExternalOf<P>>,
      place:
        & Placement<State, StateOf<P>>
        & Readonly<{ subscribed?: (state: State) => Opt.Option<StateOf<P>> }>
        & ObjectState<StateOf<P>>,
    ): Child<State, P> => ({
      kind: 'one',
      program,
      ...placed(place),
      ...(place.subscribed === undefined ? {} : { subscribed: place.subscribed }),
    }),
    each: <Id, P extends AnyProgram>(
      program: P & Interpreter<CommandOf<P>, unknown, unknown> & ExternalAmong<MessageOf<P>, ExternalOf<P>>,
      place:
        & EachPlacement<State, Id, StateOf<P>>
        & Readonly<{ subscribed: (state: State) => Iterable<readonly [Id, StateOf<P>]> }>
        & ObjectState<StateOf<P>>,
    ): Each<State, Id, P> => ({ kind: 'each', program, ...placedEach(place), subscribed: place.subscribed }),
    /**
     * An input, a place of the state that the outside writes into: `inputs: { Name: input(at) }`, where `at`
     * focuses a plain value. The view writes over the value its model holds, `write(model.name, text)`, through
     * `dispatchTo(dispatch, 'Name')`, which a bridge makes with `typed`.
     */
    input: <A>(at: Optic.Optional<State, A>): InputAt<State, A> => ({ kind: 'input', ...placed({ at }) }),
    // Its external messages are checked where it is a child (`child`, `each`): here its own messages are still being
    // inferred from `update`, and a check of them would fix them as `never` first.
    compose: <
      Model,
      C extends Children<State> = None,
      I extends Inputs<State> = None,
      Own = never,
      R = never,
      K = unknown,
    >(
      // The children and the inputs are inferred from where they are declared alone: a command a step returns would
      // otherwise be read as a child's, where no child is declared.
      config:
        & Config<State, NoInfer<C>, NoInfer<I>, Own, OwnCommand, Event, Model, R, K, Field<T, 'flags'>>
        & Readonly<{ children?: C; inputs?: I }>,
    ) =>
      compose<State, C, I, Model, Own, OwnCommand, Event, R, K, Field<T, 'external'>, Field<T, 'flags'>>(config),
  }
}
