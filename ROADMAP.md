# Roadmap

What is to be done or decided now, and nothing else. Nothing here is a promise: each item is decided before it is
done, against the rules of [`AGENTS.md`](AGENTS.md). An item done is removed, with the reason in the commit. An item
rejected is removed and added to [`docs/rejected.md`](docs/rejected.md), with why and on what evidence, in the same
commit: read it before adding one. An item deferred or suspended leaves too, for "Parked, not rejected" there, with
what would reopen it. How an item came to be, and what was weighed for it, goes in a record of
[`docs/records/`](docs/records), not here. The order below comes from two of them:
[`adoption.md`](docs/records/adoption.md), the owner's decision that the library is meant to be adopted by others, and
[`architecture-review.md`](docs/records/architecture-review.md), a review of the whole project that the owner asked
for on 20 November 2026 and asked to be written here in the order it advises. Steps 2 to 5, 8 and 9 are its parts 1
to 6.

Each step names its model and effort, what it depends on, and how to tell that it is done.

## Open problems

A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a deterministic
test of it. None is open.

## Next, in order

### 1. `renderInto` draws into `root`

**Model and effort.** Opus 5.5, `medium`. It depends on no other step, and comes before the release: the bridges as
entries of the package are unreleased, so no user notices the change.

**Why.** Decided by the owner on 20 November 2026, on the first finding of the reader's check of that day
([`synchronous-dispatch.md`](docs/records/synchronous-dispatch.md), its last stage): both readers found by a probe that
`renderInto` of the bridge to snabbdom does not draw into `root`. Its doc comment and the tutorial, step 1, say that it
does. To say instead that it replaces `root` would be true of one case in three. snabbdom's `patch`, given `root`, was
run on that day with snabbdom 3.6.4 in happy-dom, in a scratch probe outside git, not kept:

- a root with a parent, whose selector is not the one of the view's top element, is replaced by that element: `root`
  ends detached and empty, and a test that queries through it finds nothing;
- a root whose tag, id and classes are the selector of the view's top element (`<main>` under `h("main", …)`) is kept,
  and what it held stays beside what the view draws;
- a root with no parent, as a test makes one with `createElement`, is given nothing: the view is drawn nowhere, in
  silence. So a second run with the same `root`, once a first run replaced it, draws nothing: a restart after a
  crash, a hot reload, a test that starts again.

With React, the `renderInto` of the bridges' tests (`drawInto` in `bridges/react.test.ts`) draws into `root` already:
the tests the bridges share (`bridges/bridge.test_suite.ts`) do not see the difference, since they query `document`.

**How.** `renderInto` empties `root`, gives it one child of the bridge's own (`root.replaceChildren(place)`), and starts
its patches from that child, where it starts from `root` today. So `root` keeps its place, with a parent or without
one, and holds the view's top element and nothing else, whatever that element's selector is: in the probe,
`<div id="app">Loading</div>` became `<div id="app"><main>…</main></div>`, and a root with no parent held the view
too. Emptying `root` is as React's `createRoot` does on its first render, and is the reviewer's proposal, which the
owner had not confirmed when this was written: ask before writing it, since a root that keeps what it held is one line
of difference.

- The skills are [`add-example`](.agents/skills/add-example/SKILL.md), for the bridge, and
  [`change-api`](.agents/skills/change-api/SKILL.md), for what an export promises.
- The tests go in `bridges/bridge.test_suite.ts`, for both bridges alike: `root` stays connected, what the view draws
  is found through `root`, what `root` held is gone, a root with no parent is drawn into, and a second run with the
  same `root` draws.
- The doc comment of `renderInto` and the tutorial say "into `root`" already. They, "Writing a bridge" (whose region
  `draw` changes, and "The handle") and "Testing" ("The view") say what the change makes true, and that `root` is
  emptied, each checked against the sentence it replaces. Then `bun run comments`.
- The premise: snabbdom's README says of `patch` that an element with a parent is replaced by the node of the vnode.
  The bridge rests on it today for `root` itself, and would rest on it for its own child: read `docs/premises.md`
  before deciding that it is none to add.
- The examples' pages become `#app > main`. `examples/style.css` styles `main` with no `body >` before it, read and
  not run: open one example in a browser.
- The entry of `CHANGELOG.md` for the bridges is edited only if it says where `renderInto` draws.

**Done when** those tests pass with both bridges, the checks of `AGENTS.md` pass, and this step is removed.

### 2. A write without `was`

**Model and effort.** Opus 5.5, `high`: the rule of an input and a bridge, each with invariants to keep.

