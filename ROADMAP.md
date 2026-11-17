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

## Ideas, to be decided

- **Bridges as packages of their own** (`@fgaudo/effect-tea-snabbdom`, `@fgaudo/effect-tea-react`): the library
  stays free of renderers, and users stop copying `examples/snabbdom.ts` and `examples/react.ts`.
- **A devtools bridge over `onApplied`** (e.g. Redux DevTools), with time travel through `init: { state }` and
  replay through `applyAll`.
- **An example of routing**: flags from the URL, `popstate` as a subscription, navigation as a command.
- **An example of hot module reloading** that keeps the state, which the guide hints at (the view lives in a
  module of its own) without showing.
- **One constructor for every program**, in progress: `program<…>()` (once `composition`) makes a program without
  children too, and `: Program<…>` stops being the way the guide teaches to write one (`Program` stays a type, for
  signatures and tests). A type `program` names is checked, one it does not name is inferred: `model` and `message`
  (the program's own messages) become nameable, and the services are always inferred. A spike of 17 November 2026,
  uncommitted, holds it: `make` returns a `ProgramShape<{ … }>` (a `Program` without its check of external
  messages, whose marker would otherwise satisfy the check of `child`), a leaf infers its services exactly over two
  branches of `runCommand` and a map of subscriptions with an empty branch, is assignable to `Program<…>`, and rejects
  a wrong command, model or message and a missing `makeModel` or `runCommand`. Without children, `init` is already a
  `Program`'s, a step or a function of the flags (the children declared decide, at run time too). Left: a `TS4023` on
  declaration emit (`ExternalTypeId` cannot be named) seen once in the spike and not isolated, which would hit whoever
  publishes a program; then the seven leaves of `examples/`, the guide, the tutorial, the README, the skill, the
  changelog and the API reports. Why not `satisfies Program<…>` with
  services as `unknown`: it loses services, commands and messages (`typeof` reads the literal), and confuses.
- **Children declared apart from the parent's own state**, kept inside it by `program`: a parent's state type
  would hold only its own, with no `at`, `get` or `set` for a child, and children born and removed some other way.
  Not spiked; weighed after the constructor above.
- **A check of the names given to `Program<{ … }>`**: an unknown field (`subscriptionService`) is accepted silently
  today, since `ProgramTypes` is only a constraint. Fable tried an intersection in the style of `ExternalAmong` that
  fails with `'not a type of a program'`. Not decided.
- **What 1.0 needs**: the API looks close to stable; what `docs/rejected.md` parks would change it, and is weighed
  before freezing it.
