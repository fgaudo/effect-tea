// The bridge to snabbdom, the entry `@fgaudo/effect-tea/snabbdom`, which the examples use.
// The bridge is given the handle of a program that was started, an `App`: it draws `app.model()` as it is called, and
// again once `app.subscribe` tells it of a new state. A view draws native controlled elements: a `value` or a `checked` in
// `props`, the model's, and a listener that calls `dispatch` itself, with the value the element holds. The bridge keeps
// two rules beside snabbdom, each with a test that fails without it:
// - A controlled prop is compared with the element. snabbdom's props module sets `value` only where it differs from the
//   vnode drawn before, and `checked` likewise, so after each draw every element drawn with either is given the vnode's
//   where the element itself differs from it: what the user typed and the state rejected is taken back.
// - When it draws: in a microtask after each notice, as React renders a store. The HTML Standard runs the microtasks
//   after each task and after each listener the browser calls, so no handler of an event the browser dispatches runs on
//   a view older than the state: a key is typed over what the program put there. The notices of one task, or of one
//   listener the browser calls, are drawn once. A listener called while a patch runs (a browser calls `blur` as a patch
//   removes the focused element, and the DOM calls `blur` and `focus` as an `insert` hook focuses one) is drawn after
//   that patch, since no microtask runs while the patch is on the stack.
// Checked with snabbdom 3.6.4, the start of its peer range; the daily job runs its tests with the newest snabbdom 3.
/**
 * The bridge to snabbdom: draws a program with snabbdom 3.6.4 or a newer 3.x, which you install beside the package.
 *
 * @module @fgaudo/effect-tea/snabbdom
 *
 * @see The guide, "Writing a bridge".
 */
import type { App, Dispatch } from "@fgaudo/effect-tea"
import * as Opt from "effect/Option"
import {
  attributesModule,
  classModule,
  datasetModule,
  eventListenersModule,
  init,
  type Module,
  propsModule,
  styleModule,
  type VNode
} from "snabbdom"

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

/**
 * Draws the model of the current state of `app` into `root` with `view`, patching the tree it drew before, and returns
 * what stops it: for a program that was started.
 *
 * - It empties `root` as it is called, and `root` then holds the view's top element and nothing else. `root` keeps its
 *   place in the page, and may have no parent.
 * - It draws as it is called, then in a microtask after each new state, wherever its message comes from, and after each
 *   message a handler of the view sends, whether it made a new state or not: once the code that sent it returns, and
 *   before the browser handles the next event. What a task, or a listener that the browser calls, sends until it
 *   returns is drawn once.
 * - It draws each model whole, and nothing between two draws. A model that is the very one drawn last is not drawn
 *   again.
 * - After each draw, an element drawn with a `value` or a `checked` in `props` is given it back where the element
 *   differs from it: what the user typed and the program rejected is taken back. The element is not replaced, and
 *   keeps its focus. Where it keeps its value, it keeps its caret and its selection too.
 * - snabbdom never removes a prop. So a view gives a prop it changes in every state: `disabled: false` too.
 * - It draws a node's `class`, `props`, `attrs`, `dataset`, `style` and `on`, with snabbdom's modules of each. Unlike
 *   a prop, a class, an attribute or a data entry that a later vnode leaves out is removed.
 * - What a listener sends while a patch runs, as a `blur` that the patch makes, is drawn after that patch, in a
 *   microtask of its own.
 * - What a view or `makeModel` throws as it is drawn ends the run, the first draw's too: it draws nothing more, and
 *   the program's `run` dies of it, in `'render'`. A draw that comes once the run has ended throws it out of its
 *   microtask, as an error of the page.
 * - The run does not stop it: whoever started the program calls what it returns, or does not. Once it is stopped, a
 *   draw it asked for before is not made. Whether a handler of what it drew still sends its message then is
 *   unspecified.
 *
 * @example
 * ```ts
 * const { app, run } = start(counter)
 * drawInto(document.getElementById("app")!, { app, view })
 * Effect.runFork(run)
 * ```
 *
 * @see The guide, "Writing a bridge".
 * @see The guide, "What an element gives".
 */
export const drawInto = <Model, Message>(root: Element, { app, view }: {
  /** The handle of a program that was started. */
  readonly app: App<Model, Message>
  /** Draws its model. */
  readonly view: View<Model, Message>
}): () => void => {
  // #region draw
  const controlled = new Map<Element, Controlled>()
  const patch = init([
    classModule,
    propsModule,
    attributesModule,
    datasetModule,
    styleModule,
    eventListenersModule,
    controlledModule(controlled)
  ])
  // A child of the bridge's own, which the first patch replaces with the view's top element: so `root` keeps its
  // place, with a parent or without one, and holds what the view draws and nothing else.
  const place = root.ownerDocument.createElement("div")
  root.replaceChildren(place)
  let tree: Element | VNode = place
  let last: Opt.Option<Model> = Opt.none()
  // Draws the model of the current state, then gives the controlled elements their props back.
  const draw = (): void => {
    const model = app.model()
    if (Opt.isNone(last) || last.value !== model) {
      tree = patch(tree, view(model, dispatch))
      last = Opt.some(model)
    }
    giveBack(controlled)
  }
  // #endregion draw
  // #region notice
  let queued = false
  // Once it is stopped, a draw it asked for before is not made: the root may be another program's by then.
  let stopped = false
  let unsubscribe = () => {}
  const stop = () => {
    stopped = true
    unsubscribe()
  }
  // What a draw throws is the run's to die of, in `'render'`: a microtask is called by nothing of the run. A defect
  // of `makeModel` is the one the run recorded where the model was read, so it is still one defect.
  const attempt = () => {
    try {
      draw()
    } catch (error) {
      stop()
      app.die(error)
    }
  }
  const notice = () => {
    if (queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      if (!stopped) attempt()
    })
  }
  // #endregion notice
  // #region dispatch
  // The dispatch the view is given, the same in every draw: it applies the message, then asks for a draw, whether
  // the message made a new state or not, so that what the element shows and the state rejected is taken back.
  const dispatch: Dispatch<Message> = (message) => {
    app.dispatch(message)
    notice()
  }
  // #endregion dispatch
  // #region handle
  unsubscribe = app.subscribe(notice)
  attempt()
  return stop
  // #endregion handle
}
