# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done or rejected, with the reason in the commit.

## Open problems

### Found by the seventh review of the premises (November 2026)

The reports are the bodies of the commits of `claude/premise-review-7-engine-a13862` (`5e34644`, `531638b`) and of
`claude/premise-review-7-testing-3485ba` (`5b88849`, `3299b61`). Its findings are fixed. Places where the code or a
document says otherwise than the other, from the same reports, each to be settled:

- `core.ts` (the comment on a dropped message) and `engine.ts` (on `describeMessage`) promise that a run that died
  describes no dropped message; a death recorded after the check of `Core.arrive` still lets the step describe one.
- `docs/premises.md` names, for `Effect.raceFirst`'s wait for its loser, tests that pass without it since rehearse
  finishes the step of a scenario that returned.
- `docs/shared-core.md` cites a roadmap item that is gone; `loop.ts` stops the loop with `Fiber.interrupt`, unmarked.
- Comments and names of tests that say more than they check: `run.test.ts`, "a run that died takes no message from
  its queue while the renderer releases", and comments that still describe the run before its marks;
  `contract.test.ts`, the comment on "rehearse fails with the defect alone, as the run dies, though a hearNext
  waited"; `rehearse.test.ts`, "a command that answers while the end releases a subscription fails it, as one under
  way", "a message its subscription sends after its key went away does not reach update".

### Found by a review of the invariants (November 2026)

Three models read `docs/invariants.md`, `docs/premises.md` and the README's "Guarantees" against the code, each
attacking the others' claims. What it found of a step that does nothing, and of `reject` in `onEvent`, is in
[`docs/inert-steps.md`](docs/inert-steps.md), a decision proposed and not done, with open questions of its own. The
rest, each to be settled; "checked" is read again in the code by the session that wrote this, "reported" is a
reviewer's claim that was not:

- **A defect may carry data.** `describeByTag` gives a message that is a string whole, as its comment says, and it
  fills `ProgramDefect`'s `on`; a subscription's `ProgramDefect` carries its key as it is. "Logs never carry message
  data" is of the logs, and a crash report leaves the device more often than a debug log. An option `describeKey`,
  beside `describeMessage`, was proposed; a tag of the key's is not one, since a key is a string or a tuple.
  Checked.
- **"A subscription runs exactly while its key is in the state"** (README, "Guarantees") says more than the run
  does: the frame of a state without the key is published before the key's subscription is interrupted, and one
  that ended does not run while its key is listed. Nothing reaches `update` meanwhile. Checked for the order of the
  step; `docs/single-owner.md` says the first.
- **The peer range is wider than what is tested.** About seventeen entries of `docs/premises.md` rest, in some
  part, on what Effect does not document, and `^4.1.4` accepts minors no test has run on. The daily job tells of a
  break, and does not protect a consumer already there. A range that stops at the minors tested, widened on each
  green run, was proposed. Reported.
- **Telling a self-interruption from the run's own, while the run stops the fiber**, costs three premises read
  only in Effect's source (the handlers of an interrupted fiber, the reasons it received, the annotations of
  `interruptAs`). A flag for each fiber, set where the run stops it, would tell "interrupted without being asked"
  with none of them, and give up only the case of a fiber that interrupts itself as the run stops it. Both
  reviewers proposed it, and neither tried it, nor read it against the testing tools.
- **The order of the defects is described and not promised**, while the tests check it and a crash reporter reads
  the first. What keeps it serves other promises mostly (no defect lost, no message applied from the first one on),
  so dropping the order would save little. Whether to promise it, or that the first defect of the cause is the first
  that happened. Reported.
- **"Every program keeps its state in an object"** is under "What the engine keeps for itself" in
  `docs/invariants.md`, and binds whoever writes a program. A primitive state that gets past the types dies of the
  `WeakMap`'s own `TypeError`, not of a `CompositionDefect` (reported).
- **"`onApplied` and `onIgnored` watch, never steer"**: the run waits for them, before the frame, and one that never
  ends holds the program, as the README says. They cannot send a message nor change the state, which is what the
  rule means and could say. Checked.
- **Two ways for what arrives too late.** The run drops a message of a subscription whose key is gone; `update`
  rejects the answer of a command for what has since changed, with the care for ids that come back the README asks.
  It is what commands that cannot be cancelled cost, and is said in two places and not as one choice. Reported.
- **The comment on `Dead`, in `step` of `engine.ts`**, says the loop takes no other message; it takes each one, and
  applies none, until its end stops it. Checked.
- **A parent's lifted subscriptions** are kept one for each state of a child, with the place checked, so children
  that share one state object would lift again on every change. Of speed, not of what is right. Reported, read in
  the code and not measured.

## Possible improvements

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`bench/subscriptions.ts`) measures a parent's subscriptions only.
- **A report of the public API**, generated from the declarations of `dist/` and committed, so that a change of
  what `src/index.ts` and `src/testing/index.ts` export shows in the diff, and a breaking one is not made by
  accident (as api-extractor does), with a check that the package's types resolve for each kind of consumer.
  `change-api` asks for this by hand today.

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
