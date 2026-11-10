# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done or rejected, with the reason in the commit.

## Open problems

- **`onApplied` and `onIgnored` hold the loop.** It is documented ("it should be quick"), but a slow devtools slows
  the whole program, and nothing shows how to hand the work off (a queue of its own, a forked fiber).
- **The order of a step's commands is not stated.** They run concurrently in the run's `FiberSet`, with no bound,
  so their answers may arrive in any order. The README does not say so.
- **The README is hard to learn from.** As a specification it is precise; as a first contact it is 845 lines of
  dense prose. The changelog's entries are paragraphs too.

## Possible improvements

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`bench/subscriptions.ts`) measures a parent's subscriptions only.
- **A `CompositionDefect` names the child, not the message**: the one for a rejected external message could carry
  its tags, as `ProgramDefect`'s `on` does.
- **Two levels of documentation**: a short tutorial on the site that builds an application step by step, and the
  README as the specification it is.

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
- **What 1.0 needs**: the API looks close to stable; the problems above are the list to close before freezing it.
