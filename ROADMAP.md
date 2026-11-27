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

None.

## Next, in order

The readings due before the release after 0.9.0 are done (`release`, point 1 of "Releasing"): the review of the
premises closed by step 99 (`git log --grep "the premises reviewed since step 65"`), and the reading of the promises
closed by step 100 (`git log --grep "the promises read since step 90"`). The next of each reads the changes since its
commit. The next review of the premises reads the premise that step 106 added by the model, that the `Fiber` a fork
returns is the very one its effect sees as its own (`docs/premises.md`, "Code that a fiber runs on the stack"), and
what `Effect.interruptible` fails with, left a premise of tests alone.

### 107. Drop the premises that serve only an `Equal` or a `Hash` that throws

**Model and effort.** Fable 5.2, `high`: premises and an invariant questioned.

**Depends on** no other step. The fact: since 26 November 2026, an `Equal` or a `Hash` that a program writes and that
throws is undefined ("Guarantees", "What is left to you", commit `9759da7`), so a program that keeps the rule can see
neither when they are called nor where what they throw goes. Three premises of `docs/premises.md` may serve that case
alone: that `HashMap` calls a key's `Equal` and `Hash` only during a call of its functions, that it lets what they
throw leave that call, and that `Equal.equals` and `Hash.hash` let it leave the call. Shown on 27 November 2026: with
the `FiberMap` of `engine.ts` keyed by `K`, `typecheck`, `test`, `test:node` and `interleavings` pass, and no test of
the run has a key whose `Equal` throws.

Decided as the lead was weighed, on 27 November 2026: the engine keeps the fibers of its subscriptions by their start.
Keyed by `K`, no line goes, `Generation` stays for a message's `Source` and for `rehearse`'s ledger, the map alone
would differ from every other register of a start, and `FiberMap` would call the program's `Equal` and `Hash` at each
`get` and `run`. The comment of `subscriptionFibers` gives that reason in place of the throw. Each premise is read
against correct programs before it goes: one that a program keeping the rules can observe stays, said for that
program.

**Done when** each of the three premises is out of `docs/premises.md` with its tests in `test/premises.test.ts`, or
stays with the correct program it serves; `docs/invariants.md` ("Keys and their `Equal` and `Hash` are the
program's") and the comments that cite these premises in `src/` say what holds without them; the checks of
`change-engine` pass, `bun run mutations` among them. No changelog entry: no consumer can notice it.

## For the owner

What leaves this machine, or decides what the project is ("Deciding" in `AGENTS.md`): an agent prepares it, and the
owner does it.

- **0.9.0** is committed and tagged `v0.9.0`, locally, on 26 November 2026, after the checks of point 2 of
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
