// A program: its pieces, its types named rather than in a row, and the types read back from one.
import { absurd } from "effect/Function"
import type * as HashMap from "effect/HashMap"
import type { RunCommand } from "./command.ts"
import type { Subscription, Subscriptions } from "./subscription.ts"
import type { Step, Update } from "./update.ts"

/**
 * A program's `runCommand`, required exactly when `Command` has values, so that none goes uninterpreted.
 *
 * @example
 * ```ts
 * type Saving = Interpreter<'Save', Message, never> // { readonly runCommand: RunCommand<'Save', Message> }
 * ```
 *
 * @see The guide, "Anatomy of a program", "`runCommand` is required exactly when the program has commands".
 */
export type Interpreter<Command, Message, R> = [Command] extends [never] ? object
  : { readonly runCommand: RunCommand<Command, Message, R> }

// `runCommand` is missing only when `Command` is `never`, so that `absurd` is never called.
export const runCommandOf = <Command, Message, R>(
  program: Interpreter<Command, Message, R>
): RunCommand<Command, Message, R> =>
  (program as Partial<Readonly<{ runCommand: RunCommand<Command, Message, R> }>>).runCommand
    ?? (absurd as RunCommand<Command, Message, R>)

/** The types of a program, by name: `state`, `model` and `message` always, the others only when it has them. */
type ProgramTypes = Readonly<{
  /** Its state, an object. */
  state: object
  /** What its view draws. */
  model: unknown
  /** The messages its `update` takes. */
  message: unknown
  /** What its `update` asks done, for `runCommand`. */
  command?: unknown
  /** What its commands need. */
  commandServices?: unknown
  /** What its subscriptions need. */
  subscriptionServices?: unknown
  /** What it tells its parent. */
  event?: unknown
  /** The messages its parent may send it, e.g. a back button: what its `external` takes. */
  external?: unknown
  /** What it starts from, given by whoever starts it. */
  flags?: unknown
  /** What its parent reads of it: what its `output` returns. */
  output?: unknown
}>

/**
 * A type that `T` names, or `never` when it does not name it.
 *
 * @example
 * ```ts
 * type Command = Field<{ state: State; command: 'Save' }, 'command'> // 'Save'
 * ```
 */
export type Field<T, K extends string> = T extends { readonly [P in K]: infer V } ? V : never

/**
 * A program, of the types `T` names.
 *
 * `init` says where the program starts. `update` says how each message changes the state. `makeModel` says what the
 * view draws. `subscriptions` says what it listens to in each state. `runCommand` is there when the program has
 * commands, `external` when its parent may send it messages, and `output` when its parent may read a value of it. A
 * program is made with `program`. `make` returns this type, and a function that takes a program names this type.
 *
 * - The view is not part of it: `start` gives the renderer an `App`, `{ model, subscribe, dispatch, die }`.
 * - Its state is an object. A program written as an object and typed `Program<…>` does not compile otherwise: with a
 *   state that is a number or a string, or with a state type without fields, such as `{}`. `make` refuses the state
 *   without fields too.
 * - `runCommand` is required exactly when the program has commands, and `external` exactly when it has external
 *   messages.
 * - The run makes the model of a state with `makeModel(state)`. A test can call `makeModel` the same way, on any state.
 * - Every program has `subscriptions`. One that `make` makes without them listens to nothing. A test calls
 *   `subscriptions(state)` as the run does, on any state.
 * - `update`, `external`, `makeModel`, `subscriptions` and `output` are pure, and states are never mutated. The
 *   library reuses a child's model and subscriptions while the child's state is the same object.
 *
 * @example
 * ```ts
 * const counter = program<{ state: State; model: State; message: Message }>().make({
 *   init: { state: { count: 0 } },
 *   update: (message) => (state) => ({ state: { count: state.count + (message === 'Increment' ? 1 : -1) } }),
 *   makeModel: (state) => state,
 * })
 *
 * const started = (counter: Program<{ state: State; model: State; message: Message }>) => start(counter)
 * ```
 *
 * @see The guide, "Anatomy of a program", "Its type lists the types it is made of".
 * @see The guide, "Anatomy of a program", "The view is not part of it".
 * @see The guide, "Anatomy of a program", "What does not compile".
 * @see The guide, "Anatomy of a program", "`runCommand` is required exactly when the program has commands".
 * @see The guide, "Events and external messages", "`external` is required exactly when the program names external messages".
 * @see The guide, "Anatomy of a program", "A test makes a model as the run does".
 * @see The guide, "Anatomy of a program", "What a program listens to".
 * @see The guide, "Guarantees", "`update`, `external`, `makeModel` and `subscriptions` are pure, and states are never mutated".
 */
