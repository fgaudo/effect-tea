// A parent declares its children, and the library generates how their messages, commands, subscriptions and models
// reach them. The parent's state says which children are there, and the library keeps them, in the state of the
// composed program, beside the parent's own: it starts and drops them after each step of the parent's own code.
import * as Arr from "effect/Array"
import * as Channel from "effect/Channel"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as HashMap from "effect/HashMap"
import * as Opt from "effect/Option"
import * as Predicate from "effect/Predicate"
import type { Execution, RunCommand } from "./command.ts"
import { compositionDefect } from "./defect.ts"
import { describeByTag } from "./log.ts"
import {
  type AnyProgram,
  type CommandOf,
  type CommandServicesOf,
  type EventOf,
  type ExternalOf,
  type Field,
  type FlagsOf,
  type Init,
  type KeyOf,
  type MessageOf,
  type ModelOf,
  type OutputOf,
  type Program,
  startOf,
  type StateOf,
  type SubscriptionServicesOf,
  type WithListen,
  type WithRunCommand
} from "./program.ts"
import type { Listen, Subscription } from "./subscription.ts"
import { reject, type Rejected, type Step, type Transition } from "./update.ts"

// A child is checked as a program of the types read back from it: a child written as an object, and not typed
// `Program<…>`, is checked by nothing else. So its `external` answers with a step, never `reject`, its `output` reads
// its own state, and its `runCommand` is there when its steps list commands, `external`'s included. Kept to this
// module, as the `Shape` of `Program` is to its own: a consumer's declarations spell it out.
type ProgramChecked<P> = Program<{
  state: StateOf<P>
  model: ModelOf<P>
  message: MessageOf<P>
  command: CommandOf<P>
  commandServices: CommandServicesOf<P>
  subscriptionServices: SubscriptionServicesOf<P>
  event: EventOf<P>
  external: ExternalOf<P>
  flags: FlagsOf<P>
  output: OutputOf<P>
  key: KeyOf<P>
}>

// What a child lacks for that check, `unknown` where it lacks nothing. A child that runs commands has a `runCommand`, a
// member, for the error that names it; `WithRunCommand` is `object` for one that runs none, and `unknown` is needed
// instead: see `CheckedChild`. The rest of the check is held under a key no program has: as members, its types, read
// from a `P` not inferred yet, would type the functions of a child written in the call, and its `listen` would make
// subscriptions of `unknown` messages.
type Lacking<P> = P extends ProgramChecked<P> ? unknown
  :
    & ([CommandOf<P>] extends [never] ? unknown : WithRunCommand<CommandOf<P>, unknown, unknown>)
    & ([KeyOf<P>] extends [never] ? unknown : WithListen<KeyOf<P>, unknown, unknown>)
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
 * @see The guide, "Composition".
 */
export type Instance<State> = {
  /** The number of this start, among the starts of the parent's children: no other instance of the parent has it. */
  readonly instance: number
  /**
   * What the parent's state gave as the child started: the child's flags, or what the `key` of its declaration gave.
   * Another one starts another child.
   */
  readonly key: unknown
  /** The child's state. */
  readonly state: State
}

/**
 * The state of a parent: its own state, and the children that the library keeps for it.
 *
 * The parent's functions are given its own state alone. A test makes a whole state with `stateOf`, of
 * `@fgaudo/effect-tea/testing`, or by folding messages from `init`. What a parent does with a state written by hand
 * that does not hold the children its own state lists is unspecified.
 *
 * @see The guide, "Composition".
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
 * - Another value of `key`, or other flags, start the child again, as another instance.
 *
 * @example
 * ```ts
 * export const clock: Child<State, typeof Clock.clock, 'always'> = child(Clock.clock)
 * ```
 *
 * @see The guide, "Composition".
 */
export type Child<State, P, There extends "always" | "sometimes"> = {
  /** A child alone, not one of children by id. */
  readonly kind: "one"
  /** The child's program. */
  readonly program: P
  /** Whether the child is there in every state of its parent. */
  readonly there: There
  /**
   * What a state gives the child as it starts: its flags, or what the `key` of its declaration gives. `None` where the
   * child is not there.
   */
  readonly key: (state: State) => Opt.Option<unknown>
  /** Whether the child's subscriptions run in a state where it is there. Without it, they always run. */
  readonly listening?: (state: State) => boolean
  /** What the child is told in a state: as it starts, and so that it was last told what its parent's state gives. */
  readonly tell?: (state: State) => ExternalOf<P>
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
 * @see The guide, "Composition".
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
  /**
   * What each child is told in a state, one value for them all: as it starts, and so that it was last told what its
   * parent's state gives.
   */
  readonly tell?: (state: State) => ExternalOf<P>
}

/** No children: what a program that declares none has. */
type None = Readonly<Record<never, never>>

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
      tell?: (state: State) => unknown
    }>
    | Readonly<{
      kind: "byId"
      program: AnyProgram
      listed: (state: State) => Iterable<unknown>
      flagged: boolean
      listening?: (state: State, id: never) => boolean
      tell?: (state: State) => unknown
    }>
  >
>

type ProgramOf<C> = C extends { readonly program: infer P } ? P : never

// Told by `kind` and the id `listening` takes, which the type declares whether or not the child has one.
type ChildByIdOf<Id, P> = Readonly<{ kind: "byId"; program: P; listening?: (state: any, id: Id) => boolean }>

/**
 * Where a child's messages and commands, and the keys of its subscriptions, carry its id: only for children by id.
 */
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

/**
 * A key of a child's subscriptions, as its parent lists it: it names the instance that listens, as a child's command
 * does.
 */
