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
([`one-engine.md`](docs/records/one-engine.md)). Step 16 came from the owner's question, on 21 November 2026, of why
the findings api-1, api-2 and api-4 of [`library-review.md`](docs/records/library-review.md) passed the inference
matrix and the tests; its points were done by 23 November 2026, the first as the owner decided after two second
opinions ([`program-checks.md`](docs/records/program-checks.md) and
[`program-forms.md`](docs/records/program-forms.md)), and of the two it left to the owner, step 44 is the one taken. Steps 22 to 31 come from
[`application-report.md`](docs/records/application-report.md), a report of an application's upgrade to 0.8.0 that the
owner asked to weigh on 22 November 2026. From the same record, "Why no check found them", come step 27, point 5 of
step 16, point 5 of step 26, and two items of "Any time"; and from "What the owner decided", steps 28 to 30, and a step
31 that step 33 took in. Steps 34 to 36 come from a second opinion on the design, which the owner asked for in a
session on an application that uses the library, and asked to weigh here the same day, on the library's own examples:
a probe found two rules of the guide that contradict each other, which was step 32. The owner refused a fix of it by
the guide alone, asked how the relation of a parent and its children should be set right, and took a direction to
spike, which was step 33. After the spike the owner took both of its parts, the store of the children and `output`,
with the choices under them ([`kept-children.md`](docs/records/kept-children.md), "What the owner decides"): steps 34
to 36 write them. From the same weighing come the form that step 40 spiked and an item of "Any time". Step 37
writes what the owner took of step 29, after its spike ([`stored-form.md`](docs/records/stored-form.md)), and step
38 what the owner took of step 30, after its own ([`subscription-from-key.md`](docs/records/subscription-from-key.md)).
Step 40 was what was left of what the owner took of step 9, on 23 November 2026: it weighed again each parked entry
of `docs/rejected.md` that breaks the API ([`inert-steps.md`](docs/records/inert-steps.md) and
[`declared-inputs.md`](docs/records/declared-inputs.md), "Weighed again"). Steps 41 to 43 write what the owner took
of its spike the same day, with the conditions of a second opinion
([`value-in-message.md`](docs/records/value-in-message.md), "Decided"): step 41, the rule in the guide, step 42, what
`messagesSentBy` gives a handler, and step 43, `volume`'s press as its example, are done. A step done leaves its number unused.

The owner asked on 22 November 2026 for the order to be weighed again, and took this one, by what a user of the
library meets:

1. the checks, steps 44 and 6: of the types, by mutations, and of the bridges in a real browser;
2. the peer range of Effect, step 8, which decides whether an application on a later Effect can install the library;
3. the engine, steps 18 to 21, which change nothing that a user writes.

The other decisions that break the API came first, so that one release takes what they break: the last of them, step
10, a view of the library's own, was rejected by the owner on 23 November 2026 (`docs/rejected.md`).

Each step names its model and effort, what it depends on, and how to tell that it is done.

## Open problems

A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a deterministic
test of it. A finding of a review goes here with its `test.failing`, until its fix removes the mark and the item. A
lead of the types has no `test.failing`: its fix adds the test of the types that holds it. The one below was found by
the inference matrix on 23 November 2026, with a case that shows it (`bun run inference --filter <case>`), where it
is a lead, "valid, but taken with other types".

- **`simulate` reads the state from what `update` returns**: with no `init` to read, the state of
  `{ ...typed, update: (message: Own) => (state: SNone) => … }` is `{ n: number }`, the literal of its steps, and not
  the `SNone` the program names (`object.spread.annotated.state`). Step 21 weighs `simulate` again.

## Next, in order

### 44. Mutations of the types

**Model and effort.** Opus 5.5, `high`: checks that the types keep the three rules of "What belongs here", in the
runner that keeps the invariants of the engine.

**Depends on** nothing. It changes nothing a user writes but where a test it adds finds a check that does not hold.

