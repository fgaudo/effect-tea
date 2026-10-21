// The public API of the package: everything else in `src/` is internal.

// A program, the types read back from one, and a parent made of children.
export {
  type CommandOf,
  type EventOf,
  type ExternalOf,
  type MessageOf,
  type ModelOf,
  modelOf,
  type Program,
  type ServicesOf,
  type StateOf,
} from './program.ts'
export { parent } from './compose.ts'

// What `update` returns.
export { isRejected, reject, type Rejected, type Step, type Transition, type Update } from './update.ts'

// The effects it describes: commands, and subscriptions to the world.
export { attempt, type Execution, type RunCommand } from './command.ts'
export type { Subscription, Subscriptions } from './subscription.ts'

// What the model offers to the view, and how a view sends it.
export { type Dispatch, dispatchUnsafe, type Offered, type Offers, type View } from './offer.ts'

// Running a program with a renderer, and what a view's rejected value does.
export type { Applied, RunOptions } from './engine.ts'
export { type InputRejection, type OnRejectedInput, RejectedInput, RejectedOffer } from './rejection.ts'
export { type Frame, run } from './run.ts'
