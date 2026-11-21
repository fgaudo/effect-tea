# Roadmap

What is to be done or decided now, and nothing else. Nothing here is a promise: each item is decided before it is
done, against the rules of [`AGENTS.md`](AGENTS.md). An item done is removed, with the reason in the commit. An item
rejected is removed and added to [`docs/rejected.md`](docs/rejected.md), with why and on what evidence, in the same
commit: read it before adding one. An item deferred or suspended leaves too, for "Parked, not rejected" there, with
what would reopen it. How an item came to be, and what was weighed for it, goes in a record of
[`docs/records/`](docs/records), not here. The order below comes from two of them:
[`adoption.md`](docs/records/adoption.md), the owner's decision that the library is meant to be adopted by others, and
[`architecture-review.md`](docs/records/architecture-review.md), a review of the whole project that the owner asked
for on 20 November 2026 and asked to be written here in the order it advises. Steps 1 to 4, 7 and 8 are its parts 1
to 6. A step done leaves its number unused.

Each step names its model and effort, what it depends on, and how to tell that it is done.

## Open problems

A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a deterministic
test of it. A finding of a review goes here with its `test.failing`, until its fix removes the mark and the item. The
five below are of the review of the premises of 21 November 2026 (step 5), grouped by their form, which a fix takes
whole, as [`premise-review`](.agents/skills/premise-review/SKILL.md) says. Each `test.failing` was run without its
mark, and fails at its assertion.

