// Prototype of the next API (`@fgaudo/effect-tea/next`): offers as tokens, one dispatch for a whole run, and
// children declared rather than embedded by hand. The rest of the program (`Step`, `Update`, commands,
// subscriptions) is the package's own.
export { type Dispatch, dispatchUnsafe, type Offered, type Offers, type View } from './offer.ts'
export {
  child,
  each,
  type Each,
  type Child,
  type CommandOf,
  type MessageOf,
  type ModelOf,
  parent,
  type StateOf,
  type ChildCommands,
  type ChildMessages,
  compose,
  type Handles,
  modelOf,
  type Models,
  type Program,
} from './program.ts'
export { type Frame, run } from './run.ts'
export { messageOf } from './testing.ts'
