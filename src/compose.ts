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
  type CommandServicesOf,
  type EventOf,
  type ExternalOf,
  type Field,
  type FlagsOf,
  type Init,
  type Interpreter,
  type MessageOf,
  type ModelOf,
  type ObjectState,
  type Program,
  type Shape,
  startOf,
  type StateOf,
  subscriptionsOf,
  type SubscriptionServicesOf,
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
type PlacementById<ParentState, Id, ChildState> =
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

// A child's external messages are among its messages: one that is not would reach an `update` that does not take it.
// Its own key, not that of `ExternalAmong`: `make` does not check them, so a program it makes with a wrong `external`
// carries the marker of `Program`, which would satisfy a check asking for the same one.
type ExternalTaken<P> = [Exclude<ExternalOf<P>, MessageOf<P>>] extends [never] ? unknown
  : Readonly<{ "a child's external messages are not among its messages": Exclude<ExternalOf<P>, MessageOf<P>> }>

// A child that runs commands has a `runCommand`; `Interpreter` is `object` for one that runs none, and `unknown` is
// needed here instead: see `CheckedChild`.
type CommandsRun<P> = [CommandOf<P>] extends [never] ? unknown : Interpreter<CommandOf<P>, unknown, unknown>

// The child's program, with what it lacks for the checks above. Inferred from `P & …`, `P` would be the program less
// the members TypeScript matches with the checks, which loses the name `Program<…>` in a consumer's declarations:
// inferred from `P` alone, it keeps it, and the intersection is written only where a check fails. Without it, the
// declarations of the smoke test's consumer spell out four programs, not one.
type CheckedChild<P> = unknown extends CommandsRun<P> & ExternalTaken<P> ? P : P & CommandsRun<P> & ExternalTaken<P>

/**
 * A child alone in its parent's state: what `child` returns, for `children` in `make`.
 *
 * - Where `get` returns `None`, the child is not there, and a message for it is rejected.
 * - Its subscriptions run where `subscribed` returns `Some`. Without `subscribed`, they run whenever the child is there.
 *
 * @example
 * ```ts
 * export const clock: Child<State, typeof Clock.clock> = child(Clock.clock, { at: Optic.id<State>().key('clock') })
 * ```
 *
 * @see The guide, "Composition", "Where the child lives: `at`".
 * @see The guide, "Composition", "When the child is not there".
 * @see The guide, "Composition", "When a child's subscriptions run: `subscribed`".
 */
export type Child<ParentState, P> = {
  /** A child alone, not one of children by id. */
  readonly kind: 'one'
  /** The child's program. */
  readonly program: P
  /** The child's state in the parent's state, or `None` where the child is not there. */
  readonly get: (state: ParentState) => Opt.Option<StateOf<P>>
  /** The parent's state with the child's state put where `get` finds it. */
  readonly set: (state: ParentState, child: StateOf<P>) => ParentState
  /** The child's state in the states where its subscriptions run, and `None` in the others. */
  readonly subscribed?: (state: ParentState) => Opt.Option<StateOf<P>>
}

/**
 * Children told apart by an id, such as the rows of a list: what `childById` returns, for `children` in `make`.
 *
 * - `get` and `set` take the id. Where `get` returns `None`, no child has that id.
 * - Only the rows that `subscribed` lists run their subscriptions.
 * - Ids are compared by value, with `Equal`.
 *
 * @example
 * ```ts
 * export const rows: ChildById<State, number, typeof Row.row> = childById(Row.row, { get, set, subscribed })
 * ```
 *
 * @see The guide, "Composition", "`get` and `set` take the id".
 * @see The guide, "Composition", "`subscribed` lists the rows that listen".
 * @see The guide, "Composition", "Ids are compared by value".
 */
export type ChildById<ParentState, Id, P> = {
  /** Children by id, not a child alone. */
  readonly kind: 'byId'
  /** The program of each child. */
  readonly program: P
  /** The state of the child at `id`, or `None` where it is not there. */
  readonly get: (state: ParentState, id: Id) => Opt.Option<StateOf<P>>
  /** The parent's state with the state of the child at `id` put where `get` finds it. */
  readonly set: (state: ParentState, id: Id, child: StateOf<P>) => ParentState
  /** The ids and the states of the children whose subscriptions run. */
  readonly subscribed: (state: ParentState) => Iterable<readonly [Id, StateOf<P>]>
}

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

const placedById = <S, Id, A>(
  place: PlacementById<S, Id, A>,
): Readonly<{ get: (state: S, id: Id) => Opt.Option<A>; set: (state: S, id: Id, child: A) => S }> =>
  place.at === undefined
    ? { get: place.get, set: place.set }
    : {
      get: (state, id) => Result.getSuccess(place.at(id).getResult(state)),
      set: (state, id, child) => place.at(id).replace(child, state),
    }

