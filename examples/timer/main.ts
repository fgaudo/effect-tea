import { start } from "@fgaudo/effect-tea"
import { drawInto } from "@fgaudo/effect-tea/snabbdom"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import { namedTimers } from "./named-timers.ts"
import { Bell } from "./timer.ts"
import { namedTimersView } from "./view.ts"

const root = document.getElementById("app")
if (root === null) throw new Error("index.html has no #app element")

// #region bell
// A short beep, made with the Web Audio API.
const bell = Bell.of({
  ring: Effect.sync(() => {
    const audio = new AudioContext()
    const tone = audio.createOscillator()
    tone.connect(audio.destination)
    tone.start()
    tone.stop(audio.currentTime + 0.3)
    tone.onended = () => void audio.close()
  })
})

const { app, run } = start(namedTimers)
drawInto(root, namedTimersView)(app)
Effect.runFork(
  run.pipe(
    Effect.provideService(Bell, bell),
    // The failure of a program that dies is reported; an interruption is no crash.
    Effect.tapCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause)))
  )
)
// #endregion bell
