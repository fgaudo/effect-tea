import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'

/**
 * How a command happens: an effect that may produce a message, `None` for effects that only act on the
 * outside world. `update` returns commands as data; only `runCommand` turns one into an execution.
 */
export type Execution<Message, R> = Effect.Effect<Opt.Option<Message>, never, R>

/** The interpreter of a program's commands: the only place that knows how each one happens. */
export type RunCommand<Command, Message, R> = (command: Command) => Execution<Message, R>

/**
 * Turns an effect that may fail into an execution: its success and its expected failure both become
 * messages, so `update` decides what each means. Defects still crash the program.
 */
export const attempt = <A, E, R, Message>(
  effect: Effect.Effect<A, E, R>,
  handlers: Readonly<{ onSuccess: (value: A) => Message; onFailure: (error: E) => Message }>,
): Execution<Message, R> =>
  Effect.match(effect, {
    onSuccess: (value) => Opt.some(handlers.onSuccess(value)),
    onFailure: (error) => Opt.some(handlers.onFailure(error)),
  })
