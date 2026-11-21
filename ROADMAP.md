# Roadmap

What is to be done or decided now, and nothing else. Nothing here is a promise: each item is decided before it is
done, against the rules of [`AGENTS.md`](AGENTS.md). An item done is removed, with the reason in the commit. An item
rejected is removed and added to [`docs/rejected.md`](docs/rejected.md), with why and on what evidence, in the same
commit: read it before adding one. An item deferred or suspended leaves too, for "Parked, not rejected" there, with
what would reopen it. How an item came to be, and what was weighed for it, goes in a record of
[`docs/records/`](docs/records), not here. The order below comes from two of them:
[`adoption.md`](docs/records/adoption.md), the owner's decision that the library is meant to be adopted by others, and
[`architecture-review.md`](docs/records/architecture-review.md), a review of the whole project that the owner asked
for on 20 November 2026 and asked to be written here in the order it advises. Steps 1 to 4 and 8 are its parts 1 to
4 and 6, and steps 17 to 21 its part 5, as the owner took it on 21 November 2026
([`one-engine.md`](docs/records/one-engine.md)). Step 13 comes from a reading of the guide's promises against the
tests, which the owner asked for on 21 November 2026, and whose record is
[`promises-and-tests.md`](docs/records/promises-and-tests.md). Step 16 comes from the owner's question, on 21 November
2026, of why the findings api-1, api-2 and api-4 of [`library-review.md`](docs/records/library-review.md) passed the
inference matrix and the tests. A step done leaves its number unused.

Each step names its model and effort, what it depends on, and how to tell that it is done.

## Open problems

A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a deterministic
test of it. A finding of a review goes here with its `test.failing`, until its fix removes the mark and the item.
None is open.

## Next, in order

### 13. A guarantee names the checks that hold it

**Model and effort.** Opus 5.5, `medium`, to build the form advised below, once the owner has taken it. Fable 5.2,
`high`, if the owner asks for the forms to be weighed again on
[`promises-and-tests.md`](docs/records/promises-and-tests.md).

**Depends on** that record, done. It changes nothing a user writes. It adds a rule to `AGENTS.md`, so the owner is
asked first.

**Why.** Nothing ties a guarantee to its tests but prose kept by hand: `docs/invariants.md` names them, and the guide's
"How the tests check them" says what the search checks. `tools/mutations/mutations.ts` ties each check to the tests that
fail without it, and a tool proves that list, but no mutation says which guarantee its check holds. So a guarantee added
or reworded asks for no test, and "The library's tests check each guarantee" is a sentence that nothing checks.

**How.** The form advised: a field of a `Mutation` that names the items of "What you can rely on" that its check holds,
each by its bold title, as a doc comment names a section of the guide. A check that runs no test, in `bun run comments`
or beside it, fails on an item that no mutation holds, and on a name that the guide does not have. A command prints each
guarantee with its checks and the tests that kill them: the list by guarantee that the owner asked about, made by a tool
and never kept by hand. It adds no list of tests, since `bun run mutations` proves the one there is, and it says more of
a guarantee than that a test exists: the test fails without the check. An item whose check has no mutation says so in
the list, with the reason that `docs/invariants.md` gives. It covers "What you can rely on" alone, the list the guide
says the tests check, and the only one with no gap, by the record: a check of the mutations covers none of its 65
gaps. For the other pages, the record's method may become a skill, run before a release as
`premise-review` is: to weigh.

