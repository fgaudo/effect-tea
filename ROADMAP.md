# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done, with the reason in the commit. An item rejected is removed and added to
[`docs/rejected.md`](docs/rejected.md), with why and on what evidence, in the same commit: read it before adding one.

## Proposals recorded, to be decided

Each has a document that says what was weighed, what was run and what is open. None is decided. They are listed so
that each leans only on those above it.

- **`Inert`, a message a model holds that does nothing**: deferred by the owner on 15 November 2026, when the rest
  of [`docs/inert-steps.md`](docs/inert-steps.md) was done. It would flag the guard `{ state }` against a double tap
  and a parent's broadcast, and found one real case in the examples. Weighed again with what it finds in an
  application, and with a key whose message does nothing.
- **The wrapping of a child's message as a pure function** before the model, for `dispatchTo` and a test's reader
  to share. A question, weighed by "A function earns its place". [`docs/boundary.md`](docs/boundary.md), "A question".
- **What a key sends is not data**: no tool judges a subscription's message. Whether a test lists it, a program
  exports it, or it is declared. [`docs/declared-inputs.md`](docs/declared-inputs.md), "What still makes sense";
  `Inert` for a key waits for the first item.
- **Who checks a test's reader**: one that forgets a fixed message of its model is found only by `Missing`. Whether
  that is enough, or worth a mark on a model's messages. `docs/declared-inputs.md`, and `docs/boundary.md`, "Open
  questions".
- **What reaches `update`, declared as data** (offers with a schema, a `dispatch` that takes one). Suspended by the
  owner, with three spikes and his decisions, which stand only if it is taken up again. Its first aim, a model with
  no function for what the user types, was reached by the plain input; what is left of it is a key's messages and a
  command's answers. `docs/declared-inputs.md`.
- **What the plain input left**: a slider in React, a `File`, frames a bridge skips by the equality of models (the
  one idea of "To explore" the port did not overtake), and what was not run (a real browser, an IME composition, the
  caret under a value the program changes). [`docs/registers.md`](docs/registers.md), "The port of the ninth review"
  › "Left", and "Where it stands".

## Open problems

None open. A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a
deterministic test of it.

## Possible improvements

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`bench/subscriptions.ts`) measures a parent's subscriptions only, and
  `bench/writes.ts`, run by hand, what a write into an input and a bridge's frame cost; neither runs in the CI.

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
- **What 1.0 needs**: the API looks close to stable; the proposals above are the list to close before freezing it.
