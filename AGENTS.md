# @fgaudo/effect-tea — guide for coding agents

How the library is used is in [`README.md`](README.md): its "Guide" and "Testing" are the user documentation, and
"Development" names the checks. This file holds the rules that apply to every change.

Procedures live in skills, plain Markdown that any agent or person reads, under `.agents/skills/`. Read the one
for the task before starting it:

| Before…                                                 | read                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| adding, changing or removing an export                  | [`change-api`](.agents/skills/change-api/SKILL.md)         |
| adding or changing an example, or the bridge they share | [`add-example`](.agents/skills/add-example/SKILL.md)       |
| an API the peer minimum lacks, or a dependency upgrade  | [`upgrade-effect`](.agents/skills/upgrade-effect/SKILL.md) |
| a changelog entry, the version, a release, the site     | [`release`](.agents/skills/release/SKILL.md)               |

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
- **Only stable Effect APIs.** A module or function marked `@stability unstable` in Effect's declarations may
  change under the library's users: never build on one, not even as an option. The typecheck fails on one (the
  Effect language service's `unstableApiUsage`), except in `examples/`, which are not published.
- **Nothing deprecated.** No module, type, function, method or option marked `@deprecated`, of any dependency,
  in the library, its tests or its examples: use what the deprecation names instead, and replace a use found in
  passing. `bun run lint` warns about one (Oxlint's type-aware `typescript/no-deprecated`).
- **The peer range starts at the oldest Effect 4 the library works with** (`^4.0.0` today), so that any
  application on Effect 4 can use it. An API that exists only in a newer Effect is not a reason for a
  workaround: ask whether to use it and raise the minimum (`upgrade-effect`).
- **A change a consumer can notice has a changelog entry** in the same commit, and raises the version when it
  needs more than the unreleased section says (`release`).

## Invariants the engine keeps

The README's "Guarantees" says what a user may rely on, and the library's tests check each one
(`src/interleaving.test.ts` under random orders of clicks, answers and subscription messages). This is how they
are kept, and what a change must not undo:

- **`update` is pure and called freely.** Tests call it more than once per message (`dispatchViolations` sends
  each one twice): never assume it runs once per message.
- **`reject` means one thing: the message does not apply in the state.** The run ignores every rejection, and
  whether the view sends only what applies is for the tests ("When `update` rejects" in the README). Never add
  a runtime check of the model against `update`, nor a way for a model to ask `update` what it accepts: the
  model, read from the state, and `update` are two derivations that tests check against each other, and a
  model that asked would make a wrong rejection a control that silently disappears.
- **A parent and its children talk only through external messages and events**, so that `reject` means the
  same everywhere: a handle's `update` returns a step, never a rejection, and a child rejecting an external
  message, or a parent giving one to a child that is not there, is a defect (`tell` in `compose.ts`). The types
  enforce what a parent declares: `runCommand` exactly when it has commands of its own, `onEvent` exactly when a
  child has events, a handle's `update` only with a child's `external` messages, no own message or command
  named like a child. A program written without `Program<…>` has `unknown` types, read as `never` (`Known` in
  `program.ts`), so that it does not open these checks.
- **A child's model is kept by its state object** (`modelsOf` in `compose.ts`) for as long as that object
  lives: it relies on `makeModel` being pure and on states being replaced, never mutated, and holds nothing of
  its run or its place, so children or runs that share a state share its model. That is why every program
  keeps its state in an object (`ObjectState` in `program.ts`, checked by `Program`, `parent`, `child`, `each`,
  `run` and the testing tools): never add a cache for primitive states, which nothing could let go of.
- **A child's dispatch is the same while anyone holds it** (`dispatchTo` in `dispatch.ts`): kept weakly by its
  parent's dispatch, its name and its id (compared with `Equal`, as subscription keys are), and removed by a
  `FinalizationRegistry` once collected. Never hold them strongly: ids that are never reused, as the README
  advises, would pile up for as long as the run lasts.
- **Running a dispatch needs no services and completes synchronously**: it only offers the message to the
  engine's unbounded queue, which wakes the engine on the scheduler of the run that made it, so that renderers
  send from plain callbacks with `Effect.runSync`. Keep the queue unbounded (one that waits when full would make
  every such call throw, one that drops would lose what the user did) and the dispatch free of services.
  Running a dispatch is the renderer's business: the library exports no helper for it.
- **Defects always die, and the run dies with them.** Nothing in the library may retry, swallow, log or turn
  them into messages: reporting is the job of whoever runs the program. Where the engine knows where a defect
  happened, it wraps each defect of the cause in a `ProgramDefect` (`diesIn` in `engine.ts`) that holds it as
  its `cause` and says where, and keeps the rest of the cause.
- **A subscription never ends in silence**: its end value is a message (or `never`), sent to `update`. An ended
  subscription keeps its key among the active ones until the key goes away and comes back: never restart it
  automatically, which would loop on one that ends at once. What the end of a library's stream means is the
  caller's decision: no helper takes it for them.
- **Subscriptions are reconciled by key**: a new key starts, a kept key leaves running, a gone key interrupts.
  Each start has a generation that its messages carry, and a message whose key is gone, or came back with a new
  start, is dropped before `update`, however the fibers were scheduled.
- **Commands are data; only `runCommand` runs them.** Never let a command carry its effect, or a description
  that must be kept in step with one: a test, `onApplied` and the logs read the command itself.
- **Commands cannot be cancelled**, a deliberate choice: do not add cancellation without asking.
- **Each command, each subscription and the renderer has a scope of its own** (`Effect.scoped` where the
  library starts them; a command's closes before its message is queued), and `simulate` scopes each command the
  same way. Never let them acquire into the run's scope: what they hold would outlive them, and be released
  before their fibers are interrupted.
- **No span lives as long as the run**: `run` and `Engine.make` are untraced, and the run's fibers see the span
  of whoever runs it as an external one (`withExternalSpan`), since Effect keeps every log as an event of the
  current span until it ends.
- **Frames cost only what is drawn**: a frame's model is made when first read, and a message that returns the
  very same state makes no new frame (a parent keeps its own state when a child's message leaves the child's as
  it is). Do not compute models eagerly in `run`.
- **`onApplied` watches, never steers**: it hears each accepted message in order, before its frame is
  published, with no way to send messages or change the state. A defect in it is a bug like any other.
- **The testing tools behave like the engine** where it is deterministic, with the test as the scheduler
  ("Testing" in the README says what each one runs, fails on and ignores); `rehearse` fails on a command left
  pending, since its answer would arrive, and `drive` acts only as a user can, through `run` and the run's
  dispatch. When the engine or one tool changes, keep the others in step.
- **Logs never carry message data by default** (`describeByTag` in `log.ts`): only tags, following a wrapped
  `message` or `command` only when it is itself tagged, since a program's own field of that name may hold data.
  Level: `debug` for the message loop and for subscriptions starting, stopping and ending, nothing else. What
  is computed only to be logged (`describeMessage`, `describeCommand`) is computed only while debug logs are
  enabled (`LogLevel.isEnabled`).

## Code

- One module per concept: `update.ts`, `command.ts`, `subscription.ts`, `dispatch.ts` (views and their
  dispatch), `program.ts` (the program and its types), `compose.ts` (`parent`), `log.ts`, `defect.ts`;
  `engine.ts` is the runtime only (with `RunOptions`), and `run.ts` connects it to a renderer. `testing/` holds
  one module per testing tool (and `unexpected.ts`, the failure they share).
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
- A test's name says what it checks. When a change touches a test, or what it tests, check that its name, its
  `describe` and its comments still say what the assertions check: a test adapted to a new design keeps an old
  name that promises what it no longer proves.
- Only `examples/snabbdom.test.ts` registers a DOM (happy-dom); every other test runs without one.

## Checks

Before finishing, from the repository root: `bun run typecheck` (`tsc` with the Effect language service, on the
library and on the examples), `bun run lint` (Biome and Oxlint) and `bun run test`. `bun run build` compiles
`src/` into `dist/` (ignored by git) and runs before `bun pm pack`. An API change is also checked as a consumer
would see it (`change-api`).
