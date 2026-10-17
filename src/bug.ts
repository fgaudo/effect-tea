import * as Data from 'effect/Data'
import type * as Effect from 'effect/Effect'
import type { Revision } from './engine.ts'

/**
 * A message a frame sent and `update` rejects in the frame's own state (`revision`): the model offered an
 * action `update` does not accept, so the two disagree.
 */
export type Rejection<Message> = Readonly<{ message: Message; revision: Revision }>

/**
 * What a `Rejection` does. There is no default: whether a bug the user may never notice should crash the app
 * depends on where it runs.
 * - `'die'`: the run fails with `RejectedMessage`.
 * - a function: the message is dropped and the program goes on, which is safe because the state did not
 *   change, and the function reports it (e.g. to a crash-reporting service). A rejection cannot be ignored
 *   without being reported.
 *
 * Defects are not here: they always end the run, which fails with them, and whoever runs it reports them.
 */
export type OnRejected<Message> = 'die' | ((rejection: Rejection<Message>) => Effect.Effect<void>)

/** The defect raised when a frame dispatches a message that `update` rejects in the frame's own state. */
export class RejectedMessage extends Data.TaggedError('RejectedMessage')<{
  readonly message: unknown
  readonly revision: Revision
}> {}

/** By default a message is described by its `_tag` (or itself, if it is a string): logs never carry its data. */
export const describeByTag = (message: unknown): unknown =>
  typeof message === 'string'
    ? message
    : typeof message === 'object' && message !== null && '_tag' in message
    ? message._tag
    : typeof message
