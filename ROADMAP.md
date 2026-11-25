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

Steps 83 to 90 come before the release of 0.9.0. The owner asked for them on 25 November 2026: a bridge to React
Native (83), whether a view of React can have a `messagesSentBy` (84, 85), and a reading of the names of the API
(86, 87). Steps 88 to 90 are the agent's own proposals, which the owner may strike. The owner's fourth point has no
step: the bridges stay in `bridges/` ([`rejected.md`](docs/rejected.md), "The bridges"). Step 82 decided what the
bridge to React is on React Native ([`react-native.md`](docs/records/react-native.md)): `./react` as it is, with no
entry and no peer of its own.

Step 73 decided the form of the smaller guide ([`smaller-guide.md`](docs/records/smaller-guide.md)): `AGENTS.md`
holds it, under "What belongs here". The owner approved it on 25 November 2026, and steps 74 to 77 wrote every page by
it: each has "In short", "An example", "Rules", and "Advice" where it advises, and its ceiling of words in
`tools/comments.ts`. A doc comment names a page of the guide, never a section, and `tools/comments.ts` refuses one
that names a section; the skill, the index, the glossary, the tutorial and the README were read again against the
smaller guide (step 78). The guide went from 34,025 words to 21,807, most of what left it being in a doc comment, or in
"Guarantees", already. A promise withdrawn is a breaking change, whose changelog entry is the one that starts
"**Breaking**: unspecified, and no longer promised". No link checker runs on the guide: a step that changes a heading
reads each `](…#…)` into its page, before and after.

The next review of the premises ([`premise-review`](.agents/skills/premise-review/SKILL.md)), before the release
after 0.9.0, reads the changes since the commit that closed step 65 (`git log --grep "Close step 65"`): steps 55 and
65 together read every change since `ce1ffd1`.

### 83. React Native, named and checked

**Model and effort.** Opus 5.5, `high`: a tool of the checks, and sentences of the guide that promise.

**Depends on** no other step. [`react-native.md`](docs/records/react-native.md) decides it, point by point, and the
spike `89217b6` on `spike/react-native` holds the files that it ran, with a README of its commands.

**How.** By [`add-example`](.agents/skills/add-example/SKILL.md) and [`release`](.agents/skills/release/SKILL.md). No
export changes, and no entry or peer is added.

- **The tool.** `tools/react-native/check.ts`, run as `bun run test:react-native`, on `tools/cli.ts` as
  `tools/smoke/smoke.ts` is. It packs the package, and installs it with npm in a project of its own with
  `react-native` 0.88.1, `@react-native/jest-preset` and `@react-native/metro-config` of that version,
  `@testing-library/react-native` 14, `test-renderer`, and `jest` 29.7, the version of the `babel-jest` that the preset
  depends on. `--react-native <version>` installs another. There it typechecks the example, runs its tests with jest,
  bundles its application with Metro for iOS and for Android, with the default profile and with `hermes-stable`, and
  compiles each bundle with the `hermesc` of `hermes-compiler`, which has a binary for Linux, macOS and Windows.
  `hermesc` compiles what React Native's Babel preset made of `dist/`, so it holds only that Hermes takes it: the
  spike saw it refuse nothing. A job `react-native` of `.github/workflows/ci.yml` runs the tool, and
  `.github/workflows/renderers-latest.yml` at the newest React Native. The README's "Development" says what it runs,
  and "Checks" in `AGENTS.md` when.
- **The example.** `examples/react-native/`: the views of `counter` and of `form`, an `App.tsx` that draws both with
  `Host`, and their tests, in a file that `bun test` does not take (`views.test_jest.tsx`). `tsc -p examples` and
  oxlint leave the folder out, each by one glob, with a comment that names the tool. `add-example` and
  `examples/README.md` say so. The form's field is a `TextInput` with `value` and `onChangeText`, not `editable` while
  it saves, with no handler.
- **The tests.** The six of the spike. They are what holds that the bridge draws with a renderer of React other than
  React DOM, and that a lock by the shape of the state rejects what a handler of an older view sends. Under jest
  `TextInput` is a mock, which draws a host element with the props that the view wrote: a test there checks nothing of
  what the native view holds, and none is written as if it did.
