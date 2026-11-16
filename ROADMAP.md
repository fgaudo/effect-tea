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

The items marked "(review)" below come from a review of the whole repository (November 2026), and were only
reasoned.

## Possible improvements

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`bench/subscriptions.ts`) measures a parent's subscriptions only, and
  `bench/writes.ts`, run by hand, what a write into an input and a bridge's frame cost; neither runs in the CI.

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
