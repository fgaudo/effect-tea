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
import { appendStep, type Folded, reject, type Step, type Transition, type Update } from './update.ts'

/**
 * Where a child lives in its parent's state: an optic, `at`, or the two functions an optic is, `get` and `set`.
 *
 * @example
 * ```ts
 * { at: Optic.id<State>().key('maybeAbout').compose(Optic.some()) }
 * ```
 */
type Placement<ParentState, ChildState> =
  | Readonly<{
    /** The child's state, or `None` where the child is not there: what `set` put, read from the state alone. */
    get: (state: ParentState) => Opt.Option<ChildState>
    /** The parent's state with the child's state put where `get` finds it. */
    set: (state: ParentState, child: ChildState) => ParentState
    at?: never
  }>
  | Readonly<{
    /** An optic into the parent's state, to the child's. */
    at: Optic.Optional<ParentState, ChildState>
    get?: never
    set?: never
  }>

/**
 * Where a child by id lives in its parent's state: an optic that is a function of the id, `at`, or `get` and `set`,
 * which take the id.
 */
type EachPlacement<ParentState, Id, ChildState> =
  | Readonly<{
    /** The state of the child at `id`, or `None` where it is not there. */
    get: (state: ParentState, id: Id) => Opt.Option<ChildState>
    /** The parent's state with the state of the child at `id` put where `get` finds it. */
    set: (state: ParentState, id: Id, child: ChildState) => ParentState
    at?: never
  }>
  | Readonly<{
    /** The optic into the parent's state, to the state of the child at `id`. */
    at: (id: Id) => Optic.Optional<ParentState, ChildState>
    get?: never
    set?: never
  }>

/** A child alone in its parent's state, as `child` declares it, for `children` in `compose`. */
type Child<ParentState, P> = Readonly<{
  kind: 'one'
  program: P
  get: (state: ParentState) => Opt.Option<StateOf<P>>
  set: (state: ParentState, child: StateOf<P>) => ParentState
  subscribed?: (state: ParentState) => Opt.Option<StateOf<P>>
}>