1. **A defect that the root of a command's fiber makes is not recorded, in `rehearse` and in `simulate`.** A release
   of a command's scope that has another fiber of the program interrupt the command's fiber: the interruption lands
   once `scopedIn` has returned, and only `rootedIn` takes it for a defect. The engine records it (`recorded` after
   `rootedIn`); `rehearse` (`runFirst`) and `simulate` (`runOne`) do not, so `rehearse` loses it where the scenario
   catches the failure of `run`, or never joins it, and `simulate` where whoever runs it interrupts it as the release
   runs. Tests: `src/testing/contract.test.ts`, "rehearse fails with a defect, as the run dies, of a command a fiber
   of the program interrupts as it releases, though the scenario catches it", and "simulate fails with a defect …, as
   whoever runs it interrupts it". The places checked: the engine's commands and subscriptions, and `rehearse`'s
   subscriptions, record it. In `rehearse`, an answer refused once the rehearsal ends (`loop.submit` in `answering`)
   is an `Effect.interrupt` of the command's own fiber, which the root would then record as a defect: it wants
   `{ quiet: true }`, as `sends` has for subscriptions. A mutation that takes `rootedIn` out of the engine's
   `runCommand` has a killer now (`contract.test.ts`, "the run dies with a defect of a command a fiber of the program
   interrupts as it releases"), against what `docs/invariants.md` says of the root.
2. **`drive`'s `send`, made by a wait that a step wakes, returns before `update` has seen its message.** `drive`'s
   listener completes the waits' `Deferred` inside the step; Effect 4.1.4 resumes the waiting fiber on that stack, so
   its `send` is a dispatch during the step, kept for after it. It breaks the guide's "when `send` returns, `update`
   has seen the message", and `docs/invariants.md`'s "no fiber is woken inside a step". Test:
   `src/testing/drive.test.ts`, "drive's send, made by a wait that a step wakes" › "returns once update has seen its
   message, as it promises". The same resumption as point 3 of the seven, under "Waiting for the owner": deciding that
   point decides how this is fixed (the waits woken once the outermost `apply` returns, or a premise to rest on).
3. **The bridge to snabbdom records a defect of `init` twice.** The first draw gives what `model()` threw back to
   `die`, and the dead handle's `die` (`partsOf` in `src/run.ts`) takes as it is only a model's defect: the run dies
   with `["init", "render"]`, against `App.die`'s doc comment. Test: `bridges/snabbdom.test.ts`, "what the first draw
   throws" › "by an init that threw, ends the run with the one defect of init". The form: a defect a reader got from
   the handle, given back, recorded again; a listener's site never meets it, and React's `Draw` gives no defect to
   `die`.
4. **With the bridge to React, a defect of `makeModel` reaches the error boundary and `reportError` both**, when the
   end of the run waits for a release: React's render throws it to the boundary, which unmounts `Host`, and the run
   then ends with that very defect, which `Host` gives to `reportError`. Test: `bridges/react.test.ts`, "Host" › "a run
   that dies" › "a makeModel that throws reaches the nearest error boundary, and is not reported again". The form: one
   defect reported by two actors once their order flips. To decide: `Host` keeps what React threw for it, or the guide
   says that such a defect may reach both.
5. **A difference of the contract on a first state whose subscriptions and model both throw**: the run dies in
   `["subscriptions", "render"]`, since its handle is made and a renderer reads the model, and `rehearse` in
   `["subscriptions"]`, since it fails before it makes the first model. Test: `src/testing/contract.test.ts`, "rehearse
   fails in subscriptions, then in render, as the run dies, on a first state whose model is a defect too". The order
   and count of defects are described, not promised: to decide whether `rehearse` makes the first model whatever the
   first keys did, or the test goes with a line of the guide.

## Next, in order

### 5. Release 0.8.0

**Model and effort.** Opus 5.5, `high`: its first part is a review.

**Depends on** steps 2 to 4: each decided, and the stages of those taken done. Released before them, 0.8.0 would
publish for one release what they remove, as R2 of
[`synchronous-dispatch.md`](docs/records/synchronous-dispatch.md) says of that change.

**Why.** The unreleased section of `CHANGELOG.md` is long, and users get none of it until a release: the bridges as
entries of the package, the inputs, the fixed declarations. It comes after the dispatch that applies its message at
once ([`synchronous-dispatch.md`](docs/records/synchronous-dispatch.md), done on 20 November 2026), which removed
exports that no release has had.

**How.** As [`release`](.agents/skills/release/SKILL.md) says. The review of the premises
([`premise-review`](.agents/skills/premise-review/SKILL.md)) is done, by three reviewers that wrote none of the
changes since `da12f71`: the engine, the testing tools and the bridges. Their reports are the bodies of `1317333`
on `claude/premise-review-engine-080`, `8ffc7a4` on `claude/premise-review-testing-bc87b9` and `6e90b46` on
`claude/premise-review-bridges-f28572`, which stay unmerged. Its findings are the open problems above, fixed by their
form before the release. What else it leaves, each to do or decide before the release:

- **The mutation "an interruption with the fiber id of one the fiber received is no defect, whatever its mark"**
  (`src/core.ts`) has killers through `start` again: a command and a subscription, uninterruptible, that learn the id of
  the fiber that stops them from the interruption they received (`Cause.interruptors`), interrupt a fiber as that id and
  join it, as whoever runs the run interrupts it. The engine's reviewer wrote both, in
  `src/engine-review-scratch.test.ts` of `claude/premise-review-engine-080` (with the three tests of `Effect.scoped`
  below); they pass at `97d8d9f` and fail under the mutation. They go in `src/run.test.ts` and in the mutation's
  `killedBy`. The tests that look like them (`run.test.ts`, "…joins a fiber the fiber of the run interrupted, as the
  run ends…", and `engine.test.ts`, "a subscription interrupting itself as the end of the engine stops it, its key
  gone, is a defect") kill nothing of the mark any more, and their comments say more than their setup reaches.
- **The premise "`Effect.scoped` fails with what a finalizer of its scope dies of"** still holds, and
  `engine.test.ts`, "what a command dies of as the end of the engine interrupts it is what the end dies of", rests on
  it: its three tests, as `35fe18f` removed them, pass, and come back to `test/premises.test.ts`.
- **The test of the premise "`HashMap` calls a key's `Equal` and `Hash` only within the call"** passes with the
  variant its entry names (a `FiberMap` whose fiber, replaced under an equal key, ends after the call): four such
  constructions called no `Equal` after the call. Either a test where `FiberMap`'s observer meets a pair the call did
  not compare, or the sentence goes, from `docs/premises.md` and from `src/engine.ts` where it keeps fibers by start.
  Of the other premises, every named test fails without its premise; the entries of `timeoutOption` and of `Logger`
  should say that their tests fail by a timeout and by an error of the logger, not at an assertion.
- **A defect given to `die`, or recorded by a model read, between the read of the register (`deaths.all()` in
  `startWith`) and the end of the run's fiber, is in no cause.** No run of the search reached it (1000 runs, 4
  schedules each, seeds 42, 7 and 99, with `die` given a defect whenever the run's fiber had not ended). The guide
  says of `die`, without a condition, that the run dies of it ("Running"), also once the run has ended. To decide:
  the guide's sentence, or a register closed in the thunk of its read.
- **A premise of the bridge to React, listed nowhere**: React renders a `useSyncExternalStore` update made outside
  its events before the browser's next task. "Writing a bridge" and `docs/invariants.md` rest on it; the bridge's tests
  take every render with `flushSync`. The bridges' reviewer wrote a test of React alone that passes on happy-dom. It
  needs the owner's consent, as `docs/premises.md` says.
- **Sentences that say otherwise than the code**, listed in the reports: the reason for the mark (`core.ts`,
  `docs/invariants.md`), `forkChild` in `rootedIn`, the first `run` of "untraced", the root without a killer, `drive`'s
  options "of `run`", the frames of `drive.test.ts` and `contract.test.ts`, `refresh` in `bridge.test_suite.ts`,
  "drawn once" per task where the bridge draws once per checkpoint, the check `if (queued) return` without a mutation,
  and tests whose names say more than they check.

Then `bun run mutations` and `bun run interleavings`, and the site built without warnings. Then the release commit and
its tag. The owner publishes to npm.

**Done when** the tag `v0.8.0` is pushed.

### 6. The bridges in a real browser

**Model and effort.** Opus 5.5, `medium`.

**Depends on** no other step. It is here by the owner's order, after the release: point 7 of the "Seven points of a
review of the design" below weighs taking it first. The second of its two cases is now: nothing typed with snabbdom is
rejected for a draw that has not come, and what is left of it is an event that the program's own code dispatches in
the task of a notice, before its draw ("The way the bridge to snabbdom takes", in
[`write-without-was.md`](docs/records/write-without-was.md)).

**Why.** The bridges' tests run on happy-dom, which no browser is. The bridges draw controlled elements, and what is
typed into one rests on a premise seen only in happy-dom and in one browser (`docs/premises.md`, of a controlled
input): a text typed in its middle and over a selection, with its caret, was tried in Chromium with keys sent as a
user's, in the form with both bridges and in the stock-take
([`synchronous-dispatch.md`](docs/records/synchronous-dispatch.md), stage 4). Never run: an IME composition while the
program changes a value under the user, and an event that the program's own code dispatches in the task of a
notice, before its draw (`element.click()`, `dispatchEvent`, `focus()`), whose handler runs on the view of before.

**How.** The tests of `bridges/bridge.test_suite.ts` run in a real browser too, in Chromium, Firefox and WebKit, with
those two cases; the tool is to be chosen. With React, also not run: `startTransition` or `useDeferredValue` in the
application, Fast Refresh (likely to restart the run, as `<Activity>` does), server rendering and hydration. Under
`renderToString`, the bridge's `Frames` threw, since its `useSyncExternalStore` had no `getServerSnapshot`: found by
the smoke test on 20 November 2026. Decided with step 2: the guide promises that `Host` and `Draw` draw the first model
on a server, which its spike ran under `renderToString`, and nothing of hydration until `hydrateRoot` is run here.

**Done when** the suite passes in a real browser, in the CI or by a command written down in the repository.

### 7. One engine under the run and the testing tools

**Model and effort.** Fable 5.2, `high`: a plan for the engine and for each testing tool, whose rules pull apart.

**Depends on** steps 2 and 4: each decided, and the stages of those taken done, since they change the engine's shape
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

### 8. What the premises hold, and the peer range of Effect

**Model and effort.** Fable 5.2, `high`: premises and guarantees are questioned, and a rule of `AGENTS.md` with them.

**Depends on** steps 2 and 7: each decided, and the stages of those taken done, since they change which premises
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

### 9. The changes that break the API

**Model and effort.** Fable 5.2, `high`: each entry is a design weighed again.

**Depends on** steps 2 to 4, which take the changes that the review of the architecture found.

**Why.** A user who adopts the library asks that its API stays, and a change that breaks it costs less the fewer users
it has. The API looks close to stable, but what `docs/rejected.md` parks would change it.

**How.** Each entry of "Parked, not rejected" in `docs/rejected.md` that touches the API and that no step above took
is weighed again with the owner: taken now, in a 0.x release, or kept parked. With them, a smaller point of
[`architecture-review.md`](docs/records/architecture-review.md): `init` means two things in the config of `make`.

**Done when** each such entry is taken or kept parked by the owner's decision.

### 10. A view of the library's own

**Model and effort.** Opus 5.5, `medium`, to write the entry of `docs/rejected.md` if the owner follows the advice
below. A decision to make it is planned anew, by Fable 5.2, `high`.

**Depends on** the write without `was`, done: a view writes the element's value alone, `{ _tag: 'Written', value }`.

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

Where a step above would answer a point below, the point stays here until the step is done. Step 7 would answer point
4 of the seven. A point of the seven that is gone leaves its number unused.

- **Three findings of the reader's check of 20 November 2026**, the last stage of
  [`synchronous-dispatch.md`](docs/records/synchronous-dispatch.md): two readers that had not seen the code built a
  greenhouse panel, one from the package and one from the guide alone. Each finding changes what a page promises, or
  adds a page, so none was written. A fourth, that `renderInto` replaced `root`, is done: it draws into `root`.
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
  snabbdom renderer that was interrupted while its run goes on, whose handlers still apply and draw; and a test of the
  timer's buttons, in the bridges' tests, that no mutation tried makes fail. To weigh, each.
- **A point of the guide that the swap left**, found by the session that rewrote it. Two more it found, the rule on
  `set` and a second write before React renders, were answered by the write without `was`.
  - **The skill's "Rules that nothing checks" does not say that the state is ahead of its effects.** The guide does
    ("Guarantees", "Testing tools"), as a description. A coding agent that writes a test with `drive` meets it first.
    The reader's check bears on it: an examiner that had not seen the library wrote 27 acceptance tests from the
    requirement, and seven of them took the world to be in step with the page; and the reader of the guide alone met
    the rule as a test that timed out. To decide: whether the skill names it.
- **Seven points of a review of the design.** By the session of Fable 5.2 that briefed and verified the stages of
  the same record, asked by the owner on 20 November 2026 what does not fit. Reasoned from the code read for those
  reviews, and not run, but where a point says so. Each is to be weighed.
  3. **A fiber resumed on the stack of whoever completes its `Deferred` is no premise, and shapes code of the testing
  tools.** The counter of notices in `drive`, and two killers that work only through it (stages 1 and 2), exist for
  a behaviour the library refuses to rest on. They have no mutation, which `docs/premises.md` warns of ("never made
  unneeded by code of the library's written for it alone"). With a dispatch that applies at once it is no edge any
  more. To weigh: adopt it as a premise, with its test, so that those guards get killers. It reverses E3 of the
  record, which the same session proposed.
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
