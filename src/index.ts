/**
 * The public API of the package: everything else in `src/` is internal.
 *
 * The package holds its documentation, for the version installed: the guide in `site/guide/`, the tutorial in
 * `site/tutorial/` and the examples in `examples/`. A coding agent starts from `skills/effect-tea/SKILL.md`.
 * @module @fgaudo/effect-tea
 */

// A program, the types read back from one, and a program composed of children and inputs. `AnyProgram`,
// `Interpreter` and `ObjectState` are in the signatures of `program`: exported, so that a package that exports what it
// returns can name them in its declarations.
export {
  type AnyProgram,
  type CommandOf,
  type CommandServicesOf,
  type EventOf,
  type ExternalOf,
  type FlagsOf,
  type Interpreter,
  type MessageOf,
  type ModelOf,
  type ObjectState,
  type Program,
  type StateOf,
  subscriptionsOf,
  type SubscriptionServicesOf,
} from './program.ts'
export {
  type DeclareChild,
  type DeclareChildById,
  type DeclareInput,
  type DeclareInputById,
  type MakeProgram,
  program,
  type ProgramMaker,
} from './compose.ts'

// What `update` returns.
export {
  andThen,
  forEach,
  reject,
  type Rejected,
  type Step,
  type Transition,
  type Update,
} from './update.ts'

// What the outside writes into a program's state: an input, declared in `program`, and the rule a bridge calls
// for the element that shows one.
export { drawn, edited, type Shown, type Written } from './input.ts'

// The effects it describes: commands, and subscriptions to the world.
export type { Execution, RunCommand } from './command.ts'
export type { Subscription, Subscriptions } from './subscription.ts'

// How a view sends messages, its children's included.
export { type Dispatch, forwardTo } from './dispatch.ts'

// Running a program with a renderer.
export type { Applied, Ignored, Origin, RunOptions } from './engine.ts'
export { type Frame, run } from './run.ts'
export { CompositionDefect, defect, type DefectSite, InvariantDefect, ProgramDefect } from './defect.ts'
