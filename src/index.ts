/**
 * The public API of the package: everything else in `src/` is internal.
 * @module @fgaudo/effect-tea
 */

// A program, the types read back from one, and a parent made of children.
export {
  type CommandOf,
  type EventOf,
  type ExternalOf,
  type FlagsOf,
  type MessageOf,
  type ModelOf,
  type Program,
  type ServicesOf,
  type StateOf,
  subscriptionsOf,
} from './program.ts'
export { parent } from './compose.ts'

// What `update` returns.
export { isRejected, reject, type Rejected, type Step, type Transition, type Update } from './update.ts'

// The effects it describes: commands, and subscriptions to the world.
export { attempt, type Execution, type RunCommand } from './command.ts'
export type { Subscription, Subscriptions } from './subscription.ts'

// How a view sends messages, its children's included.
export { type Dispatch, dispatchTo, dispatchUnsafe, type View } from './dispatch.ts'

// Running a program with a renderer.
export type { Applied, RunOptions } from './engine.ts'
export { type Frame, run } from './run.ts'
