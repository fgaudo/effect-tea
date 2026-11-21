import { start } from "@fgaudo/effect-tea"
import { Draw } from "@fgaudo/effect-tea/react"
import { drawInto } from "@fgaudo/effect-tea/snabbdom"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { counter, type Message, type Model } from "./counter.ts"
import { view as reactView } from "./view-react.tsx"
import { view as snabbdomView } from "./view-snabbdom.ts"

const element = (id: string) => {
  const found = document.getElementById(id)
  if (found === null) throw new Error(`index.html has no #${id} element`)
  return found
}

// One program, started once and drawn by both renderers over the same handle: a click in either is drawn by both.
const { app, run } = start(counter)
drawInto(element("snabbdom"), snabbdomView)(app)
createRoot(element("react")).render(createElement(Draw<Model, Message>, { app, view: reactView }))
Effect.runFork(
  run.pipe(
    // The failure of a program that dies is reported; an interruption is no crash.
    Effect.tapCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause)))
  )
)
