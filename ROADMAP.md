# Roadmap

What is to be done now, and nothing else. Each step names its model and effort, what it depends on, and how to tell
that it is done, and its choices are made by "Deciding" in [`AGENTS.md`](AGENTS.md), without the owner. A step done
is removed, with the reason in the commit, and leaves its number unused. An item rejected goes to
[`docs/rejected.md`](docs/rejected.md), and one deferred to its "Parked, not rejected", with what would reopen it, in
the same commit. How an item came to be is in a record of [`docs/records/`](docs/records), or in the commits, not
here.

## How the steps run

One after another, in the order of "Next, in order", each in a context of its own (a workflow per step, or a session per
step), and with no question to the owner but those of "Deciding". An agent of the step's model and effort does the step.
Then an agent that wrote none of it, on Opus 5.5 at `high`, runs the checks of its "Done when" and reads its diff
against "Deciding" and the step, and the step against `docs/invariants.md`; the first agent fixes what it finds, twice
at most, and a step whose checks still fail stops the chain, with a report. A step ends in one local commit, with its
decisions in the body, and takes itself out of this file. Before each step, the use of the owner's plan is read where a
tool reports it: a step that the rest of the week cannot pay for waits for the reset.

## Open problems

A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a deterministic
test of it. A finding of a review goes here with its `test.failing`, until its fix removes the mark and the item. A
problem whose fix is due before a step of "Next, in order" leaves this list for a step of its own there.

## Leads

What a task or a review found that no failing test shows and no user met ("How a decision is taken and kept" in
`AGENTS.md`): a line each, with what would show it, as the test of the types that would hold a lead of the types, or
the case of the inference matrix (`bun run inference --filter <case>`). None is a step of its own: they are weighed
together before a release, and one not taken then goes to `docs/rejected.md`.

