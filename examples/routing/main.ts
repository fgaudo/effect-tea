import { start } from "@fgaudo/effect-tea"
import { drawInto } from "@fgaudo/effect-tea/snabbdom"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"
import { Address, routing } from "./routing.ts"
import { view } from "./view.ts"

const root = document.getElementById("app")
if (root === null) throw new Error("index.html has no #app element")

// The browser's history: a push goes to the address without loading it, and each back or forward gives the query of
// the address it went to.
const address = Address.of({
  push: (href) => Effect.sync(() => history.pushState(null, "", href)),
  popped: Stream.callback<string>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const popped = () => Queue.offerUnsafe(queue, location.search)
        window.addEventListener("popstate", popped)
        return popped
      }),
      (popped) => Effect.sync(() => window.removeEventListener("popstate", popped))
    )
  )
})

const { app, run } = start(routing, { flags: { query: location.search } })
drawInto(root, { app, view })
// The page's title is outside the root: drawn from the model too, beside the bridge.
const title = () => {
  document.title = `${app.model().title} · Routing · effect-tea`
}
title()
app.subscribe(title)
Effect.runFork(
  run.pipe(
    Effect.provideService(Address, address),
    // The failure of a program that dies is reported; an interruption is no crash.
    Effect.tapCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause)))
  )
)
