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
 * What a program listens to in `state`, by key, as `run` reconciles it: empty for a program without
 * `subscriptions`. A parent lists each child's under `[<child>, key]`, or `[<child>, id, key]` for children by id, so
 * that a test can check who listens, e.g. `HashMap.has(subscriptionsOf(app)(state), ['Clock', 'ticks'])`.
 */
export const subscriptionsOf = <State, Message, R, K>(
  program: Readonly<{ subscriptions?: Subscriptions<State, Message, R, K> }>,
): Subscriptions<State, Message, R, K> => program.subscriptions ?? (() => HashMap.empty())

declare const ExternalTypeId: unique symbol

/**
 * What a program's type says of it, by name. `state`, `model` and `message` it always has; `command` (what
 * `update` asks done), `services` (what its commands and subscriptions need), `event` (what it tells its
 * parent), `external` (the messages its parent may send it, e.g. a back button, among its `message`s) and
 * `flags` (what it starts from, given by whoever starts it) only when it has them.
 */
export type ProgramTypes = Readonly<{
  state: object
  model: unknown
  message: unknown
  command?: unknown
  services?: unknown
  event?: unknown
  external?: unknown
  flags?: unknown
}>

/** A type `T` names, or `never` when it does not name it. */
export type Field<T, K extends string> = T extends { readonly [P in K]: infer V } ? V : never

/**
 * A program of the types `T` names, e.g. `Program<{ state: State; model: Model; message: Message }>`. The view
 * is not part of it: it lives in its own module, so it can be hot reloaded. `runCommand` is there exactly when
 * the program has commands, and `subscriptions` when it listens to something. `makeModel` turns a state into
 * what the view reads, and is a pure function of it: a test calls it as `run` does. A program of children or
 * inputs is made with `composition`.
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

/** A program's state, read back from the step its `init` starts with, e.g. `StateOf<typeof app>`. */
export type StateOf<P> = FirstStepOf<P> extends Step<infer S, any> ? S : never
/** A program's model, read back from what its `makeModel` returns, e.g. `ModelOf<typeof app>`. */
export type ModelOf<P> = P extends { readonly makeModel: (state: any) => infer M } ? M : never
/** The messages a program's `update` takes, e.g. `MessageOf<typeof app>`. */
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
 * The commands a program's steps list, those its `init` starts with and those its `update` returns, e.g.
 * `CommandOf<typeof app>`: none, for a program that lists none.
 */
export type CommandOf<P> = Listed<FirstStepOf<P>, 'commands'> | Returned<P, 'commands'>
/** What a program starts from: none, unless its `init` is a function, which is given flags when it runs. */
export type FlagsOf<P> = P extends { readonly init: (flags: infer F) => any } ? F : never
/** The messages a parent may send the program: none, unless its type says so. */
export type ExternalOf<P> = P extends { readonly [ExternalTypeId]?: infer E } ? Known<E> : never
/** The events a program's `update` returns for its parent, e.g. `EventOf<typeof app>`: none, unless it returns some. */
export type EventOf<P> = Returned<P, 'events'>
/**
 * The services a program needs to run, those its `runCommand` and its `subscriptions` require, e.g.
 * `ServicesOf<typeof app>`: none, unless their types name some.
 */
export type ServicesOf<P> =
  | (P extends { readonly runCommand: RunCommand<any, any, infer R> } ? Known<R> : never)
  | (P extends { readonly subscriptions?: Subscriptions<any, any, infer R, any> } ? Known<R> : never)
