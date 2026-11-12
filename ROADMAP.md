# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done or rejected, with the reason in the commit.

## Open problems

- **The interleavings order promises with fast-check's scheduler**, which never yields a fiber between two of its
  steps: "from the first defect on, the run applies no message" and "… starts no command" (`interleaving.test.ts`)
  hold in every run they make, but reach no window between a check and its act, which only the tests of the engine
  and of `rehearse` under `test/scheduled.ts` reach ("after the first defect, a yield of the scheduler in between").
  Fake timers alone would not let them run under that scheduler: no `Effect.sleep` is used, and what blocks it is
  fast-check's scheduler itself, whose promises need microtasks, which a run stepped by hand never runs. The plan:
  - **fast-check draws data, the scheduler of the tests the order.** `property` keeps drawing `fates`, `acts` and
    `bursts`, drops `fc.scheduler()`, and draws a seed for `prioritized` (`test/scheduled.ts`) in its place, or runs
    each scenario under `prioritizedSchedules` over a few seeds. A failure then names both seeds, fast-check's for
    the scenario and the strategy's for the order, and each replays it.
  - **Each point that waits becomes a yield.** `later` and `whenScheduled` (nine uses) wait on
    `scheduler.schedule(Promise.resolve(…))` through `Effect.promise`: they become `Effect.yieldNow` (or
    `Effect.as(Effect.yieldNow, value)`), a point where the strategy picks the next fiber. The act loop of
    `runScenario` waits on the same scheduler before each act: a yield too.
  - **One effect, run to its end.** `runScenario` runs the program with `Effect.runFork`, the acts with a second
    `Effect.runPromise`, and moves between them with `settle`, which releases fast-check's promises in bursts with a
    `setTimeout(0)` (`macrotask`) between them, and an idle count to tell the end. All of it becomes one
    `Effect.gen`: fork the run, run the acts, wait until nothing is under way, interrupt the run, await its exit. It is
    then run by `scheduled` (or `prioritizedSchedules`), synchronously, and `settle`, `macrotask` and `bursts` go away:
    the bursts were there so that messages meet in the engine's queue, which the strategy's preemptions now give. How
    the scenario tells "nothing is under way" without the idle count is the one design point to decide: a run stepped
    by hand ends when no task is ready, so `scheduled`'s `left` and `exit` may replace it.
  - **What must still hold.** The run under `Logger.tracerLogger`, `References.MinimumLogLevel` and
    `Effect.withSpan('caller')` stays as it is, as do every property and its events, `Updated` included. The coverage
    test, "the scenarios reach every message, every way of dying, and what each property checks" (500 runs, a random
    seed), must still reach every tag: a new order may make some rarer, and its count of runs, or the strategy's depth,
    is raised until it does, never a tag dropped.
  - **Done when** each property passes under the new runs; taking out the check of `applyAlive` in `engine.ts`
    (`dead` given as `() => false`) makes "from the first defect on, the run applies no message" fail, and taking out
    the one before `interpret(command)` in `runCommand` makes "… starts no command" fail, as they make the engine's
    tests under the scheduler fail (rule of AGENTS.md: a check of what another fiber may change leaves a test that
    fails without it); the suite takes no longer than today (about 60 seconds for `bun run test`); and this item
    goes, with the README's "Guarantees" ("It checks too that the run … from the first one on applies no message and
    starts no command") read again against what the interleavings now reach. The premise is already listed: "Every
    fiber of a run asks the `Scheduler` it is given before each step…" in AGENTS.md, with its tests in `test/`.
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
