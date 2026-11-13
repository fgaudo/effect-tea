# @fgaudo/effect-tea — guide for coding agents

How the library is used is in [`README.md`](README.md): its "Guide" and "Testing" are the user documentation, and
"Development" names the checks. This file holds the rules that apply to every change; how the engine keeps its
invariants is in [`docs/invariants.md`](docs/invariants.md), and what they rest on in
[`docs/premises.md`](docs/premises.md).

Procedures live in skills, plain Markdown that any agent or person reads, under `.agents/skills/`. Read the one
for the task before starting it:

| Before…                                                 | read                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| adding, changing or removing an export                  | [`change-api`](.agents/skills/change-api/SKILL.md)         |
| changing the engine or a testing tool, or their tests   | [`change-engine`](.agents/skills/change-engine/SKILL.md)   |
| adding or changing an example, or the bridge they share | [`add-example`](.agents/skills/add-example/SKILL.md)       |
| an API of a newer Effect, or a dependency upgrade       | [`upgrade-effect`](.agents/skills/upgrade-effect/SKILL.md) |
| a changelog entry, the version, a release, the site     | [`release`](.agents/skills/release/SKILL.md)               |
| a review of what the invariants rest on                 | [`premise-review`](.agents/skills/premise-review/SKILL.md) |

The engine is `src/core.ts`, `engine.ts`, `run.ts`, `compose.ts`, `dispatch.ts` and `log.ts`, and the testing tools
are `src/testing/`: a change of one, of `mutations/` or of `test/scheduled.ts` reads `change-engine` first, whatever
else it is.

## Language

All code, comments, identifiers, commit messages and `.md` files are in **English**.

## Commits

A commit made with an AI agent ends with an `Assisted-by: <model>` trailer (e.g. `Assisted-by: Claude Opus 5.5`),
never `Co-Authored-By`: the author is the person who commits. A clear subject is usually enough: a body only says
why, or what the diff, the docs and the changelog do not, never what they already describe.

## What belongs here

- **Generic, and only Effect.** The library knows nothing of the applications that use it, nor of any
  renderer: views are generic over their node type, and the renderer is a function given to `run`. `effect`
  (v4) is its only dependency, as a peer. Biome forbids renderer imports, and `lib` (`ES2022`, no `DOM`)
  rejects browser APIs, everywhere but in `examples/`.
- **An API of its own.** The API is exactly what `src/index.ts` and `src/testing/index.ts` export; every other
  module is internal. It is judged on its own terms, from the library's concepts, its examples and its users in
  general: coherent, symmetric where its tools are (what `drive` gets, `simulate` and `rehearse` are asked
  about), and never shaped by, nor justified with, what one application happens to use.
- **A type is Effect's or the library's, never half of each.** One of Effect's is an alias with a name
  (`Subscription` is a `Channel`, `Execution` an `Effect`): it is built and transformed with Effect's own
  combinators, and the library defines no function over it. One of the library's own has a shape the library
  defines and documents, public where it is meant to be written by hand (an `update` writes a `Step`,
  `{ state, commands?, events? }`, as data) and hidden where it is not (a program a `parent` composes); the
  library gives the functions over it (`andThen` and `raise` over `Step`). An alias with a few helpers over it
  has the costs of both and keeps neither promise: users still write the representation everywhere else, so it
  cannot change. A type moves to the library's side only when the library must do with it what Effect alone
  cannot: inspect it in tests without running it, keep it the same across frames by a cache of its own (as
  `dispatchTo` does for a dispatch), or enforce at construction what the type cannot. A subscription is already
  inspected by its key: that is why `Subscription` stays Effect's.
- **A function earns its place by doing what Effect alone cannot**, or by being the one place where a rule of
  the library is applied (`reject`, `parent`). A name over a composition of Effect's combinators is not one,
  however often the composition recurs in an application: `attempt`, `silent` and `Subscription.every` were
  removed by this rule. A type that already imposes a rule (`Execution` cannot fail, a `Subscription` ends with
  a message) makes the function that would remind of it superfluous. A form of a declaration that takes a
  standard type of Effect in place of hand-written functions (`at`, an `Optic`, for `get` and `set`) is not a
  function, and may stay. `forEach` over `Step`, the n-ary `andThen`, is a fold the rule admits: with it, a parent
  tells one message to each of its children by id (the `list` example). Both are dual (`Function.dual`), for a
  chain of steps written in a `pipe`.
