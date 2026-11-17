// A program: its pieces, its types named rather than in a row, and the types read back from one.
import { absurd } from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import type { RunCommand } from './command.ts'
import type { Subscriptions } from './subscription.ts'
import type { Step, Update } from './update.ts'

/** Required exactly when `Command` has values, so that none can go uninterpreted. */
export type Interpreter<Command, Message, R> = [Command] extends [never] ? object
  : Readonly<{ runCommand: RunCommand<Command, Message, R> }>

// `runCommand` is missing only when `Command` is `never`, so that `absurd` is never called.
export const runCommandOf = <Command, Message, R>(
  program: Interpreter<Command, Message, R>,
): RunCommand<Command, Message, R> =>
  (program as Partial<Readonly<{ runCommand: RunCommand<Command, Message, R> }>>).runCommand
    ?? (absurd as RunCommand<Command, Message, R>)

/**
 * What a program listens to in a state, by key.
 *
 * It gives the subscriptions as `run` reconciles them, and none for a program without `subscriptions`. A parent lists
 * the subscriptions of each child under `[<child>, key]`, or under `[<child>, id, key]` for children by id.
 *
 * @param program - The program, with or without `subscriptions`.
 * @returns A function from a state to the program's subscriptions in it.
 *
 * @example
 * ```ts
 * expect(HashMap.has(subscriptionsOf(app)(state), ['Clock', 'ticks'])).toBe(true)
 * ```
 *
 * @see The guide, "Anatomy of a program", "What a program listens to".
 * @see The guide, "Composition", "A test reads a child's subscriptions by key".
 */
export const subscriptionsOf = <State, Message, R, K>(
  program: Readonly<{ subscriptions?: Subscriptions<State, Message, R, K> }>,
): Subscriptions<State, Message, R, K> => program.subscriptions ?? (() => HashMap.empty())

declare const ExternalTypeId: unique symbol

/** The types of a program, by name: `state`, `model` and `message` always, the others only when it has them. */
export type ProgramTypes = Readonly<{
  /** Its state, an object. */
  state: object
  /** What its view draws. */
  model: unknown
  /** The messages its `update` takes. */
  message: unknown
  /** What its `update` asks done, for `runCommand`. */
  command?: unknown
  /** What its commands and its subscriptions need. */
  services?: unknown
  /** What it tells its parent. */
  event?: unknown
  /** The messages its parent may send it, e.g. a back button, among its `message`s. */
  external?: unknown
  /** What it starts from, given by whoever starts it. */
  flags?: unknown
}>

/** A type `T` names, or `never` when it does not name it. */
export type Field<T, K extends string> = T extends { readonly [P in K]: infer V } ? V : never

/**
 * A program, of the types `T` names.
 *
 * `init` is where it starts, `update` how each message changes the state, and `makeModel` what the view draws.
 * `runCommand` is how its commands happen, when it has some, and `subscriptions` what it listens to, when it listens.
 * A program of children or inputs is made with `composition`.
 *
 * - The view is not part of it: `run` gives the renderer frames, `{ model, dispatch, seen }`.
 * - Its state is an object, and its `external` messages are among its `message`s. Otherwise it does not compile.
 * - `runCommand` is required exactly when the program has commands.
 * - `run` makes a frame's model with `makeModel(state)`. A test can call it the same way, on any state.
 * - `update`, `makeModel` and `subscriptions` are pure, and states are never mutated. The library reuses a child's
 *   model and subscriptions while the child's state is the same object.
 *
 * @example
 * ```ts
 * const counter: Program<{ state: State; model: State; message: Message }> = {
 *   init: { state: { count: 0 } },
 *   update: (message) => (state) => ({ state: { count: state.count + (message === 'Increment' ? 1 : -1) } }),
 *   makeModel: (state) => state,
 * }
 * ```
 *
 * @see The guide, "Anatomy of a program", "The view is not part of it".
 * @see The guide, "Anatomy of a program", "What does not compile".
 * @see The guide, "Anatomy of a program", "`runCommand` is required exactly when the program has commands".
 * @see The guide, "Anatomy of a program", "A test makes a model as `run` does".
 * @see The guide, "Guarantees", "`update`, `makeModel` and `subscriptions` are pure, and states are never mutated".
 */
export type Program<T extends ProgramTypes> =
  & Shape<
    Field<T, 'state'>,
    Field<T, 'model'>,
    Field<T, 'message'>,
    Field<T, 'command'>,
    Field<T, 'services'>,
    Field<T, 'event'>,
    Field<T, 'external'>,
    Field<T, 'flags'>
  >
  & ExternalAmong<Field<T, 'message'>, Field<T, 'external'>>

/**
 * A program's external messages are among its messages: one that is not would reach an `update` that does not take
 * it, with no `CompositionDefect` to say so.
 */
export type ExternalAmong<Message, External> = [Exclude<External, Message>] extends [never] ? unknown
  : Readonly<{ 'an external message is not among the program messages': Exclude<External, Message> }>

/**
 * How a program starts: its first step, or, for a program with flags, the function that makes it from the
 * flags. A step is never a function, so the two are told apart when the program runs.
 */
export type Init<State, Command, Flags> = [Flags] extends [never] ? Step<State, Command>
  : (flags: Flags) => Step<State, Command>

