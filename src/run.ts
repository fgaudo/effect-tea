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
 * One frame for the renderer to draw.
 *
 * `run` hands its renderer a stream of them.
 *
 * - A message that returns the very same state draws no new frame. A model is made only for the frames the renderer
 *   pulls.
 * - `seen` counts the dispatched messages, rejected ones included, but no message of a command or a subscription.
 *   The last frame may have seen fewer messages than were dispatched: never wait for it to see them all.
 * - `dispatch` is the very same function in every frame.
 *
 * @see The guide, "Guarantees", "Frames cost only what is drawn".
 * @see The guide, "Guarantees", "A frame says what it has seen".
 * @see The guide, "Running", "A frame's `dispatch` is the very same function in every frame".
 */
export type Frame<Model, Message> = {
  /** What the view draws, made from the frame's state. */
  readonly model: Model
  /** Sends a message to the program. */
  readonly dispatch: Dispatch<Message>
  /** How many dispatched messages the run had taken when the frame's state was made. */
  readonly seen: number
}

/**
 * `run`, with its options as one value, recording what its fibers die of in `deaths`: for `drive`, which passes the
 * options on as it got them, and ends with what they died of.
 */
// Not an `Effect.fn`: a span of its own would be the one the renderer logs into (see `Shell.withExternalSpan`).
export const runWith = <State, Model, Message, Command, RC, RS, RR, Flags>(
  program: Shape<State, Model, Message, Command, RC, RS, never, never, Flags>,
  render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void, never, RR>,
  options: RunOptions<Message, State, Command> & Readonly<{ flags?: unknown }>,
  deaths: Shell.Deaths,
): Effect.Effect<void, never, Exclude<RC | RS | RR, Scope.Scope>> =>
  // The renderer, the fiber of the run as it starts the engine, and the engine's fibers record what they die of in
  // one place: the defects come first in the cause, in the order they died, then the rest of what the run ended with
  // (an interruption by whoever runs it), but for the defects already among them, by their identity.
  Effect.uninterruptibleMask((restore) =>
    Effect.exit(restore(running(program, render, options, deaths))).pipe(
      Effect.flatMap((exit) => Core.endedWith(deaths.all(), exit)),
    )
  )

const running = Effect.fnUntraced(
  function*<State, Model, Message, Command, RC, RS, RR, Flags>(
    program: Shape<State, Model, Message, Command, RC, RS, never, never, Flags>,
    render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void, never, RR>,
    options: RunOptions<Message, State, Command> & Readonly<{ flags?: unknown }>,
    deaths: Shell.Deaths,
  ): Effect.fn.Return<void, never, RC | RS | RR | Scope.Scope> {
    const { flags, ...runOptions } = options
    // A step is data: only an `init` that makes it from the flags can throw.
    const init = yield* Effect.sync(() => startOf(program.init, flags)).pipe(Shell.diesIn('init'), deaths.recorded)
    const engine = yield* Engine.make<State, Message, Command, RC | RS, unknown>({
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
    // whichever fiber runs it, unawaited. Its release comes before the engine's, acquired after it in the same scope,
    // which runs its finalizers in the reverse order they were added. Forked in the acquisition, where nothing
    // interrupts, the renderer is interruptible all the same (both in `docs/premises.md`).
    const renderer = yield* Effect.acquireRelease(
      Effect.forkChild(rendering),
      (renderer) =>
        engine.stop.pipe(Effect.andThen(Shell.stopping(renderer))),
    )
    yield* Effect.raceFirst(engine.died, Fiber.await(renderer)).pipe(Effect.andThen(engine.report))
  },
  Effect.scoped,
)

/**
 * Runs a program, and hands its frames to `render`.
 *
 * - A renderer slower than the program only gets the latest frame. The run ends when the renderer ends.
 * - The run takes one message at a time, in the order they were queued. The next message waits until the step of the
 *   one before is over, its releases included. So keep releases quick.
 * - A message that `update` rejects is ignored, and the state stays as it was.
 * - Each command, each subscription and the renderer has a scope of its own. What one acquires is released when it
 *   ends, never while it still runs.
 * - The span of whoever runs it does not keep what the run's fibers log.
 * - A defect anywhere ends the run, which dies with a `ProgramDefect`. A command, a subscription, the renderer or an
 *   option that interrupts itself is a defect too. Reporting the crash is the job of the app around the run.
 *
 * @param program - The program to run, one without events.
 * @param render - Draws each frame it takes from the stream.
 * @param options - `flags`, when the program has them, and the options of {@link RunOptions}.
 *
 * @example
 * ```ts
 * Effect.runFork(run(counter, renderInto(root, view)))
 * ```
 *
 * @see The guide, "Running", "In short".
 * @see The guide, "Guarantees", "One message at a time, in the order they were queued".
 * @see The guide, "Guarantees", "Outdated clicks are harmless".
 * @see The guide, "Guarantees", "Nothing outlives what acquired it".
 * @see The guide, "Guarantees", "Logs do not pile up in a span".
 * @see The guide, "Guarantees", "Nothing ends in silence".
 */
export const run = <State, Model, Message, Command = never, RC = never, RS = never, RR = never, Flags = never>(
  program: Shape<State, Model, Message, Command, RC, RS, never, never, Flags>,
  render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void, never, RR>,
  ...[options = {}]: [Flags] extends [never]
    ? [options?: RunOptions<NoInfer<Message>, NoInfer<State>, NoInfer<Command>>]
    : [options: RunOptions<NoInfer<Message>, NoInfer<State>, NoInfer<Command>> & FlagsOption<NoInfer<Flags>>]
): Effect.Effect<void, never, Exclude<RC | RS | RR, Scope.Scope>> =>
  Effect.flatMap(Shell.makeDeaths(() => true), (deaths) => runWith(program, render, options, deaths))
