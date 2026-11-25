# Roadmap

What is to be done now, and nothing else. Each step names its model and effort, what it depends on, and how to tell
that it is done, and its choices are made by "Deciding" in [`AGENTS.md`](AGENTS.md), without the owner. A step done
is removed, with the reason in the commit, and leaves its number unused. An item rejected goes to
[`docs/rejected.md`](docs/rejected.md), and one deferred to its "Parked, not rejected", with what would reopen it, in
the same commit. How an item came to be is in a record of [`docs/records/`](docs/records), or in the commits, not
here.

A step for Fable 5.2 runs on Opus 5.5, `xhigh`, while Fable is not available.

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

Step 64 applies what step 61 decided on 24 November 2026, when it weighed the decisions taken before the charter, and
the invariants, by the values of "Deciding" ([`decisions-weighed.md`](docs/records/decisions-weighed.md)), whose first
three points steps 62 and 63 applied. Step 64 comes after the step of the engine, 54: it is the largest, and may
stop with a report, so its fix does not wait for it. Step 55 comes last, before the release that follows them all, so
that one release carries every breaking change.

### 54. The rule as a boundary: a tool decides when, never what

**Model and effort.** Opus 5.5, `high`: a rule of `docs/invariants.md` said again, with the line of `change-engine`
that links to it, each sentence checked against the code.

**Depends on** no open step. Since steps 50 to 52, `src/testing/` uses none of the six: what it takes of `shell.ts` is
`makeDeaths`, `startFiber`, `commandFiber` and `stopping` (`drive.ts`, `rehearse.ts`, `simulate.ts` and `stage.ts`),
so the check passes once it is written.

**Why.** After them, each tool that plays a program runs it on the engine, and "when the engine or one tool changes,
keep the others in step" (`docs/invariants.md`, `change-engine`) is a duty with nothing left to keep.
What keeps the tools aligned is then a structure, which a check can hold where a duty could not.

**How.**

1. A check, in `bun run lint`, that fails when a module of `src/testing/`, its tests aside, uses `Core.arrive`,
   `Core.reconcile`, `diesIn`, `scopedIn`, `rootedIn` or `runSubscription`. The library's modules are imported as
   namespaces, so `no-restricted-imports` cannot name a member: either `src/testing/` is forbidden `core.ts` and
   `shell.ts` whole, and takes what it may use from `engine.ts` and `run.ts`, or a script reads the uses, as
   `tools/comments.ts` reads the doc comments. The smaller of the two, seen to fail on a use put back by hand. A lead
   to weigh: since step 53, a tool names a value in its errors by one function, `failure` in `testing/failure.ts`,
   which throws nothing; the same check may refuse `Inspectable` and `describeByTag` in the other modules of
   `src/testing/`, where it costs no more than a name.
2. The rule said as it then is, in `docs/invariants.md` ("The testing tools behave like the engine"), its one place
   since step 58, and in `change-engine` (point 4 of "Before the change") as a line that links to it: a tool that
   plays a program runs it on the engine; it decides when a command runs, when a subscription's message is heard and
   what fails the test; and it makes no step, no scope and no site of a defect. `AGENTS.md` names the invariants by a
   link alone since step 58.
3. The contract, `contract.test.ts`, read case by case: a case that gives a tool what the engine alone now does is
   held by the engine's tests and mutations. Each stays as an alarm or goes, by "Deciding", and none goes that a
   mutation still names as its killer.
4. The guide's "Testing tools" says "as the run does" of each tool already: it changes only if a sentence is found
   that the code no longer keeps, and then as `AGENTS.md` says.

**Done when** the check runs in `bun run lint`, and was seen to fail on a use put back by hand; the two documents
say the rule; each case of the contract is kept or removed, with its line in the commit; and `bun run comments`,
`bun run lint`, `bun run test`, `bun run test:node` and `bun run mutations` pass.

### 64. What an element gives is a message that the model holds, and inputs go

**Model and effort.** Opus 5.5, `high`: a page of the guide is a specification, and a concept leaves `compose.ts` with
its checks.

