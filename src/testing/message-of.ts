import { type Offered, tokenOf } from '../offer.ts'

/** The message an offer sends, as the root of its program receives it: what a view's handler would send. */
export const messageOf = <Message>(offered: Offered<unknown>): Message => tokenOf(offered).message as Message
