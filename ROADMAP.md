# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done or rejected, with the reason in the commit.

## Open problems

An audit of November 2026 of every check of what another fiber may change against the act it guards (the rule
"one thunk" of AGENTS.md) found these. Covered, each check in the thunk of its act: the calls of `update` by the
engine's loop and by `rehearse`'s (`Core.arrive`, for both), of `runCommand` by the engine (`alive` around
`interpret(command)`) and by `rehearse`'s `run`, of `makeModel` by `rehearse`'s `model`, and the take from `pending`
of `run` and `runAll` (`Ledger.take`, which finds the command or none in one thunk). The engine's `active` and
`started`, and `rehearse`'s `now` and `active`, are read and written by one fiber only, the loop, but for the end of a
start, which `hearNext` marks in the thunk where it counts the calls still waiting; `rehearse`'s ledger is written by
every fiber of the test's, one transition per thunk, so no window opens on them. Beyond any check: the first step of
a subscription, or of an effect already started, which the README promises nothing about, and a `makeModel` the
renderer reads as it releases, which the README says still makes its model.

A lead below is checked under `test/scheduled.ts` in both of its modes of resumption. A failure under `'inline'`
is an order Effect's own scheduler gives, but for where it preempts, and so reachable when the program runs. One
under `'queued'` alone (the default) rests on a fiber resumed by a `Deferred` or a `Fiber.join` waiting for its turn,
where Effect 4.1.4 resumes it at once on the stack of the fiber that completes it: still a finding by the rules of
AGENTS.md, since that inline resumption is read only in the source, unless it is added as a premise with a test
that fails without it.

- **The run's tests rest on the order of Effect's yields**, which Effect does not promise: one test under
  `prioritizedSchedules` is the only killer of its mutation ("runAll runs what is pending, though another call takes
  the last command", `rehearse.test.ts`), and `test/scheduled.ts` models that order from Effect's source, in two
  modes neither of which reaches every order of the other. First, before the rest of this list.
  [`docs/single-owner.md`](docs/single-owner.md) holds the first by construction, with a plan. Its steps 1 to 3,
  which change nothing a consumer sees, are done (a function of the program is called where the call is decided, one
  check for each call, a fiber and how it stops are one primitive), and so are steps 4 and 5: the run stops the loop
  first as it ends, keeps one check, where the loop applies a message, has none in the middle of a step, and calls
  `render` once as it starts, so that a step under way when a defect is recorded may start its commands. The
  scheduled test of the renderer went with its check. To decide:
  whether a dropped message is described after a defect (step 6); whether `runAll`'s mutation, of a form the ledger
  rules out, stays with its scheduled test (step 7); whether the search of `interleaving.test.ts` stays as an alarm,
  or goes with `test/scheduled.ts` and its two modes (step 8).
- **The changelog's entries are paragraphs**, where a reader looking for what changed would scan a line each.

## Possible improvements

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`bench/subscriptions.ts`) measures a parent's subscriptions only.
- **The tests on Node too**, where V8 runs them as Chrome and Edge do: every test runs on Bun, whose engine is
  JavaScriptCore, and `smoke/` runs on Node only what a consumer does with the package. What AGENTS.md lists under
  "What the invariants rest on" of the JavaScript engine (`WeakRef`, `FinalizationRegistry`, the order of callbacks)
  is checked on Bun alone. Every test file imports `bun:test`, and the tests of what is let go call `Bun.gc`
  (`dispatch.test.ts`, `compose.test.ts`): the boundary tests and the premises first, on a runner both run, or with
  `--expose-gc` in place of `Bun.gc`.
- **A report of the public API**, generated from the declarations of `dist/` and committed, so that a change of
  what `src/index.ts` and `src/testing/index.ts` export shows in the diff, and a breaking one is not made by
  accident (as api-extractor does), with a check that the package's types resolve for each kind of consumer.
  `change-api` asks for this by hand today.

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