**Why.** An `@ts-expect-error` fails the typecheck (TS2578) once the check that refuses its line goes, but nothing
shows that each check of the types has such a test, nor that a test is held by its check and not by another error on
its line. The owner took this on 23 November 2026, from step 16, after a second opinion (Fable) that applied 40
mutations by hand on a copy, 14 of `src/program.ts` and 26 of `src/compose.ts`, under `tsc` 7.0: 31 were killed by the
typecheck of the tests. Held by nothing, neither the tests nor the whole matrix: `FlagsOption` with `flags` optional
(`run.test.ts` refuses `start(seeded)` alone, so `start(seeded, {})` would compile), `ObjectState` taken out of
`MakeParent` (no test has a parent whose own state is `{}`), and `Inputs<State>` reading any state (the test of
`input.test.ts` holds `Placement`, not that constraint). Held by the whole matrix alone, which runs by hand:
`makeModel: (state: State)` in `Shape`, and the second `Extract` of `TagsTaken`. Equivalent or harmless: `ObjectState`
on the place of `childById`, which `CheckedChild` repeats, the `any` branch of `TagsTaken` (read, not probed), and
`update?: never` and `runCommand?: never`, which the matrix calls harmless. The matrix replaces no test: 22 of the 40
leave its part of broken programs without a lead, and the whole matrix takes 2 minutes 15 seconds under 7.0 alone, too
long for a killer. A mutation finds no check that is missing, as api-1, api-2 and api-4 were: the matrix does that.
The guide tied to the matrix, weighed with it, was rejected for this step's fourth point (`docs/rejected.md`).

**How.**

1. **Tests for what no test holds**: the three checks held by nothing and the two held by the matrix alone, each a
   test of the types beside the tests of its function.
2. **A killer of a second kind** in `tools/mutations/`: the typecheck of the copy (`tsc` of the root project, 0.85
   seconds a run on 23 November 2026), which kills a mutation by a diagnostic in a file it names, not by a test of the
   JUnit report. `--against` compares the JavaScript emitted, and so finds every mutation of the types "the same": they
   need another comparison, or none.
3. **A mutation for each check of the types** of `program.ts` and `compose.ts`, with its killers. One that is
   equivalent is not added: the check is listed with why, in one place that `change-engine` names, since
   `docs/invariants.md` lists no checks of the types.
4. **Each mutation of a check that holds an item of "What does not compile"**, in "Anatomy of a program" and
   "Composition", names it, as `guarantees` names an item of "What you can rely on", and `bun run comments` fails on an
   item no mutation names. The other pages that say "does not compile" are not tied: the tie is a tripwire for an item
   added to the two lists, no more.
5. **The rules say it**: "Tests" in `AGENTS.md`, where a mutation is for "each check an invariant rests on", names the
   checks of the types too; `change-api` names the mutations after a change of the types; `change-engine` names the
   new killer.

A kill is checked under TypeScript 7.0 alone, as the tests of the types are in the CI: it says nothing of 5.9 and 6.0,
which the matrix checks.

**Done when** `bun run mutations` runs the mutations of the types and none survives, the five checks above have their
tests, each item of the two lists of "What does not compile" is named by a mutation, and the rules say so.

### 6. The bridges in a real browser

**Model and effort.** Opus 5.5, `medium`.

**Depends on** no other step. It is here by the owner's order, after 0.8.0 and after the decisions that break the
API: point 7 of the "Seven points of a review of the design" below weighs taking it first. The second of its two
cases is now: nothing typed with snabbdom is rejected for a draw that has not come, and what is left of it is an event
that the program's own code dispatches in the task of a notice, before its draw ("The way the bridge to snabbdom
takes", in [`write-without-was.md`](docs/records/write-without-was.md)).

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

### 8. What the premises hold, and the peer range of Effect

**Model and effort.** Fable 5.2, `high`: premises and guarantees are questioned, and a rule of `AGENTS.md` with them.

