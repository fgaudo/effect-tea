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
Where the step changes what `change-engine` covers, or the types of an export, an agent that wrote none of it, on
Opus 5.5 at `high`, then runs the checks of its "Done when" and reads its diff against "Deciding" and the step, and the
step against `docs/invariants.md`; the first agent fixes what it finds, twice at most. A step of names, of documents or
of a tool of `tools/` is read so by the agent that did it. A step whose checks still fail stops the chain, with a
report. A step ends in one local commit, with its decisions in the body, and takes itself out of this file. Before each
step, the use of the owner's plan is read where a tool reports it: a step that the rest of the week cannot pay for waits
for the reset.

## Open problems

A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a deterministic
test of it. A finding of a review goes here with its `test.failing`, until its fix removes the mark and the item. A
problem whose fix is due before a step of "Next, in order" leaves this list for a step of its own there.

## Leads

What a task or a review found that no failing test shows and no user met ("How a decision is taken and kept" in
`AGENTS.md`): a line each, with what would show it, as the test of the types that would hold a lead of the types, or
the case of the inference matrix (`bun run inference --filter <case>`). None is a step of its own: they are weighed
together before a release, and one not taken then goes to `docs/rejected.md`.

- `child(program, { flags })` for a program without flags, `{ key }` beside a `there` or `flags` for one with flags,
  and `childById` given `ids` for one with flags or `flags` for one without, print that the option takes `never` (or
  `undefined`), the first with its `state` typed `any`; `childById` reports its last overload whichever option is
  wrong, which a third overload, as `child` has since step 111, would fix. A probe of each call, `tsc` on it, shows it.

## Next, in order

Steps 112 and 113 come from the report of an application moved to 0.10.0, weighed on 27 November 2026
([`application-report-0.10.md`](docs/records/application-report-0.10.md)), as step 111 did, and run in the order of
their numbers. Each decides its point by "Deciding": a step that decides against its point writes its entry of
[`rejected.md`](docs/rejected.md), and is done. Their changes go out together, in the release after 0.10.0.

The next review of the premises reads the changes since the commit that closed step 99 (`git log --grep
"the premises reviewed since step 65"`), and the next reading of the promises those since the commit that closed step
100 (`git log --grep "the promises read since step 90"`). The review of the premises reads the premise that step 106
added by the model, that the `Fiber` a fork returns is the very one its effect sees as its own (`docs/premises.md`,
"Code that a fiber runs on the stack"), and what `Effect.interruptible` fails with, left a premise of tests alone. It
reads nothing of an `Equal` or a `Hash` of the program that throws: step 107 dropped the three premises that served
that case alone, by the rule it left in `docs/premises.md` ("What no program that keeps the guide's rules can see").

### 112. A parent on React Native, whose page comes and goes

**Model and effort.** Opus 5.5, `medium`.

**Depends on** no other step.

**Why.** No example reads `children.X.instance()`: the advice of "Composition", a dispatch that names its instance
and the number as the key of the child's view, has no code, and its form in React is in no page
([`application-report-0.10.md`](docs/records/application-report-0.10.md), point 10). An application followed it from
the text alone. Step 92 reasoned the advice and ran none of it
([`instance-in-view.md`](docs/records/instance-in-view.md), 5), and the example waited under "Any time" for such a
report. The same example shows two things that the report's agent worked out alone (points 5 and 6): a child declared
with `there`, read as one `Option`, and a back button.

**How.** By [`add-example`](.agents/skills/add-example/SKILL.md), in
[`examples/react-native`](examples/react-native), which draws no parent today.

- A parent with a page declared with `there`, which each visit starts again.
- Its `makeModel` reads the page once, with `Opt.all` of its instance and its model.
- Its view gives the page's view `forwardTo(dispatch, { _tag, instance })`, and the number as its `key`.
- React Native's `BackHandler` is a subscription of the parent, listed only while something takes the press: the
  parent's `subscriptions` reads the page's `output`, and its `update` tells the press to the page.

