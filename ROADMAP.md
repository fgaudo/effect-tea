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
lead of the types has no `test.failing`: its fix adds the test of the types that holds it, and a lead of the inference
matrix is shown by its case (`bun run inference --filter <case>`).

- **A type error over a parent's keys or messages prints its children's programs.** Found by an application on 26
  November 2026 ([`application-report-0.9.md`](docs/records/application-report-0.9.md), point 8), and reproduced on
  the examples. Its case is a file under `examples/`, which gives `Arr.filterMap` an `Option`, where it takes a
  `Result`:

  ```ts
  import { type KeyOf, type MessageOf, program, type StateOf } from "@fgaudo/effect-tea"
  import * as Arr from "effect/Array"
  import * as Opt from "effect/Option"
  import { cart } from "./cart/cart.ts"
  import { list } from "./list/list.ts"
  import { app } from "./pages/app.ts"

  const { child, withChildren } = program<{ state: Readonly<{ n: number }> }>()
  export const root = withChildren({ Pages: child(app), List: child(list), Cart: child(cart) }).make({
    init: { state: { n: 0 } },
    makeModel: (_, children) => ({ pages: children.Pages(), list: children.List(), cart: children.Cart() })
  })
  declare const pressedUnder: (key: KeyOf<typeof root>) => Opt.Option<MessageOf<typeof root>>
  export const repro = (state: StateOf<typeof root>) =>
    Arr.filterMap(root.subscriptions(state), (key) => Opt.map(pressedUnder(key), (pressed) => ({ key, pressed })))
  ```

  `bunx tsc --noEmit -p examples --noErrorTruncation` prints one error, TS2375, of 62,010 bytes, where `Program<{`
  is printed 54 times; without the flag, 1,459 bytes, cut. The application's tree of nine programs printed 967 KB.
  `ChildKeys<C>`, `ChildMessages<C>` and `KeptOf<C>` are printed with the declarations `C` of the children, and each
  `Child<State, P, There>` holds its child's whole program. Step 96.

## Next, in order

Steps 96 to 98 come from the report of an application written again on 0.9.0, weighed on 26 November 2026
([`application-report-0.9.md`](docs/records/application-report-0.9.md)), and run in the order of their numbers. Each
decides its point by "Deciding": a step that decides against its point writes its entry of
[`rejected.md`](docs/rejected.md), and is done. Their breaking changes go out together, in the release after 0.9.0.

Step 92 decided the report's third point ([`instance-in-view.md`](docs/records/instance-in-view.md)): `makeModel`
reads the number of a child's instance, and `forwardTo` takes it, so that a message of a view names its instance where
the view gives one. A message that names none is still a message, which reaches the child that is there, so no test
written before it changes. Step 93 decided the first two items of the sixth point: `stateOf` tells each child once it
is in the state given for it, and a test reads what a step told in the child's state and commands, with no list of it
in the tools ([`rejected.md`](docs/rejected.md), "A list of what a step told"). Step 94 decided the fourth
([`flags-always-there.md`](docs/records/flags-always-there.md)): `child(program, { flags })` is always there, and
`flags` gives the flags, while `child(program, { there })` gives `Some` of them where the child is there. Step 95
decided the fifth ([`subscriptions-read-outputs.md`](docs/records/subscriptions-read-outputs.md)): a parent's own
`subscriptions` takes its children's outputs last, and the options of a declaration still read its own state alone.

The release of 0.9.0 waited, as the owner asked on 25 November 2026, for a bridge to
React Native, which step 83 made, for whether a view of React can have a `messagesSentBy`, and for a reading of the
names of the API. Step 84 decided the first, after a spike ([`react-view-tests.md`](docs/records/react-view-tests.md)):
it has none, and step 85 showed the check with React's tools, in `bridges/react.test.ts` and
`examples/react-native/views.test_jest.tsx`. Step 86 read the names ([`names.md`](docs/records/names.md)): five
change, two of them with a break, and step 87 applied them. The owner's fourth point has no step: the bridges stay in
`bridges/` ([`rejected.md`](docs/rejected.md), "The bridges"). Step 82 decided what the bridge to React is on React
Native ([`react-native.md`](docs/records/react-native.md)): `./react` as it is, with no entry and no peer of its own.
`bun run test:react-native` checks it there, a job of the CI.

Step 73 decided the form of the smaller guide ([`smaller-guide.md`](docs/records/smaller-guide.md)): `AGENTS.md`
holds it, under "What belongs here". The owner approved it on 25 November 2026, and steps 74 to 77 wrote every page by
it: each has "In short", "An example", "Rules", and "Advice" where it advises, and its ceiling of words in
`tools/comments.ts`. A doc comment names a page of the guide, never a section, and `tools/comments.ts` refuses one
that names a section; the skill, the index, the glossary, the tutorial and the README were read again against the
smaller guide (step 78). The guide went from 34,025 words to 21,807, most of what left it being in a doc comment, or in
"Guarantees", already. A promise withdrawn is a breaking change, whose changelog entry is the one that starts
"**Breaking**: unspecified, and no longer promised". No link checker runs on the guide: a step that changes a heading
reads each `](…#…)` into its page, before and after.

