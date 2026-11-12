# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done or rejected, with the reason in the commit.

## Open problems

- **The changelog's entries are paragraphs**, where a reader looking for what changed would scan a line each.

### Found by the third review of the premises (November 2026)

Each is held by a `test.failing` case named after what should hold; its fix removes the mark and the item.

- **A run that died goes on applying messages and starting commands while its renderer releases**: `runWith`
  reports the defect at once, then awaits the renderer while the engine's loop still runs, where `rehearse` says
  nothing happens in a run that died. The interrupted run keeps its loop on purpose, so the fix tells the two ends
  apart. `run.test.ts`, "a run that died applies no message, and starts no command, while the renderer releases".
- **What the renderer, or the run's own fiber as the engine starts, dies of is placed in the cause by when the run's
  fiber reads it**, not by when it died: only the engine's fibers record their deaths (`makeDeaths`), so a later
  defect can come first and `Cause.squash` gives it. `run.test.ts`, "a renderer that dies before a command is the
  first defect of the cause", "a subscription that dies as the run starts comes before a log that dies after it".
- **A call of `rehearse` already waiting is not ended by a defect in another fiber of the test's**, where the run
  dies at once: a `hearNext` on a subscription that sends nothing, or a `run` of a command that never answers, waits
  until whoever runs the rehearsal interrupts it (`died` of `makeDeaths` is raced with no wait). `rehearse.test.ts`,
  "a hearNext waiting on its subscription fails as soon as another fiber of the test's dies", "a run waiting for its
  command fails as soon as another fiber of the test's dies".
- **Of two `hearNext` waiting on one key as its subscription ends, one hears the end and the other waits for
  ever** (`ends` is `Effect.never` once the subscription succeeded). `rehearse.test.ts`, "of two hearNext waiting as
  the subscription ends, one hears its end, the other fails".
- **A `hearNext` waiting as its key goes away leaves an `Interrupt` in the rehearsal's cause after the defect of the
  release**, where the run's cause holds the defect alone. `contract.test.ts`, "rehearse fails with the defect alone,
  as the run dies, though a hearNext waited".

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
