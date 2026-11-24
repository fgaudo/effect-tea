# Roadmap

What is to be done now, and nothing else. Each step names its model and effort, what it depends on, and how to tell
that it is done, and its choices are made by "Deciding" in [`AGENTS.md`](AGENTS.md), without the owner. A step done
is removed, with the reason in the commit, and leaves its number unused. An item rejected goes to
[`docs/rejected.md`](docs/rejected.md), and one deferred to its "Parked, not rejected", with what would reopen it, in
the same commit. How an item came to be is in a record of [`docs/records/`](docs/records), or in the commits, not
here.

A step for Fable 5.2 runs on Opus 5.5, `max`, while Fable is not available.

## How the steps run

One after another, in the order of "Next, in order", each in a context of its own (a workflow per step, or a session
per step), and with no question to the owner but those of "Deciding". An agent of the step's model and effort does
the step. Then an agent that wrote none of it, on Opus 5.5 at `high`, runs the checks of its "Done when" and reads its
diff against "Deciding" and the step; the first agent fixes what it finds, twice at most, and a step whose checks
still fail stops the chain, with a report. A step ends in one local commit, with its decisions in the body, and takes
itself out of this file. Before each step, the use of the owner's plan is read where a tool reports it: a step that
the rest of the week cannot pay for waits for the reset.

## Open problems

A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a deterministic
test of it. A finding of a review goes here with its `test.failing`, until its fix removes the mark and the item. A
lead of the types has no `test.failing`: its fix adds the test of the types that holds it, and a lead of the inference
matrix is shown by its case (`bun run inference --filter <case>`).

- **A tag that throws as a tool names its message replaces the tool's error with what it threw**: `doesNothing`
  and `describeAll` (`rehearse.ts`), and `unexpectedRejection` (`unexpected.ts`), which `simulate` fails with on a
  rejection, call `describeByTag` with no guard, in the call's fiber. Found by the review of step 20, on 24 November
  2026, in `rehearse`, and untested. Step 52 left the error of a rejected message to the tool that calls
  `outcomeOf` (`stage.ts`), so each is built in the call that fails: step 53 takes them.
- **`rehearse` waits for ever on a key whose printing throws**: a `hearNext` waits on a key whose `toJSON` and
  `toString` throw, and a `send` takes the key away. The fiber of effects tells the calls that waited (`released` in
  `rehearse.ts`) with an error it builds at once, `stoppedWhileWaiting(key)`, whose `Inspectable.toStringUnknown`
  falls back to `String` and throws, as its JSDoc says: the fiber of effects dies there, before the job's starts and
  every later job, and the `send`, which waits for a job that tells after its own (`outcomeOf`, not raced with a
  death), waits for ever, and so does the rehearsal. With a key that prints, it ends at once. It breaks "It throws
  nothing" of `released` and `Engine.after`, and "The testing tools behave like the engine": the run never prints a
  key. Its `test.failing` is "a hearNext stopped as its key goes away fails the test, and the rehearsal ends"
  (`rehearse.test.ts`). Found by the review of step 20, on 24 November 2026, and run. Of the same form, untested: the
  job of a `hearNext` builds `hasEnded(call.key)`, and `openFor` the error of a start `hear` played, in the `done` of
  `Engine.after`; the end's `stoppedWhileWaiting` fails the rehearsal's fiber with the throw. The form is that of the
  item above it, a value of the program printed outside its functions with no guard: step 53 fixes both by that form.

## Next, in order

Steps 56 to 58 make the project cheaper to keep, and steps 59 and 60 then make its API right, when a name changes the
fewest documents. The steps of the engine, 53 to 55, come after them, since the review of the API may reshape the
testing tools they change, and step 55 comes before the release that follows them all.

### 56. The guide promises only its rules

**Model and effort.** Fable 5.2, `high`: what the library promises is decided, page by page.

**Depends on** no other step. It takes the place of step 48, which weighed the descriptions one by one.

**Why.** Today every sentence of the guide outside "Precisely" is a promise, and a description is as true as one, with
a test, and a changelog entry where a user can notice (`AGENTS.md`, "The guide is a specification, of two strengths").
So a rule lives in several places that must agree, each rewording is checked sentence by sentence, and a change of the
engine may break a promise or a description that no user rests on. More promises make each upgrade harder for users,
and each change dearer for the project (values 3 and 7 of "Deciding").

