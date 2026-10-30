import * as BrowserRuntime from '@effect/platform-browser/BrowserRuntime'
import { run } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import { form } from '../form/form.ts'
import { Storage, StorageError } from '../form/storage.ts'
import { renderInto } from '../react.ts'
import { view } from './view.tsx'

const root = document.getElementById('app')
if (root === null) throw new Error('index.html has no #app element')

// A slow storage that refuses "error", to show a failure.
const storage = Storage.of({
  save: (name) =>
    Effect.sleep('500 millis').pipe(
      Effect.andThen(name === 'error' ? Effect.fail(new StorageError({ cause: name })) : Effect.void),
    ),
})

BrowserRuntime.runMain(
  run(form, renderInto(root, view)).pipe(Effect.provideService(Storage, storage)),
)
