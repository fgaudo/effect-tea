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
[`program-forms.md`](docs/records/program-forms.md)), and of the two it left to the owner, the one taken was step
44, the mutations of the types, done the same day. Steps 22 to 31 come from
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
`messagesSentBy` gives a handler, and step 43, `volume`'s press as its example, are done. Steps 45 to 47 come
from step 8, done on 23 November 2026 ([`premises-and-range.md`](docs/records/premises-and-range.md)): the owner kept
the tilde, refused guards against each premise, and took what lets the library rest on less of Effect, and learn of a
fall sooner: step 45, the job that tests the build of Effect's `main` before it is released, was done on 24 November
2026, and step 46, the guarantee of an interruption by the program weighed again by what it rests on, was closed by
the owner the same day with no spike and the guarantee kept, once Effect 4.1.5 had left two of its six premises
(`docs/rejected.md`, "Leaving 'Only the run, and whoever runs it, interrupt them' to the program"). Step 48 comes from
a review of the guide's descriptions that the owner asked for on 24 November 2026, once Effect's answer to
Effect-TS/effect#10877 showed how Effect documents what it does not promise
([`guide-descriptions.md`](docs/records/guide-descriptions.md)). Steps 49 to 55 come from the owner's question, on 24
November 2026, of how the testing tools and the run could be aligned by construction
([`tools-on-the-engine.md`](docs/records/tools-on-the-engine.md)): it answered step 21, `simulate` weighed again,
which is closed, with `simulate` to run over the engine in step 52. A step done leaves its number unused.

The owner asked on 22 November 2026 for the order to be weighed again, and took this one, by what a user of the
library meets:

1. the engine, steps 49 to 55, the testing tools on the engine, which the owner put first on 24 November 2026, and
   which change nothing that a user writes (step 19, `rehearse` over the engine, and step 20, the review of the
   premises of steps 18 and 19, were done that day, and step 21 was closed). Among them, by what a test meets today,
   then by what each rests on: step 49, a wait of `drive` that skipped a state, which a test with two waits met, was
   done on 24 November 2026; step 50, what the fiber of a command and that of a start run, written once in
   `shell.ts`, step 51, `rehearse` on the handle of the run, and step 52, `simulate` over the engine, which closed a
   finding by its form, were done the same day; step 53, a rehearsal that waits for ever, which only a key whose
   printing throws meets; step 54, the rule as a check; and step 55, their review;
2. the strength of what the guide says, step 48, added on 24 November 2026 and put after the engine by the owner the
   same day;
3. what the library rests on of Effect with no promise, step 47, put last by the owner on 24 November 2026. The peer
   range, step 8, stayed a tilde on 23 November 2026: a version published keeps its range, so one that a later Effect
   breaks could still be installed.

The checks came first: step 44, of the types by mutations, and step 6, of the bridges in a real browser, are done.

The other decisions that break the API came first, so that one release takes what they break: the last of them, step
10, a view of the library's own, was rejected by the owner on 23 November 2026 (`docs/rejected.md`).

