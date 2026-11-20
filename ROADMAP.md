# Roadmap

What is to be done or decided now, and nothing else. Nothing here is a promise: each item is decided before it is
done, against the rules of [`AGENTS.md`](AGENTS.md). An item done is removed, with the reason in the commit. An item
rejected is removed and added to [`docs/rejected.md`](docs/rejected.md), with why and on what evidence, in the same
commit: read it before adding one. An item deferred or suspended leaves too, for "Parked, not rejected" there, with
what would reopen it. How an item came to be, and what was weighed for it, goes in a record of
[`docs/records/`](docs/records), not here: the order below comes from
[`adoption.md`](docs/records/adoption.md), the owner's decision that the library is meant to be adopted by others, but
for item 1, which the owner put before the release on the same day
([`synchronous-dispatch.md`](docs/records/synchronous-dispatch.md), R2).

## Open problems

A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a deterministic
test of it. None is open.

## Next, in order

### 1. A dispatch that applies its message at once

**Why.** A dispatch only queues its message, and `update` hears it later. An element with a value of its own needs the
state to change during its event. What the library has for the element of an input follows from that one premise:
`seen`, the number a dispatch returns, `Shown`, `edited`, `drawn`, and bridges that settle a native text field alone.
Spiked on 20 November 2026, and decided by the owner the same day, with every answer of its plan.

**How.** As the plan of [`docs/records/synchronous-dispatch.md`](docs/records/synchronous-dispatch.md) says, in stages,
on `main`. The new engine, the new testing tools and the new bridges are written beside the old ones, in `src/next/`
and `bridges/next/`, and swapped in one commit. Stages 0 to 3 are done: the decisions, the engine with its run, the
testing tools and the bridges, in `src/next/` and `bridges/next/`. **The next step is the spike of an input as a value
of the library's in the model** (R4 of the record), which the owner decides on before the swap. Then the swap (4), and
a reader's check of the documentation (5).

**Where it stands**, 20 November 2026, for a session that takes this up with none of the conversation:

- Each stage is a session of Opus 5.5 in this checkout, which commits nothing. It writes its report to
  `scratch/reports/sync-dispatch-stage-<n>.md`, which git ignores. The session that briefs it reads the report, reviews
  the diff, runs every check again, writes the stage's outcome in the record and commits.
- Nothing of the stages is uncommitted, and no session is at work on them.
- **The spike of R4** is a session of its own, on a branch, never to be merged: the form and the stocktake, over
  `src/next/` and `bridges/next/`, with an input as a value of the library's in the model. Its record goes in the
  record's file, and the owner decides whether stage 4 takes it. Until then the views of stage 4 are not written.
- Decided by the owner, 20 November 2026, on what stage 3 found: React reads the model in the store's notice itself,
  so `makeModel` runs on the stack of whoever sent the message, under React too, and for every new state. No page of
  react.dev says it, and nothing of the bridge rests on it. It is no premise and no promise: the guide's "What is left
  to you" says that, with the bridge to React, `makeModel` may run for each new state, in the call that sends its
  message. The test of stage 3 stays, as the alarm of that description.
- Left open by the stages, for stage 4 or before, each in the record under its stage: a job queued for each message;
  the loop of the thunk with no `finally`; what `docs/premises.md` still says of `FiberSet.run` and of
  `startImmediately`; `Driver.waitFor` after a defect of a later model; a snabbdom renderer interrupted while its run
  goes on.

**Done when** the swap is committed, every check of its stage passed, and the reader's check is done.

### 2. Release 0.8.0

**Why.** The unreleased section of `CHANGELOG.md` is long, and users get none of it until a release: the bridges as
entries of the package, the inputs, the fixed declarations. It comes after item 1, which removes exports that no
release has had yet.

