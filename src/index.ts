// The public API of the package: everything else in `src/` is internal.

// A program: its pieces, and how a child program is lifted into its parent.
export { embed, embedEach, type Program } from './program.ts'

// What `update` returns.
export { isRejected, reject, type Rejected, type Step, type Transition, type Update } from './update.ts'

// The effects it describes: commands, and subscriptions to the world.
export { attempt, type Command } from './command.ts'
export type { Subscribe, Subscription, Subscriptions } from './subscription.ts'

// What the model offers to the view, decided by asking `update`.
export { type InputOffer, type Offer, type Offered, type Offers, offers } from './offer.ts'

// Views, independent of the renderer.
export { type Dispatch, mapDispatch, type View } from './view.ts'

// Running a program with a renderer, and the bugs it reports.
export { type Bug, type BugReporter, type DefectSource, RejectedMessage, type RejectionOptions } from './bug.ts'
export { type Frame, run, type RunOptions } from './run.ts'
