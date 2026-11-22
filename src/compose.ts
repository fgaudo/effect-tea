// A parent declares its children and its inputs, and the library generates how their messages, commands,
// subscriptions and models reach them. The parent's state says which children are there, and the library keeps them,
// in the state of the composed program, beside the parent's own: it starts and drops them after each step of the
// parent's own code, and stores what is written into each input.
import * as Arr from "effect/Array"
import * as Channel from "effect/Channel"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as HashMap from "effect/HashMap"
import type * as Optic from "effect/Optic"
import * as Opt from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Result from "effect/Result"
import type { Execution, RunCommand } from "./command.ts"
import { compositionDefect } from "./defect.ts"
import { type Written, written } from "./input.ts"
import { describeByTag } from "./log.ts"
import {
  type AnyProgram,
  type CommandOf,
  type CommandServicesOf,
  type EventOf,
  type ExternalHandler,
  type ExternalOf,
  type Field,
  type FlagsOf,
  type Init,
  type Interpreter,
  type MessageOf,
  type ModelOf,
  type ObjectState,
  type Program,
  startOf,
  type StateOf,
  type SubscriptionServicesOf
} from "./program.ts"
import type { Subscription, Subscriptions } from "./subscription.ts"
import { reject, type Rejected, type Step, type Transition, type Update } from "./update.ts"

/**
 * Where an input lives in its program's state: an optic, `at`, or the two functions an optic is, `get` and `set`.
 *
 * @example
 * ```ts
 * { at: Optic.id<State>().key('name') }
 * ```
 *
 * @see The guide, "Inputs", "The program declares where it goes".
 */
type Placement<State, A> =
  | Readonly<{
    /** The input's value, or `None` where the input is not there: what `set` put, read from the state alone. */
    get: (state: State) => Opt.Option<A>
    /** The state with the value put where `get` finds it, and nothing else of it changed. */
    set: (state: State, value: A) => State
    at?: never
  }>
  | Readonly<{
    /** An optic into the state, to the input's value. */
    at: Optic.Optional<State, A>
    get?: never
    set?: never
  }>

/**
 * Where an input by id lives in its program's state: an optic that is a function of the id, `at`, or `get` and `set`,
 * which take the id.
 *
 * @see The guide, "Inputs", "A write into an input by id names its id".
 */
type PlacementById<State, Id, A> =
  | Readonly<{
    /** The value of the input at `id`, or `None` where it is not there. */
    get: (state: State, id: Id) => Opt.Option<A>
    /** The state with the value of the input at `id` put where `get` finds it, and nothing else changed. */
    set: (state: State, id: Id, value: A) => State
    at?: never
  }>
  | Readonly<{
    /** The optic into the state, to the value of the input at `id`. */
    at: (id: Id) => Optic.Optional<State, A>
    get?: never
    set?: never
  }>

// A child is checked as `start` checks a program, of the types read back from it: a child written as an object, and
// not typed `Program<…>`, is checked by nothing else. So its `external` answers with a step, never `reject`, and its
// `runCommand` is there when its steps list commands, `external`'s included. Its pieces are written out, as `Program`
// writes them: `Program<…>` takes only a state that is an object, and the state read back is any type.
type ProgramChecked<P> =
  & ObjectState<StateOf<P>>
  & {
    readonly init: Init<StateOf<P>, CommandOf<P>, FlagsOf<P>>
    readonly update: Update<StateOf<P>, MessageOf<P>, CommandOf<P>, EventOf<P>>
    readonly subscriptions: Subscriptions<StateOf<P>, MessageOf<P>, SubscriptionServicesOf<P>, unknown>
    readonly makeModel: (state: StateOf<P>) => ModelOf<P>
  }
  & Interpreter<CommandOf<P>, MessageOf<P>, CommandServicesOf<P>>
  & ExternalHandler<ExternalOf<P>, StateOf<P>, CommandOf<P>, EventOf<P>>

// What a child lacks for the check above, `unknown` where it lacks nothing. A child that runs commands has a
// `runCommand`, a member, for the error that names it; `Interpreter` is `object` for one that runs none, and `unknown`
// is needed instead: see `CheckedChild`. The rest of the check is held under a key no program has, as `ObjectState`
// does: as members, its types, read from a `P` not inferred yet, would type the functions of a child written in the
// call, and its `HashMap.empty()` would hold subscriptions of `unknown` messages.
type Lacking<P> = P extends ProgramChecked<P> ? unknown
  :
    & ([CommandOf<P>] extends [never] ? unknown : Interpreter<CommandOf<P>, unknown, unknown>)
    & { readonly "a child is a program of the types read back from it": ProgramChecked<P> }

// The child's program, with what it lacks for the check above. Inferred from `P & …`, `P` would be the program less
// the members TypeScript matches with the check, which loses the name `Program<…>` in a consumer's declarations:
// inferred from `P` alone, it keeps it, and the intersection is written only where the check fails. Without it, the
// declarations of the smoke test's consumer spell out four programs, not one. The check is not on `P`, whose branch
// would then see `P` as `P & ProgramChecked<P>`, the contextual type of a child written in the call.
type CheckedChild<P> = unknown extends Lacking<P> ? P : P & Lacking<P>

/**
 * A child that the library keeps: the number of its start, what it was started from, and its state.
 *
 * @see The guide, "Composition", "What the library derives".
 */
export type Instance<State> = {
  /** The number of this start, among the starts of the parent's children: no other instance of the parent has it. */
  readonly instance: number
  /** What the parent's state gave as the child started: its flags, or its key. Another one starts another child. */
  readonly key: unknown
  /** The child's state. */
  readonly state: State
}

/**
 * The state of a parent: its own state, and the children that the library keeps for it.
 *
 * The parent's functions are given its own state alone. A test makes a whole state with `stateOf`, of
 * `@fgaudo/effect-tea/testing`, or by folding messages from `init`.
 *
 * @see The guide, "Composition", "What the library derives".
 */
export type Kept<Own, Children> = {
  /** The parent's own state: all that its functions are given. */
  readonly own: Own
  /** How many children the parent has started so far: the number of the last start. */
  readonly starts: number
  /** The children that are there, by name: an `Option` for a child alone, a `HashMap` by id for children by id. */
  readonly children: Children
}

/**
 * A child alone: what `child` returns, for `withChildren`.
 *
 * - A child that is always there is there in every state of its parent.
 * - Another child is there in the states its declaration says, and its model is an `Option`.
 * - Another key, or other flags, start the child again, as another instance.
 *
 * @example
 * ```ts
 * export const clock: Child<State, typeof Clock.clock, 'always'> = child(Clock.clock)
 * ```
 *
 * @see The guide, "Composition", "Declaring children".
 * @see The guide, "Composition", "When the child is not there".
 */
export type Child<State, P, There extends "always" | "sometimes"> = {
  /** A child alone, not one of children by id. */
  readonly kind: "one"
  /** The child's program. */
  readonly program: P
  /** Whether the child is there in every state of its parent. */
  readonly there: There
  /** What the child starts from in a state, its flags or its key, or `None` where it is not there. */
  readonly key: (state: State) => Opt.Option<unknown>
  /** Whether the child's subscriptions run in a state where it is there. Without it, they always run. */
  readonly listening?: (state: State) => boolean
}

/**
 * Children told apart by an id, such as the rows of a list: what `childById` returns, for `withChildren`.
 *
 * - The children that are there are those whose ids the parent's state lists.
 * - Ids are compared by value, with `Equal`.
 *
 * @example
 * ```ts
 * export const rows: ChildById<State, number, typeof Row.row> = childById(Row.row, { ids: (state) => state.ids })
 * ```
 *
 * @see The guide, "Composition", "Children by id".
 * @see The guide, "Composition", "Ids are compared by value".
 */