**How.** As [`release`](.agents/skills/release/SKILL.md) says. First a review of the premises
([`premise-review`](.agents/skills/premise-review/SKILL.md)), in a session that wrote none of the changes of the engine
and of the testing tools since the last review. Then `bun run mutations` and `bun run interleavings`, and the site
built without warnings. Then the release commit and its tag. The owner publishes to npm.

**Done when** the tag `v0.8.0` is pushed.

### 3. The bridges in a real browser

**Why.** The bridges' tests run on happy-dom, which no browser is. The caret, and an IME composition while the program
changes a value under the user, were never run. It comes after item 1, which replaces both bridges, and whose plan
leaves it one more case: what is typed with snabbdom between a notice and its draw.

**How.** The tests of `bridges/bridge.test_suite.ts` run in a real browser too, with those two cases; the tool is to be
chosen. With React, also not run: `startTransition` or `useDeferredValue` in the application, Fast Refresh (likely to
restart the run, as `<Activity>` does), server rendering and hydration. Under `renderToString`, `Frames` throws, since
its `useSyncExternalStore` has no `getServerSnapshot`: found by the smoke test on 20 November 2026. Whether the bridge
supports server rendering is to be decided.

**Done when** the suite passes in a real browser, in the CI or by a command written down in the repository.

### 4. The changes that break the API

**Why.** A user who adopts the library asks that its API stays, and a change that breaks it costs less the fewer users
it has. The API looks close to stable, but what `docs/rejected.md` parks would change it.

**How.** Each entry of "Parked, not rejected" in `docs/rejected.md` that touches the API is weighed again with the
owner: taken now, in a 0.x release, or kept parked.

**Done when** each such entry is taken or kept parked by the owner's decision.

### 5. A view of the library's own

**Why.** A view as data over snabbdom: a node holds its message, a child's view is lifted by a node that wraps its
messages, an input's node names its input. A test then finds every message a view can send without a DOM, and no user
writes the part of a bridge that settles an input. It is the largest item. It is weighed again after item 1, whose
bridges settle no input, so that reason goes (R3 of its record).

**How.** Not decided. [`adoption.md`](docs/records/adoption.md), "A wider form", says what it would be, what it costs,
and what was weighed beside it. The owner decides whether to make it, under which name, and whether
`@fgaudo/effect-tea/snabbdom` stays beside it.

**Done when** the owner has decided, and the view is made, or the entry of `docs/rejected.md` says why not.

## Waiting for the owner

- **Whether the search reaches what only the deterministic tests kill.** Left by the session that put the element of
  an input under the search, 20 November 2026 (run). Item 1 removes `seen` and what an element holds of an input: both
  points go with its swap, unless they are decided before.
  - The property "once everything has happened, the element shows what the last state holds for the input drawn in
    it" is the killer of no mutation of the acknowledgement or of `seen`: under them it fails on 15 to 60 of a hundred
    runs of 60 scenarios, not on each. About 1,500 scenarios would make it one, by the rate measured, for a few seconds
    more of `bun run interleavings`. To decide: whether that is worth it, the deterministic tests being their killers.
  - "A frame that has seen the last write leaves the element as if it had not" is killed by none of the three
    properties of the search: it needs a frame whose `seen` is the number of the last write after a rejection, and
    nothing after. The deterministic tests are its killers. To decide: whether the scenario is made to reach it.
