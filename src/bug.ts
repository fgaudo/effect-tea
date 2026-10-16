import * as Data from 'effect/Data'
import type * as Effect from 'effect/Effect'
import type { Revision } from './engine.ts'

/** Where a defect happened: in `update`, in a command, or in the subscription with that key. */
export type DefectSource<K = unknown> =
  | Readonly<{ _tag: 'Update' }>
  | Readonly<{ _tag: 'Command' }>
  | Readonly<{ _tag: 'Subscription'; key: K }>

/**
 * A bug in the program:
 * - `Defect`: something blew up (an exception, an `Effect.die`). The program always dies: recovering from one
 *   is up to the code where it happens.
 * - `Rejected`: a frame sent a message that `update` rejects in the frame's own state (`revision`), so the
 *   model offered an action `update` does not accept. Nothing changed (`update` rejected it), so the
 *   program may go on (`RejectionOptions`).
 */
export type Bug<Message, K = unknown> =
  | Readonly<{ _tag: 'Defect'; cause: unknown; where: DefectSource<K> }>
  | Readonly<{ _tag: 'Rejected'; message: Message; revision: Revision }>

/** Reports a bug, e.g. to a crash-reporting service. */
export type BugReporter<Message, K = unknown> = (bug: Bug<Message, K>) => Effect.Effect<void>

/**
 * What a `Rejected` bug does. There is no default: whether a bug the user may never notice should crash
 * the app depends on where it runs.
 * - `'die'`: the program fails with `RejectedMessage`.
 * - `'ignore'`: the message is dropped and the program goes on, which is safe because the state did not
 *   change. `onBug` is then required: a bug that is neither fatal nor reported would go unnoticed.
 * `onBug` is called for every bug, defects included.
 */
export type RejectionOptions<Message, K = unknown> =
  | Readonly<{ onRejected: 'die'; onBug?: BugReporter<Message, K> }>
  | Readonly<{ onRejected: 'ignore'; onBug: BugReporter<Message, K> }>

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
