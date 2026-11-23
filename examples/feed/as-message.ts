// The form of the spike: the end of a scroll is one message with its offset. The model holds the message without its
// offset, as data, and the view fills the offset that the element gives. The state keeps no offset.
import { defect, type MessageOf, type ModelOf, program, reject, type StateOf } from "@fgaudo/effect-tea"
import * as Data from "effect/Data"
import { loadOf, nearEnd, PAGE, pageFrom } from "./shared.ts"

export type More = Data.TaggedEnum<{
  Idle: object
  Loading: object
  Exhausted: object
}>

export const More = Data.taggedEnum<More>()

export type State = Readonly<{ items: ReadonlyArray<string>; more: More }>

export type Own = Data.TaggedEnum<{
  ScrollEnded: { offset: number }
  PageLoaded: { items: ReadonlyArray<string> }
}>

const Own = Data.taggedEnum<Own>()

/** A scroll end as the model holds it: all of the message but the offset, which the element gives. */
export type ScrollEnd = Omit<Extract<Own, { _tag: "ScrollEnded" }>, "offset">

export type Command = Readonly<{ _tag: "Load"; from: number }>

export const feed = program<{ state: State; message: Own; command: Command }>().make({
  init: { state: { items: pageFrom(0), more: More.Idle() } },
  update: (message) => (state) => {
    switch (message._tag) {
      case "ScrollEnded":
        return state.more._tag !== "Idle"
          ? reject
          : nearEnd(message.offset, state.items.length)
          ? { state: { ...state, more: More.Loading() }, commands: [{ _tag: "Load", from: state.items.length }] }
          // A scroll that stopped short of the end means nothing here: the very state, and nothing kept of it.
          : { state }
      case "PageLoaded":
        return state.more._tag === "Loading"
          ? {
            state: {
              items: [...state.items, ...message.items],
              more: message.items.length < PAGE ? More.Exhausted() : More.Idle()
            }
          }
          : defect("A page loaded while nothing was loading")
    }
  },
  runCommand: (command) => loadOf(command.from, (items) => Own.PageLoaded({ items })),
  makeModel: (state) => ({
    items: state.items,
    more: state.more._tag === "Idle"
      ? { _tag: "Idle" as const, scrollEnded: { _tag: "ScrollEnded" } satisfies ScrollEnd as ScrollEnd }
      : { _tag: state.more._tag }
  })
})

export type Model = ModelOf<typeof feed>

export type Message = MessageOf<typeof feed>

export type FeedState = StateOf<typeof feed>
