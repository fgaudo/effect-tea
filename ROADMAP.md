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

**Why.** A dispatch only queued its message, and `update` heard it later. An element with a value of its own needs the
state to change during its event, and what the library had for the element of an input followed from that one premise:
`seen`, the number a dispatch returned, `Shown`, `edited`, `drawn`, and bridges that settled a native text field alone.
Spiked on 20 November 2026, decided by the owner the same day with every answer of its plan, and swapped in that day:
a dispatch is a function that applies its message before it returns, and a renderer gets an `App`.

**How.** As the plan of [`docs/records/synchronous-dispatch.md`](docs/records/synchronous-dispatch.md) says. Stages 0
to 4 are done, each with its outcome in the record. **What is left is stage 5, a reader's check of the documentation**
([`guide-reader`](.agents/skills/guide-reader/SKILL.md)), by a session that wrote none of it.

**Where it stands**, 20 November 2026, for a session that takes this up with none of the conversation:

- **The swap is committed.** The engine, the testing tools and the bridges are the new ones, `src/next/` and
  `bridges/next/` are gone, and the guide, `docs/invariants.md`, `docs/premises.md` and the changelog describe the new
  code. Every check of the stage passed, run again by the session that briefed it.
- **`AGENTS.md` still has seven sentences that the swap makes untrue.** They wait for the owner's yes, under "Waiting
  for the owner", with three points of the guide.
- **Tried in a browser**, by the session that verified the swap, in Chromium, with keys sent as a user's. In the form,
  with snabbdom and with React: a text typed in its middle, and over a selection, keeps its caret, and a save empties
  both fields. In the stock-take: a count typed in its middle, and a submit. Firefox, WebKit and an IME composition
  were not run (item 3).
- **For the reader's check**: "View" has no "Precisely" section any more, since its three parts went with the frames.
- Left open by the stages, each in the record under its stage: a job queued for each message; the loop of the thunk
  with no `finally`; a snabbdom renderer interrupted while its run goes on; a test of the timer's buttons, in the
  bridges' tests, that no mutation tried makes fail.

**Done when** the reader's check is done.

### 2. Release 0.8.0

**Why.** The unreleased section of `CHANGELOG.md` is long, and users get none of it until a release: the bridges as
entries of the package, the inputs, the fixed declarations. It comes after item 1, which removes exports that no
release has had yet.

**How.** As [`release`](.agents/skills/release/SKILL.md) says. First a review of the premises
([`premise-review`](.agents/skills/premise-review/SKILL.md)), in a session that wrote none of the changes of the engine
and of the testing tools since the last review. The swap of item 1 leaves that review two leads. No test that a
premise names was run again without its premise, under the new engine: `docs/premises.md` was rewritten by reading.
And the premise "`Effect.scoped` fails with what a finalizer of its scope dies of" names a test that
`test/premises.test.ts` has not had since `35fe18f`. Then `bun run mutations` and `bun run interleavings`, and the
site built without warnings. Then the release commit and its tag. The owner publishes to npm.

**Done when** the tag `v0.8.0` is pushed.

### 3. The bridges in a real browser

**Why.** The bridges' tests run on happy-dom, which no browser is. The bridges draw controlled elements, and what is
typed into one rests on a premise seen only in happy-dom and in one browser (`docs/premises.md`, of a controlled
input): a text typed in its middle, with its caret, was tried once, by hand, in Chromium
([`synchronous-dispatch.md`](docs/records/synchronous-dispatch.md)). Never run: an IME composition while the program
changes a value under the user, and what is typed with snabbdom between a notice from a command or a subscription and
its draw, at the next animation frame, which is rejected and taken back.

**How.** The tests of `bridges/bridge.test_suite.ts` run in a real browser too, in Chromium, Firefox and WebKit, with
those two cases; the tool is to be chosen. With React, also not run: `startTransition` or `useDeferredValue` in the
application, Fast Refresh (likely to restart the run, as `<Activity>` does), server rendering and hydration. Under
`renderToString`, the bridge's `Frames` threw, since its `useSyncExternalStore` had no `getServerSnapshot`: found by
the smoke test on 20 November 2026. `Draw` reads the model with `useSyncExternalStore` and no `getServerSnapshot`
either, and was not run under `renderToString`. Whether the bridge supports server rendering is to be decided, with
the split of `run` that `docs/rejected.md` parks.

