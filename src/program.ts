// A program: its pieces, its types named rather than in a row, and the types read back from one.
import { absurd } from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import type { RunCommand } from './command.ts'
import { type Offers, outsideRun, rootOffers } from './offer.ts'
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

export const subscriptionsOf = <State, Message, R, K>(
  program: Readonly<{ subscriptions?: Subscriptions<State, Message, R, K> }>,
): Subscriptions<State, Message, R, K> => program.subscriptions ?? (() => HashMap.empty())

declare const ExternalTypeId: unique symbol

/**
 * What a program's type says of it, by name. `state`, `model` and `message` it always has; `command` (what
 * `update` asks done), `services` (what its commands and subscriptions need), `event` (what it tells its
 * parent) and `external` (the messages its parent may send it, e.g. a back button, among its `message`s)
 * only when it has them.
 */
export type ProgramTypes = Readonly<{
  state: unknown
  model: unknown
  message: unknown
  command?: unknown
  services?: unknown
  event?: unknown
  external?: unknown
}>

/** A type `T` names, or `never` when it does not name it. */
export type Field<T, K extends string> = T extends { readonly [P in K]: infer V } ? V : never

/**
 * A program of the types `T` names, e.g. `Program<{ state: State; model: Model; message: Message }>`. The view
 * is not part of it: it lives in its own module, so it can be hot reloaded. `runCommand` is there exactly when
 * the program has commands, and `subscriptions` when it listens to something. `makeModel` receives the offers
 * of its own `update` in that very state, so a model can offer nothing else. A parent made of children is made
 * with `parent`.
 */
export type Program<T extends ProgramTypes> = Shape<
  Field<T, 'state'>,
  Field<T, 'model'>,
  Field<T, 'message'>,
  Field<T, 'command'>,
  Field<T, 'services'>,
  Field<T, 'event'>,
  Field<T, 'external'>
>

/** A program's pieces. `External` is only in its type: no program has the property. */
export type Shape<State, Model, Message, Command, R, Event, External> =
  & Readonly<{
    readonly [ExternalTypeId]?: External
    init: Step<State, Command>
    update: Update<State, Message, Command, Event>
    subscriptions?: Subscriptions<State, Message, R, unknown>
    makeModel: (state: State, offers: Offers<Message>) => Model
  }>
  & Interpreter<Command, Message, R>

// Only what every program has: `Shape<any, …>` would demand a `runCommand` (`[any] extends [never]` is false).
export type AnyProgram = Readonly<{ init: Step<any, any>; update: any; makeModel: any }>

/** A program's state, model, message, command and external messages, e.g. `MessageOf<typeof app>`. */
export type StateOf<P> = P extends { readonly init: Step<infer S, any> } ? S : never
export type ModelOf<P> = P extends { readonly makeModel: (state: any, offers: any) => infer M } ? M : never
export type MessageOf<P> = P extends { readonly update: (message: infer M) => any } ? M : never
// What a program's type does not say reads back as `unknown` (an optional property it lacks, a step without
// commands): none, then, rather than anything.
type Known<T> = unknown extends T ? never : T

export type CommandOf<P> = P extends { readonly init: Step<any, infer C> } ? Known<C> : never
/** The messages a parent may send the program: none, unless its type says so. */
export type ExternalOf<P> = P extends { readonly [ExternalTypeId]?: infer E } ? Known<E> : never
export type EventOf<P> = P extends { readonly update: Update<any, any, any, infer E> } ? Known<E> : never
export type ServicesOf<P> =
  | (P extends { readonly runCommand: RunCommand<any, any, infer R> } ? Known<R> : never)
  | (P extends { readonly subscriptions?: Subscriptions<any, any, infer R, any> } ? Known<R> : never)

/** A program's model in `state`, with offers of its own, as `run` makes it (outside `run`, e.g. in a test). */
export const modelOf = <State, Model, Message>(
  program: Readonly<
    { update: Update<State, Message, unknown, unknown>; makeModel: (state: State, offers: Offers<Message>) => Model }
  >,
) =>
(state: State): Model => program.makeModel(state, rootOffers(program.update, state, outsideRun))
