// The bridge to React, the entry `@fgaudo/effect-tea/react`. React hosts the program (`docs/records/hosted-react.md`),
// and reads the model of the current state with `useSyncExternalStore(app.subscribe, app.model)`: a view draws native
// controlled elements as React's own documentation draws them, `value` and `onChange`, and a handler calls `dispatch`
// itself. The state has changed when the handler
// returns, as a controlled element asks. No store of frames, no `flushSync`, no animation frame, and no rule of the
// library's for an input's element. Two components: `Host`, which starts the run as it mounts, and `Draw`, which draws
// a run the application starts itself from the `App` its renderer is given.
// Checked with react and react-dom 19.3.1, the start of their peer range; the daily job runs its tests with the newest
// React 19.
/**
 * The bridge to React: draws a program with React and React DOM 19.3.1 or a newer 19.x, which you install beside the
 * package.
 *
 * @module @fgaudo/effect-tea/react
 *
 * @see The guide, "Writing a bridge", "The package's bridges".
 */
import { type App, type Dispatch, type FlagsOption, run, type RunOptions, type Shape } from "@fgaudo/effect-tea"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import type * as Scope from "effect/Scope"
import { createElement, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react"

/**
 * A view of a program, drawn by this renderer: a function of its model, which sends its messages through `dispatch`.
 * React calls it as it renders, so the components it draws may have hooks of their own.
 *
 * @see The guide, "View".
 */
export type View<Model, Message> = (model: Model, dispatch: Dispatch<Message>) => ReactNode

/**
 * Draws the model of the current state of `app` with `view`: for a run the application starts itself, whose renderer
 * hands its `App` to React. It renders again for each new state, and draws the model of the state current when it
 * renders.
 *
 * React may make the model of each new state as it is told of it, in the call that sent the message: a slow
 * `makeModel` then holds up that call. This is described, and not promised.
 *
 * @example
 * ```ts
 * const render = (app: App<Model, Message>) =>
 *   Effect.andThen(Effect.sync(() => root.render(createElement(Draw<Model, Message>, { app, view }))), Effect.never)
 * Effect.runFork(run(counter, render))
 * ```
 *
 * @see The guide, "Writing a bridge", "The handle".
 * @see The guide, "Guarantees", "With the bridge to React, `makeModel` may run for each new state, in the call that sends its message".
 */
export const Draw = <Model, Message>({
  app,
  view
}: {
  /** The handle on the running program that the renderer is given. */
  readonly app: App<Model, Message>
  /** Draws its model. */
  readonly view: View<Model, Message>
}): ReactNode => view(useSyncExternalStore(app.subscribe, app.model), app.dispatch)

/**
 * How the application runs the program: `Effect.runFork` by default, or the `runFork` of a `ManagedRuntime` that gives
 * the program's services.
 *
 * @see The guide, "Guarantees", "With the bridge to React, a run that dies is thrown to the nearest error boundary".
 */
export type Fork<R> = (effect: Effect.Effect<void, never, R>) => Fiber.Fiber<void, unknown>

/**
 * What `Host` takes: `run`'s program and options, how to fork the run, and its view.
 *
 * @see The guide, "Running", "Options".
 */
export type HostProps<State, Model, Message, Command, RC, RS, Flags> =
  & {
    /** The program to run. */
    readonly program: Shape<State, Model, Message, Command, RC, RS, never, never, Flags>
    /** Draws its model. */
    readonly children: View<Model, Message>
    /** What is drawn before the run has started its renderer. */
    readonly fallback?: ReactNode
  }
  & ([Flags] extends [never] ? { readonly options?: RunOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>> }
    : {
      readonly options:
        & RunOptions<NoInfer<State>, NoInfer<Message>, NoInfer<Command>>
        & FlagsOption<NoInfer<Flags>>
    })
  // Asked for whenever the run needs services, which only the application can give.
  & ([Exclude<RC | RS, Scope.Scope>] extends [never] ? { readonly fork?: Fork<never> }
    : { readonly fork: Fork<Exclude<RC | RS, Scope.Scope>> })

type Died = { readonly error: unknown }

/**
 * Runs a program while it is mounted, and draws the model of its current state with `children`, `fallback` before the
 * run has started its renderer.
 *
 * - The run starts as `Host` mounts, with the `program`, the `options` and the `fork` of its first render, and is
 *   interrupted as it unmounts. Give it a new `key` to start the program anew.
 * - The run lives as long as `Host`'s effect: React's `<Activity>` and StrictMode end it, and the program starts again
 *   from `init`. For a state that outlives a component, start the run yourself, and draw it with `Draw`.
 * - A run that fails, or dies, throws what it ended with (`Cause.squash`: a `ProgramDefect` for a defect) as `Host`
 *   renders, for the nearest error boundary. One that ends so once `Host` has unmounted is given to `reportError`.
 *   Whatever `fork` handles around the run is not thrown or reported again.
 *
 * @example
 * ```tsx
 * createRoot(root).render(<Host program={counter}>{view}</Host>)
 * ```
 *
 * @see The guide, "View".
 * @see The guide, "Writing a bridge", "A controlled element".
 * @see The guide, "Guarantees", "With the bridge to React, the run lives as long as the effect that starts it".
 * @see The guide, "Guarantees", "With the bridge to React, a run that dies is thrown to the nearest error boundary".
 */
export const Host = <State, Model, Message, Command = never, RC = never, RS = never, Flags = never>(
  props: HostProps<State, Model, Message, Command, RC, RS, Flags>
): ReactNode => {
  const [app, setApp] = useState<App<Model, Message> | undefined>(undefined)
  const [died, setDied] = useState<Died | undefined>(undefined)
  const first = useRef(props)
  useEffect(() => {
    const { program, options, fork } = first.current
    // `run`'s options are checked by `HostProps`, which the rest of `run`'s signature cannot see here.
    const start = run as unknown as (
      program: unknown,
      render: (app: App<Model, Message>) => Effect.Effect<void>,
      options: unknown
    ) => Effect.Effect<void, never, never>
    // The renderer only hands the `App` to React, and holds the run until it is interrupted. React ignores the state
    // of a component that has unmounted.
    const render = (handle: App<Model, Message>) =>
      Effect.andThen(Effect.sync(() => setApp(() => handle)), Effect.never)
    const forkRun: Fork<never> = fork ?? ((effect) => Effect.runFork(effect))
    const fiber = forkRun(start(program, render, options))
    let mounted = true
    // The fiber `fork` returns, so that what the application handles around the run is not thrown or reported again.
    Effect.runFork(Effect.flatMap(Fiber.await(fiber), (exit) =>
      Effect.sync(() => {
        if (!Exit.isFailure(exit) || Cause.hasInterruptsOnly(exit.cause)) return
        const error = Cause.squash(exit.cause)
        if (mounted) setDied({ error })
        else reportError(error)
      })))
    return () => {
      mounted = false
      Effect.runFork(Fiber.interrupt(fiber))
    }
  }, [])
  if (died !== undefined) throw died.error
  return app === undefined
    ? (props.fallback ?? null)
    : createElement(Draw<Model, Message>, { app, view: props.children })
}
