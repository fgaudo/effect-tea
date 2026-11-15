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

The rest of this section, and the items marked "(review)" below, come from a review of the whole repository
(November 2026); each was reproduced where it says "confirmed", and only reasoned elsewhere.

- **The timer's buttons stay disabled** (confirmed, happy-dom): snabbdom reuses the buttons of
  `examples/timer/view.ts` by position, and its `props` module never removes a prop. At one minute the "−" is
  `disabled`; after Start the same element is "Pause", still disabled, and after Reset it is "+", still disabled.
  `add-example` asks for `disabled` in every case of the element, and the tutorial shows this view to copy.
- **The snabbdom bridge loses an input it reuses** (confirmed, happy-dom): `examples/snabbdom.ts` registers an
  element only when snabbdom creates it, so a plain `<input>` reused for a vnode with `shows` never shows the
  program's value and sends no write; reused the other way, it stays registered and is given a stale value. No
  example reaches it, and the React bridge does not have it: a case for `examples/bridge.test_suite.ts`.
- **`Engine.await` hangs after `report`** (confirmed): once `report` has reported the defects, `await` waits on
  `died`, then calls a `report` with nothing left to report, and never ends. Its documentation says it "dies as
  `report` does", and does not say that only `engine.test.ts` uses it.
- **Two checks of `rehearse` that no test kills** (confirmed: each taken out in a copy, and the suite stays green):
  `diesIn('render')` around `makeModel` in `draw`, for a `makeModel` that throws on a later state (the contract's
  cases all throw at the start), and `calling` around `runCommand`, for a `runCommand` that throws before it returns
  its effect (`contract.test.ts` has the run's and `simulate`'s case, not `rehearse`'s). The README promises both.

## Possible improvements

- **Checks with no mutation** (review; each confirmed killed by existing tests, so only the entries of
  `mutations/mutations.ts` are missing):
  - `compose.ts`, the parent keeping its state when a child's message keeps the child's (`result.state ===
    childState`), which `docs/invariants.md` names under "Frames cost only what is drawn": only the half in `core.ts`
    has a mutation. The search's property counts states by identity and misses it; only the coverage test kills it.
  - `rehearse.ts`, the three checks at the end (`cancelled.length`, `underWay.size`, `pending.length`).
  - `core.ts`, `report` updating `reported`; `shell.ts`, `Deferred.succeed(died)`; `simulate.ts`, `stopping(fiber)`
    for a command interrupted; `log.ts`, only a tagged value is followed.
  - the `diesIn` sites of `rehearse.ts` (`listen`, `makeModel` at the start, `startUnder`) and of `simulate.ts`
    (`listen`, `runCommand`). The engine mutates only those of `update` and `init`: decide whether that is the rule.
- **Eight exports with no doc comment** (review; API Extractor marks them): `Update`, `Transition`, `Rejected` in
  `update.ts`, and `ModelOf`, `MessageOf`, `CommandOf`, `EventOf`, `ServicesOf` in `program.ts`, where the comment of
  `StateOf` is read by TypeDoc for `StateOf` alone.
- **Documents behind the code** (review):
  - `docs/shared-core.md`, "Decision": `reconcile` "calls `subscriptions`", `Ignored` carries the origin and the
    state, `Applied` the state before and after; a subscription whose key goes is "kept while calls wait on it"; a
    state `gone`. The code (`Core.reconcile`, `Ledger.listened`) and the "Plan" say otherwise.
  - `docs/boundary.md`, "What it is today": `Origin`'s case is still `'View'`, with stale line numbers.
  - the JSDoc of `CompositionDefect` misses the case added in 0.8.0, a child whose state is not an object
    (`objectAt`).
  - the README, "Defects": `defect` is for `update`, `onEvent`, `makeModel` and `subscriptions`, where its JSDoc and
    `DefectSite` have `init` too; the API table says `ProgramDefect` carries "`update`'s message", where `on` holds
    its tags only.
  - `run.ts` says the renderer is "Called once": it is at most once, as `docs/invariants.md` says.
  - "a scope of its own" of a channel means the scope given to it in `shell.ts`, the README and
    `docs/invariants.md`, and one an operator makes, released before the defect leaves the pull, in
    `docs/premises.md`.
  - the documentation of `died` in `engine.ts` lists fewer sites than make it fire (`subscriptions`, the
    `describe*`, the renderer, `init`).
  - the comment of `mutations/mutate.ts` says no test takes more than half a minute; `patience` is a minute.
  - the JSDoc of `Rehearsal.ignored` says "an event" of what holds messages.
  - `docs/rejected.md`, "`subscriptionsOf` made internal" reads as done, where the item says it stays.
  - the tutorial: `4-testing.md` names only a command "still pending" among what fails `rehearse`, and
    `1-first-program.md` calls `init` "the state it starts from".
  - `bench/writes.ts` says it copies the snabbdom bridge's `settle`, where it follows the React one.
- **Code against the rules of `AGENTS.md`** (review):
  - `compose.ts` reads a child's `runCommand` directly, for a `CompositionDefect` that names the child, without
    saying why it is not `runCommandOf`.
  - `rehearse` builds its start by hand (`{ state, revision: 0 }`, `from.commands ?? []`) where `simulate` calls
    `Core.init`, against "The start of a program is a transition too" (`docs/shared-core.md`).
  - the snabbdom bridge's `onInput` has no React counterpart, and turns a text into a program's message in the view;
    only `snabbdom-testing.test.ts` and `add-example` use it.
  - the examples export the constructors of `Message` as values (`pages/clock.ts`, `pages/about.ts`,
    `list/stopwatch.ts`, `timer/timer.ts`, `form/form.ts`, `volume/volume.ts`), where the README, "Model", says to
    export the type only.
  - `examples/form/late-key.test.ts` writes a bridge of its own and copies the scheduler of
    `bridge.test_suite.ts`, for a check `add-example` gives to the bridges' tests.
  - lines over 120 columns: `site/tutorial/4-testing.md`, `examples/form/form.ts`, `examples/volume/volume.test.ts`.
- **Contracts missing where the tools agree** (review): `simulate`, a command that interrupts itself; `rehearse`, a
  command that joins, as it is stopped, a fiber its interrupter interrupted; `rehearse`, a `runCommand` that throws
  before its effect (above).
- **Smaller points of the tests and the CI** (review):
  - `run.test.ts`, "a run that died applies no message of its queue while the renderer releases", races a 10 ms
    `Boom` against 5 ms ticks without `TestClock`, is vacuous if no tick comes, and asserts on the commands started
    only.
  - the polling loops of `engine.test.ts` bounded at a second go on silently when the bound fires.
  - `bun run mutations` has no handler for an interruption, so `.mutants/` keeps the copies of a run stopped
    (three of an older runner are there now).
  - `interleavings.yml` has no `timeout-minutes`, and no workflow pins Bun's version.
  - the Node shim lacks `expectTypeOf`, which "the types" tests name, and `describe.each`; `test.each` formats
    names with `util.format`, which has no `%p` or `%#`.
  - `rehearse` leaves its `forks` scope open when `listen` or `makeModel` fail at the start (it holds no fiber then).
  - `Rehearsal.hear` accepts a write into an input, which the types forbid a subscription to send.
  - `CHANGELOG.md`: a blank line splits the list of "Fixed" of 0.8.0.

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`bench/subscriptions.ts`) measures a parent's subscriptions only, and
  `bench/writes.ts`, run by hand, what a write into an input and a bridge's frame cost; neither runs in the CI.
