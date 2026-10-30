import * as BrowserRuntime from '@effect/platform-browser/BrowserRuntime'
import { run } from '@fgaudo/effect-tea'
import { counter } from '../counter/counter.ts'
import { renderInto } from '../react.ts'
import { view } from './view.tsx'

const root = document.getElementById('app')
if (root === null) throw new Error('index.html has no #app element')

BrowserRuntime.runMain(run(counter, renderInto(root, view)))