**Done when** the suite passes in a real browser, in the CI or by a command written down in the repository.

### 4. The changes that break the API

**Why.** A user who adopts the library asks that its API stays, and a change that breaks it costs less the fewer users
it has. The API looks close to stable, but what `docs/rejected.md` parks would change it.

**How.** Each entry of "Parked, not rejected" in `docs/rejected.md` that touches the API is weighed again with the
owner: taken now, in a 0.x release, or kept parked.

**Done when** each such entry is taken or kept parked by the owner's decision.

### 5. A view of the library's own

**Why.** A view as data over snabbdom: a node holds its message, a child's view is lifted by a node that wraps its
messages, an input's node names its input. A test then finds every message a view can send without a DOM, and a view
takes no dispatch. It is the largest item. Since a dispatch applies its message at once, no bridge settles an input,
which was a reason for it, and `messagesSentBy` finds the writes of a snabbdom view over the value its model holds (R3
and B6 of [`synchronous-dispatch.md`](docs/records/synchronous-dispatch.md)): what is left, a handler that holds its
message and a view that takes no dispatch, is to be weighed again.

**How.** Not decided. [`adoption.md`](docs/records/adoption.md), "A wider form", says what it would be, what it costs,
and what was weighed beside it. The owner decides whether to make it, under which name, and whether
`@fgaudo/effect-tea/snabbdom` stays beside it.

**Done when** the owner has decided, and the view is made, or the entry of `docs/rejected.md` says why not.

## Waiting for the owner

- **Seven sentences of `AGENTS.md` that the swap of item 1 makes untrue**, each with the sentence proposed in its
  place. None is written: the owner says yes first, to all or to each.
  1. "Running a dispatch needs no services and completes synchronously, from a plain callback with `Effect.runSync`:
     it is the renderer's business, and the library exports no helper for it." Proposed: "A dispatch is a function
     that applies its message before it returns, and needs no services: a renderer calls it from a plain callback as
     it is, and the library exports no helper for it."
  2. "Frames cost only what is drawn, and no span lives as long as the run." Proposed: "A model is made only when it
     is read, and no span lives as long as the run."
  3. "`onApplied` and `onIgnored` are given no dispatch, and return nothing: they are functions, not effects, so the
     loop runs no effect of the program". Proposed: "…so applying a message runs no effect of the program".
  4. Under "Code", `input.ts` is "an input, and the rule a bridge calls for the element that shows one". Proposed: "an
     input, and the rule of a write".
  5. Under "Code", `loop.ts` is "the loop that applies its steps one at a time". Proposed: "the loop that does its jobs
     one at a time".
  6. Under "Code", the example of a key for a part of a type is `Shown/unseen`. Proposed: `Program/external`, the one
     key of that form the code has now.
  7. Under "What belongs here", a type moves to the library's side to "keep it the same across frames by a cache of its
     own". Proposed: "keep it the same from one draw to the next by a cache of its own".
- **Three points of the guide that the swap left**, found by the session that rewrote it, which changed none of them.
  - **"Do not change the value in `set`"** ("Inputs the user types into", "What is typed, in another form"). Its
    reason says that the user's next write is rejected, and the next draw takes back what was typed. A write is now
    applied and drawn in its own event, so the next write is over the value `set` left, and is stored: the reason holds
    only for a write that comes before the draw. To decide: keep the rule with a reason the code keeps (the element
    then shows a value the user did not type, and nothing tests where the caret goes), or drop it, which promises that
    a `set` that changes the value is shown at once, needs a test, and reopens "A value changed as the library stores
    it" (`docs/rejected.md`).
  - **A source outside React that writes twice before React renders**, as a dictation's listener: the second write is
    over the value of the first model, and rejected. The spike's record names it, and the guide's "What is left out"
    does not. To decide: whether it is listed there.
  - **The skill's "Rules that nothing checks" does not say that the state is ahead of its effects.** The guide does
    ("Guarantees", "Testing tools"), as a description. A coding agent that writes a test with `drive` meets it first.
    To decide: whether the skill names it.