**How.**

1. The guide promises what stands under the "Rules" of a page, under "What you can rely on" in "Guarantees", and in
   the types. The rest of a page explains, and binds nothing. What is not promised is unspecified, as Effect says of
   what it does not promise (Effect-TS/effect#10878): it has no test of its own, and no changelog entry when it
   changes. "What is left to you" keeps the rules that nothing checks.
2. Each "Precisely", and each sentence that says it is described and not promised, is sorted. What a user rests on
   (what a testing tool fails on, what a defect reports, what a test written by the guide needs, as the number of an
   instance) goes under the "Rules" of its page, as a promise. Advice goes under "Do and don't". How the engine does
   it today goes, or is said in a few words to be unspecified. A page whose rules stand under other headings gets a
   "Rules". [`guide-descriptions.md`](docs/records/guide-descriptions.md) sorted the 87 descriptions as they stood on
   24 November 2026: a start, to be checked against the code.
3. `AGENTS.md` ("The guide is a specification, of two strengths", "A rule of the guide is added last") and the guide's
   "What a page promises" say the rule of point 1, once each. A rule is stated where it rules, and other places link
   to it.
4. A test or a mutation that holds only what is no longer promised goes, unless it holds an invariant of
   `docs/invariants.md` (`change-engine`). A mutation's `guarantees` names an item of "What you can rely on", and its
   `refuses` an item of what does not compile, wherever that list then stands (`tools/comments.ts`).
5. The doc comments and the skill that name a section changed are reread (`bun run comments`).
6. A promise taken back is `**Breaking**` in the changelog, with how to upgrade, and a promise added is an entry
   (`release`).

**Done when** the guide promises only under "Rules", in "What you can rely on" and by the types; no page describes how
the engine works inside but as unspecified; `AGENTS.md` and "What a page promises" say so; the changelog has what a
user notices; and `bun run comments`, `bun run lint`, `bun run test`, `bun run test:node` and `bun run mutations` pass.

### 57. The points left for the owner, decided

**Model and effort.** Opus 5.5, `high`: each point is a decision of the engine, of a bridge or of the guide, with its
change.

**Depends on** step 56: a point that adds to the guide adds a promise under "Rules", or an explanation that binds
nothing, by the rule that step leaves.

**Why.** Each point below was left for the owner, as the rules of the time asked. "Deciding" leaves it to the agent.

**How.** For each point, read its precedents (`docs/rejected.md`, the record it names), decide by the values of
"Deciding", and do what the decision asks, by the skill that the change needs (`change-engine`, `change-api`,
`add-example`). A point decided against a change leaves with its line in the commit, or goes to `docs/rejected.md`
where it weighed a design. Points of one form are decided together.

- **Two points of the review of the premises of step 20** (24 November 2026), whose reports are the bodies of
  `b6793dc` on `claude/premise-review-engine-20-badc4f` and `2c0862a` on `claude/premise-review-testing-20-d42368`:
  1. **A `listen` that gives the same channel for every start**, as `listen: () => ticks` in the examples and the
     guide's "Subscriptions", runs that one value again at each start of its key, and at once for two keys. The
     library rests on it, and the JSDoc of `Channel` in Effect 4.1.5 does not state it: it is the premise that 04eb7b4
     dropped, of a channel that `Channel.map` makes, now of the user's value. A test of Effect alone passes (one value
     of `Channel.fromIterator(…).pipe(Channel.concatWith(…))` drained twice in turn and twice at once through
     `Channel.toPull`). To decide: list it in `docs/premises.md` with that test, or ask a `listen` to make its channel
     anew, which changes the guide's form.
  2. **A new state whose `subscriptions` dies is the current one, and no listener is told of it**: `applyOne` sets
     `current`, then returns on the defect before `tell` (`engine.ts`). The guide promises, outside "Precisely", that
     "`subscribe(listener)` tells `listener` of each new state, once it is the current one" (`running.md`), and so do
     the doc comments of `App.subscribe` (`run.ts`) and `Engine.subscribe` (`engine.ts`); "after a defect" there says
     only that `onApplied` "may have heard a step whose model is never drawn". A renderer that draws in its listener
     shows the state before, while `model()` gives the new one. To decide: tell the listeners of that state too, leave
     `current` as it was, as a defect of `onApplied` does, or state the exception in `running.md` and the two doc
     comments.
