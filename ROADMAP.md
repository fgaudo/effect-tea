# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done, with the reason in the commit. An item rejected is removed and added to
[`docs/rejected.md`](docs/rejected.md), with why and on what evidence, in the same commit: read it before adding one.

## Proposals recorded, to be decided

Each has a document that says what was weighed, what was run and what is open. None is decided. They are listed so
that each leans only on those above it.

- **A step that does nothing**: `Missing` leaves out a candidate whose step does nothing, and `Inert`, a new
  violation, finds a message a model holds that does nothing; `onEvent` still does not reject. Proposed, spiked
  twice, breaking. [`docs/inert-steps.md`](docs/inert-steps.md), with open questions of its own (`list` over an
  empty list, `rehearse`, a key). Since the plain input, no input asks for an exemption: a write is no message of a
  model's.
- **What the run calls the view** is a dispatch: the words, and `Origin`'s `'View'`, which `rehearse` and
  `simulate` already give to what a test sends, and which numbers the messages a frame's `seen` counts. Breaking for
  the tag alone. [`docs/boundary.md`](docs/boundary.md), item 8.
- **`View` among the exports**, a type no module of `src/` uses. Breaking. `docs/boundary.md`, item 6.
- **A model made when its frame is pulled, not when it is read**, which would take from `drive` its recording of a
  defect of `makeModel`. Breaking, and untried against `drive`. `docs/boundary.md`, item 7.
- **The wrapping of a child's message as a pure function** before the model, for `dispatchTo` and a test's reader
  to share. A question, weighed by "A function earns its place". `docs/boundary.md`, "A question".
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
- **What the plain input left**: a slider in React, a `File`, the ideas of "To explore" not yet overtaken, and what
  was not run (a real browser, an IME composition, the caret under a value the program changes).
  [`docs/registers.md`](docs/registers.md), "The port of the ninth review" › "Left", and "Where it stands".

## Open problems

### Found by a review of the invariants (November 2026)

Three models read `docs/invariants.md`, `docs/premises.md` and the README's "Guarantees" against the code, each
attacking the others' claims. What it found of a step that does nothing, and of `reject` in `onEvent`, is in
[`docs/inert-steps.md`](docs/inert-steps.md), a decision proposed and not done, with open questions of its own. What
it proposed that was already decided (the flag for each fiber, the order of the defects) is in
[`docs/rejected.md`](docs/rejected.md). The rest, each to be settled; "checked" is read again in the code by the
session that wrote this, "reported" is a reviewer's claim that was not:

- **The peer range is wider than what is tested.** About seventeen entries of `docs/premises.md` rest, in some
  part, on what Effect does not document, and `^4.1.4` accepts minors no test has run on. The daily job tells of a
  break, and does not protect a consumer already there. A range that stops at the minors tested, widened on each
  green run, was proposed. Reported.
- **Three ways for what arrives too late.** The run drops a message of a subscription whose key is gone; `update`
  rejects the answer of a command for what has since changed, with the care for ids that come back the README asks;
  and, since the plain input, the library rejects a write over a value the program has since replaced, from the
  state and the message alone. The first two are what commands that cannot be cancelled cost; none of the three is
  said with the others, as one choice. Reported for the first two, the third read in the code.
- **A parent's lifted subscriptions** are kept one for each state of a child, with the place checked, so children
  that share one state object would lift again on every change. Of speed, not of what is right. Read in the code and
  measured (`bun run bench`, November 2026): children that share one object cost about six times those in objects of
  their own on each change of state (1.3 ms against 0.2 ms for a thousand, 13 ms against 2 ms for ten thousand), both
  linear in the children. It is the common case: a child that `each` starts from an `init` that is a step gets that
  very object, and keeps it until its first change. A fix keeps more than one place for each state, without letting
  ids pile up under an object that lives as long as the program (`docs/invariants.md`, "What the engine keeps for
  itself"), nor holding a state beyond its run.

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
- **What 1.0 needs**: the API looks close to stable; the problems above are the list to close before freezing it.
