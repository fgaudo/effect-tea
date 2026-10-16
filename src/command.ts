import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'

/** An effect that may produce a message: `None` for effects that only act on the outside world. */
export type Command<Message, R> = Effect.Effect<Opt.Option<Message>, never, R>

/**
 * Turns an effect that may fail into a command: its success and its expected failure both become messages,
 * so `update` decides what each means. Defects still crash the program.
 */
export const attempt = <A, E, R, Message>(
  effect: Effect.Effect<A, E, R>,
  handlers: Readonly<{ onSuccess: (value: A) => Message; onFailure: (error: E) => Message }>,
): Command<Message, R> =>
  Effect.match(effect, {
    onSuccess: (value) => Opt.some(handlers.onSuccess(value)),
    onFailure: (error) => Opt.some(handlers.onFailure(error)),
  })
