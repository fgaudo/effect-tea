import { type Fork, Host } from "@fgaudo/effect-tea/react"
import * as Effect from "effect/Effect"
import { counter } from "../counter/counter.ts"
import { form } from "../form/form.ts"
import { Storage, StorageError } from "../form/storage.ts"
import { counterView, formView } from "./views.tsx"

// A slow storage that refuses "error", to show a failure.
const storage = Storage.of({
  save: (name) =>
    Effect.sleep("500 millis").pipe(
      Effect.andThen(name === "error" ? Effect.fail(new StorageError({ cause: name })) : Effect.void)
    )
})

const fork: Fork<Storage> = (run) => Effect.runFork(Effect.provideService(run, Storage, storage))

// The application: each program is started by its `Host`, and runs while it is mounted. A run that dies is thrown to
// the nearest error boundary, and with none React Native's handler of an error that nothing caught.
export const App = () => (
  <>
    <Host program={counter} view={counterView} />
    <Host program={form} view={formView} fork={fork} />
  </>
)
