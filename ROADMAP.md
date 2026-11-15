# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done, with the reason in the commit. An item rejected is removed and added to
[`docs/rejected.md`](docs/rejected.md), with why and on what evidence, in the same commit: read it before adding one.
An item deferred or suspended leaves too, for "Parked, not rejected" there, with what would reopen it: this list
holds only what is to be done or decided now.

## Open problems

A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a deterministic
test of it. The items below come from a review of 15 November 2026, at `abe1614`; "confirmed" means a probe or a run
showed it, "reasoned" that it was read only.

### The tests and the checks

- **Checks of `docs/invariants.md` with tests but no mutation**: the `Effect.scoped` of `scopedIn` (a scope of its
  own for each command, subscription and renderer), the `CompositionDefect`s for an unhandled event, an external
  message to a missing child or one it rejects, and a child's command with no `runCommand`; and the engine's logs
  describing by `describeByTag`, which no test checks at all. Confirmed by reading.
- **`bun run mutations` does not enforce what `change-engine` says of a killer**: the killers of a mutation run in
  one process, `-t` is an unanchored pattern that runs any test whose name contains one, and a hung process counts
  every named killer as killed. Confirmed by reading.
- **`src/input-subscriptions.test.ts` has no module of its own**, and mixes type tests, pure semantics of
  `subscriptionsOf` and `composition`, and a `run` scenario that reads as an example. A judgement call.

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
- **What 1.0 needs**: the API looks close to stable; what `docs/rejected.md` parks would change it, and is weighed
  before freezing it.
