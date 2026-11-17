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
 * @remarks
 * From the guide, "Guarantees", "Frames cost only what is drawn":
 *
 * **Frames cost only what is drawn.** A message that returns the very same state draws no new frame. A model is made
 * only for the frames the renderer pulls.
 *
 * From the guide, "Guarantees", "A frame says what it has seen":
 *
 * **A frame says what it has seen.** A frame's `seen` is how many dispatched messages the run had taken when the
 * frame's state was made.
 * - Each message a dispatch sends is numbered, from 1, in the order the run takes it.
 * - `seen` includes rejected ones.
 * - `seen` counts no message of a command or a subscription.
 * - A message that makes no new state draws no frame. So the last frame may have seen fewer messages than were
 *   dispatched: never wait for it to see them all.
 *
 * From the guide, "Running", "A frame's `dispatch` is the very same function in every frame":
 *
 * **A frame's `dispatch` is the very same function in every frame.** So a view memoized on its dispatch is not drawn
 * again because of it.
 */
export type Frame<Model, Message> = Readonly<{
  /** What the view draws, made from the frame's state. */
  model: Model
  /** Sends a message to the program. */
  dispatch: Dispatch<Message>
  /** How many dispatched messages the run had taken when the frame's state was made. */
  seen: number
}>

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
 * @param program - The program to run, one without events.
 * @param render - Draws each frame it takes from the stream.
 * @param options - `flags`, when the program has them, and the options of {@link RunOptions}.
 *
 * @example
 * ```ts
 * Effect.runFork(run(counter, renderInto(root, view)))
 * ```
 *
 * @remarks
 * From the guide, "Running", "In short":
 *
 * `run(program, render, options?)` starts the program and hands `render` a stream of frames. A renderer slower than the
 * program only gets the latest frame. The run ends when the renderer ends. A defect anywhere ends it too: the run dies,
 * and reporting the crash is the job of the app around it.
 *
 * From the guide, "Guarantees", "One message at a time, in the order they were queued":
 *
 * **One message at a time, in the order they were queued.** The run takes the next message only once the step of the
 * one before is over.
 * - The step of a message is its `update`, then `onApplied` or `onIgnored`, its frame, the subscriptions it stops and
 *   starts, and the start of its commands.
 * - What a dispatch sends is queued as it is sent.
 * - A subscription's message is queued as it is emitted.
 * - A command's answer is queued as the command ends.
 *
 * From the guide, "Guarantees", "Outdated clicks are harmless":
 *
 * **Outdated clicks are harmless.** A message that `update` rejects is ignored: the state stays as it was.
 * - This holds however many messages came in between.
 *
 * From the guide, "Guarantees", "Nothing outlives what acquired it":
 *
 * **Nothing outlives what acquired it.** Each command, each subscription and the renderer has a scope of its own.
 * - What one of them acquires is released when it ends.
 * - When the run ends, what it acquires is released once it has been interrupted.
 * - What it acquires is never released while it still runs.
 * - The subscriptions one message stops are released together.
 * - The next message waits for the slowest release, so keep releases quick.
 *
 * From the guide, "Guarantees", "Logs do not pile up in a span":
 *
 * **Logs do not pile up in a span.** What the run's fibers log is not kept by the span of whoever runs it.
 * - Effect keeps each log as an event of the current span until that span ends.
 * - The span of whoever runs it is still the parent of the spans that commands and subscriptions open.
 *
 * From the guide, "Guarantees", "Nothing ends in silence":
 *
 * **Nothing ends in silence.** A subscription that ends sends one last message.
 * - A defect anywhere ends the run. The run dies with it, as a `ProgramDefect` that says where it happened.
 * - A command, a subscription, the renderer or an option that interrupts itself (with `Effect.interrupt`, or by joining
 *   an interrupted fiber) is a defect too.
 * - Only the run, and whoever runs it, interrupt them.
 */
export const run = <State, Model, Message, Command = never, R = never, RR = never, Flags = never>(
  program: Shape<State, Model, Message, Command, R, never, unknown, Flags>,
  render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void, never, RR>,
  ...[options = {}]: [Flags] extends [never]
    ? [options?: RunOptions<NoInfer<Message>, NoInfer<State>, NoInfer<Command>>]
    : [options: RunOptions<NoInfer<Message>, NoInfer<State>, NoInfer<Command>> & FlagsOption<NoInfer<Flags>>]
): Effect.Effect<void, never, Exclude<R | RR, Scope.Scope>> =>
  Effect.flatMap(Shell.makeDeaths(() => true), (deaths) => runWith(program, render, options, deaths))
