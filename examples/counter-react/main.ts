import { run } from '@fgaudo/effect-tea'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import { counter } from '../counter/counter.ts'
import { renderInto } from '../react.ts'
import { view } from './view.tsx'

const root = document.getElementById('app')
if (root === null) throw new Error('index.html has no #app element')

Effect.runFork(
  run(counter, renderInto(root, view)).pipe(
    // The failure of a program that dies is reported; an interruption is no crash.
    Effect.tapCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause))),
  ),
)
