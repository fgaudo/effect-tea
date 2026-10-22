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
  (`bun examples/<name>/index.html`, after `bun run build`: Bun bundles the page with `dist/`), with a header
  that says what it shows and the shared `examples/style.css`, and a
  `*.test.ts` that shows the testing tools on it. They import the package by its name
  (`@fgaudo/effect-tea`), as a consumer would; `tsc -p examples` checks them with the `bun` condition and the
  `DOM` lib. They are not published (`files`), and snabbdom, `@effect/platform-browser` and
  `@happy-dom/global-registrator` are only dev dependencies. Their inputs follow the README's "Inputs the
  user types into": `update` accepts typing in every state, and the view writes a text only into a new input
  (`initialValue`, `Field`).
- **The bridge is tested in a DOM.** `examples/snabbdom.test.ts` runs examples in happy-dom, with screen
  refreshes that happen only when the test paints: how often `renderInto` draws, clicks on drawn buttons, and
  inputs typed into while frames are drawn. Only that file registers the DOM: every other test runs without
  one. snabbdom's props module never removes a prop, so a view sets a prop such as `disabled` in every case
  of an element.
- **The peer range starts at the oldest Effect 4 the library works with** (`^4.0.0` today), so that any
  application on Effect 4 can use it. Raise the minimum only when the code needs a newer API, after checking:
  copy `src/` into a scratch project with that exact Effect version, then run `tsc` and `bun test` there.

## Public API

- The API is exactly what `src/index.ts` and `src/testing/index.ts` export; every other module is internal.
  Export only what a consumer needs.
- A change to the API changes [`README.md`](README.md) in the same change: the concept that uses it,
  and the API reference table, and the examples that use it. Every example in the README must compile
  against the package.
- `exports` has three conditions: `bun` (the TypeScript sources, for consumers that run under Bun), `types`
  and `default` (`dist/`, for everyone else). A new entrypoint needs all three, and an entry in `files` if
  it is not under `src` or `dist`.

## Documentation site

- `site/` builds the site published on GitHub Pages (`https://fgaudo.github.io/effect-tea/`): the API generated
  by TypeDoc from the doc comments of `src/`, with the README as its home page, and each `examples/<name>`
  bundled to run under `examples/<name>/`. `.github/workflows/docs.yml` builds and deploys it on every
  `v*` tag, or when run by hand; nothing generated is committed.
- `site/` is a package of its own because TypeDoc does not support TypeScript 7 yet: it has its own
  `typescript` 6, used only to read the sources. Move TypeDoc to the root once it supports TypeScript 7.
- The doc comments (`/** */`) of what `src/index.ts` and `src/testing/index.ts` export are the API reference:
  `cd site && bun run build` must give no warnings. Types the API refers to without exporting them are
  shown by name only, on purpose.
- The README's relative links are rewritten to the repository at the built commit, since the site has no
  copy of the files.

## Versions

The version in `package.json` is the one the next release will have, decided by the changes that make it:

- A change a consumer can notice adds an entry to [`CHANGELOG.md`](CHANGELOG.md), in the same commit, under
  the `(unreleased)` version (`Added`, `Changed`, `Fixed`; a breaking change says how to upgrade). Changes
  only to tests, tooling or internals add none.
- The first such change after a release opens a new `## <version> (unreleased)` section, and each change
  raises the version if it needs more than the section says: a fix the patch version, a feature the minor
  version, a breaking change the major version. Before 1.0 a breaking change raises the minor version, and
  everything else, features included, the patch version. The version never goes down.
- A release only replaces `(unreleased)` with the date and tags the commit `v<version>`. The author
  publishes it: never run `npm publish` or `bun publish`.

## Invariants the engine keeps

- **`update` is pure and called freely.** The library calls it to decide offers
  as well as to apply messages. Never assume it runs once per message.