type ChildKeys<C> = {
  [K in keyof C & string]: [KeyOf<ProgramOf<C[K]>>] extends [never] ? never
    : Readonly<{ _tag: K; instance: number; key: KeyOf<ProgramOf<C[K]>> }> & At<C[K]>
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
type HeardServices<Heard> = Heard extends Subscription<any, infer R> ? R : never

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
 * - A child that declares an `output` gives it beside its model, read in the same way: `children.Row.output(id)`.
 *
 * A child's model is the same object while the child keeps the very same state. A child started again is another
 * instance, with a model of its own.
 *
 * @example
 * ```ts
 * makeModel: (state, children) => ({ clock: children.Clock() }),
 * ```
 *
 * @see The guide, "Composition".
 */
type Models<C> = {
  readonly [K in keyof C & string]:
    & (C[K] extends ChildByIdOf<infer Id, infer P> ? (id: Id) => ModelOf<P>
      : IsAlways<C[K]> extends true ? () => ModelOf<ProgramOf<C[K]>>
      : () => Opt.Option<ModelOf<ProgramOf<C[K]>>>)
    & ([OutputOf<ProgramOf<C[K]>>] extends [never] ? unknown : Readonly<{ output: ReadOutput<C[K]> }>)
}

/** How a parent reads a child's output: as its model, a value or an `Option`, by id for children by id. */
type ReadOutput<C> = C extends ChildByIdOf<infer Id, infer P> ? (id: Id) => OutputOf<P>
  : IsAlways<C> extends true ? () => OutputOf<ProgramOf<C>>
  : () => Opt.Option<OutputOf<ProgramOf<C>>>

/**
 * The outputs of the children that declare one, by name: `children` in a parent's `update`, `external`, `onEvent` and
 * `output`. It holds no model, and no child without `output`.
 *
 * @example
 * ```ts
 * update: (message, children) => (state) => ({ state: { ...state, running: children.Clock.output() } }),
 * ```
 *
 * @see The guide, "Events and external messages".
 */
type Outputs<C> = {
  readonly [K in keyof C & string as [OutputOf<ProgramOf<C[K]>>] extends [never] ? never : K]: Readonly<{
    output: ReadOutput<C[K]>
  }>
}

/** What a parent's functions take last: its children's outputs. A program without children takes nothing more. */
type Reading<C> = [keyof C] extends [never] ? [] : [children: Outputs<C>]

type OnEvents<State, C, Command, Event> = {
  readonly [K in keyof C & string as [EventOf<ProgramOf<C[K]>>] extends [never] ? never : K]: C[K] extends
    ChildByIdOf<infer Id, infer P> ?
    (id: Id, event: EventOf<P>, ...children: Reading<C>) => (state: State) => Step<State, Command, Event, Tells<C>>
    : (
      event: EventOf<ProgramOf<C[K]>>,
      ...children: Reading<C>
    ) => (state: State) => Step<State, Command, Event, Tells<C>>
}

/** `onEvent` is required exactly when a child emits events, so that none goes unhandled. */
type OnEventOf<State, C, Command, Event> = [keyof OnEvents<State, C, Command, Event>] extends [never] ? Readonly<{
    /**
     * What the parent does with each child's events, by child: one handler for each child that has events.
     *
     * It is required exactly when a child has events. A handler takes the event, and returns the parent's step as a
     * function of its own state. For children by id, it takes the id first. It takes the children's outputs last, as
     * the child's step left them. A handler is pure, as `update` is: it runs in the parent's `update`.
     *
     * Its step has no `reject`, which would take back the child's step: a handler that does not apply answers
     * `{ state }`, and adds nothing to the child's step. Where that step kept the child's state too, the parent's
     * state is the very same.
     *
     * @see The guide, "Events and external messages".
     * @see The guide, "Guarantees".
     */
    onEvent?: OnEvents<State, C, Command, Event>
  }>
  : Readonly<{
    /**
     * What the parent does with each child's events, by child: one handler for each child that has events.
     *
     * It is required exactly when a child has events. A handler takes the event, and returns the parent's step as a
     * function of its own state. For children by id, it takes the id first. It takes the children's outputs last, as
     * the child's step left them. A handler is pure, as `update` is: it runs in the parent's `update`.
     *
     * Its step has no `reject`, which would take back the child's step: a handler that does not apply answers
     * `{ state }`, and adds nothing to the child's step. Where that step kept the child's state too, the parent's
     * state is the very same.
     *
     * @see The guide, "Events and external messages".
     * @see The guide, "Guarantees".
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
     * children what to do in `tell`. A parent takes its children's outputs last, as they were before the step.
     *
     * @see The guide, "Anatomy of a program".
     */
    update: (message: Own, ...children: Reading<C>) => (state: State) => Transition<State, Command, Event, Tells<C>>
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
     * message on to a child in the `tell` of its step, and takes its children's outputs last, as they were before the
     * step.
     *
     * @see The guide, "Events and external messages".
     */
    external: (message: External, ...children: Reading<C>) => (state: State) => Step<State, Command, Event, Tells<C>>
  }>

/** `output` is required exactly when the program names an output, and refused when it names none. */
type OutputHandlerOf<State, C, Output> = [Output] extends [never] ? Readonly<{ output?: never }>
  : Readonly<{
    /**
     * What the program's parent reads of it: a value of its state, as whether a stopwatch runs.
     *
     * It is required exactly when the program names an `output`, in `program`. A parent reads it as
     * `children.Row.output(id)`, in its `update`, `external`, `onEvent`, `makeModel` and `output`. An event says that
     * something happened, and an output says what holds in a state. A parent's own `output` takes its children's
     * outputs last.
     *
     * @see The guide, "Anatomy of a program".
     * @see The guide, "Events and external messages".
     */
    output: (state: State, ...children: Reading<C>) => Output
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
     * @see The guide, "Composition".
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

/** An own message or command that can take the name of a child would be routed to it: it does not compile. */
type NoClash<Own, OwnCommand, C> =
  & ([TagsTaken<Own, keyof C & string>] extends [never] ? unknown
    : { readonly "an own message takes the name of a child": TagsTaken<Own, keyof C & string> })
  & ([TagsTaken<OwnCommand, keyof C & string>] extends [never] ? unknown
    : { readonly "an own command takes the name of a child": TagsTaken<OwnCommand, keyof C & string> })

/** An own key that can take the name of a child would be listened to as the child's: it does not compile. */
type NoKeyClash<OwnKey, C> = [TagsTaken<OwnKey, keyof C & string>] extends [never] ? unknown
  : { readonly "an own key takes the name of a child": TagsTaken<OwnKey, keyof C & string> }

/** `subscriptions` and `listen` are required exactly when the program names keys of its own. */
type ListenOf<State, OwnKey, Message, Heard> = [OwnKey] extends [never]
  ? Readonly<{ subscriptions?: never; listen?: never }>
  : Readonly<{
    /** The keys the program listens to in a state, as data, from its own state. */
    subscriptions: (state: State) => ReadonlyArray<OwnKey>
    /**
     * Makes the subscription of one of the program's own keys, from the key alone. It sends messages of the program's
     * own, as a command answers with one: to tell a child something, a step lists it in `tell`.
     */
    listen: (key: OwnKey) => Heard & Subscription<Message, any>
  }>

type Config<State, C, Own, OwnCommand, Event, Model, Ran, Heard, OwnKey, External, Flags, Output> =
  & OnEventOf<State, C, OwnCommand, Event>
  & ListenOf<State, OwnKey, Own, Heard>
  & NoKeyClash<OwnKey, C>
  // A command's answer is an own message, as a subscription's is: a parent tells a child only in a step's `tell`.
  & RunCommandOf<OwnCommand, Own, Ran>
  & UpdateOf<State, C, Own, OwnCommand, Event>
  & ExternalHandlerOf<State, C, External, OwnCommand, Event>
  & OutputHandlerOf<State, C, Output>
  & NoClash<Own, OwnCommand, C>
  & Readonly<{
    /**
     * The first state and commands: a step, or, for a program with flags, the function that makes one from them.
     *
     * A parent's first step is of its own state. The library starts the children that this state lists, each with
     * its first commands. The step raises no events and lists no `tell`: a child is given what it starts from by its
     * flags, and is told what the `tell` of its declaration gives, once every child has its first commands. A
     * handler of `onEvent` that runs then raises no event of the parent's own: one is a `CompositionDefect`, which
     * names the child it answers. The program's own flags are declared with its other types, in `program`.
     *
     * A parent without flags starts its children as `make` makes it. So what a child's `init`, or a function of its
     * declaration, throws there, `make` throws. An id listed twice is one such case.
     *
     * @see The guide, "Composition".
     */
    init: Init<State, OwnCommand, Flags>
    /** What the program draws, from its own state and its children's models. */
    makeModel: (state: State, children: Models<C>) => Model
  }>

// The own enumerable string keys of a record alone, in the order of `Object.keys`, as the spread and `Object.hasOwn`
// of `make` read them: `Record.map` and `Record.keys` do not say which keys they visit.
const mapOwn = <A, B>(record: Readonly<Record<string, A>>, f: (value: A, name: string) => B): Record<string, B> =>
  Object.fromEntries(Object.entries(record).map(([name, value]) => [name, f(value, name)]))

/** Who receives what a child at `id` sends: `undefined` for a child that is alone. */
type Place = Readonly<{ name: string; id: unknown }>

type Entry = Instance<unknown>
type Slot = Opt.Option<Entry> | HashMap.HashMap<unknown, Entry>
type Slots = Readonly<Record<string, Slot>>

/**
 * The keys of a child's subscriptions as its parent lists them, `{ _tag: <child>, instance, key }`, with its `id` for a
 * child by id.
 */
type Lifted = ReadonlyArray<unknown>

// What one call of `update`, `external`, `init` or `stateOf` gathers: the parts of the state as they are replaced, and
// the commands and the events of every step taken in it. It never leaves the call.
type Gathered = {
  own: unknown
  starts: number
  children: Slots
  readonly commands: Array<unknown>
  readonly events: Array<unknown>
  // The own state and the count of starts as the call began, `None` for a start, `init` or `stateOf`, and what the call
  // has told each instance from the declared `tell`, by the instance's number: see `sync`.
  readonly first: Opt.Option<unknown>
  readonly began: number
  readonly told: Map<number, unknown>
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
  tell?: (own: unknown) => unknown
}>

type UntypedConfig = Readonly<{
  init: Step<unknown, unknown> | ((flags: unknown) => Step<unknown, unknown>)
  update?: (message: unknown, children?: unknown) => (state: unknown) => UntypedStep | Rejected
  external?: (message: unknown, children?: unknown) => (state: unknown) => UntypedStep
  onEvent?: Readonly<Record<string, (...args: ReadonlyArray<unknown>) => (state: unknown) => UntypedStep>>
  runCommand?: (command: unknown) => Execution<unknown, unknown>
  subscriptions?: (state: unknown) => ReadonlyArray<unknown>
  listen?: Listen<unknown, unknown, unknown>
  makeModel: (state: unknown, children: unknown) => unknown
  output?: (state: unknown, children?: unknown) => unknown
}>

/** How `stateOf`, of the testing tools, reaches what `make` keeps to itself. */
export const statesKey = "~@fgaudo/effect-tea/Kept/place"

/** What a parent gives `stateOf`: the whole state made from an own state and the states given for its children. */
export type Placer = (own: unknown, states: Readonly<Record<string, unknown>>) => unknown

// The key of a child that is there with no flags and no key.
const present = Opt.some(undefined)

// What a program without subscriptions of its own listens to, and a step tells where it lists nothing.
const none: ReadonlyArray<unknown> = []

// The names that started no child.
const nothing: ReadonlySet<string> = new Set()

// One `make` for a program and for a parent: `children` is `undefined` for a program, whose state is its own alone.
const make = (children: Readonly<Record<string, UntypedChild>> | undefined, config: UntypedConfig): unknown => {
  const programs = children ?? {}
  const composed = children !== undefined
  const names = Object.keys(programs)
  const childOf = (name: string) => programs[name] as UntypedChild
  // `Object.hasOwn`, not `Record.has`, which does not say whether a key a record inherits (`toString`) counts.
  const isChildName = (tag: unknown): tag is string => typeof tag === "string" && Object.hasOwn(programs, tag)
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
  const wrapKey = (place: Place, instance: number) => (key: unknown) => ({
    _tag: place.name,
    ...at(place),
    instance,
    key
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
    return {
      own: whole.own,
      starts: whole.starts,
      children: whole.children,
      commands: [],
      events: [],
      first: Opt.some(whole.own),
      began: whole.starts,
      told: new Map()
    }
  }
  // What a start gathers: no child is there yet, and no child was told anything.
  const opening = (own: unknown, commands: Array<unknown>): Gathered => ({
    own,
    starts: 0,
    children: empty,
    commands,
    events: [],
    first: Opt.none(),
    began: 0,
    told: new Map()
  })
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
  // is pure, so the same object lists the same children, which the last reconciliation left there. It gives the names
  // that started a child.
  const reconcile = (gathered: Gathered, before: Opt.Option<unknown>): ReadonlySet<string> => {
    let started: Set<string> | undefined
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
          started = (started ?? new Set()).add(name)
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
            started = (started ?? new Set()).add(name)
          }
        }
      })
      if (!same || HashMap.size(next) !== HashMap.size(current)) {
        gathered.children = { ...gathered.children, [name]: next }
      }
    }
    return started ?? nothing
  }
  const onEventAt = (place: Place, event: unknown, slots: Slots): (state: unknown) => UntypedStep => {
    const handle = onEvents[place.name]
    if (handle === undefined) {
      const on = describeByTag(event)
      throw defectAt(place, `The child "${place.name}" emitted the event ${String(on)}, which nothing handles`, on)
    }
    return isById(place.name) ? handle(place.id, event, outputsOf(slots)) : handle(event, outputsOf(slots))
  }
  // A child's step: its state replaces the one kept, its commands are lifted, and each of its events is a step of the
  // parent's own, taken to its end before the next, whose handler reads the outputs of the children as they are then.
  // An unchanged child leaves its instance the very same object.
  const childStep = (gathered: Gathered, place: Place, entry: Entry, result: Step<unknown, unknown, unknown>) => {
    if (!Object.is(result.state, entry.state)) {
      putAt(gathered, place, { instance: entry.instance, key: entry.key, state: result.state })
    }
    for (const command of result.commands ?? []) gathered.commands.push(wrapCommand(place, entry.instance)(command))
    for (const event of result.events ?? []) {
      const handled = onEventAt(place, event, gathered.children)(gathered.own)
      // A start has no events: one that a handler raises there, in answer to what a child was told, has nowhere to go.
      if (Opt.isNone(gathered.first) && handled.events !== undefined && handled.events.length > 0) {
        const on = describeByTag(handled.events[0])
        throw defectAt(
          place,
          `The parent raised the event ${
            String(on)
          } for "${place.name}" as the program starts, where no step takes events`,
          on
        )
      }
      ownStep(gathered, handled)
    }
  }
  // A step of the parent's own code: its state, then the children that state lists, then what the declared `tell`
  // gives them, then what the step tells them, in order, each to its end. What the step tells is bound to the
  // children that are there once the step is reconciled: a child that is not there then is the step's own mistake, a
  // defect, and one that the declared `tell`, or an earlier item of the same `tell`, dropped or started again is told
  // nothing.
  const ownStep = (gathered: Gathered, step: UntypedStep) => {
    const before = gathered.own
    gathered.own = step.state
    for (const command of step.commands ?? []) gathered.commands.push(command)
    for (const event of step.events ?? []) gathered.events.push(event)
    const changed = !Object.is(step.state, before)
    const started = changed ? reconcile(gathered, Opt.some(before)) : nothing
    const tells = step.tell ?? none
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
    if (changed && tellers.length > 0) sync(gathered, Opt.some(before), started)
    for (const [place, instance, message] of bound) {
      const entry = entryAt(gathered.children, place)
      if (Opt.isNone(entry) || entry.value.instance !== instance) continue
      tellAt(gathered, place, entry.value, message)
    }
  }
  // Unreachable through the types: a child is told only what its `external` takes, `never` for one without.
  const tellAt = (gathered: Gathered, place: Place, entry: Entry, message: unknown) => {
    const answer = (childOf(place.name).program as Readonly<{
      external?: (message: unknown) => (state: unknown) => Step<unknown, unknown, unknown>
    }>).external
    if (answer === undefined) {
      const on = describeByTag(message)
      throw defectAt(place, `The external message ${String(on)} to "${place.name}", which has no external`, on)
    }
    childStep(gathered, place, entry, answer(message)(entry.state))
  }
  // What the declared `tell` gives the children: a child is told it as it starts, and again where it is another, by
  // `Equal`, than the last it was told, in the order of the names, then of the ids as the own state lists them, each to
  // its end, the value read from the own state as it is at the child's turn. No field of the state says what a child
  // was told. Between two calls every child was told what the own state gives, where this program made the state, and
  // `tell` is pure; within a call, `told` keeps it, and a child there as the call began was told what its first own
  // state gives. So a name whose value is equal to the one of the own state before the step, and that started no child,
  // is skipped, for two calls of `tell`: a child that an enclosing step of the call has not reached yet is told by it.
  const tellers = Arr.filter(names, (name) => childOf(name).tell !== undefined)
  const sync = (gathered: Gathered, before: Opt.Option<unknown>, started: ReadonlySet<string>) => {
    for (const name of tellers) {
      const child = childOf(name)
      const tell = child.tell as (own: unknown) => unknown
      if (!started.has(name) && Opt.isSome(before) && Equal.equals(tell(before.value), tell(gathered.own))) continue
      const ids: ReadonlyArray<unknown> = child.kind === "one"
        ? [undefined]
        : Arr.map(
          Arr.fromIterable((child.listed as (own: unknown) => Iterable<unknown>)(gathered.own)),
          (item) => child.flagged === true ? (item as readonly [unknown, unknown])[0] : item
        )
      const held = Opt.map(gathered.first, tell)
      // The last pair compared: the children of one name are most often told one value after one other.
      let compared: readonly [unknown, unknown, boolean] | undefined
      // The value of the own state as it is: read again only once a child's answer made the parent take a step.
      let read: readonly [unknown, unknown] | undefined
      for (const id of ids) {
        const place = { name, id }
        const entry = entryAt(gathered.children, place)
        if (Opt.isNone(entry)) continue
        const { instance } = entry.value
        if (read === undefined || !Object.is(read[0], gathered.own)) read = [gathered.own, tell(gathered.own)]
        const message = read[1]
        const last = gathered.told.has(instance)
          ? Opt.some(gathered.told.get(instance))
          : instance > gathered.began
          ? Opt.none()
          : held
        if (Opt.isSome(last)) {
          if (compared === undefined || compared[0] !== last.value || compared[1] !== message) {
            compared = [last.value, message, Equal.equals(last.value, message)]
          }
          if (compared[2]) continue
        }
        gathered.told.set(instance, message)
        tellAt(gathered, place, entry.value, message)
      }
    }
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
    if (config.update === undefined) return reject
    if (!composed) return config.update(message)(state)
    const gathered = open(state)
    const result = config.update(message, outputsOf(gathered.children))(gathered.own)
    if (result === reject) return reject
    ownStep(gathered, result)
    return close(gathered, state)
  }
  const empty: Slots = mapOwn(
    programs,
    (child): Slot => child.kind === "byId" ? HashMap.empty<unknown, Entry>() : Opt.none()
  )
  // A start tells each child it starts, once every child of the first state has its first commands.
  const begin = (step: Step<unknown, unknown>): Step<unknown, unknown> => {
    if (!composed) return step
    const gathered = opening(step.state, [...(step.commands ?? [])])
    reconcile(gathered, Opt.none())
    if (tellers.length > 0) sync(gathered, Opt.none(), nothing)
    return {
      state: { own: gathered.own, starts: gathered.starts, children: gathered.children },
      commands: gathered.commands
    }
  }
  // A child's keys, lifted under its instance: kept by the object that the library keeps the instance in, which is at
  // one place, and is replaced with the child's state. Only keys: a child's subscription is lifted where it starts.
  const lifted = new WeakMap<Entry, Lifted>()
  const liftedAt = (place: Place, entry: Entry): Lifted => {
    const found = lifted.get(entry)
    if (found !== undefined) return found
    const keys = Arr.map(
      childOf(place.name).program.subscriptions(entry.state) as ReadonlyArray<unknown>,
      wrapKey(place, entry.instance)
    )
    lifted.set(entry, keys)
    return keys
  }
  // A child's model, kept by its instance as its keys are: `makeModel` is pure, so the very same state has the very same
  // model. `has`, since a model may be `undefined`.
  const models = new WeakMap<Entry, unknown>()
  const modelOf = (place: Place, entry: Entry) => {
    if (models.has(entry)) return models.get(entry)
    const model = childOf(place.name).program.makeModel(entry.state)
    models.set(entry, model)
    return model
  }
  const there = (place: Place, entry: Opt.Option<Entry>, what: "model" | "output"): Entry =>
    Opt.getOrThrowWith(entry, () => defectAt(place, `The ${what} of "${place.name}", which is not in this state`))
  // A child's model or output, read from the children of `slots`: a value for a child that is always there, and for a
  // listed id, an `Option` for a child alone that may not be there.
  const readAt = (
    slots: Slots,
    name: string,
    what: "model" | "output",
    read: (place: Place, entry: Entry) => unknown
  ) =>
    childOf(name).kind === "byId"
      ? (id: unknown) => read({ name, id }, there({ name, id }, entryAt(slots, { name, id }), what))
      : childOf(name).there === "always"
      ? () =>
        read({ name, id: undefined }, there({ name, id: undefined }, entryAt(slots, { name, id: undefined }), what))
      : () => Opt.map(entryAt(slots, { name, id: undefined }), (entry) => read({ name, id: undefined }, entry))
  const outputOf = (place: Place, entry: Entry) =>
    (childOf(place.name).program as unknown as Readonly<{ output: (state: unknown) => unknown }>).output(entry.state)
  const readable = Arr.filter(
    names,
    (name) => typeof (childOf(name).program as Readonly<{ output?: unknown }>).output === "function"
  )
  // The outputs of the children of `slots`, which are replaced and never changed: a read is of the children as they
  // were when the parent's function was called, whenever it reads.
  const outputsOf = (slots: Slots): unknown =>
    Object.fromEntries(Arr.map(readable, (name) => [name, { output: readAt(slots, name, "output", outputOf) }]))
  const modelsFor = (state: unknown): unknown => {
    if (!composed) return {}
    const slots = (state as Kept<unknown, Slots>).children
    return mapOwn(programs, (_, name) => {
      const model = readAt(slots, name, "model", modelOf)
      return Arr.contains(readable, name)
        ? Object.assign(model, { output: readAt(slots, name, "output", outputOf) })
        : model
    })
  }
  const ownOf = (state: unknown) => composed ? (state as Kept<unknown, unknown>).own : state
  const ownExternal = config.external
  const ownOutput = config.output
  // The state that a start makes, each child told as it starts, then each state given put in place of its child's.
  const placer: Placer = (own, states) => {
    const gathered = opening(own, [])
    reconcile(gathered, Opt.none())
    if (tellers.length > 0) sync(gathered, Opt.none(), nothing)
    if (!Object.is(gathered.own, own)) {
      throw new Error("stateOf: a handler of onEvent gives another own state, in answer to what a child is told")
    }
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
    // A child's keys are under its name, its id and its instance, so two children never clash, and the types refuse an
    // own key that could take a child's name, as they refuse such a command.
    subscriptions: (state: unknown) => {
      const own = config.subscriptions?.(ownOf(state)) ?? none
      if (!composed) return own
      const whole = state as Kept<unknown, Slots>
      // The own keys first, then each child's, in the order the children are declared: a thousand children list a
      // thousand keys on every change of state, each made once for each state of its child.
      const keys: Array<unknown> = [...own]
      const listen = (place: Place, entry: Entry) => {
        const { listening } = childOf(place.name)
        if (listening !== undefined && !(isById(place.name) ? listening(whole.own, place.id) : listening(whole.own))) {
          return
        }
        for (const key of liftedAt(place, entry)) keys.push(key)
      }
      for (const name of names) {
        const slot = whole.children[name] as Slot
        if (isById(name)) {
          for (const [id, entry] of slot as HashMap.HashMap<unknown, Entry>) listen({ name, id }, entry)
        } else if (Opt.isSome(slot as Opt.Option<Entry>)) {
          listen({ name, id: undefined }, (slot as Opt.Some<Entry>).value)
        }
      }
      return keys
    },
    // A child's subscription is made from its own key, and lifted here, where it starts: once for each start, never
    // for each state.
    listen: (key: unknown): Subscription<unknown, unknown> => {
      const place = placeOf(key)
      if (isChildName(place.name)) {
        const childKey = field(key, "key")
        // Unreachable through the types: `child` and `childById` ask for a `listen` whenever the child lists keys.
        const listen = (childOf(place.name).program as Readonly<{ listen?: Listen<unknown, unknown, unknown> }>).listen
        if (listen === undefined) {
          throw defectAt(place, `A key of "${place.name}", which has no listen`)
        }
        const wrap = wrapMessage(place, field(key, "instance") as number)
        return listen(childKey).pipe(Channel.map(wrap), Channel.mapDone(wrap))
      }
      // Unreachable through the types: `listen` is required whenever the program has keys of its own.
      if (config.listen === undefined) throw new Error("make: a key of its own, and no listen")
      return config.listen(key)
    },
    makeModel: (state: unknown) => config.makeModel(ownOf(state), modelsFor(state)),
    // Only where the program has external messages, as `Program` writes it.
    ...(ownExternal === undefined ? {} : {
      external: (message: unknown) => (state: unknown) => {
        if (!composed) return ownExternal(message)(state)
        const gathered = open(state)
        ownStep(gathered, ownExternal(message, outputsOf(gathered.children))(gathered.own))
        return close(gathered, state)
      }
    }),
    // Only where the program names an output, as `Program` writes it.
    ...(ownOutput === undefined ? {} : {
      output: composed
        ? (state: unknown) => ownOutput(ownOf(state), outputsOf((state as Kept<unknown, Slots>).children))
        : (state: unknown) => ownOutput(state)
    }),
    ...(composed ? { [statesKey]: placer } : {})
  }
}

