// The run of `docs/records/synchronous-dispatch.md`, written beside `src/run.ts` until the swap of its stage 4: a
// renderer is given a handle on the running program, in place of a stream of frames.
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import type * as Scope from "effect/Scope"
import * as Core from "../core.ts"
import type { RunOptions } from "../engine.ts"
import { type FlagsOption, runCommandOf, type Shape, startOf } from "../program.ts"
import * as Shell from "../shell.ts"
import type { Dispatch } from "./dispatch.ts"
import * as Engine from "./engine.ts"

/**
 * What the renderer gets of a running program.
 *
 * - `model()` is the model of the current state, made when it is read, once for each state, by its identity. When
 *   `makeModel` throws, the defect is recorded in `'render'`, once for each state, and `model()` throws that defect.
 * - `subscribe(listener)` tells `listener` of each new state, once it is the current one, and returns what stops it.
 *   No listener is told of a rejected message, nor of the very same state.
 * - `dispatch(message)` applies the message before it returns: `update` has heard it, and `model()` is then the model
 *   of the state it made. One sent while another is being applied, as a listener sends one, is applied right after it.
 */
export interface App<Model, Message> {
  readonly model: () => Model
  readonly subscribe: (listener: () => void) => () => void
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
  // of in one place, as in `src/run.ts`.
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
    // Called at most once, in a run that died as it started too, as in `src/run.ts`.
    const rendering = Effect.suspend(() => render(app)).pipe(
      Shell.scopedIn(deaths, "render", undefined, isModels),
      Shell.rootedIn("render"),
      deaths.recorded,
      Effect.updateContext(Shell.withExternalSpan<Exclude<RR, Scope.Scope>>)
    )
    // As in `src/run.ts`: however the run ends, it stops the engine first, so that nothing the renderer sends as it
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
 */
export const run = <State, Model, Message, Command = never, RC = never, RS = never, RR = never, Flags = never>(
  program: Shape<State, Model, Message, Command, RC, RS, never, never, Flags>,
  render: (app: App<Model, Message>) => Effect.Effect<void, never, RR>,
  ...[options = {}]: [Flags] extends [never]
    ? [options?: RunOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>>]
    : [options: RunOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>> & FlagsOption<NoInfer<Flags>>]
): Effect.Effect<void, never, Exclude<RC | RS | RR, Scope.Scope>> =>
  Effect.flatMap(Shell.makeDeaths(() => true), (deaths) => runWith(program, render, options, deaths))
