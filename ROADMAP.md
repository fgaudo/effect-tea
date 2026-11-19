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

## Possible improvements

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`tools/bench/subscriptions.ts`) measures a parent's subscriptions only, and
  `tools/bench/writes.ts`, run by hand, what a write into an input and a bridge's frame cost; neither runs in the CI.
- **The property "the last frame has seen every dispatched message taken"** (`interleaving.test.ts`, added on
  19 November 2026 with the acknowledgement of every dispatched message) is the killer of no mutation: it was not run
  a hundred times under the mutations that take the acknowledgement out, as `change-engine` asks of a property before
  the list names it. The deterministic tests of `engine.test.ts` and `run.test.ts` are their killers meanwhile.
- **A frame a bridge does not draw again still waits for the next animation frame**, in both bridges: a frame of the
  very same model only settles the inputs, and could be taken at once. Kept, so that a bridge takes at most one frame
  per screen refresh, whatever it draws; weighed by nobody yet.

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