**Depends on** step 1, which changes where the same bridge draws. It comes before the release: `Written` and the
inputs are unreleased.

**Why.** [`architecture-review.md`](docs/records/architecture-review.md), "A write without `was`". `was` guards one
window, of the bridge to snabbdom, between a notice from a command or a subscription and its draw. For it, every view
builds `Written` by hand over the value its model holds, the bridge draws in each handler, a `set` may not change the
value, and with React a second write before a render is rejected though it is not stale. The owner kept `was` on 20
November 2026 (R1 of [`synchronous-dispatch.md`](docs/records/synchronous-dispatch.md)): the record says what R1 did
not weigh, and how a bridge can close the window itself, with the outcome R1 wanted.

**How.** A spike, on a branch of its own, never to be merged, with a record of its own in `docs/records/`. Then the
owner decides. The record's "What the spike must show" lists what it answers:

- `written` (`src/input.ts`) stores a write wherever its place is there, and a write of the value held leaves the very
  same value.
- The bridge to snabbdom lets no handler run on a view older than the state, in one of two ways: it draws at every
  notice, with no animation frame, which is measured with a subscription that sends often; or it draws a notice not
  drawn yet before a handler runs, from a listener in the capture phase.
- The form of a write: `{ _tag: 'Written', value }`, or the value alone.
- By hand in a browser, as stage 4 of `synchronous-dispatch.md` did, with both bridges: a text typed in its middle
  and over a selection while a subscription changes that very value, with the pane on screen and hidden.
- Whether a `set` may then change the value, which is the first of the "Three points of the guide that the swap left"
  below.

The skills are [`change-engine`](.agents/skills/change-engine/SKILL.md),
[`change-api`](.agents/skills/change-api/SKILL.md) and [`add-example`](.agents/skills/add-example/SKILL.md).

