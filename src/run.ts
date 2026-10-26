import * as Effect from 'effect/Effect'
import type * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import type { Dispatch } from './dispatch.ts'
import * as Engine from './engine.ts'
import { runCommandOf, type Shape, startOf, subscriptionsOf } from './program.ts'

/**
 * What a renderer draws: a model, and the dispatch of the run, the very same function for every frame. The model
 * is made when it is first read, so a frame nobody reads costs nothing: whatever enumerates or copies a frame
 * (a spread, `JSON.stringify`) reads it.
 */
export type Frame<Model, Message> = Readonly<{ model: Model; dispatch: Dispatch<Message> }>

/** What the program starts from: required exactly when it has flags. */
export type FlagsOption<Flags> = [Flags] extends [never] ? Readonly<{ flags?: never }>
  : Readonly<{ flags: Flags }>

/** `run`, with its options as one value: for `drive`, which passes them on as it got them. */
// Untraced: a span of its own would be the one the renderer logs into (see `Engine.withExternalSpan`).
export const runWith = Effect.fnUntraced(
  function*<State, Model, Message, Command, R, RR, Flags>(
    program: Shape<State, Model, Message, Command, R, never, unknown, Flags>,
    render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void, never, RR>,
    options: Engine.RunOptions<Message, State, Command> & Readonly<{ flags?: unknown }>,
  ): Effect.fn.Return<void, never, R | RR | Scope.Scope> {
    const { flags, ...runOptions } = options
    const engine = yield* Engine.make({
      ...runOptions,
      init: startOf(program.init, flags),
      update: program.update,
      runCommand: runCommandOf(program),
      subscriptions: subscriptionsOf(program),
    })
    const frames = engine.states.pipe(
      Stream.buffer({ capacity: 1, strategy: 'sliding' }),
      Stream.map(({ state }) => lazyFrame(() => program.makeModel(state), engine.dispatch)),
    )
    yield* Effect.raceFirst(
      engine.await,
      Effect.scoped(render(frames)).pipe(
        // The model is made when the renderer reads it: a defect of `makeModel` is the renderer's.
        Engine.diesIn('render'),
        Effect.updateContext(Engine.withExternalSpan<Exclude<RR, Scope.Scope>>),
      ),
    )
  },
  Effect.scoped,
)

/**
 * Runs `program` from its `flags`, when it has them, and hands its frames to `render`. A message `update` rejects
 * is ignored: the state it was meant for is gone, or it never applied.
 */
export const run = <State, Model, Message, Command = never, R = never, RR = never, Flags = never>(
  program: Shape<State, Model, Message, Command, R, never, unknown, Flags>,
  render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void, never, RR>,
  ...[options = {}]: [Flags] extends [never]
    ? [options?: Engine.RunOptions<NoInfer<Message>, NoInfer<State>, NoInfer<Command>>]
    : [options: Engine.RunOptions<NoInfer<Message>, NoInfer<State>, NoInfer<Command>> & FlagsOption<NoInfer<Flags>>]
): Effect.Effect<void, never, Exclude<R | RR, Scope.Scope>> => runWith(program, render, options)

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
