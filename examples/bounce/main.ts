import { run } from "@fgaudo/effect-tea"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"
import { renderInto } from "../../bridges/snabbdom.ts"
import { bounce, Screen } from "./bounce.ts"
import { view } from "./view.ts"

const root = document.getElementById("app")
if (root === null) throw new Error("index.html has no #app element")

// The instants of the screen's frames, from `requestAnimationFrame`.
const screen = Screen.of({
  frames: Stream.callback<number>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const frame = { id: 0 }
        const next = (now: number) => {
          Queue.offerUnsafe(queue, now)
          frame.id = requestAnimationFrame(next)
        }
        frame.id = requestAnimationFrame(next)
        return frame
      }),
      (frame) => Effect.sync(() => cancelAnimationFrame(frame.id))
    )
  )
})

Effect.runFork(
  run(bounce, renderInto(root, view), { flags: { dt: 1000 / 60 } }).pipe(
    Effect.provideService(Screen, screen),
    // The failure of a program that dies is reported; an interruption is no crash.
    Effect.tapCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause)))
  )
)
