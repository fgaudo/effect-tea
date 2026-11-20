import { run } from "@fgaudo/effect-tea"
import { Frames, makeStore } from "@fgaudo/effect-tea/react"
import { renderInto as renderWithSnabbdom } from "@fgaudo/effect-tea/snabbdom"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { together } from "../together.ts"
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

// React draws the frames that the run hands to a store: the run is started here, as snabbdom's alone would be.
const store = makeStore<Model, Message>()
createRoot(element("react")).render(createElement(Frames<Model, Message>, { store, view: reactView }))

// One run, drawn by both renderers: what is typed or saved in either is drawn by both.
Effect.runFork(
  run(
    form,
    together(renderWithSnabbdom(element("snabbdom"), snabbdomView), store.open())
  ).pipe(
    Effect.provideService(Storage, storage),
    // The failure of a program that dies is reported; an interruption is no crash.
    Effect.tapCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause)))
  )
)
