import * as BrowserRuntime from '@effect/platform-browser/BrowserRuntime'
import { run } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import { renderInto } from '../snabbdom.ts'
import { Bell } from './timer.ts'
import { timers } from './timers.ts'
import { view } from './view.ts'

const root = document.getElementById('app')
if (root === null) throw new Error('index.html has no #app element')

// #region bell
// A short beep, made with the Web Audio API.
const bell = Bell.of({
  ring: Effect.sync(() => {
    const audio = new AudioContext()
    const tone = audio.createOscillator()
    tone.connect(audio.destination)
    tone.start()
    tone.stop(audio.currentTime + 0.3)
    tone.onended = () => void audio.close()
  }),
})

BrowserRuntime.runMain(run(timers, renderInto(root, view)).pipe(Effect.provideService(Bell, bell)))
// #endregion bell
