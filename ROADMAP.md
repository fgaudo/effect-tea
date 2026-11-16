# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done, with the reason in the commit. An item rejected is removed and added to
[`docs/rejected.md`](docs/rejected.md), with why and on what evidence, in the same commit: read it before adding one.
An item deferred or suspended leaves too, for "Parked, not rejected" there, with what would reopen it: this list
holds only what is to be done or decided now.

## Open problems

A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a deterministic
test of it. None is open.

The rest of this section, and the items marked "(review)" below, come from a review of the whole repository
(November 2026); each was reproduced where it says "confirmed", and only reasoned elsewhere.

The four below come from a review of the bridges' premises (November 2026), each confirmed by a `test.failing`.

- **A reset the user begins is missed** (confirmed): both bridges hear a reset in a microtask queued by a capture
  listener of the document (`react.ts`, `snabbdom.ts`); when the browser dispatches `reset` after a click on a reset
  button, the microtasks run after each listener, before the form resets its elements (HTML, "Clean up after running a
  callback"), so the element is emptied with no write and the state keeps the old text. Seen in Chromium 156. Test:
  "a reset the user begins, whose microtasks run before the form resets, …" (`bridge.test_suite.ts`).
- **A root in a shadow tree never hears its forms' resets** (confirmed): the bridges listen on `root.ownerDocument`,
  and a form's `reset` event is not composed, so it stops at the shadow root. A fix could listen where each input's
  own `getRootNode()` is, which covers React's portals too. Test: "a root in a shadow tree" (`bridge.test_suite.ts`).
- **React: an input Suspense shows again outside a frame shows what it held before** (confirmed): the bridge settles
  only after a frame's `flushSync`, and the commit of a Suspense retry is React's own, outside any frame, so the input
  shows the old text while the state holds the program's value. The comment at the top of `react.ts` excludes only an
  input drawn from a component's own state. Test: "an input Suspense hides as a frame suspends, …" (`react.test.ts`).
- **An element that sanitizes what the bridge writes shows a value the bridge holds as shown** (confirmed): a text
  field strips line breaks, so `'Ada\nLovelace'` reads back `'AdaLovelace'`, with no event; a range rounds to its step
  (seen in Chromium 156, not in happy-dom), and other `type`s sanitize too. A fix could hold what the element reads
  back after the write, or the README and `slides` could exclude such values, as they exclude narrowing bounds. Test:
  "a value with a line break the program puts in an input's place is shown by the element" (`bridge.test_suite.ts`).

## Possible improvements

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`bench/subscriptions.ts`) measures a parent's subscriptions only, and
  `bench/writes.ts`, run by hand, what a write into an input and a bridge's frame cost; neither runs in the CI.
- **A slider in React**: the React bridge has no counterpart of snabbdom's `slides`, and its tests no native slider;
  `volume` has no React view. [`docs/registers.md`](docs/registers.md), "The port of the ninth review" › "Left".
- **An input in a real browser**: the bridges are tested in happy-dom only, so an IME composition, and the caret
  when the program changes a value under the user, were never run. `docs/registers.md`, the same place.
- **An input that holds a `File`**: a `File` compares by reference, against "a model is data". The way seen, a
  register holding an id with the `File` in a service the upload's command reads, was reasoned only.
  `docs/registers.md`, "6. A slider, and the field generic over its value".

## Ideas, to be decided

- **Bridges as packages of their own** (`@fgaudo/effect-tea-snabbdom`, `@fgaudo/effect-tea-react`): the library
  stays free of renderers, and users stop copying `examples/snabbdom.ts` and `examples/react.ts`.
- **A devtools bridge over `onApplied`** (e.g. Redux DevTools), with time travel through `init: { state }` and
  replay through `applyAll`.
- **An example of routing**: flags from the URL, `popstate` as a subscription, navigation as a command.
- **An example of hot module reloading** that keeps the state, which the README hints at (the view lives in a
  module of its own) without showing.
- **A first frame for server-side rendering** (`renderToString` of the initial model), to be weighed against "a
  function earns its place by doing what Effect alone cannot".
- **`rehearse` without the options of `drive`** (review): `drive` takes every `RunOptions`, `rehearse` only `flags`,
  so a rehearsal cannot check an observer, nor its defect; "symmetric where its tools are" asks either for them or
  for a reason in `docs/rejected.md`.
- **Windows of absence on the real clock** (review): some tests sleep 20–60 ms and then check that nothing happened,
  and several are killers of mutations (`engine.test.ts`, the end of the engine lets its loop end first;
  `rehearse.test.ts`, the subscription waits between two messages; `run.test.ts`, a message sent as the renderer is
  released, and the wait on `onApplied`). A correct engine never turns them red, but a mutant may survive on a loaded
  machine, and `bun run mutations` runs copies at once. "A test never rests on the clock" names no such exception:
  either await what they check, or write the exception down.
- **What 1.0 needs**: the API looks close to stable; what `docs/rejected.md` parks would change it, and is weighed
  before freezing it.
