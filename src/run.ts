import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import * as Engine from './engine.ts'
import type { Dispatch } from './offer.ts'
import { modelOf, type Program, runCommandOf, subscriptionsOf } from './program.ts'

/** What a renderer draws: a model, and the dispatch bound to the state it was made from. */
export type Frame<Model, Message> = Readonly<{ model: Model; dispatch: Dispatch<Message> }>

/**
 * Runs `program` and hands its frames to `render`, the renderer's own loop. Each frame's dispatch is bound to
 * the state the frame was drawn from: a rejected message that this state accepted is stale and ignored, one
 * that this state rejects too is a bug. A renderer slower than the program gets only the latest frame. Ends
 * when `render` ends, and fails with the first defect of the program or of the renderer (or with
 * `RejectedMessage`): whoever runs it reports the failure (e.g. with `Effect.tapCause`) and lets the app crash.
 */
export const run = <State, Model, Message, Command, R, RR, K>(
  program: Program<State, Model, Message, Command, R, never, K>,
  render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void, never, RR>,
  options: Engine.RunOptions<NoInfer<Message>, NoInfer<State>, NoInfer<Command>>,
): Effect.Effect<void, never, R | RR> =>
  Effect.gen(function*() {
    const engine = yield* Engine.make({
      ...options,
      init: program.init,
      update: program.update,
      runCommand: runCommandOf(program),
      subscriptions: subscriptionsOf(program),
    })
    const makeModel = modelOf(program)
    // A frame that a newer one has replaced would be drawn for nothing.
    const frames = engine.states.pipe(
      Stream.buffer({ capacity: 1, strategy: 'sliding' }),
      Stream.map((frame) => lazyFrame(() => makeModel(frame.state), engine.dispatchFrom(frame))),
    )
    yield* Effect.raceFirst(engine.await, render(frames))
  }).pipe(Effect.scoped)

/**
 * A frame whose model is made the first time it is read, then kept: a renderer that skips frames (e.g. one
 * frame per animation frame) never pays for the models it does not draw, whose offers each run `update`.
 */
const lazyFrame = <Model, Message>(makeModel: () => Model, dispatch: Dispatch<Message>): Frame<Model, Message> => {
  let made: Readonly<{ model: Model }> | undefined
  return {
    get model() {
      made ??= { model: makeModel() }
      return made.model
    },
    dispatch,
  }
}