- **Two points of the table of step 27** ([`given-functions.md`](docs/records/given-functions.md), "For the owner"):
  1. **An `Equal` and a `Hash` that keep Effect's laws.** The library compares keys, ids, flags and values written by
     `Equal`. No sentence says that an `Equal` a program writes must keep Effect's laws, and nothing checks one: a
     wrong one leaves the reconciling of keys and children, the cache of `forwardTo` and the skip of an equal write
     not defined. To decide: whether "Guarantees", "What is left to you" names it, beside "Flags and keys made of
     values that `Equal` compares by value", and the skill with it.
  2. **Whether a tool keeps the table**, as `bun run comments` keeps the `guarantees`: each function that a user gives,
     read from the declarations, would name a row. Advised against by the step: a new function of the API goes
     through `change-api`, which could ask for its row in a line. To decide: a tool, a line of `change-api`, or
     neither.
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
- **The skill's "Rules that nothing checks" does not say that the state is ahead of its effects**, found by the session
  that rewrote the guide for the swap, and by point 5 of a review of the design of 20 November 2026, by the session
  that verified the stages of `synchronous-dispatch.md`. A step's commands start in a later job, and the end drops the
  jobs not taken, so a test that ends once the state shows something may end before the commands of that step start.
  The guide says it ("Guarantees", "Testing tools"), as a description, and so does the doc comment of `drive`. A coding
  agent that writes a test with `drive` meets it first. The reader's check bears on it: an examiner that had not seen
  the library wrote 27 acceptance tests from the requirement, and seven of them took the world to be in step with the
  page; and the reader of the guide alone met the rule as a test that timed out. To decide: whether the skill names it.
- **The whole pure step runs in the event that sends the message**, point 6 of the same review: `update`, `onApplied`,
  `subscriptions` with the lookup of every key, the listeners and, with React, `makeModel`. It was measured for a
  counter with no key alone. The guide promises that a model is made only when it is read, and describes that React
  reads one for each state. To do before the release: measure a step with many keys and a model that costs (the
  benchmark of "Any time"). Reasoned from the code, and not run.
- **A listener of the `App` that sends on every notice never returns, and no page says so.** Found on 21 November
  2026, from the memory guard of the tests: two helpers of `compose.test.ts` did it under a mutation, and filled the
  memory of the machine. A message that a listener sends is applied right after the step that told it ("View"), in the
  loop of the outermost call and not in a call inside it. So a listener that answers each new state with a message
  that makes another loops with no stack to overflow, and no defect says so. Only code that subscribes to the `App`
  itself reaches it: a bridge, or a helper of a test. The bridge to snabbdom draws in a microtask, where a hook that
  sends on every draw would loop by microtasks, outside the run: reasoned, not run. To decide: whether "Guarantees"
  says it under "Nothing is bounded, and nothing times out", of which it is a case, and whether "Writing a bridge"
  names it. Weighed by the session that found it, and advised against: a bound on the messages applied in one call,
  with a defect past it. It adds an export, and a number that nothing gives, for the few who write a listener, where
  the guide says that nothing is bounded.

**Done when** each point is decided and done, each decision is a line of the commit, and the checks that `AGENTS.md`
asks for what changed pass.

### 58. The documents within their budgets, and less bookkeeping

**Model and effort.** Opus 5.5, `high`: what the documents that rule say is kept, in fewer words, and the tools that
check them may change.

**Depends on** steps 56 and 57, which change what the guide, `AGENTS.md` and the skills say.

**Why.** About 245,000 words of Markdown, 134,000 of them in the records, stand beside 7,264 lines of source, and a
change rereads each place that states its rule (value 7 of "Deciding").

**How.** Each rule has one place, and other places link to it, in plain English, as the guide is written:

- `AGENTS.md` near 150 lines: what a tool enforces is named, not explained, and a reason or a story goes to
  `docs/rejected.md` or to a record.
- `docs/invariants.md`: each invariant and how it is kept, in a few lines. The tests that hold each check are left to
  `tools/mutations/mutations.ts`, which a tool checks, and are not listed again in prose.