/** Children told apart by an id (e.g. the rows of a list), as `each` declares them, for `children` in `compose`. */
type Each<ParentState, Id, P> = Readonly<{
  kind: 'each'
  program: P
  get: (state: ParentState, id: Id) => Opt.Option<StateOf<P>>
  set: (state: ParentState, id: Id, child: StateOf<P>) => ParentState
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

/** An input, as `input` declares it, for `inputs` in `compose`. */
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

/** A new child: the state its parent puts where the child lives, and the commands it starts with, lifted. */
type Start<P, Command> = Readonly<{
  /** The child's first state. */
  state: StateOf<P>
  /** The child's first commands, as its parent's. */
  commands: ReadonlyArray<Command>
}>

/**
 * What a parent does with its children, by name: `children` in `init`, `update` and `onEvent`.
 *
 * For each child, `init` starts it, from its flags when it has them, and `update` sends it an external message. For
 * children by id, both take the id first.
 *
 * @example
 * ```ts
 * update: (_: BackPressed, children) => children.Page.update({ _tag: 'BackPressed' }),
 * ```
 *
 * @remarks
 * From the guide, "Composition", "How it starts":
 *
 * **How it starts.** A parent's `init` is a function of `children`, so that a child there from the start is started
 * like any other. `children.Clock.init` holds the child's state and its commands, lifted. Reading
 * `Clock.clock.init.state` instead would leave its commands behind.
 *
 * From the guide, "Composition", "A child with `flags`":
 *
 * **A child with `flags`** is started from them: `children.About.init({ openedAt })`, and `init(id, flags)` for
 * children by id.
 *
 * From the guide, "Composition", "A parent sends an external message":
 *
 * **A parent sends an external message** to a child with `children.<child>.update`, in its own `update` and `onEvent`.
 * It is one of the messages the child's type declares as `external` (e.g. a back button). The parent decides when to
 * send, and the child's type says it takes the message.
 *
 * From the guide, "Composition", "The child answers in every state":
 *
 * **The child answers in every state**, with its state or with an event, never with `reject`.
 *
 * From the guide, "Composition", "A rejection of an external message is a defect":
 *
 * **A rejection of an external message is a defect**: a `CompositionDefect`, naming the child, and the message by its
 * tags. So is sending an external message to a child that is not there.
 *
 * From the guide, "Composition", "A child's view gets a dispatch of its own":
 *
 * **A child's view gets a dispatch of its own.** It sends the child's own messages: `dispatchTo(dispatch, 'Clock')`
 * wraps them as the parent receives them.
 */
type Handles<State, C, Command, Event> = {
  readonly [K in keyof C & string]: C[K] extends EachOf<infer Id, infer P> ? Readonly<{
      /** Sends the child at `id` an external message: the parent's step, as a function of its state. */
      update: (id: Id, message: ExternalOf<P>) => (state: State) => Step<State, Command, Event>
      /** Starts the child at `id`, from its flags when it has them. */
      init: [FlagsOf<P>] extends [never] ? (id: Id) => Start<P, Command>
        : (id: Id, flags: FlagsOf<P>) => Start<P, Command>
    }>
    : Readonly<{
      /** Sends the child an external message: the parent's step, as a function of its state. */
      update: (message: ExternalOf<ProgramOf<C[K]>>) => (state: State) => Step<State, Command, Event>
      /** Starts the child, from its flags when it has them. */
      init: [FlagsOf<ProgramOf<C[K]>>] extends [never] ? Start<ProgramOf<C[K]>, Command>
        : (flags: FlagsOf<ProgramOf<C[K]>>) => Start<ProgramOf<C[K]>, Command>
    }>
}

/**
 * The children's models, by name: `children` in `makeModel`. Each is a function of the parent's state, and of the id
 * for children by id.
 *
 * @example
 * ```ts
 * makeModel: (state, children) => ({ clock: children.Clock(state) }),
 * ```
 *
 * @remarks
 * From the guide, "Composition", "A child's model is kept":
 *
 * **A child's model is kept.** `children.About(state)` in `makeModel` is the child's model. It is the same object while
 * the child's state is the same object. So a renderer can skip redrawing it (see `thunk` in `pages`). A number or a
 * string has no identity to keep a model by: this is why a program's state is always an object.
 *
 * From the guide, "Composition", "What is a defect":
 *
 * **What is a defect** (a `CompositionDefect`):
 * - a child with commands and no `runCommand` that gets there through a cast, when its command runs;
 * - a child with events and no handler in `onEvent` that gets there through a cast, when it raises one;
 * - a child whose state is not an object, which only a cast gets there, as its model or its subscriptions are made;
 * - an own subscription key that is the key of a child's subscription;
 * - a `subscribed` that lists one id twice;
 * - asking for the model of a child that is not there.
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
  ? Readonly<{
    /**
     * What the parent does with each child's events, by child: one handler for each child that has events.
     *
     * @remarks
     * From the guide, "Composition", "`onEvent`":
     *
     * **`onEvent`** is required exactly when a child has events.
     */
    onEvent?: OnEvents<State, C, Command, Event>
  }>
  : Readonly<{
    /**
     * What the parent does with each child's events, by child: one handler for each child that has events.
     *
     * @remarks
     * From the guide, "Composition", "`onEvent`":
     *
     * **`onEvent`** is required exactly when a child has events.
     */
    onEvent: OnEvents<State, C, Command, Event>
  }>

