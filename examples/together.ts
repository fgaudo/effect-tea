import type { Frame } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'

// One run drawn by two renderers at once, for `counter` and `form`: they draw their programs with snabbdom and with
// React, one under the other, so that what either sends is drawn by both. A renderer is a function of the run's frames,
// so two make one with Effect's combinators alone. `broadcastN` hands each frame to both, and, with the `suspend`
// strategy and a capacity of one, takes the next only once the slower has taken this one: the run keeps the latest
// frame meanwhile, as it does for one renderer, and makes a model only for a frame that both draw. If either dies, the
// other is interrupted, and the run dies with it.

/** The renderer `run` takes, which draws each frame with `first` and with `second`: it ends when both have ended. */
export const together =
  <Model, Message, R1, R2>(
    first: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void, never, R1>,
    second: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void, never, R2>,
  ) =>
  (frames: Stream.Stream<Frame<Model, Message>>) =>
    Stream.broadcastN(frames, { n: 2, capacity: 1, strategy: 'suspend' }).pipe(
      Effect.flatMap(([toFirst, toSecond]) =>
        Effect.all([first(toFirst), second(toSecond)], { concurrency: 'unbounded', discard: true })
      ),
      Effect.scoped,
    )
