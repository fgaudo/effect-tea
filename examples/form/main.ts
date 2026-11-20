import { type App, run } from "@fgaudo/effect-tea"
import { Draw } from "@fgaudo/effect-tea/react"
import { renderInto as renderWithSnabbdom } from "@fgaudo/effect-tea/snabbdom"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { form, type Message, type Model } from "./form.ts"
import { Storage, StorageError } from "./storage.ts"
import { view as reactView } from "./view-react.tsx"
import { view as snabbdomView } from "./view-snabbdom.ts"

const element = (id: string) => {
  const found = document.getElementById(id)
  if (found === null) throw new Error(`index.html has no #${id} element`)
  return found
}

// A slow storage that refuses "error", to show a failure.
const storage = Storage.of({
  save: (name) =>
    Effect.sleep("500 millis").pipe(
      Effect.andThen(name === "error" ? Effect.fail(new StorageError({ cause: name })) : Effect.void)
    )
})

// React draws the handle the run gives its renderer: the run is started here, as snabbdom's alone would be.
const root = createRoot(element("react"))
const drawWithReact = (app: App<Model, Message>) =>
  Effect.andThen(
    Effect.sync(() => root.render(createElement(Draw<Model, Message>, { app, view: reactView }))),
    Effect.never
  )

// One run, drawn by both renderers over the same handle: what is typed or saved in either is drawn by both.
Effect.runFork(
  run(form, (app) =>
    Effect.all([renderWithSnabbdom(element("snabbdom"), snabbdomView)(app), drawWithReact(app)], {
      concurrency: "unbounded",
      discard: true
    })).pipe(
      Effect.provideService(Storage, storage),
      // The failure of a program that dies is reported; an interruption is no crash.
      Effect.tapCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause)))
    )
)
