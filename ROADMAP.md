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
  empty list, `rehearse`, `Field.typed`).
- **What the run calls the view** is a dispatch: the words, and `Origin`'s `'View'`, which `rehearse` and
  `simulate` already give to what a test sends. Breaking for the tag alone.
  [`docs/boundary.md`](docs/boundary.md), item 8.
- **`View` among the exports**, a type no module of `src/` uses. Breaking. `docs/boundary.md`, item 6.
- **A model made when its frame is pulled, not when it is read**, which would take from `drive` its recording of a
  defect of `makeModel`. Breaking, and untried against `drive`. `docs/boundary.md`, item 7.
- **The wrapping of a child's message as a pure function** before the model, for `dispatchTo` and a test's reader
  to share. A question, weighed by "A function earns its place". `docs/boundary.md`, "A question".
- **What a key sends is not data**: no tool judges a subscription's message. Whether a test lists it, a program
  exports it, or it is declared. [`docs/declared-inputs.md`](docs/declared-inputs.md), "What still makes sense";
  `Inert` for a key waits for the first item.
- **Who checks a test's reader**: one that forgets a field of its model is found only by `Missing`. Whether that is
  enough, or worth a mark on a model's messages. `docs/declared-inputs.md`, and `docs/boundary.md`, "Open
  questions".
- **What reaches `update`, declared as data** (offers with a schema, a `dispatch` that takes one). Suspended by the
  owner, with three spikes and his decisions, which stand only if it is taken up again.
  `docs/declared-inputs.md`.

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
- **Two ways for what arrives too late.** The run drops a message of a subscription whose key is gone; `update`
  rejects the answer of a command for what has since changed, with the care for ids that come back the README asks.
  It is what commands that cannot be cancelled cost, and is said in two places and not as one choice. Reported.
- **A parent's lifted subscriptions** are kept one for each state of a child, with the place checked, so children
  that share one state object would lift again on every change. Of speed, not of what is right. Reported, read in
  the code and not measured.

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
