// The public API of the package: everything else in `src/` is internal.

// A program: its pieces, and how a child program is lifted into its parent.
export { embed, embedEach, modelOf, type Program } from './program.ts'

// What `update` returns.
export { isRejected, reject, type Rejected, type Step, type Transition, type Update } from './update.ts'

// The effects it describes: commands, and subscriptions to the world.
export { attempt, type Execution, type RunCommand } from './command.ts'
export type { Subscription, Subscriptions } from './subscription.ts'

// What the model offers to the view, decided by asking `update`, and how a view sends it.
export {
  type Dispatch,
  dispatchUnsafe,
  type InputOffer,
  mapDispatch,
  type Offer,
  type Offered,
  type Offers,
  type View,
} from './offer.ts'

// Running a program with a renderer, and what a rejection from a frame does.
export type { Applied, RunOptions } from './engine.ts'
export { type OnRejected, RejectedMessage, type Rejection } from './rejection.ts'
export { type Frame, run } from './run.ts'
