/**
 * The public API of the package: everything else in `src/` is internal.
 *
 * The package holds its documentation, for the version installed: the guide in `site/guide/`, the tutorial in
 * `site/tutorial/` and the examples in `examples/`. A coding agent starts from `skills/effect-tea/SKILL.md`.
 *
 * The types under 'Types of the signatures' name what the functions take and return, for a package's declarations:
 * the code of a program does not write them.
 * @module @fgaudo/effect-tea
 */

// A program, the types read back from one, and a program composed of children. The types in the signatures
// of the API are exported too, all but those their module keeps to itself: a package that exports what the API
// returns names them in its declarations (`tools/api-report.ts`).
export {
  type Child,
  type ChildById,
  type DeclareChild,
  type DeclareChildById,
  type DeclareChildren,
  type DeclareChildWhen,
  type Instance,
  type Kept,
  type MakeParent,
  type MakeProgram,
  type OutputsOf,
  type ParentMaker,
  program,
  type ProgramMaker,
  type TellOf
} from "./compose.ts"
export type {
  AnyProgram,
  CommandOf,
  CommandServicesOf,
  EventOf,
  ExternalOf,
  Field,
  FlagsOf,
  FlagsOption,
  Init,
  KeyOf,
  MessageOf,
  ModelOf,
  OutputOf,
  Program,
  StateOf,
  SubscriptionServicesOf,
  WithListen,
  WithRunCommand
} from "./program.ts"

// What `update` returns.
export { andThen, type Folded, reject, type Rejected, type Step, type Transition, type Update } from "./update.ts"

// The effects it describes: commands, and subscriptions to the world.
export type { Execution, RunCommand } from "./command.ts"
export type { Listen, Subscription, Subscriptions } from "./subscription.ts"

// How a view sends messages, its children's included.
export { type Dispatch, forwardTo } from "./dispatch.ts"

// Starting a program, which gives a handle on it, and running its effects.
export { CompositionDefect, defect, type DefectSite, InvariantDefect, ProgramDefect } from "./defect.ts"
export type { Applied, Ignored, Origin, RunOptions } from "./engine.ts"
export { type App, start, type Started } from "./run.ts"
