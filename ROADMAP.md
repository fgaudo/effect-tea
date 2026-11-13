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

- **To verify: the renderer may start after the first defect.** `running` in `run.ts` calls `render(frames)` after
  `Engine.make`, with no check of the register, so a subscription of `init` that dies as the engine starts may let
  the renderer's code run after the defect. The fifth premise review ruled it out with one run under Effect's own
  scheduler (an `init` subscription that dies at once, a renderer that counts its starts: none), never under the
  scheduler of the tests. To check: that scenario under `prioritizedSchedules` (depth 4, 2,000 seeds), counting the
  calls of `render` made once `deaths.all()` is not empty. The README promises only of `update` and `runCommand`, so
  a call found is a decision before it is a bug: check in the thunk that calls `render`, as for `runCommand`, or say
  in "Running" that the renderer may still start.
- **To verify: the end of the run may miss a fiber started after it looked.** The engine's finalizer
  (`Effect.addFinalizer` in `Engine.make`, `engine.ts`) takes `fibers` and `subscriptionFibers` in one thunk, then
  interrupts and awaits those alone. A step the loop is in when the run is interrupted, held by an uninterruptible
  `onApplied`, may start a command after that snapshot: the run then ends without awaiting it, or without the defect
  it dies of. Not a death, so the check of `runCommand` lets it start. The fifth review ruled it out with "a step held
  by an uninterruptible onApplied as the run is interrupted starts nothing the run does not await" (`run.test.ts`),
  under Effect's own scheduler. To check: that test's scenario under `prioritizedSchedules`, with a command that
  dies as it releases: the run's cause must hold that defect, and the command's release must have ended when the
  run returns. If one is missed, the form is a snapshot taken while another fiber may still add to the set: look for
  it in `rehearse`'s end too (`forks`, `underWay`).
- **A check of the engine that no test can hold, to keep or remove**, found as `mutations/mutations.ts` was
  written: the start of a subscription's fiber after the first defect (`dead() ? Effect.void : runSubscription(…)` in
  `reconcile`). The window it narrows is one the README promises nothing about, so it has no mutation. Under
  `prioritizedSchedules` (2,000 seeds), three subscriptions started by the step whose command dies run their
  channel's code after the defect in 59 runs at depth 3 and 127 at depth 4 with the check, 65 and 133 without: the
  scheduler yields between the check and the channel's first step, as AGENTS.md says. Only the interleavings, under a
  seed drawn at random, fail without it. Kept, it narrows a window at the cost of a check; removed, AGENTS.md's "one
  thunk" names the start of a subscription's fiber among what is checked, and changes with it.
- **`rehearse`'s loop checks the register before each step** (`recorded(deadOr(step))`), which hides the check of
  `Core.arrive` from every order but a scheduled one, as the engine's loop did: the check is held by `core.test.ts`,
  on `arrive` alone, and nothing holds that `rehearse` calls `update` through it. Unlike the engine's, it also keeps `hearNext` from starting a
  subscription after a death (`opening`): taken out, that start needs a check of its own, in the thunk that forks it.
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