export type Program<T extends ProgramTypes> = Shape<
  Field<T, "state">,
  Field<T, "model">,
  Field<T, "message">,
  Field<T, "command">,
  Field<T, "commandServices">,
  Field<T, "subscriptionServices">,
  Field<T, "event">,
  Field<T, "external">,
  Field<T, "flags">,
  Field<T, "output">
>

/**
 * A program's `external`, required exactly when `External` has values: how the program answers each message its parent
 * may send it, in every state.
 *
 * It returns a `Step`, never `reject`: an external message applies in every state.
 *
 * @example
 * ```ts
 * type Halting = ExternalHandler<Halted, State, never, never>
 * // { readonly external: (message: Halted) => (state: State) => Step<State, never, never> }
 * ```
 *
 * @see The guide, "Events and external messages", "A child answers its external messages in every state".
 */
export type ExternalHandler<External, State, Command, Event> = [External] extends [never] ? object
  : { readonly external: (message: External) => (state: State) => Step<State, Command, Event> }

/**
 * How a program starts: its first step, or, for a program with flags, a function that makes the first step from the
 * flags.
 *
 * @example
 * ```ts
 * const init: Init<State, never, number> = (start) => ({ state: { count: start } })
 * ```
 *
 * @see The guide, "Anatomy of a program", "A program with flags".
 */
export type Init<State, Command, Flags> = [Flags] extends [never] ? Step<State, Command>
  : (flags: Flags) => Step<State, Command>

/**
 * What a program starts from, among the options of whoever starts the program: required exactly when the program has
 * flags.
 *
 * @example
 * ```ts
 * const options: FlagsOption<number> = { flags: 1 }
 * ```
 *
 * @see The guide, "Anatomy of a program", "A program with flags".
 */
export type FlagsOption<Flags> = [Flags] extends [never] ? { readonly flags?: never }
  : { readonly flags: Flags }

/**
 * The check that a program keeps its state in an object. It is `unknown` when the program does. Otherwise it is a
 * property that no program has, so that the program does not compile.
 *
 * A parent keeps a child's model while the child's state is the same object. A number or a string has no identity
 * by which a model could be kept. A state that is a number or a string is refused by `Program<…>`, `program`,
 * `child`, `childById`, `start` and the testing tools that take a program. A type without fields, such as `{}`, holds a
 * number too, so name the type of a state without fields `object`. `make` refuses a type without fields, and a state
 * that is a type parameter, since the compiler cannot decide whether it holds a number.
 *
 * @example
 * ```ts
 * type Checked = ObjectState<number> // { readonly 'a program keeps its state in an object': number }
 * ```
 *
 * @see The guide, "Anatomy of a program", "What does not compile".
 * @see The guide, "Anatomy of a program", "Its state is always an object".
 * @see The guide, "Composition", "A child's model is kept".
 */
export type ObjectState<State> = [State] extends [object] ? Fielded<State>
  : { readonly "a program keeps its state in an object": State }
// Only a type without fields: one with a field that a primitive has too, `{ length: number }`, is a state as any other.
// `any` is let through, as before.
type Fielded<State> = 0 extends 1 & State ? unknown
  : [keyof State] extends [never] ? [Extract<Primitive, State>] extends [never] ? unknown
    : { readonly "a program keeps its state in an object": State }
  : unknown
