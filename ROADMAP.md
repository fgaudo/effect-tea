# Roadmap

What is to be done now, and nothing else. Each step names its model and effort, what it depends on, and how to tell
that it is done, and its choices are made by "Deciding" in [`AGENTS.md`](AGENTS.md), without the owner. A step done
is removed, with the reason in the commit, and leaves its number unused. An item rejected goes to
[`docs/rejected.md`](docs/rejected.md), and one deferred to its "Parked, not rejected", with what would reopen it, in
the same commit. How an item came to be is in a record of [`docs/records/`](docs/records), or in the commits, not
here.

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

## Next, in order

Steps 74 to 78 and 68 to 72 come before the library is made known to others
([`adoption.md`](docs/records/adoption.md)), and neither wait for the release of 0.9.0 ("For the owner") nor hold it:
what is done before it goes out with it. Their order: first the guide made small (74 to 78), since every later step
reads it or adds to it, and a promise withdrawn is a breaking change, which goes out with the others; then what may
change a rule of the guide or show a cost of the API (68); then what a first user meets (69, 70); then the two checks,
which read the guide as those steps leave it (71, 72).

Step 73 decided the form of the smaller guide, and tried it on "Composition" and "Structuring a program"
([`smaller-guide.md`](docs/records/smaller-guide.md)): `AGENTS.md` holds it, under "What belongs here". **Step 74
waits for the owner's word on the two pages**, as the owner asked on 25 November 2026: a form that the owner refuses
is changed on those two, not on sixteen. Until step 78 the guide has both forms: a page not yet written again keeps
its "Do and don't", and the comments that name its sections.

The next review of the premises ([`premise-review`](.agents/skills/premise-review/SKILL.md)), before the release
after 0.9.0, reads the changes since the commit that closed step 65 (`git log --grep "Close step 65"`): steps 55 and
65 together read every change since `ce1ffd1`.

### 74. The pieces of a program, by the form of step 73

**Model and effort.** Opus 5.5, `high`: a promise withdrawn is a breaking change.

**Depends on** step 73, and on the owner's word on its two pages.

**Why.** Step 73 decides the form on two pages. The other pages are written again by it, a group in a step, so that
each step fits one context.

**How.** "Anatomy of a program", "Update", "Model", "View", "Commands", "Subscriptions" and "Rejections and defects",
some 7,300 words: each sentence by the test of `AGENTS.md`, as step 73 left it. A sentence that moves to a doc comment
is written there in the same commit, and the skill's rules that name a section changed are reread.

What step 73 leaves to each step of 74 to 77, which the two pages and their commit show:

- A page written again has "In short", "An example", "Rules", and "Advice" where it advises. It has no "Do and
  don't": a pair of code that teaches stands with its advice. It keeps the headings that other pages link.
- A doc comment of the page's exports names the page alone, `@see The guide, "<page>".`, once. `bun run comments`
  still checks a section where a comment names one, so a page is done one at a time.
- The page gets its ceiling in `tools/comments.ts` (`ceilings`), at what it came to with room for a sentence or two.
- `skills/effect-tea/SKILL.md` names sections of the guide: one that is renamed or goes is renamed there in the same
  commit, or named by its page alone. Step 78 writes the skill again.
- The count of sentences is of the page as it was: a sentence of prose, a row of a table or a block of code, each
  with where it went (the guide, a doc comment, unspecified, cut, advice, its example).
- Specification halves, and advice does not: "Composition" went from 3,616 words to 1,807, "Structuring a program"
  from 2,136 to 1,836. Most of what left "Composition" was in a doc comment already.
- A promise is withdrawn only at a corner that no user builds on. Its changelog entry is the one that starts
  "**Breaking**: unspecified, and no longer promised", which each step adds to.