- `docs/premises.md`: each premise, its test, and what Effect says of it, in a few lines.
- `docs/rejected.md`: each entry a short paragraph (what, why, on what evidence, and "Reopen if"), with a link where a
  record has the rest; "Parked, not rejected" alike.
- The skills: what a tool runs is named, not told again, and each says only what an agent needs for its task.
- A record, from now on, is for a decision on the API or on an invariant, and is a page at most. The records written
  stay as they are: history.
- What is kept in step by hand between the checks goes where a tool keeps it, or goes.

**Done when** `AGENTS.md` is near 150 lines, each document above is as its line says, no rule is stated twice but by a
link, and `bun run comments`, `bun run lint` and `bun run test` pass, with `bun run mutations` where `tools/` changed.

### 59. The API reviewed, by its names and its surface

**Model and effort.** Fable 5.2, `high`: the shape of the API is decided, with constraints that pull apart.

**Depends on** step 58: a name changed after it changes fewer documents.

**Why.** Users judge the library by its API first (value 3 of "Deciding"). The core exports 63 names, 54 of them
types, and the testing tools 13. Before 1.0 a break costs little, and the breaking changes of this step go out with
the release that follows step 55.

**How.** Read each export of the five entries as a user meets it (`api/*.api.md`, the doc comments, the guide and its
glossary), read "The API" of `docs/rejected.md`, and decide by the values of "Deciding":

- one word for each concept, and one concept for each word, the glossary as the dictionary; a name says what the
  thing is to a user, not how it is made;
- the same role in the same form: families named alike, and tools that are alike called alike, with results alike;
- the surface a user sees: what a user writes first, and the types that only name what the declarations need, kept
  out of the way where the compiler allows it (`AGENTS.md`, "A type for how a consumer's types print").

Leads, seen on 24 November 2026 and not weighed yet:

- `ProgramMaker`, `MakeProgram`, `ParentMaker`, `MakeParent` and `DeclareChildren` name the stages of `program` for
  the declarations, beside what a user writes.
- The testing tools: `simulate`, `rehearse` and `drive` are three metaphors whose names do not say how they differ.
  `simulate(program)(messages, step)` and `applyAll(update)(messages, from)` are called in two steps,
  `rehearse(program, scenario)` and `dispatchViolations(update, { … })` in one. What a scenario acts with is a
  `Driver` in `drive` and a `Rehearsal` in `rehearse`, while a `Simulation` is a result.
- `Interpreter` is the part `runCommand` of a program, and `ExternalHandler` the part `external`: twins, named in two
  ways.
- `update` rejects with `reject`, and the option that hears it is `onIgnored`.
- `ObjectState` on the places of `child` and `childById`: its mutations, on 23 November 2026, changed nothing that
  compiles, since `CheckedChild` refuses the same states through `ProgramChecked`, and the four were there before it
  was (`tools/mutations/mutations.ts`, at the head of the mutations of the types). Before it goes: which error a user
  sees for a child whose state is a number, with it and without, and the smoke test's count.
- A child with flags has no `key`, so it cannot start again in one step with flags equal to those it has: it starts
  again by other flags, or by a step in which it is not there ([`kept-children.md`](docs/records/kept-children.md),
  "Decided, under the store"). Whether a child with flags takes a `key` beside them.

The decisions go in a record, `docs/records/api-review.md`, of a page or two: each export kept or changed, with its
new spelling, and what was weighed and left.

**Done when** the record gives each export of the five entries its decision, and each lead above is decided.

### 60. The API as step 59 decided

**Model and effort.** Opus 5.5, `medium`: the changes follow the record, across modules.

**Depends on** step 59.

**How.** Each change of the record, by `change-api`: the code, the tests, the doc comments, the guide, the tutorial,
the examples, the skill, the reports of the API, the inference matrix and the smoke test. The changelog takes each
under the unreleased section, a `**Breaking**:` with its `Upgrade:` (`release`), so that one release carries them all.

**Done when** the API is the record's, and `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:node`,
`bun run comments`, `bun run build`, `bun run api --check`, `bun run smoke` and `bun run inference` pass, with
`bun run mutations` where the types of `program.ts` or `compose.ts`, or the engine, changed.

### 53. In `rehearse`, the fiber of effects tells data, and the call makes the error

**Model and effort.** Opus 5.5, `high`: a fix by its form, in the largest tool.

