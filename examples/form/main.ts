import { run } from '@fgaudo/effect-tea'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import { renderInto as renderWithReact } from '../bridges/react.ts'
import { renderInto as renderWithSnabbdom } from '../bridges/snabbdom.ts'
import { together } from '../bridges/together.ts'
import { form } from './form.ts'
import { Storage, StorageError } from './storage.ts'
import { view as reactView } from './view-react.tsx'
import { view as snabbdomView } from './view-snabbdom.ts'

const element = (id: string) => {
  const found = document.getElementById(id)
  if (found === null) throw new Error(`index.html has no #${id} element`)
  return found
}

// A slow storage that refuses "error", to show a failure.
const storage = Storage.of({
  save: (name) =>
    Effect.sleep('500 millis').pipe(
      Effect.andThen(name === 'error' ? Effect.fail(new StorageError({ cause: name })) : Effect.void),
    ),
})

// One run, drawn by both renderers: what is typed or saved in either is drawn by both.
Effect.runFork(
  run(
    form,
    together(renderWithSnabbdom(element('snabbdom'), snabbdomView), renderWithReact(element('react'), reactView)),
  ).pipe(
    Effect.provideService(Storage, storage),
    // The failure of a program that dies is reported; an interruption is no crash.
    Effect.tapCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause))),
  ),
)
