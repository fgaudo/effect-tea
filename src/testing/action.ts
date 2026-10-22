import type * as Effect from 'effect/Effect'
import type { Dispatch, Offered } from '../offer.ts'

/** What a user does on a model: sends offers through a dispatch, as a view's handler would. */
export type Action = (dispatch: Dispatch) => Effect.Effect<void>

/** The action that sends an offer, of any level of the program, as a click on its control does. */
export const tap = (offered: Offered<unknown>): Action => (dispatch) => dispatch(offered)

/** The action that enters `value` into the input that `offerInput` made `toOffered` for. */
export const input = <Value>(toOffered: (value: Value) => Offered<unknown>, value: Value): Action => (dispatch) =>
  dispatch(toOffered(value))
