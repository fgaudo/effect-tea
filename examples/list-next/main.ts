import * as BrowserRuntime from '@effect/platform-browser/BrowserRuntime'
import { run } from '@fgaudo/effect-tea/next'
import { renderInto } from '../snabbdom-next.ts'
import { list } from './list.ts'
import { view } from './view.ts'

const root = document.getElementById('app')
if (root === null) throw new Error('index.html has no #app element')

BrowserRuntime.runMain(run(list, renderInto(root, view), { onRejected: 'die' }))