/** `runCommand` is required exactly when the parent has commands of its own, so that none goes uninterpreted. */
type RunCommandOf<OwnCommand, Message, R> = [OwnCommand] extends [never] ? Readonly<{ runCommand?: never }>
  : Readonly<{
    /**
     * Runs one of the parent's own commands.
     *
     * @remarks
     * From the guide, "Composition", "`runCommand`":
     *
     * **`runCommand`** is required exactly when the parent has commands of its own.
     */
    runCommand: (command: OwnCommand) => Execution<Message, R>
  }>

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
     * The parent's first state and commands, made with its children: a step, or, for a parent with flags, the
     * function that makes one from them (`(children) => (flags) => …`).
     *
     * @remarks
     * From the guide, "Composition", "How it starts":
     *
     * **How it starts.** A parent's `init` is a function of `children`, so that a child there from the start is started
     * like any other. `children.Clock.init` holds the child's state and its commands, lifted. Reading
     * `Clock.clock.init.state` instead would leave its commands behind.
     *
     * From the guide, "Composition", "The parent's own flags,":
     *
     * **The parent's own flags,** if it has any, are declared with its other types: `composition<{ state: State; flags:
     * Flags }>()`. Its `init` then returns the function that starts it: `init: (children) => (flags) => ({ state,
     * commands })`.
     */
    init: (
      children: Handles<State, C, OwnCommand | ChildCommands<C>, Event>,
    ) => Init<State, OwnCommand | ChildCommands<C>, Flags>
    /** The children, by name: `{ Clock: child(…), Row: each(…) }`. */
    children?: C
    /**
     * The inputs, by name: `{ Name: input(at) }`.
     *
     * @remarks
     * From the guide, "Composition", "Its inputs' rule":
     *
     * **Its inputs' rule.** A write is stored while the input's place holds, by `Equal`, the value it was written over.
     * It is rejected otherwise. Every other step leaves an input as that step wrote it.
     *
     * From the guide, "Inputs the user types into", "What the user gives an input is no message of the program":
     *
     * **What the user gives an input is no message of the program.** No `update` of the program's sees it.
     *
     * From the guide, "Inputs the user types into", "Only what is drawn writes into an input":
     *
     * **Only what is drawn writes into an input.** A subscription and a command answer with messages of the program.
     * The program's `update` puts the value in the input's place, or keeps it in the state until it chooses to.
     */
    inputs?: I
    /** What the parent's own messages do, given its children. */
    update?: (
      message: Own,
      children: Handles<State, C, OwnCommand | ChildCommands<C>, Event>,
    ) => (state: State) => Transition<State, OwnCommand | ChildCommands<C>, Event>
    /** The parent's own subscriptions. */
    subscriptions?: Subscriptions<State, Own, R, K>
    /** What the parent draws, from its state and its children's models. */
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

// The own enumerable string keys of a record alone, in the order of `Object.keys`, as the spread and `Object.hasOwn`
// of `compose` read them: `Record.map` and `Record.keys` do not say which keys they visit.
const mapOwn = <A, B>(record: Readonly<Record<string, A>>, f: (value: A, name: string) => B): Record<string, B> =>
  Object.fromEntries(Object.entries(record).map(([name, value]) => [name, f(value, name)]))

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
  const inputs = mapOwn(
    (config.inputs ?? {}) as unknown as Readonly<Record<string, Omit<UntypedChild, 'program'>>>,
    (input): UntypedChild => ({ ...input, program: inputProgram }),
  )
  // An input is routed to as a child is: by its name, to its place.
  const children: Readonly<Record<string, UntypedChild>> = { ...programs, ...inputs }
  const names = Object.keys(programs)
  const childOf = (name: string) => children[name] as UntypedChild
  // `Object.hasOwn`, not `Record.has`, which does not say whether a key `children` inherits (`toString`) counts.
  const isChildName = (tag: unknown): tag is string => typeof tag === 'string' && Object.hasOwn(children, tag)
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
        if (result === reject) return reject
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
    if (result === reject) {
      const on = describeByTag(message)
      throw defectAt(place, `"${place.name}" rejected the external message ${String(on)}, which it takes`, on)
    }
    return result
  }
  // Built once: a child's update calls `onEvent`, which may call any child's handle.
  const handles = mapOwn(programs, (child, name) =>
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
  const childModels = mapOwn(programs, (child, name) =>
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
        // Read as it is, not through `runCommandOf`, whose stand-in, `absurd`, would die of an error of its own: a child that
        // has none is a `CompositionDefect` that names it.
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
  /** Its state, an object. */
  state: object
  /** Its own commands, if it has any. */
  command?: unknown
  /** The events it raises, if it raises any. */
  event?: unknown
  /** Which of its messages a parent of its own may send it, if any. */
  external?: unknown
  /** What it starts from, if it has flags. */
  flags?: unknown
}>

/**
 * The way to make a program of children, inputs or both: its types fixed once, by name, then the functions that
 * declare and make it.
 *
 * Fixing the types first lets `get`, `set` and the rest be typed without annotations. It also says the program's own
 * commands, events, external messages and flags, which nothing given to `compose` reveals.
 *
 * @returns `child` and `each`, which declare a child alone and children by id, `input`, which declares an input, and
 * `compose`, which makes the program.
 *
 * @example
 * ```ts
 * const { child, compose } = composition<{ state: State }>()
 *
 * const app = compose({
 *   init: (children) => ({ state: { clock: children.Clock.init.state }, commands: children.Clock.init.commands }),
 *   children: { Clock: child(clock, { at: Optic.id<State>().key('clock') }) },
 *   makeModel: (state, children) => ({ clock: children.Clock(state) }),
 * })
 * ```
 *
 * @remarks
 * From the guide, "Composition", "In short":
 *
 * A child is any program. A parent declares its children, and its inputs, with `composition`, and says where each child
 * lives in its state. The library does the routing. A parent and its children talk only through events and external
 * messages.
 *
 * From the guide, "Composition", "The parent's messages":
 *
 * **The parent's messages** are its own, plus `{ _tag: <child>, message }` for each child (`{ _tag: <child>, id,
 * message }` for children by id), and `{ _tag: <input>, message: { _tag: 'Written', was, value } }` for each input.
 *
 * From the guide, "Composition", "The parent's commands":
 *
 * **The parent's commands** are its own, plus each child's, wrapped likewise and run by the child's `runCommand`.
 *
 * From the guide, "Composition", "The parent's subscriptions":
 *
 * **The parent's subscriptions** are its own, plus each child's under `[<child>, key]` (`[<child>, id, key]` for
 * children by id).
 *
 * From the guide, "Composition", "What does not compile:":
 *
 * **What does not compile:**
 * - an own message that takes a child's or an input's name;
 * - an input that takes a child's name;
 * - an own subscription that writes into an input;
 * - a command's answer that writes into an input, the parent's or a child's, and one that gives a child its own
 *   business;
 * - a child with commands and no `runCommand`, which a program written without `Program<…>` can be.
 *
 * From the guide, "Composition", "What is a defect":
 *
 * **What is a defect** (a `CompositionDefect`):
 * - a child with commands and no `runCommand` that gets there through a cast, when its command runs;
 * - a child with events and no handler in `onEvent` that gets there through a cast, when it raises one;
 * - a child whose state is not an object, which only a cast gets there, as its model or its subscriptions are made;
 * - an own subscription key that is the key of a child's subscription;
 * - a `subscribed` that lists one id twice;
 * - asking for the model of a child that is not there.
 */
export const composition = <T extends CompositionTypes>() => {
  type State = Field<T, 'state'>
  type OwnCommand = Field<T, 'command'>
  type Event = Field<T, 'event'>
  return {
    /**
     * Declares a child alone in its parent's state.
     *
     * @param program - The child.
     * @param place - Where it lives, and `subscribed`, a function of the parent's state that gives the child's state
     * where its subscriptions run, and `None` elsewhere.
     * @returns The child, for `children` in `compose`.
     *
     * @example
     * ```ts
     * About: child(about, { at: Optic.id<State>().key('maybeAbout').compose(Optic.some()) }),
     * ```
     *
     * @remarks
     * From the guide, "Composition", "Where the child lives: `at`":
     *
     * **Where the child lives: `at`.** It is an optic into the parent's state, Effect's `Optic`:
     * `Optic.id<State>().key('clock')`. For a child that may not be there, add `.compose(Optic.some())`. In place of an
     * optic, give the two functions an optic is, `get` and `set`.
     *
     * From the guide, "Composition", "When the child is not there":
     *
     * **When the child is not there.** Where the optic focuses nothing, or `get` returns `None`, the child is not
     * there.
     *
     * From the guide, "Composition", "When its subscriptions run: `subscribed`":
     *
     * **When its subscriptions run: `subscribed`.** By default, they run whenever the child is there.
     */
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
    /**
     * Declares children told apart by an id, such as the rows of a list, each with a state of its own.
     *
     * @param program - The program of each child.
     * @param place - Where the child at an id lives, and `subscribed`, a function of the parent's state that lists the
     * ids whose subscriptions run, each with its child's state.
     * @returns The children, for `children` in `compose`.
     *
     * @example
     * ```ts
     * Row: each(row, {
     *   get: (state, id: number) => Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.counter),
     *   set: (state, id, counter) => ({ rows: state.rows.map((row) => (row.id === id ? { id, counter } : row)) }),
     *   subscribed: (state) => state.rows.map((row) => [row.id, row.counter] as const),
     * }),
     * ```
     *
     * @remarks
     * From the guide, "Composition", "`get` and `set` take the id":
     *
     * **`get` and `set` take the id** (or `at` is a function of it).
     *
     * From the guide, "Composition", "`subscribed` lists the rows that listen":
     *
     * **`subscribed` lists the rows that listen.**
     *
     * From the guide, "Composition", "`children.Row(state, id)` is a row's model":
     *
     * **`children.Row(state, id)` is a row's model**, and `dispatchTo(dispatch, 'Row', id)` its dispatch.
     *
     * From the guide, "Composition", "Ids are compared by value,":
     *
     * **Ids are compared by value,** with `Equal`, wherever they go (subscription keys, dispatches): strings, numbers,
     * or tuples and structs of them.
     */
    each: <Id, P extends AnyProgram>(
      program: P & Interpreter<CommandOf<P>, unknown, unknown> & ExternalAmong<MessageOf<P>, ExternalOf<P>>,
      place:
        & EachPlacement<State, Id, StateOf<P>>
        & Readonly<{ subscribed: (state: State) => Iterable<readonly [Id, StateOf<P>]> }>
        & ObjectState<StateOf<P>>,
    ): Each<State, Id, P> => ({ kind: 'each', program, ...placedEach(place), subscribed: place.subscribed }),
    /**
     * Declares an input: a place of the program's state that the outside writes into.
     *
     * @param at - An optic into the program's state, to a plain value.
     * @returns The input, for `inputs` in `compose`.
     *
     * @example
     * ```ts
     * inputs: { Name: input(Optic.id<State>().key('name')) },
     * ```
     *
     * @remarks
     * From the guide, "Composition", "Its inputs,":
     *
     * **Its inputs,** if it has any: `inputs: { Name: input(at) }`, where `at` is an optic to a value of its own state
     * (see "Inputs the user types into"). An input is no child: its value is the parent's own state. Its `update` and
     * `makeModel` read it as the rest. A program with inputs and no children is made with `composition` too, and leaves
     * `children` out.
     *
     * From the guide, "Inputs the user types into", "The view writes over the value its model holds":
     *
     * **The view writes over the value its model holds**: `{ _tag: 'Written', was: model.name, value: text }`, through
     * `dispatchTo(dispatch, 'Name')`.
     */
    input: <A>(at: Optic.Optional<State, A>): InputAt<State, A> => ({ kind: 'input', ...placed({ at }) }),
    // Its external messages are checked where it is a child (`child`, `each`): here its own messages are still being
    // inferred from `update`, and a check of them would fix them as `never` first.
    /**
     * Makes the program from what the parent declares.
     *
     * @param config - Its `init` and `makeModel`, its `children` and its `inputs`, and its own `update`,
     * `subscriptions`, `runCommand` and `onEvent`, where it has them.
     * @returns The program, which runs alone or as a child of another.
     *
     * @example
     * ```ts
     * const form = compose({
     *   init: () => ({ state: { name: '' } }),
     *   inputs: { Name: input(Optic.id<State>().key('name')) },
     *   makeModel: (state) => ({ name: state.name }),
     * })
     * ```
     *
     * @remarks
     * From the guide, "Composition", "Its own messages, commands and subscriptions,":
     *
     * **Its own messages, commands and subscriptions,** if it has any: `update`, `runCommand` and `subscriptions`. Its
     * `update` takes `children` too. It may reject its own messages, as any `update` does.
     */
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
