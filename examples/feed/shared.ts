// What both forms of the spike share: the geometry the program draws by, and the pages it loads.
import type { Execution } from "@fgaudo/effect-tea"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"

/** The height of a row, and of the list on screen, in pixels: the program's own CSS fixes both. */
export const ROW = 40

export const VIEWPORT = 120

/** How close to the end a scroll must stop for the next page to load. */
export const MARGIN = 40

/** Rows in a page, and the rows there are in all. */
export const PAGE = 5

export const TOTAL = 12

/** Whether a scroll that stopped at `offset` shows the end of `count` rows. */
export const nearEnd = (offset: number, count: number): boolean => offset + VIEWPORT >= count * ROW - MARGIN

/** The rows of the page that starts at `from`. */
export const pageFrom = (from: number): ReadonlyArray<string> =>
  Array.from({ length: Math.max(0, Math.min(PAGE, TOTAL - from)) }, (_, index) => `Row ${from + index + 1}`)

export const loadOf = <Message>(from: number, loaded: (items: ReadonlyArray<string>) => Message): Execution<Message> =>
  Effect.sync(() => Opt.some(loaded(pageFrom(from))))
