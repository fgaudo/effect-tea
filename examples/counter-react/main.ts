import { run } from '@fgaudo/effect-tea'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import { counter } from '../counter/counter.ts'
import { view as snabbdomView } from '../counter/view.ts'
import { renderInto as renderWithReact } from '../bridges/react.ts'
import { renderInto as renderWithSnabbdom } from '../bridges/snabbdom.ts'
import { together } from '../bridges/together.ts'
import { view as reactView } from './view.tsx'

const element = (id: string) => {
  const found = document.getElementById(id)
  if (found === null) throw new Error(`index.html has no #${id} element`)
  return found
}

// One run, drawn by both renderers: a click in either is drawn by both.
Effect.runFork(
  run(
    counter,
    together(renderWithSnabbdom(element('snabbdom'), snabbdomView), renderWithReact(element('react'), reactView)),
  ).pipe(
    // The failure of a program that dies is reported; an interruption is no crash.
    Effect.tapCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause))),
  ),
)
