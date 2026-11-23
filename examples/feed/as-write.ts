// The form the guide gives today ("Inputs", "What an element reports"): the end of a scroll is a write of its offset,
// then a fixed message of the model. The offset has a place in the state where a scroll end is listened to, and
// `update` reads it from there.
import { defect, type MessageOf, type ModelOf, program, reject, type StateOf } from "@fgaudo/effect-tea"
import * as Data from "effect/Data"
import * as Optic from "effect/Optic"
import { loadOf, nearEnd, PAGE, pageFrom } from "./shared.ts"

/** Whether more rows may load: only an idle list listens to its scroll, and keeps where it last stopped. */
export type More = Data.TaggedEnum<{
  Idle: { offset: number }
  Loading: object
  Exhausted: object
}>

export const More = Data.taggedEnum<More>()

export type State = Readonly<{ items: ReadonlyArray<string>; more: More }>

export type Own = Data.TaggedEnum<{
  ScrollEnded: object
  PageLoaded: { items: ReadonlyArray<string> }
}>

const Own = Data.taggedEnum<Own>()

export type Command = Readonly<{ _tag: "Load"; from: number }>

const { make, input } = program<{ state: State; message: Own; command: Command }>()

export const feed = make({
  init: { state: { items: pageFrom(0), more: More.Idle({ offset: 0 }) } },
  inputs: { Offset: input({ at: Optic.id<State>().key("more").tag("Idle").key("offset") }) },
  update: (message) => (state) => {
    switch (message._tag) {
      case "ScrollEnded":
        return state.more._tag !== "Idle"
          ? reject
          : nearEnd(state.more.offset, state.items.length)
          ? { state: { ...state, more: More.Loading() }, commands: [{ _tag: "Load", from: state.items.length }] }
          // A scroll that stopped short of the end means nothing: the offset written stays, and is read no more.
          : { state }
      case "PageLoaded":
        return state.more._tag === "Loading"
          ? {
            state: {
              items: [...state.items, ...message.items],
              // The place comes back with a value no element gave: no message reads it before a write over it.
              more: message.items.length < PAGE ? More.Exhausted() : More.Idle({ offset: 0 })
            }
          }
          : defect("A page loaded while nothing was loading")
    }
  },
  runCommand: (command) => loadOf(command.from, (items) => Own.PageLoaded({ items })),
  makeModel: (state) => ({
    items: state.items,
    more: state.more._tag === "Idle"
      ? { _tag: "Idle" as const, scrollEnded: Own.ScrollEnded() }
      : { _tag: state.more._tag }
  })
})

export type Model = ModelOf<typeof feed>

export type Message = MessageOf<typeof feed>

export type FeedState = StateOf<typeof feed>
