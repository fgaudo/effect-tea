import type * as Effect from 'effect/Effect'
import type * as Opt from 'effect/Option'

/**
 * How a command happens: an effect that may produce a message, `None` for effects that only act on the
 * outside world. It cannot fail: an expected failure becomes a message, e.g. with `Effect.match`, and a
 * defect ends the run. `update` returns commands as data; only `runCommand` turns one into an execution.
 */
export type Execution<Message, R> = Effect.Effect<Opt.Option<Message>, never, R>

/** The interpreter of a program's commands: the only place that knows how each one happens. */
export type RunCommand<Command, Message, R> = (command: Command) => Execution<Message, R>