type Primitive = string | number | bigint | boolean | symbol

// A program's pieces, of the types given in a row. Kept to this module: the API and the rest of the library name a
// program by `Program<{ … }>`, which gives these types by name.
type Shape<State, Model, Message, Command, RC, RS, Event, External, Flags = never, Output = never> =
  & ObjectState<State>
  & {
    readonly init: Init<State, Command, Flags>
    readonly update: Update<State, Message, Command, Event>
    readonly subscriptions: Subscriptions<State, Message, RS, unknown>
    readonly makeModel: (state: State) => Model
  }
  & Interpreter<Command, Message, RC>
  // A parameter: a program may be given a type that names fewer external messages than it takes, never more.
  & ExternalHandler<External, State, Command, Event>
  & ([Output] extends [never] ? object : { readonly output: (state: State) => Output })

// Only what every program has: `Shape<any, …>` would demand a `runCommand` (`[any] extends [never]` is false).
/**
 * Any program: only what every program has, for a type parameter that takes one.
 *
 * @example
 * ```ts
 * type Messages<P extends AnyProgram> = MessageOf<P>
 * ```
 */
export type AnyProgram = {
  readonly init: Step<any, any> | ((flags: any) => Step<any, any>)
  readonly update: any
  readonly subscriptions: any
  readonly makeModel: any
}

/** The first step of a program, or the one its `init` makes from flags. */
type FirstStepOf<P> = P extends { readonly init: (flags: any) => infer S } ? S
  : P extends { readonly init: infer S } ? S
  : never

/** The step a program's `init` starts with, given its flags when it has them. */
export const startOf = <State, Command>(
  init: Step<State, Command> | ((flags: any) => Step<State, Command>),
  flags: unknown
): Step<State, Command> =>
  // A step is never a function, so `typeof` tells the two forms of `init` apart.
  typeof init === "function" ? init(flags) : init

/**
 * A program's state, read back from the step its `init` starts with.
 *
 * @example
 * ```ts
 * type State = StateOf<typeof app>
 * ```
 *
 * @see The guide, "Anatomy of a program", "Its type lists the types it is made of".
 */
export type StateOf<P> = FirstStepOf<P> extends Step<infer S, any> ? S : never
/**
 * A program's model, read back from what its `makeModel` returns.
 *
 * @example
 * ```ts
 * type Model = ModelOf<typeof app>
 * ```
 *
 * @see The guide, "Anatomy of a program", "Its type lists the types it is made of".
 * @see The guide, "Anatomy of a program", "Its types are named first, then it is made".
 */
export type ModelOf<P> = P extends { readonly makeModel: (state: any) => infer M } ? M : never
/**
 * The messages a program's `update` takes.
 *
 * @example
 * ```ts
 * type Message = MessageOf<typeof app>
 * ```
 *
 * @see The guide, "Anatomy of a program", "Its type lists the types it is made of".
 * @see The guide, "Composition", "What the library derives".
 */
export type MessageOf<P> = P extends { readonly update: (message: infer M) => any } ? M : never
/** What the lists under `Key` hold, for each step of a union: none in a step without the list. */
type Listed<T, Key extends "commands" | "events"> = T extends { readonly [K in Key]?: infer L } ? Items<L> : never
// `L` is `undefined` where an object literal of the union lacks the list, and `unknown` where no type names it.
type Items<L> = L extends ReadonlyArray<infer I> ? I : never

/** What the steps `update` and `external` may return list under `Key`. */
type Returned<P, Key extends "commands" | "events"> = Answered<P, "update", Key> | Answered<P, "external", Key>
// `never` for the message, which any function of a message takes: one of a program that names no messages takes
// nothing else.
type Answered<P, Piece extends "update" | "external", Key extends "commands" | "events"> = P extends
  { readonly [K in Piece]: (message: never) => (state: any) => infer T } ? Listed<T, Key> : never