/**
 * What a program declares of itself, by name, for `program`: its state, and its own messages, commands, events,
 * external messages, flags, output and keys. Its model may be named too: a model named is checked, and one not named is
 * inferred.
 *
 * - Each is the program's own: what its children bring is added to it.
 * - The services are never named: they are inferred from `runCommand`, `listen` and the children.
 *
 * @see The guide, "Anatomy of a program".
 * @see The guide, "Composition".
 */
type DeclaredTypes = Readonly<{
  /** Its own state. */
  state: unknown
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
  /** What its parent reads of it, if anything: what its `output` returns. */
  output?: unknown
  /** What it listens to, as data, if anything: the keys of its own subscriptions, which its `listen` takes. */
  key?: unknown
}>

/**
 * The way to make a program: its types named once, then the functions that declare its children, and `make`, which
 * makes it.
 *
 * Naming the types first lets `update`, `makeModel` and the rest be typed without annotations. The types also say
 * the program's own messages, commands, events, external messages, flags and keys. A type that the program does not
 * name is a type that the program does not have: a program that names no messages has no `update`, and a step that
 * raises an event that the program does not name does not compile. The model may be named too. A model that is named
 * is checked, and a model that is not named is inferred. The services are never named: they are inferred.
 *
 * A child is any program. A parent declares its children with `withChildren`, before `make`. The parent's own state
 * says which children are there, and the library keeps them. A parent and its children talk only through events,
 * external messages and outputs: a parent is given no child's state. The parent's messages, commands and
 * subscriptions are its own, plus each child's, wrapped:
 *
 * - a message as `{ _tag: <child>, message }`;
 * - a command as `{ _tag: <child>, instance, command }`, run by the child's `runCommand`, whose answer names the
 *   `instance` too;
 * - a key as `{ _tag: <child>, instance, key }`, whose subscription the child's `listen` makes.
 *
 * For children by id, each of these also carries the `id`. A message, a command or a key of the parent's own that can
 * take the name of a child does not compile, as one tagged `string` can.
 *
 * @returns `child` and `childById`, which declare a child alone and children by id, `withChildren`, which takes the
 * children of a parent, and `make`, which makes a program without children.
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
 * @see The guide, "Anatomy of a program".
 * @see The guide, "Composition".
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
        tell?: (state: unknown) => unknown
      }> = {}
    ) => {
      const { flags, key, listening, tell, there } = place
      const keyed = key === undefined ? () => present : (state: unknown) => Opt.some(key(state))
      return {
        kind: "one",
        program,
        there: flags === undefined && there === undefined ? "always" : "sometimes",
        key: flags ?? (there === undefined ? keyed : (state: unknown) => there(state) ? keyed(state) : Opt.none()),
        ...(listening === undefined ? {} : { listening }),
        ...(tell === undefined ? {} : { tell })
      }
    },
    childById: (
      program: AnyProgram,
      place: Readonly<{
        ids?: (state: unknown) => Iterable<unknown>
        flags?: (state: unknown) => Iterable<readonly [unknown, unknown]>
        listening?: (state: unknown, id: unknown) => boolean
        tell?: (state: unknown) => unknown
      }>
    ) => ({
      kind: "byId",
      program,
      listed: place.flags ?? place.ids,
      flagged: place.flags !== undefined,
      ...(place.listening === undefined ? {} : { listening: place.listening }),
      ...(place.tell === undefined ? {} : { tell: place.tell })
    }),
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
 * What `program<T>()` returns: the functions that declare a program's children, and make it.
 *
 * @group Types of the signatures
 * @see The guide, "Anatomy of a program".
 * @see The guide, "Composition".
 */
