import * as Data from 'effect/Data'
import type * as Effect from 'effect/Effect'

/** Counts the states a run produces: every message that changes the state creates a new revision. */
export type Revision = number

/**
 * A message a view sent with an `offerInput` whose value `update` rejected in the state the offer was made in
 * (`revision`): the model offered to type a value it does not accept, so the two disagree. Any other rejected
 * offer is stale (the state moved on since it was drawn) and is ignored.
 */
export type InputRejection<Message> = Readonly<{ message: Message; revision: Revision }>

/**
 * What an `InputRejection` does. There is no default: whether a bug the user may never notice should crash the
 * app depends on where it runs.
 * - `'die'`: the run fails with `RejectedInput`.
 * - a function: the message is dropped and the program goes on, which is safe because the state did not
 *   change, and the function reports it (e.g. to a crash-reporting service). A rejection cannot be ignored
 *   without being reported.
 *
 * Defects are not here: they always end the run, which fails with them, and whoever runs it reports them.
 */
export type OnRejectedInput<Message> = 'die' | ((rejection: InputRejection<Message>) => Effect.Effect<void>)

/**
 * The defect thrown by `makeModel` when it offers a message that `update` rejects in the state the model is
 * made from: the model promised an action that the state does not allow, so `makeModel` and `update` disagree.
 */
export class RejectedOffer extends Data.TaggedError('RejectedOffer')<{ readonly message: unknown }> {}

/** The defect raised by an `InputRejection` with `onRejectedInput: 'die'`. */
export class RejectedInput extends Data.TaggedError('RejectedInput')<{
  readonly message: unknown
  readonly revision: Revision
}> {}