- **Seven points of a review of the design.** By the session of Fable 5.2 that briefed and verified the stages of
  item 1, asked by the owner on 20 November 2026 what does not fit. Reasoned from the code read for those reviews, and
  not run, but where a point says so. Each is to be weighed.
  1. **The end of the run may begin inside a step.** A defect recorded in the thunk completes `died` there
     (`Deaths.record`), and Effect resumes the run's waiter on that stack: the end sets `stopped` and stops fibers
     while the step still tells its listeners. It is correct, by the checks, and the hardest part of the engine to
     reason about. To weigh: the register written at once, and `died` completed once the outermost `apply` returns.
  2. **The loop of the thunk has no `finally`** (`apply` in `src/engine.ts`). What threw there outside `attempt`
     would leave `applying` set, and the engine applying nothing, in silence, against "Nothing ends in silence". To
     weigh: a `finally`, and a defect of the library's own for what it catches.
  3. **A fiber resumed on the stack of whoever completes its `Deferred` is no premise, and shapes more code at each
     stage.** "Writes first, offers last" in every thunk, the counter of notices in `drive`, and two killers that work
     only through it (stages 1 and 2) exist for a behaviour the library refuses to rest on. They have no mutation,
     which `docs/premises.md` warns of ("never made unneeded by code of the library's written for it alone"). With a
     dispatch that applies at once it is no edge any more. To weigh: adopt it as a premise, with its test, so that
     those guards get killers. It reverses E3 of the record, which the same session proposed.
  4. **The pure half of a step is written twice**, in `applyOne` (`src/engine.ts`) and in `apply`
     (`src/testing/rehearse.ts`): `arrive`, the state, `reconcile` and the stop at a defect, in the same order.
     To weigh: one transition of `core.ts` for both, as `shared-core.md` did for `arrive` and `reconcile`.
  5. **The state is ahead of its effects, and a test may assume it is not.** A step's commands start in a later job,
     and the end drops the jobs not taken. So a test that ends once the state shows something may end before the
     commands of that step start: a test of `drive` changed meaning for it in stage 2. Done in stage 4 for the guide,
     which says it in "Guarantees" and in "Testing tools", and for the doc comment of `drive`. Left: whether the skill
     says it (above).
  6. **The whole pure step now runs in the event that sends the message**: `update`, `onApplied`, `subscriptions` with
     the lookup of every key, the listeners and, with React, `makeModel`. It was measured for a counter with no key
     alone. The guide now promises that a model is made only when it is read, and describes that React reads one for
     each state. To do before the release: measure a step with many keys and a model that costs (the benchmark of
     "Any time").
  7. **The premise the design rests on was run in one real browser, and never with an IME** (P3 of the record). In
     Chromium, with the form and the stock-take, the caret and a selection hold (item 1, "Where it stands"). To weigh:
     Firefox, WebKit and an IME composition before the release, where "The bridges in a real browser" comes after it.

  And for the reader who has an application in React: `Host` draws `fallback` until its run has started, and runs the
  commands of `init` twice under StrictMode. The split of `run` (B5 of the record, parked) would end both, and is what
  such a reader meets first.

## Any time

None of these waits for the items above, nor holds them up.

- **The README says what the library is and for whom, and names Foldkit**, as the owner's decision of 20 November
  2026 asks ([`adoption.md`](docs/records/adoption.md)): one reader starts a new application, the other has one
  already, most often in React.
- **A benchmark that runs in the CI.** Many children, many messages per second, to keep what a message costs the event
  that sends it, and a model made only when it is read, from regressing. `bun run bench`
  (`tools/bench/subscriptions.ts`) measures a parent's subscriptions only, and `tools/bench/writes.ts`, run by hand,
  what a write into an input and a dispatch with its model read cost; neither runs in the CI. To be designed:
  what is measured, and against what it fails, since a CI machine's times vary.
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