/**
 * An input alone in its program's state: what `input` returns, for `inputs` in `make`.
 *
 * - Its value is part of the program's own state.
 * - The library stores a write in every state where the value in its place equals the write's `was`, by `Equal`.
 * - It rejects the write in any other state, and where `get` returns `None`.
 *
 * @example
 * ```ts
 * export const name: Input<State, string> = input({ at: Optic.id<State>().key('name') })
 * ```
 *
 * @see The guide, "Composition", "The parent's inputs".
 * @see The guide, "Inputs the user types into", "The program declares where it goes".
 * @see The guide, "Inputs the user types into", "The library stores what is written, whatever it is".
 * @see The guide, "Inputs the user types into", "The library rejects the write in any other state".
 */
export type Input<State, A> = {
  /** An input alone, not one of inputs by id. */
  readonly kind: 'one'
  /** The input's value in the state, or `None` where the input is not there. */
  readonly get: (state: State) => Opt.Option<A>
  /** The state with the input's value put where `get` finds it. */
  readonly set: (state: State, value: A) => State
}

/**
 * Inputs told apart by an id, such as one in each row: what `inputById` returns, for `inputs` in `make`.
 *
 * `get` and `set` take the id. A write names its id, and is stored at the place of that id, by the rule of every input.
 *
 * @example
 * ```ts
 * export const counts: InputById<State, string, number> = inputById({ get, set })
 * ```
 *
 * @see The guide, "Inputs the user types into", "A write into an input by id names its id".
 * @see The guide, "Inputs the user types into", "A write is stored at the place of its id".
 */
export type InputById<State, Id, A> = {
  /** Inputs by id, not an input alone. */
  readonly kind: 'byId'
  /** The value of the input at `id`, or `None` where it is not there. */
  readonly get: (state: State, id: Id) => Opt.Option<A>
  /** The state with the value of the input at `id` put where `get` finds it. */
  readonly set: (state: State, id: Id, value: A) => State
}

// `never` parameters: any `set` fits, whatever its value and id.
/** The inputs a parent declares, by name: `{ Name: input({ at }), Count: inputById({ at }) }`. */
type Inputs<State> = Readonly<
  Record<
    string,
    | Readonly<{ kind: 'one'; get: (state: State) => Opt.Option<any>; set: (state: State, value: never) => State }>
    | Readonly<{
      kind: 'byId'
      get: (state: State, id: never) => Opt.Option<any>
      set: (state: State, id: never, value: never) => State
    }>
  >
>

/** No children, or no inputs: what a parent that declares none has. */
type None = Readonly<Record<never, never>>

/**
 * What is written into an input, as its program receives it: `{ _tag: <input>, message }`, and its `id` for inputs by
 * id, as a child's message.
 */
type InputMessages<I> = {
  [K in keyof I & string]: I[K] extends
    Readonly<{ kind: 'byId'; get: (state: any, id: infer Id) => Opt.Option<infer A> }>
    ? Readonly<{ _tag: K; id: Id; message: Written<A> }>
    : I[K] extends Readonly<{ get: (state: any) => Opt.Option<infer A> }> ? Readonly<{ _tag: K; message: Written<A> }>
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
      kind: 'byId'
      program: AnyProgram
      get: (state: State, id: never) => Opt.Option<unknown>
      set: (state: State, id: never, child: never) => State
    }>
  >
>

type ProgramOf<C> = C extends { readonly program: infer P } ? P : never

// Told by `kind` and the id `get` takes: `ChildById<any, …>` would not match, its `set` taking `unknown` children.
type ChildByIdOf<Id, P> = Readonly<{ kind: 'byId'; program: P; get: (state: any, id: Id) => any }>

/** Where a child's messages and commands carry its id: only for children by id. */
type At<C> = C extends ChildByIdOf<infer Id, any> ? Readonly<{ id: Id }> : unknown

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

// The services of a parent's own `runCommand` and `subscriptions`, read from all that each returns, `Ran` and `Heard`:
// one parameter for the services, inferred from the branches of a `runCommand` or from the subscriptions of a map,
// would be one of the candidates and not their union.
type RanServices<Ran> = Ran extends Execution<any, infer R> ? R : never
type HeardServices<Heard> = Heard extends HashMap.HashMap<any, infer Listened> ? Needed<Listened> : never

// Apart, so that it distributes over what a map holds: an empty map holds `never`, which needs nothing. What a map of
// type `any` holds reads back as `unknown`, and needs anything: as `never`, it would run without its services.
type Needed<Listened> = unknown extends Listened ? unknown : Listened extends Subscription<any, infer R> ? R : never

