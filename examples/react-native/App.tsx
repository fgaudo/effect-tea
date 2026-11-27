import { type Fork, Host } from "@fgaudo/effect-tea/react"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"
import { BackHandler } from "react-native"
import { counter } from "../counter/counter.ts"
import { form } from "../form/form.ts"
import { Storage, StorageError } from "../form/storage.ts"
import { BackButton, notes } from "./notes.ts"
import { counterView, formView, notesView } from "./views.tsx"

// A slow storage that refuses "error", to show a failure.
const storage = Storage.of({
  save: (name) =>
    Effect.sleep("500 millis").pipe(
      Effect.andThen(name === "error" ? Effect.fail(new StorageError({ cause: name })) : Effect.void)
    )
})

const fork: Fork<Storage> = (run) => Effect.runFork(Effect.provideService(run, Storage, storage))

// The device's back button: a press is taken while the program listens, and goes to the system otherwise.
const backButton = BackButton.of({
  presses: Stream.callback<void>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        BackHandler.addEventListener("hardwareBackPress", () => {
          Queue.offerUnsafe(queue, undefined)
          return true
        })
      ),
      (listener) => Effect.sync(() => listener.remove())
    )
  )
})

const forkNotes: Fork<BackButton> = (run) => Effect.runFork(Effect.provideService(run, BackButton, backButton))

// The application: each program is started by its `Host`, and runs while it is mounted. A run that dies is thrown to
// the nearest error boundary, and with none React Native's handler of an error that nothing caught.
export const App = () => (
  <>
    <Host program={counter} view={counterView} />
    <Host program={form} view={formView} fork={fork} />
    <Host program={notes} view={notesView} fork={forkNotes} />
  </>
)
