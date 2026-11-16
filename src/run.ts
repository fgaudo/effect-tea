import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import type * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import * as Core from './core.ts'
import type { Dispatch } from './dispatch.ts'
import * as Engine from './engine.ts'
import type { RunOptions } from './engine.ts'
import { type FlagsOption, runCommandOf, type Shape, startOf, subscriptionsOf } from './program.ts'
import * as Shell from './shell.ts'

/**
 * What a renderer draws: a model, the dispatch of the run, the very same function for every frame, and `seen`, how
 * many of the messages sent through that dispatch the run had taken when the frame's state was made, rejected ones
 * included: a message numbered up to `seen` is one the frame's state has seen, and one numbered after it is not. The
 * model is made as the renderer pulls the frame, so a state the renderer never pulls, being busy as the program moved
 * on, costs nothing.
 */
export type Frame<Model, Message> = Readonly<{ model: Model; dispatch: Dispatch<Message>; seen: number }>

/**
 * `run`, with its options as one value, recording what its fibers die of in `deaths`: for `drive`, which passes the
 * options on as it got them, and ends with what they died of.
 */
// Not an `Effect.fn`: a span of its own would be the one the renderer logs into (see `Shell.withExternalSpan`).
export const runWith = <State, Model, Message, Command, R, RR, Flags>(
  program: Shape<State, Model, Message, Command, R, never, unknown, Flags>,
  render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void, never, RR>,
  options: RunOptions<Message, State, Command> & Readonly<{ flags?: unknown }>,
  deaths: Shell.Deaths,
): Effect.Effect<void, never, Exclude<R | RR, Scope.Scope>> =>
  // The renderer, the fiber of the run as it starts the engine, and the engine's fibers record what they die of in
  // one place: the defects come first in the cause, in the order they died, then the rest of what the run ended with
  // (an interruption by whoever runs it), but for the defects already among them, by their identity.
  Effect.uninterruptibleMask((restore) =>
    Effect.exit(restore(running(program, render, options, deaths))).pipe(
      Effect.flatMap((exit) => Core.endedWith(deaths.all(), exit)),
    )
  )

const running = Effect.fnUntraced(
  function*<State, Model, Message, Command, R, RR, Flags>(
    program: Shape<State, Model, Message, Command, R, never, unknown, Flags>,
    render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void, never, RR>,
    options: RunOptions<Message, State, Command> & Readonly<{ flags?: unknown }>,
    deaths: Shell.Deaths,
  ): Effect.fn.Return<void, never, R | RR | Scope.Scope> {
    const { flags, ...runOptions } = options
    // A step is data: only an `init` that makes it from the flags can throw.
    const init = yield* Effect.sync(() => startOf(program.init, flags)).pipe(Shell.diesIn('init'), deaths.recorded)
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
      // After the buffer, so that a model is made only for the frames the renderer pulls, in the renderer's fiber.
      Stream.map(({ state, seen }) => ({ model: program.makeModel(state), dispatch: engine.dispatch, seen })),
    )
    // Called at most once, in a run that died as it started too, as a subscription of `init` may die while the engine
    // starts: the end of the run interrupts it, as it does any effect of the program (`docs/invariants.md`).
    const rendering = Effect.suspend(() => render(frames)).pipe(
      // The model is made as the renderer pulls its frame: a defect of `makeModel` is the renderer's.
      Shell.scopedIn(deaths, 'render'),
      Effect.updateContext(Shell.withExternalSpan<Exclude<RR, Scope.Scope>>),
    )
    // However the run ends, it stops the loop first, then the renderer is interrupted and awaited, before the engine's
    // other fibers: what the renderer sends as it releases what it holds is not applied, and the program does not go
    // on while it does. Only signals race, so that no defect is lost with the loser: every fiber records what it dies
    // of, the renderer too, and the run reports here what they have died of so far, and what they die of later, while
    // the renderer releases what it holds too, by the end of the engine. The fork and how the run stops it are one
    // acquisition, which nothing interrupts in between: forked apart, the run would leave the renderer to the end of
    // whichever fiber runs it, unawaited. Its release comes before the engine's: its scope is one of its own, which
    // closes before the run's, where the engine is. Forked in the acquisition, where nothing interrupts, the renderer
    // is interruptible all the same (`docs/premises.md`).
    yield* Effect.scoped(Effect.gen(function*() {
      const renderer = yield* Effect.acquireRelease(
        Effect.forkChild(rendering),
        (renderer) =>
          engine.stop.pipe(Effect.andThen(Shell.stopping(renderer))),
      )
      yield* Effect.raceFirst(engine.died, Fiber.await(renderer)).pipe(Effect.andThen(engine.report))
    }))
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
    ? [options?: RunOptions<NoInfer<Message>, NoInfer<State>, NoInfer<Command>>]
    : [options: RunOptions<NoInfer<Message>, NoInfer<State>, NoInfer<Command>> & FlagsOption<NoInfer<Flags>>]
): Effect.Effect<void, never, Exclude<R | RR, Scope.Scope>> =>
  Effect.flatMap(Shell.makeDeaths(() => true), (deaths) => runWith(program, render, options, deaths))
