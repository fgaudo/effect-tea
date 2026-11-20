// The bridge to snabbdom, the entry `@fgaudo/effect-tea/snabbdom`, which the examples use.
// A renderer is given the handle on the running program, an `App`: it draws `app.model()` as it starts, and again once
// `app.subscribe` tells it of a new state. A view draws native controlled elements: a `value` or a `checked` in
// `props`, the model's, and a listener that calls `dispatch` itself, with a write over the value its model held. The
// bridge keeps two rules beside snabbdom, each with a test that fails without it:
// - A controlled prop is compared with the element. snabbdom's props module sets `value` only where it differs from the
//   vnode drawn before, and `checked` likewise, so after each draw every element drawn with either is given the vnode's
//   where the element itself differs from it: what the user typed and the state rejected is taken back.
// - When it draws. A handler writes over the value its model held when it was drawn, so two keys between two draws
//   would send the second over the first one's: a message the view's own `dispatch` sends is drawn at once, before the
//   handler returns, whether it made a new state or not. A notice from anywhere else, a command or a subscription, is
//   drawn at the next animation frame, at most once for each refresh.
// A listener may be called while a patch runs: a browser calls `blur` as a patch removes the focused element, and the
// DOM calls `blur` and `focus` as an `insert` hook focuses one. The draw of what such a listener sends waits for the
// patch under way, and follows it.
// Checked with snabbdom 3.6.4, the start of its peer range; the daily job runs its tests with the newest snabbdom 3.
/**
 * The bridge to snabbdom: draws a program with snabbdom 3.6.4 or a newer 3.x, which you install beside the package.
 *
 * @module @fgaudo/effect-tea/snabbdom
 *
 * @see The guide, "Writing a bridge", "The package's bridges".
 */
import type { App, Dispatch } from "@fgaudo/effect-tea"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"
import { eventListenersModule, init, type Module, propsModule, styleModule, type VNode } from "snabbdom"

/**
 * A view of a program, drawn by this renderer: a pure function of its model, which sends its messages through
 * `dispatch`.
 *
 * @see The guide, "View".
 */
export type View<Model, Message> = (model: Model, dispatch: Dispatch<Message>) => VNode

// #region controlled
// The props of a controlled element, as the vnode drawn last gave them.
type Controlled = Readonly<{ value?: unknown; checked?: unknown }>

// The elements on screen drawn with a controlled `value` or `checked`, each with the props of its last vnode. snabbdom
// patches an element into the next one drawn in its place: one drawn without either is no longer controlled.
const controlledModule = (controlled: Map<Element, Controlled>): Module => {
  const drawnAs = (vnode: VNode) => {
    const element = vnode.elm
    if (!(element instanceof Element)) return
    const props = vnode.data?.props
    if (props !== undefined && ("value" in props || "checked" in props)) controlled.set(element, props)
    else controlled.delete(element)
  }
  return {
    create: (_, vnode) => drawnAs(vnode),
    update: (_, vnode) => drawnAs(vnode),
    // Forgotten as a patch removes it, though the style module may keep it on screen while it fades.
    destroy: (vnode) => {
      if (vnode.elm instanceof Element) controlled.delete(vnode.elm)
    }
  }
}

// Gives each controlled element its prop back where the element differs from it. Setting either sends no event.
const giveBack = (controlled: Map<Element, Controlled>): void => {
  for (const [element, props] of controlled) {
    const field = element as HTMLInputElement
    if ("value" in props && field.value !== props.value) field.value = props.value as string
    if ("checked" in props && field.checked !== props.checked) field.checked = props.checked as boolean
  }
}
// #endregion controlled

const animationFrame = Effect.callback<void>((resume) => {
  const id = requestAnimationFrame(() => resume(Effect.void))
  return Effect.sync(() => cancelAnimationFrame(id))
})