- **The guide**, within the ceilings of its pages. In "Writing a bridge": the rules "After each draw, the element
  shows the value of its model" and "Each new state is drawn before the browser handles the next event" name React
  Native as a renderer that keeps neither at once; "The package's bridges" says that the bridge to React draws with
  React Native, a `TextInput` as its own documentation draws a controlled one; and "What is left out" says that, with
  React Native, what a `TextInput` shows until the native view takes the model's value is the element's. "Their
  tests" names the tool. A sentence that promises has a test of the six, or is not written.
- **The rest.** The module's doc comment in `bridges/react.ts` names React Native; the README says that the package
  needs nothing under Metro and Hermes, and that under jest `effect` and the package go through
  `transformIgnorePatterns`; the skill and "Coming from Elm or React" name React Native; the changelog has its entry.
- **The range of `react`.** Run `bun run test` and `bun run test:browsers` with `react` and `react-dom` at 19.3.0, the
  React of React Native 0.88.1's renderer. Where they pass, the range starts there, in `peerDependencies` and
  `devDependencies`, with the opening comment of `bridges/react.ts`, the guide, the README and a changelog entry.
  Where they fail, a sentence of the README says that the bridge needs 19.3.1.

**Done when** `bun run typecheck`, `lint`, `test`, `test:browsers`, `comments`, `smoke` and `test:react-native` pass,
and the tool was seen to fail twice: in jest, on a view that sends nothing on a press, and in Metro, on a `static {}`
block put into the installed `dist/`, which React Native's Babel preset refuses.

### 84. Whether a test can find what a view of React sends

**Model and effort.** Fable 5.2, `high`: a precedent is reopened, and the ways left pull against "Only stable APIs",
a small API and a new peer.

**Depends on** step 83: the renderer of tests that its tool installs is the second way below. Step 82 kept React
Native, its jest preset and `test-renderer` out of the lockfile ([`react-native.md`](docs/records/react-native.md),
3): the second way brings `test-renderer` into it, or runs in the tool's project alone. Under the jest preset
`TextInput` is a mock, whose host element holds the props that the view wrote. `Pressable` is not mocked there: what
its host element holds of `onPress` was not read.

