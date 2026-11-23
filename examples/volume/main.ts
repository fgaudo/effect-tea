import { start } from "@fgaudo/effect-tea"
import { drawInto } from "@fgaudo/effect-tea/snabbdom"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"
import { view } from "./view.ts"
import { Pointer, volume } from "./volume.ts"

const root = document.getElementById("app")
if (root === null) throw new Error("index.html has no #app element")

// Whether the pointer is held: a drag whose subscription starts once the pointer is already released ends at once. A
// pointer the browser cancels (a gesture it takes over, a lost touch) is released too. Heard in the capture phase,
// before the track's own listener sends `DragStarted`: the drag reads it when it starts, whenever the run applies that
// message.
let held = false
document.addEventListener("pointerdown", () => {
  held = true
}, { capture: true })
for (const released of ["pointerup", "pointercancel"]) {
  document.addEventListener(released, () => {
    held = false
  })
}

// Where the pointer is across the page, until it is released or cancelled.
const pointer = Pointer.of({
  moves: Stream.callback<number>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const move = (event: PointerEvent) => Queue.offerUnsafe(queue, event.clientX)
        const release = () => Queue.endUnsafe(queue)
        document.addEventListener("pointermove", move)
        document.addEventListener("pointerup", release)
        document.addEventListener("pointercancel", release)
        if (!held) release()
        return { move, release }
      }),
      ({ move, release }) =>
        Effect.sync(() => {
          document.removeEventListener("pointermove", move)
          document.removeEventListener("pointerup", release)
          document.removeEventListener("pointercancel", release)
        })
    )
  )
})

const { app, run } = start(volume)
drawInto(root, { app, view })
Effect.runFork(
  run.pipe(
    Effect.provideService(Pointer, pointer),
    // The failure of a program that dies is reported; an interruption is no crash.
    Effect.tapCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause)))
  )
)
