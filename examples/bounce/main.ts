import { run } from '@fgaudo/effect-tea'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import * as Queue from 'effect/Queue'
import * as Stream from 'effect/Stream'
import { alphaOf, bounce, type Lead, Screen } from './bounce.ts'
import { renderInterpolated } from './interpolated.ts'
import { view } from './view.ts'

const root = document.getElementById('app')
if (root === null) throw new Error('index.html has no #app element')

// How far the loop of steps has gone: written by the loop after each frame of the screen, read by the renderer.
let lead: Lead = { step: 0, alpha: 0 }

// The instants of the screen's frames, from `requestAnimationFrame`, the clock the renderer draws by too.
const screen = Screen.of({
  frames: Stream.callback<number>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const frame = { id: 0 }
        const next = (now: number) => {
          Queue.offerUnsafe(queue, now)
          frame.id = requestAnimationFrame(next)
        }
        frame.id = requestAnimationFrame(next)
        return frame
      }),
      (frame) => Effect.sync(() => cancelAnimationFrame(frame.id)),
    )
  ),
  reached: (reached) =>
    Effect.sync(() => {
      lead = reached
    }),
})

Effect.runFork(
  run(
    bounce,
    renderInterpolated(
      root,
      view,
      (model) => model.ball._tag === 'Flying' ? Opt.some(alphaOf(model.ball.step, lead)) : Opt.none(),
    ),
    { flags: { dt: 1000 / 60 } },
  ).pipe(
    Effect.provideService(Screen, screen),
    // The failure of a program that dies is reported; an interruption is no crash.
    Effect.tapCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause))),
  ),
)