The last reading of the promises ([`promise-reading`](.agents/skills/promise-reading/SKILL.md)) read everything,
guide, doc comments and examples, in step 90 (`git log --grep "Close step 90"`): the next one, before the release
after 0.9.0, reads the changes since that commit, and one of everything is due before 1.0.

The next review of the premises ([`premise-review`](.agents/skills/premise-review/SKILL.md)), before the release
after 0.9.0, reads the changes since the commit that closed step 65 (`git log --grep "Close step 65"`): steps 55 and
65 together read every change since `ce1ffd1`.

### 96. A parent's types printed without its children's programs

**Model and effort.** Opus 5.5, `high`.

**Depends on** no other step: step 95 changed the types it prints.

**Why.** The lead of "Open problems". An error that names the keys, the messages or the state of a parent prints the
declarations of its children, each with its whole program, at each level of the tree: a mistake of one line gave an
application 967 KB, and gives the examples 62 KB. Cut by the compiler, it hides the user's own types. Users judge the
library by its API first, and an error is part of it.

**How.** A spike first: what makes the compiler print `ChildKeys<C>`, `ChildMessages<C>` and `KeptOf<C>` with `C`
written out, and which form prints less. Leads: the types of the program that `make` gives worked out to their
structure, a union of wrapped keys and messages, where they are aliases over the declarations; a declaration that
holds less than its child's whole program; names that the compiler keeps. What a hover shows counts too. The smoke
test counts how often a consumer's declarations spell out its state, 14 times, and `tools/api-report.ts` what the
package names: neither grows. Read first `rejected.md` ("`DeclareChild<State>` in place of `DeclareChild<T>`", "The
types of the functions of `program` written in place", "A second entry of the package").

**Done when** the case of "Open problems" prints under a bound that a check holds, run with the checks of
`change-api`, with `--noErrorTruncation`; the lead is taken out of "Open problems"; no behaviour changes; and the
changelog has an entry only where a consumer's declarations name another type.

### 97. The types of a parent's handler written apart

**Model and effort.** Opus 5.5, `high`.

**Depends on** step 96: it names the types that step 96 prints, which step 95 changed.

**Why.** "Structuring a program" splits a program by concern, each part asked for a `Step`. For a parent, a handler
written outside `make` takes its children's outputs and returns a step that tells them, and the package exports no
name for either: `Outputs` and `Tells` are kept by `src/compose.ts`, so a program declares them again by hand
([`application-report-0.9.md`](docs/records/application-report-0.9.md), point 1). Every correct program can be
written, and this one is written twice.

**How.** Leads: types read back from what `withChildren` returns, or from the declared children, in the family of
`StateOf` and `MessageOf`, named by the guide's words, `tell` and `output`; or `Tells` and `Outputs` exported as they
are, which print the declarations unless step 96 changed that. An example split by concern shows the form taken.

**Done when** a handler of a parent's `update`, `onEvent` and `external`, written in a module of its own, is typed
with names that the package exports, in an example and in a test of the types; "Structuring a program" ("Splitting a
program") shows it; the changelog has its entry; and the checks of `change-api` pass.

### 98. `hear` and `hearNext` by a predicate

**Model and effort.** Opus 5.5, `medium`.

**Depends on** no other step.

**Why.** `run` takes `(command) => boolean`, and `hear` and `hearNext` a whole key, which for a child names its
instance: `{ _tag: 'Row', id, instance: 1, key: 'ticks' }`. So a test of a parent counts the starts to hear a child,
and an application wrote a function that builds the key
([`application-report-0.9.md`](docs/records/application-report-0.9.md), point 6). One role has two forms.

**How.** `hear(select, message)` and `hearNext(select)`, with `select: (key) => boolean` over the keys of the current
state: the test fails where none matches, and where more than one does. One way, so the form by key goes, with a
breaking change whose note of "Upgrade" gives the predicate that compares a key with `Equal`. Weigh it against
`rejected.md` ("A subscription made from its key alone, in other forms", for `hear` taking a key of the program's
type; "Other names in a `Rehearsal` and a `Driver`"). "Testing", "The number of an instance", then says less.

**Done when** the tests of `src/testing/rehearse.test.ts` and of the contract hold it, the examples' tests are written
with it, "Testing tools" and "Testing" say it, the changelog has its entry, and `bun run test:node` and
`bun run interleavings` pass.

## For the owner

What leaves this machine, or decides what the project is ("Deciding" in `AGENTS.md`): an agent prepares it, and the
owner does it.

- **0.9.0** is committed and tagged `v0.9.0`, locally, on 26 November 2026, after the checks of point 2 of
  "Releasing" passed on it: the owner pushes the commit and the tag, which deploys the site, and publishes the package.
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
  Opus 5.5, `high`: what the matrix stops crossing is what it no longer checks.
