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

Found in a review of the premises, 19 November 2026, each held by a `test.failing` case:

- **Interruptions taken for the run's**: a fiber of the program that interrupts a command's or a subscription's fiber
  is taken for the run's interruption, since it carries no mark, and the fiber ends in silence: the run goes on,
  `simulate` fails with a bare interruption, and `rehearse` ends interrupted or `hearNext` waits for ever. The same
  holds for the renderer, where the run ends in success, and for the loop interrupted from `onApplied` or `onIgnored`,
  where the run never ends. It is one form, in `diesIn` and `otherwiseDefect`. To decide: whether "Only the run, and
  whoever runs it, interrupt them" ("Guarantees", "Nothing ends in silence") is a promise the code keeps, or a rule
  left to the program. If a promise, a spike first that interrupts whoever runs the program after k steps, as the one
  of "A flag for each fiber" in `docs/rejected.md` did, so that no false defect appears in `init`. Held by
  `src/run.test.ts`, "an interruption made by another fiber of the program", and `src/testing/contract.test.ts`, "a
  command or a subscription that a fiber of the program interrupts".
- **A reused element keeps its input**: an element a bridge reuses for another input keeps the first input's `Shown`,
  in both bridges, since snabbdom and React reuse an unkeyed `<input>` in the same place. A key typed into the first
  input then stays on screen against the second input's value, and the field goes dead. A fix could begin by treating
  an element that shows another input, told by its dispatch, as new to `drawn`; the guide's "Settling an element"
  would need the rule, which is asked of the owner first. Held by `bridges/bridge.test_suite.ts`, "an input in the
  place of another input", with the `steps` views of `bridges/snabbdom.test.ts` and `bridges/react.test.ts`.

## Possible improvements

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`tools/bench/subscriptions.ts`) measures a parent's subscriptions only, and
  `tools/bench/writes.ts`, run by hand, what a write into an input and a bridge's frame cost; neither runs in the CI.

- **The tools on `effect/cli` and `effect/process`**, decided on 19 November 2026. The tools may build on Effect's
  unstable modules, as `AGENTS.md` says ("Only stable APIs"): `tsconfig.json` lists them for `tools/` in an
  `allowedUnstableApis` of its `overrides`, and a module is added there when a tool first needs it.
  `tools/mutations/mutate.ts` (commit `fa0f97c`) and `tools/api-report.ts` are done, and the model for the rest: a
  `Command.make` with typed flags, given to `main` of `tools/cli.ts`, which runs it by `Command.run` and
  `BunRuntime.runMain` over `BunServices.layer`, with the version of `package.json`, which `Command.run` asks for; an
  `exec`, there too, that spawns a process in a scope of its own and collects its output and its exit code
  (`spawner.string` does not check the exit code); and a `Failed`, there too, marked
  `[Runtime.errorReported] = false` and printed by `main`, so that it shows with no stack and exits with 1. A run of the
  mutations stopped by Ctrl+C was checked on Windows: it ends every `bun test` it started, removes `.mutants/`, and
  exits with 130, by the default teardown of `runMain`, run by `bun` and by `bun run` alike, 4 and 20 seconds in (the
  exit code of 0 reported before was not seen again, with the exit code read after `WaitForExit`). What was learned on
  the way: a list of `overrides` replaces the language service's default one, which is why `tsconfig.json` repeats the
  rule for `src/`; `@effect/platform-node` names `redis` as a peer it needs, so the tools run on
  `@effect/platform-bun`; `Flag.filter` prints its message after "Expected:"; `Flag.Boolean` is given a default of
  `false`; and a console's Ctrl+C can be sent from a script on Windows by `AttachConsole` and
  `GenerateConsoleCtrlEvent`, where a signal from another process ends a process without its finalizers. Each step is
  a commit of its own, and leaves the tool's output, flags and exit codes as they were, unless the step says
  otherwise:
  1. **`tools/smoke/smoke.ts`**: `--effect` (optional, the repository's Effect by default), `--typescript` (a list,
     `5.9,6.0,7.0` by default) and `--keep`; Bun's `$` (`bun pm pack`, `npm install`, `node …`) through `exec`; each
     `throw new Error` as a `Failed`. It runs in the CI on Linux (`ci.yml`'s `package` job and `docs.yml`), so check
     that it passes there before the step is done. `tools/smoke/consumer.ts` is the code of a user and keeps the rule:
     it stays stable, and out of the override.
  2. **`tools/inference/generate.ts`**: `--typescript` and `--scale` are lists, `--filter` is optional, and
     `--exact` and `--unchecked` are lists of `true` and `false` whose product is the matrix, not booleans; it ends
     with `process.exitCode = 1`. `tools/inference/prelude.ts` and the programs it writes into `.inference/` keep the
     rule. It does not run in the CI: run it whole and compare its `report.json` with one from before the step.
  3. **`tools/bench/subscriptions.ts` and `tools/bench/writes.ts`**: their arguments by position (`Number(argv[2])`,
     where a typo gives `NaN` with no error) as named flags with defaults (`--children`, `--changes`; `--writes`,
     `--rounds`, `--sections`), and a change of `package.json`'s `bench` script and of the comment of `writes.ts`
     that tells how to run it. `writes.ts` runs on Node too: `@effect/platform-node-shared` has no `NodeServices`, so
     the layer is built from its modules (`NodeChildProcessSpawner`, `NodeFileSystem`, `NodePath`, `NodeStdio`,
     `NodeTerminal`) and run by its `NodeRuntime`, chosen by `typeof Bun`; that package is then added to the
     `devDependencies` (`~` the version of Effect), to the override and to `effect-latest.yml`, as
     `@effect/platform-bun` was. The programs the benchmarks measure keep the rule.

  Each step runs `bun run typecheck` and `bun run lint`, and the tool it converts in each of its modes.
  `tools/build.ts` and `tools/comments.ts` take no flags, and are left as they are: a command would add nothing.

## Ideas, to be decided

- **Bridges as packages of their own** (`@fgaudo/effect-tea-snabbdom`, `@fgaudo/effect-tea-react`): the library
  stays free of renderers, and users stop copying `bridges/snabbdom.ts` and `bridges/react.ts`.
- **A devtools bridge over `onApplied`** (e.g. Redux DevTools), with time travel through `init: { state }` and
  replay through `applyAll`.
- **An example of routing**: flags from the URL, `popstate` as a subscription, navigation as a command.
- **An example of hot module reloading** that keeps the state, which the guide hints at (the view lives in a
  module of its own) without showing.
- **What 1.0 needs**: the API looks close to stable; what `docs/rejected.md` parks would change it, and is weighed
  before freezing it.
