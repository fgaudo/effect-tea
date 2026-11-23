// A stopwatch that ticks every second while it runs: its subscription exists only in the running state. It
// asks its parent to be removed with an event, its parent may halt it, in any state, and reads whether it runs.
import { defect, program, reject, type Subscription, type Update } from "@fgaudo/effect-tea"
import * as Channel from "effect/Channel"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"

export type Watch = Data.TaggedEnum<{ Running: object; Stopped: object }>

export const Watch = Data.taggedEnum<Watch>()

export type State = Readonly<{ seconds: number; watch: Watch }>

export type Message = Data.TaggedEnum<{
  Started: object
  Stopped: object
  Ticked: object
  RemoveClicked: object
}>

// Not exported, so that no view calls its constructors, as the guide's "Model" says.
const Message = Data.taggedEnum<Message>()

export type Event = Readonly<{ _tag: "RemoveRequested" }>

/** What only its parent sends it: no view, command or subscription of its own can. */
export type External = Readonly<{ _tag: "Halted" }>

/** What its parent reads of it: a condition that holds while it runs, where an event would say only that it began. */
export type Output = Readonly<{ running: boolean }>

export const update: Update<State, Message, never, Event> = (message) => (state) => {
  switch (message._tag) {
    case "Started":
      return state.watch._tag === "Running" ? reject : { state: { ...state, watch: Watch.Running() } }
    case "Stopped":
      return state.watch._tag === "Running" ? { state: { ...state, watch: Watch.Stopped() } } : reject
    // A tick arrives only while running: stopping interrupts the subscription and drops what it sent. One
    // anywhere else is a bug, and the run dies with it.
    case "Ticked":
      return state.watch._tag === "Running"
        ? { state: { ...state, seconds: state.seconds + 1 } }
        : defect("A tick while the stopwatch was stopped")
    case "RemoveClicked":
      return { state, events: [{ _tag: "RemoveRequested" }] }
  }
}

// A halt applies in every state: a step, never `reject`.
export const external = (_: External) => (state: State) => ({
  state: state.watch._tag === "Running" ? { ...state, watch: Watch.Stopped() } : state
})

const ticks: Subscription<Message> = Channel.forever(
  Channel.fromEffectDrain(Effect.sleep("1 second")).pipe(
    Channel.concatWith(() => Channel.succeed(Message.Ticked()))
  )
)

export type Model = Readonly<{
  seconds: number
  remove: Message
  watch: Data.TaggedEnum<{
    Running: { stop: Message }
    Stopped: { start: Message }
  }>
}>

export const stopwatch = program<{
  state: State
  model: Model
  message: Message
  event: Event
  external: External
  output: Output
  key: "ticks"
}>().make({
  init: { state: { seconds: 0, watch: Watch.Stopped() } },
  update,
  external,
  output: (state) => ({ running: state.watch._tag === "Running" }),
  subscriptions: (state) => state.watch._tag === "Running" ? ["ticks"] : [],
  listen: () => ticks,
  makeModel: (state) => ({
    seconds: state.seconds,
    remove: Message.RemoveClicked(),
    watch: state.watch._tag === "Running"
      ? { _tag: "Running", stop: Message.Stopped() }
      : { _tag: "Stopped", start: Message.Started() }
  })
})