- **The peer range of Effect as a caret**, again. The owner kept the tilde (`docs/rejected.md`, "A caret as the peer
  range of Effect"), and step 47 works toward what its "Reopen if" names. Meanwhile a user waits for a release of the
  library at each minor of Effect, and the daily run against Effect's `main` (`effect-latest.yml`) would tell of a
  break first. What would show it: a user who cannot install the library beside the Effect that another package of
  theirs asks for.
- **The inference matrix crossed in pairs**, the item of "Any time", which says what it would lose; and **no new type
  for how a consumer's types print** (`change-api`, "A type for how a consumer's types print is admitted on four
  conditions"): those that are there stay, and no change is made to lower the count of the smoke test. What would show
  the second: a user who publishes a program as a package, and reads its declarations.
- **The second agent of a step only where the step changes the engine or the types** ("How the steps run"): a step of
  names, of documents or of a tool would be read by the agent that wrote it, against its "Done when". What would show
  it: the reports of the second agent on such steps, counted by what they found.
- **The skill that the package ships as an index of the guide**, a page and a section for each rule, in place of a
  summary of 258 lines kept in step with the guide by hand and by `bun run comments`. What would show it: a reading of
  the promises that finds the skill and the guide saying two things.

## Next, in order

Both readings are due before the release after 0.9.0, whose breaking changes go out together ("What may change" in
`AGENTS.md`), and in this order (`release`, point 1 of "Releasing").

The last review of the premises is the commit that closed it (`git log --grep "the premises reviewed since step 65"`):
the next one reads the changes since.

Steps 101 to 103 came from a reading of the testing tools against the engine, of 26 November 2026, after that review.
The step of a message is the engine's, and the tools differed from the run only at two seams of their own, closed by
steps 101 and 102: the mask of a command's fiber, and the waits of a call, which the stage now gives in two kinds alone.
Step 103 gave each scenario of `src/testing/contract.test.ts` to each of the three, through `eachTool`, and found no
difference. Step 100 reads what steps 101 to 103 changed of the doc comments, the sentence of `hearNext` on a defect
among them. None rests on a new premise, so the next review of the premises reads them, and none is due for them before
the release: a step that finds it needs a premise says so here.

Step 105, of 26 November 2026, made a `Child` and a `ChildById` classes that only `child` and `childById` make, and
changed the doc comments of `Child` and `ChildById`, which step 100 reads too.

### 100. Read the promises since step 90

**Model and effort.** Opus 5.5, `high`: a review.

**Depends on** no other step. It reads the guide, the doc comments and the examples changed since the commit that
closed step 90 (`git log --grep "Close step 90"`), each against the whole of the other side, by
[`promise-reading`](.agents/skills/promise-reading/SKILL.md).

**Done when** each gap is closed, or is a step of this file, and, in place of this step, one line here names the
commit that closed it, for the next reading.

## For the owner

What leaves this machine, or decides what the project is ("Deciding" in `AGENTS.md`): an agent prepares it, and the
owner does it.

- **0.9.0** is committed and tagged `v0.9.0`, locally, on 26 November 2026, after the checks of point 2 of
  "Releasing" passed on it: the owner pushes the commit and the tag, which deploys the site, and publishes the package.
- **1.0.** Not before the library has been made known and used by others for at least one or two months, as the owner
  decided on 20 November 2026: only then may 1.0 be decided, with what its users have asked of the API, after a
  reading of the promises and a review of the premises over everything. Until then, releases stay at 0.x.

### 47. Ask Effect to document what the library rests on

**Model and effort.** Opus 5.5, `high`, for the drafts: each request states a general rule of Effect, true of its
source.

**Depends on** no other step. Step 46, which weighed the guarantee of an interruption by the program, was closed on 24
November 2026 with the guarantee kept: its two premises stay in `docs/premises.md`, and are asked here.

**Since the upgrade to Effect 4.1.5** (23 November 2026), its JSDoc documents seventeen of the thirty-one premises on
Effect, which left `docs/premises.md` with their tests: what `FiberSet.run` and `FiberMap.run` promise of the fiber
they fork, a fork's region and `startImmediately`, the cleanup of `Effect.onExit`, the order of a scope's finalizers, a
handler that an interrupted fiber skips, the annotations of `Fiber.interruptAs`, the races, `acquireUseRelease`,
`suspend`, `Fiber.await`, and the clock of a timeout and its default. Since the upgrade to Effect 4.1.6 (26 November
2026), four more: `Stream.callback`, `Channel.toPull`, the external span and the `Logger`. Nine are left, the
scheduler's aside.

**Why.** A behaviour that a stable API documents is no premise (`docs/premises.md`, "The rule"): Effect
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
opens it, in the owner's name. The premise of the scheduler of the tests, and that of the JavaScript engine, are not
asked.

**Asked on 24 November 2026**, in Effect-TS/effect#10877, after the two requests answered (Effect-TS/effect#10667 by
Effect-TS/effect#10683, and Effect-TS/effect#10719 by Effect-TS/effect#10731), and answered by Effect-TS/effect#10878,
in Effect 4.1.6: its JSDoc now states three of the four rules asked, the scope a stream runs in, an external span that
records nothing, and a logger called synchronously in the fiber that logs. The fourth, that the hash collections call
`Equal` and `Hash` only during a call, it left out, and the owner agreed there that it should not have been asked: it
follows from the shape of the API, since a function that returns no `Effect` does its work during the call. So what
follows from Effect's model is not asked: only what an implementation Effect could choose would do otherwise, where a
user of Effect would then write other code. The premise of `HashMap` stays, with its tests, since `DefectSite` promises
where a key's `Equal` throws. What the first answer chose not to promise is not asked again: a rule for callbacks that
throw, `run` on a closed container, when a loser is interrupted, how the failures of cleanups combine, and the turn of a
deferred fork.

Not asked: the two premises of how the failures of cleanups combine (`Effect.onExit`, `Scope.close`) and that of a
`Deferred` resuming on the stack of whoever completes it, which fall under what the first answer declined; and those of
what a `Queue` and the runtime keep, whose fall would be a leak that Effect fixes as a bug.

**Still to ask**, since step 46 kept the guarantee that rests on them: what `Effect.interruptible` fails with, entered
by an interrupted fiber where it is uninterruptible (the second half of its premise; the first half holds only what
the guide leaves unspecified), and the fiber that code run on the stack of its forker sees as its own. Since step 57,
also that one channel runs afresh each time it is run, which the guide's `listen: () => ticks` rests on: a rule of
`Channel` in general, not of `listen`. Each is read first against what the first answer declined, as the others were.

**Done when** each premise on Effect names, in `docs/premises.md`, the request that the owner opened for it, or says
that none was asked and why. A premise leaves the list by an upgrade to the Effect that documents it
(`upgrade-effect`).

## Any time

None of these waits for the steps above, nor holds them up, and "proceed with the roadmap" takes none of them: the
owner left them here on 25 November 2026, while the steps of "Next, in order" are done. Each is for Opus 5.5,
`medium`, but where it says otherwise.

- **What a real browser has not run of the bridges.** The bridges' tests run in Chromium, Firefox and WebKit
  (`bun run test:browsers`, a job of the CI). Firefox runs in the CI alone: on the owner's Windows machine, Playwright's
  Firefox does not start ("side-by-side configuration is incorrect"), so the tests of hydration, transitions and Fast
  Refresh that step 70 added ran in Chromium and WebKit, and run in Firefox after the owner's push. So do all the
  bridges' tests at React 19.3.0, which step 83 made the start of the peer range and the lockfile's version. An IME is
  driven in Chromium alone, through its protocol: Playwright drives none in Firefox or WebKit, so a composition there
  is not run.
- **The advice of "Composition" for a screen that shows an older draw, on a device.** Step 92 reasoned it, and ran
  none of it on a device ([`instance-in-view.md`](docs/records/instance-in-view.md), 5): a dispatch that names its
  instance, and the number as the key of the child's view. `examples/react-native` draws no parent. A parent there,
  whose child starts again, would show the advice in an example
  ([`add-example`](.agents/skills/add-example/SKILL.md)), and `bun run test:react-native` would run what jest reaches
  of it. What a tap does on a device is for an application's report.
- **A benchmark that runs in the CI.** Many children, many messages per second, to keep what a message costs the event
  that sends it, and a model made only when it is read, from regressing. `bun run bench`
  (`tools/bench/subscriptions.ts`) measures a parent's subscriptions only, and `tools/bench/writes.ts`, run by hand,
  what a message that an element fills costs as a program stores its value, by its own `update`, through the `update`
  that `make` composes, and through a dispatch with its model read; neither runs in the CI. A CI machine's times
  vary, so what fails is a count that does not: how often `makeModel` runs, how many keys one message reconciles.
  What one step with many keys costs was measured by hand in step 57 ([`left-points.md`](docs/records/left-points.md),
  the last item): a start for its cases.
- **A devtools bridge over `onApplied`** (e.g. Redux DevTools), with time travel through `init: { state }` and
  replay through `applyAll`.
- **An example of hot module reloading** that keeps the state, which the guide hints at (the view lives in a
  module of its own) without showing. It says what it does with a kept state once a declaration changed, which the
  library leaves unspecified ("Guarantees", "What is left to you"): `stateOf` makes a state of the new program from an
  own state and its children's states, and is a testing tool today.
- **An example of saving each state before its commands start**, which the guide names ("Running", "Work that must
  wait goes to the effects of the program") without showing: `onApplied` offers the state to a queue, a fiber of
  whoever runs the program saves it, and a wrapped `runCommand` waits until the state its step heard is saved.
- **The search laid out by guarantee.** The 21 properties of `src/interleaving.test.ts` sit in one `describe`. Each
  would go under a `describe` named by the bold title of the item of "What you can rely on" it checks, with one for
  what the guide says the search "also checks", and `bun run comments` would check the names both ways, with
  `sectionsOf` kept to that list. It ties an item to what the guide says checks it, which the `guarantees` of the
  mutations cannot, since the search kills no mutation. Not tried: a spike first, for whether every property falls
  under one item. It changes the layout of the tests of the engine (`change-engine`).
- **The inference matrix crossed in pairs.** Its twelve configurations took 45 minutes on 22 November 2026, and its
  three default ones 16 minutes on 23 November, for 369,342 parts: the full product of its axes pays for most of it,
  and the order of the pieces and the annotations alone multiply every case by four. Since the forms not typed are
  judged by the rule of `AGENTS.md` ("What belongs here"), their axes may be crossed in pairs, as the axes of point 6
  of step 16 are crossed with the names (`crossings` in `tools/inference/generate.ts`), leaving time for more axes.
  Opus 5.5, `high`: what the matrix stops crossing is what it no longer checks. What it found so far needed two axes:
  of the 2,150 wrong parts of 23 November 2026, 1,652 were one lead, a program with an `external` given to `start` or
  `drive` ([`program-forms.md`](docs/records/program-forms.md)). Crossed in pairs it keeps every lead of one axis or of
  two, and loses one that needs three. The likeliest is a program of `make` that fails to compile in one writing alone,
  as reversed, not annotated and with a type left to inference, which a user sees as they write. The worst, and the
  least likely, is a service lost where a parent's types are made of its children's, which compiles and dies as it
  runs: the services and a child's shape do not meet in the matrix today either. So what `make` infers (the services,
  a model not named, the children) stays crossed in full with the order and the annotations.
