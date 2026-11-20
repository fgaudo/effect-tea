// The bridge to React, the entry `@fgaudo/effect-tea/react`, in which React hosts the program
// (`docs/records/hosted-react.md`). With it, the examples `counter` and `form` draw their programs a second time, under
// snabbdom in the same run (`examples/together.ts`): only the
// view (`view-react.tsx`) and this bridge change with the renderer, and the program and its tests stay as they are.
// The renderer given to `run` only hands each frame to a store that React reads with `useSyncExternalStore`, so the
// engine is the same as for any renderer. Two layers: `makeStore` and `Frames`, for a run that the application starts
// itself (`together` draws one run with snabbdom and with `Frames`), and `Host`, a component that starts the run as it
// mounts and interrupts it as it unmounts. A view is called by React as it renders, so its components may have state
// and effects of their own: what the program draws comes from its frames, and what the application's components draw
// is theirs. An input is drawn by `Shows`, over a native, uncontrolled text `<input>`: it finds its run's store by a
// context, reads the run's `seen` itself, and settles its own element with `drawn` in a layout effect, once React has
// committed, whatever commit shows it: a frame, a state of the application, Suspense showing it again, a portal.
// What it does not handle, as the guide's "Writing a bridge" says: a form's reset, and a value the element changes by
// itself.
// Checked with react and react-dom 19.3.1, the start of their peer range; the daily job runs its tests with the newest
// React 19.
/**
 * The bridge to React: draws a program with React and React DOM 19.3.1 or a newer 19.x, which you install beside the
 * package.
 *
 * @see The guide, "Writing a bridge", "The package's bridges".
 * @module @fgaudo/effect-tea/react
 */
import {
  type Dispatch,
  drawn,
  edited,
  type FlagsOption,
  type Frame,
  run,
  type RunOptions,
  type Shape,
  type Shown,
  type Written
} from "@fgaudo/effect-tea"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import {
  createContext,
  createElement,
  type InputHTMLAttributes,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore
} from "react"
import { flushSync } from "react-dom"

/**
 * A view of a program, drawn by this renderer: a function of its model, which sends its messages through `dispatch`.
 * React calls it as it renders, so the components it draws may have hooks of their own.
 *
 * @see The guide, "View".
 */
export type View<Model, Message> = (model: Model, dispatch: Dispatch<Message>) => ReactNode

/**
 * The renderer `run` takes.
 *
 * @see The guide, "Writing a bridge", "Frames".
 */