**Depends on** step 54, which comes before it, so that its fix does not wait for the largest step. Step 62
made a program's state any value, in the types of `program.ts` and `compose.ts`. Step 61 decided it
([`decisions-weighed.md`](docs/records/decisions-weighed.md), point 4), and change 11 of
[`api-review.md`](docs/records/api-review.md) spells what the API loses.

**Why.** A model holds a message without its value, and the view fills what the element gives ("Inputs", "What an
element reports"). An input does the same job by a second concept: a place declared in `make`, a write that no model
holds, a rule of `set` that nothing checks, and a tool for that rule. One way is left: what the user types is a
message of the program, as a click is, and `update` decides what it does.

**How.** By `change-api`, `change-engine` and `add-example`, in this order, since each is checked before the next:

1. **The examples first, on the library as it is**: `examples/form`, `examples/stocktake` and the named timers of
   `examples/timer`, each with its views and its tests. A value that an input held is a message of the program, named
   by what happened (`NameTyped { value }`, and `CountTyped { id, value }` for a row). `update` stores it where the
   input's place was there, and rejects it elsewhere. The model holds its held part, `{ _tag: 'NameTyped' } as const`,
   in each case where the view draws the element to be written into. The reader of each test fills the held messages,
   with a value other than the one the model shows, and gives them to `dispatchViolations` with the rest. A test of
   `placeViolations` goes: `update` is tested there as for any message. If a value is found that an input serves and a
   held message cannot, the step stops here, with a report, and changes nothing.
2. **The guide**, one section at a time, each sentence checked against the old one. A rule that still holds keeps its
   words.
   - The page "Inputs" becomes "What an element gives" (`site/guide/what-an-element-gives.md`), and says what the user
     types and what an element reports one way. Its first rule: "**What an element gives is a message of the
     program**, as a click is: `update` decides what it does. The model holds the message without the value, and the
     view fills it." "Why what the user types is no message", the rules of an input and of a `set`, `store` and
     "Inputs by id" go. What is typed in another form is what `update` stores. A lock is a case of the state in which
     `update` rejects the message and the model holds none. "The element on screen", "What is there whatever is drawn
     is a subscription" and "A value is never a reason to reject" stay. "Only a plain tagged message can be held
     without a value", under "What an element reports" of that page, loses the way of a write, then a message: a
     message that an element fills is a plain tagged one.
   - "Model", "Messages live in the model": the bullet on what the user types goes, and the bullet on a fact that comes
     with a value says it of every value that an element holds or reports, the text of a field first. The sentence "A
     view writes only into the inputs that the model shows" goes, and "Its shape says what the view shows" says the
     values that the view draws in a case, where it said the values of the inputs.
   - "Guarantees": "An input stores what is written, where its place is there" leaves "What you can rely on", since
     "Outdated clicks are harmless" holds of what is typed as of a click. "What is left to you" loses "A `set` changes
     its place, and nothing else", and what "A view sends only what its model holds" and the item "Flags, and what `key`
     gives, made of values that `Equal` compares by value" say of an input. Its item on the stack of whoever sends the
     message says "An element that reports at each of its events, as a scroll does, runs a step at each, in its
     handler", with no sentence on a write. Its item on purity loses "the `get`, the `set` and the `store` of an input
     and an `at` that is a function of the id" from the functions that are pure, and "the `get`, the `set` and the
     `store` of a write" from what runs in the parent's `update`. "How the tests check them" follows the search.
   - "Running", "When a defect happens": "A function that a parent or an input gives" says "A function that a parent
     gives", and the item of `'update'` loses "the `get` and the `set` of an input".
   - "Rejections and defects": "A message of the view that is not a write into an input is rejected" says "A message
     of the view is rejected", the "Three other kinds of message" are two, and the table loses its row of a write. The
     sentence after the table stays: a screen older than the state is that of a message of the view.
   - "Coming from Elm or React". Elm's row of `onInput` says "A message for each keystroke too: the model holds it
     without the text, and the view fills it". Under "What is new", "Inputs" becomes "**A message that an element
     fills.** As in Elm, what the user types is a message, and `update` stores the text. The model holds the message
     without the value, and the view copies the value from the element into it", and a fact that comes with a value
     is said there as another case of it. React's row of a controlled `<input>` says "A controlled `<input>` too:
     `value` is the model's, and `onChange` sends the message that the model holds for it, filled with what the
     element holds". Each links the new page.
   - "View", "Rules": the sentence on an element with a value of its own links the new page.
   - The guide's index has `./what-an-element-gives.md` among its `children`, where `./inputs.md` was. Its item of
     "Composition" says "a parent declares its children, and says where each child lives in its state", and that of
     the page: "[What an element gives](./what-an-element-gives.md): values that an element holds or reports, such as
     the text of a field or the offset of a scroll. Each is a message that the model holds without its value, and that
     the view fills."
   - "Composition": "The parent's inputs", "The rule of an input" and what names an input under "What does not
     compile" go. "A row whose value the parent reads" says a message of the parent's own, with the row's id.
   - "Events and external messages" loses "An external message never writes into an input". In "Structuring a
     program", "Input is never a reason to reject" becomes a case of "A value is never a reason to reject", and the
     table of "What kind of thing is it" names no input.
   - "Testing" and "Testing tools" lose what a reader does for an input, "The place of an input" and
     `placeViolations`. In "Writing a bridge", the handler of a controlled element "sends the message that its model
     holds for it, filled with what the element holds".
   - The glossary loses **Input**, **Write** and **`at`**, and what **Controlled element**, **Composition** and **By
     id** say of an input. "Anatomy of a program" draws its loop with no input.
   - The fourth step of the tutorial teaches the same, as "What the user types"
     (`site/tutorial/4-what-the-user-types.md`, where `4-inputs.md` was). The tutorial's index follows, in its
     `children`, in its items of steps 4 and 5 and in its sentence on a native controlled element, and so do the links
     of `1-first-program.md` and of `3-children.md`, and "An input" of `5-testing.md`, which says how a test fills a
     held message.
   - Then a search of what a user reads is read line by line
     (`git grep -n -i -w -E "inputs?|writes?|written" -- site skills README.md`), once point 4 has changed the skill
     and the README: what is left names an `<input>` of the DOM, what the user writes or types, or what a program, a
     test or a tool writes as code. And `git grep -n -e 'inputs\.md' -e '4-inputs' -e '"Inputs"'` finds a line only
     in this step, in the released sections of `CHANGELOG.md`, in `docs/records/` and in `docs/rejected.md`: no link,
     no `@see` line of a doc comment, and not the example in the header of `tools/comments.ts`.
3. **The library**, as change 11 spells it. `src/input.ts` and `src/testing/place-violations.ts` go, with their tests.
   `src/compose.ts` loses the placements, the routing of a write, and what its types say of an input (`Inputs`,
   `InputMessages`, `NoShared`, and the half of `NoClash` on an input). In `src/dispatch.ts`, the two refusals of
   `forwardTo` take the keys that change 11 spells, and the doc comments of `IdOf`, of `ChildDispatch` and of
   `forwardTo` name a child alone, with no line on `Written` and no `@see` of "Inputs". `src/dispatch.test.ts` reads the
   new keys, in a test whose name says that a name is no child's. Each mutation of an input goes, or loses "or of an
   input". The tests of the library, of the bridges and of the tools that wrote into an input send a held message:
   `bridges/bridge.test_suite.ts` and the bridges' own tests, `src/interleaving.test.ts`, the tests of the testing
   tools, `tools/smoke/`, `tools/inference/` and `tools/bench/writes.ts`.
4. **The documents.** In `docs/invariants.md`, "A write is stored wherever its place is there" goes, and "What a screen
   shows of an input is the bridges'" says it of a controlled element, under a title that names one, with its reason
   said of a message that an element fills. "The children are those the parent's own state lists" loses "a write into
   its input" from the steps of the parent's own code, and "as a write does" from what a message of a view carries.
   `docs/premises.md` cites the invariant of the bridges by its new title, in the premise of a store updated outside its
   events. In this file, the item of "Any time" on a benchmark says what `tools/bench/writes.ts` measures once point 3
   has written it again. Then a search of the three is read line by line
   (`git grep -n -i -w -E "inputs?|writes?|written" -- docs/invariants.md docs/premises.md ROADMAP.md`): what is left
   names an `<input>` of the DOM, what a thunk or a tool writes, or the inputs as what this step took away. In
   `docs/rejected.md`, the entries whose subject is a form of an input are gathered in one, "An input declared
   in `make`, whose writes the library stores", which says why it went, and what would bring it back: a value of an
   element that a held message cannot carry, or programs that lose what is typed where their tests with
   `dispatchViolations` pass. "An entry of each input in the model", "A write, then a message" and "`hear` refusing a
   write into an input" are set right: each says of an input what was, the first names no step of this file, and the
   second loses "It stays the way for a message that is a class". An entry on something else keeps the names of its
   day, since it tells what was weighed then, and is not edited: "`write`, `isRejected` and `raise`", "`child`,
   `childById`, `input` and `inputById` as free functions", "Other names for `childById` and `inputById`" and their
   like. So `docs/rejected.md` is outside the search of "Done when". The skill, the README, the doc comments and the
   changelog follow, the last as change 11 words it (`release`). In the README, the rows of `form`, `stocktake` and
   `timer` say what each example shows then, and the link to the page is the one that the built site gives it. In the
   unreleased section of the changelog, the entry on the page "Inputs" names the page by its new title. The documents
   of the agents follow too:
   - `AGENTS.md` and `.agents/skills/change-engine/SKILL.md`, in its description and in its first paragraph, list the
     modules of the engine without `input.ts`. In `AGENTS.md`, under "A function earns its place", the declaration
     that takes a standard type of Effect is the `flags` of a child, an `Option`, where it was `at`, an `Optic`.
   - `.agents/skills/add-example/SKILL.md`. In its item "The view", the sentence on an input declared in `make` says
     that a native controlled element has the value that its model holds in `props`, no key, and a handler that sends
     the message that its model holds for it, filled with what the element holds, as "What an element gives" says. In
     "A bridge owes no `messagesSentBy`", the clause on a view with an input that expects its writes goes: a held
     message is in `messagesOf(model)` already. Its last paragraph names the fourth step of the tutorial by its new
     title, with the modules of `examples/timer` that the step has then. Its first paragraph names no optics: no
     example places a child with one.

**Done when** the examples, the tutorial and the bridges' tests send what an element gives as a held message; what
change 11 removes is named in no file, `AGENTS.md` and those of `.agents/skills/` included, but `CHANGELOG.md`, in its
released sections and in the entry of change 11, `docs/records/` and `docs/rejected.md`, which keep the names of their
day; the two searches of point 2 leave what it says; and `bun run typecheck`, `bun run lint`,
`bun run test`, `bun run test:node`, `bun run interleavings`, `bun run comments`, `bun run build`,
`bun run api --check` once `bun run api` has written the reports, `bun run smoke`, `bun run inference`,
`bun run mutations` and `bun run test:browsers` pass, and the site builds with no warning
(`cd site && bun install && bun run build`).

### 55. The review before the release

**Model and effort.** Opus 5.5, `high`, by a reviewer that wrote none of the changes
([`premise-review`](.agents/skills/premise-review/SKILL.md)).

**Depends on** steps 54 and 64, and comes before the release that follows them.

**Why.** Steps 49 to 54 move a check from a tool to the engine, or take one away with the code it guarded: a premise
may leave with it, and no test fail. From step 52 on, `simulate` rests on the engine's premises, and no longer on
those of a fork of its own. Step 56 made the guide promise only its rules, and steps 57 to 60 change what it
promises, and how the API is written. Step 57 made a state current only once its keys are, a defect of `subscriptions`
leaving the state as it was (`applyOne` in `engine.ts`, and `stepped`, which the stage of the tools reads), and added
the premise of one channel run again, the first on the user's own value. Steps 62 to 64 each take an invariant away:
a state that is an object, with a child's model kept by its instance since; the end's own report of the defects, read
from the register alone since; and the rule of an input.

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
  What one step with many keys costs was measured by hand in step 57 ([`left-points.md`](docs/records/left-points.md),
  the last item): a start for its cases.
- **A devtools bridge over `onApplied`** (e.g. Redux DevTools), with time travel through `init: { state }` and
  replay through `applyAll`.
- **An example of routing**: flags from the URL, `popstate` as a subscription, navigation as a command.
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
- **The reading of the guide's promises against the tests, as a skill run before a release**: since step 56, the
  promises are what stands under "Rules", under "What you can rely on" and in the types. The method of
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
