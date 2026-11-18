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

Found in a review of 18 November 2026, each reproduced:

- **A parent's subscriptions cannot send a child's external messages, though its commands can**: `runCommand` answers
  `Own | ChildExternals<C>`, `subscriptions` only `Own`. Every program can still be written, through an own message
  and `children.<child>.update`, and both are sources of messages the run handles alike. To decide: allow it, or say
  in "Composition" why the two differ.
- **`drive`'s declaration spells out `DriveOptions` for a program with flags** (`change-api`, "Report it"):
  `DriveOptions` is an alias of an intersection, and intersected again with `FlagsOption` it reads
  `RunOptions<…> & { readonly patience?: … } & …` in `api/effect-tea-testing.api.md`.
- **The failure of `drive`'s `patience` carries an `Option` of the model** as its `cause`, not the model: say so where
  the guide describes it, or give the model itself.

## Possible improvements

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`tools/bench/subscriptions.ts`) measures a parent's subscriptions only, and
  `tools/bench/writes.ts`, run by hand, what a write into an input and a bridge's frame cost; neither runs in the CI.

## Ideas, to be decided

- **Bridges as packages of their own** (`@fgaudo/effect-tea-snabbdom`, `@fgaudo/effect-tea-react`): the library
  stays free of renderers, and users stop copying `examples/bridges/snabbdom.ts` and `examples/bridges/react.ts`.
- **A devtools bridge over `onApplied`** (e.g. Redux DevTools), with time travel through `init: { state }` and
  replay through `applyAll`.
- **An example of routing**: flags from the URL, `popstate` as a subscription, navigation as a command.
- **An example of hot module reloading** that keeps the state, which the guide hints at (the view lives in a
  module of its own) without showing.
- **What 1.0 needs**: the API looks close to stable; what `docs/rejected.md` parks would change it, and is weighed
  before freezing it.