Each step names its model and effort, what it depends on, and how to tell that it is done.

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
- **A search that runs, once the run has settled, is not that of the text the field holds**: `bun run interleavings`
  failed on 23 November 2026 in "a search runs for the text of the field while it holds one, and starts once for each
  text it holds", at its second check (no search started twice passes), with `seed: -1335866316` and `path:
  "21:0:1:1:1:1:1:1:4:4:4:8:6:6:6:16:6:16:16:18:19:21:20:23:18:18:18:21:20:19:19:20:20:22:23:25:24:24:29:26:24:26:26:25:26:24:24:24:24:24:25:25:46:19:19:3:0:16:0"`.
  Given them, the property fails again alone, with nothing else running; the run that found it changed no code that
  runs. The review of step 20 met it again, with `seed: -714533539` (its path is in the body of `b6793dc`, on
  `claude/premise-review-engine-20-badc4f`). Not yet weighed under the `'inline'` mode of resumption (`change-engine`,
  "A lead of the search"). The checks of step 51 met it again on 24 November 2026, with `seed: -1146477803` and `path:
  "43:0:0:0:0:6:4:7:7:13:9:10:9:10:9:9:11:9:9:9:10:9:9:9:9:9:9:9:9:11:10:10:12:0:1:0:17:15:13:13:15:17:17:21:16:16:15:15:17:15:17:16:19:19:15:18:19:19:20:19:19:18:21:18:18:19:23:33:24:24:24:32:33:33:33"`,
  and given them, alone, it failed once of four runs on `2dfa460`, before that step, and passed four of four with
  it: what decides it is not the seed and the path alone. The property runs on `start` alone, which that step did not
  change but for how `runCommand` and `listen` reach the engine. Opus 5.5, `high`.

## Next, in order

### 53. In `rehearse`, the fiber of effects tells data, and the call makes the error

**Model and effort.** Opus 5.5, `high`: a fix by its form, in the largest tool.

**Depends on** no other step: step 52 left the code where it stays, what `rehearse` and `simulate` share in
`src/testing/stage.ts`, and what `rehearse` hears in `rehearse.ts`. It waits because only a key whose printing throws,
or a message whose tag does, meets it.

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
a message by its tags. What it does when the value throws as it is named is decided with the owner before it is
written: the run's rule for a defect is that neither is lost (`recordThrown`), and here the first of the two is a
failure of the test, no defect of the program. The other half of the item, a call's wait for its job raced with a
death, has no case once nothing throws in the fiber of effects: `docs/invariants.md` says so, or the race is written
if a case is found.

**Done when** "a hearNext stopped as its key goes away fails the test, and the rehearsal ends" (`rehearse.test.ts`)
passes unmarked; a test of the same form holds each other place that the item names (the job of a `hearNext` on a
start that has ended, a start that `hear` played, the end), and one holds a tag that throws in `doesNothing`, in
`describeAll` and in `unexpectedRejection`; each check has its mutation; both items leave "Open problems"; the changelog has the fix, by `release`;
and the checks of `change-engine` pass.

### 54. The rule as a boundary: a tool decides when, never what

**Model and effort.** Opus 5.5, `high`: a rule of `AGENTS.md` and of `docs/invariants.md` said again, each sentence
checked against the code, and the owner asked for its words.

**Depends on** no other step: steps 50 to 52 are done. Once they were, `src/testing/` uses none of the six: what it
takes of `shell.ts` is `makeDeaths`, `startFiber`, `commandFiber` and `stopping` (`drive.ts`,
`rehearse.ts`, `simulate.ts` and `stage.ts`), so the check passes once it is written.

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
   makes no step, no scope and no site of a defect. The owner is asked for the words before they are written.
3. The contract, `contract.test.ts`, read case by case: a case that gives a tool what the engine alone now does is
   held by the engine's tests and mutations. The owner decides which stay as alarms and which go, and none goes that
   a mutation still names as its killer.
4. The guide's "Testing tools" says "as the run does" of each tool already: it changes only if a sentence is found
   that the code no longer keeps, and then as `AGENTS.md` says.

**Done when** the check runs in `bun run lint`, and was seen to fail on a use put back by hand; the three documents
say the rule in the owner's words; the owner has decided the cases of the contract; and `bun run comments`,
`bun run lint`, `bun run test`, `bun run test:node` and `bun run mutations` pass.

### 55. A review of the premises of steps 49 to 54

**Model and effort.** Opus 5.5, `high`, by a reviewer that wrote none of them
([`premise-review`](.agents/skills/premise-review/SKILL.md)).

**Depends on** steps 49 to 54, and comes before the release that follows them.

**Why.** Each of them moves a check from a tool to the engine, or takes one away with the code it guarded: a premise
may leave with it, and no test fail. From step 52 on, `simulate` rests on the engine's premises, and no longer on
those of a fork of its own.

**Done when** the review has read the engine and the testing tools over the changes of those steps; each finding is
an item of "Open problems" with its `test.failing`; each place where the code or a document says otherwise is set
right; and `docs/premises.md` says what `simulate` rests on.

### 48. The guide's descriptions, weighed by what they hold

**Model and effort.** Opus 5.5, `high`: the guide changes a section at a time, each sentence checked against the old
one, with the mutations and the tests that hold it.

**Depends on** no other step. The record leaves to step 46 the two items of a self-interruption as the run stops it (9
and 10 of "Unspecified" in [`guide-descriptions.md`](docs/records/guide-descriptions.md), and the third mutation of its
"Four that do not match"): that step was closed on 24 November 2026 with the guarantee kept, and the mark, the roots
and the question to the fiber with it (`docs/rejected.md`), so the run does of that case what it did, and the owner
decides the two items here, with the others.

**Why.** A description is as true as a promise, has a test, and needs a changelog entry where a consumer can notice
that it changed (`AGENTS.md`, "The guide is a specification"): one that no decision of a user rests on is a constraint
on the engine with no use. Effect says of such a behaviour only that it is unspecified, as Effect-TS/effect#10878 does.
The review of 24 November 2026 found ten such descriptions, which would take about 11 lines, up to five mutations and
the cases of their tests, and four places where the strength of the guide and what checks it do not match.

**How.** The record is a review's reading: check each item against the code before it changes anything.

1. The four that do not match, first, each as the owner decides before it is written:
   - the four mutations whose `guarantees` names a guarantee for a behaviour the guide describes: for each, the
     guarantee covers the case, and the description becomes a promise, or the tag goes;
   - the number of an instance, which `testing.md` promises on the order of the starts that `composition.md` describes:
     advised, the order promised, since a test written by the guide rests on it;
   - "What does not compile", under "Precisely" in `anatomy-of-a-program.md` and `composition.md` though checked as a
     guarantee is: advised, out of "Precisely", since the rules of the types owe each refusal;
   - the promises said again under "Precisely" need nothing: noted in the record for whoever changes one.
2. Each of the ten of "Unspecified", as the owner takes it: the description replaced by the record's sentence, its
   tests and its mutation removed only where nothing else holds them (`change-engine`), the comments that name the
   section reread (`bun run comments`). A description replaced keeps every promise, so it needs no changelog entry; a
   promise added follows `release`.
3. The others of "Promote?" are not in this step: the owner weighs each when a user is seen to rest on it.

**Done when** the owner has decided each of the four and each of the ten, the guide, the mutations and the tests say
what was decided, and `bun run comments`, `bun run lint`, `bun run test`, `bun run test:node` and `bun run mutations`
pass. The record says what was decided, at its head.

### 47. Ask Effect to document what the library rests on

**Model and effort.** Opus 5.5, `high`: each request states a general rule of Effect, true of its source.

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
or a pull request of the JSDoc alone where the rule is a sentence. The owner is asked before each is opened, with its
text: it is opened in the owner's name. That of `Stream.callback` is one of them, as a case of the scope a stream runs
in. The premise of the scheduler of the tests, and that of the JavaScript engine, are not asked.

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

## Waiting for the owner

Where a step above would answer a point below, the point stays here until the step is done. A point of the seven that
is gone leaves its number unused.

- **Two points of the review of the premises of step 20** (24 November 2026), whose reports are the bodies of
  `b6793dc` on `claude/premise-review-engine-20-badc4f` and `2c0862a` on `claude/premise-review-testing-20-d42368`:
  1. **A `listen` that gives the same channel for every start**, as `listen: () => ticks` in the examples and the
     guide's "Subscriptions", runs that one value again at each start of its key, and at once for two keys. The
     library rests on it, and the JSDoc of `Channel` in Effect 4.1.5 does not state it: it is the premise that 04eb7b4
     dropped, of a channel that `Channel.map` makes, now of the user's value. A test of Effect alone passes (one value
     of `Channel.fromIterator(…).pipe(Channel.concatWith(…))` drained twice in turn and twice at once through
     `Channel.toPull`). To decide: list it in `docs/premises.md` with that test, or ask a `listen` to make its channel
     anew, which changes the guide's form. Opus 5.5, `medium`, once decided.
  2. **A new state whose `subscriptions` dies is the current one, and no listener is told of it**: `applyOne` sets
     `current`, then returns on the defect before `tell` (`engine.ts`). The guide promises, outside "Precisely", that
     "`subscribe(listener)` tells `listener` of each new state, once it is the current one" (`running.md`), and so do
     the doc comments of `App.subscribe` (`run.ts`) and `Engine.subscribe` (`engine.ts`); "after a defect" there says
     only that `onApplied` "may have heard a step whose model is never drawn". A renderer that draws in its listener
     shows the state before, while `model()` gives the new one. To decide: tell the listeners of that state too, leave
     `current` as it was, as a defect of `onApplied` does, or state the exception in `running.md` and the two doc
     comments. Opus 5.5, `high`, once decided.

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
- **Seven points of a review of the design**, of which 5 and 6 are left. By the session of Fable 5.2 that briefed and verified the stages of
  the same record, asked by the owner on 20 November 2026 what does not fit. Reasoned from the code read for those
  reviews, and not run, but where a point says so. Each is to be weighed.
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
  before. Whether the search holds what it no longer
  needs (a history kept by fast-check, a scheduler's log), or the bound is too low for it; never a bound raised without
  knowing which.
- **The README says what the library is and for whom, and names Foldkit**, as the owner's decision of 20 November
  2026 asks ([`adoption.md`](docs/records/adoption.md)): one reader starts a new application, the other has one
  already, most often in React.
- **`ObjectState` on the places of `child` and `childById`, weighed for removal.** Its mutations, on 23 November
  2026, changed nothing that compiles: `CheckedChild` refuses the same states through `ProgramChecked`, and the four
  were there before it was (`tools/mutations/mutations.ts`, at the head of the mutations of the types). Before they go:
  which error a user sees for a child whose state is a number, with them and without, and the smoke test's count.
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