- **Only stable APIs.** A module or function marked `@stability unstable` in Effect's declarations may change
  under the library's users: never build on one, not even as an option, and not in `examples/` either, since
  users copy them. The same holds for React's `unstable_` and `experimental_` APIs in the bridges. The typecheck
  fails on one, in the library and in the examples (the Effect language service's `unstableApiUsage`).
- **Nothing deprecated.** No module, type, function, method or option marked `@deprecated`, of any dependency,
  in the library, its tests or its examples: use what the deprecation names instead, and replace a use found in
  passing. `bun run lint` warns about one (Oxlint's type-aware `typescript/no-deprecated`).
- **The peer range starts at the Effect the library is developed with** (`^4.1.4` today): `peerDependencies`
  names the version of `devDependencies` with a caret, and an upgrade of Effect raises both in one commit, so that
  the library is checked, and what it rests on of Effect read and tested, at one version only. No older Effect is
  supported. An API that exists only in a newer Effect is not a reason for a workaround: ask whether to upgrade
  (`upgrade-effect`).
- **A change a consumer can notice has a changelog entry** in the same commit, and raises the version when it
  needs more than the unreleased section says (`release`).
- **The README is a specification.** Its "Guide" and "Guarantees" say what the library promises, and
  applications cite them as rules. Its prose changes one section at a time, each sentence checked against the
  old one: the same promise, no weaker and no stronger, as the code and the tests keep it. A word that looks
  minor ("exactly when", "by `Equal`", "never more") is often the rule.

## Invariants

The README's "Guarantees" says what a user may rely on. [`docs/invariants.md`](docs/invariants.md) says how the
engine keeps each one and what a change must not undo, and [`docs/premises.md`](docs/premises.md) what they rest on
of Effect's runtime and of the JavaScript engine, each with what checks it. Both are read before a change of the
engine or of a testing tool (`change-engine`), and they rule where this summary says less. What every change keeps,
an example's and a document's too:

- **`update` is pure and called freely**: never assume it runs once per message.
- **`reject` means one thing: the message does not apply in the state.** Never add a runtime check of the model
  against `update`, nor a way for a model to ask `update` what it accepts. A `defect` is only for a message the state
  and the engine together rule out: an example never dies on a message of its view, nor on an event raised for one.
- **A parent and its children talk only through external messages and events**: a break of what a parent declared
  is a `CompositionDefect`, and the types enforce what it declares.
- **Every program keeps its state in an object**, replaced and never mutated: a child's model and its lifted
  subscriptions are kept by it. Never add a cache for primitive states, nor hold a child's dispatch strongly.
- **Running a dispatch needs no services and completes synchronously**, from a plain callback with
  `Effect.runSync`: it is the renderer's business, and the library exports no helper for it.
- **Defects always die, and the run dies with them.** Nothing in the library may retry, swallow, log or turn them
  into messages: reporting is the job of whoever runs the program.
- **A subscription never ends in silence**: its end value is a message (or `never`), and an ended one is never
  restarted automatically. Subscriptions are reconciled by key.
- **Commands are data; only `runCommand` runs them**, and they cannot be cancelled: do not add cancellation without
  asking.
- **Each command, each subscription and the renderer has a scope of its own**: never let them acquire into the
  run's scope.
- **Frames cost only what is drawn**, and no span lives as long as the run.
- **`onApplied` and `onIgnored` watch, never steer.**
- **The testing tools behave like the engine** where it is deterministic: when the engine or one tool changes, keep
  the others in step.
- **Logs never carry message data by default**: only tags, at `debug`. A subscription's key is logged as it is.
- **A premise about what code does when it runs is checked before the change that rests on it is written**, and
  never only reasoned: by the documentation of a stable API, or by a test that fails without it.

## Code

- One module per concept: `update.ts`, `command.ts`, `subscription.ts`, `dispatch.ts` (views and their
  dispatch), `program.ts` (the program and its types), `compose.ts` (`parent`), `log.ts`, `defect.ts`;
  `core.ts` is what the run and the testing tools share, as pure functions of data (`docs/shared-core.md`);
  `engine.ts` is the runtime only (with `RunOptions`), and `run.ts` connects it to a renderer. `testing/` holds
  one module per testing tool (and `unexpected.ts`, the failure they share, `ledger.ts`, what `rehearse` keeps of
  its commands and starts, as pure transitions, and `loop.ts`, the loop that applies its steps one at a time).
- A piece of a program that may be missing (`runCommand` without commands, `subscriptions`) is read through
  `runCommandOf` and `subscriptionsOf`, never directly: the engine always gets the complete set. Likewise
  `init`, a step or a function of the flags, is read through `startOf`: a step is never a function, so `typeof`
  tells them apart, and so does `compose` for a child's handle.
- Effect modules are imported as namespaces (`import * as Effect from 'effect/Effect'`), with `Arr`, `Opt` for
  `Array`, `Option`.
- A function that returns an effect made with `Effect.gen` is an `Effect.fnUntraced` instead, with what would
  follow it in a `pipe` as its further arguments, tests included: the library opens no spans of its own (they
  belong to the application, e.g. `Effect.fn('Save')` in a `runCommand`), and the stack frames `Effect.fn`
  records add nothing a test's name does not say. An effect that takes no arguments stays an `Effect.gen`.
- Relative imports carry the `.ts` extension (Biome's `useImportExtensions`); `tsc` rewrites them to `.js` in
  the build, and `build.ts` does the same in the declarations.
- Comments only for what the code cannot say: a reason, an invariant the types do not show, a choice that
  would look like a mistake. Never a repetition of names or of the next line.
- No blank lines between the statements of a block; blank lines separate declarations and `describe`/`test`
  calls.
- Formatting: 120 columns, two-space indentation, single quotes, no semicolons, trailing commas in multiline
  lists; `.md` prose wrapped at 120 columns. No formatter is set up: match the surrounding code, and touch only
  the lines you change.

## Tests

- `bun:test`, in a `*.test.ts` next to the module. Tests are excluded from `dist/` and from the packed `src/`.
- Test through behaviour (`run`, `Engine.make`, the public functions), not through internals.
- A test of the library is of one of five kinds, and a test of none of them is not added:
  - **the semantics of the pure pieces**: what a function that runs nothing returns, as a `Step` and `andThen`,
    `forEach` and `reject` over it, a parent's composition, how a child's message is wrapped, how the logs describe
    a message, `defect`, `applyAll` and `dispatchViolations`, what the core makes of a cause and of the keys of a
    state. They lie in the test file of their module (`compose.test.ts`, `dispatch.test.ts`, `log.test.ts`,
    `defect.test.ts`, `core.test.ts`, `src/testing/`).
  - **invariants under random histories**: fast-check draws clicks, answers, subscription messages and ends,
    releases, defects and self-interruptions, and the seed of the order the scheduler of the tests (`test/scheduled.ts`)
    runs them in, and each promise of the README's "Guarantees" that the scenario reaches is checked on every one
    (`interleaving.test.ts`). It is a search, from a seed drawn on each run, and runs apart: `bun run interleavings`,
    and a daily job of the CI (`.github/workflows/interleavings.yml`), never `bun run test`. How a lead it finds is
    weighed is in `change-engine`; a finding is listed in `ROADMAP.md` with its seed and path until a fix leaves a
    deterministic test of it.
  - **contracts**: one program and its inputs given alike to each testing tool and to the run
    (`src/testing/contract.test.ts`, where a `test.failing` says how they still differ), and one view to each
    bridge (the same tests, `messagesSentBy`'s included, in `examples/snabbdom.test.ts` and
    `examples/react.test.ts`).
  - **the boundary of a run**, the run's or a testing tool's: its lifecycle, scopes, interruption and defects, what
    it holds and lets go, what a tool fails on (`run.test.ts`, `engine.test.ts`, the cache of `dispatchTo` in
    `dispatch.test.ts`, a parent's subscriptions in a run in `compose.test.ts`, each tool's own file in
    `src/testing/`, a bridge's `renderInto`). A test of a premise (`docs/premises.md`) is of this kind,
    and so is one of the scheduler of the tests, `test/scheduled.ts`, which is no part of the package and serves the
    search alone.
  - **the types**: what the compiler refuses (`@ts-expect-error`), or infers (`expectTypeOf`), next to the tests
    of the function whose types they are.

  A bug found is held by a case of one of them: a rule of a pure piece, an invariant, a contract, a boundary or a
  type, and gets a scenario of its own only where none can hold it. The examples' own tests show users how to test
  a program, and the smoke test (`smoke/`) and the benchmark (`bench/`) check the package and its speed: none of
  them is a test of the library's correctness, and they are kept apart from the five.
- **Each check an invariant rests on has a mutation** in `mutations/mutations.ts` that takes it out, with the tests
  that must fail under it: `bun run mutations` applies them one at a time to a copy of the repository (`.mutants/`),
  runs those tests alone, and fails when one passes under its mutation, or fails without it. A new check adds its
  mutation; a test of one renamed or removed, or the code it replaces rewritten, updates the list. It runs before a
  release (`release`), and after a change of a file it mutates; what a mutation is, and is not, is in
  `change-engine`.
- **The tests of `src/` and `test/` run on Node too**, on V8 as Chrome and Edge run the library: `bun run test:node`
  makes Node resolve `bun:test` to `test/node/bun-test.ts`, which gives what the tests use of it over Node's own
  runner, with Jest's `expect`. A test that needs more of `bun:test` adds it there, and one that asks for a
  collection calls `test/gc.ts`, never `Bun.gc`. Node strips the types itself, so the TypeScript is erasable
  (`erasableSyntaxOnly`: no enum, namespace or parameter property). The search runs on Bun alone: the scheduler of
  the tests decides the order its fibers run in, whatever the engine, so V8 would run the same histories. So do the
  examples' tests: their programs are pure, and their bridges are tested against a renderer and happy-dom, not
  against the engine.
- A test's name says what it checks. When a change touches a test, or what it tests, check that its name, its
  `describe` and its comments still say what the assertions check: a test adapted to a new design keeps an old
  name that promises what it no longer proves.
- Only the bridges' tests, `examples/snabbdom.test.ts` and `examples/react.test.ts`, register a DOM (happy-dom);
  every other test runs without one.

## Checks

Before finishing, from the repository root: `bun run typecheck` (`tsc` with the Effect language service, on the
library and on the examples), `bun run lint` (Biome and Oxlint) and `bun run test`; after a change of the engine or of
a testing tool, or of their tests, `bun run test:node` and `bun run interleavings` too. `bun run build` compiles
`src/` into `dist/` (ignored by git) and runs before `bun pm pack`. An API change is also checked as a consumer
would see it (`change-api`).
