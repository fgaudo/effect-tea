# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done or rejected, with the reason in the commit.

## Open problems

The premise review of November 2026 on the changes 65ba8b9..d6c2e56 (branch `claude/premise-review-4`) found three
forms, all fixed. What is left of the first:

- **Windows no budget of operations reaches.** The check of the register is in the thunk that calls the program
  everywhere, but the tests reach only the loop's, and `runCommand`'s in the run: `rehearse`'s `run` and `model`,
  and the start of a subscription's fiber, pass without their check under every budget from 8 to 299. A scheduler the
  tests control, as effect-tea-persistent's (its decision 0104), would reach them. The interleavings never reach the
  budget either, and their "from the first defect on, the run applies no message" counts `onApplied`, which hears a
  message whose `update` was called before the death: under such a scheduler they must count the calls of `update`.
- **The changelog's entries are paragraphs**, where a reader looking for what changed would scan a line each.

## Possible improvements

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`bench/subscriptions.ts`) measures a parent's subscriptions only.

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
