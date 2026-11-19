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

Found in a review of the premises, 19 November 2026, each held by a `test.failing` case:

- **A reused element keeps its input**: an element a bridge reuses for another input keeps the first input's `Shown`,
  in both bridges, since snabbdom and React reuse an unkeyed `<input>` in the same place. A key typed into the first
  input then stays on screen against the second input's value, and the field goes dead. A fix could begin by treating
  an element that shows another input, told by its dispatch, as new to `drawn`; the guide's "Settling an element"
  would need the rule, which is asked of the owner first. Held by `bridges/bridge.test_suite.ts`, "an input in the
  place of another input", with the `steps` views of `bridges/snabbdom.test.ts` and `bridges/react.test.ts`.

## Possible improvements

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`tools/bench/subscriptions.ts`) measures a parent's subscriptions only, and
  `tools/bench/writes.ts`, run by hand, what a write into an input and a bridge's frame cost; neither runs in the CI.

## Ideas, to be decided

- **Bridges as packages of their own** (`@fgaudo/effect-tea-snabbdom`, `@fgaudo/effect-tea-react`): the library
  stays free of renderers, and users stop copying `bridges/snabbdom.ts` and `bridges/react.ts`.
- **A devtools bridge over `onApplied`** (e.g. Redux DevTools), with time travel through `init: { state }` and
  replay through `applyAll`.
- **An example of routing**: flags from the URL, `popstate` as a subscription, navigation as a command.
- **An example of hot module reloading** that keeps the state, which the guide hints at (the view lives in a
  module of its own) without showing.
- **An example of saving each state before its commands start**, which the guide names ("Running", "Work that must
  wait goes to the effects of the program") without showing: `onApplied` offers the state and its revision to a
  queue, a fiber of whoever runs the program saves it, and a wrapped `runCommand` waits until the state its step
  heard is saved. The options are functions since 19 November 2026; this is the form of an option that once waited.
- **What 1.0 needs**: the API looks close to stable; what `docs/rejected.md` parks would change it, and is weighed
  before freezing it.