export interface ProgramMaker<T extends DeclaredTypes> {
  /**
   * Declares a child alone.
   *
   * - `child(program)` is always there, and so is `child(program, { key })`, which starts again where `key` gives
   *   another value, compared with `Equal`.
   * - `child(program, { there })` is there in the states where `there` holds, and `key` may be given beside it.
   * - A child with flags is there where `flags` gives `Some`, and starts from them. Other flags start it again. It
   *   has no `key` beside them, so it does not start again from equal flags.
   * - `listening` says in which states its subscriptions run. Without it, they run whenever the child is there.
   * - `tell` gives, from the parent's state, an external message that the child is told: as it starts, in the first
   *   state too, and after each step of the parent's own, so that the child was last told what the parent's state
   *   gives. It does not compile for a child without external messages, nor for a message that is not one of the
   *   child's.
   *
   * A program with flags is declared with `flags`, and one without flags is declared without them. A child written
   * as an object, and not typed `Program<…>`, is checked as a program is: one whose steps list commands has a
   * `runCommand`, and one whose subscriptions list keys has a `listen`. Each of these does not compile otherwise.
   * Nor does `child` for a type parameter, as `P` in `<P extends AnyProgram>(p: P) => …`: a function over any
   * program is an overload, whose body declares a program of `unknown` types.
   *
   * @param program - The child.
   * @param place - When the child is there, what it starts from, when it listens and what it is told: functions of
   * the parent's own state.
   * @returns The child, for `withChildren`.
   *
   * @example
   * ```ts
   * About: child(about, { flags: (state) => state.about }),
   * ```
   *
   * @see The guide, "Composition".
   */
  readonly child: DeclareChild<T>
  /**
   * Declares children told apart by an id, such as the rows of a list, each with a state of its own.
   *
   * - `ids` lists the ids of the children that are there. For a program with flags, `flags` lists each id with its
   *   flags, and other flags start the child again.
   * - `children.Row(id)` is a row's model, and `forwardTo(dispatch, 'Row', id)` is the row's dispatch.
   * - Ids are compared by value, with `Equal`. An id listed twice is a defect, a `CompositionDefect`.
   * - A row removed, and listed again at the same id in a later step, is another instance, which starts again.
   * - `tell` gives one external message for all the children, which each is told as `child` says, in the order of
   *   the ids as `ids`, or `flags`, lists them. It takes no id.
   *
   * It takes `ids`, or `flags` for a program with flags, and does not compile without one, or with the other. The
   * program is checked as `child` checks it, and `tell` too.
   *
   * @param program - The program of each child.
   * @param place - The ids of the children in a state, `listening`, which says whether the child at an id listens,
   * and `tell`, what every child is told.
   * @returns The children, for `withChildren`.
   *
   * @example
   * ```ts
   * Row: childById(row, { ids: (state) => state.ids }),
   * ```
   *
   * @see The guide, "Composition".
   */
  readonly childById: DeclareChildById<T>
  /**
   * Takes the children of a parent, by name, and gives the `make` of the parent.
   *
   * They are declared before the rest, so that what a step tells them is typed by them. The children that one state
   * lists anew start in the order of their names here, as JavaScript gives the keys of an object, then in the order
   * in which `ids`, or `flags`, lists their ids. Each start takes the next number, from 1.
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
   * @see The guide, "Composition".
   */
  readonly withChildren: DeclareChildren<T>
  /**
   * Makes a program without children from its pieces.
   *
   * A model named in `program` is checked against `makeModel`, and a model not named is inferred from it. `update`
   * may reject the program's own messages, as any `update` does. `external` never rejects. The program's commands need
   * the services of its `runCommand`, and its subscriptions the services of its `listen`. Nothing names these
   * services: they are inferred.
   *
   * @param config - Its `init` and `makeModel`, and its `update`, `external`, `runCommand`, `subscriptions` and
   * `listen` where it has them.
   * @returns The program, which runs alone or as a child of another.
   *
   * @example
   * ```ts
   * const form = make({
   *   init: { state: { name: '' } },
   *   update: (message) => () => ({ state: { name: message.value } }),
   *   makeModel: (state) => ({ name: state.name, typed: { _tag: 'NameTyped' } as const }),
   * })
   * ```
   *
   * @see The guide, "Anatomy of a program".
   */
  readonly make: MakeProgram<T>
}