// Read from `update` and `external` too: a program written without `Program<…>` may start with no command and still
// return some.
/**
 * The commands a program's steps list: those its `init` starts with, and those its `update` and `external` return.
 *
 * It is `never` for a program that lists none.
 *
 * @example
 * ```ts
 * type Command = CommandOf<typeof app>
 * ```
 *
 * @see The guide, "Anatomy of a program", "Its type lists the types it is made of".
 */
export type CommandOf<P> = Listed<FirstStepOf<P>, "commands"> | Returned<P, "commands">
/**
 * The flags a program starts from: the argument of its `init`, when `init` is a function.
 *
 * It is `never` for a program whose `init` is a step.
 *
 * @example
 * ```ts
 * type Flags = FlagsOf<typeof product>
 * ```
 *
 * @see The guide, "Anatomy of a program", "Its type lists the types it is made of".
 * @see The guide, "Anatomy of a program", "A program with flags".
 */
export type FlagsOf<P> = P extends { readonly init: (flags: infer F) => any } ? F : never
/**
 * The external messages of a program: those its parent may send it, which its `external` takes.
 *
 * It is `never` for a program without `external`.
 *
 * @example
 * ```ts
 * type External = ExternalOf<typeof page>
 * ```
 *
 * @see The guide, "Anatomy of a program", "Its type lists the types it is made of".
 * @see The guide, "Anatomy of a program", "Its types are named first, then it is made".
 */
export type ExternalOf<P> = P extends { readonly external: (message: infer E) => any } ? E : never
/**
 * What a program's parent reads of it: what its `output` returns, a value of its state.
 *
 * It is `never` for a program without `output`.
 *
 * @example
 * ```ts
 * type Output = OutputOf<typeof stopwatch>
 * ```
 *
 * @see The guide, "Anatomy of a program", "Its type lists the types it is made of".
 */
export type OutputOf<P> = P extends { readonly output: (state: any) => infer O } ? O : never
/**
 * The events a program's `update` and `external` return for its parent.
 *
 * It is `never` for a program that returns none.
 *
 * @example
 * ```ts
 * type Event = EventOf<typeof page>
 * ```
 *
 * @see The guide, "Anatomy of a program", "Its type lists the types it is made of".
 */
export type EventOf<P> = Returned<P, "events">
/**
 * The services a program's commands need: those its `runCommand` requires.
 *
 * It is `never` when they need none.
 *
 * @example
 * ```ts
 * type Services = CommandServicesOf<typeof app>
 * ```
 *
 * @see The guide, "Anatomy of a program", "Its type lists the types it is made of".
 * @see The guide, "Anatomy of a program", "Its types are named first, then it is made".
 */
export type CommandServicesOf<P> = P extends { readonly runCommand: RunCommand<any, any, infer R> } ? R : never
/**
 * The services a program's subscriptions need.
 *
 * It is `never` when they need none.
 *
 * @example
 * ```ts
 * type Services = SubscriptionServicesOf<typeof app>
 * ```
 *
 * @see The guide, "Anatomy of a program", "Its type lists the types it is made of".
 * @see The guide, "Anatomy of a program", "Its types are named first, then it is made".
 */
export type SubscriptionServicesOf<P> = P extends { readonly subscriptions: (state: never) => infer Heard }
  ? MapServices<Heard>
  : never
// Apart, so that each distributes: over the maps `subscriptions` may return, and over what a map holds. An empty map
// holds `never`, which needs nothing. What a map of type `any` holds reads back as `unknown`, and needs anything: as
// `never`, it would run without its services.
type MapServices<Heard> = Heard extends HashMap.HashMap<any, infer Listened> ? Needed<Listened> : never
type Needed<Listened> = unknown extends Listened ? unknown : Listened extends Subscription<any, infer R> ? R : never