// A child's commands and subscriptions are lifted into its parent's, with what they need.
type ChildCommandServices<C> = { [K in keyof C]: CommandServicesOf<ProgramOf<C[K]>> }[keyof C]
type ChildSubscriptionServices<C> = { [K in keyof C]: SubscriptionServicesOf<ProgramOf<C[K]>> }[keyof C]

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
 * - `init` gives the child's state and its commands, lifted. Use both: the child's own `init.state` leaves its commands
 *   behind.
 * - `update` takes only a message that the child's type declares as `external`. The child answers in every state, with
 *   its state or with an event.
 * - A rejection of an external message is a defect, a `CompositionDefect`. So is an external message to a child that
 *   is not there.
 * - A child's view sends the child's own messages through its own dispatch, `forwardTo(dispatch, 'Clock')`.
 *
 * @example
 * ```ts
 * update: (_: BackPressed, children) => children.Page.update({ _tag: 'BackPressed' }),
 * ```
 *
 * @see The guide, "Composition", "How a child starts".
 * @see The guide, "Composition", "A child with `flags`".
 * @see The guide, "Events and external messages", "A parent sends an external message".
 * @see The guide, "Events and external messages", "The child answers in every state".
 * @see The guide, "Events and external messages", "A rejection of an external message is a defect".
 * @see The guide, "Composition", "A child's view gets a dispatch of its own".
 */
