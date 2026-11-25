/**
 * The testing tools of the package, from the cheapest to the most complete.
 *
 * The package holds its documentation, for the version installed: the guide in `site/guide/`, the tutorial in
 * `site/tutorial/` and the examples in `examples/`. A coding agent starts from `skills/effect-tea/SKILL.md`.
 * @module @fgaudo/effect-tea/testing
 */
export { applyAll } from "./apply-all.ts"
export { type DispatchViolation, dispatchViolations } from "./dispatch-violations.ts"
export { drive, type DriveOptions, type Driver } from "./drive.ts"
export { type PlaceViolation, placeViolations } from "./place-violations.ts"
export { type Rehearsal, rehearse } from "./rehearse.ts"
export { simulate, type Simulated } from "./simulate.ts"
export { stateOf } from "./state-of.ts"
