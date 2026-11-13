import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Opt from 'effect/Option'
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
export const runWith = Effect.fnUntraced(function*<State, Model, Message, Command, R, RR, Flags>(
  program: Shape<State, Model, Message, Command, R, never, unknown, Flags>,
  render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void, never, RR>,
  options: Engine.RunOptions<Message, State, Command> & Readonly<{ flags?: unknown }>,
): Effect.fn.Return<void, never, Exclude<R | RR, Scope.Scope>> {
  // The renderer, the fiber of the run as it starts the engine, and the engine's fibers record what they die of in
  // one place: the defects come first in the cause, in the order they died, then the rest of what the run ended with
  // (an interruption by whoever runs it), but for the defects already among them, by their identity.
  const deaths = yield* Engine.makeDeaths(() => true)
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.exit(restore(running(program, render, options, deaths))).pipe(
      Effect.flatMap((exit) => {
        const dies = deaths.all()
        if (!Arr.isReadonlyArrayNonEmpty(dies)) return exit
        const rest = Exit.isFailure(exit)
          ? exit.cause.reasons.filter((reason) => !(Cause.isDieReason(reason) && deaths.has(reason.defect)))
          : []
        return Effect.failCause(Cause.fromReasons<never>([...dies, ...rest]))
      }),
    )
  )
})

const running = Effect.fnUntraced(
  function*<State, Model, Message, Command, R, RR, Flags>(
    program: Shape<State, Model, Message, Command, R, never, unknown, Flags>,
    render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void, never, RR>,
    options: Engine.RunOptions<Message, State, Command> & Readonly<{ flags?: unknown }>,
    deaths: Engine.Deaths,
  ): Effect.fn.Return<void, never, R | RR | Scope.Scope> {
    const { flags, ...runOptions } = options
    // A step is data: only an `init` that makes it from the flags can throw.
    const init = yield* Effect.sync(() => startOf(program.init, flags)).pipe(Engine.diesIn('init'), deaths.recorded)
    const engine = yield* Engine.make({
      ...runOptions,
      deaths,
      init,
      update: program.update,
      runCommand: runCommandOf(program),
      subscriptions: subscriptionsOf(program),
    })
    const frames = engine.states.pipe(
      Stream.buffer({ capacity: 1, strategy: 'sliding' }),
      Stream.map(({ state }) => lazyFrame(() => program.makeModel(state), engine.dispatch)),
    )
    // Started only in a run that has not died, checked in the thunk that calls it, as `runCommand` is: a subscription
    // of `init` may die while the engine starts.
    const rendering = Effect.suspend(() =>
      Opt.getOrElse(Engine.alive(deaths.dead, () => render(frames)), () => Effect.void)
    ).pipe(
      // The model is made when the renderer reads it: a defect of `makeModel` is the renderer's.
      Engine.scopedIn(deaths, 'render'),
      Effect.updateContext(Engine.withExternalSpan<Exclude<RR, Scope.Scope>>),
    )
    // However the run ends, the renderer is interrupted and awaited before the engine's fibers. Only signals race, so
    // that no defect is lost with the loser: every fiber records what it dies of, the renderer too, and the run
    // reports here what they have died of so far, and what they die of later, while the renderer releases what it
    // holds too, by the end of the engine. Forked where nothing interrupts the run before its end is set: interrupted
    // in between, the run would leave the renderer to the end of whichever fiber runs it, unawaited.
    yield* Effect.uninterruptibleMask((restore) =>
      Effect.flatMap(Effect.forkChild(rendering), (renderer) =>
        restore(Effect.raceFirst(engine.died, Fiber.await(renderer)).pipe(Effect.andThen(engine.report))).pipe(
          Effect.onExit(() => Effect.asVoid(Fiber.interrupt(renderer).pipe(Effect.andThen(Fiber.await(renderer))))),
        ))
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