type Handles<State, C, Command, Event> = {
  readonly [K in keyof C & string]: C[K] extends ChildByIdOf<infer Id, infer P> ? Readonly<{
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
 * A child's model is the same object while the child's state is the same object. Asking for the model of a child that
 * is not there is a defect, a `CompositionDefect`.
 *
 * @example
 * ```ts
 * makeModel: (state, children) => ({ clock: children.Clock(state) }),
 * ```
 *
 * @see The guide, "Composition", "A child's model is kept".
 * @see The guide, "Composition", "What is a defect".
 */
type Models<State, C> = {
  readonly [K in keyof C & string]: C[K] extends ChildByIdOf<infer Id, infer P> ? (state: State, id: Id) => ModelOf<P>
    : (state: State) => ModelOf<ProgramOf<C[K]>>
}

type OnEvents<State, C, Command, Event> = {
  readonly [K in keyof C & string as [EventOf<ProgramOf<C[K]>>] extends [never] ? never : K]: C[K] extends
    ChildByIdOf<infer Id, infer P> ? (
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
     * It is required exactly when a child has events. A handler takes the event and `children`, and returns the
     * parent's step as a function of its state. For children by id, it takes the id first.
     *
     * @see The guide, "Events and external messages", "The parent handles an event in `onEvent`".
     * @see The guide, "Events and external messages", "`onEvent`".
     */
    onEvent?: OnEvents<State, C, Command, Event>
  }>
  : Readonly<{
    /**
     * What the parent does with each child's events, by child: one handler for each child that has events.
     *
     * It is required exactly when a child has events. A handler takes the event and `children`, and returns the
     * parent's step as a function of its state. For children by id, it takes the id first.
     *
     * @see The guide, "Events and external messages", "The parent handles an event in `onEvent`".
     * @see The guide, "Events and external messages", "`onEvent`".
     */
    onEvent: OnEvents<State, C, Command, Event>
  }>

/** `update` is required exactly when the program names messages of its own, and refused when it names none. */
type UpdateOf<State, C, Own, Command, Event> = [Own] extends [never] ? Readonly<{ update?: never }>
  : Readonly<{
    /**
     * What the program's own messages do, given its children.
     *
     * It is required exactly when the program names messages of its own, in `program`.
     *
     * @see The guide, "Anatomy of a program", "Its types are named first, then it is made".
     */
    update: (
      message: Own,
      children: Handles<State, C, Command, Event>,
    ) => (state: State) => Transition<State, Command, Event>
  }>

/** `runCommand` is required exactly when the parent has commands of its own, so that none goes uninterpreted. */
type RunCommandOf<OwnCommand, Message, Ran> = [OwnCommand] extends [never] ? Readonly<{ runCommand?: never }>
  : Readonly<{
    /**
     * Runs one of the parent's own commands.
     *
     * It is required exactly when the parent has commands of its own.
     *
     * @see The guide, "Composition", "`runCommand`".
     */
    runCommand: (command: OwnCommand) => Ran & Execution<Message, any>
  }>

type TagOf<M> = M extends { readonly _tag: infer T } ? T : never

/**
 * An own message or command that takes the name of a child or of an input, `Of`, would be routed to it: it does not
 * compile.
 */
type NoClash<Own, OwnCommand, C, Of extends string> =
  & ([Extract<TagOf<Own>, keyof C>] extends [never] ? unknown
    : { readonly [K in `an own message takes the name of ${Of}`]: Extract<TagOf<Own>, keyof C> })
  & ([Extract<TagOf<OwnCommand>, keyof C>] extends [never] ? unknown
    : { readonly [K in `an own command takes the name of ${Of}`]: Extract<TagOf<OwnCommand>, keyof C> })

/** An input that takes a child's name would replace the child, whose messages would then be the input's. */
type NoShared<C, I> = [keyof C & keyof I] extends [never] ? unknown
  : Readonly<{ 'an input takes the name of a child': keyof C & keyof I }>

type Config<State, C, I, Own, OwnCommand, Event, Model, Ran, Heard, K, Flags> =
  & OnEventOf<State, C, OwnCommand | ChildCommands<C>, Event>
  // A command's answer is an own message, or one its parent may send a child: never a write into an input, the
  // parent's or a child's, since only what is drawn writes, nor a child's own message.
  & RunCommandOf<OwnCommand, Own | ChildExternals<C>, Ran>
  & UpdateOf<State, C, Own, OwnCommand | ChildCommands<C>, Event>
  & NoClash<Own, OwnCommand, C, 'a child'>
  & NoClash<Own, OwnCommand, I, 'an input'>
  & NoShared<C, I>
  & Readonly<{
    /**
     * The first state and commands: a step, or, for a program with flags, the function that makes one from them. A
     * parent makes it with its children (`(children) => …`, `(children) => (flags) => …`).
     *
     * A child that is there from the start is started with `children.<child>.init`, which holds its state and its
     * commands. The program's own flags are declared with its other types, in `program`.
     *
     * @see The guide, "Composition", "How a child starts".
     * @see The guide, "Composition", "The parent's own flags".
     */
    init: [keyof C] extends [never] ? Init<State, OwnCommand, Flags>
      : (
        children: Handles<State, C, OwnCommand | ChildCommands<C>, Event>,
      ) => Init<State, OwnCommand | ChildCommands<C>, Flags>
    /** The children, by name: `{ Clock: child(…), Row: childById(…) }`. */
    children?: C
    /**
     * The inputs, by name, as `input` and `inputById` declare them.
     *
     * - A write is stored while the input's place holds, by `Equal`, the value it was written over. It is rejected
     *   otherwise.
     * - Every other step leaves an input as that step wrote it.
     * - No `update` of the program sees what the user gives an input.
     * - Only what is drawn writes into an input. A subscription and a command answer with messages of the program.
     *
     * @example
     * ```ts
     * inputs: {
     *   Name: input({ at: Optic.id<State>().key('name') }),
     *   Count: inputById({ at: (id: string) => Optic.id<State>().key('rows').at(id).key('count') }),
     * },
     * ```
     *
     * @see The guide, "Composition", "The rule of an input".
     * @see The guide, "Inputs the user types into", "What the user gives an input is no message of the program".
     * @see The guide, "Inputs the user types into", "Only what is drawn writes into an input".
     */
    inputs?: I
    /** The parent's own subscriptions. */
    subscriptions?: (state: State) => Heard & HashMap.HashMap<K, Subscription<Own, any>>
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
// of `make` read them: `Record.map` and `Record.keys` do not say which keys they visit.
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
  kind: 'one' | 'byId'
  program: AnyProgram
  get: (state: unknown, id?: unknown) => Opt.Option<unknown>
  set: (state: unknown, idOrChild: unknown, child?: unknown) => unknown
  subscribed?: (state: unknown) => Opt.Option<unknown> | Iterable<readonly [unknown, unknown]>
}>

const make = <
  State,
  C extends Children<State>,
  I extends Inputs<State>,
  Model,
  Own,
  OwnCommand,
  Event,
  Ran,
  Heard,
  K,
  External,
  Flags,
>(
  config: Config<State, C, I, Own, OwnCommand, Event, Model, Ran, Heard, K, Flags>,
): Shape<
  State,
  Model,
  Own | ChildMessages<C> | InputMessages<I>,
  OwnCommand | ChildCommands<C>,
  RanServices<Ran> | ChildCommandServices<C>,
  HeardServices<Heard> | ChildSubscriptionServices<C>,
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
  const isById = (name: string) => childOf(name).kind === 'byId'
  const at = ({ name, id }: Place) => isById(name) ? { id } : {}
  const wrapMessage = (place: Place) => (message: unknown) => ({ _tag: place.name, ...at(place), message }) as Message
  const wrapCommand = (place: Place) => (command: unknown) => ({ _tag: place.name, ...at(place), command }) as Command
  const getAt = ({ name, id }: Place, state: State) =>
    isById(name) ? childOf(name).get(state, id) : childOf(name).get(state)
  const setAt = ({ name, id }: Place, state: State, childState: unknown) =>
    (isById(name) ? childOf(name).set(state, id, childState) : childOf(name).set(state, childState)) as State
  const onEvents = ((config as Readonly<{ onEvent?: unknown }>).onEvent ?? {}) as Readonly<
    Record<string, (...args: ReadonlyArray<unknown>) => (state: State) => Step<State, Command, Event>>
  >
  const defectAt = (place: Place, message: string, on?: unknown) =>
    new CompositionDefect({
      message,
      child: place.name,
      ...(isById(place.name) ? { id: place.id } : {}),
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
    return isById(place.name) ? handle(place.id, event, handles) : handle(event, handles)
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
    child.kind === 'byId'
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
        [isById(place.name) ? [place.name, place.id, key] : [place.name, key], subscription] as const,
    )
    kept.places[kept.met++] = [place, subscriptions]
    return subscriptions
  }
  const listening = (name: string, state: State): ReadonlyArray<readonly [Place, unknown]> => {
    const { get, subscribed } = childOf(name)
    if (isById(name)) {
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
    child.kind === 'byId'
      ? (parentState: State, id: unknown) => modelAt({ name, id }, parentState)
      : (parentState: State) => modelAt({ name, id: undefined }, parentState)) as Models<State, C>
  const ownRunCommand = (
    config as Readonly<{ runCommand?: (command: OwnCommand) => Execution<Own | ChildExternals<C>, unknown> }>
  ).runCommand
  const program = {
    // Without children, `init` is the program's own, as `Program` writes it: a step is never a function, but a
    // function of the flags and one of the children cannot be told apart, so the children declared decide.
    init: names.length === 0
      ? config.init as Init<State, Command, Flags>
      : (config.init as (children: typeof handles) => Init<State, Command, Flags>)(handles),
    update,
    runCommand: (command: Command): Execution<Message, unknown> => {
      const place = placeOf(command)
      if (isChildName(place.name)) {
        const childCommand = field(command, 'command')
        // Unreachable through the types: `child` and `childById` ask for a `runCommand` whenever the child has
        // commands. Read as it is, not through `runCommandOf`, whose stand-in, `absurd`, would die of an error of its
        // own: a child that has none is a `CompositionDefect` that names it.
        const run = (childOf(place.name).program as Readonly<{ runCommand?: RunCommand<unknown, unknown, unknown> }>)
          .runCommand
        if (run === undefined) {
          const on = describeByTag(childCommand)
          throw defectAt(place, `The command ${String(on)} of "${place.name}", which has no runCommand`, on)
        }
        return Effect.map(run(childCommand), Opt.map(wrapMessage(place)))
      }
      // Unreachable through the types: `runCommand` is required whenever the parent has commands of its own.
      if (ownRunCommand === undefined) throw new Error('make: a command of its own, and no runCommand')
      return ownRunCommand(command as OwnCommand)
    },
    // A child's keys are under its name and id, so two children never clash: only an own key shaped like one
    // of theirs could, and would silently take the child's place. Built in place: a list of a thousand children
    // makes a thousand keys on every change of state.
    // Two children's keys clash only when `subscribed` lists one id twice.
    subscriptions: (state: State) => {
      const own = HashMap.map(
        config.subscriptions?.(state) ?? HashMap.empty<K, Subscription<Own, unknown>>(),
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
  return program as unknown as Shape<
    State,
    Model,
    Message,
    Command,
    RanServices<Ran> | ChildCommandServices<C>,
    HeardServices<Heard> | ChildSubscriptionServices<C>,
    Event,
    External,
    Flags
  >
}

/**
 * What a program declares of itself, by name, for `program`: its state, and its own messages, commands, events,
 * external messages and flags. Its model may be named too: a model named is checked, and one not named is inferred.
 *
 * - Each is the program's own: what its children and its inputs bring is added to it.
 * - The services are never named: they are inferred from `runCommand`, `subscriptions` and the children.
 *
 * @see The guide, "Anatomy of a program", "Its types are named first, then it is made".
 * @see The guide, "Composition", "The parent's own types".
 */
type DeclaredTypes = Readonly<{
  /** Its state, an object. */
  state: object
  /** What its view draws. Inferred from `makeModel` when it is not named. */
  model?: unknown
  /** Its own messages, those its `update` takes, if it has any: a program that names none has no `update`. */
  message?: unknown
  /** Its own commands, if it has any. */
  command?: unknown
  /** The events it raises, if it raises any. */
  event?: unknown
  /** Which of its messages a parent of its own may send it, if any: a part of its messages. */
  external?: unknown
  /** What it starts from, if it has flags. */
  flags?: unknown
}>

/**
 * The way to make a program: its types named once, then the functions that declare its children and its inputs, and
 * `make`, which makes it.
 *
 * Naming the types first lets `update`, `get`, `set` and the rest be typed without annotations. The types also say
 * the program's own messages, commands, events, external messages and flags. A type that the program does not name is
 * a type that the program does not have: a program that names no messages has no `update`. The model may be named
 * too. A model that is named is checked, and a model that is not named is inferred. The services are never named:
 * they are inferred.
 *
 * A child is any program. The library does the routing. A parent and its children talk only through events and
 * external messages. The parent's messages, commands and subscriptions are its own, plus each child's, wrapped. The
 * parent's messages also include the writes into each input:
 *
 * - a message as `{ _tag: <child>, message }`, and a write as `{ _tag: <input>, message }`;
 * - a command as `{ _tag: <child>, command }`, run by the child's `runCommand`;
 * - a subscription under the key `[<child>, key]`.
 *
 * For children and inputs by id, each of these also carries the `id`: a key is then `[<child>, id, key]`. A message of
 * the parent's own that takes the name of a child or of an input does not compile, nor does an external message that
 * takes the name of an input. A key of the parent's own subscriptions that is the key of a child's subscription is a
 * defect, a `CompositionDefect`.
 *
 * @returns `child` and `childById`, which declare a child alone and children by id, `input` and `inputById`, which
 * declare an input alone and inputs by id, and `make`, which makes the program.
 *
 * @example
 * ```ts
 * const counter = program<{ state: State; model: Model; message: Message }>().make({
 *   init: { state: { count: 0 } },
 *   update,
 *   makeModel: (state) => ({ count: state.count, increment: 'Increment' }),
 * })
 * ```
 *
 * @example
 * ```ts
 * const { child, make } = program<{ state: State }>()
 *
 * const app = make({
 *   init: (children) => ({ state: { clock: children.Clock.init.state }, commands: children.Clock.init.commands }),
 *   children: { Clock: child(clock, { at: Optic.id<State>().key('clock') }) },
 *   makeModel: (state, children) => ({ clock: children.Clock(state) }),
 * })
 * ```
 *
 * @see The guide, "Anatomy of a program", "Its types are named first, then it is made".
 * @see The guide, "Anatomy of a program", "What does not compile".
 * @see The guide, "Composition", "In short".
 * @see The guide, "Composition", "The parent's messages".
 * @see The guide, "Composition", "The parent's commands".
 * @see The guide, "Composition", "The parent's subscriptions".
 * @see The guide, "Composition", "What does not compile:".
 * @see The guide, "Composition", "What is a defect".
 * @see The guide, "Events and external messages", "An external message never writes into an input".
 */
export const program =<T extends DeclaredTypes>(): ProgramMaker<T> => ({
  child: (program, place) => ({
    kind: 'one',
    program,
    ...placed(place),
    ...(place.subscribed === undefined ? {} : { subscribed: place.subscribed }),
  }),
  childById: (program, place) => ({ kind: 'byId', program, ...placedById(place), subscribed: place.subscribed }),
  input: (place) => ({ kind: 'one', ...placed(place) }),
  inputById: (place) => ({ kind: 'byId', ...placedById(place) }),
  make: (config) => make(config as never) as never,
})

// On `make`'s config, which alone knows the children: the program's type holds all their messages, those they keep to
// themselves too, so `ExternalAmong` in `program.ts` would let one through, and the child would get it as external.
// Only a child's message is checked here: one that is no message at all is refused where the program is a child, as
// for any program (`docs/rejected.md`).
/** A parent's external messages for a child are the child's external messages, which it answers in every state. */
type ExternalPassed<External, Messages, Externals> = Unpassed<Exclude<Extract<External, Messages>, Externals>>
type Unpassed<Kept> = [Kept] extends [never] ? unknown
  : Readonly<{ "an external message for a child is not among the child's": Kept }>

// By the tag, not by the message: `make` routes every message tagged with an input's name to the input, so an external
// message with that tag is a write, however its type is spelled (a union of tags, `string`).
/**
 * An external message is answered in every state, and a write is rejected once its `was` is stale: no input is written
 * from outside.
 */
type ExternalWritten<Written> = [Written] extends [never] ? unknown
  : Readonly<{ 'an external message writes into an input': Written }>

// A type `T` names is checked, `never` too; one it does not name is inferred.
type Named<T, K extends 'model', Inferred> = T extends { readonly [P in K]: infer V } ? V : Inferred

// What `program` returns, and each of its functions, have names of their own: the declarations of a package that
// exports one name it, where they would spell out every type of this module, for each field of the state.
/**
 * What `program<T>()` returns: the functions that declare a program's children and inputs, and make it.
 *
 * @see The guide, "Anatomy of a program", "Its types are named first, then it is made".
 * @see The guide, "Composition", "In short".
 */
export interface ProgramMaker<T extends DeclaredTypes> {
  /**
   * Declares a child alone in its parent's state.
   *
   * The child lives where the optic `at` focuses, or where `get` and `set` put it. Where the optic focuses nothing,
   * or `get` returns `None`, the child is not there, and a message for it is rejected. By default, the child's
   * subscriptions run whenever the child is there.
   *
   * @param program - The child.
   * @param place - Where the child lives, and `subscribed`, a function of the parent's state. `subscribed` gives the
   * child's state in the states where the child's subscriptions run, and `None` in the others.
   * @returns The child, for `children` in `make`.
   *
   * @example
   * ```ts
   * About: child(about, { at: Optic.id<State>().key('maybeAbout').compose(Optic.some()) }),
   * ```
   *
   * @see The guide, "Composition", "Where the child lives: `at`".
   * @see The guide, "Composition", "When the child is not there".
   * @see The guide, "Composition", "When a child's subscriptions run: `subscribed`".
   */
  readonly child: DeclareChild<T>
  /**
   * Declares children told apart by an id, such as the rows of a list, each with a state of its own.
   *
   * - `get` and `set` take the id, or `at` is a function of it.
   * - `subscribed` is required. A row that it leaves out runs no subscription.
   * - `children.Row(state, id)` is a row's model, and `forwardTo(dispatch, 'Row', id)` is the row's dispatch.
   * - Ids are compared by value, with `Equal`.
   *
   * @param program - The program of each child.
   * @param place - Where the child at an id lives, and `subscribed`, a function of the parent's state that lists the
   * ids whose subscriptions run, each with its child's state.
   * @returns The children, for `children` in `make`.
   *
   * @example
   * ```ts
   * Row: childById(row, {
   *   get: (state, id: number) => Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.counter),
   *   set: (state, id, counter) => ({ rows: state.rows.map((row) => (row.id === id ? { id, counter } : row)) }),
   *   subscribed: (state) => state.rows.map((row) => [row.id, row.counter] as const),
   * }),
   * ```
   *
   * @see The guide, "Composition", "`get` and `set` take the id".
   * @see The guide, "Composition", "`subscribed` lists the rows that listen".
   * @see The guide, "Composition", "`children.Row(state, id)` is a row's model".
   * @see The guide, "Composition", "Ids are compared by value".
   */
  readonly childById: DeclareChildById<T>
  /**
   * Declares an input: a place of the program's state that the view writes into.
   *
   * An input is not a child. The input's value is part of the program's own state. The program's `update` and
   * `makeModel` read that value like the rest of the state. The view writes over the value its model holds,
   * `{ _tag: 'Written', was: model.name, value }`, through `forwardTo(dispatch, 'Name')`.
   *
   * @param place - Where the input is: an optic into the program's state, `at`, or the two functions an optic is,
   * `get` and `set`.
   * @returns The input, for `inputs` in `make`.
   *
   * @example
   * ```ts
   * inputs: { Name: input({ at: Optic.id<State>().key('name') }) },
   * ```
   *
   * @see The guide, "Composition", "The parent's inputs".
   * @see The guide, "Inputs the user types into", "The view writes over the value its model holds".
   */
  readonly input: DeclareInput<T>
  /**
   * Declares inputs told apart by an id, such as one in each row: a place of the program's state for each id.
   *
   * A write names its id, `{ _tag: 'Count', id, message }`, through `forwardTo(dispatch, 'Count', id)`.
   *
   * @param place - Where the input at an id is: an optic that is a function of the id, `at`, or `get` and `set`,
   * which take the id.
   * @returns The inputs, for `inputs` in `make`.
   *
   * @example
   * ```ts
   * Count: inputById({
   *   get: (state, id: string) => Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.count),
   *   set: (state, id, count) => ({ rows: state.rows.map((row) => (row.id === id ? { ...row, count } : row)) }),
   * }),
   * ```
   *
   * @see The guide, "Inputs the user types into", "A write into an input by id names its id".
   */
  readonly inputById: DeclareInputById<T>
  // Its external messages are checked where it is a child (`child`, `childById`), not here (`docs/rejected.md`).
  /**
   * Makes the program from its pieces, and from the children and the inputs it declares.
   *
   * A model named in `program` is checked against `makeModel`, and a model not named is inferred from it. A parent's
   * own `update` takes `children` too. It may reject the parent's own messages, as any `update` does. The parent's
   * commands need the services of its `runCommand` and of its children's commands. The parent's subscriptions need the
   * services of its own `subscriptions` and of its children's subscriptions. Nothing names these services: they are
   * inferred.
   *
   * @param config - Its `init` and `makeModel`, its `update`, `runCommand` and `subscriptions` where it has them, and
   * for a parent its `children`, its `inputs` and `onEvent`.
   * @returns The program, which runs alone or as a child of another.
   *
   * @example
   * ```ts
   * const form = make({
   *   init: { state: { name: '' } },
   *   inputs: { Name: input({ at: Optic.id<State>().key('name') }) },
   *   makeModel: (state) => ({ name: state.name }),
   * })
   * ```
   *
   * @see The guide, "Anatomy of a program", "Its types are named first, then it is made".
   * @see The guide, "Composition", "The parent's own messages, commands and subscriptions".
   */
  readonly make: MakeProgram<T>
}

/**
 * The function of `program` that declares a child alone in its parent's state.
 *
 * @see The guide, "Composition", "Where the child lives: `at`".
 */
export type DeclareChild<T extends DeclaredTypes> = <P extends AnyProgram>(
  program: CheckedChild<P>,
  place:
    & Placement<Field<T, 'state'>, StateOf<P>>
    & Readonly<{ subscribed?: (state: Field<T, 'state'>) => Opt.Option<StateOf<P>> }>
    & ObjectState<StateOf<P>>,
) => Child<Field<T, 'state'>, P>

/**
 * The function of `program` that declares children told apart by an id.
 *
 * @see The guide, "Composition", "`get` and `set` take the id".
 */
export type DeclareChildById<T extends DeclaredTypes> = <Id, P extends AnyProgram>(
  program: CheckedChild<P>,
  place:
    & PlacementById<Field<T, 'state'>, Id, StateOf<P>>
    & Readonly<{ subscribed: (state: Field<T, 'state'>) => Iterable<readonly [Id, StateOf<P>]> }>
    & ObjectState<StateOf<P>>,
) => ChildById<Field<T, 'state'>, Id, P>

/**
 * The function of `program` that declares an input.
 *
 * @see The guide, "Composition", "The parent's inputs".
 */
export type DeclareInput<T extends DeclaredTypes> = <A>(
  place: Placement<Field<T, 'state'>, A>,
) => Input<Field<T, 'state'>, A>

/**
 * The function of `program` that declares inputs told apart by an id.
 *
 * @see The guide, "Inputs the user types into", "A write into an input by id names its id".
 */
export type DeclareInputById<T extends DeclaredTypes> = <Id, A>(
  place: PlacementById<Field<T, 'state'>, Id, A>,
) => InputById<Field<T, 'state'>, Id, A>

/**
 * The function of `program` that makes the program from its pieces.
 *
 * A state whose type has no fields, such as `{}`, does not compile, since such a type holds a number too: name it
 * `object`.
 *
 * @see The guide, "Composition", "The parent's own messages, commands and subscriptions".
 * @see The guide, "Anatomy of a program", "What does not compile".
 */
export type MakeProgram<T extends DeclaredTypes> = <
  Model,
  C extends Children<Field<T, 'state'>> = None,
  I extends Inputs<Field<T, 'state'>> = None,
  Ran = never,
  Heard = never,
  K = unknown,
>(
  // The children and the inputs are inferred from where they are declared alone: a command a step returns would
  // otherwise be read as a child's, where no child is declared.
  config:
    & Config<
      Field<T, 'state'>,
      NoInfer<C>,
      NoInfer<I>,
      Field<T, 'message'>,
      Field<T, 'command'>,
      Field<T, 'event'>,
      Named<T, 'model', Model>,
      Ran,
      Heard,
      K,
      Field<T, 'flags'>
    >
    & Readonly<{ children?: C; inputs?: I }>
    & ExternalPassed<Field<T, 'external'>, ChildMessages<NoInfer<C>>, ChildExternals<NoInfer<C>>>
    & ExternalWritten<Extract<keyof NoInfer<I> & string, TagOf<Field<T, 'external'>>>>
    // On the config, as for a program written by hand: the program `make` returns carries the marker of `Program`,
    // which the check of `run` and of the testing tools asks for, so a state that holds a number would get past them.
    // A state that is a type parameter stays deferred here, and does not compile (`docs/rejected.md`).
    & ObjectState<Field<T, 'state'>>,
) => Program<Present<{
  state: Field<T, 'state'>
  model: Named<T, 'model', Model>
  message: Field<T, 'message'> | ChildMessages<C> | InputMessages<I>
  command: Field<T, 'command'> | ChildCommands<C>
  commandServices: RanServices<Ran> | ChildCommandServices<C>
  subscriptionServices: HeardServices<Heard> | ChildSubscriptionServices<C>
  event: Field<T, 'event'>
  external: Field<T, 'external'>
  flags: Field<T, 'flags'>
}>>

// The types the program names, and only those: one it does not name would print as `never` in every hover and
// declaration of the program. `state`, `model` and `message` stay, `never` too (a program with no messages); `Extract`
// shows `Program` the fields it asks for, which a mapped type with `as` hides from it. Without it, the smoke test's
// consumer names 39 types of its programs as `never`.
type Present<T> = Extract<
  { [K in keyof T as K extends 'state' | 'model' | 'message' ? K : [T[K]] extends [never] ? never : K]: T[K] },
  { state: object; model: unknown; message: unknown }
>
