// The run: the engine, and a renderer given a handle on the running program (`docs/records/synchronous-dispatch.md`).
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import type * as Scope from "effect/Scope"
import * as Core from "./core.ts"
import type { Dispatch } from "./dispatch.ts"
import type { RunOptions } from "./engine.ts"
import * as Engine from "./engine.ts"
import { type FlagsOption, runCommandOf, type Shape, startOf } from "./program.ts"
import * as Shell from "./shell.ts"

/**
 * What `run` hands the renderer: a handle on the running program.
 *
 * A renderer reads the model when it draws, and is told of each new state in the call that made it. One that draws
 * later reads the latest model when it draws.
 *
 * @example
 * ```ts
 * const render = (app: App<Model, Message>) =>
 *   Effect.sync(() => {
 *     console.log(app.model().count)
 *     app.dispatch(app.model().increment)
 *   })
 * ```
 *
 * @see The guide, "Running", "The renderer gets an `App`".
 * @see The guide, "Running", "A renderer reads the model when it draws".
 * @see The guide, "Writing a bridge", "The handle".
 */
export interface App<Model, Message> {
  /**
   * The model of the current state. It is made when it is read, once for each state, by the state's identity, so the
   * very same state has the very same model. When `makeModel` throws, the defect is a defect in `'render'`, recorded
   * once for each state, and `model()` throws it.
   *
   * @see The guide, "Guarantees", "A model is made only when it is read".
   */
  readonly model: () => Model
  /**
   * Tells `listener` of each new state, once it is the current one, in the call that made it, and returns what stops
   * it. No listener is told of a rejected message, nor of the very same state. A listener that throws is a defect in
   * `'render'`.
   *
   * @see The guide, "Running", "The renderer gets an `App`".
   */
  readonly subscribe: (listener: () => void) => () => void
  /**
   * The program's dispatch: it applies the message before it returns. It is the very same function for the whole run.
   *
   * @see The guide, "Running", "The `dispatch` of the `App` is the very same function for the whole run".
   * @see The guide, "View", "Sending applies the message".
   */
  readonly dispatch: Dispatch<Message>
}

type Made<State, Model> =
  | Readonly<{ state: State; made: true; model: Model }>
  | Readonly<{ state: State; made: false; defect: unknown }>

/**
 * `run`, with its options as one value, recording what its fibers die of in `deaths`: for a testing tool, which passes
 * the options on as it got them, and ends with what they died of.
 */
// Not an `Effect.fn`: a span of its own would be the one the renderer logs into (see `Shell.withExternalSpan`).
export const runWith = <State, Model, Message, Command, RC, RS, RR, Flags>(
  program: Shape<State, Model, Message, Command, RC, RS, never, never, Flags>,
  render: (app: App<Model, Message>) => Effect.Effect<void, never, RR>,
  options: RunOptions<State, Message, Command> & Readonly<{ flags?: unknown }>,
  deaths: Shell.Deaths
): Effect.Effect<void, never, Exclude<RC | RS | RR, Scope.Scope>> =>
  // The renderer, the fiber of the run as it starts the engine, the engine's fibers and its thunk record what they die
  // of in one place: the defects come first in the cause, in the order they died, then the rest of what the run
  // ended with (an interruption by whoever runs it), but for the defects already among them, by their identity.
  Effect.uninterruptibleMask((restore) =>
    Effect.exit(restore(running(program, render, options, deaths))).pipe(
      Effect.flatMap((exit) => Core.endedWith(deaths.all(), exit))
    )
  )

