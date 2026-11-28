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

None open.

## Leads

What a task or a review found that no failing test shows and no user met ("How a decision is taken and kept" in
`AGENTS.md`): a line each, with what would show it, as the test of the types that would hold a lead of the types, or
the case of the inference matrix (`bun run inference --filter <case>`). A form that no page shows is no lead ("What
the library owes, and to whom" in `AGENTS.md`). None is a step of its own: they are weighed together before a release,
and one not taken then goes to `docs/rejected.md`.

Those found before 0.11.0 were weighed on 27 November 2026, and the last of them taken on 28 November 2026. None open.

## Next, in order

0.11.0 is not released: the readings made for it, in commit `5f13b2b`, are made again before it, over what came after
them. Step 121 made the review of the premises again, over all of the code; the reading of the promises is step 124,
made once every step before it was done, so that it is not made a third time. A review of the premises reads nothing
of an `Equal` or a `Hash` of the program that throws: step 107 dropped the three premises that served that case alone,
by the rule it left in `docs/premises.md` ("What no program that keeps the guide's rules can see").

The owner's rule of 27 November 2026 says what the library owes, and to whom (`AGENTS.md`, "Deciding"): to a program
written as the guide teaches, and nothing to a form that no page shows. Steps 122 and 123 took out what the code held
for such forms. The inference matrix still writes programs as objects, valid ones alone: the library's own tests write
programs so, and the matrix checks that each tool takes them.

A second opinion on step 121 (Fable 5.2, 27 November 2026) read the bugs of the week: latent since the design of 20 and
21 November but one, made by a fix and caught before its commit, and each an act made whole only against the actor its
author had in mind. Two actors went unlisted: whoever runs the program, interrupting at a yield between two operations
(`begun`, the window of `Stage.play`), and code that runs on the stack of a callback the engine makes inside a step (the
end of step 121, the `hearNext` of commit `5f13b2b`). The search of `src/interleaving.test.ts` had neither: it
interrupted the run once, when the program was quiet, and its listeners never stopped the run nor woke a fiber. The
mutations prove that each check is needed, never that one is missing, and every bug of the week was a check missing.
Step 125 wrote the actors down, with the property of a step that each entry keeps (`docs/invariants.md`, "A step, and
who may enter it"), and step 126 gave the search the actor it lacked: whoever runs the program stops the run between two
acts and in a callback of a step, and finds the bug that step 121 fixed under `'inline'` alone, since `'queued'` resumes
a woken fiber in a task of its own. The same opinion weighed what the library promises: the bugs of the week broke
promises that users build on ("Nothing ends in silence"), so fewer promises would not have kept them out; but each
promise of an order across fibers costs a sentence, a test, a mutation, and a constraint on every later fix. Step 125
weighed those alone, and its commit lists each sentence with its verdict: four made unspecified, which step 127 followed
into the code.

### 124. The reading of the promises for 0.11.0

Opus 5.5, `high`. Depends on nothing. It reads the sentences that step 125 left and changed, which its commit lists.
`promise-reading` over what changed since the last reading (`git log --grep "the promises read for 0.11.0"`, commit
`5f13b2b`): the bug hunt of 27 November 2026, steps 118 to 123, the fix of step 121, a run stopped from a listener or
from `onApplied` whose end waits for the step, steps 125 to 127, and the sentence of "Guarantees" that made a fiber that
another fiber of the program interrupts as the run stops it unspecified. Its readers list each sentence of the guide and
of a doc comment that these commits added or changed, and the rules they changed against every example. One sentence is
known to say more than the code does: a dispatch "applies the message before it returns", in the glossary, in the README
and in the doc comment of `Dispatch`, which is false of one sent during a step, as "Guarantees" and the `dispatch` of an
`App` say.

Done when each such promise has the test that would fail if it were false, or its sentence is cut or made unspecified
as "What belongs here" in `AGENTS.md` says, no sentence read is false of the code, and no example breaks a rule read.

## For the owner

What leaves this machine, or decides what the project is ("Deciding" in `AGENTS.md`): an agent prepares it, and the
owner does it.

- **0.10.0** is published. It holds the first bug of the hunt of 27 November 2026, as 0.8.0 and 0.9.0 do: a `run`
  interrupted as it begins may leave a program that applies messages and reports none of their defects. It holds the
  bug that the review of step 121 found too: a run stopped from a listener may end inside the step, and lose the
  defect of a later listener.
- **0.11.0** is not released: the bug hunt of 27 November 2026 reopened its section of `CHANGELOG.md`, and took out the
  tag `v0.11.0` that pointed to commit `acbada3`, before its fixes. It is released, by `release`, once step 124 is
  done.
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
