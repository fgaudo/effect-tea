// The bridge to React, the entry `@fgaudo/effect-tea/react`. React hosts the program (`docs/records/hosted-react.md`),
// and reads the model of the current state with `useSyncExternalStore(app.subscribe, app.model)`: a view draws native
// controlled elements as React's own documentation draws them, `value` and `onChange`, and a handler calls `dispatch`
// itself. The state has changed when the handler
// returns, as a controlled element asks. No store of frames, no `flushSync`, no animation frame, and no rule of the
// library's for an input's element. Two components: `Host`, which starts the program as it first renders and runs it
// while it is mounted, and `Draw`, which draws a program the application starts itself, from its `App`.
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
import {
  type App,
  type Dispatch,
  type FlagsOption,
  type RunOptions,
  type Shape,
  start,
  type Started
} from "@fgaudo/effect-tea"
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
 * Draws the model of the current state of `app` with `view`: for a program the application starts itself. It renders
 * again for each new state, and draws the model of the state current when it renders. It draws it on a server too.
 *
 * React may make the model of each new state as it is told of it, in the call that sent the message: a slow
 * `makeModel` then holds up that call. This is described, and not promised.
 *
 * A `makeModel` that throws is thrown as `Draw` renders, for the nearest error boundary, and the run dies of it too.
 *
 * @example
 * ```tsx
 * const { app, run } = start(counter)
 * createRoot(root).render(<Draw app={app} view={view} />)
 * Effect.runFork(run)
 * ```
 *
 * @see The guide, "Writing a bridge", "The handle".
 * @see The guide, "Guarantees", "With the bridge to React, `Host` and `Draw` draw the first model on a server".
 * @see The guide, "Guarantees", "With the bridge to React, `makeModel` may run for each new state, in the call that sends its message".
 */
export const Draw = <Model, Message>({
  app,
  view
}: {
  /** The handle of a program that was started. */
  readonly app: App<Model, Message>
  /** Draws its model. */
  readonly view: View<Model, Message>
}): ReactNode => view(useSyncExternalStore(app.subscribe, app.model, app.model), app.dispatch)

/**
 * How the application runs the program: `Effect.runFork` by default, or the `runFork` of a `ManagedRuntime` that gives
 * the program's services.
 *
 * @see The guide, "Guarantees", "With the bridge to React, a run that dies is thrown to the nearest error boundary".
 */
export type Fork<R> = (effect: Effect.Effect<void, never, R>) => Fiber.Fiber<void, unknown>

/**
 * What `Host` takes: `start`'s program and options, how to fork the run, and its view.
 *
 * @see The guide, "Running", "Options".
 */
