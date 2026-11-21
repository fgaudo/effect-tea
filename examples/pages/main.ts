import { start } from "@fgaudo/effect-tea"
import { drawInto } from "@fgaudo/effect-tea/snabbdom"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import { app } from "./app.ts"
import { view } from "./view.ts"

const root = document.getElementById("app")
if (root === null) throw new Error("index.html has no #app element")

const { app: handle, run } = start(app)
drawInto(root, { app: handle, view })
Effect.runFork(
  run.pipe(
    // The failure of a program that dies is reported; an interruption is no crash.
    Effect.tapCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause)))
  )
)
