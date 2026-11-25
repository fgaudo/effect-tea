// The views of the tutorial's steps, drawn with snabbdom. Each draws its model and formats its values, never
// deciding: what is shown, and which messages the controls send, is the model's.
import { forwardTo } from "@fgaudo/effect-tea"
import type { View } from "@fgaudo/effect-tea/snabbdom"
import * as Opt from "effect/Option"
import { h, thunk } from "snabbdom"
import type * as Duration from "./duration.ts"
import type * as NamedTimers from "./named-timers.ts"
import type * as Named from "./named.ts"
import type * as Timer from "./timer.ts"
import type * as Timers from "./timers.ts"

// #region duration
// snabbdom's props module never removes a prop, so both cases of "−" set `disabled`.
export const durationView: View<Duration.Model, Duration.Message> = (model, dispatch) =>
  h("main.timer", [
    Opt.match(model.less, {
      onNone: () => h("button", { props: { disabled: true } }, "−"),
      onSome: (less) => h("button", { props: { disabled: false }, on: { click: () => dispatch(less) } }, "−")
    }),
    h("output", `${model.minutes} min`),
    h("button", { on: { click: () => dispatch(model.more) } }, "+")
  ])
// #endregion duration

// #region timer
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

// snabbdom reuses an element by position across the phases: the key keeps the "−", and the `disabled` it may hold,
// from becoming another phase's button.
export const timerView: View<Timer.Model, Timer.Message> = (model, dispatch) => {
  switch (model._tag) {
    case "Setting":
      return h("div.timer", [
        Opt.match(model.less, {
          onNone: () => h("button", { key: "less", props: { disabled: true } }, "−"),
          onSome: (less) =>
            h("button", { key: "less", props: { disabled: false }, on: { click: () => dispatch(less) } }, "−")
        }),
        h("output", `${model.minutes} min`),
        h("button", { on: { click: () => dispatch(model.more) } }, "+"),
        h("button", { on: { click: () => dispatch(model.start) } }, "Start")
      ])
    case "Running":
      return h("div.timer", [
        h("output", clock(model.secondsLeft)),
        h("button", { on: { click: () => dispatch(model.pause) } }, "Pause"),
        h("button.secondary", { on: { click: () => dispatch(model.reset) } }, "Reset")
      ])
    case "Paused":
      return h("div.timer", [
        h("output", clock(model.secondsLeft)),
        h("button", { on: { click: () => dispatch(model.resume) } }, "Resume"),
        h("button.secondary", { on: { click: () => dispatch(model.reset) } }, "Reset")
      ])
    case "Finished":
      return h("div.timer", [
        h("output", "Done"),
        h("button", { on: { click: () => dispatch(model.reset) } }, "Again")
      ])
  }
}
// #endregion timer

// #region timers
// A timer's model is the same object while the timer keeps the very same state, and `forwardTo` gives it the same
// dispatch every time it is drawn: `thunk` draws again only the timer that changed.
export const view: View<Timers.Model, Timers.Message> = (model, dispatch) =>
  h("main", [
    h("button", { on: { click: () => dispatch(model.add) } }, "Add a timer"),
    h(
      "ul",
      model.timers.map(({ id, model, remove }) =>
        h("li", { key: id }, [
          thunk("div.timer", String(id), timerView, [model, forwardTo(dispatch, "Timer", id)]),
          h("button.secondary", { on: { click: () => dispatch(remove) } }, "Remove")
        ])
      )
    )
  ])
// #endregion timers

// #region named
// A controlled element, the same one throughout, with no key: it shows the name the model holds, and sends what is
// typed, filled with the text that it holds.
export const namedView: View<Named.Model, Named.Message> = (model, dispatch) =>
  h("div.named", [
    h("input", {
      props: { value: model.name, placeholder: "A name" },
      on: {
        input: (event: Event) => dispatch({ ...model.typed, value: (event.target as HTMLInputElement).value })
      }
    }),
    thunk("div.timer", "timer", timerView, [model.timer, forwardTo(dispatch, "Timer")])
  ])
// #endregion named

// The list of the third step's view, each timer drawn by `namedView`.
export const namedTimersView: View<NamedTimers.Model, NamedTimers.Message> = (model, dispatch) =>
  h("main", [
    h("button", { on: { click: () => dispatch(model.add) } }, "Add a timer"),
    h(
      "ul",
      model.timers.map(({ id, model, remove }) =>
        h("li", { key: id }, [
          thunk("div.named", String(id), namedView, [model, forwardTo(dispatch, "Timer", id)]),
          h("button.secondary", { on: { click: () => dispatch(remove) } }, "Remove")
        ])
      )
    )
  ])
