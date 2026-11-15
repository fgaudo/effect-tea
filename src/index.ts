/**
 * The public API of the package: everything else in `src/` is internal.
 * @module @fgaudo/effect-tea
 */

// A program, the types read back from one, and a program composed of children and inputs.
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
export { composition } from './compose.ts'

// What `update` returns.
export {
  andThen,
  forEach,
  isRejected,
  raise,
  reject,
  type Rejected,
  type Step,
  type Transition,
  type Update,
} from './update.ts'

// What the outside writes into a program's state: an input, declared in `composition`, and the rule a bridge calls
// for the element that shows one.
export { drawn, type Shown, typed, write, type Written } from './input.ts'

// The effects it describes: commands, and subscriptions to the world.
export type { Execution, RunCommand } from './command.ts'
export type { Subscription, Subscriptions } from './subscription.ts'

// How a view sends messages, its children's included.
export { type Dispatch, dispatchTo } from './dispatch.ts'

// Running a program with a renderer.
export type { Applied, Ignored, Origin, RunOptions } from './engine.ts'
export { type Frame, run } from './run.ts'
export { CompositionDefect, defect, type DefectSite, InvariantDefect, ProgramDefect } from './defect.ts'
