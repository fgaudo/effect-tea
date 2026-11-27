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

- `Stage`'s `arrived` slot (`src/testing/stage.ts`) is one for calls that could nest: a fiber that `deaths.release()`
  wakes on the caller's stack, and that applies a command's answer through `applyFor` there, would overwrite the
  outer call's `Arrived`. Shown by a `rehearse` whose `send` fails on a model that throws without waiting for its
  job; the bug hunt of 27 November 2026 could not reach that stack.
- In `rehearse`, a command and a subscription run with the context of the call of `run`, not the run's external span
  (`withExternalSpan`): their logs are events of the test's span. Shown by a count of that span's events over a long
  rehearsal.
- `Host`, shown again by `<Activity>`, draws the ended run's last model until the new run gives its own, and a handler
  of that frame sends to a stopped engine, which drops it; the old run's release may overlap the new run's start.
  Shown by a test of that frame, or a user's report of a lost click; the guide says nothing of it.
- A child named `__proto__`, `withChildren({ __proto__: child(p) })`, compiles, while JavaScript's object literal sets
  the prototype with it: `Object.keys` and `Object.hasOwn` (`compose.ts`, where `make` reads the children) see no
  child, and the types see one. The mirror of the numeric names `withChildren` now refuses. Shown by a test of
  `make` with that child, beside the test of names in `compose.test.ts`; `""`, `constructor` and `"a-b"` compile too.

## Next, in order

The next reading of the promises reads the changes since the commit that read them before 0.11.0
(`git log --grep "the promises read for 0.11.0"`), and is due before 0.12.0. The next review of the premises is step
121, over all of the code. It reads nothing of an `Equal` or a `Hash` of the program that throws: step 107 dropped the three
premises that served that case alone, by the rule it left in `docs/premises.md` ("What no program that keeps the
guide's rules can see").

### 118. Each region nothing may interrupt has a mutation, killed by one sweep of interruptions

Opus 5.5, `high`. Depends on nothing. The bug hunt of 27 November 2026 (commit `73aeb05`) found that `run` marked its
start and its end outside one region nothing interrupts, which no test reached: `docs/invariants.md` exempted such
regions from mutations, as no gate reached them, while whoever runs the program interrupts at any yield of the
scheduler. `run` now has its region, a mutation that takes it out, and a killer in `start.test.ts` that sweeps
`Scheduler.MaxOpsBeforeYield` with `MixedScheduler`; `rehearse.test.ts` ("rehearse, interrupted by whoever runs it as
it sets up") sweeps an interruption at the nth preemption under `scheduled`, and counts the fibers left.

- One helper of the tests sweeps an interruption by whoever runs the program at each yield, with a row for `run`,
  `drive`, `rehearse` and `simulate`, and the post-condition of each: never begun, or stopped; no fiber left; every
  scope closed. The two sweeps of today become rows of it. The bridges need no row: `Host` forks the `run` that `start` gives, and the bridge to snabbdom is given an app
  whose `run` its caller forks.
- Each other region nothing may interrupt has a mutation that takes it out, killed by its row: the fork of the fiber
  of effects (`engine.ts`, the end of `effectsIn`), `Stage.play`, and the region of `drive`.
- Not an interruption at each yield inside `bun run interleavings`: its properties are written against `settled`, and
  a property is no killer. A fate "interrupted without awaiting `idle`" is a lead at most.

Done when each region of `docs/invariants.md`, "A region nothing may interrupt", names its mutation, and
`bun run mutations` kills them all.

### 119. What `messagesSentBy` takes of snabbdom is a premise, with a test against snabbdom itself

Opus 5.5, `medium`. Depends on nothing. `messagesSentBy` (`bridges/snabbdom-testing.ts`) imitates how snabbdom calls a
listener, which snabbdom does without promising it: its tests checked it against what was expected, never against
snabbdom, and it called a listener drawn by a `thunk` with the wrong node until commit `73aeb05`.

- An entry of `docs/premises.md`, beside the two premises of the bridge to snabbdom: what `messagesSentBy` takes of
  snabbdom (a listener called with its node as `this` and as its second argument, a list of them in order, a `thunk`
  drawn as `copyToThunk` draws it).
- Its test, in `bridges/snabbdom-testing.test.ts`: small trees made by fast-check (thunks, thunks in thunks, lists of
  listeners, comments and text), drawn by snabbdom in happy-dom, as `bridges/snabbdom.test.ts` draws, and each listener
  called by a click there, each giving what `messagesSentBy` gives. The deterministic test of the thunk stays, the
  killer of its mutation.
- No rule for every imitation of a dependency: this is the one, the scheduler has `test/effect-scheduler.test.ts`, and
  `premise-review` reads the premises at each release.

Done when the premise names its test, and the test fails once by hand with the thunk drawn as before `73aeb05`.

### 120. A table of the names of children, in the test of the types

Opus 5.5, `medium`. Depends on nothing. The test of `compose.test.ts` that refuses a child named by a number becomes a
table of names: a number, a number in quotes, `""`, `constructor`, `"a-b"` and `__proto__`. Each is refused by the
types, or compiles and is one child to `make` as to the types, its messages, events, commands and keys routed to it.
`__proto__` is the lead of "Leads": the table shows it or closes it, and one shown is refused as the numbers are, in
the breaking entry of 0.12.0.

Done when each name of the table is refused or routed, and the lead of `__proto__` is gone from "Leads".

### 121. The review of the premises reads every form of this bug hunt, over all the code

Opus 5.5, `high`. Depends on 118, 119 and 120, so that it reads the code they leave. The bug hunt of 27 November 2026
found four bugs in code that three reviews of the premises had in their scope (21, 24 and 26 November): their brief
named none of the four forms, and read the changes since the last review, of the engine and the testing tools alone.

- `premise-review`: its "THE KIND OF BUG" names the four forms: an interruption by whoever runs the program at a yield
  of the scheduler; a cost that grows with the number of messages; a name that the types drop and `make` does not; a
  tool that imitates a dependency. Its reviewers read four areas apart: the engine, the testing tools, the types of
  composition, and the bridges. It reads all of the code before the library is made known, as before 1.0.
- Then one review over all of the code, one reviewer for each form rather than each area, as the skill says otherwise:
  each finding an open problem with its `test.failing`, each fix by its form. It is the review of the premises due
  before 0.12.0. A review over all the code is made again while the last one confirmed a bug.

Done when the skill names the four forms and the four areas, and a review over all of the code confirms no bug.

## For the owner

What leaves this machine, or decides what the project is ("Deciding" in `AGENTS.md`): an agent prepares it, and the
owner does it.

- **0.10.0** is published. It holds the first bug of the hunt of 27 November 2026, as 0.8.0 and 0.9.0 do: a `run`
  interrupted as it begins may leave a program that applies messages and reports none of their defects.
- **0.11.0** is committed and tagged `v0.11.0`, locally, and holds that bug too. The agent's choice: publish no 0.11.0
  alone, and publish 0.12.0 once steps 118 to 121 and the reading of the promises are done, so that users upgrade
  once from 0.10.0, through the breaking changes of both, to a version with the fix. Publishing 0.11.0 now gives users
  its changes a few days sooner, with the bug, and a second upgrade after. Either can be undone only until it is
  published.
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