Of this group alone: "What does not compile", in "Anatomy of a program", is the last list that the mutations of the
types name (`refuses`, in `tools/mutations/mutations.ts`). If it goes to the doc comments, as the list of
"Composition" did, `refuses` goes with `refusing`, `refusedIn` and `problemsOfRefusals` (`tools/comments.ts`),
the paragraph of `change-engine` that names it, and the entry "The guide tied to the inference matrix" of
`docs/rejected.md` says so. "Rejections and defects" and "Commands" hold that an operation is a state that only its
completion leaves, which "Structuring a program" no longer says.

**Done when** each page of the group is written again by the test; each promise withdrawn has its changelog entry, and
its test is kept for an invariant or removed; the commit counts the sentences by where they went, and the words before
and after; and the checks of step 73 pass.

### 75. Events, and what an element gives, by the form of step 73

**Model and effort.** Opus 5.5, `high`.

**Depends on** step 73, and on the owner's word on its two pages.

**Why** and **How**, as step 74, for "Events and external messages" and "What an element gives", some 3,700 words.
Both say again rules of "Composition" and of "Structuring a program", which step 73 wrote: a rule has one place, and
these pages link to it. "A value is never a reason to reject" is now advice of "Structuring a program" ("Do not
reject a message by its value"), and "A value that the user types into a child" its "A value that the user writes
belongs to the program whose rules use it".

"A child that must wait for its parent" is linked from "Structuring a program", as the case where a part that its
parent locks is a child all the same: the heading stays, or the link changes with it. No example and no test shows
that pattern, which step 73 found: the step weighs an example of it, or says in the section that none does. The two
pages also link `#outputs` and `#external-messages` of "Events and external messages", and `#rules` and
`#in-each-row` of "What an element gives".

**Done when**, as step 74.

### 76. Running, guarantees and bridges, by the form of step 73

**Model and effort.** Opus 5.5, `high`.

**Depends on** step 73, and on the owner's word on its two pages.

**Why** and **How**, as step 74, for "Running", "Guarantees" and "Writing a bridge", some 9,300 words. "What you can
rely on" is the list of the promises of a run, and the mutations name its items (`guarantees`, in `tools/mutations/`):
an item is withdrawn only by `change-engine`, and one that stays keeps its title, or the mutations that name it change
with it.

What step 73 leaves here: "A parent's children are those its own state lists" and "An answer reaches the instance
that asked for it, or is rejected" are said in "Composition" too ("When a child is there", "What the library
derives"), which links `#what-you-can-rely-on` and `#what-is-left-to-you`: each sentence has one place, and the
other links. "Running" and "Guarantees" send a reader to `composition.md#how-a-parent-and-its-children-start` for
the children that `make` starts: that now stands in the doc comment of `init` (`src/compose.ts`), and the page
says only that the program's `init` holds the whole first state. The item on "Structuring a program", in "What is
left to you", calls it advice since step 73.

**Done when**, as step 74, with `bun run test:node` and `bun run interleavings` where a test of the engine changed.

### 77. Testing and its tools, by the form of step 73

**Model and effort.** Opus 5.5, `high`.

**Depends on** step 73, and on the owner's word on its two pages.

**Why** and **How**, as step 74, for "Testing" and "Testing tools", some 5,200 words. What each tool fails on, and what
it ignores, is of its export: the doc comment is its place, and the page keeps how a program is tested. "Composition"
sends a reader to "Testing" for the numbers of the instances, and for `stateOf`: "The number of an instance" is their
one place, with the shapes of a child's commands and keys.

**Done when**, as step 74.

### 78. What reads the guide, after it is made small

**Model and effort.** Opus 5.5, `medium`.

**Depends on** steps 73 to 77.

**Why.** The skill sums up the guide, the tutorial and the README link to its sections, and the index says what a page
promises and how it is laid out. Each says what the guide was.

**How.** [`skills/effect-tea/SKILL.md`](skills/effect-tea/SKILL.md) is written again from the guide as it is. The
index's "What a page promises" and "How a page is laid out" say the form of step 73: step 73 added the doc comments
to the first and "Advice" to the second, and the line on "Do and don't" goes once no page has one. The glossary drops
each word that the guide no longer uses. "Coming from Elm or React", the tutorial and the README keep only links that
lead somewhere. Once no doc comment names a section of the guide, `tools/comments.ts` checks the page alone
(`reference`, and `sectionsOf` for the sources), the skill names what its rules need, and `AGENTS.md` drops "but of a
page that the roadmap has yet to write again" from its rule of a doc comment.

**Done when** each of them is so, `bun run comments` passes, and the commit gives the words of the whole guide, and of
the skill, before step 73 and now.

### 68. A program too large for one module that is not split into children

**Model and effort.** Opus 5.5, `high`: a page of the guide is a specification.

**Depends on** step 73, which writes "Structuring a program" again. It comes before steps 69 to 72, since it alone of
them may add a rule to the guide or show that the API must change.

**Why.** "Structuring a program" says that a program lives in one module until it is too large, and then splits into
children, and that a part that the parent reads is no child. So the guide has no page for a large program whose parts
read each other, which is what a reader with an application of their own brings.

**How.** Its parts are plain code: an `update` and a `makeModel` of each concern, as functions of the whole state in
modules of their own, with their steps chained by `andThen`, which the guide shows only between a parent and a child
("Events and external messages"). Reasoned, from the second opinion of 22 November 2026
([`kept-children.md`](docs/records/kept-children.md)), and not tried: it is tried first on a copy of an example that
is not kept, as `stocktake`, for what it costs with the types of a `Step`. The rule of the guide that it adds comes
first, since an example never brings the rule that allows it (`AGENTS.md`). It is weighed against the page as step
73 leaves it: with `output` (step 35), a parent reads a value that its child declares, so "a part that the parent
reads is no child" is written again there.

**A lead, to weigh here.** Between a parent and a child, a moment goes both ways: an event up, an external message
down. A condition goes up alone, as an `output`: down, flags start the child again as they change. So a condition of
the parent that changes while a child lives is copied into each child's state, and told again to each child started
later, and nothing checks either. The guide calls the same copy upward derived data in a state, which is the argument
that `output` was taken for ([`kept-children.md`](docs/records/kept-children.md), "A value that a parent reads").
Reasoned on 25 November 2026, not tried, and not found weighed in `docs/rejected.md` or in the records.

**Done when** the commit says what the trial cost with the types of a `Step`, and one of three holds. The guide's
"Structuring a program" states the rule under its "Rules", with the sentence on a part that the parent reads written
again, each new promise with its test, the doc comments and the skill that name the section reread, a changelog entry,
and `bun run comments` passing. Or, where the trial shows that the API must change first, a step here says that
change, before step 69. Or an entry of `docs/rejected.md` says why the guide gives no such page.

### 69. An example of routing

**Model and effort.** Opus 5.5, `medium`.

**Depends on** no other step.

**Why.** A reader who starts a new application looks for it first, and no example shows it: flags from the URL,
`popstate` as a subscription, navigation as a command.

**How.** By `add-example`, with the History API alone: a router of another package is a dependency, which the owner
decides. [`examples/pages`](examples/pages) shows children that are there while their flags are: the step weighs
whether routing is that example with a URL, or one of its own. An example never brings the rule that allows it
(`AGENTS.md`): where routing needs a rule that the guide lacks, the rule comes first, under the "Rules" of its page.

**Done when** the example is in `examples/` as `add-example` asks, with its tests: the URL it starts from, a
navigation and a `popstate` each change what a test asserts; the README lists it; and the checks of `add-example`
pass.

### 70. React in a real browser: transitions, Fast Refresh and hydration

**Model and effort.** Opus 5.5, `high`: what a test finds is a fix of the bridge, or a promise of the guide.

**Depends on** no other step.

**Why.** The second reader has an application in React, and meets these in its first day. The bridges' tests run in
Chromium, Firefox and WebKit (`bun run test:browsers`, a job of the CI), and none of them runs: `startTransition` or
`useDeferredValue` in the application, Fast Refresh (likely to restart the run, as `<Activity>` does), and hydration:
the guide promises that `Host` and `Draw` draw the first model on a server, run under `renderToString`, and nothing of
hydration until `hydrateRoot` is run in a browser.

**How.** A test of each among the bridges' tests in a browser. Fast Refresh needs React's refresh runtime in the
page, which the browsers' setup (`tools/browser/`) may not have: the commit says what the step added to run it.
Firefox runs in the CI alone ("Any time"), so its result comes after the owner's push.

**Done when** each of the three has a test that runs in the browsers that start here, or a sentence of "Writing a
bridge" that says it is not promised, with the reason it cannot be run; what a test shows against a rule of the guide
is fixed, or is an item of "Open problems" with its `test.failing`; what the guide now promises of hydration stands
under the "Rules" of its page, with its changelog entry; and `bun run test:browsers` passes.

### 71. The reading of the guide's promises against the tests, as a skill run before a release

**Model and effort.** Fable 5.2, `high`, to write it: it decides what a release weighs.

**Depends on** no other step. It comes after steps 68 to 70, which add rules to the guide: its first run reads them.

**Why.** Since step 56, the promises are what stands under "Rules", under "What you can rely on" and in the types, and
a test checks each (`AGENTS.md`). The method of [`promises-and-tests.md`](docs/records/promises-and-tests.md) found 65
promises outside "What you can rely on" that no test checked, on 21 November 2026; step 12 wrote their tests. Nothing
has read the promises against the tests since, and the rules changed in many steps after it.

**How.** The method of the record, written in `.agents/skills/` and named by `release` and by the list of skills of
`AGENTS.md`, as `premise-review` is. With it, the examples read against the guide, which no check does: each "Don't"
of a page is looked for in `examples/`, and a comment of an example that gives a reason is reread when the rule it
rests on changes. The step decides what a release reads: every promise, or those of the sections changed since the
last reading, as the review of the premises reads the changes since a commit.

**Done when** the skill is written, `release` and `AGENTS.md` name it, and a line of "Next, in order" says what its
first run reads, before the release after 0.9.0, as the line of the review of the premises does. 0.9.0 does not wait
for it.

### 72. A reader's check that meets what no check has met

**Model and effort.** Opus 5.5, `medium`.

**Depends on** no other step. It comes after steps 68 to 70, so that the next reader reads the guide as they leave it.

**Why.** The seven requirements of [`guide-reader`](.agents/skills/guide-reader/SKILL.md) are each a page of a
browser with a value that is typed, and those that were drawn are drawn with snabbdom: each was chosen to need the
pages that the guide has. The reader who has an application in React is met by none of them.

**How.** The skill would list what a requirement may vary, and its step 3 would choose one that no earlier check had:
a program drawn with the bridge to React, a node type with no DOM, a value that an element reports, a control that
chooses among fixed values, tests that build their messages with constructors. And a third mode, an upgrade: coding
agents upgrade an application that exists to the new version, from the package and its changelog alone, and report as
a reader does. `release` would name it, for where the owner has such an application. What it finds is weighed on the
library's own terms, as the record did.

**Done when** the skill has both.

## For the owner

What leaves this machine, or decides what the project is ("Deciding" in `AGENTS.md`): an agent prepares it, and the
owner does it.

- **The release of 0.9.0**: nothing of "Next, in order" holds it. Step 65 closed the review of every change since the last release.
  An agent prepares its commit and its tag (`release`) when the owner asks for it, and the owner pushes them and
  publishes the package. The checks of point 1 of "Releasing" passed on the commit that closed step 65: commits come
  after it, so the agent runs them again.
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

- **What a real browser has not run of the bridges**, beside what step 70 runs. The bridges' tests run in Chromium,
  Firefox and WebKit (`bun run test:browsers`, a job of the CI). Firefox runs in the CI alone: on the owner's Windows
  machine, Playwright's Firefox does not start ("side-by-side configuration is incorrect"). An IME is driven in
  Chromium alone, through its protocol: Playwright drives none in Firefox or WebKit, so a composition there is not
  run.
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
  module of its own) without showing.
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
