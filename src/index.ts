/**
 * The public API of the package: everything else in `src/` is internal.
 *
 * The package holds its documentation, for the version installed: the guide in `site/guide/`, the tutorial in
 * `site/tutorial/` and the examples in `examples/`. A coding agent starts from `skills/effect-tea/SKILL.md`.
 * @module @fgaudo/effect-tea
 */

// A program, the types read back from one, and a program composed of children and inputs. The types in the signatures
// of the API are exported too, all but those their module keeps to itself: a package that exports what the API
// returns names them in its declarations (`tools/api-report.ts`).
export {
  type Child,
  type ChildById,
  type DeclareChild,
  type DeclareChildById,
  type DeclareChildren,
  type DeclareInput,
  type DeclareInputById,
  type Input,
  type InputById,
  type Instance,
  type Kept,
  type MakeParent,
  type MakeProgram,
  type ParentMaker,
  program,
  type ProgramMaker
} from "./compose.ts"
export type {
  AnyProgram,
  CommandOf,
  CommandServicesOf,
  EventOf,
  ExternalHandler,
  ExternalOf,
  Field,
  FlagsOf,
  FlagsOption,
  Init,
  Interpreter,
  KeyOf,
  Listener,
  MessageOf,
  ModelOf,
  ObjectState,
  OutputOf,
  Program,
  StateOf,
  SubscriptionServicesOf
} from "./program.ts"

// What `update` returns.
export { andThen, type Folded, reject, type Rejected, type Step, type Transition, type Update } from "./update.ts"

// What the outside writes into a program's state: an input, declared in `program`, and what a view writes into it.
export type { Written } from "./input.ts"

// The effects it describes: commands, and subscriptions to the world.
export type { Execution, RunCommand } from "./command.ts"
export type { Listen, Subscription, Subscriptions } from "./subscription.ts"

// How a view sends messages, its children's included.
export { type Dispatch, forwardTo } from "./dispatch.ts"

// Starting a program, which gives a handle on it, and running its effects.
export { CompositionDefect, defect, type DefectSite, InvariantDefect, ProgramDefect } from "./defect.ts"
export type { Applied, Ignored, Origin, RunOptions } from "./engine.ts"
export { type App, start, type Started } from "./run.ts"
