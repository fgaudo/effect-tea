import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as Opt from 'effect/Option'

/**
 * How a command happens: an effect that may produce a message, `None` for effects that only act on the
 * outside world. `update` returns commands as data; only `runCommand` turns one into an execution.
 */
export type Execution<Message, R> = Effect.Effect<Opt.Option<Message>, never, R>

/** The interpreter of a program's commands: the only place that knows how each one happens. */
export type RunCommand<Command, Message, R> = (command: Command) => Execution<Message, R>

type Handlers<A, E, Message> = Readonly<{ onSuccess: (value: A) => Message; onFailure: (error: E) => Message }>

/**
 * Turns an effect that may fail into an execution: its success and its expected failure both become
 * messages, so `update` decides what each means. Defects still crash the program. Called with the handlers
 * alone, it returns the function to give the effect to, as in a `pipe` or `Effect.fn`.
 */
export const attempt: {
  <A, E, Message>(handlers: Handlers<A, E, Message>): <R>(effect: Effect.Effect<A, E, R>) => Execution<Message, R>
  <A, E, R, Message>(effect: Effect.Effect<A, E, R>, handlers: Handlers<A, E, Message>): Execution<Message, R>
} = dual(
  2,
  <A, E, R, Message>(effect: Effect.Effect<A, E, R>, handlers: Handlers<A, E, Message>): Execution<Message, R> =>
    Effect.match(effect, {
      onSuccess: (value) => Opt.some(handlers.onSuccess(value)),
      onFailure: (error) => Opt.some(handlers.onFailure(error)),
    }),
)
