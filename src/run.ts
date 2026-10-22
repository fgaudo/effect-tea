import * as Effect from 'effect/Effect'
import type * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import * as Engine from './engine.ts'
import { type Dispatch, rootOffers, tokenOf } from './offer.ts'
import { runCommandOf, type Shape, subscriptionsOf } from './program.ts'

/** What a renderer draws: a model, and the dispatch of the run, the very same function for every frame. */
export type Frame<Model> = Readonly<{ model: Model; dispatch: Dispatch }>

/**
 * Runs `program` and hands its frames to `render`. An offer is verified when its model is made; a rejected
 * one is stale and ignored, but for a typed value `update` rejected when it was typed, a bug handled as
 * `onRejectedInput` says.
 */
// Untraced: a span of its own would be the one the renderer logs into (see `Engine.withExternalSpan`).
export const run = Effect.fnUntraced(
  function*<State, Model, Message, Command, R, RR>(
    program: Shape<State, Model, Message, Command, R, never, unknown>,
    render: (frames: Stream.Stream<Frame<Model>>) => Effect.Effect<void, never, RR>,
    options: Engine.RunOptions<NoInfer<Message>, NoInfer<State>, NoInfer<Command>>,
  ): Effect.fn.Return<void, never, R | RR | Scope.Scope> {
    const engine = yield* Engine.make({
      ...options,
      init: program.init,
      update: program.update,
      runCommand: runCommandOf(program),
      subscriptions: subscriptionsOf(program),
    })
    const dispatch: Dispatch = (offered) => {
      const { message, ...origin } = tokenOf(offered)
      return engine.dispatchOffer(message as Message, origin)
    }
    const frames = engine.states.pipe(
      Stream.buffer({ capacity: 1, strategy: 'sliding' }),
      Stream.map(({ state, revision }) =>
        lazyFrame(
          () => program.makeModel(state, rootOffers(program.update, state, { run: engine.run, revision })),
          dispatch,
        )
      ),
    )
    yield* Effect.raceFirst(
      engine.await,
      Effect.scoped(render(frames)).pipe(Effect.updateContext(Engine.withExternalSpan<Exclude<RR, Scope.Scope>>)),
    )
  },
  Effect.scoped,
)

const lazyFrame = <Model>(makeModel: () => Model, dispatch: Dispatch): Frame<Model> => {
  let made: Readonly<{ model: Model }> | undefined
  return {
    get model() {
      made ??= { model: makeModel() }
      return made.model
    },
    dispatch,
  }
}