Weigh whether a second level of children earns its place: each level repeats the lines of the first. Advice of one
program is a comment in its code, and the example brings no rule. Under jest, a message of a view drawn for an earlier
visit is rejected: the test keeps the dispatch of the earlier draw. What a tap does on a device stays for an
application's report: the report's application ran on none.

**Done when** `bun run test:react-native` passes, with the tests of the parent among those it runs; "Composition",
"Advice", names the example; the row of the example in the README says what it shows; and `bun run comments` passes.

### 113. What the report asks of the guide, of the doc comments and of the changelog

**Model and effort.** Opus 5.5, `medium`.

**Depends on** step 112, for the example that the advice names.

**Why.** Four things that the code does and no page says, or that a page says in a way that was read wrongly, and the
order of a changelog's section ([`application-report-0.10.md`](docs/records/application-report-0.10.md), points 3 to
8).

**How.** Each sentence is judged by the test of "What belongs here" in `AGENTS.md`, and goes to a doc comment first.

- **The candidates of a child that is not there.** "Testing", "The reader", says that where the view's dispatch names
  the instance of a child, "the `candidates` of that child name it too". A test read it as a number for every
  candidate, and made up one for a child that is not there. Such a candidate names no instance, or is left out: either
  way `update` rejects it.
- **`applyAll` takes `external`**, as it takes `update`: both are a function of a message, then of a state, and it
  gives the commands and the events as lists that are always there. It compiles today, and its doc comment speaks of
  `update` alone. Its doc comment, and "Testing", "How a program is tested". As a promise, its test is named, or
  written. Weigh the name of its first parameter.
- **What a parent tells in the step that read an output.** "Rejections and defects", "What 'cannot arrive' rests on",
  says that nothing else makes that promise. But `update` and `external` read the outputs as they were before the
  step, and what the step tells arrives once the step is taken ("Events and external messages"). So where the step
  keeps the child, and tells it before anything else changes it, the child is in the state whose output the parent
  read, and its `external` may answer with `defect` what that output rules out. Say when it holds, and when it does
  not: a step that starts the child again, and a child told after another one whose event its parent handled. As a
  promise, its test is named, or written.
- **A child that goes with a case of its parent's state.** "Composition", "Advice". A parent reads a child declared
  with `there` once, as one `Option`, and makes its model from it where that the child is there is all it reads, as
  [`pages`](examples/pages/app.ts) does. Where a case of its state holds more, the case and the child go together by
  the parent's own `there`, and "Guarantees" promises that a parent's children are those its state lists: a `None`
  there is a `defect`. The example of step 112 is the code.
- **The changelog** ([`release`](.agents/skills/release/SKILL.md)). An entry that changes what is installed with the
  package, as a peer range, is the first under "Changed": two upgrades by agents ran on an Effect below the range,
  which bun installs with no warning. And `Upgrade:` says, where the old spelling still compiles, how to find its
  places. Both are written into the sentences of the skill on a breaking entry, with no rule added beside them. The
  section of 0.10.0 is put in that order too.

**Done when** `bun run comments` passes with each page under its ceiling, or with a ceiling raised and the reason in
the commit; each promise added has a test that the commit names, and a changelog entry; and `bun run typecheck`,
`bun run lint` and `bun run test` pass.

## For the owner

What leaves this machine, or decides what the project is ("Deciding" in `AGENTS.md`): an agent prepares it, and the
owner does it.

- **0.10.0** is committed and tagged `v0.10.0`, locally, on 27 November 2026, after the checks of point 2 of
  "Releasing" passed on it: the owner pushes the commit and the tag, which deploys the site, and publishes the package.
- **1.0.** Not before the library has been made known and used by others for at least one or two months, as the owner
  decided on 20 November 2026: only then may 1.0 be decided, with what its users have asked of the API, after a
  reading of the promises and a review of the premises over everything. Until then, releases stay at 0.x.

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