export type ChildById<State, Id, P> = {
  /** Children by id, not a child alone. */
  readonly kind: "byId"
  /** The program of each child. */
  readonly program: P
  /** The children in a state: their ids, or, for a program with flags, each id with its flags. */
  readonly listed: (state: State) => Iterable<unknown>
  /** Whether `listed` gives each id with its flags. */
  readonly flagged: boolean
  /** Whether the child at an id listens, in a state where it is there. Without it, every child does. */
  readonly listening?: (state: State, id: Id) => boolean
}

/**
 * An input alone in its program's state: what `input` returns, for `inputs` in `make`.
 *
 * - Its value is part of the program's own state.
 * - The library stores a write in every state where `get` finds its place.
 * - It rejects the write where `get` returns `None`.
 *
 * @example
 * ```ts
 * export const name: Input<State, string> = input({ at: Optic.id<State>().key('name') })
 * ```
 *
 * @see The guide, "Composition", "The parent's inputs".
 * @see The guide, "Inputs", "The program declares where it goes".
 * @see The guide, "Inputs", "The library stores what is written, whatever it is".
 * @see The guide, "Inputs", "The library rejects the write where its place is not there".
 */
export type Input<State, A> = {
  /** An input alone, not one of inputs by id. */
  readonly kind: "one"
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
 * @see The guide, "Inputs", "A write into an input by id names its id".
 * @see The guide, "Inputs", "A write is stored at the place of its id".
 */
export type InputById<State, Id, A> = {
  /** Inputs by id, not an input alone. */
  readonly kind: "byId"
  /** The value of the input at `id`, or `None` where it is not there. */
  readonly get: (state: State, id: Id) => Opt.Option<A>
  /** The state with the value of the input at `id` put where `get` finds it. */
  readonly set: (state: State, id: Id, value: A) => State
}

// `never` parameters: any `set` fits, whatever its value and id.
/** The inputs a program declares, by name: `{ Name: input({ at }), Count: inputById({ at }) }`. */
type Inputs<State> = Readonly<
  Record<
    string,
    | Readonly<{ kind: "one"; get: (state: State) => Opt.Option<any>; set: (state: State, value: never) => State }>
    | Readonly<{
      kind: "byId"
      get: (state: State, id: never) => Opt.Option<any>
      set: (state: State, id: never, value: never) => State
    }>
  >
>

/** No children, or no inputs: what a program that declares none has. */
type None = Readonly<Record<never, never>>

/**
 * What is written into an input, as its program receives it: `{ _tag: <input>, message }`, and its `id` for inputs by
 * id, as a child's message.
 */
type InputMessages<I> = {
  [K in keyof I & string]: I[K] extends
    Readonly<{ kind: "byId"; get: (state: any, id: infer Id) => Opt.Option<infer A> }>
    ? Readonly<{ _tag: K; id: Id; message: Written<A> }>
    : I[K] extends Readonly<{ get: (state: any) => Opt.Option<infer A> }> ? Readonly<{ _tag: K; message: Written<A> }>
    : never
}[keyof I & string]

// `never` parameters: any `listening` fits, whatever its id.
type Children<State> = Readonly<
  Record<
    string,
    | Readonly<{
      kind: "one"
      program: AnyProgram
      there: "always" | "sometimes"
      key: (state: State) => Opt.Option<unknown>
      listening?: (state: State) => boolean
    }>
    | Readonly<{
      kind: "byId"
      program: AnyProgram
      listed: (state: State) => Iterable<unknown>
      flagged: boolean
      listening?: (state: State, id: never) => boolean
    }>
  >
>

type ProgramOf<C> = C extends { readonly program: infer P } ? P : never

// Told by `kind` and the id `listening` takes, which the type declares whether or not the child has one.
type ChildByIdOf<Id, P> = Readonly<{ kind: "byId"; program: P; listening?: (state: any, id: Id) => boolean }>

/** Where a child's messages, commands and keys carry its id: only for children by id. */
type At<C> = C extends ChildByIdOf<infer Id, any> ? Readonly<{ id: Id }> : unknown

/** Whether a child alone is there in every state of its parent. */
type IsAlways<C> = C extends Readonly<{ there: "always" }> ? true : false

/**
 * What the library keeps of each child, by name: an `Option` of the instance of a child alone, and the instances of
 * children by id.
 */
type KeptOf<C> = {
  readonly [K in keyof C & string]: C[K] extends ChildByIdOf<infer Id, infer P> ?
    HashMap.HashMap<Id, Instance<StateOf<P>>>
    : Opt.Option<Instance<StateOf<ProgramOf<C[K]>>>>
}

/**
 * A child's message, as its parent receives it: `{ _tag: <child>, message }`, and its `id` for children by id. The
 * answer of a child's command, and a message of its subscriptions, carry the `instance` that asked for it too: an
 * answer for an instance that is no longer there is rejected. A message of the child's view names no instance.
 */
type ChildMessages<C> = {
  [K in keyof C & string]: Readonly<{ _tag: K; message: MessageOf<ProgramOf<C[K]>>; instance?: number }> & At<C[K]>
}[keyof C & string]

/** A child's command, as its parent's interpreter receives it: it names the instance that asked for it. */
type ChildCommands<C> = {
  [K in keyof C & string]: [CommandOf<ProgramOf<C[K]>>] extends [never] ? never
    : Readonly<{ _tag: K; instance: number; command: CommandOf<ProgramOf<C[K]>> }> & At<C[K]>
}[keyof C & string]

/** What a parent may tell its children: an external message of one, by name, and by id for children by id. */
type Tells<C> = {
  [K in keyof C & string]: [ExternalOf<ProgramOf<C[K]>>] extends [never] ? never
    : Readonly<{ _tag: K; message: ExternalOf<ProgramOf<C[K]>> }> & At<C[K]>
}[keyof C & string]

// The services of a parent's own `runCommand` and `subscriptions`, read from all that each returns, `Ran` and `Heard`:
// one parameter for the services, inferred from the branches of a `runCommand` or from the subscriptions of a map,
// would be one of the candidates and not their union.
type RanServices<Ran> = Ran extends Execution<any, infer R> ? R : never
// What a map holds is read as a program's subscriptions are: see `SubscriptionServicesOf`.
type HeardServices<Heard> = SubscriptionServicesOf<{ readonly subscriptions: (state: never) => Heard }>

// A child's commands and subscriptions are lifted into its parent's, with what they need.
type ChildCommandServices<C> = { [K in keyof C]: CommandServicesOf<ProgramOf<C[K]>> }[keyof C]
type ChildSubscriptionServices<C> = { [K in keyof C]: SubscriptionServicesOf<ProgramOf<C[K]>> }[keyof C]

/**
 * The children's models, by name: `children` in `makeModel`.
 *
 * - A child that is always there gives its model, `children.Clock()`.
 * - A child alone that may not be there gives an `Option` of its model, `children.About()`.
 * - A child by id gives its model, `children.Row(id)`. Asking for an id that the parent's state does not list is a
 *   defect, a `CompositionDefect`.
 *
 * A child's model is the same object while the child's state is the same object.
 *
 * @example
 * ```ts
 * makeModel: (state, children) => ({ clock: children.Clock() }),
 * ```
 *
 * @see The guide, "Composition", "A child's model is kept".
 * @see The guide, "Composition", "What is a defect".
 */
type Models<C> = {
  readonly [K in keyof C & string]: C[K] extends ChildByIdOf<infer Id, infer P> ? (id: Id) => ModelOf<P>
    : IsAlways<C[K]> extends true ? () => ModelOf<ProgramOf<C[K]>>
    : () => Opt.Option<ModelOf<ProgramOf<C[K]>>>
}

type OnEvents<State, C, Command, Event> = {
  readonly [K in keyof C & string as [EventOf<ProgramOf<C[K]>>] extends [never] ? never : K]: C[K] extends
    ChildByIdOf<infer Id, infer P> ?
    (id: Id, event: EventOf<P>) => (state: State) => Step<State, Command, Event, Tells<C>>
    : (event: EventOf<ProgramOf<C[K]>>) => (state: State) => Step<State, Command, Event, Tells<C>>
}

/** `onEvent` is required exactly when a child emits events, so that none goes unhandled. */
type OnEventOf<State, C, Command, Event> = [keyof OnEvents<State, C, Command, Event>] extends [never] ? Readonly<{
    /**
     * What the parent does with each child's events, by child: one handler for each child that has events.
     *
     * It is required exactly when a child has events. A handler takes the event, and returns the parent's step as a
     * function of its own state. For children by id, it takes the id first.
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
     * It is required exactly when a child has events. A handler takes the event, and returns the parent's step as a
     * function of its own state. For children by id, it takes the id first.
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
     * What the program's own messages do: the step, as a function of its own state, or `reject`.
     *
     * It is required exactly when the program names messages of its own, in `program`. A parent's step tells its
     * children what to do in `tell`.
     *
     * @see The guide, "Anatomy of a program", "Its types are named first, then it is made".
     */
    update: (message: Own) => (state: State) => Transition<State, Command, Event, Tells<C>>
  }>

/**
 * `external` is required exactly when the program names external messages, and refused when it names none: what its
 * parent sends it is answered in every state.
 */
type ExternalHandlerOf<State, C, External, Command, Event> = [External] extends [never] ? Readonly<{ external?: never }>
  : Readonly<{
    /**
     * What each external message does: the step, as a function of the state.
     *
     * It is required exactly when the program names external messages, in `program`. It returns a step, never
     * `reject`: the program answers in every state, with its state or with an event. A parent passes an external
     * message on to a child in the `tell` of its step.
     *
     * @see The guide, "Events and external messages", "A child answers its external messages in every state".
     * @see The guide, "Events and external messages", "A parent passes an external message on".
     * @see The guide, "Events and external messages", "`external` is required exactly when the program names external messages".
     */
    external: (message: External) => (state: State) => Step<State, Command, Event, Tells<C>>
  }>

/** `runCommand` is required exactly when the program has commands of its own, so that none goes uninterpreted. */
type RunCommandOf<OwnCommand, Message, Ran> = [OwnCommand] extends [never] ? Readonly<{ runCommand?: never }>
  : Readonly<{
    /**
     * Runs one of the program's own commands.
     *
     * - It is required exactly when the program has commands of its own.
     * - It answers with a message of the program's own. To tell a child something, a step of the parent's `update`,
     *   `external` or `onEvent` lists it in `tell`.
     *
     * @see The guide, "Composition", "`runCommand`".
     */
    runCommand: (command: OwnCommand) => Ran & Execution<Message, any>
  }>

// Each way round, so that a wide tag (`string`, a template, `any`) takes every name it admits, and a wide name every
// tag it admits; an optional tag is a tag. A message with no tag in its type takes a name exactly when a message that
// has only that tag is one of its type, as one of `unknown` or `object` is.
/** The names among `Names` that a message or command of type `M` may carry as its tag, by which `make` routes it. */
type TagsTaken<M, Names> = 0 extends 1 & M ? Names
  : M extends unknown ?
    "_tag" extends keyof M ? Extract<Names, M[keyof M & "_tag"]> | Extract<M[keyof M & "_tag"], Names>
    : Names extends unknown ? Readonly<{ _tag: Names }> extends M ? Names : never
    : never
  : never

/**
 * An own message or command that can take the name of a child or of an input, `Of`, would be routed to it: it does not
 * compile.
 */
type NoClash<Own, OwnCommand, C, Of extends string> =
  & ([TagsTaken<Own, keyof C & string>] extends [never] ? unknown
    : { readonly [K in `an own message takes the name of ${Of}`]: TagsTaken<Own, keyof C & string> })
  & ([TagsTaken<OwnCommand, keyof C & string>] extends [never] ? unknown
    : { readonly [K in `an own command takes the name of ${Of}`]: TagsTaken<OwnCommand, keyof C & string> })

/** An input that takes a child's name would replace the child, whose messages would then be the input's. */
type NoShared<C, I> = [keyof C & keyof I] extends [never] ? unknown
  : Readonly<{ "an input takes the name of a child": keyof C & keyof I }>

type Config<State, C, I, Own, OwnCommand, Event, Model, Ran, Heard, K, External, Flags> =
  & OnEventOf<State, C, OwnCommand, Event>
  // A command's answer is an own message, as a subscription's is: a parent tells a child only in a step's `tell`. So
  // no answer writes into an input either.
  & RunCommandOf<OwnCommand, Own, Ran>
  & UpdateOf<State, C, Own, OwnCommand, Event>
  & ExternalHandlerOf<State, C, External, OwnCommand, Event>
  & NoClash<Own, OwnCommand, C, "a child">
  & NoClash<Own, OwnCommand, I, "an input">
  & NoShared<C, I>
  & Readonly<{
    /**
     * The first state and commands: a step, or, for a program with flags, the function that makes one from them.
     *
     * A parent's first step is of its own state. The library starts the children that this state lists, each with
     * its first commands. The program's own flags are declared with its other types, in `program`.
     *
     * @see The guide, "Composition", "How a child starts".
     * @see The guide, "Composition", "The parent's own flags".
     */
    init: Init<State, OwnCommand, Flags>
    /**
     * The inputs, by name, as `input` and `inputById` declare them.
     *
     * - A write is stored wherever the input's place is there. It is rejected where it is not.
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
     * @see The guide, "Inputs", "What the user gives an input is no message of the program".
     * @see The guide, "Inputs", "Only what is drawn writes into an input".
     */
    inputs?: I
    /** The program's own subscriptions, from its own state. */
    subscriptions?: (state: State) => Heard & HashMap.HashMap<K, Subscription<Own, any>>
    /** What the program draws, from its own state and its children's models. */
    makeModel: (state: State, children: Models<C>) => Model
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

// An optic focuses or not: `None` where it does not, and `replace` is only called where `get` focused.
const placed = <S, A>(
  place: Placement<S, A>
): Readonly<{ get: (state: S) => Opt.Option<A>; set: (state: S, value: A) => S }> =>
  place.at === undefined
    ? { get: place.get, set: place.set }
    : {
      get: (state) => Result.getSuccess(place.at.getResult(state)),
      set: (state, value) => place.at.replace(value, state)
    }

const placedById = <S, Id, A>(
  place: PlacementById<S, Id, A>
): Readonly<{ get: (state: S, id: Id) => Opt.Option<A>; set: (state: S, id: Id, value: A) => S }> =>
  place.at === undefined
    ? { get: place.get, set: place.set }
    : {
      get: (state, id) => Result.getSuccess(place.at(id).getResult(state)),
      set: (state, id, value) => place.at(id).replace(value, state)
    }

/** Who receives what a child at `id` sends: `undefined` for a child that is alone. */
type Place = Readonly<{ name: string; id: unknown }>

type Entry = Instance<unknown>
type Slot = Opt.Option<Entry> | HashMap.HashMap<unknown, Entry>
type Slots = Readonly<Record<string, Slot>>

/** A child's subscriptions under its parent's keys, `[<child>, instance, key]` or `[<child>, id, instance, key]`. */
type Lifted = ReadonlyArray<readonly [unknown, Subscription<unknown, unknown>]>

// What one call of `update`, `external` or `init` gathers: the parts of the state as they are replaced, and the
// commands and the events of every step taken in it. It never leaves the call.
type Gathered = {
  own: unknown
  starts: number
  children: Slots
  readonly commands: Array<unknown>
  readonly events: Array<unknown>
}

type UntypedStep = Step<unknown, unknown, unknown, unknown>

type UntypedChild = Readonly<{
  kind: "one" | "byId"
  program: AnyProgram
  there?: "always" | "sometimes"
  key?: (own: unknown) => Opt.Option<unknown>
  listed?: (own: unknown) => Iterable<unknown>
  flagged?: boolean
  listening?: (own: unknown, id?: unknown) => boolean
}>

type UntypedInput = Readonly<{
  kind: "one" | "byId"
  get: (state: unknown, id?: unknown) => Opt.Option<unknown>
  set: (state: unknown, idOrValue: unknown, value?: unknown) => unknown
}>

type UntypedConfig = Readonly<{
  init: Step<unknown, unknown> | ((flags: unknown) => Step<unknown, unknown>)
  inputs?: Readonly<Record<string, UntypedInput>>
  update?: (message: unknown) => (state: unknown) => UntypedStep | Rejected
  external?: (message: unknown) => (state: unknown) => UntypedStep
  onEvent?: Readonly<Record<string, (...args: ReadonlyArray<unknown>) => (state: unknown) => UntypedStep>>
  runCommand?: (command: unknown) => Execution<unknown, unknown>
  subscriptions?: (state: unknown) => HashMap.HashMap<unknown, Subscription<unknown, unknown>>
  makeModel: (state: unknown, children: unknown) => unknown
}>

/** How `stateOf`, of the testing tools, reaches what `make` keeps to itself. */
export const statesKey = "~@fgaudo/effect-tea/Kept/place"

/** What a parent gives `stateOf`: the whole state made from an own state and the states given for its children. */
export type Placer = (own: unknown, states: Readonly<Record<string, unknown>>) => unknown

// The key of a child that is there with no flags and no key.
const present = Opt.some(undefined)

// One `make` for a program and for a parent: `children` is `undefined` for a program, whose state is its own alone.
const make = (children: Readonly<Record<string, UntypedChild>> | undefined, config: UntypedConfig): unknown => {
  const programs = children ?? {}
  const inputs = config.inputs ?? {}
  const composed = children !== undefined
  const names = Object.keys(programs)
  const childOf = (name: string) => programs[name] as UntypedChild
  const inputOf = (name: string) => inputs[name] as UntypedInput
  // `Object.hasOwn`, not `Record.has`, which does not say whether a key a record inherits (`toString`) counts.
  const isChildName = (tag: unknown): tag is string => typeof tag === "string" && Object.hasOwn(programs, tag)
  const isInputName = (tag: unknown): tag is string => typeof tag === "string" && Object.hasOwn(inputs, tag)
  const field = (value: unknown, key: string): unknown => Predicate.hasProperty(value, key) ? value[key] : undefined
  const placeOf = (value: unknown): Place => ({ name: field(value, "_tag") as string, id: field(value, "id") })
  const isById = (name: string) => childOf(name).kind === "byId"
  const at = ({ name, id }: Place) => isById(name) ? { id } : {}
  const wrapMessage = (place: Place, instance: number) => (message: unknown) => ({
    _tag: place.name,
    ...at(place),
    instance,
    message
  })
  const wrapCommand = (place: Place, instance: number) => (command: unknown) => ({
    _tag: place.name,
    ...at(place),
    instance,
    command
  })
  const onEvents = config.onEvent ?? {}
  const defectAt = (place: Place, message: string, on?: unknown) =>
    compositionDefect({
      message,
      child: place.name,
      ...(isById(place.name) ? { id: place.id } : {}),
      ...(on === undefined ? {} : { on })
    })
  const open = (state: unknown): Gathered => {
    const whole = state as Kept<unknown, Slots>
    return { own: whole.own, starts: whole.starts, children: whole.children, commands: [], events: [] }
  }
  // The very same state where nothing of it was replaced, so that it makes no new model.
  const close = (gathered: Gathered, before: unknown): Step<unknown, unknown, unknown> => {
    const was = before as Kept<unknown, Slots>
    const same = Object.is(gathered.own, was.own) && gathered.children === was.children &&
      gathered.starts === was.starts
    return {
      state: same ? before : { own: gathered.own, starts: gathered.starts, children: gathered.children },
      commands: gathered.commands,
      events: gathered.events
    }
  }
  const entryAt = (slots: Slots, { name, id }: Place): Opt.Option<Entry> => {
    const slot = slots[name]
    return isById(name) ? HashMap.get(slot as HashMap.HashMap<unknown, Entry>, id) : slot as Opt.Option<Entry>
  }
  const putAt = (gathered: Gathered, { name, id }: Place, entry: Entry) => {
    gathered.children = {
      ...gathered.children,
      [name]: isById(name)
        ? HashMap.set(gathered.children[name] as HashMap.HashMap<unknown, Entry>, id, entry)
        : Opt.some(entry)
    }
  }
  // A child starts with the next number, which its commands carry, and so their answers.
  const startAt = (gathered: Gathered, place: Place, key: unknown): Entry => {
    const { state, commands = [] } = startOf(childOf(place.name).program.init, key)
    const instance = ++gathered.starts
    for (const command of commands) gathered.commands.push(wrapCommand(place, instance)(command))
    return { instance, key, state }
  }
  // The children that the parent's own state lists are there, each under the key it gives, and no other: one that it
  // no longer lists is dropped, one that it lists anew is started, and one whose key is another is another child.
  // Children by id whose `listed` gives the very same object for the own state of before are as they were: `listed`
  // is pure, so the same object lists the same children, which the last reconciliation left there.
  const reconcile = (gathered: Gathered, before: Opt.Option<unknown>) => {
    for (const name of names) {
      const child = childOf(name)
      if (child.kind === "one") {
        const wanted = (child.key as (own: unknown) => Opt.Option<unknown>)(gathered.own)
        const current = gathered.children[name] as Opt.Option<Entry>
        if (Opt.isNone(wanted)) {
          if (Opt.isSome(current)) gathered.children = { ...gathered.children, [name]: Opt.none() }
        } else if (Opt.isNone(current) || !Equal.equals(current.value.key, wanted.value)) {
          gathered.children = {
            ...gathered.children,
            [name]: Opt.some(startAt(gathered, { name, id: undefined }, wanted.value))
          }
        }
        continue
      }
      const listed = child.listed as (own: unknown) => Iterable<unknown>
      const now = listed(gathered.own)
      if (Opt.isSome(before) && Object.is(now, listed(before.value))) continue
      const current = gathered.children[name] as HashMap.HashMap<unknown, Entry>
      let same = true
      const next = HashMap.mutate(HashMap.empty<unknown, Entry>(), (kept) => {
        for (const item of now) {
          const [id, key] = child.flagged === true ? item as readonly [unknown, unknown] : [item, undefined]
          if (HashMap.has(kept, id)) throw defectAt({ name, id }, `The children "${name}" list the same id twice`)
          const found = HashMap.get(current, id)
          if (Opt.isSome(found) && Equal.equals(found.value.key, key)) {
            HashMap.set(kept, id, found.value)
          } else {
            same = false
            HashMap.set(kept, id, startAt(gathered, { name, id }, key))
          }
        }
      })
      if (!same || HashMap.size(next) !== HashMap.size(current)) {
        gathered.children = { ...gathered.children, [name]: next }
      }
    }
  }
  const onEventAt = (place: Place, event: unknown): (state: unknown) => UntypedStep => {
    const handle = onEvents[place.name]
    if (handle === undefined) {
      const on = describeByTag(event)
      throw defectAt(place, `The child "${place.name}" emitted the event ${String(on)}, which nothing handles`, on)
    }
    return isById(place.name) ? handle(place.id, event) : handle(event)
  }
  // A child's step: its state replaces the one kept, its commands are lifted, and each of its events is a step of the
  // parent's own, taken to its end before the next. An unchanged child leaves its instance the very same object.
  const childStep = (gathered: Gathered, place: Place, entry: Entry, result: Step<unknown, unknown, unknown>) => {
    if (!Object.is(result.state, entry.state)) {
      putAt(gathered, place, { instance: entry.instance, key: entry.key, state: result.state })
    }
    for (const command of result.commands ?? []) gathered.commands.push(wrapCommand(place, entry.instance)(command))
    for (const event of result.events ?? []) ownStep(gathered, onEventAt(place, event)(gathered.own))
  }
  // A step of the parent's own code: its state, then the children that state lists, then what it tells them, in
  // order, each to its end. What it tells is bound to the children that are there once the step is reconciled: a
  // child that is not there then is the step's own mistake, a defect, and one that an earlier item of the same `tell`
  // dropped or started again is told nothing.
  const ownStep = (gathered: Gathered, step: UntypedStep) => {
    const before = gathered.own
    gathered.own = step.state
    for (const command of step.commands ?? []) gathered.commands.push(command)
    for (const event of step.events ?? []) gathered.events.push(event)
    if (!Object.is(step.state, before)) reconcile(gathered, Opt.some(before))
    const tells = step.tell
    if (tells === undefined || tells.length === 0) return
    const bound = Arr.map(tells, (tell) => {
      const place = placeOf(tell)
      const message = field(tell, "message")
      // Unreachable through the types: a step tells only the children that the parent declares.
      if (!isChildName(place.name)) throw new Error(`make: a step tells "${String(place.name)}", which is no child`)
      const entry = entryAt(gathered.children, place)
      if (Opt.isNone(entry)) {
        const on = describeByTag(message)
        throw defectAt(place, `The external message ${String(on)} to "${place.name}", which is not in this state`, on)
      }
      return [place, entry.value.instance, message] as const
    })
    for (const [place, instance, message] of bound) {
      const entry = entryAt(gathered.children, place)
      if (Opt.isNone(entry) || entry.value.instance !== instance) continue
      // Unreachable through the types: a step tells a child only what its `external` takes, `never` for one without.
      const answer = (childOf(place.name).program as Readonly<{
        external?: (message: unknown) => (state: unknown) => Step<unknown, unknown, unknown>
      }>).external
      if (answer === undefined) {
        const on = describeByTag(message)
        throw defectAt(place, `The external message ${String(on)} to "${place.name}", which has no external`, on)
      }
      childStep(gathered, place, entry.value, answer(message)(entry.value.state))
    }
  }
  const getInput = (name: string, id: unknown, own: unknown) => {
    const input = inputOf(name)
    return input.kind === "byId" ? input.get(own, id) : input.get(own)
  }
  const setInput = (name: string, id: unknown, own: unknown, value: unknown) => {
    const input = inputOf(name)
    return input.kind === "byId" ? input.set(own, id, value) : input.set(own, value)
  }
  // A write is stored at its place, by the rule of every input, and keeps nothing between two writes. In a parent, it
  // is a step on the parent's own state, after which the children are reconciled, as after any other.
  const write = (place: Place, message: unknown, state: unknown) => {
    const own = composed ? (state as Kept<unknown, Slots>).own : state
    const held = getInput(place.name, place.id, own)
    if (Opt.isNone(held)) return reject
    const value = (written(message as never)(held.value) as Step<unknown>).state
    // `Object.is`, since a place may hold NaN, which a write of NaN leaves as it is.
    if (Object.is(value, held.value)) return { state, commands: [], events: [] }
    if (!composed) return { state: setInput(place.name, place.id, own, value), commands: [], events: [] }
    const gathered = open(state)
    gathered.own = setInput(place.name, place.id, own, value)
    reconcile(gathered, Opt.some(own))
    return close(gathered, state)
  }
  const update = (message: unknown) => (state: unknown) => {
    const place = placeOf(message)
    if (isChildName(place.name)) {
      const gathered = open(state)
      const entry = entryAt(gathered.children, place)
      if (Opt.isNone(entry)) return reject
      // An answer names the instance that asked: one for another instance at the same place does not apply.
      const instance = field(message, "instance")
      if (instance !== undefined && instance !== entry.value.instance) return reject
      const result = childOf(place.name).program.update(field(message, "message"))(entry.value.state) as
        | Step<unknown, unknown, unknown>
        | Rejected
      if (result === reject) return reject
      childStep(gathered, place, entry.value, result)
      return close(gathered, state)
    }
    if (isInputName(place.name)) return write(place, field(message, "message"), state)
    if (config.update === undefined) return reject
    if (!composed) return config.update(message)(state)
    const gathered = open(state)
    const result = config.update(message)(gathered.own)
    if (result === reject) return reject
    ownStep(gathered, result)
    return close(gathered, state)
  }
  const empty: Slots = mapOwn(
    programs,
    (child): Slot => child.kind === "byId" ? HashMap.empty<unknown, Entry>() : Opt.none()
  )
  const begin = (step: Step<unknown, unknown>): Step<unknown, unknown> => {
    if (!composed) return step
    const gathered: Gathered = {
      own: step.state,
      starts: 0,
      children: empty,
      commands: [...(step.commands ?? [])],
      events: []
    }
    reconcile(gathered, Opt.none())
    return {
      state: { own: gathered.own, starts: gathered.starts, children: gathered.children },
      commands: gathered.commands
    }
  }
  // A child's subscriptions, lifted under its instance: kept by the object that the library keeps the instance in,
  // which is at one place, and is replaced with the child's state.
  const lifted = new WeakMap<Entry, Lifted>()
  const liftedAt = (place: Place, entry: Entry): Lifted => {
    const found = lifted.get(entry)
    if (found !== undefined) return found
    const wrap = wrapMessage(place, entry.instance)
    const subscriptions = Arr.map(
      Arr.fromIterable(
        childOf(place.name).program.subscriptions(entry.state) as HashMap.HashMap<
          unknown,
          Subscription<unknown, unknown>
        >
      ),
      ([key, subscription]) =>
        [
          isById(place.name) ? [place.name, place.id, entry.instance, key] : [place.name, entry.instance, key],
          subscription.pipe(Channel.map(wrap), Channel.mapDone(wrap))
        ] as const
    )
    lifted.set(entry, subscriptions)
    return subscriptions
  }
  // The types require an object, by which a child's model is kept: only a cast, or a caller without TypeScript, gets a
  // primitive this far, which a `WeakMap` would refuse with a `TypeError`.
  const modelOf = (place: Place, entry: Entry) => {
    const { program } = childOf(place.name)
    const childState = entry.state
    if (!Predicate.isObjectKeyword(childState)) {
      const kind = childState === null || childState === undefined ? String(childState) : `a ${typeof childState}`
      throw defectAt(place, `The state of "${place.name}" is ${kind}, where a program keeps its state in an object`)
    }
    const kept = modelsOf(program)
    if (kept.has(childState)) return kept.get(childState)
    const model = program.makeModel(childState)
    kept.set(childState, model)
    return model
  }
  const there = (place: Place, entry: Opt.Option<Entry>): Entry =>
    Opt.getOrThrowWith(entry, () => defectAt(place, `The model of "${place.name}", which is not in this state`))
  const modelsFor = (state: unknown): unknown => {
    if (!composed) return {}
    const slots = (state as Kept<unknown, Slots>).children
    return mapOwn(programs, (child, name) =>
      child.kind === "byId"
        ? (id: unknown) => modelOf({ name, id }, there({ name, id }, entryAt(slots, { name, id })))
        : child.there === "always"
        ? () =>
          modelOf({ name, id: undefined }, there({ name, id: undefined }, entryAt(slots, { name, id: undefined })))
        : () => Opt.map(entryAt(slots, { name, id: undefined }), (entry) => modelOf({ name, id: undefined }, entry)))
  }
  const ownOf = (state: unknown) => composed ? (state as Kept<unknown, unknown>).own : state
  const ownExternal = config.external
  const placer: Placer = (own, states) => {
    const gathered: Gathered = { own, starts: 0, children: empty, commands: [], events: [] }
    reconcile(gathered, Opt.none())
    for (const name of Object.keys(states)) {
      if (!Object.hasOwn(programs, name)) throw new Error(`stateOf: "${name}" is no child`)
      const given = states[name]
      const places: ReadonlyArray<readonly [Place, unknown]> = isById(name)
        ? Arr.map(
          Arr.fromIterable(given as Iterable<readonly [unknown, unknown]>),
          ([id, childState]) => [{ name, id }, childState] as const
        )
        : [[{ name, id: undefined }, given]]
      for (const [place, childState] of places) {
        const entry = Opt.getOrThrowWith(
          entryAt(gathered.children, place),
          () => new Error(`stateOf: a state for "${name}", which the parent's state does not list`)
        )
        putAt(gathered, place, { ...entry, state: childState })
      }
    }
    return { own: gathered.own, starts: gathered.starts, children: gathered.children }
  }
  return {
    init: typeof config.init === "function"
      ? (flags: unknown) => begin((config.init as (flags: unknown) => Step<unknown, unknown>)(flags))
      : begin(config.init),
    update,
    runCommand: (command: unknown): Execution<unknown, unknown> => {
      const place = placeOf(command)
      if (isChildName(place.name)) {
        const childCommand = field(command, "command")
        // Unreachable through the types: `child` and `childById` ask for a `runCommand` whenever the child has
        // commands. Read as it is, not through `runCommandOf`, whose stand-in, `absurd`, would die of an error of its
        // own: a child that has none is a `CompositionDefect` that names it.
        const run = (childOf(place.name).program as Readonly<{ runCommand?: RunCommand<unknown, unknown, unknown> }>)
          .runCommand
        if (run === undefined) {
          const on = describeByTag(childCommand)
          throw defectAt(place, `The command ${String(on)} of "${place.name}", which has no runCommand`, on)
        }
        return Effect.map(run(childCommand), Opt.map(wrapMessage(place, field(command, "instance") as number)))
      }
      // Unreachable through the types: `runCommand` is required whenever the program has commands of its own.
      if (config.runCommand === undefined) throw new Error("make: a command of its own, and no runCommand")
      return config.runCommand(command)
    },
    // A child's keys are under its name, its id and its instance, so two children never clash: only an own key
    // shaped like one of theirs could, and would silently take the child's place. Built in place: a list of a
    // thousand children makes a thousand keys on every change of state.
    subscriptions: (state: unknown) => {
      const own = config.subscriptions?.(ownOf(state)) ?? HashMap.empty<unknown, Subscription<unknown, unknown>>()
      if (!composed) return own
      const whole = state as Kept<unknown, Slots>
      return HashMap.mutate(own, (keyed) => {
        const listen = (place: Place, entry: Entry) => {
          const { listening } = childOf(place.name)
          if (
            listening !== undefined && !(isById(place.name) ? listening(whole.own, place.id) : listening(whole.own))
          ) {
            return
          }
          for (const [key, subscription] of liftedAt(place, entry)) {
            if (HashMap.has(own, key)) {
              throw defectAt(place, `An own subscription key is the key of a subscription of "${place.name}"`)
            }
            HashMap.set(keyed, key, subscription)
          }
        }
        for (const name of names) {
          const slot = whole.children[name] as Slot
          if (isById(name)) {
            for (const [id, entry] of slot as HashMap.HashMap<unknown, Entry>) listen({ name, id }, entry)
          } else if (Opt.isSome(slot as Opt.Option<Entry>)) {
            listen({ name, id: undefined }, (slot as Opt.Some<Entry>).value)
          }
        }
      })
    },
    makeModel: (state: unknown) => config.makeModel(ownOf(state), modelsFor(state)),
    // Only where the program has external messages, as `Program` writes it.
    ...(ownExternal === undefined ? {} : {
      external: (message: unknown) => (state: unknown) => {
        if (!composed) return ownExternal(message)(state)
        const gathered = open(state)
        ownStep(gathered, ownExternal(message)(gathered.own))
        return close(gathered, state)
      }
    }),
    ...(composed ? { [statesKey]: placer } : {})
  }
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
  /** Its own state, an object. */
  state: object
  /** What its view draws. Inferred from `makeModel` when it is not named. */
  model?: unknown
  /** Its own messages, those its `update` takes, if it has any: a program that names none has no `update`. */
  message?: unknown
  /** Its own commands, if it has any. */
  command?: unknown
  /** The events it raises, if it raises any. */
  event?: unknown
  /** The messages a parent of its own may send it, if any: what its `external` takes. */
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
 * A child is any program. A parent declares its children with `withChildren`, before `make`. The parent's own state
 * says which children are there, and the library keeps them: it starts a child that the state lists anew, with its
 * first commands, and drops one that the state no longer lists. A parent and its children talk only through events and
 * external messages: a step of the parent's own lists what it tells its children in `tell`. The parent's messages,
 * commands and subscriptions are its own, plus each child's, wrapped. The parent's messages also include the writes into
 * each input:
 *
 * - a message as `{ _tag: <child>, message }`, and a write as `{ _tag: <input>, message }`;
 * - a command as `{ _tag: <child>, instance, command }`, run by the child's `runCommand`, whose answer names the
 *   `instance` too;
 * - a subscription under the key `[<child>, instance, key]`.
 *
 * For children and inputs by id, each of these also carries the `id`: a key is then `[<child>, id, instance, key]`. A
 * message of the parent's own that can take the name of a child or of an input does not compile, as one tagged
 * `string` can. A key of the parent's own subscriptions that is the key of a child's subscription is a defect, a
 * `CompositionDefect`.
 *
 * @returns `child` and `childById`, which declare a child alone and children by id, `withChildren`, which takes the
 * children of a parent, `input` and `inputById`, which declare an input alone and inputs by id, and `make`, which
 * makes a program without children.
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
 * const { child, withChildren } = program<{ state: State }>()
 *
 * const app = withChildren({ Clock: child(clock) }).make({
 *   init: { state: {} },
 *   makeModel: (state, children) => ({ clock: children.Clock() }),
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
 */
export const program = <T extends DeclaredTypes>(): ProgramMaker<T> =>
  ({
    child: (
      program: AnyProgram,
      place: Readonly<{
        flags?: (state: unknown) => Opt.Option<unknown>
        there?: (state: unknown) => boolean
        key?: (state: unknown) => unknown
        listening?: (state: unknown) => boolean
      }> = {}
    ) => {
      const { flags, key, listening, there } = place
      const keyed = key === undefined ? () => present : (state: unknown) => Opt.some(key(state))
      return {
        kind: "one",
        program,
        there: flags === undefined && there === undefined ? "always" : "sometimes",
        key: flags ?? (there === undefined ? keyed : (state: unknown) => there(state) ? keyed(state) : Opt.none()),
        ...(listening === undefined ? {} : { listening })
      }
    },
    childById: (
      program: AnyProgram,
      place: Readonly<{
        ids?: (state: unknown) => Iterable<unknown>
        flags?: (state: unknown) => Iterable<readonly [unknown, unknown]>
        listening?: (state: unknown, id: unknown) => boolean
      }>
    ) => ({
      kind: "byId",
      program,
      listed: place.flags ?? place.ids,
      flagged: place.flags !== undefined,
      ...(place.listening === undefined ? {} : { listening: place.listening })
    }),
    input: (place: Placement<unknown, unknown>) => ({ kind: "one", ...placed(place) }),
    inputById: (place: PlacementById<unknown, unknown, unknown>) => ({ kind: "byId", ...placedById(place) }),
    make: (config: UntypedConfig) => make(undefined, config),
    withChildren: (children: Readonly<Record<string, UntypedChild>>) => ({
      make: (config: UntypedConfig) => make(children, config)
    })
  }) as unknown as ProgramMaker<T>

// A type `T` names is checked, `never` too; one it does not name is inferred.
type Named<T, K extends "model", Inferred> = T extends { readonly [P in K]: infer V } ? V : Inferred

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
   * Declares a child alone.
   *
   * - `child(program)` is always there, and so is `child(program, { key })`, which starts again where `key` gives
   *   another value, compared with `Equal`.
   * - `child(program, { there })` is there in the states where `there` holds, and `key` may be given beside it.
   * - A child with flags is there where `flags` gives `Some`, and starts from them. Other flags start it again.
   * - `listening` says in which states its subscriptions run. Without it, they run whenever the child is there.
   *
   * @param program - The child.
   * @param place - When the child is there, what it starts from, and when it listens: functions of the parent's own
   * state.
   * @returns The child, for `withChildren`.
   *
   * @example
   * ```ts
   * About: child(about, { flags: (state) => state.about }),
   * ```
   *
   * @see The guide, "Composition", "Declaring children".
   * @see The guide, "Composition", "When the child is not there".
   * @see The guide, "Composition", "A child with `flags`".
   */
  readonly child: DeclareChild<T>
  /**
   * Declares children told apart by an id, such as the rows of a list, each with a state of its own.
   *
   * - `ids` lists the ids of the children that are there. For a program with flags, `flags` lists each id with its
   *   flags, and other flags start the child again.
   * - `children.Row(id)` is a row's model, and `forwardTo(dispatch, 'Row', id)` is the row's dispatch.
   * - Ids are compared by value, with `Equal`. An id listed twice is a defect, a `CompositionDefect`.
   *
   * @param program - The program of each child.
   * @param place - The ids of the children in a state, and `listening`, which says whether the child at an id listens.
   * @returns The children, for `withChildren`.
   *
   * @example
   * ```ts
   * Row: childById(row, { ids: (state) => state.ids }),
   * ```
   *
   * @see The guide, "Composition", "Children by id".
   * @see The guide, "Composition", "Ids are compared by value".
   */
  readonly childById: DeclareChildById<T>
  /**
   * Takes the children of a parent, by name, and gives the `make` of the parent.
   *
   * They are declared before the rest, so that what a step tells them is typed by them.
   *
   * @param children - The children, by name: `{ Clock: child(…), Row: childById(…) }`.
   * @returns `make`, which makes the parent.
   *
   * @example
   * ```ts
   * export const app = withChildren({ Clock: child(clock) }).make({
   *   init: { state: {} },
   *   makeModel: (state, children) => ({ clock: children.Clock() }),
   * })
   * ```
   *
   * @see The guide, "Composition", "Declaring children".
   */
  readonly withChildren: DeclareChildren<T>
  /**
   * Declares an input: a place of the program's state that the view writes into.
   *
   * An input is not a child. The input's value is part of the program's own state. The program's `update` and
   * `makeModel` read that value like the rest of the state. The view writes what the element holds,
   * `{ _tag: 'Written', value }`, through `forwardTo(dispatch, 'Name')`.
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
   * @see The guide, "Inputs", "The view writes what the element holds".
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
   * @see The guide, "Inputs", "A write into an input by id names its id".
   */
  readonly inputById: DeclareInputById<T>
  /**
   * Makes a program without children from its pieces, and from the inputs it declares.
   *
   * A model named in `program` is checked against `makeModel`, and a model not named is inferred from it. `update`
   * may reject the program's own messages, as any `update` does. `external` never rejects. The program's commands need
   * the services of its `runCommand`, and its subscriptions the services of its `subscriptions`. Nothing names these
   * services: they are inferred.
   *
   * @param config - Its `init` and `makeModel`, its `update`, `external`, `runCommand` and `subscriptions` where it
   * has them, and its `inputs`.
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

/** When a child's subscriptions run, among the states where it is there. Without it, in all of them. */
type Listening<State> = Readonly<{ listening?: (state: State) => boolean }>

// A child with flags is declared with them. On the place, and not on the program: inferred from `P & …`, `P` would
// lose the name `Program<…>`, as `CheckedChild` says.
type AlwaysPlace<State, P> = [FlagsOf<P>] extends [never] ? [
    place?:
      & Readonly<{
        /** What the child starts from in a state: another value, by `Equal`, starts it again. */
        key?: (state: State) => unknown
        there?: never
        flags?: never
      }>
      & Listening<State>
      & ObjectState<StateOf<P>>
  ]
  : [place: { readonly "a child with flags is declared with its flags": FlagsOf<P> }]

/** The states where a child that may not be there is there, and what it starts from. */
type SometimesPlace<State, P> = [FlagsOf<P>] extends [never] ? Readonly<{
    /** Whether the child is there in a state. */
    there: (state: State) => boolean
    /** What the child starts from in a state where it is there: another value, by `Equal`, starts it again. */
    key?: (state: State) => unknown
    flags?: never
  }>
  : Readonly<{
    /** The child's flags in the states where it is there, `None` in the others: other flags start it again. */
    flags: (state: State) => Opt.Option<FlagsOf<P>>
    there?: never
    key?: never
  }>

// Two forms, and no conditional type over them: an `Id` inferred from `ids` reaches `listening`, beside it in the same
// object, only through types that hold it as they are.
type IdsPlace<State, Id> = Readonly<{
  /** The ids of the children that are there. */
  ids: (state: State) => Iterable<Id>
  /** Whether the child at an id listens. Without it, every child does. */
  listening?: (state: State, id: Id) => boolean
  flags?: never
}>

type FlagsPlace<State, Id, Flags> = Readonly<{
  /** The ids of the children that are there, each with its flags: other flags start the child again. */
  flags: (state: State) => Iterable<readonly [Id, Flags]>
  /** Whether the child at an id listens. Without it, every child does. */
  listening?: (state: State, id: Id) => boolean
  ids?: never
}>

/** A program with flags is declared with them, and one without is declared without. */
type FlagsChecked<P, Flagged extends boolean> = [FlagsOf<P>] extends [never]
  ? Flagged extends true ? { readonly "a child without flags is declared with its ids": never } : unknown
  : Flagged extends true ? unknown
  : { readonly "a child with flags is declared with its flags": FlagsOf<P> }

/**
 * The function of `program` that declares a child alone: always there, or there in the states its place says.
 *
 * @see The guide, "Composition", "Declaring children".
 */
export type DeclareChild<T extends DeclaredTypes> = {
  <P extends AnyProgram>(
    program: CheckedChild<P>,
    ...place: AlwaysPlace<Field<T, "state">, P>
  ): Child<Field<T, "state">, P, "always">
  <P extends AnyProgram>(
    program: CheckedChild<P>,
    place: SometimesPlace<Field<T, "state">, P> & Listening<Field<T, "state">> & ObjectState<StateOf<P>>
  ): Child<Field<T, "state">, P, "sometimes">
}

/**
 * The function of `program` that declares children told apart by an id.
 *
 * @see The guide, "Composition", "Children by id".
 */
export type DeclareChildById<T extends DeclaredTypes> = {
  <Id, P extends AnyProgram>(
    program: CheckedChild<P>,
    place: IdsPlace<Field<T, "state">, Id> & FlagsChecked<P, false> & ObjectState<StateOf<P>>
  ): ChildById<Field<T, "state">, Id, P>
  <Id, P extends AnyProgram>(
    program: CheckedChild<P>,
    place: FlagsPlace<Field<T, "state">, Id, FlagsOf<P>> & FlagsChecked<P, true> & ObjectState<StateOf<P>>
  ): ChildById<Field<T, "state">, Id, P>
}

/**
 * The function of `program` that takes a parent's children, and gives its `make`.
 *
 * @see The guide, "Composition", "Declaring children".
 */
export type DeclareChildren<T extends DeclaredTypes> = <C extends Children<Field<T, "state">>>(
  children: C
) => ParentMaker<T, C>

/**
 * What `withChildren` returns: the `make` of a parent of these children.
 *
 * @see The guide, "Composition", "Declaring children".
 */
export interface ParentMaker<T extends DeclaredTypes, C extends Children<Field<T, "state">>> {
  /**
   * Makes the parent from its pieces, and from its children and the inputs it declares.
   *
   * - The parent's functions are given its own state alone. Its state is that state, and the children that the library
   *   keeps.
   * - A step of the parent's own lists in `tell` the external messages it gives its children. Each is given once the
   *   step is taken and its children are there, in order.
   * - `init` is a step of the parent's own: the library starts the children that its state lists.
   *
   * @param config - Its `init` and `makeModel`, its `update`, `external`, `runCommand`, `subscriptions` and `onEvent`
   * where it has them, and its `inputs`.
   * @returns The parent, which runs alone or as a child of another.
   *
   * @example
   * ```ts
   * withChildren({ Row: childById(row, { ids: (state) => state.ids }) }).make({
   *   init: { state: { ids: [] } },
   *   update: () => (state) => ({ state, tell: state.ids.map((id) => ({ _tag: 'Row', id, message: Cleared() })) }),
   *   makeModel: (state, children) => ({ rows: state.ids.map((id) => children.Row(id)) }),
   * })
   * ```
   *
   * @see The guide, "Composition", "The parent's own messages, commands and subscriptions".
   * @see The guide, "Events and external messages", "A parent sends an external message".
   */
  readonly make: MakeParent<T, C>
}

/**
 * The function of `program` that declares an input.
 *
 * @see The guide, "Composition", "The parent's inputs".
 */
export type DeclareInput<T extends DeclaredTypes> = <A>(
  place: Placement<Field<T, "state">, A>
) => Input<Field<T, "state">, A>

/**
 * The function of `program` that declares inputs told apart by an id.
 *
 * @see The guide, "Inputs", "A write into an input by id names its id".
 */
export type DeclareInputById<T extends DeclaredTypes> = <Id, A>(
  place: PlacementById<Field<T, "state">, Id, A>
) => InputById<Field<T, "state">, Id, A>

/**
 * The function of `program` that makes a program without children from its pieces.
 *
 * A state whose type has no fields, such as `{}`, does not compile, since such a type holds a number too: name it
 * `object`.
 *
 * @see The guide, "Composition", "The parent's own messages, commands and subscriptions".
 * @see The guide, "Anatomy of a program", "What does not compile".
 */
export type MakeProgram<T extends DeclaredTypes> = <
  Model,
  I extends Inputs<Field<T, "state">> = None,
  Ran = never,
  Heard = never,
  K = unknown
>(
  // The inputs are inferred from where they are declared alone.
  config:
    & Config<
      Field<T, "state">,
      None,
      NoInfer<I>,
      Field<T, "message">,
      Field<T, "command">,
      Field<T, "event">,
      Named<T, "model", Model>,
      Ran,
      Heard,
      K,
      Field<T, "external">,
      Field<T, "flags">
    >
    & Readonly<{ inputs?: I }>
    // On the config, as for a program written by hand: the program `make` returns carries the marker of `Program`,
    // which the check of `run` and of the testing tools asks for, so a state that holds a number would get past them.
    // A state that is a type parameter stays deferred here, and does not compile (`docs/rejected.md`).
    & ObjectState<Field<T, "state">>
) => Program<
  Present<{
    state: Field<T, "state">
    model: Named<T, "model", Model>
    message: Field<T, "message"> | InputMessages<I>
    command: Field<T, "command">
    commandServices: RanServices<Ran>
    subscriptionServices: HeardServices<Heard>
    event: Field<T, "event">
    external: Field<T, "external">
    flags: Field<T, "flags">
  }>
>

/**
 * The function of `withChildren` that makes a parent from its pieces.
 *
 * @see The guide, "Composition", "The parent's own messages, commands and subscriptions".
 * @see The guide, "Anatomy of a program", "What does not compile".
 */
export type MakeParent<T extends DeclaredTypes, C extends Children<Field<T, "state">>> = <
  Model,
  I extends Inputs<Field<T, "state">> = None,
  Ran = never,
  Heard = never,
  K = unknown
>(
  // The children are fixed by `withChildren`, so that nothing of what a step tells them is inferred here: a literal
  // in a `tell` would otherwise lose its tags (`_tag: string`), and need `as const`.
  config:
    & Config<
      Field<T, "state">,
      C,
      NoInfer<I>,
      Field<T, "message">,
      Field<T, "command">,
      Field<T, "event">,
      Named<T, "model", Model>,
      Ran,
      Heard,
      K,
      Field<T, "external">,
      Field<T, "flags">
    >
    & Readonly<{ inputs?: I }>
    & ObjectState<Field<T, "state">>
) => Program<
  Present<{
    state: Kept<Field<T, "state">, KeptOf<C>>
    model: Named<T, "model", Model>
    message: Field<T, "message"> | ChildMessages<C> | InputMessages<I>
    command: Field<T, "command"> | ChildCommands<C>
    commandServices: Needs<RanServices<Ran>, ChildCommandServices<C>>
    subscriptionServices: Needs<HeardServices<Heard>, ChildSubscriptionServices<C>>
    event: Field<T, "event">
    external: Field<T, "external">
    flags: Field<T, "flags">
  }>
>

// What the parent's own pieces and its children need together. As a plain union in `MakeParent`, a child that needs
// `unknown` beside own pieces that need nothing gave `never`, with TypeScript 7.0.2: `unknown` is read first, apart.
type Needs<Own, Children> = unknown extends Children ? unknown : unknown extends Own ? unknown : Own | Children

// The types the program names, and only those: one it does not name would print as `never` in every hover and
// declaration of the program. `state`, `model` and `message` stay, `never` too (a program with no messages); `Extract`
// shows `Program` the fields it asks for, which a mapped type with `as` hides from it. Without it, the smoke test's
// consumer names 39 types of its programs as `never`.
type Present<T> = Extract<
  { [K in keyof T as K extends "state" | "model" | "message" ? K : [T[K]] extends [never] ? never : K]: T[K] },
  { state: object; model: unknown; message: unknown }
>