**Depends on** step 60, which may rename the tools it changes. Step 52 left the code where it stays, what `rehearse`
and `simulate` share in `src/testing/stage.ts`, and what `rehearse` hears in `rehearse.ts`. It waits because only a
key whose printing throws, or a message whose tag does, meets it.

**Why.** Two findings of "Open problems", of one form: a value of the program, or of the test, printed where what it
throws is not the call's. `released`, the job of a `hearNext` and `openFor` build an `Error` with
`Inspectable.toStringUnknown(key)` in the fiber of effects, inside a `done` of `Engine.after` that "throws nothing": a
key whose printing throws ends that fiber, and every call that waits for a job waits for ever. `doesNothing`,
`describeAll` and `unexpectedRejection` call `describeByTag` with no guard, and a tag that throws takes the place of
the tool's error.

**How.** A call of `hearNext` is told data: the message it heard, that its start has ended, or that it was stopped.
`heard` is completed with a value, never with a defect, and the fiber of the call makes the error of it. What the job
of a `hearNext` decides (`openFor`) is data too, which the call turns into its effect. So nothing that runs in the
fiber of effects, or at the end, builds a text. One function says how a tool names a value in its own errors, a key or
a message by its tags. What it does when the value throws as it is named is decided before it is written, by
"Deciding": the run's rule for a defect is that neither is lost (`recordThrown`), and here the first of the two is a
failure of the test, no defect of the program. The other half of the item, a call's wait for its job raced with a
death, has no case once nothing throws in the fiber of effects: `docs/invariants.md` says so, or the race is written
if a case is found.

**Done when** "a hearNext stopped as its key goes away fails the test, and the rehearsal ends" (`rehearse.test.ts`)
passes unmarked; a test of the same form holds each other place that the item names (the job of a `hearNext` on a
start that has ended, a start that `hear` played, the end), and one holds a tag that throws in `doesNothing`, in
`describeAll` and in `unexpectedRejection`; each check has its mutation; both items leave "Open problems"; the
changelog has the fix, by `release`; and the checks of `change-engine` pass.

### 54. The rule as a boundary: a tool decides when, never what

**Model and effort.** Opus 5.5, `high`: a rule of `AGENTS.md` and of `docs/invariants.md` said again, each sentence
checked against the code.

**Depends on** step 53. Since steps 50 to 52, `src/testing/` uses none of the six: what it takes of `shell.ts` is
`makeDeaths`, `startFiber`, `commandFiber` and `stopping` (`drive.ts`, `rehearse.ts`, `simulate.ts` and `stage.ts`),
so the check passes once it is written.

**Why.** After them, each tool that plays a program runs it on the engine, and "when the engine or one tool changes,
keep the others in step" (`AGENTS.md`, `docs/invariants.md`, `change-engine`) is a duty with nothing left to keep.
What keeps the tools aligned is then a structure, which a check can hold where a duty could not.

**How.**

1. A check, in `bun run lint`, that fails when a module of `src/testing/`, its tests aside, uses `Core.arrive`,
   `Core.reconcile`, `diesIn`, `scopedIn`, `rootedIn` or `runSubscription`. The library's modules are imported as
   namespaces, so `no-restricted-imports` cannot name a member: either `src/testing/` is forbidden `core.ts` and
   `shell.ts` whole, and takes what it may use from `engine.ts` and `run.ts`, or a script reads the uses, as
   `tools/comments.ts` reads the doc comments. The smaller of the two, seen to fail on a use put back by hand.