export type HostProps<State, Model, Message, Command, RC, RS, Flags> =
  & {
    /** The program to start and run. */
    readonly program: Shape<State, Model, Message, Command, RC, RS, never, never, Flags>
    /** Draws its model. */
    readonly children: View<Model, Message>
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
 * Starts a program as it first renders, runs it while it is mounted, and draws the model of its current state with
 * `children`.
 *
 * - The program starts as `Host` first renders, with the `program`, the `options` and the `fork` of that render. Its
 *   run starts after `Host`'s effect, and is interrupted as `Host` unmounts. Give it a new `key` to start the program
 *   anew.
 * - The run lives as long as `Host`'s effect: React's `<Activity>` ends it, and the program starts again from `init`.
 *   The run starts in a microtask after the effect, so under StrictMode the commands of `init` start once today: this
 *   is described, and not promised. For a state that outlives a component, start the program yourself, and draw it
 *   with `Draw`.
 * - On a server, it draws the first model, and nothing of `init` starts.
 * - A run that fails, or dies, throws what it ended with (`Cause.squash`: a `ProgramDefect` for a defect) as `Host`
 *   renders, for the nearest error boundary. One that `Host` has not thrown as it unmounts, or that ends so once it has
 *   unmounted, is given to `reportError`.
 *   Whatever `fork` handles around the run is not thrown or reported again.
 * - A `makeModel` that throws is such a defect, thrown once: until the run has ended, `Host` draws the model it drew
 *   last. A first model that throws reaches the boundary as `Host` first renders, and the run never starts.
 *
 * @example
 * ```tsx
 * createRoot(root).render(<Host program={counter}>{view}</Host>)
 * ```
 *
 * @see The guide, "View".
 * @see The guide, "Writing a bridge", "A controlled element".
 * @see The guide, "Guarantees", "With the bridge to React, the run lives as long as the effect that starts it".
 * @see The guide, "Guarantees", "With the bridge to React, `Host` and `Draw` draw the first model on a server".
 * @see The guide, "Guarantees", "With the bridge to React, a run that dies is thrown to the nearest error boundary".
 */
export const Host = <State, Model, Message, Command = never, RC = never, RS = never, Flags = never>(
  props: HostProps<State, Model, Message, Command, RC, RS, Flags>
): ReactNode => {
  const first = useRef(props)
  // The program is started as `Host` first renders, by plain code that runs no effect: its first model is drawn in the
  // render that mounts it, and on a server. A render that React throws away leaves a program that nothing runs.
  const [{ started, drawn }, setStarted] = useState(() => hosted(begin<Model, Message>(first.current)))
  const [died, setDied] = useState<Died | undefined>(undefined)
  // What a render of `Host` threw, for the boundary: the cleanup reports a death that no render threw.
  const thrown = useRef<Died | undefined>(undefined)
  // Whether the program in `started` has been given to `fork`: a program started is run once.
  const ran = useRef(false)
  useEffect(() => {
    const { fork } = first.current
    const forkRun: Fork<never> = fork ?? ((effect) => Effect.runFork(effect))
    let mounted = true
    let fiber: Fiber.Fiber<void, unknown> | undefined
    // What the run died of while `Host` was mounted, set for a render to throw.
    let set: Died | undefined
    // The run starts in a microtask after the effect, which the cleanup cancels. StrictMode runs the effect, its
    // cleanup and the effect again in one task, so the first of the two starts nothing, and one program runs, once.
    queueMicrotask(() => {
      if (!mounted) return
      // An effect that runs again later, as when `<Activity>` shows `Host` again, finds a program whose run has ended:
      // it starts the program anew, from `init`.
      let running = started
      if (ran.current) {
        running = begin<Model, Message>(first.current)
        setStarted(hosted(running))
      }
      ran.current = true
      const forked = forkRun(running.run)
      fiber = forked
      // The fiber `fork` returns, so that what the application handles around the run is not thrown or reported again.
      Effect.runFork(Effect.flatMap(Fiber.await(forked), (exit) =>
        Effect.sync(() => {
          if (!Exit.isFailure(exit) || Cause.hasInterruptsOnly(exit.cause)) return
          const error = Cause.squash(exit.cause)
          if (mounted) {
            set = { error }
            setDied(set)
          } else reportError(error)
        })))
    })
    // A parent that removes `Host` in the batch that sets the death leaves no render to throw it.
    return () => {
      mounted = false
      if (set !== undefined && thrown.current !== set) reportError(set.error)
      if (fiber !== undefined) Effect.runFork(Fiber.interrupt(fiber))
    }
  }, [])
  if (died !== undefined) {
    thrown.current = died
    throw died.error
  }
  return createElement(Draw<Model, Message>, { app: drawn, view: props.children })
}

// The program `Host` runs, and the handle `Draw` reads of it. The run reports each defect once, as it ends, and `Host`
// throws it then: so a model read for `Draw` that throws, past the first, gives the model drawn last, the defect being
// recorded where it was read, and the run dying of it. The first has no model before it: it throws, for the boundary,
// and `Host`, which never mounted, never runs the program. The model drawn last stays the same: a program that died
// applies no message.
const hosted = <Model, Message>(started: Started<Model, Message>) => {
  const { app } = started
  let last: { readonly model: Model } | undefined
  const model = () => {
    try {
      const made = app.model()
      last = { model: made }
      return made
    } catch (thrown) {
      if (last === undefined) throw thrown
      return last.model
    }
  }
  const drawn: App<Model, Message> = { ...app, model }
  return { started, drawn }
}

// `start`'s options are checked by `HostProps`, which the rest of `start`'s signature cannot see here.
const begin = <Model, Message>(
  { options, program }: { readonly program: unknown; readonly options?: unknown }
): Started<Model, Message> =>
  (start as unknown as (program: unknown, options: unknown) => Started<Model, Message>)(program, options ?? {})