**Depends on** no other step. It comes before 1.0. Until 22 November 2026 it waited for steps 18 to 21, which change
which premises there are. Counted that day in `docs/premises.md`, by the names in each premise and not by a reading of
each: of its 37 premises, 5 are of a renderer, and of the others some 17 name `rehearse`, nearly all beside the run or
the engine. Two or three name `rehearse` alone, as that of `Channel.toPull`. So the sort below holds for the run's
guarantees before the engine changes, and step 19 sorts again the premises that it removes or moves. The first thing
this step does is to check that count by reading: if steps 18 and 19 change more than it says, this step goes back
after step 21, and the roadmap says so.

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

### 18. The engine's seams, with the run as their only user

**Model and effort.** Opus 5.5, `high`: code that keeps the invariants.

**Depends on** no other step. Since step 38, a job holds the keys alone, and the fiber of a subscription calls
`listen`, as the fiber of a command calls `runCommand`: what the engine gives that fiber is the key. It changes nothing
a user writes.

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

**Depends on** step 19. It comes before the first release that has the engine of steps 18 and 19.

**How.** As [`premise-review`](.agents/skills/premise-review/SKILL.md) says, over the changes of the engine and of
the testing tools since `v0.8.0`. The review of 21 November 2026, before that tag, has its reports in the bodies of
`1317333` on `claude/premise-review-engine-080`, `8ffc7a4` on `claude/premise-review-testing-bc87b9` and `6e90b46` on
`claude/premise-review-bridges-f28572`, which stay unmerged. Step 38 dropped the premise that a channel made by
`Channel.map` and `Channel.mapDone` runs afresh each time, which held a child's lifted subscription, cached by its
state: a parent now makes one for each start. What it did not weigh: a `listen` that returns the same channel for
every start, as `listen: () => ticks` in the examples and the guide, runs one value again at each start, and in two
runs at once, which the JSDoc of `Channel` does not state. It was so before step 38 too, with no premise listed. The
review weighs whether it is a premise of the library's, and asks the owner before one is added.

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

## Waiting for the owner

Where a step above would answer a point below, the point stays here until the step is done. Step 19 would answer point
4 of the seven. A point of the seven that is gone leaves its number unused.

- **Two points of the table of step 27** ([`given-functions.md`](docs/records/given-functions.md), "For the owner"):
  1. **An `Equal` and a `Hash` that keep Effect's laws.** The library compares keys, ids, flags and values written by
     `Equal`. No sentence says that an `Equal` a program writes must keep Effect's laws, and nothing checks one: a
     wrong one leaves the reconciling of keys and children, the cache of `forwardTo` and the skip of an equal write
     not defined. To decide: whether "Guarantees", "What is left to you" names it, beside "Flags and keys made of
     values that `Equal` compares by value", and the skill with it. For Opus 5.5, `medium`, once decided.
  2. **Whether a tool keeps the table**, as `bun run comments` keeps the `guarantees`: each function that a user gives,
     read from the declarations, would name a row. Advised against by the step: a new function of the API goes
     through `change-api`, which could ask for its row in a line. To decide: a tool, a line of `change-api`, or
     neither.

- **A child with flags has no `key`**, so it cannot start again in one step with flags equal to those it has: it
  starts again by other flags, or by a step in which it is not there. Left so by step 34, as the owner was told
  ([`kept-children.md`](docs/records/kept-children.md), "Decided, under the store"). To decide: whether a child with
  flags takes a `key` beside them.
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
  3. **What is drawn outside the root**, as `document.title`. No page says how. The readers drew the title two ways, a
     hook of the view's top vnode and a renderer over `App` beside `renderInto`. To decide: whether the guide says
     which way is the library's. Its other half, an event of the whole page, as a key pressed anywhere, is decided:
     both readers took it as a subscription to a service, and "Inputs", "What an element reports", says that it is one.

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
- **Ask Effect to document when `Stream.callback` closes the scope it gives its callback**, in general: once the
  stream ends, by the end of its queue or interrupted. The premise "`Stream.callback` closes the scope it gives its
  callback once the stream ends, however it ends" (`docs/premises.md`) rests on what its JSDoc does not say, and leaves
  the list once Effect documents it. The owner is asked before the issue is opened.
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
  changes how a document that rules is laid out. `bun run guarantees` does not replace it: it prints dozens of
  mutations under one item, where the prose pairs a sentence with its test.