/** When a child's subscriptions run, among the states where it is there. Without it, in all of them. */
type Listening<State> = Readonly<{ listening?: (state: State) => boolean }>

// What a child is told in a state: an external message of its own, and nothing for a child that has none. A
// conditional type, which the compiler resolves before it types the function: as a function type alone, a literal
// that the function returns loses its tag (`_tag: string`), and needs `as const`.
/** What a child is told from its parent's state. Without it, only what a step lists in `tell`. */
type Telling<State, P> = Readonly<{
  /**
   * What the child is told in a state, an external message of its own: as it starts, and so that it was last told
   * what its parent's state gives. One value for all the children of the declaration.
   */
  tell?: [ExternalOf<P>] extends [never] ? never : (state: State) => ExternalOf<P>
}>

// A child with flags is declared with them. On the place, and not on the program: inferred from `P & …`, `P` would
// lose the name `Program<…>`, as `CheckedChild` says.
type AlwaysPlace<State, P> = [FlagsOf<P>] extends [never] ? [
    place?:
      & Readonly<{
        /** A value from the parent's state: another value, by `Equal`, starts the child again. */
        key?: (state: State) => unknown
        there?: never
        flags?: never
      }>
      & Listening<State>
      & Telling<State, P>
  ]
  : [place: { readonly "a child with flags is declared with its flags": FlagsOf<P> }]