/**
 * The renderer `run` takes: draws the model of the current state into `root`, patching the tree it drew before.
 *
 * - It empties `root` as it starts, and `root` then holds the view's top element and nothing else. `root` keeps its
 *   place in the page, and may have no parent.
 * - It draws as it starts, then once a handler of the view has sent a message through the `dispatch` it was given, at
 *   once, before the handler returns, and once a new state comes from anywhere else, at the next animation frame, at
 *   most once for each refresh.
 * - A model that is the very one drawn last is not drawn again.
 * - After each draw, an element drawn with a `value` or a `checked` in `props` is given it back where the element
 *   differs from it: what the user typed and the program rejected is taken back.
 * - What a view or `makeModel` throws as it is drawn ends the run, wherever it is drawn.
 *
 * @example
 * ```ts
 * Effect.runFork(run(counter, renderInto(document.getElementById("app")!, view)))
 * ```
 *
 * @see The guide, "Writing a bridge", "The handle".
 * @see The guide, "Writing a bridge", "Handlers".
 * @see The guide, "Writing a bridge", "A controlled element".
 * @see The guide, "Inputs the user types into", "The element on screen".
 */
export const renderInto =
  <Model, Message>(root: Element, view: View<Model, Message>) => (app: App<Model, Message>): Effect.Effect<void> =>
    Effect.suspend(() => {
      // #region draw
      const controlled = new Map<Element, Controlled>()
      const patch = init([propsModule, styleModule, eventListenersModule, controlledModule(controlled)])
      // A child of the bridge's own, which the first patch replaces with the view's top element: so `root` keeps its
      // place, with a parent or without one, and holds what the view draws and nothing else.
      const place = root.ownerDocument.createElement("div")
      root.replaceChildren(place)
      let tree: Element | VNode = place
      let last: Opt.Option<Model> = Opt.none()
      let drawing = false
      let again = false
      // Draws the model of the current state, then gives the controlled elements their props back.
      const draw = (): void => {
        // A listener called while a patch runs may send a message: its draw waits for the patch under way, which
        // draws again once it is done, the model current then.
        if (drawing) {
          again = true
          return
        }
        drawing = true
        // No `finally`: what a draw throws ends the run.
        do {
          again = false
          const model = app.model()
          if (Opt.isNone(last) || last.value !== model) {
            tree = patch(tree, view(model, dispatch))
            last = Opt.some(model)
          }
          giveBack(controlled)
        } while (again)
        drawing = false
      }
      // #endregion draw
      // #region wait
      let noticed = false
      // Resumes the renderer's fiber, if what it waits for is ready.
      let wake = () => {}
      const until = (ready: () => boolean) =>
        Effect.callback<void>((resume) => {
          const check = () => {
            if (!ready()) return
            wake = () => {}
            resume(Effect.void)
          }
          wake = check
          check()
          return Effect.sync(() => {
            wake = () => {}
          })
        })
      // #endregion wait
      // #region dispatch
      // What a draw in a handler threw, for the renderer's fiber to die of: a handler runs in no fiber of the run. A
      // defect of `makeModel` is the one the run recorded where the model was read, so it is still one defect.
      let thrown: Opt.Option<unknown> = Opt.none()
      // The dispatch the view is given, the same in every draw: it applies the message, then draws at once.
      const dispatch: Dispatch<Message> = (message) => {
        app.dispatch(message)
        try {
          draw()
        } catch (error) {
          thrown = Opt.some(error)
          wake()
        }
      }
      // #endregion dispatch
      // #region handle
      const rendering = Effect.gen(function*() {
        draw()
        while (true) {
          yield* until(() => noticed)
          // What a handler's draw throws ends the wait for the frame.
          yield* Effect.raceFirst(animationFrame, until(() => Opt.isSome(thrown)))
          if (Opt.isSome(thrown)) return yield* Effect.die(thrown.value)
          noticed = false
          draw()
        }
      })
      return Effect.acquireRelease(
        Effect.sync(() =>
          app.subscribe(() => {
            noticed = true
            wake()
          })
        ),
        (stop) => Effect.sync(stop)
      ).pipe(Effect.andThen(rendering), Effect.scoped)
      // #endregion handle
    })
