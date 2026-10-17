import * as Data from 'effect/Data'
import type * as Effect from 'effect/Effect'

/** Counts the states a run produces: every message that changes the state creates a new revision. */
export type Revision = number

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