**Why.** The owner asked whether React and React Native can have a `messagesSentBy`. Only snabbdom has one, where a
view returns its whole tree as data; the guide leaves a view of React to "your renderer's tools" ("Testing", "The
view").

**The precedent.** React had one, removed on 14 November 2026 (`8c3f2a1`; [`boundary.md`](docs/records/boundary.md),
item 1): it called components without React, and told `memo` and `forwardRef` by React's internal symbols. Two facts
are new. Snabbdom's was kept then as an example, and is an entry of the package now, `./snabbdom/testing`, so the same
role has a form for one bridge and none for the other (value 3). And a render by a renderer of tests was not tried.

**How.** A spike on `examples/counter/view-react.tsx`, `examples/form/view-react.tsx` and the views of step 83, and a
record, `docs/records/react-view-tests.md`. Three ways:

1. **A walk that calls no component.** The handlers are the function props named `on…` of the elements that the view
   returns, and of their `children`; a component is a leaf, whose own props are read. It needs React's public API
   alone, and fits React Native, where every element is a component (`Pressable`, `TextInput`). To weigh: a handler
   that a component of the application draws inside itself is not found, nor a row drawn by a function prop, as the
   `renderItem` of a list. Whether that is refused aloud or missed in silence decides it (value 1).
2. **A render by a renderer of tests**, and a walk of the elements it made. To weigh: a new optional peer, the owner's
   to accept; a component with hooks then draws as it does in the application; what the props of an element are on
   React Native, what the view wrote (`onPress`) or what `Pressable` made of it; and a list that draws only its first
   rows.
3. **None.** The guide shows the check with the tools that a user of React has, and an entry of
   [`rejected.md`](docs/rejected.md), "The bridges", says why the two bridges differ.

What a handler is called with differs by renderer: an event whose `target` holds `value` and `checked` for a native
element, a string for `onChangeText`, a boolean for `onValueChange`. One form of `reports` serves them all, or the
record says why not. Where the function does what snabbdom's does, it is `messagesSentBy`, in
`@fgaudo/effect-tea/react/testing`; where it does less, it has another name.

**Done when** the record says which way, with what the spike ran. Then either step 85 is written anew from it, or
step 85 is removed, and the idea is an entry of `docs/rejected.md` with what would reopen it. A new peer is asked of
the owner in one question.

### 85. What step 84 decided, for the views of React

**Model and effort.** Opus 5.5, `high`: a testing tool of a bridge, with its mutations.

**Depends on** step 84, which writes this step anew, or removes it.

**How.** By [`change-api`](.agents/skills/change-api/SKILL.md): the entry, its tests, its mutations beside those of
snabbdom's `messagesSentBy` (`tools/mutations/mutations.ts`), "Testing" and "Writing a bridge" within their ceilings,
the skill, the API report and the changelog.

**Done when** the checks of `change-api` pass, with `bun run test:browsers` and `bun run mutations`.

### 86. The names of the API, read whole

**Model and effort.** Fable 5.2, `high`: it decides breaking changes of the API, by value 3.

**Depends on** steps 83 and 85, whose exports it reads too.

**Why.** The owner asked that every name of the API, of a function, a field or a type, be right and coherent, before
0.9.0: its breaking changes go out together. [`api-review.md`](docs/records/api-review.md) decided each of the 84
exports on 24 November 2026, by the values of "Deciding", and read a field only where a change touched one. So the
fields, the options, the literal values and the type parameters have not been read as a whole, nor what the steps
since added.

**How.** Read every name that a user writes, or reads in a hover, from the API reports (`api/*.api.md`), against the
glossary: is it the glossary's word, has the same role the same form wherever it appears, and does it say what the
thing is to a user. An export that `api-review.md` kept is changed only by an argument that the record did not weigh,
which the new record names; the precedents of [`rejected.md`](docs/rejected.md), "The API", bind alike. Leads, which
are questions and not findings:

- what a declaration takes and what it makes: `ids` and `flags` in `childById`, `listed` and `flagged` in `ChildById`,
  and `kind: 'one' | 'byId'`;
- the state in what a run reports: `before` and `after` in `Applied`, `state` in `Ignored` and in `Instance`;
- the literals of `DefectSite` beside the pieces they name: `'command'` for `runCommand`, `'subscription'` for
  `listen`, `'render'`; and the fields of the defects, `where`, `cause`, `key`, `on`, `child`, `id`;
- the type parameters that a hover shows, `RC`, `RS`, `RT`, `Ran`, `Heard`, beside `commandServices` and
  `subscriptionServices` in `Program<{ … }>`;
- what a `Rehearsal` and a `Driver` have: `send` and `dispatch`, `hear` and `hearNext`, `run` and `runAll`, and
  `model`, an effect there and a function in `App`;
- the options of the tools: `held`, `candidates`, `repeatable`, `inert` and `withheld` of `dispatchViolations`,
  `patience` of `drive`, `element` and `event` of `reports`.

**Done when** a record, `docs/records/names.md`, lists each name changed, the old and the new, with its reason; a name
weighed and kept, which a reader would propose again, has an entry in `docs/rejected.md`; and step 87 names every
change, or is removed where none is made.

### 87. The names that step 86 changed

**Model and effort.** Opus 5.5, `medium`: each change is given word for word, and the compiler finds its places.

**Depends on** step 86, which writes its list.

**How.** By [`change-api`](.agents/skills/change-api/SKILL.md): each name in `src/`, the bridges, the tests, the
examples, the tools that quote the code (`tools/mutations/mutations.ts`, `tools/inference/`), the guide with its
glossary, the tutorial, the skill and the README. The changelog has one `**Breaking**:` entry for each, whose
`Upgrade:` gives the old spelling and the new, as those of step 60 do.

**Done when** the checks of `change-api` pass, with `bun run test:node`, `interleavings`, `test:browsers` and
`mutations`, and no old name is left but in the changelog and in `docs/records/`.

### 88. A reader's check of an application in React Native

**Model and effort.** Opus 5.5, `medium`, with the reader and the examiner as subagents.

**Depends on** steps 83 and 87: the reader reads the package that 0.9.0 ships. Proposed by the agent.

**Why.** Step 81 met the reader who has an application in React, in a DOM. No check of
[`guide-reader`](.agents/skills/guide-reader/SKILL.md) has met one on React Native, whom the package names from step
83 on.

**How.** A check of the package with acceptance tests, by the skill. The program is a part of an application in React
Native, whose user types into a `TextInput`, sets a `Switch` and presses, run with jest as the tool of step 83 runs its
example. Keep the reader's project beside `D:/Project/effect-tea-readers/booking-react`.

**Done when** the check has run, what it found is fixed or is a step here, and its entry is in the list of step 3 of
the skill's "Before it starts".

### 89. A check of an upgrade, across the names of step 87

**Model and effort.** Opus 5.5, `medium`, with the agent that upgrades as a subagent.

**Depends on** step 87. Proposed by the agent. Where step 86 changes no name, this step goes back to a note of "Next,
in order", for the release after 0.9.0.

**Why.** The `Upgrade:` lines of step 87 are all that a user of the package has to follow its names. An application
written before them shows whether they are enough.

**How.** By [`guide-reader`](.agents/skills/guide-reader/SKILL.md), "A check of an upgrade", on the application of
step 81's reader, kept at `D:/Project/effect-tea-readers/booking-react` with its acceptance tests and the package it
was written for, packed at `3f86a68` (`bun install` first): 21 of its own tests and 35 acceptance tests pass there.
Its `main.test.ts` imports `main` once happy-dom is registered, and the acceptance tests run alone, as the skill says:
run with the reader's tests in one `bun test`, 8 fail, both files registering a DOM.

**Done when** the application, brought to the package packed after step 87 from the package and its changelog alone,
passes its own tests and the acceptance tests, and each gap of the changelog is fixed.

### 90. The first reading of the promises by the skill

**Model and effort.** Opus 5.5, `high`, with its readers as subagents: it is a review.

**Depends on** steps 83, 85 and 87, so that it reads the sentences and the names that 0.9.0 ships. Proposed by the
agent: until 25 November 2026 it was due before the release after 0.9.0, and 0.9.0 did not wait for it.

**Why.** Two facts are new. 0.9.0 now waits for steps that break the API, and a promise that the reading withdraws is
a breaking change too: it goes out with them, so that users upgrade once. And it is the first reading of a doc comment
or of an example, before the library is made known.

**How.** By [`promise-reading`](.agents/skills/promise-reading/SKILL.md): the promises against the tests, and the
guide's rules against the examples. It reads everything: the one reading before it
([`promises-and-tests.md`](docs/records/promises-and-tests.md), at `b6db847`) read the guide alone, which steps 56 and
73 to 78 wrote again since, and nothing has read a doc comment or an example. It reads the guide as steps 70, 81, 83
and 85 left it: "Writing a bridge" promises what the bridge to React does under hydration and transitions, and the doc
comment of `Host` what it does under Fast Refresh, each held by a test that runs in the browsers
(`bridges/react.test.ts`, `bridges/fast-refresh.test.ts`). Of the API's reports it reads the diff since `v0.8.0`. A
trial of its two briefs, on "Commands" and on three examples, reported six gaps of "Commands", which the session did
not check against the tests: the reader's table is not kept, and the reading finds them again. A comment of an example
that names a section of a page may name one that steps 73 to 78 took away, as one of `examples/bounce/bounce.ts` did.

**Done when** the reading has run by the skill, and each finding is fixed, or is an item of "Open problems" with its
`test.failing`. The readings after it read the changes since the commit that ends it.

## For the owner

What leaves this machine, or decides what the project is ("Deciding" in `AGENTS.md`): an agent prepares it, and the
owner does it.

- **The release of 0.9.0** waits for steps 82 to 90 of "Next, in order", as the owner asked on 25 November 2026. Step
  65 closed the review of every change up to it, and each step since is read by its own reviewer ("How the steps
  run"). An agent prepares its commit and its tag (`release`) when the owner asks for it, and the owner pushes them
  and publishes the package. The checks of point 2 of "Releasing" passed on the commit that closed step 65: commits
  come after it, so the agent runs them again.
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
  Firefox does not start ("side-by-side configuration is incorrect"), so the tests of hydration, transitions and Fast Refresh
  that step 70 added ran in Chromium and WebKit, and run in Firefox after the owner's push. An IME is driven in Chromium
  alone, through its protocol: Playwright drives none in Firefox or WebKit, so a composition there is not run.
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
