# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done or rejected, with the reason in the commit.

## Open problems

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
- **A list of mutations, one for each check an invariant rests on**, each with the tests that must fail under it: a
  script applies them one at a time, runs those tests alone, and fails when one passes. So "a check of what another
  fiber may change leaves a test that fails without it" (AGENTS.md) is run, not only done by hand once: taking out
  `dead` in `applyAlive`, the check before `interpret(command)`, the drop of a message of an earlier generation, the
  wait for the gone keys' releases before any key starts, the weak hold of `dispatchTo`. A few minutes for twenty or
  thirty, before a release; Stryker would mutate every line, but runs `bun test` only as a whole command, about
  seven hours for this code.

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
