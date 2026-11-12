import { run } from '@fgaudo/effect-tea'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import { renderInto } from '../snabbdom.ts'
import { form } from './form.ts'
import { Storage, StorageError } from './storage.ts'
import { view } from './view.ts'

const root = document.getElementById('app')
if (root === null) throw new Error('index.html has no #app element')

// A slow storage that refuses "error", to show a failure.
const storage = Storage.of({
  save: (name) =>
    Effect.sleep('500 millis').pipe(
      Effect.andThen(name === 'error' ? Effect.fail(new StorageError({ cause: name })) : Effect.void),
    ),
})

Effect.runFork(
  run(form, renderInto(root, view)).pipe(
    Effect.provideService(Storage, storage),
    // The failure of a program that dies is reported; an interruption is no crash.
    Effect.tapCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause))),
  ),
)