/** The states where a child that may not be there is there, and what it starts from. */
type SometimesPlace<State, P> = [FlagsOf<P>] extends [never] ? Readonly<{
    /** Whether the child is there in a state. */
    there: (state: State) => boolean
    /**
     * A value from the parent's state, in a state where the child is there: another value, by `Equal`, starts the child
     * again.
     */
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
 * @group Types of the signatures
 * @see The guide, "Composition".
 */
export type DeclareChild<T extends DeclaredTypes> = {
  <P extends AnyProgram>(
    program: CheckedChild<P>,
    ...place: AlwaysPlace<Field<T, "state">, P>
  ): Child<Field<T, "state">, P, "always">
  <P extends AnyProgram>(
    program: CheckedChild<P>,
    place: SometimesPlace<Field<T, "state">, P> & Listening<Field<T, "state">> & Telling<Field<T, "state">, P>
  ): Child<Field<T, "state">, P, "sometimes">
}

/**
 * The function of `program` that declares children told apart by an id.
 *
 * @group Types of the signatures
 * @see The guide, "Composition".
 */
export type DeclareChildById<T extends DeclaredTypes> = {
  <Id, P extends AnyProgram>(
    program: CheckedChild<P>,
    place: IdsPlace<Field<T, "state">, Id> & FlagsChecked<P, false> & Telling<Field<T, "state">, P>
  ): ChildById<Field<T, "state">, Id, P>
  <Id, P extends AnyProgram>(
    program: CheckedChild<P>,
    place: FlagsPlace<Field<T, "state">, Id, FlagsOf<P>> & FlagsChecked<P, true> & Telling<Field<T, "state">, P>
  ): ChildById<Field<T, "state">, Id, P>
}

/**
 * The function of `program` that takes a parent's children, and gives its `make`.
 *
 * @group Types of the signatures
 * @see The guide, "Composition".
 */
export type DeclareChildren<T extends DeclaredTypes> = <C extends Children<Field<T, "state">>>(
  children: C
) => ParentMaker<T, C>

/**
 * What `withChildren` returns: the `make` of a parent of these children.
 *
 * @group Types of the signatures
 * @see The guide, "Composition".
 */
export interface ParentMaker<T extends DeclaredTypes, C extends Children<Field<T, "state">>> {
  /**
   * Makes the parent from its pieces, and from its children.
   *
   * - The parent's functions are given its own state alone. Its state is that state, and the children that the library
   *   keeps. `makeModel` is given the children's models too, and it alone: `update`, `external`, `onEvent` and `output`
   *   are given what each child declares as its `output`.
   * - A step of the parent's own lists in `tell` the external messages it gives its children, each by the child's
   *   name, with its id for children by id: nothing else compiles there. Each is given once the step is taken and its
   *   children are there, in order, to the instance that is there then: one that an earlier item of the same `tell`
   *   dropped or started again, through what its parent did with an event, is told nothing, and it is no defect.
   * - What the `tell` of a declaration gives is told before what the step lists, in the order of the names in
   *   `withChildren`, then of the ids, each child to its end, from the parent's state as it is at the child's turn. A
   *   child that an answer to it dropped or started again is told nothing of what the step lists.
   * - `init` is a step of the parent's own: the library starts the children that its state lists.
   * - The parent's commands need the services of its `runCommand` and of its children's commands, and its
   *   subscriptions those of its `listen` and of its children's subscriptions. Nothing names them: they are inferred.
   *
   * @param config - Its `init` and `makeModel`, and its `update`, `external`, `runCommand`, `subscriptions`, `listen`
   * and `onEvent` where it has them.
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
   * @see The guide, "Composition".
   * @see The guide, "Events and external messages".
   */
  readonly make: MakeParent<T, C>
}

/**
 * The function of `program` that makes a program without children from its pieces. With no children to read, its
 * `update`, `external` and `output` take no `children`.
 *
 * @group Types of the signatures
 * @see The guide, "Anatomy of a program".
 */
export type MakeProgram<T extends DeclaredTypes> = <Model, Ran = never, Heard = never>(
  config: Config<
    Field<T, "state">,
    None,
    Field<T, "message">,
    Field<T, "command">,
    Field<T, "event">,
    Named<T, "model", Model>,
    Ran,
    Heard,
    Field<T, "key">,
    Field<T, "external">,
    Field<T, "flags">,
    Field<T, "output">
  >
) => Program<
  Present<{
    state: Field<T, "state">
    model: Named<T, "model", Model>
    message: Field<T, "message">
    command: Field<T, "command">
    commandServices: RanServices<Ran>
    subscriptionServices: HeardServices<Heard>
    event: Field<T, "event">
    external: Field<T, "external">
    flags: Field<T, "flags">
    output: Field<T, "output">
    key: Field<T, "key">
  }>
>

/**
 * The function of `withChildren` that makes a parent from its pieces.
 *
 * @group Types of the signatures
 * @see The guide, "Composition".
 */
export type MakeParent<T extends DeclaredTypes, C extends Children<Field<T, "state">>> = <
  Model,
  Ran = never,
  Heard = never
>(
  // The children are fixed by `withChildren`, so that nothing of what a step tells them is inferred here: a literal
  // in a `tell` would otherwise lose its tags (`_tag: string`), and need `as const`.
  config: Config<
    Field<T, "state">,
    C,
    Field<T, "message">,
    Field<T, "command">,
    Field<T, "event">,
    Named<T, "model", Model>,
    Ran,
    Heard,
    Field<T, "key">,
    Field<T, "external">,
    Field<T, "flags">,
    Field<T, "output">
  >
) => Program<
  Present<{
    state: Kept<Field<T, "state">, KeptOf<C>>
    model: Named<T, "model", Model>
    message: Field<T, "message"> | ChildMessages<C>
    command: Field<T, "command"> | ChildCommands<C>
    commandServices: Needs<RanServices<Ran>, ChildCommandServices<C>>
    subscriptionServices: Needs<HeardServices<Heard>, ChildSubscriptionServices<C>>
    event: Field<T, "event">
    external: Field<T, "external">
    flags: Field<T, "flags">
    output: Field<T, "output">
    key: Field<T, "key"> | ChildKeys<C>
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
  { state: unknown; model: unknown; message: unknown }
>
