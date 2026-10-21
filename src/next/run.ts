import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import * as Engine from '../engine.ts'
import { runCommandOf, subscriptionsOf } from '../program.ts'
import { type Dispatch, tokenOf } from './offer.ts'
import { type Program, rootOffers } from './program.ts'

/** What a renderer draws: a model, and the dispatch of the run, the very same function for every frame. */
export type Frame<Model> = Readonly<{ model: Model; dispatch: Dispatch }>

/**
 * Runs `program` and hands its frames to `render`. An offer is verified when its model is made; a rejected
 * one is stale and ignored, but for a typed value `update` rejected when it was typed, a bug handled as
 * `onRejected` says.
 */
export const run = <State, Model, Message, Command, R, RR, K>(
  program: Program<State, Model, Message, Command, R, never, K>,
  render: (frames: Stream.Stream<Frame<Model>>) => Effect.Effect<void, never, RR>,
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
    const dispatch: Dispatch = (offered) => {
      const token = tokenOf(offered)
      return engine.dispatchOffer({ ...token, message: token.message as Message })
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
    yield* Effect.raceFirst(engine.await, render(frames))
  }).pipe(Effect.scoped)

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
