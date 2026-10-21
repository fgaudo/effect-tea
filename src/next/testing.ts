import { type Offered, tokenOf } from './offer.ts'

/** For tests: the message an offer sends, as the root of its program receives it. */
export const messageOf = <Message>(offered: Offered<unknown>): Message => tokenOf(offered).message as Message