- **Seven points of a review of the design.** By the session of Fable 5.2 that briefed and verified stages 1 to 3 of
  item 1, asked by the owner on 20 November 2026 what does not fit. Reasoned from the code read for those reviews: none
  was run. Each is to be weighed, and none holds stage 4 up but where it says so.
  1. **The end of the run may begin inside a step.** A defect recorded in the thunk completes `died` there
     (`Deaths.record`), and Effect resumes the run's waiter on that stack: the end sets `stopped` and stops fibers
     while the step still tells its listeners. It is correct, by the checks, and the hardest part of the engine to
     reason about. To weigh: the register written at once, and `died` completed once the outermost `apply` returns.
  2. **The loop of the thunk has no `finally`** (`apply` in `src/next/engine.ts`). What threw there outside `attempt`
     would leave `applying` set, and the engine applying nothing, in silence, against "Nothing ends in silence". To
     weigh: a `finally`, and a defect of the library's own for what it catches.
  3. **A fiber resumed on the stack of whoever completes its `Deferred` is no premise, and shapes more code at each
     stage.** "Writes first, offers last" in every thunk, the counter of notices in `drive`, and two killers that work
     only through it (stages 1 and 2) exist for a behaviour the library refuses to rest on. They have no mutation,
     which `docs/premises.md` warns of ("never made unneeded by code of the library's written for it alone"). With a
     dispatch that applies at once it is no edge any more. To weigh: adopt it as a premise, with its test, so that
     those guards get killers. It reverses E3 of the record, which the same session proposed.
  4. **The pure half of a step is written twice**, in `applyOne` (`src/next/engine.ts`) and in `apply`
     (`src/next/testing/rehearse.ts`): `arrive`, the state, `reconcile` and the stop at a defect, in the same order.
     To weigh: one transition of `core.ts` for both, as `shared-core.md` did for `arrive` and `reconcile`.
  5. **The state is ahead of its effects, and a test may assume it is not.** A step's commands start in a later job,
     and the end drops the jobs not taken. So a test that ends once the state shows something may end before the
     commands of that step start: a test of `drive` changed meaning for it in stage 2. To do in stage 4: read every
     test, and every sentence of the guide, that takes "the state shows it" for "its commands have started".
  6. **The whole pure step now runs in the event that sends the message**: `update`, `onApplied`, `subscriptions` with
     the lookup of every key, the listeners and, with React, `makeModel`. It was measured for a counter with no key
     alone. And "Frames cost only what is drawn" is withdrawn with React, which makes a model for every state. To do
     before the release: measure a step with many keys and a model that costs (the benchmark of "Any time").
  7. **The premise the design rests on was never run in a real browser, nor with an IME** (P3 of the record), and
     "The bridges in a real browser" comes after the release. To weigh: the caret, a selection and an IME composition
     on `bridges/next/`, in Chromium, Firefox and WebKit, before stage 4.

  And for the reader who has an application in React: `Host` draws `fallback` until its run has started, and runs the
  commands of `init` twice under StrictMode. The split of `run` (B5 of the record, parked) would end both, and is what
  such a reader meets first.

## Any time

None of these waits for the items above, nor holds them up.

- **The README says what the library is and for whom, and names Foldkit**, as the owner's decision of 20 November
  2026 asks ([`adoption.md`](docs/records/adoption.md)): one reader starts a new application, the other has one
  already, most often in React.
- **A benchmark that runs in the CI.** Many children, many messages per second, to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`tools/bench/subscriptions.ts`) measures a parent's subscriptions only, and
  `tools/bench/writes.ts`, run by hand, what a write into an input and a bridge's frame cost; neither runs in the CI.
  To be designed: what is measured, and against what it fails, since a CI machine's times vary.
- **A devtools bridge over `onApplied`** (e.g. Redux DevTools), with time travel through `init: { state }` and
  replay through `applyAll`.
- **An example of routing**: flags from the URL, `popstate` as a subscription, navigation as a command.
- **An example of hot module reloading** that keeps the state, which the guide hints at (the view lives in a
  module of its own) without showing.
- **An example of saving each state before its commands start**, which the guide names ("Running", "Work that must
  wait goes to the effects of the program") without showing: `onApplied` offers the state and its revision to a
  queue, a fiber of whoever runs the program saves it, and a wrapped `runCommand` waits until the state its step
  heard is saved.

## Low priority

- **1.0.** Not before the library has been made known and used by others for at least one or two months, as the owner
  decided on 20 November 2026: only then may 1.0 be decided, with what its users have asked of the API. Until then,
  releases stay at 0.x.
