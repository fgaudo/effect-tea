# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done or rejected, with the reason in the commit.

## Open problems

- **The changelog's entries are paragraphs**, where a reader looking for what changed would scan a line each.

Found by the second premise review of November 2026, each held by a `test.failing` case. The first two are of one
form, the form of f415d46: a defect that nothing watches as a run ends is lost. The run and `drive` lost it too, until
each fiber of the engine recorded what it dies of in a place of the engine's, which the end of the run reports.

- **`rehearse` interrupted by whoever runs it loses a defect of what a subscription releases** (`rehearse.test.ts`):
  the interruption skips `stopAll`, and closing `forks` discards the subscription's exit.
- **`rehearse` loses a defect of a release in a fiber of the test's that nobody joins** (`rehearse.test.ts`): the
  defect reaches only the fiber that applied the message. Whether the tool must report it is to be decided.

The last three come from `rehearse` letting several fibers of the test, and interruptions, into one step, where the
run has one loop. A single actor inside `rehearse`, a queue its fibers only offer to, as the run's dispatch does, would
hold all three.

- **`rehearse`'s `send` selects on a model older than the state it applies to** (`rehearse.test.ts`): it reads the
  model outside the permit, and dies with "update rejected …, which the model of the same state shows", which is
  false.
- **A `send` interrupted while its message stops a subscription leaves the state unwritten** (`rehearse.test.ts`):
  the subscription is stopped and its key is no longer active, but the state still lists it.
- **Two `hearNext` calls at once on one key: the second never hears** (`rehearse.test.ts`): one flag, `owed`, stands
  for every call waiting.

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