- **A slider in React**: the React bridge has no counterpart of snabbdom's `slides`, and its tests no native slider;
  `volume` has no React view. [`docs/registers.md`](docs/registers.md), "The port of the ninth review" › "Left".
- **An input in a real browser**: the bridges are tested in happy-dom only, so an IME composition, and the caret
  when the program changes a value under the user, were never run. `docs/registers.md`, the same place.
- **An input that holds a `File`**: a `File` compares by reference, against "a model is data". The way seen, a
  register holding an id with the `File` in a service the upload's command reads, was reasoned only.
  `docs/registers.md`, "6. A slider, and the field generic over its value".

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
- **`rehearse` without the options of `drive`** (review): `drive` takes every `RunOptions`, `rehearse` only `flags`,
  so a rehearsal cannot check an observer, nor its defect; "symmetric where its tools are" asks either for them or
  for a reason in `docs/rejected.md`.
- **Windows of absence on the real clock** (review): some tests sleep 20–60 ms and then check that nothing happened,
  and several are killers of mutations (`engine.test.ts`, the end of the engine lets its loop end first;
  `rehearse.test.ts`, the subscription waits between two messages; `run.test.ts`, a message sent as the renderer is
  released, and the wait on `onApplied`). A correct engine never turns them red, but a mutant may survive on a loaded
  machine, and `bun run mutations` runs copies at once. "A test never rests on the clock" names no such exception:
  either await what they check, or write the exception down.
- **What 1.0 needs**: the API looks close to stable; what `docs/rejected.md` parks would change it, and is weighed
  before freezing it.