- **Only the library makes the `Offers` a model receives**, from the program's own `update` and the state
  it passes to `makeModel` (`run`, `modelOf`, and a parent's `children` for a child). They stay internal: a
  model that could build its own could ask the wrong `update`, or about another state.
- **Only `offer.ts` makes an `Offered`**, by asking the `update` of the offer's level, and wrapping its message
  as every parent does up to the root. Asking that level is enough because a parent decides whether a child
  is there only with `get`, never by rejecting its messages: keep it so, and keep every cast to `Offered` in
  that module, with no other way to forge one.
- **An offer is read only by its fields** (`tokenOf`), never by its class or a symbol: in development a view
  may be bundled with a copy of the library of its own. One `dispatch` serves a run; an offer carries the run
  that made it, and one of another run is a defect.
- **An offer `update` rejects is a defect of `makeModel`**: `offer` throws `RejectedOffer`, never returns an
  `Option`. A model says which actions exist by its shape; an optional offer would turn a wrong rejection
  into a control that silently does nothing. Do not add a way to ask whether an offer would succeed: a model
  that picked its case by asking would hide the same bug.
- **Rejections are judged by the offer.** Every offer was checked against `update` when its model was made,
  so its rejection is stale and ignored, however many messages arrived in between, except a value typed into
  an `offerInput` that `update` rejected in the offer's own state: the offer marks it as a `violation`, a bug.
  Messages from commands and subscriptions are stale when rejected. Never judge by revision alone: a frequent
  subscription would hide bugs.
- **No default for rejections.** `onRejectedInput` is required: `'die'`, or the function that reports a rejection
  the program goes on after. A bug that is neither fatal nor reported must not be expressible.
- **Defects always die, and the run fails with them.** Nothing in the library may catch, retry, swallow or
  turn them into messages, so that every defect, wherever it happens (the view and the renderer included),
  reaches the cause the run fails with: reporting it is the job of whoever runs the program. The engine only
  logs where a defect happened when it knows. `onRejectedInput` is the only opt-in, and it only covers rejections,
  since a rejection leaves the state unchanged.
- **A subscription never ends in silence**: it is a `Channel` whose end value is a message (or `never`), and
  the engine sends that last message to `update`. An ended subscription keeps its key among the active ones,
  so it is not started again until its key goes away and comes back: never restart it automatically, which
  would loop on a subscription that ends at once. What the end of a library's stream means is the caller's
  decision: the library offers no helper that takes it for them.
- **Subscriptions are reconciled by key**: a new key starts its subscription, a kept key leaves it running, a
  gone key interrupts it. Each start has its own generation, which its messages carry: a message whose key is
  gone, or came back with a new start, is dropped before `update`, so nothing arrives from a subscription
  after the message that stopped it, however the fibers were scheduled.
- **Commands are data; only `runCommand` runs them.** `update` returns what it decided, and the program's
  interpreter is the one place that turns it into an effect. Never let a command carry its effect, or a
  description that must be kept in step with one: a test, `onApplied` and the logs read the command itself.
- **Commands cannot be cancelled.** This is a deliberate choice for now: do not add cancellation without
  asking.
- **Frames cost only what is drawn**: a frame's model is made when first read, and a message that returns the
  very same state makes no new frame. Keep it so: do not compute models eagerly in `run`. A renderer slower
  than the program gets only the latest frame.
- **`onApplied` watches, never steers**: it hears each accepted message in order, before its frame is
  published, and gets no way to send messages or change the state. A defect in it is a bug like any other.
- **`simulate` behaves like the engine** where the engine is deterministic: a rejected message from a
  command is stale and ignored, and only a rejection of the test's own messages fails. Keep the two in step
  when either changes.
- **`drive` acts only as a user can**: through `run` and the run's `dispatch`, so a scenario sends only
  offers. It always runs with `onRejectedInput: 'die'`, since a test must not go on past a bug, and
  its waits use the real clock, whatever `Clock` the program runs with.
- **A child's model is kept by its run, its state object and its id** (`modelAt` in `compose.ts`): it relies on
  `update` and `makeModel` being pure, and on states being replaced, never mutated. Keep all three in the key:
  new children often share one initial state object, and a model's offers carry their run and id.
- **What a parent declares, the types enforce**: `runCommand` exactly when it has commands of its own,
  `onEvent` exactly when a child has events, a handle's `update` only with a child's `external` messages, and no own
  message named like a child. A program written without `Program<…>` has `unknown` types, read as `never`
  (`Known` in `program.ts`), so that it does not open these checks.
- **Logs never carry message data by default** (`describeByTag` in `log.ts`): only tags, following a
  wrapped `message` or `command` only when it is itself tagged, since a program's own field of that name may
  hold data. Levels: `error` for bugs, `debug` for the
  message loop and for subscriptions starting, stopping and ending.

## Code

- One module per concept: `update.ts`, `command.ts`, `subscription.ts`, `offer.ts` (offers and dispatch),
  `program.ts` (the program and its types), `compose.ts` (`parent`), `rejection.ts`, `log.ts`; `engine.ts` is
  the runtime only (with `RunOptions`), and `run.ts` connects it to a renderer. `testing/` holds one module per testing tool, and
  `testing/index.ts` exports them.
- A piece of a program that may be missing (`runCommand` without commands, `subscriptions`) is read through
  `runCommandOf` and `subscriptionsOf`, never directly: the engine always gets the complete set.
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
