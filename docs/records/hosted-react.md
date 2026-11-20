# A bridge to React in which React hosts the program

**Status:** spiked, not decided. A spike of 20 November 2026 by a session of Opus 5.5, on the branch
`claude/spike-hosted-react-47f7d5` cut from `ac9d2f5`, never to be merged. Read against the code at `ac9d2f5`.

## Context

On 20 November 2026 the owner decided that the library is meant to be adopted by others, for two readers: one who starts
a new application, and one who has an application already, most often in React (`ROADMAP.md`, "What the library is
beside Foldkit", and "The bridges as packages of their own"). `bridges/react.ts` serves the second reader badly: the
program owns the root, the view is a plain function called outside React, each frame is drawn with `flushSync`, and
the guide rules that the renderer keeps no state and draws frames and nothing else. On 16 November 2026 the owner
declined bridges that support what a renderer does beyond drawing a frame, after four gaps were found
(`docs/rejected.md`, "The bridges").

For that reader the direction reverses: React hosts the program. A review reasoned that this needs no change of the
engine, since the `render` given to `run` can hand each frame to a store that React reads, and that the three rules of
the guide's "View" would become the contract of each bridge. This spike checks it.

## What was built

Two files beside `bridges/react.ts`, which is unchanged:

- **`bridges/react-hosted.ts`**, about 140 lines of logic, in two layers.
  - `makeStore()` and `Frames`, for a run started elsewhere. The store's `open()` gives the `render` for `run`. That
    `render` yields once, then publishes each frame inside `flushSync`, then waits for the next animation frame, as
    `bridges/react.ts` does. `Frames` reads the latest model with `useSyncExternalStore`, so it renders again only for a
    new model, and provides the store by a context.
  - `Host`, which starts the run. Its props are `start: (render) => run(program, render)`, `children` (the view),
    `fallback`, and `fork`: `Effect.runFork` by default, or the `runFork` of a runtime that gives the program's
    services, which the types ask for whenever the run needs services. The run starts in an effect as `Host` mounts, and
    is interrupted as it unmounts.
  - `Shows`, the element of an input. It finds its run's store by the context, reads the run's `seen` with
    `useSyncExternalStore` itself, keeps its own `Shown` in a ref, listens to its element's native `input` event, and
    settles its element with `drawn(held, value, seen)` in a layout effect that depends on the value and `seen`.
  - `onClick` and `onPress`, as in the other bridges.
- **`bridges/react-hosted.test.ts`**, 46 tests in happy-dom: the 26 of `bridges/bridge.test_suite.ts`, through a
  `renderInto` that draws the suite's run with `Frames`; 10 of `Host`; 6 of what an application of its own does; and 4
  of the four gaps, 3 of them `test.failing`.
- **`bridges/bridge.test_suite.ts`** exports its scheduler, so that a test of `Host` forks its run on it.

Nothing under `src/` changed.

## What was run, checked and reasoned

**Run** (`bun test bridges/react-hosted.test.ts`: 46 pass, the three `test.failing` among them):

- **The shared scenarios pass, all 26.** They run through `Frames`, with a run the suite starts, not through `Host`: the
  suite forks its own run on its own scheduler, and `stop` interrupts that fiber. `Host`'s own start and end are tested
  apart, on the same scheduler.
- **Before the first frame, a component gets the `fallback`** (`null` by default). The first frame comes after the run
  has started, never in the render that mounts `Host`.
- **Services** come from the runtime the application gives: a `ManagedRuntime` of a `Layer` of `Storage` saves the
  form.
- **A dispatch, and a dispatch of `forwardTo`, is the same function in every render** of one run: one of each over
  four frames.
- **A run that dies** throws its first `ProgramDefect` (`Cause.squash` of what it died of) as `Host` renders, and the
  nearest error boundary catches it, with `where: "update"`. A run that dies once `Host` has unmounted, as by a release,
  gives what it died of to `reportError`.
- **StrictMode** starts two runs: the first is interrupted as React unmounts it, before it draws; the second draws, and
  its input is settled with its own `seen`.
- **Started with Effect's own scheduler**, the run draws its first frame with no warning of React.
- **Beside the program**: an input that a component with state of its own mounts outside any frame shows the program's
  value, and what is typed is stored; an input in a subtree that `memo` skips takes the program's value once a frame has
  seen its rejected key; an input that Suspense hides (`display: none`, with the typed text) and shows again outside a
  frame shows the value the program put there meanwhile; an input in a portal is settled by its run; two programs on one
  page, in both orders of their keys, each settle their inputs with their own `seen`; a program unmounted while a save
  is under way interrupts the save, and nothing is drawn or logged after.
- **A value a command's message puts in an input's place**, with no new `seen`, is shown by the element (a save that
  completes after its `Saving` frame was drawn).
- **Each check taken out by hand**, one at a time, the test file run under each (a script of the session, not in the
  repository):

  | Check taken out                                     | What fails                                                |
  | --------------------------------------------------- | --------------------------------------------------------- |
  | an element settled by its own mount                 | the file hangs; alone, the component's input and Suspense |
  | `seen` read by the input's own subscription         | `memo`, and two shared tests of a frame of the same model |
  | the run found by context, not a page-wide store     | two programs on one page                                  |
  | the run interrupted as `Host` unmounts              | unmount, StrictMode, the command under way, `reportError` |
  | each frame published inside `flushSync`             | 39 of 46                                                  |
  | the defect thrown as `Host` renders                 | the error boundary                                        |
  | `reportError` after unmount                         | its test                                                  |
  | the latest dispatch of an input                     | the shared "an input in the place of another input"       |
  | the settling depends on the value, not `seen` alone | the command's message                                     |
  | the yield before the first frame                    | nothing                                                   |
  | the frames of a closed renderer dropped             | nothing                                                   |
  | the frame forgotten as a renderer closes            | nothing                                                   |
  | a layout effect, not a passive one                  | nothing                                                   |

  The hang of the first was not looked into further: the machine was short of memory, and the run was stopped. Its
  process held about 6.1 GB when the session that started the spike looked, and had outlived the timeout meant to kill
  it: why a bridge with that check out grows without end is open.
- **A probe, not kept**: `flushSync` called inside a `useEffect` does not flush, and React logs "flushSync was called
  from inside a lifecycle method". Without the yield, the probe's run still drew its first frame outside the effect.

**Checked**, by reading code: `Effect.runFork` evaluates the fiber synchronously (`runForkWith` calls
`fiber.evaluate` in `effect` 4.1.4). So the first frame would be published inside `Host`'s effect if the run reached its
renderer without yielding. Today it does not, for a reason of the engine that no documentation states; the yield keeps
the bridge from resting on it, and so no test kills it. `ManagedRuntime` is stable in 4.1.4.

**Reasoned**, not run:

- A view that throws is React's error, not the run's: it throws in React's render, so the run does not die of it. With
  an error boundary above `Host`, `Host` unmounts, and the run ends interrupted, not dead.
- StrictMode runs the commands of `init` twice in development: the engine starts them before the renderer, and the
  first run is interrupted only after.
- An input drawn under an inner `Host` with the dispatch of an outer one reads the inner run's `seen`.
- Inference: `Host`'s `Model` and `Message` cannot be inferred from `start`, so the tests spell them
  (`Host<Model, Message>`).
- Each frame notifies every `Shows` of its run, each comparing its `seen`: a cost per input per frame.
- Not run at all: a real browser, an IME composition, the caret when the program changes a value, `startTransition` or
  `useDeferredValue` in the application, `<Activity>`, server rendering and hydration.

## What the guide says that is untrue of this bridge

Each sentence is quoted, then how it would read as a promise of a bridge, not of the library.

From "View":

- "The renderer draws frames, and nothing else." and "The renderer keeps no state beside the program's state." Untrue:
  the application's components keep state, and draw what it holds between frames. As a bridge's promise: "What the
  program draws comes from its frames. A bridge that a host application owns draws the application's own state too; the
  program's tools see only the program."
- "What the screen shows comes from one of three places". A fourth: the application's components.
- "A frame is drawn whole and at once. No frame is drawn in parts, and no frame is postponed." Untrue under Suspense:
  the part of a frame under a boundary that suspends is postponed, and shown later in a commit of React's own. As a
  bridge's promise: "Each frame is committed at once. A part that the application suspends is shown later, and its
  inputs settle as it is shown."
- In "Do and don't": "Don't: keep a state in a component, beside the program's state." Untrue of this bridge, which
  exists for that.

From "Writing a bridge":

- "A bridge's `renderInto(root, view)` is that `render`." This bridge has `Host`, or `makeStore` and `Frames`.
- "If a view throws, the view throws inside the frame's `Effect.sync`, and the run dies with it." Untrue (reasoned):
  React catches it. As a bridge's promise: "A view that throws is an error of the host, for its error boundaries; a
  defect of the program is thrown to them as `Host` renders."
- "Between two frames, the bridge draws nothing." Untrue: React draws the application's updates.
- "The bridge to React has no module. `Shows` … keeps the value of each render from a ref callback. The bridge finds the
  fields that `Shows` drew among the elements of its root." Untrue: each `Shows` settles itself, in a layout effect, and
  finds its run by a context.
- "After each frame, the bridge settles the element of each input with `drawn`." Wider here: after each commit in which
  the input's value or its run's `seen` changed, and as it is mounted or shown again, by whatever commit.
- In "What is left out": "With React: a component with state or effects of its own, Suspense, a subtree that `memo`
  skips, and a portal." and "With React, a run whose root is inside another run's." Each has a test here, but the last,
  which is reasoned.

From "Inputs the user types into":

- "The renderer: after each frame, and before the user can act on it, it lets the bridge reach the element of each
  input, with the frame's value and `seen`." True for every element on screen, by `flushSync` and the layout effects; a
  hidden element is reached as it is shown again, before the user can act on it. As a bridge's promise: "after each
  commit that shows an element, before the user can act on it".
- "A renderer that draws each frame at once meets it." React under Suspense does not draw each frame at once, and still
  meets the condition, by the settling as the part is shown.

## What it rests on of React

Each with the page of react.dev that states it, and the test that fails without it.

1. **`flushSync` commits the updates of its callback before it returns**, effects of the commit included (react.dev,
   "flushSync"). Taken out: 39 tests fail.
2. **`useSyncExternalStore` renders again only when its snapshot changes, by `Object.is`** (react.dev,
   "useSyncExternalStore"), and every component reads the same snapshot in one render. The model and `seen` are two
   snapshots of one store. Taken out (one subscription to the whole frame): the shared tests of a frame of the same
   model, and `memo`.
3. **A memoized component renders again when a store it reads changes**, whatever its props (react.dev, "memo": state
   and context; the store, by the same rule, is run here only). Test: `memo`.
4. **A layout effect runs after the commit, before the browser paints** (react.dev, "useLayoutEffect"), so in the task
   of the commit, before any event of the user. No test tells it from a passive effect: in happy-dom, React runs the
   passive effects of a commit of `flushSync` before it returns too. Checked by the documentation alone.
5. **Suspense hides content with `display: none`, keeps it, cleans up its layout effects, and runs them again as it
   shows it** (react.dev, "Suspense", caveats). Test: the input Suspense hides and shows again.
6. **A portal's children read the contexts of the tree that renders them** (react.dev, "createPortal"). Test: the
   portal; no mutation takes it out, since it is React's.
7. **StrictMode mounts, unmounts and mounts again in development, running the effects each time** (react.dev,
   "StrictMode"). Test: StrictMode, with the interruption taken out.
8. **An error thrown while a component renders reaches the nearest error boundary** (react.dev, "Component",
   `getDerivedStateFromError`). Test: the error boundary.
9. **`flushSync` inside an effect does not flush, and warns** (react.dev, "flushSync", pitfalls: run by the probe). The
   bridge avoids it by the yield; no kept test, as said above.

Of Effect: `ManagedRuntime.runFork` and `Effect.runFork` start the run (stable); `Cause.squash` gives the first defect
(run, by the boundary's test); `Cause.hasDies` tells a death from an interruption (run, by the unmount tests).

## Refused on the way

- **An input that reads its value from the root's model through a selector**, so that it reads the whole frame itself.
  A child's view does not know where it lives in the root. And it is not needed: `memo` skips a component only for equal
  props, so a skipped input's value is the frame's, and only `seen` must reach it by its own subscription (reasoned; the
  `memo` test checks the case).
- **A store of the whole page, or the last run started**, in place of a context: it settles one run's inputs with
  another's `seen` (run: the check taken out).
- **The settling of `bridges/react.ts`**, after the frame's `flushSync`, over the inputs found in the root: it misses an
  input mounted outside a frame, shown again by Suspense, or in a portal (reasoned, from the gaps of 16 November 2026
  and `docs/records/registers.md`).
- **A passive effect for the settling**: the tests pass with it, but nothing documents that it runs before the user can
  act.
- **A first frame drawn in the render that mounts `Host`**: it would need the engine to give a frame before it starts
  its fiber, so the line was not followed. Reasoned: an application can draw `program.makeModel` of the state of `init`
  as the `fallback`, with no change of the engine, but its controls would send to no run.

## The four gaps of 16 November 2026

- **A reset the user begins was missed: left.** The hosted bridge hears no reset at all, as the minimal bridges do not.
  `test.failing`: a reset of an input's form is not stored. Of note: happy-dom resets the text of an `<output>` too, so
  the test checks what the program holds by sending it.
- **A root in a shadow tree never heard its forms' resets: left, for the same reason.** The input itself works there,
  found by context, not by the document: a test passes, and a `test.failing` holds the reset.
- **React showed the old text in an input that Suspense showed again outside a frame: closed.** Each input settles
  itself as React runs its layout effects again; the test passes, and fails with the settling at mount taken out.
- **A text field that strips line breaks showed a value the bridge held as shown: left.** It is the element's, whatever
  the renderer. `test.failing`.

## What it does not close

The reset and the sanitized value above; an input under another run's `Host`; a view that throws, which is no defect of
the program; a defect after unmount, which goes to `reportError`, a function of the platform, not of the application;
the commands of `init` run twice under StrictMode; everything not run, listed above.

## The case against it

- **It gives up the rule that makes the library's view simple.** "The renderer draws frames, and nothing else" is what
  lets `simulate`, `rehearse` and `drive` speak for the screen. With state in the application's components, they speak
  for the program only, and what the screen shows is the application's to test. The library's "Guarantees" would hold of
  the program, and each bridge would say what it adds.
- **It rests on nine premises of React**, four of them on timing, one (the layout effect) checked by no test. The bridge
  of 16 November rested on four, each tested.
- **It is a second React bridge to keep**, beside `bridges/react.ts`, unless it replaces it. Its shared tests run
  through `Frames`, not `Host`: the run's start and end inside React are tested only by its own file.
- **The run's lifetime is React's.** StrictMode starts it twice; a remount starts it anew and loses the state; a defect
  after unmount has no React to go to. An application that wants the state to outlive a component must start the run
  itself and use `Frames`, which is the old direction again.
- **Three checks no test kills** (the yield, the dropped frames of a closed renderer, the forgotten frame): code kept on
  reasoning alone, which `AGENTS.md` asks to avoid.

## What is left for the owner to decide

1. Whether the React bridge is hosted, and whether it replaces `bridges/react.ts` or stands beside it.
2. Whether the three rules of "View" become promises of each bridge, as quoted above, and what "Guarantees" then says of
   the screen.
3. The shape: a component with a render prop (`Host`), or a hook with a provider; and whether `Host` takes the program
   and its options, so that its types are inferred.
4. Where a defect goes after unmount: `reportError`, or a prop of the application.
5. Whether the yield, the dropped frames and the forgotten frame stay without a test.
6. Whether the commands of `init` running twice under StrictMode are acceptable, as React's own rule for effects.