export type Render<Model, Message> = (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void>

/**
 * The latest frame of a run, for React to read: what `Frames` draws.
 *
 * @see The guide, "Writing a bridge", "Frames".
 */
export type Store<Model, Message> = {
  /**
   * A renderer for `run`, which publishes each frame of the run it is given. Once another renderer of the store is
   * opened, its frames are not published any more.
   */
  readonly open: () => Render<Model, Message>
  /** Forgets the latest frame, if `render` is the renderer opened last: `Frames` draws its `fallback` again. */
  readonly close: (render: Render<Model, Message>) => void
  /** Calls `listener` after each frame published, and after `close`. Returns what stops it. */
  readonly subscribe: (listener: () => void) => () => void
  /** The latest frame published, `undefined` before the first and after `close`. */
  readonly frame: () => Frame<Model, Message> | undefined
}

const animationFrame = Effect.callback<void>((resume) => {
  const id = requestAnimationFrame(() => resume(Effect.void))
  return Effect.sync(() => cancelAnimationFrame(id))
})

/**
 * A store of the latest frame of a run. Each frame is published inside `flushSync`: when the publication returns,
 * React has committed it, and every input drawn has settled with it. After a frame, the renderer waits for the next
 * animation frame before it takes another, as the snabbdom bridge does.
 *
 * @example
 * ```ts
 * const store = makeStore<Model, Message>()
 * Effect.runFork(run(counter, store.open()))
 * createElement(Frames, { store, view })
 * ```
 *
 * @see The guide, "Writing a bridge", "Frames".
 */
export const makeStore = <Model, Message>(): Store<Model, Message> => {
  let latest: Frame<Model, Message> | undefined
  let current: Render<Model, Message> | undefined
  const listeners = new Set<() => void>()
  const notify = () => {
    // oxlint-disable-next-line unicorn/no-useless-spread -- a listener may subscribe or unsubscribe while it is told
    for (const listener of [...listeners]) listener()
  }
  return {
    open: () => {
      const render: Render<Model, Message> = (frames) =>
        // A yield first: a run forked with `Effect.runFork` is evaluated synchronously, inside the effect of React that
        // starts it, where `flushSync` cannot flush.
        Effect.yieldNow.pipe(
          Effect.andThen(Stream.runForEach(frames, (frame) =>
            Effect.sync(() => {
              if (current !== render) return
              latest = frame
              flushSync(notify)
            }).pipe(Effect.andThen(animationFrame))))
        )
      current = render
      return render
    },
    close: (render) => {
      if (current !== render) return
      current = undefined
      latest = undefined
      // Not inside `flushSync`: `close` may be called from an effect's cleanup, during React's commit.
      notify()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    frame: () => latest
  }
}

// The store of the nearest run, for the inputs drawn under it, portals included.
const Hosting = createContext<Store<unknown, unknown> | undefined>(undefined)

const none: unique symbol = Symbol("@fgaudo/effect-tea/react/none")

/**
 * Draws the latest frame of `store` with `view`, and `fallback` before the first: for a run the application starts
 * itself, with `store.open()` as its renderer. It renders again only for a new model: a frame of the very same model
 * reaches the inputs alone, which read `seen` themselves.
 *
 * @see The guide, "View".
 * @see The guide, "Writing a bridge", "Frames".
 */
export const Frames = <Model, Message>({
  store,
  view,
  fallback = null
}: {
  readonly store: Store<Model, Message>
  readonly view: View<Model, Message>
  readonly fallback?: ReactNode
}): ReactNode => {
  const model = useSyncExternalStore(store.subscribe, () => {
    const frame = store.frame()
    return frame === undefined ? none : frame.model
  })
  const frame = store.frame()
  return createElement(
    Hosting.Provider,
    { value: store as Store<unknown, unknown> },
    model === none || frame === undefined ? fallback : view(model, frame.dispatch)
  )
}

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
    /** Draws each frame. */
    readonly children: View<Model, Message>
    /** What is drawn before the first frame. */
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
 * Runs a program while it is mounted, and draws its frames with `children`, `fallback` before the first.
 *
 * - The run starts as `Host` mounts, with the `program`, the `options` and the `fork` of its first render, and is
 *   interrupted as it unmounts. Give it a new `key` to start the program anew.
 * - The run lives as long as `Host`'s effect: React's `<Activity>` and StrictMode end it, and the program starts again
 *   from `init`. For a state that outlives a component, start the run yourself, and draw it with `Frames`.
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
 * @see The guide, "Guarantees", "With the bridge to React, the run lives as long as the effect that starts it".
 * @see The guide, "Guarantees", "With the bridge to React, a run that dies is thrown to the nearest error boundary".
 */
export const Host = <State, Model, Message, Command = never, RC = never, RS = never, Flags = never>(
  props: HostProps<State, Model, Message, Command, RC, RS, Flags>
): ReactNode => {
  const [store] = useState(makeStore<Model, Message>)
  const [died, setDied] = useState<Died | undefined>(undefined)
  const first = useRef(props)
  useEffect(() => {
    const { program, options, fork } = first.current
    // `run`'s options are checked by `HostProps`, which the rest of `run`'s signature cannot see here.
    const start = run as unknown as (
      program: unknown,
      render: Render<Model, Message>,
      options: unknown
    ) => Effect.Effect<void, never, never>
    const render = store.open()
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
      store.close(render)
      Effect.runFork(Fiber.interrupt(fiber))
    }
  }, [store])
  if (died !== undefined) throw died.error
  return createElement(Frames<Model, Message>, { store, view: props.children, fallback: props.fallback })
}

/** Sends a message from a React callback, and returns its number: a dispatch needs no services and is synchronous. */
const send = <Message>(dispatch: Dispatch<Message>, message: Message): number => Effect.runSync(dispatch(message))

/**
 * React's `onClick` for a click that sends `message`.
 *
 * @see The guide, "Writing a bridge", "Handlers".
 */
export const onClick = <Message>(message: Message, dispatch: Dispatch<Message>) => () => send(dispatch, message)

/**
 * React's `onPointerDown` for a press of the pointer that sends `message`: where a drag the program draws starts.
 *
 * @see The guide, "Writing a bridge", "Handlers".
 */
export const onPress = <Message>(message: Message, dispatch: Dispatch<Message>) => () => send(dispatch, message)

/**
 * A text input that shows an input of the program, `value`, through the input's own dispatch
 * (`forwardTo(dispatch, 'Name')`), under a `Host` or `Frames`: what is typed is written over what the element showed,
 * and the element takes the program's value only once a frame has seen what was typed (`drawn`). It reads its run's
 * `seen` itself, so a frame reaches it even when a parent is skipped by `memo`, and settles its element in a layout
 * effect, after each commit that changes its value or its run's `seen`, and as it is shown. The `<input>` is
 * uncontrolled and needs no key: the element stays, with its focus, while the program changes what it shows. Its other
 * props are the `<input>`'s.
 *
 * @example
 * ```ts
 * createElement(Shows, { value: model.name, dispatch: forwardTo(dispatch, "Name") })
 * ```
 *
 * @see The guide, "Inputs the user types into", "The element on screen".
 * @see The guide, "Writing a bridge", "A text input".
 */
export const Shows = ({
  value,
  dispatch,
  ...props
}:
  & { readonly value: string; readonly dispatch: Dispatch<Written<string>> }
  & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange">): ReactNode =>
{
  const store = useContext(Hosting)
  if (store === undefined) {
    throw new Error("An input is drawn outside the run it belongs to: draw it under a Host or Frames")
  }
  const seen = useSyncExternalStore(store.subscribe, () => store.frame()?.seen ?? 0)
  const element = useRef<HTMLInputElement>(null)
  // What the element holds: `undefined` until its first frame is settled.
  const held = useRef<Shown<string> | undefined>(undefined)
  const sendTo = useRef(dispatch)
  useLayoutEffect(() => {
    sendTo.current = dispatch
  }, [dispatch])
  // On the value too, not `seen` alone: a command's message changes the value with no new `seen`.
  useLayoutEffect(() => {
    const input = element.current
    if (input === null) return
    const { shown, taken } = drawn(held.current, value, seen)
    if (taken) input.value = shown.value
    held.current = shown
  }, [value, seen])
  useLayoutEffect(() => {
    const input = element.current
    if (input === null) return
    // The element's own `input` event, not React's `onChange`: React leaves out an event that finds the value as its
    // tracking of the value last heard it, and that tracking is React's to change.
    const listener = () => {
      if (held.current === undefined) return
      const { write, sent } = edited(held.current, input.value)
      held.current = sent(send(sendTo.current, write))
    }
    input.addEventListener("input", listener)
    return () => input.removeEventListener("input", listener)
  }, [])
  return createElement("input", { ...props, ref: element })
}
