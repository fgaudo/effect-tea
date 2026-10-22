import * as Data from 'effect/Data'
import type * as Effect from 'effect/Effect'
import { describeByTag } from './log.ts'

/** Counts the states a run produces: every message that changes the state creates a new revision. */
export type Revision = number

/**
 * What a rejected input does. There is no default: whether a bug the user may never notice should crash the
 * app depends on where it runs.
 * - `'die'`: the run fails with the `RejectedInput`.
 * - a function: the message is dropped and the program goes on, which is safe because the state did not
 *   change, and the function reports the `RejectedInput` (e.g. to a crash-reporting service). A rejection cannot
 *   be ignored without being reported.
 *
 * Defects are not here: they always end the run, which fails with them, and whoever runs it reports them.
 */
export type OnRejectedInput<Message> =
  | 'die'
  | ((rejection: RejectedInput & Readonly<{ rejected: Message }>) => Effect.Effect<void>)

/**
 * The defect thrown by `makeModel` when it offers a message that `update` rejects in the state the model is
 * made from: the model promised an action that the state does not allow, so `makeModel` and `update` disagree.
 * `rejected` is that message, with its data; the error's own `message` names only its tags.
 */
export class RejectedOffer extends Data.TaggedError('RejectedOffer')<{ readonly rejected: unknown }> {
  override get message(): string {
    return `makeModel offered a message that update rejects (${String(describeByTag(this.rejected))})`
  }
}

/**
 * A message a view sent with an `offerInput` whose value `update` rejected in the state the offer was made in
 * (`revision`): the model offered to type a value it does not accept, so the two disagree. Any other rejected
 * offer is stale (the state moved on since it was drawn) and is ignored. `rejected` is that message as typed, so
 * also what the user typed: a report that leaves the device should take out what it must not carry. The error's
 * own `message` names only its tags, so that it can be a report's title as it is.
 */
export class RejectedInput extends Data.TaggedError('RejectedInput')<{
  readonly rejected: unknown
  readonly revision: Revision
}> {
  override get message(): string {
    return `A view sent a value that update rejected in the state of its offer (${
      String(describeByTag(this.rejected))
    })`
  }
}
