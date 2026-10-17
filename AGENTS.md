# @fgaudo/effect-tea — guide for coding agents

How the library is used is in [`README.md`](README.md). This file holds the rules for changing it.

## Language

All code, comments, identifiers, commit messages and `.md` files are in **English**.

## Commits

A commit made with an AI agent ends with an `Assisted-by: <model>` trailer (e.g. `Assisted-by: Claude Opus 5.5`),
never `Co-Authored-By`: the author is the person who commits. A clear subject is usually enough: a body only says
why, or what the diff, the docs and the changelog do not, never what they already describe.

## What belongs here

- **Generic, and only Effect.** The library knows nothing of the applications that use it, nor of any
  renderer. Views are generic over their node type, and the renderer is a function given to `run`. `effect`
  (v4) is its only dependency, as a peer. Biome forbids renderer imports, and `lib` (`ES2022`, no `DOM`)
  rejects browser APIs, everywhere but in `examples/`.
- **`examples/` are complete programs, checked like the library.** Each one has its program, a view
  (snabbdom, through `examples/snabbdom.ts`), a `main.ts` that starts it with `BrowserRuntime.runMain` (so
  that the failure of a dying program is reported), an `index.html` to run it
  (`bun examples/<name>/index.html`), and a `*.test.ts` that shows the testing tools on it. They import the
  package by its name (`@fgaudo/effect-tea`), as a consumer would; `tsc -p examples` checks them with the
  `bun` condition and the `DOM` lib. They are not published (`files`), and snabbdom and
  `@effect/platform-browser` are only dev dependencies.
- **The peer range starts at the oldest Effect 4 the library works with** (`^4.0.0` today), so that any
  application on Effect 4 can use it. Raise the minimum only when the code needs a newer API, after checking:
  copy `src/` into a scratch project with that exact Effect version, then run `tsc` and `bun test` there.

## Public API

- The API is exactly what `src/index.ts` and `src/testing.ts` export; every other module is internal.
  Export only what a consumer needs.
- A change to the API changes [`README.md`](README.md) in the same change: the concept that uses it,
  and the API reference table, and the examples that use it. Every example in the README must compile
  against the package.
- `exports` has three conditions: `bun` (the TypeScript sources, for consumers that run under Bun), `types`
  and `default` (`dist/`, for everyone else). A new entrypoint needs all three, and an entry in `files` if
  it is not under `src` or `dist`.

## Versions

The version in `package.json` is the one the next release will have, decided by the changes that make it:

- A change a consumer can notice adds an entry to [`CHANGELOG.md`](CHANGELOG.md), in the same commit, under
  the `(unreleased)` version (`Added`, `Changed`, `Fixed`; a breaking change says how to upgrade). Changes
  only to tests, tooling or internals add none.
- The first such change after a release opens a new `## <version> (unreleased)` section, and each change
  raises the version if it needs more than the section says: a fix the patch version, a feature the minor
  version, a breaking change the major version (the minor version before 1.0). The version never goes down.
- A release only replaces `(unreleased)` with the date and tags the commit `v<version>`. The author
  publishes it: never run `npm publish` or `bun publish`.

## Invariants the engine keeps

- **`update` is pure and called freely.** The library calls it to decide offers (`offers`)
  as well as to apply messages. Never assume it runs once per message.
- **Only `offers` makes an `Offered`** (through the internal `offered` and `offeredInput`). `mapDispatch` is the only other cast, valid
  because the parent accepts `wrap(message)` exactly when the child accepts `message`. Add no other way to
  forge one.
- **Rejections are judged by the frame's own state.** A view message carries the state its frame was drawn
  from. If `update` rejects it, and rejects it in that state too, it is a `Rejected` bug, however many
  messages arrived in between; if that state accepted it, it is stale and ignored. Messages from commands
  and subscriptions are stale when rejected. Never judge by revision alone: a frequent subscription would
  hide bugs.
- **No default for rejections.** `onRejected` is required, and `'ignore'` requires `onBug`
  (`RejectionOptions`): a bug that is neither fatal nor reported must not be expressible.
- **Defects always die.** `onBug` reports them, and nothing in the library may retry them, swallow them or
  turn them into messages. `onRejected` is the only opt-in, and it only covers rejections, since a
  rejection leaves the state unchanged.
- **A subscription never ends in silence**: it is a `Channel` whose end value is a message (or `never`), and
  the engine sends that last message to `update`. An ended subscription keeps its key among the active ones,
  so it is not started again until its key goes away and comes back: never restart it automatically, which
  would loop on a subscription that ends at once. What the end of a library's stream means is the caller's
  decision: the library offers no helper that takes it for them.
- **Subscriptions are reconciled by key**: a new key starts its subscription, a kept key leaves it running, a
  gone key interrupts it.
- **Commands cannot be cancelled.** This is a deliberate choice for now: do not add cancellation without
  asking.
- **Frames cost only what is drawn**: a frame's model is made when first read, and a message that returns the
  very same state makes no new frame. Keep it so: do not compute models eagerly in `run`.
- **`onApplied` watches, never steers**: it hears each accepted message in order, before its frame is
  published, and gets no way to send messages or change the state. A defect in it is a bug like any other.
- **`simulate` behaves like the engine** where the engine is deterministic: a rejected message from a
  command is stale and ignored, and only a rejection of the test's own messages fails. Keep the two in step
  when either changes.
- **`drive` acts only as a user can**: through `run` and the frames' own `dispatch`, so a scenario sends only
  offered messages. It always runs with `onRejected: 'die'`, since a test must not go on past a bug, and
  its waits use the real clock, whatever `Clock` the program runs with.
- **Logs never carry message data by default** (`describeByTag`). Levels: `error` for bugs, `debug` for the
  message loop and for subscriptions starting, stopping and ending.

## Code

- One module per concept: `update.ts`, `command.ts`, `subscription.ts`, `offer.ts`, `view.ts`, `program.ts` (`embed`),
  `bug.ts`; `engine.ts` is the runtime only, and `run.ts` connects it to a renderer.
- Effect modules are imported as namespaces (`import * as Effect from 'effect/Effect'`), with `Arr`, `Opt`
  for `Array`, `Option`.
- Relative imports carry the `.ts` extension; `tsc` rewrites them to `.js` in the build, and `build.ts` does
  the same in the declarations.
- Comments only for what the code cannot say: a reason, an invariant the types do not show, a choice that
  would look like a mistake. Never a repetition of names or of the next line.
- No blank lines between the statements of a block; blank lines separate declarations and `describe`/`test`
  calls.
- Formatting: dprint, 120 columns, single quotes, no semicolons. Format only the files you changed.

## Tests

- `bun:test`, in a `*.test.ts` next to the module. Tests are excluded from `dist/` and from the packed
  `src/`.
- Test through behaviour (`run`, `Engine.make`, the public functions), not through internals.
- Run tests that make the engine die on purpose with a minimum log level of `None`, so that the errors they
  expect are not printed.

## Checks

From the repository root:

- `bun run typecheck`, `bun run lint`, `bun run test`;
- `bun run build` compiles `src/` into `dist/` (ignored by git); it also runs before `bun pm pack`.

After an API change, check it as an external consumer would: `bun pm pack`, then extract the tarball into a
scratch project (`moduleResolution: nodenext`, `skipLibCheck: false`, the `ESNext` and `DOM` libs, `effect`
installed) and typecheck and run, with Node, code that uses the changed API.
