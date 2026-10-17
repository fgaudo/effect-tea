import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import * as Engine from './engine.ts'
import type { RejectionOptions } from './bug.ts'
import { modelOf, type Program } from './program.ts'
import type { Dispatch } from './view.ts'

/** What a renderer draws: a model, and the dispatch bound to the state it was made from. */
export type Frame<Model, Message> = Readonly<{ model: Model; dispatch: Dispatch<Message> }>

/**
 * How a program runs: what a rejected message from a frame does, and who hears about bugs
 * (`RejectionOptions`, with no default), how messages appear in the logs, and who observes the transitions.
 */
export type RunOptions<Message, K = unknown, State = unknown, Command = unknown> =
  & RejectionOptions<Message, K>
  & Readonly<{
    /** How a message appears in the logs; by default its `_tag`, never its data. */
    describeMessage?: (message: Message) => unknown
    /** How a command appears in the logs; by default its `_tag`, never its data. */
    describeCommand?: (command: Command) => unknown
    /**
     * Hears every message `update` accepts, in order, with the state before and after it and the commands it
     * started (e.g. for devtools, or to record a session). The program waits for it, so it should be quick; a
     * defect in it is a bug.
     */
    onApplied?: (applied: Engine.Applied<State, Message, Command>) => Effect.Effect<void>
  }>

/**
 * Runs `program` and hands its frames to `render`, the renderer's own loop. Each frame's dispatch is bound to
 * the state the frame was drawn from: a rejected message that this state accepted is stale and ignored, one
 * that this state rejects too is a bug. A renderer slower than the program gets only the latest frame. Ends
 * when `render` ends, and fails with the first defect of the program (or `RejectedMessage`), so whoever runs
 * it can let the app crash.
 */
export const run = <State, Model, Message, Command, R, RR, K>(
  program: Program<State, Model, Message, Command, R, never, K>,
  render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void, never, RR>,
  options: RunOptions<NoInfer<Message>, NoInfer<K>, NoInfer<State>, NoInfer<Command>>,
): Effect.Effect<void, never, R | RR> =>
  Effect.gen(function*() {
    const engine = yield* Engine.make({ ...program, ...options })
    const makeModel = modelOf(program)
    // A frame that a newer one has replaced would be drawn for nothing.
    const frames = engine.state$.pipe(
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