Weighed by the session that proposed the step, and advised against. A file of tests by guarantee (`guarantees.test.ts`):
the tests are there, each beside its module, so that to move them rewrites the killers of the mutations and the names in
`docs/invariants.md`, and to copy them makes two tests of one thing; and `src/interleaving.test.ts` is already laid out
by guarantee. A list of its own from each promise to the names of its tests: a third list of names kept by hand, the
drift that "Any time" below names. An entry for every sentence of the guide: `docs/rejected.md` has its kin ("Every line
of the guide quoted by a doc comment, or set aside with a reason"), and 46 sentences could not be sorted, by the record.

**Done when** the owner has decided. Taken: the check runs in the CI, and `AGENTS.md`, `change-engine` and
`docs/invariants.md` say what it holds. Refused: an entry of `docs/rejected.md` says why.

### 16. The types checked in every form a program is written

**Model and effort.** Opus 5.5, `high`: checks of the types that keep the three rules of "What belongs here", and the
generator they run in.

**Depends on** no other step. It changes nothing a user writes. It adds a rule to `AGENTS.md` (the first point
below), so the owner is asked first.

**Why.** api-1, api-2 and api-4 lived in one form of a program, an object not typed `Program<…>`, which `child`,
`childById`, `start` and the testing tools take as it is. The inference matrix (`tools/inference/generate.ts`) writes
two forms only, a program of `make` and one typed `Program<…>`, and the tests of `child` typed their children
`Program<…>` too, so the weaker check of `child` never met a case. And nothing compares the functions that take a
program: `child` checked less than `start`, and no check could see it. Its fix met a fourth case that the tests did not
hold: a child written in the call, where the check became the contextual type of its functions, and `HashMap.empty()`
held subscriptions of `unknown` messages. Only the smoke test found it, since every test gave `child` a constant. So
what is written matters, and how it is written too. No formal check of TypeScript's types exists: the compiler is the
only semantics, and it changes between 5.9, 6.0 and 7.0. The nearest is the matrix: every combination of declared
axes, checked by `tsc`, so the risk left is in the axes it does not list.

**How.** In this order, each with its leads listed under "Open problems" until fixed:

1. **One check for every function that takes a program.** `start`, `child`, `childById`, `simulate`, `rehearse` and
   `drive` check a program through one type, as `ProgramChecked` in `compose.ts` checks a child, so that they cannot
   differ. A rule of `AGENTS.md` ("Code") says so. Mind the two forms the fix of api-1 needed (`Lacking` and
   `CheckedChild` in `compose.ts`): the check is never on the type parameter itself, and never a member of the
   argument's type, or it types a program written in the call.
2. **The matrix writes the form it lacks**: a program as an object not typed `Program<…>`, in a constant, in the
   call, and spread from another, with its parameters annotated or contextual, and each of its violations
   (`externalRejects`, `missingRunCommand`, `missingOnEvent`, …) in that form too. Known lead, older than the fix of
   api-1: a child written in the call with a parameter not annotated, `makeModel: (state) => state.count`, does not
   compile: its error reads `P` as `AnyProgram`, whose `CommandOf` asks for a `runCommand`. Annotated, it
   compiles. The matrix decides whether it breaks the first rule, or is a form that repeats another.
3. **Each case is given to every function that takes a program**, and they must agree: the same verdict, and the same
   types read back (`StateOf`, `CommandOf`, `EventOf`, `ExternalOf`, `FlagsOf` and the services). It needs no answer
   known in advance: api-1 was `Program<…>` refusing what `child` took.
4. **What compiles runs without a defect the types could prevent**, the second rule, which nothing checks today: each
   valid case of the matrix is run with messages drawn by fast-check (with `simulate`, or the run), and never dies of a
   `CompositionDefect`; and `Effect.runFork(start(program).run)` compiles for a case that needs no service, which
   would have found api-4. It runs apart, as `bun run inference` does.

Then the owner weighs two more, each taken as a step here or written in `docs/rejected.md`. Mutations of the types: a
mutation in `tools/mutations/` that takes out each check of the types of `program.ts` and `compose.ts`, killed by the
typecheck of the tests of the types or by part of the matrix, so that each rule of the types has a check that fails
without it; it costs a run of `tsc` for each. And the guide tied to the matrix: each item of "What does not compile",
in "Anatomy of a program" and "Composition", names a `Violation` of the matrix, which a tool checks, as step 13 does
for the guarantees.

**Done when** points 1 to 4 run (the first three in `bun run inference`), `AGENTS.md`, `change-api` and the comment
at the head of `tools/inference/generate.ts` say what they check, their leads are fixed or listed under "Open
problems", and the owner has decided the two others.

### 6. The bridges in a real browser

**Model and effort.** Opus 5.5, `medium`.

**Depends on** no other step. It is here by the owner's order, after 0.8.0: point 7 of the "Seven points of a
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
Nor, by the record [`promises-and-tests.md`](docs/records/promises-and-tests.md), a handler that awaits, which returns at
its first `await`, so that what it sends after is drawn apart (its B5), and a limit that the element keeps by itself, as
`maxlength`, which needs nothing of the program and which a browser applies only to what a user types (its I1).
And one test passes on happy-dom only, by the review of the bridges of 21 November 2026: "a name the program empties
once saved is emptied in the input on screen, which stays and keeps the focus" (`bridges/bridge.test_suite.ts`). The
form disables its input while it saves, and by the HTML Standard's "focus fixup rule" a focused element that stops
being focusable leaves the focus to the viewport, and does not take it back when enabled again.

**How.** The tests of `bridges/bridge.test_suite.ts` run in a real browser too, in Chromium, Firefox and WebKit, with
those two cases; the tool is to be chosen. With React, also not run: `startTransition` or `useDeferredValue` in the
application, Fast Refresh (likely to restart the run, as `<Activity>` does), server rendering and hydration. Under
`renderToString`, the bridge's `Frames` threw, since its `useSyncExternalStore` had no `getServerSnapshot`: found by
the smoke test on 20 November 2026. Decided with step 2: the guide promises that `Host` and `Draw` draw the first model
on a server, which its spike ran under `renderToString`, and nothing of hydration until `hydrateRoot` is run here.

**Done when** the suite passes in a real browser, in the CI or by a command written down in the repository.

### 18. The engine's seams, with the run as their only user

**Model and effort.** Opus 5.5, `high`: code that keeps the invariants.

**Depends on** no other step: 0.8.0, released, is the engine that the review of the premises read. It changes
nothing a user writes.

**Why.** `rehearse` is a second engine, kept in step with the first by hand and by the contract's tests
([`architecture-review.md`](docs/records/architecture-review.md), part 5). The owner took, on 21 November 2026, the
form that [`one-engine.md`](docs/records/one-engine.md) spiked: the engine is given what the fiber of a command and
the fiber of a subscription run, and keeps the rest, the thunk, the queue of the jobs, their order, the fibers and the
end. The code gets no shorter: the checks are then made once.

**How.** The additions of "What the engine gets", in the record, each internal, with what the run does today as its
default: what a subscription's fiber and a command's fiber run, called by the job, where the fiber is forked; what the
thunk tells of a message; what the job tells once its stops have ended; a job that only tells; a message applied as a
source sends it, and the active keys; the end marked by plain code. Written anew from `main`: `de4b7d7` of the branch
`spike/one-engine` is a guide, and no design. Each addition has a test of `engine.test.ts` and a mutation. What a
message costs is measured with `tools/bench/writes.ts`, before and after. `docs/invariants.md` says what each is, and
that only the testing tools give them. The form adds no premise ("Where the rules pulled apart", in the record): one
that turns up is asked of the owner first. The skill is [`change-engine`](.agents/skills/change-engine/SKILL.md).

**Done when** the checks of `change-engine` pass, `bun run mutations` among them, with no test of the run changed.

### 19. `rehearse` over the engine

**Model and effort.** Opus 5.5, `high`.

**Depends on** step 18.

**How.** As spiked on `de4b7d7`, written anew. The rehearsal builds the engine with a command that waits until a
`run` takes it and a subscription that waits until a `hearNext` asks it. The ledger holds what the spike keeps in
mutable maps: the fiber of each pending command, the asks of each start, and whether a start has begun, each as a
transition with a test of `ledger.test.ts`. `loop.ts` and its test go. The record lists the mutations of `rehearse.ts`
by what becomes of them: 22 go, and their killers are named by the engine's mutations where they add one; 21, and the
6 of `loop.ts`, are written on the new text. Three things the record read and did not run are decided here, and asked
of the owner where one changes what a test sees: what the engine's `catch` records with no site, which a rehearsal's
register drops; how a `run` finds the fiber of its command; and the report of the engine's end, which the rehearsal
does not use. `docs/invariants.md` ("The testing tools behave like the engine", "one thunk") and `docs/premises.md`
say what is still kept by hand. Point 4 of the seven, under "Waiting for the owner", goes with this step. `Shape` is
kept to `program.ts` since the spike: the spike's `Shape<…>` in `rehearse.ts` is written `Program<{ … }>`, with
`State extends object`.

**Done when** `src/testing/contract.test.ts` and `src/testing/rehearse.test.ts` pass as they are, and the checks of
`change-engine` pass.

### 20. A review of the premises of the engine and of `rehearse`

**Model and effort.** Opus 5.5, `high`, for each reviewer, which wrote none of steps 18 and 19.

**Depends on** step 19. It comes before the release that follows 0.8.0.

**How.** As [`premise-review`](.agents/skills/premise-review/SKILL.md) says, over the changes of the engine and of
the testing tools since `v0.8.0`. The review of 21 November 2026, before that tag, has its reports in the bodies of
`1317333` on `claude/premise-review-engine-080`, `8ffc7a4` on `claude/premise-review-testing-bc87b9` and `6e90b46` on
`claude/premise-review-bridges-f28572`, which stay unmerged.

**Done when** each finding is fixed, or listed under "Open problems" with its `test.failing`.

### 21. `simulate`, weighed again

**Model and effort.** Fable 5.2, `high`: a form to decide, with the owner.

**Depends on** step 19.

**Why.** `simulate` is then the one tool with a thunk of its own: a fold in the caller's fiber over `Core.arrive` and
`Core.reconcile`, with 14 mutations. The owner keeps it in the API (21 November 2026): three examples and the guide's
"Testing tools" use it, for a flow where the test decides no order.

**How.** Over the engine it would be the rehearsal's command that waits, run oldest first after each message: a
rehearsal that hears nothing. It would cost a fiber of effects and a scope for each simulation, where a property may
run thousands: measured before it is decided ([`one-engine.md`](docs/records/one-engine.md), "`simulate`").

**Done when** the owner has decided: `simulate` runs over the engine, or an entry of `docs/rejected.md` says why not.

### 8. What the premises hold, and the peer range of Effect

**Model and effort.** Fable 5.2, `high`: premises and guarantees are questioned, and a rule of `AGENTS.md` with them.

**Depends on** steps 18 to 21, which change which premises there are. It comes before 1.0.

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

Where a step above would answer a point below, the point stays here until the step is done. Step 19 would answer point
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
- **A listener of the `App` that sends on every notice never returns, and no page says so.** Found on 21 November
  2026, from the memory guard of the tests: two helpers of `compose.test.ts` did it under a mutation, and filled the
  memory of the machine. A message that a listener sends is applied right after the step that told it ("View"), in the
  loop of the outermost call and not in a call inside it. So a listener that answers each new state with a message
  that makes another loops with no stack to overflow, and no defect says so. Only code that subscribes to the `App`
  itself reaches it: a bridge, or a helper of a test. The bridge to snabbdom draws in a microtask, where a hook that
  sends on every draw would loop by microtasks, outside the run: reasoned, not run. To decide: whether "Guarantees"
  says it under "Nothing is bounded, and nothing times out", of which it is a case, and whether "Writing a bridge"
  names it. For Opus 5.5, `medium`, once decided. Weighed by the session that found it, and advised against: a bound
  on the messages applied in one call, with a defect past it. It adds an export, and a number that nothing gives, for
  the few who write a listener, where the guide says that nothing is bounded.

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
  changes how a document that rules is laid out. Step 13 decides it: with the list that step prints by guarantee,
  the prose may leave the names.

## Low priority

- **1.0.** Not before the library has been made known and used by others for at least one or two months, as the owner
  decided on 20 November 2026: only then may 1.0 be decided, with what its users have asked of the API. Until then,
  releases stay at 0.x.