**Done when** the owner has decided on the spike's record. Taken: its stages are steps here, each with its model and
effort (the rule and its property of the search, the bridges, the examples' views, the guide and the skill), and the
entries of `docs/rejected.md` it reverses say so. Refused: an entry of `docs/rejected.md` says why.

### 3. The run as a store and its effects

**Model and effort.** Fable 5.2, `high`: a design whose constraints pull apart, and one that reopens a decision of the
owner's.

**Depends on** step 2 decided, which settles when the bridge to snabbdom draws.

**Why.** [`architecture-review.md`](docs/records/architecture-review.md), "The run as a store and its effects". Since
a dispatch applies at once, a renderer needs nothing that is an effect, and three of the four renderers of the
repository use theirs only to be handed the `App`, and then wait for ever. The split is "`run` split into a
synchronous half and the fibers", which the owner parked on 20 November 2026 (B5): the record gives a reason the
entry did not weigh. With it comes one wake for each dispatch, which answers points 1, 2 and 3 of the "Seven points
of a review of the design" below by construction.

**How.** A spike and a plan, as `synchronous-dispatch.md` had them, in a record of its own. Then the owner decides.
The plan answers what the record lists under "Open, for the plan", and first what the record doubts: whether a run
started twice on one handle, as React's StrictMode starts an effect twice, can keep the commands of `init` from
running twice. The skills are [`change-engine`](.agents/skills/change-engine/SKILL.md),
[`change-api`](.agents/skills/change-api/SKILL.md) and [`add-example`](.agents/skills/add-example/SKILL.md).

**Done when** the owner has decided on the plan. Taken: its stages are steps here, after step 5, each with its model
and effort. Refused: the parked entry of `docs/rejected.md` says what was tried, and what would reopen it now.

### 4. External messages with a handler of their own

**Model and effort.** Opus 5.5, `high`: the types of `program.ts` and `compose.ts`, which keep the three rules of
`AGENTS.md`.

**Depends on** no other step's outcome. It is not done at the same time as the stages of step 2, which change the
same types of `compose.ts`.

**Why.** [`architecture-review.md`](docs/records/architecture-review.md), "External messages with a handler of their
own". A child that rejects an external message compiles, and dies of a `CompositionDefect`: the second rule of the
types says that what the types can prevent does not compile. A handler apart from `update`, which returns a `Step`
and so cannot reject, holds "the child answers in every state" by the types, and takes five checks of the types with
it.

**How.** A spike on a branch of its own, never to be merged, with a record of its own. Then the owner decides. It
shows `examples/list` and `examples/pages` written with the handler, the matrix of inference with each supported
TypeScript (`bun run inference`), and what the declarations and the hovers of a consumer print (`bun run smoke`). The
skills are [`change-api`](.agents/skills/change-api/SKILL.md) and
[`change-engine`](.agents/skills/change-engine/SKILL.md).

**Done when** the owner has decided on the spike's record. Taken: its stages are steps here, each with its model and
effort. Refused: an entry of `docs/rejected.md` says why.

### 5. A run without logs of its own

**Model and effort.** Opus 5.5, `high`: a change of the engine.

**Depends on** the owner's yes, asked before anything is written: it removes two options that a release has had, and
needs no spike. It is done before the stages of step 3, which change what a job is.

**Why.** [`architecture-review.md`](docs/records/architecture-review.md), "A run without logs of its own". The run
offers a job for every message so that it can log it, and the jobs are most of what a message costs ("Left open by the
stages", below). `onApplied` and `onIgnored` with a queue log the same outside the run.

**How.** If the owner agrees: the run's own logs go, with `describeMessage`, `describeCommand` and the three sites of
a defect that are theirs. A job is offered only for a step that stops or starts a subscription, or has commands, and
the thunk decides it from the step alone. The guide's "Running" shows the lines that log from `onApplied`.
`describeByTag` stays, for the `on` of a defect. The skills are
[`change-engine`](.agents/skills/change-engine/SKILL.md), [`change-api`](.agents/skills/change-api/SKILL.md) and
[`release`](.agents/skills/release/SKILL.md), for the entry of the changelog and its upgrade.

**Done when** the checks of `AGENTS.md` and of `change-engine` pass, the entry "A job for the fiber of effects only
while debug logs are enabled" of `docs/rejected.md` says what became of it, and this step is removed. Or, refused: an
entry of `docs/rejected.md` says why.

### 6. Release 0.8.0

**Model and effort.** Opus 5.5, `high`: its first part is a review.

**Depends on** steps 1 to 5: each decided, and the stages of those taken done. Released before them, 0.8.0 would
publish for one release what they remove, as R2 of
[`synchronous-dispatch.md`](docs/records/synchronous-dispatch.md) says of that change.

**Why.** The unreleased section of `CHANGELOG.md` is long, and users get none of it until a release: the bridges as
entries of the package, the inputs, the fixed declarations. It comes after the dispatch that applies its message at
once ([`synchronous-dispatch.md`](docs/records/synchronous-dispatch.md), done on 20 November 2026), which removed
exports that no release has had.

**How.** As [`release`](.agents/skills/release/SKILL.md) says. First a review of the premises
([`premise-review`](.agents/skills/premise-review/SKILL.md)), in a session that wrote none of the changes of the engine
and of the testing tools since the last review. That change leaves the review two leads. No test that a premise
names was run again without its premise, under the new engine: `docs/premises.md` was rewritten by reading.
And the premise "`Effect.scoped` fails with what a finalizer of its scope dies of" names a test that
`test/premises.test.ts` has not had since `35fe18f`. Then `bun run mutations` and `bun run interleavings`, and the
site built without warnings. Then the release commit and its tag. The owner publishes to npm.

**Done when** the tag `v0.8.0` is pushed.

### 7. The bridges in a real browser

**Model and effort.** Opus 5.5, `medium`.

**Depends on** no other step. It is here by the owner's order, after the release: point 7 of the "Seven points of a
review of the design" below weighs taking it first. If step 2 is taken, the second of its two cases changes: nothing
typed with snabbdom is then rejected for a draw that has not come.

**Why.** The bridges' tests run on happy-dom, which no browser is. The bridges draw controlled elements, and what is
typed into one rests on a premise seen only in happy-dom and in one browser (`docs/premises.md`, of a controlled
input): a text typed in its middle and over a selection, with its caret, was tried in Chromium with keys sent as a
user's, in the form with both bridges and in the stock-take
([`synchronous-dispatch.md`](docs/records/synchronous-dispatch.md), stage 4). Never run: an IME composition while the
program changes a value under the user, and what is typed with snabbdom between a notice from a command or a
subscription and its draw, at the next animation frame, which is rejected and taken back.

**How.** The tests of `bridges/bridge.test_suite.ts` run in a real browser too, in Chromium, Firefox and WebKit, with
those two cases; the tool is to be chosen. With React, also not run: `startTransition` or `useDeferredValue` in the
application, Fast Refresh (likely to restart the run, as `<Activity>` does), server rendering and hydration. Under
`renderToString`, the bridge's `Frames` threw, since its `useSyncExternalStore` had no `getServerSnapshot`: found by
the smoke test on 20 November 2026. `Draw` reads the model with `useSyncExternalStore` and no `getServerSnapshot`
either, and was not run under `renderToString`. Whether the bridge supports server rendering is to be decided, with
step 3.

**Done when** the suite passes in a real browser, in the CI or by a command written down in the repository.

### 8. One engine under the run and the testing tools

**Model and effort.** Fable 5.2, `high`: a plan for the engine and for each testing tool, whose rules pull apart.

**Depends on** steps 3 and 5: each decided, and the stages of those taken done, since they change the engine's shape
and what a job is. It changes nothing a user writes, so it does not hold up the release.

**Why.** [`architecture-review.md`](docs/records/architecture-review.md), "One engine under the run and the testing
tools". `rehearse` is a second engine, as long as the first, kept in step with it by hand and by the contract's
tests. Point 4 of the "Seven points of a review of the design" below proposes one transition of `core.ts` for the
pure half of a step. The record proposes more: one engine, generic in what performs a job, with a performer for the
run, one for `rehearse` and one for `simulate`.

**How.** A spike of `rehearse` over the engine, and a plan, in a record of its own. Then the owner decides between the
wider form, the one transition, and neither. The proof of a form is that `src/testing/contract.test.ts` passes as it
is. The plan also says what follows, each for the owner: whether `simulate` still earns its place, and whether
`Shape` can leave the API. The skill is [`change-engine`](.agents/skills/change-engine/SKILL.md).

**Done when** the owner has decided on the plan. Taken: its stages are steps here, each with its model and effort.
Refused: an entry of `docs/rejected.md` says why, and point 4 below is decided with it.

### 9. What the premises hold, and the peer range of Effect

**Model and effort.** Fable 5.2, `high`: premises and guarantees are questioned, and a rule of `AGENTS.md` with them.

**Depends on** steps 3 and 8: each decided, and the stages of those taken done, since they change which premises
there are. It comes before 1.0.

**Why.** [`architecture-review.md`](docs/records/architecture-review.md), "What the premises hold, and the peer range
of Effect". The peer range of Effect accepts only patches, so an application on a later minor cannot install the
library: the highest price of the premises, for a library meant to be adopted. Since a dispatch applies at once, no
premise seems to hold the order of the messages: what they hold is the effects and the end of a run.

**How.** Each premise of `docs/premises.md` is sorted by what falls with it: a guarantee of the guide's "What you can
rely on", only the where or the order of a defect as a run ends, only what a testing tool does, or only the scheduler
of the tests. The owner then weighs each guarantee that rests on a premise, kept or moved to "described, not
promised", and then the range: a caret, with the daily job (`.github/workflows/effect-latest.yml`) as the alarm, or
the tilde. The skills are [`premise-review`](.agents/skills/premise-review/SKILL.md) and
[`upgrade-effect`](.agents/skills/upgrade-effect/SKILL.md).

**Done when** the owner has decided the range, and `AGENTS.md`, `docs/premises.md`, the guide's "Guarantees" and
`package.json` say what was decided.

### 10. The changes that break the API

**Model and effort.** Fable 5.2, `high`: each entry is a design weighed again.

**Depends on** steps 2 to 5, which take the changes that the review of the architecture found.

**Why.** A user who adopts the library asks that its API stays, and a change that breaks it costs less the fewer users
it has. The API looks close to stable, but what `docs/rejected.md` parks would change it.

**How.** Each entry of "Parked, not rejected" in `docs/rejected.md` that touches the API and that no step above took
is weighed again with the owner: taken now, in a 0.x release, or kept parked. With them, a smaller point of
[`architecture-review.md`](docs/records/architecture-review.md): `init` means two things in the config of `make`.

**Done when** each such entry is taken or kept parked by the owner's decision.

### 11. A view of the library's own

**Model and effort.** Opus 5.5, `medium`, to write the entry of `docs/rejected.md` if the owner follows the advice
below. A decision to make it is planned anew, by Fable 5.2, `high`.

**Depends on** step 2 decided, which changes what a view writes.

**Why.** A view as data over snabbdom: a node holds its message, a child's view is lifted by a node that wraps its
messages, an input's node names its input. A test then finds every message a view can send without a DOM, and a view
takes no dispatch. It is the largest item. Since a dispatch applies its message at once, no bridge settles an input,
which was a reason for it, and `messagesSentBy` finds the writes of a snabbdom view over the value its model holds (R3
and B6 of [`synchronous-dispatch.md`](docs/records/synchronous-dispatch.md)): what is left, a handler that holds its
message and a view that takes no dispatch, is to be weighed again.

**How.** Not decided. [`adoption.md`](docs/records/adoption.md), "A wider form", says what it would be, what it costs,
and what was weighed beside it. The review of the architecture advises to reject it
([`architecture-review.md`](docs/records/architecture-review.md), "Smaller points"): it is a second product to keep,
which knows a renderer, for a view that takes no dispatch. The owner decides whether to make it, under which name, and
whether `@fgaudo/effect-tea/snabbdom` stays beside it.

**Done when** the owner has decided, and the view is made, or the entry of `docs/rejected.md` says why not.

## Waiting for the owner

Where a step above would answer a point below, the point stays here until the step is decided. Step 2 would answer
the first two of the "Three points of the guide that the swap left". Step 3 would answer points 1, 2 and 3 of the
"Seven points of a review of the design", and what the reader with an application in React meets, at their end. Step
5 would answer the job queued for each message, of "Left open by the stages". Step 8 would answer point 4 of the
seven.

- **Three findings of the reader's check of 20 November 2026**, the last stage of
  [`synchronous-dispatch.md`](docs/records/synchronous-dispatch.md): two readers that had not seen the code built a
  greenhouse panel, one from the package and one from the guide alone. Each finding changes what a page promises, or
  adds a page, so none was written. A fourth, that `renderInto` replaces `root`, is decided: "`renderInto` draws into
  `root`", above.
  1. **What the bridge to snabbdom draws of a vnode's data is said nowhere.** It has snabbdom's modules of props, of
     style and of listeners: a `class`, an `attrs` or a `dataset` is dropped in silence, and `disabled` is a prop. The
     examples' views say it in comments. To decide: whether "Writing a bridge" says it, which is a promise of the
     bridge.
  2. **A subscription from an API of callbacks, with its stop**, is shown only by `examples/volume/main.ts`. Both
     readers needed one: the guide starts every subscription from a `Stream` that a service already has. To decide:
     whether "Subscriptions" gets a section for it, and for a feed that never ends, which promises nothing new of the
     library.
  3. **What is drawn outside the root, and an event of the whole page**: `document.title`, a key pressed anywhere. No
     page says how. The readers drew the title two ways, a hook of the view's top vnode and a renderer over `App` beside
     `renderInto`, and both took the key as a subscription to a service. To decide: whether the guide says which way is
     the library's.

  Smaller, and not written either: "Running" could name `Fiber.interrupt` where it says to interrupt the fiber, and
  "Testing tools" could say that `hearNext` asks for the services of every subscription, not of the one it hears.
- **Left open by the stages of the dispatch that applies its message at once**, each in its record under its stage: a
  job queued for each message, which is most of what a message costs; a snabbdom renderer that was interrupted while
  its run goes on, whose handlers still apply and draw; and a test of the timer's buttons, in the bridges' tests, that
  no mutation tried makes fail. To weigh, each.
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
    The reader's check bears on it: an examiner that had not seen the library wrote 27 acceptance tests from the
    requirement, and seven of them took the world to be in step with the page; and the reader of the guide alone met
    the rule as a test that timed out. To decide: whether the skill names it.
- **Seven points of a review of the design.** By the session of Fable 5.2 that briefed and verified the stages of
  the same record, asked by the owner on 20 November 2026 what does not fit. Reasoned from the code read for those
  reviews, and not run, but where a point says so. Each is to be weighed.
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
     Chromium, with the form and the stock-take, the caret and a selection hold (the record, under its stage 4). To
     weigh: Firefox, WebKit and an IME composition before the release, where "The bridges in a real browser" comes
     after it.

  And for the reader who has an application in React: `Host` draws `fallback` until its run has started, and runs the
  commands of `init` twice under StrictMode. The split of `run` (B5 of the record, parked) would end both, and is what
  such a reader meets first.

## Any time

None of these waits for the items above, nor holds them up. Each is for Opus 5.5, `medium`, but where it says
otherwise.

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
- **`docs/invariants.md` without its list of tests.** It names in prose the tests that
  `tools/mutations/mutations.ts` binds to each check, and the two lists drift
  ([`architecture-review.md`](docs/records/architecture-review.md), "Smaller points"). The prose would keep each
  invariant and how it is kept, and leave the killers to the list, which a tool checks. Asked of the owner first: it
  changes how a document that rules is laid out.

## Low priority

- **1.0.** Not before the library has been made known and used by others for at least one or two months, as the owner
  decided on 20 November 2026: only then may 1.0 be decided, with what its users have asked of the API. Until then,
  releases stay at 0.x.