2. The rule said as it then is, in `AGENTS.md` ("Invariants"), in `docs/invariants.md` ("The testing tools behave like
   the engine") and in `change-engine` (point 4 of "Before the change"): a tool that plays a program runs it on the
   engine; it decides when a command runs, when a subscription's message is heard and what fails the test; and it
   makes no step, no scope and no site of a defect.
3. The contract, `contract.test.ts`, read case by case: a case that gives a tool what the engine alone now does is
   held by the engine's tests and mutations. Each stays as an alarm or goes, by "Deciding", and none goes that a
   mutation still names as its killer.
4. The guide's "Testing tools" says "as the run does" of each tool already: it changes only if a sentence is found
   that the code no longer keeps, and then as `AGENTS.md` says.

**Done when** the check runs in `bun run lint`, and was seen to fail on a use put back by hand; the three documents
say the rule; each case of the contract is kept or removed, with its line in the commit; and `bun run comments`,
`bun run lint`, `bun run test`, `bun run test:node` and `bun run mutations` pass.

### 55. The review before the release

**Model and effort.** Opus 5.5, `high`, by a reviewer that wrote none of the changes
([`premise-review`](.agents/skills/premise-review/SKILL.md)).

**Depends on** steps 56 to 60, 53 and 54, and comes before the release that follows them.

**Why.** Steps 49 to 54 move a check from a tool to the engine, or take one away with the code it guarded: a premise
may leave with it, and no test fail. From step 52 on, `simulate` rests on the engine's premises, and no longer on
those of a fork of its own. Steps 56 to 60 change what the guide promises, and how the API is written.

**Done when** the review has read the engine and the testing tools over the changes since the last review; each
finding is an item of "Open problems" with its `test.failing`; each place where the code or a document says otherwise
is set right; `docs/premises.md` says what `simulate` rests on; and the checks of point 1 of "Releasing", in
`release`, pass.

## For the owner

What leaves this machine, or decides what the project is ("Deciding" in `AGENTS.md`): an agent prepares it, and the
owner does it.

- **The release that follows step 55.** An agent prepares its commit and its tag (`release`) when the owner asks for
  it, and the owner pushes them and publishes the package.
- **1.0.** Not before the library has been made known and used by others for at least one or two months, as the owner
  decided on 20 November 2026: only then may 1.0 be decided, with what its users have asked of the API. Until then,
  releases stay at 0.x.

### 47. Ask Effect to document what the library rests on

**Model and effort.** Opus 5.5, `high`, for the drafts: each request states a general rule of Effect, true of its
source.

**Depends on** no other step. Step 46, which weighed the guarantee of an interruption by the program, was closed on 24
November 2026 with the guarantee kept: its two premises stay in `docs/premises.md`, and are asked here.

**Since the upgrade to Effect 4.1.5** (23 November 2026), its JSDoc documents seventeen of the thirty-one premises on
Effect, which left `docs/premises.md` with their tests: what `FiberSet.run` and `FiberMap.run` promise of the fiber
they fork, a fork's region and `startImmediately`, the cleanup of `Effect.onExit`, the order of a scope's finalizers, a
handler that an interrupted fiber skips, the annotations of `Fiber.interruptAs`, the races, `acquireUseRelease`,
`suspend`, `Fiber.await`, and the clock of a timeout and its default. Thirteen are left to ask, the scheduler's aside.

**Why.** A behaviour that a stable API documents is no premise (`docs/premises.md`, the rule after the list): Effect
keeps it within the major, and a change of it is Effect's to announce. It is the one way a premise leaves the list
with nothing of the library changed, and what would reopen the caret (`docs/rejected.md`, "A caret as the peer range of
Effect").

**How.** Each premise on Effect, in the order of the sort: those that hold a guarantee, the broad ones first; then
the where and the order of a defect; then the testing tools'. A request asks for the general rule, never for the
library's case: when a scope runs its finalizers, not that the engine's end runs before its sets close. Read first
whether the JSDoc of the newest Effect says it already (`upgrade-effect`, step 4 of "Upgrading Effect"), what
effect.website and the `ai-docs` of the package say of it, and whether an issue asks it: the request cites what they
say, as Effect-TS/effect#10719 cited the website, since a maintainer reads it with them in mind. A request is an issue,
or a pull request of the JSDoc alone where the rule is a sentence. An agent drafts each, with its text, and the owner
opens it, in the owner's name. That of `Stream.callback` is one of them, as a case of the scope a stream runs in. The
premise of the scheduler of the tests, and that of the JavaScript engine, are not asked.

**Asked on 24 November 2026**, before step 46 was closed, in Effect-TS/effect#10877, after the two requests answered
(Effect-TS/effect#10667 by Effect-TS/effect#10683, and Effect-TS/effect#10719 by Effect-TS/effect#10731). What the
first answer chose not to promise is not asked again: a rule for callbacks that throw, `run` on a closed container,
when a loser is interrupted, how the failures of cleanups combine, and the turn of a deferred fork. The second took all
eight rules of its request. So #10877 asks four rules, each checked on `effect@4.1.5` on every function it names, and
holds five premises, which name it:

- the scope a stream runs in: a run function makes one of its own, closed before the run completes however the stream
  ends, and a pull runs in the scope it is given, while `Stream.toQueue` and `Stream.toPubSub` run the stream as a run
  function does; `callback`, `Channel.callbackArray` and `unwrap` give their effect that scope, and
  `Channel.acquireRelease` its release; `scoped`, `ensuring`, `onExit` and `Channel.acquireUseRelease` release as their
  part ends by itself, and a part that what follows it stops (`Stream.take`, a later operator that dies) with the scope
  the stream runs in, so under a pull only as its scope closes, a difference it asks about. It holds the premises of
  `Stream.callback` and of `Channel.toPull`;
- an external span records nothing (`tracerLogger`, `annotateCurrentSpan`, `currentSpan` under one);
- a logger of `Logger.make`, or derived with `Logger.map` or `Logger.withConsoleLog`, runs synchronously in the fiber
  that logs, and dies there with what it throws, asked of loggers alone, as the first answer wrote one for `suspend`;
- `HashMap`, `HashSet`, `MutableHashMap` and `MutableHashSet` call `Equal` and `Hash` only during a call: not a rule of
  `Equal`, since a `FiberMap` compares a key in a fiber's observer.

Its draft read the JSDoc alone: the rule above on effect.website and `ai-docs` came after it, and they were read once it
was opened. Of its four rules, only the scope of a stream has a word there, the example of `Stream.callback` in
`ai-docs`, which its premise names; the site shows streams that release, and says nothing of which scope or when.

Not asked: the three premises of how the failures of cleanups combine (`Effect.onExit`, `Effect.scoped`, `Scope.close`)
and that of a `Deferred` resuming on the stack of whoever completes it, which fall under what the first answer
declined; and those of what a `Queue` and the runtime keep, whose fall would be a leak that Effect fixes as a bug.

**Still to ask**, since step 46 kept the guarantee that rests on them: what `Effect.interruptible` fails with, entered
by an interrupted fiber where it is uninterruptible (the second half of its premise; the first half holds only what
the guide describes), and the fiber that code run on the stack of its forker sees as its own. Each is read first
against what the first answer declined, as the others were.

**Done when** each premise on Effect names, in `docs/premises.md`, the request that the owner opened for it, or says
that none was asked and why. A premise leaves the list by an upgrade to the Effect that documents it
(`upgrade-effect`).

## Any time

None of these waits for the steps above, nor holds them up. Each is for Opus 5.5, `medium`, but where it says
otherwise.

- **What a real browser has not run of the bridges.** The bridges' tests run in Chromium, Firefox and WebKit
  (`bun run test:browsers`, a job of the CI). Firefox runs in the CI alone: on the owner's Windows machine,
  Playwright's Firefox does not start ("side-by-side configuration is incorrect"). An IME is driven in Chromium alone,
  through its protocol: Playwright drives none in Firefox or WebKit, so a composition there is not run. With React, not
  run: `startTransition` or `useDeferredValue` in the application, Fast Refresh (likely to restart the run, as
  `<Activity>` does), and hydration: the guide promises that `Host` and `Draw` draw the first model on a server, run
  under `renderToString`, and nothing of hydration until `hydrateRoot` is run in a browser.
- **The search comes near the bound of the memory guard.** `test/memory-guard.test_worker.ts` says the heaviest file
  of the suite holds under a gigabyte, but `src/interleaving.test.ts` reached 980 to 1568 MB at its peak on 24 November
  2026 (six runs before step 50 and six after it, measured from a worker as the guard measures, the peaks before no
  lower), and the guard ended 2 runs of `bun run interleavings` in 14 after it, at 2050 and 2069 MB, and none of 6
  before. Whether the search holds what it no longer needs (a history kept by fast-check, a scheduler's log), or the
  bound is too low for it; never a bound raised without knowing which.
- **The README says what the library is and for whom, and names Foldkit**, as the owner's decision of 20 November
  2026 asks ([`adoption.md`](docs/records/adoption.md)): one reader starts a new application, the other has one
  already, most often in React.
- **A benchmark that runs in the CI.** Many children, many messages per second, to keep what a message costs the event
  that sends it, and a model made only when it is read, from regressing. `bun run bench`
  (`tools/bench/subscriptions.ts`) measures a parent's subscriptions only, and `tools/bench/writes.ts`, run by hand,
  what a write into an input and a dispatch with its model read cost; neither runs in the CI. A CI machine's times
  vary, so what fails is a count that does not: how often `makeModel` runs, how many keys one message reconciles.
- **A devtools bridge over `onApplied`** (e.g. Redux DevTools), with time travel through `init: { state }` and
  replay through `applyAll`.
- **An example of routing**: flags from the URL, `popstate` as a subscription, navigation as a command.
- **An example of hot module reloading** that keeps the state, which the guide hints at (the view lives in a
  module of its own) without showing.
- **An example of saving each state before its commands start**, which the guide names ("Running", "Work that must
  wait goes to the effects of the program") without showing: `onApplied` offers the state and its revision to a
  queue, a fiber of whoever runs the program saves it, and a wrapped `runCommand` waits until the state its step
  heard is saved.
- **The search laid out by guarantee.** The 21 properties of `src/interleaving.test.ts` sit in one `describe`. Each
  would go under a `describe` named by the bold title of the item of "What you can rely on" it checks, with one for
  what the guide says the search "also checks", and `bun run comments` would check the names both ways, with
  `sectionsOf` kept to that list. It ties an item to what the guide says checks it, which the `guarantees` of the
  mutations cannot, since the search kills no mutation. Not tried: a spike first, for whether every property falls
  under one item. It changes the layout of the tests of the engine (`change-engine`).
- **The reading of the guide's promises against the tests, as a skill run before a release**, once step 56 has left
  the promises it keeps. The method of [`promises-and-tests.md`](docs/records/promises-and-tests.md), which found 65
  promises outside "What you can rely on" that no test checks, written in `.agents/skills/` and named by `release`, as
  `premise-review` is. Fable 5.2, `high`, to write it: it decides what a release weighs. With it, the examples read
  against the guide, which no check does: each "Don't" of a page is looked for in `examples/`, and a comment of an
  example that gives a reason is reread when the rule it rests on changes.
- **A reader's check that meets what no check has met.** The six requirements of
  [`guide-reader`](.agents/skills/guide-reader/SKILL.md) are each a page of a browser with a value that is typed, and
  those that were drawn are drawn with snabbdom: each was chosen to need the pages that the guide has. The skill
  would list what a requirement may vary, and its step 3 would choose one that no earlier check had: a program drawn
  with the bridge to React, a node type with no DOM, a value that an element reports, a control that chooses among
  fixed values, tests that build their messages with constructors. And a third mode, an upgrade: coding agents upgrade
  an application that exists to the new version, from the package and its changelog alone, and report as a reader
  does. `release` would name it, for where the owner has such an application. What it finds is weighed on the
  library's own terms, as the record did. Done when the skill has both.
- **A program too large for one module that is not split into children.** "Structuring a program" says that a program
  lives in one module until it is too large, and then splits into children, and that a part that the parent reads is
  no child. So the guide has no page for a large program whose parts read each other. Its parts are plain code: an
  `update` and a `makeModel` of each concern, as functions of the whole state in modules of their own, with their
  steps chained by `andThen`, which the guide shows only between a parent and a child ("Events and external
  messages"). Reasoned, from the second opinion of 22 November 2026
  ([`kept-children.md`](docs/records/kept-children.md)), and not tried: it is tried first on a copy of an example that
  is not kept, as `stocktake`, for what it costs with the types of a `Step`. The rule of the guide that it adds comes
  first, since an example never brings the rule that allows it (`AGENTS.md`). It is weighed against the page as step
  36 left it: with `output` (step 35), a parent reads a value that its child declares, so "a part that the parent reads
  is no child" is written again there. Opus 5.5, `high`: a page of the guide is a specification.
- **The inference matrix crossed in pairs.** Its twelve configurations took 45 minutes on 22 November 2026, and its
  three default ones 16 minutes on 23 November, for 369,342 parts: the full product of its axes pays for most of it,
  and the order of the pieces and the annotations alone multiply every case by four. Since the forms not typed are
  judged by the rule of `AGENTS.md` ("What belongs here"), their axes may be crossed in pairs, as the axes of point 6
  of step 16 are crossed with the names (`crossings` in `tools/inference/generate.ts`), leaving time for more axes.
  Opus 5.5, `high`: what the matrix stops crossing is what it no longer checks.
