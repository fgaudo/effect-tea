# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done or rejected, with the reason in the commit.

## Open problems

- **The changelog's entries are paragraphs**, where a reader looking for what changed would scan a line each.

Found by the second premise review of November 2026, each held by a `test.failing` case. Both are of one form, the
form of f415d46: a defect that nothing watches as a run ends is lost. They are meant to be fixed together, by one
mechanism (each fiber records what it dies of in a place of the engine's or the tool's, which the end reports), as
`AGENTS.md` asks of a finding's fix, and as `rehearse` now does.

- **A defect is lost while the run releases the renderer**: once `engine.await` is no longer raced, a command, a
  subscription or the loop that dies while the renderer releases what it holds leaves no trace, whether the run was
  interrupted or died elsewhere (`run.test.ts`, "the end of the run"). It was there before the first review.
- **`drive` interrupted by whoever runs it loses a defect of what a subscription releases** (`drive.test.ts`): its
  run is a child of its fiber, interrupted with it, and its exit is discarded.

## Possible improvements

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`bench/subscriptions.ts`) measures a parent's subscriptions only.
- **A scenario of `interleaving.test.ts` that reaches every guarantee**: today its rejected clicks are checked
  only to raise no defect (not to leave the state as it was), its subscriptions never end, its commands never die
  and nothing is released slowly, so "Nothing ends in silence" and the wait for the slowest release are checked
  only by the run's own tests.

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
