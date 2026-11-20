import type { Dispatch } from "@fgaudo/effect-tea"
import type { View } from "@fgaudo/effect-tea/snabbdom"
import * as Opt from "effect/Option"
import { h, type VNode } from "snabbdom"
import type { Message, Model, Track } from "./volume.ts"

// Drawn by the program: a press starts a drag, whose moves `update` puts within the bounds it holds.
const track = (name: string, slider: Track, dispatch: Dispatch<Message>): VNode =>
  h(
    `div.track.${name}`,
    {
      on: Opt.match(slider.press, { onNone: () => ({}), onSome: (press) => ({ pointerdown: () => dispatch(press) }) })
    },
    [
      h("div.fill", { style: { width: `${slider.level}%` } }),
      h("div.cap", { style: { left: `${slider.max}%` } })
    ]
  )

export const view: View<Model, Message> = (model, dispatch) => {
  const { sound, limit } = model
  return h("main", [
    h("section.volume", [
      h("h2", "Media"),
      track("media", model.media, dispatch),
      h("output.media", String(model.media.level)),
      sound._tag === "Muted"
        ? h("button", { on: { click: () => dispatch(sound.unmute) } }, "Unmute")
        : h("button", { on: { click: () => dispatch(sound.mute) } }, "Mute")
    ]),
    h("section.volume", [
      h("h2", "Ringer"),
      track("ringer", model.ringer, dispatch),
      h("output.ringer", String(model.ringer.level)),
      limit._tag === "Quiet"
        ? h("button", { on: { click: () => dispatch(limit.full) } }, "Full volume")
        : h("button", { on: { click: () => dispatch(limit.quiet) } }, "Quiet hours")
    ])
  ])
}