const running = Effect.fnUntraced(
  function*<State, Model, Message, Command, RC, RS, RR, Flags>(
    program: Shape<State, Model, Message, Command, RC, RS, never, never, Flags>,
    render: (app: App<Model, Message>) => Effect.Effect<void, never, RR>,
    options: RunOptions<State, Message, Command> & Readonly<{ flags?: unknown }>,
    deaths: Shell.Deaths
  ): Effect.fn.Return<void, never, RC | RS | RR | Scope.Scope> {
    const { flags, ...runOptions } = options
    // A step is data: only an `init` that makes it from the flags can throw.
    const init = yield* Effect.sync(() => startOf(program.init, flags)).pipe(Shell.diesIn("init"), deaths.recorded)
    // The defects of `makeModel` recorded where a model was read: the renderer's own site takes them as they are, in
    // its fiber and in a listener alike, so that a model that throws is one defect, wherever the renderer reads it.
    const ofModels = new Set<unknown>()
    const isModels = (defect: unknown) => ofModels.has(defect)
    const engine = yield* Engine.make<State, Message, Command, RC | RS, unknown>({
      ...runOptions,
      deaths,
      rendered: isModels,
      init,
      update: program.update,
      runCommand: runCommandOf(program),
      subscriptions: program.subscriptions
    })
    // The last state a model was made of, with its model or the defect `makeModel` threw: a model is made only when it
    // is read, and once for each state, by its identity, a failed one too.
    let last: Made<State, Model> | undefined
    const model = (): Model => {
      const { state } = engine.current()
      if (last?.state !== state) {
        try {
          last = { state, made: true, model: program.makeModel(state) }
        } catch (thrown) {
          // Recorded here, wherever the model is read: in the renderer's fiber, outside any fiber, or in another.
          const defect = Engine.recordThrown(deaths, "render", thrown)
          ofModels.add(defect)
          last = { state, made: false, defect }
        }
      }
      if (last.made) return last.model
      throw last.defect
    }
    const app: App<Model, Message> = { model, subscribe: engine.subscribe, dispatch: engine.dispatch }
    // Called at most once, in a run that died as it started too, as a subscription of `init` may die while the engine
    // starts: the end of the run interrupts it, as it does any effect of the program (`docs/invariants.md`).
    const rendering = Effect.suspend(() => render(app)).pipe(
      Shell.scopedIn(deaths, "render", undefined, isModels),
      Shell.rootedIn("render"),
      deaths.recorded,
      Effect.updateContext(Shell.withExternalSpan<Exclude<RR, Scope.Scope>>)
    )
    // However the run ends, it stops the engine first, so that nothing the renderer sends as it
    // releases is applied, then the renderer, before the engine's other fibers. The fork and how the run stops it are
    // one acquisition, which nothing interrupts in between.
    const renderer = yield* Effect.acquireRelease(
      Effect.forkChild(rendering),
      (renderer) => engine.stop.pipe(Effect.andThen(Shell.stopping(renderer)))
    )
    yield* Effect.raceFirst(engine.died, Fiber.await(renderer)).pipe(Effect.andThen(engine.report))
  },
  Effect.scoped
)

/**
 * Runs a program, and hands its renderer an {@link App}: the model of the current state, a notice of each new state,
 * and a dispatch that applies its message before it returns.
 *
 * - The run ends when the renderer ends.
 * - One message at a time, in the order they were sent. A message is applied in the call that sends it. The
 *   subscriptions it stops and starts, and the start of its commands, follow in the run's own fiber, in the order of
 *   the states. So the state is ahead of its effects.
 * - The run writes no log of its own.
 * - A message that `update` rejects is ignored, and the state stays as it was.
 * - Each command, each subscription and the renderer has a scope of its own. What one acquires is released when it
 *   ends, never while it still runs. The next message does not wait for a release, but the effects of the next state
 *   do. So keep releases quick.
 * - The span of whoever runs it does not keep what the run's fibers log.
 * - A defect anywhere ends the run, which dies with a `ProgramDefect`. A command, a subscription, the renderer or an
 *   option that interrupts itself is a defect too. Reporting the crash is the job of the app around the run.
 *
 * @param program - The program to run, one without events.
 * @param render - Draws the model of the {@link App} it is given.
 * @param options - `flags`, when the program has them, and the options of {@link RunOptions}.
 *
 * @example
 * ```ts
 * Effect.runFork(run(counter, renderInto(root, view)))
 * ```
 *
 * @see The guide, "Running", "In short".
 * @see The guide, "Guarantees", "One message at a time, in the order they were sent".
 * @see The guide, "Guarantees", "Outdated clicks are harmless".
 * @see The guide, "Guarantees", "Nothing outlives what acquired it".
 * @see The guide, "Guarantees", "Logs do not pile up in a span".
 * @see The guide, "Guarantees", "Nothing ends in silence".
 * @see The guide, "Running", "Logs".
 */
export const run = <State, Model, Message, Command = never, RC = never, RS = never, RR = never, Flags = never>(
  program: Shape<State, Model, Message, Command, RC, RS, never, never, Flags>,
  render: (app: App<Model, Message>) => Effect.Effect<void, never, RR>,
  ...[options = {}]: [Flags] extends [never]
    ? [options?: RunOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>>]
    : [options: RunOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>> & FlagsOption<NoInfer<Flags>>]
): Effect.Effect<void, never, Exclude<RC | RS | RR, Scope.Scope>> =>
  Effect.flatMap(Shell.makeDeaths(() => true), (deaths) => runWith(program, render, options, deaths))