/** What the program starts from, among the options of whoever starts it: required exactly when it has flags. */
export type FlagsOption<Flags> = [Flags] extends [never] ? Readonly<{ flags?: never }>
  : Readonly<{ flags: Flags }>

/**
 * A program keeps its state in an object: a parent keeps a child's model for as long as the child's state is the
 * same object, and a number or a string has no identity to keep it by. Every program, so that any can be a child.
 */
export type ObjectState<State> = [State] extends [object] ? unknown
  : Readonly<{ 'a program keeps its state in an object': State }>

/** A program's pieces. `External` is only in its type: no program has the property. */
export type Shape<State, Model, Message, Command, R, Event, External, Flags = never> =
  & ObjectState<State>
  & Readonly<{
    readonly [ExternalTypeId]?: External
    init: Init<State, Command, Flags>
    update: Update<State, Message, Command, Event>
    subscriptions?: Subscriptions<State, Message, R, unknown>
    makeModel: (state: State) => Model
  }>
  & Interpreter<Command, Message, R>

// Only what every program has: `Shape<any, …>` would demand a `runCommand` (`[any] extends [never]` is false).
export type AnyProgram = Readonly<
  { init: Step<any, any> | ((flags: any) => Step<any, any>); update: any; makeModel: any }
>

/** The first step of a program, or the one its `init` makes from flags. */
type FirstStepOf<P> = P extends { readonly init: (flags: any) => infer S } ? S
  : P extends { readonly init: infer S } ? S
  : never

/** The step a program's `init` starts with, given its flags when it has them. */
export const startOf = <State, Command>(
  init: Step<State, Command> | ((flags: any) => Step<State, Command>),
  flags: unknown,
): Step<State, Command> => typeof init === 'function' ? init(flags) : init

/**
 * A program's state, read back from the step its `init` starts with.
 *
 * @example
 * ```ts
 * type State = StateOf<typeof app>
 * ```
 */
export type StateOf<P> = FirstStepOf<P> extends Step<infer S, any> ? S : never
/**
 * A program's model, read back from what its `makeModel` returns.
 *
 * @example
 * ```ts
 * type Model = ModelOf<typeof app>
 * ```
 */
export type ModelOf<P> = P extends { readonly makeModel: (state: any) => infer M } ? M : never
/**
 * The messages a program's `update` takes.
 *
 * @example
 * ```ts
 * type Message = MessageOf<typeof app>
 * ```
 */
export type MessageOf<P> = P extends { readonly update: (message: infer M) => any } ? M : never
// What a program's type does not say reads back as `unknown` (an optional property it lacks): none, then, rather
// than anything. Only where nothing else tells "absent" from `unknown`.
type Known<T> = unknown extends T ? never : T

/** What the lists under `Key` hold, for each step of a union: none in a step without the list. */
type Listed<T, Key extends 'commands' | 'events'> = T extends { readonly [K in Key]?: infer L } ? Items<L> : never
// `L` is `undefined` where an object literal of the union lacks the list, and `unknown` where no type names it.
type Items<L> = L extends ReadonlyArray<infer I> ? I : never

/** What the steps `update` may return list under `Key`. */
type Returned<P, Key extends 'commands' | 'events'> = P extends
  { readonly update: (message: any) => (state: any) => infer T } ? Listed<T, Key> : never

// Read from `update` too: a program written without `Program<…>` may start with no command and still return some.
/**
 * The commands a program's steps list: those its `init` starts with, and those its `update` returns.
 *
 * It is `never` for a program that lists none.
 *
 * @example
 * ```ts
 * type Command = CommandOf<typeof app>
 * ```
 */
export type CommandOf<P> = Listed<FirstStepOf<P>, 'commands'> | Returned<P, 'commands'>
/**
 * The flags a program starts from: the argument of its `init`, when `init` is a function.
 *
 * It is `never` for a program whose `init` is a step.
 *
 * @example
 * ```ts
 * type Flags = FlagsOf<typeof product>
 * ```
 */
export type FlagsOf<P> = P extends { readonly init: (flags: infer F) => any } ? F : never
/**
 * The external messages of a program: those its parent may send it.
 *
 * It is `never` unless the program's type names an `external`.
 *
 * @example
 * ```ts
 * type External = ExternalOf<typeof page>
 * ```
 */
export type ExternalOf<P> = P extends { readonly [ExternalTypeId]?: infer E } ? Known<E> : never
/**
 * The events a program's `update` returns for its parent.
 *
 * It is `never` for a program that returns none.
 *
 * @example
 * ```ts
 * type Event = EventOf<typeof page>
 * ```
 */
export type EventOf<P> = Returned<P, 'events'>
/**
 * The services a program needs to run: those its `runCommand` and its `subscriptions` require.
 *
 * It is `never` unless their types name some.
 *
 * @example
 * ```ts
 * type Services = ServicesOf<typeof app>
 * ```
 */
export type ServicesOf<P> =
  | (P extends { readonly runCommand: RunCommand<any, any, infer R> } ? Known<R> : never)
  | (P extends { readonly subscriptions?: Subscriptions<any, any, infer R, any> } ? Known<R> : never)
