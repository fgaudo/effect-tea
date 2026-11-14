import { run } from '@fgaudo/effect-tea'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import { renderInto } from '../snabbdom.ts'
import { view } from './view.ts'
import { volume } from './volume.ts'

const root = document.getElementById('app')
if (root === null) throw new Error('index.html has no #app element')

Effect.runFork(
  run(volume, renderInto(root, view)).pipe(
    // The failure of a program that dies is reported; an interruption is no crash.
    Effect.tapCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause))),
  ),
)
