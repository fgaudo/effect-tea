// A renderer for a program that moves by equal steps: at each frame of the screen, it draws the latest model between
// the step before and the current one, by how far the loop of steps is into the next step. It is the snabbdom bridge's
// `renderInto` (`../bridges/snabbdom.ts`) with a draw loop of its own: that one draws a model once, when the run gives
// it, and this one draws it again at each frame of the screen while the model moves. It draws no input: a program that
// has one is drawn by `renderInto`.
// Checked with snabbdom 3.6.4.
import type { Frame } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import * as Stream from 'effect/Stream'
import { eventListenersModule, init, propsModule, styleModule, type VNode } from 'snabbdom'
import type { View } from '../bridges/snabbdom.ts'

const animationFrame = Effect.callback<void>((resume) => {
  const id = requestAnimationFrame(() => resume(Effect.void))
  return Effect.sync(() => cancelAnimationFrame(id))
})

/**
 * The renderer `run` takes, for `view`, drawn at `alpha`, from 0 for the step before up to 1 for the current one.
 * `alphaOf` says how far the model is drawn at each frame of the screen, or none when it does not move: then it is
 * drawn once, at 1, when the run gives it.
 */
export const renderInterpolated =
  <Model, Message>(
    root: Element,
    view: (alpha: number) => View<Model, Message>,
    alphaOf: (model: Model) => Opt.Option<number>,
  ) =>
  (frames: Stream.Stream<Frame<Model, Message>>) =>
    Effect.suspend(() => {
      const patch = init([propsModule, styleModule, eventListenersModule])
      let tree: Element | VNode = root
      let latest: Frame<Model, Message> | undefined
      let drawn = false
      const draw = Effect.sync(() => {
        if (latest === undefined) return
        const alpha = alphaOf(latest.model)
        if (drawn && Opt.isNone(alpha)) return
        tree = patch(tree, view(Opt.getOrElse(alpha, () => 1))(latest.model, latest.dispatch))
        drawn = true
      })
      return Stream.runForEach(frames, (frame) =>
        Effect.sync(() => {
          latest = frame
          drawn = false
        })).pipe(Effect.raceFirst(Effect.forever(animationFrame.pipe(Effect.andThen(draw)))))
    })
