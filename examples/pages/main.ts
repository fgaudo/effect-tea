import * as BrowserRuntime from '@effect/platform-browser/BrowserRuntime'
import { run } from '@fgaudo/effect-tea'
import { renderInto } from '../snabbdom.ts'
import { app } from './app.ts'
import { view } from './view.ts'

const root = document.getElementById('app')
if (root === null) throw new Error('index.html has no #app element')

BrowserRuntime.runMain(run(app, renderInto(root, view)))