- **The search laid out by guarantee.** The 21 properties of `src/interleaving.test.ts` sit in one `describe`. Each
  would go under a `describe` named by the bold title of the item of "What you can rely on" it checks, with one for
  what the guide says the search "also checks", and `bun run comments` would check the names both ways, with
  `sectionsOf` kept to that list. It ties an item to what the guide says checks it, which the `guarantees` of the
  mutations cannot, since the search kills no mutation. Not tried: a spike first, for whether every property falls
  under one item. It changes the layout of the tests of the engine, so the owner is asked (`change-engine`).
- **The reading of the guide's promises against the tests, as a skill run before a release.** The method of
  [`promises-and-tests.md`](docs/records/promises-and-tests.md), which found 65 promises outside "What you can rely on"
  that no test checks, written in `.agents/skills/` and named by `release`, as `premise-review` is. Fable 5.2, `high`,
  to write it: it decides what a release weighs. With it, the examples read against the guide, which no check does:
  each "Don't" of a page is looked for in `examples/`, and a comment of an example that gives a reason is reread when
  the rule it rests on changes.
- **A reader's check that meets what no check has met.** The six requirements of
  [`guide-reader`](.agents/skills/guide-reader/SKILL.md) are each a page of a browser with a value that is typed, and
  those that were drawn are drawn with snabbdom: each was chosen to need the pages that the guide has. The skill
  would list what a requirement may vary, and its step 3 would choose one that no earlier check had: a program drawn
  with the bridge to React, a node type with no DOM, a value that an element reports, a control that chooses among
  fixed values, tests that build their messages with constructors. And a third mode, an upgrade: coding agents upgrade
  an application that exists to the new version, from the package and its changelog alone, and report as a reader
  does. `release` would name it, for where the owner has such an application. What it finds is weighed on the
  library's own terms, as the record did. The owner is asked first: it changes a skill. Done when the skill has both.
- **A program too large for one module that is not split into children.** "Structuring a program" says that a program
  lives in one module until it is too large, and then splits into children, and that a part that the parent reads is
  no child. So the guide has no page for a large program whose parts read each other. Its parts are plain code: an
  `update` and a `makeModel` of each concern, as functions of the whole state in modules of their own, with their
  steps chained by `andThen`, which the guide shows only between a parent and a child ("Events and external
  messages"). Reasoned, from the second opinion of 22 November 2026
  ([`kept-children.md`](docs/records/kept-children.md)), and not tried: it is tried first on a copy of an example that
  is not kept, as `stocktake`, for what it costs with the types of a `Step`. Then the owner is asked: it adds to a
  rule of the guide, and an example never brings the rule that allows it (`AGENTS.md`). It is weighed against the page
  as step 36 left it: with `output` (step 35), a parent reads a value that its child declares, so "a part that the
  parent reads is no child" is written again there. Opus 5.5, `high`: a page of the guide is a specification.
- **The inference matrix crossed in pairs.** Its twelve configurations took 45 minutes on 22 November 2026, and its
  three default ones 16 minutes on 23 November, for 369,342 parts: the full product of its axes pays for most of it,
  and the order of the pieces and the annotations alone multiply every case by four. Since the forms not typed are
  judged by the rule of `AGENTS.md` ("What belongs here"), their axes may be crossed in pairs, as the axes of point 6
  of step 16 are crossed with the names (`crossings` in `tools/inference/generate.ts`), leaving time for more axes.
  Opus 5.5, `high`: what the matrix stops crossing is what it no longer checks, so the owner is asked first.

## Low priority

- **1.0.** Not before the library has been made known and used by others for at least one or two months, as the owner
  decided on 20 November 2026: only then may 1.0 be decided, with what its users have asked of the API. Until then,
  releases stay at 0.x.
