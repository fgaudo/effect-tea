# A rehearsal that owns what the test starts

**Status:** accepted, November 2026, and done: the five steps of the "Plan" are. It follows the sixth review
of the premises, whose findings in `rehearse` are open problems of [`ROADMAP.md`](../ROADMAP.md), three spikes on a
copy of the repository at 0ff58b4, on Effect 4.1.4 and Bun 1.4.4, and a second reading of the first by a session
that wrote none, which corrected it: "Alternatives" says how. The spikes are the three commits of the local branch
`spike/rehearse-one-owner` (cb7dfd0, 74b271f, then db8309a, the one accepted here), deleted once the plan was done,
and never for `main`.

## Context

The review left ten findings, seven of them in `rehearse`. All seven fail on the commit of the review before
(a14c406) too: none came with the changes since, and five reviews read past them. They have three roots, and a
fourth of another kind.

1. **An effect of the program runs in the fiber of the test's that asked for it.** `run` runs the command's effect
   in a child of its own fiber, and offers the answer to the loop only once that child has given it the value;
   `hearNext` takes the message from the subscription's queue, and only then offers it. The test may interrupt that
   fiber between the two, and the end of the rehearsal, which stops what is in its scope, does not reach it. So an
   answer is lost, a command taken and never begun is not counted, a message taken leaves the next `hearNext` waiting
   for ever, and a `run` made once the rehearsal has ended calls `runCommand`. `Effect.uninterruptibleMask` does not
   hold the first three, as `docs/premises.md` says it does: the take is inside `restore`, in a child of
   `Effect.raceFirst`, and the value reaches the caller only when the caller resumes.
2. **The ledger is read after the end**, once it has waited for every release: a command that answers meanwhile is
   neither under way nor cancelled.
3. **A request the loop has not taken when the scenario returns is dropped**, and the rehearsal succeeds. It already
   goes through the loop: this is what the tool promises, not a window.
4. **A scenario that throws before it returns its effect skips the end**, being called outside the effect whose end
   is guarded. `drive` has the same.

`docs/single-owner.md` dropped "one fiber makes every decision" for the run, kept a function of the program called
where the call is decided (its rule 5), and left `rehearse` as it was, "since nothing found needs it to change". This
note changes it, and keeps both.

## Decision

**An effect of the program runs in a fiber of the rehearsal's scope, which gives the loop what it
produces; a call of the test's decides, and waits.** Five rules:

1. **`run` decides in its own thunk, and forks the effect in the rehearsal's scope.** It checks the register and
   that the rehearsal has not ended, takes the command (`Ledger.take`) and calls `runCommand`, in one thunk, as
   today; then forks the effect it returned with `Effect.forkIn`, nothing interrupting it in between. The command's
   own fiber settles its ticket and offers its answer to the loop outside `restore`. The call waits for that fiber's
   exit; interrupted, it cancels by its ticket and interrupts the fiber. A command taken is counted whether or not
   its effect has begun, and nothing lies between its answer and the loop.
2. **A subscription's fiber offers what it sends to the loop**, as the run's offers it to the queue, and waits for
   the next ask. The loop keeps the messages sent and the calls waiting, and applies a message when a call waits for
   it, never before: nothing happens that the test did not ask for. A call that leaves takes itself out in one
   transition, and the loop, not the call, tells the calls waiting that their start has ended or that its key went
   away.
3. **The rehearsal ends in the thunk that takes the scenario's exit.** From then on the loop is offered nothing,
   the check and the offer being one thunk (`Queue.offerUnsafe`), and `run` takes nothing. The commands under way
   and those cancelled are read there, before anything of the end: what happens while the end waits changes nothing
   of them.
4. **A scenario that returned lets the loop finish what it was offered before**, in order, and only then stops it:
   a message once sent is applied whole, as the README says of a sender that is interrupted, taken by the loop yet
   or not. The commands pending are read after it, so one that such a message starts fails the rehearsal, as any
   command left pending does. A scenario that failed, or was interrupted, stops the loop at once, as today: its
   result is the failure, and nothing is read.
5. **A function of the test's is called inside the effect whose end is guarded**: `Effect.suspend(() =>
   scenario(…))` in `rehearse` and in `drive`, as `run.ts` suspends `render`.

Rule 2 puts in the ledger what the spike keeps in maps of the shell, before it is written for `main`: the messages
sent and not heard, the calls waiting and those that left, each a transition with a test of `ledger.test.ts`. A state
of the library is replaced, never mutated.

### What a consumer could notice

- **What the test asked for before the scenario returned is applied** (rule 4): a `send`, a `hear` or a command's
  answer, from a fiber the scenario does not join, that the loop had not taken. Today it is dropped. A command it
  starts fails the rehearsal as pending. A step under way as the scenario returns, waiting for a release, is
  finished, where today it is interrupted once the release has ended: the two tests of it pass either way. A
  changelog entry says so.
- **A command under way is released in the rehearsal's scope**, not in the fiber of the test's that ran it: as the
  rehearsal ends, by the end; when its `run` is interrupted, by that call, which waits for it as today.
- **A `run` made once the rehearsal has ended is interrupted before it calls `runCommand`**, as the README says of
  what such a fiber asks for.
- **A command whose `run` is interrupted as it answers** may have its answer applied and be counted as cancelled
  too: the rehearsal fails either way.

`run` takes its command at once, as today, and waits for no step of the loop: a test whose release waits for what a
command gives ends, as it does today. A release that never ends keeps the rehearsal from ending, as today, and as it
keeps the run and `drive`: the loop waits for it in the step, where today the end waits for it once it has interrupted
the step. The README says that a message waits for the release of the subscriptions it stopped, and says no more of
it: nothing is added, so that no rule forbids a bound on that wait later.

## Plan

Each step leaves the suite green, and removes the `test.failing` marks and the items of `ROADMAP.md` it closes.

1. Rule 5, in `drive` and in `rehearse`. Closes "nothing of the program happens once drive has ended" and "what a
   hearNext it started holds is released". Independent of the rest.
2. Rules 3 and 4. Closes "a command that answers while the end releases a subscription fails it,
   as one under way" and "the message is applied, or fails the rehearsal".
3. Rule 1. Closes "a run made once the rehearsal has ended calls no runCommand", "a run interrupted once its command
   has answered…" and "a run interrupted before the effect of its command begins…".
4. Rule 2, with its transitions in the ledger. Closes "a message hearNext took is applied, or heard by the next
   call…".
5. Done. `run`'s take and fork, and how an interrupted call stops the fiber, are one `Effect.acquireUseRelease`, as
   rule 7 of `docs/single-owner.md` has the renderer's; the transition an offer makes is a function of the ledger
   that `submit` applies in its thunk; a command's fiber settles its ticket however it ends. The mutations of
   `rehearse.ts` are written on the new text, with three more, each with a deterministic test that fails under it:
   "rehearse offers the loop a step once it has ended", "rehearse lets the loop finish after a scenario that failed"
   and "rehearse leaves the command of an interrupted run running". `contract.test.ts` gets the end of `drive` and of
   `rehearse`: what a fiber of the test's sends once the tool has ended reaches no `update`. `docs/premises.md` rests
   `run` on `acquireUseRelease`, and the answer of a command on `uninterruptibleMask`, with no test; "one thunk" in
   `docs/invariants.md` says how a region nothing may interrupt is written, and that it has no mutation. The end of a
   rehearsal whose scenario returned waiting for the loop was written in `docs/invariants.md` at step 2.

## What it rests on

The third spike is rules 1 to 5 in `src/testing/rehearse.ts` alone (211 lines added, 100 removed), with the ledger
untouched and the seven tests of `rehearse.test.ts` without their mark.

- `bun run test`: 484 pass, a new test included. `bun run test:node`: 423 pass. `bun run interleavings`: 14 pass.
  `tsc`: clean. No test that passed before fails.
- The three tests under the scheduler of the tests pass at 5,000 schedules each, under `'inline'` and under
  `'queued'` (`prioritized`, depth 3, seeds 1 to 5,000, and those the review pinned).
- The new test, "a command run while a release waits for what the command gives ends", passes on `main` and on the
  second and third spikes, and never ends on the first.
- Thirteen conditions taken out alone. Five fail a test with no schedule: the check that the rehearsal has ended in
  the thunk that takes (by a run that never ends), the check of the register there, the commands under way read as
  the exit is taken, the loop finishing what it was offered, the scenario called inside the effect. Three fail only
  under the scheduler of the tests: the answer offered outside `restore`, the take and the fork with nothing
  interrupting them, a call that left not registered by the loop. Five fail nothing: a call that left starts no
  subscription, the check that the rehearsal has ended in the offer, the commands pending read after the loop has
  finished, the loop not finishing after a scenario that failed, a cancelled command's answer not applied. A test
  written for the third, "a message sent as the scenario returns is applied, and the command it starts fails the
  rehearsal", passes, and fails with the commands pending read as the exit is taken.
- The premises it uses are in `docs/premises.md` already, each documented: what `Effect.uninterruptibleMask` runs
  outside `restore` cannot be interrupted; an unbounded `Queue` takes an offer at once, and a shut one refuses it (the loop no longer shuts its queue: once
  `end` is marked, nothing is offered to it); a
  `Queue` gives its items in order, and a fiber that awaits a `Deferred` is interrupted alone; a fiber forked with
  `Effect.forkIn` ends with its scope; `Effect.onInterrupt`. It adds none. That `Effect.raceFirst` waits for the
  effect it interrupts, not documented, is no longer what makes a `run` fail with both defects of a command that
  dies as it releases: the call reads the exit of the command's fiber.
- Not shown: that a spike is a design. It mutates maps where the library replaces values, and `bun run mutations`
  was not run past its first failure.

## Alternatives

- **The loop calls `runCommand`**, `run` only asking it: the first spike (cb7dfd0), and this note as first written,
  under one root for all seven findings. It passed every test then written. The second reading found what it costs:
  `run` waits, uninterruptible, for a loop that waits for a release, so a release that waits for what a command
  gives never ends, where `rehearse` promises that the test decides what happens while a command is under way. The
  test above reproduces it. `Ledger.take` is one transition whichever fiber makes it, so the loop adds nothing to the
  take.
- **Keep the effect in the caller, and close each window**: the offer inside the effect that is raced,
  uninterruptible from the take on. It reaches the interrupted calls, and not a command that answers after the end,
  whose effect the end does not reach. Not spiked.
- **A request the loop has not taken fails the rehearsal**: the second spike (74b271f). A step the loop took, under
  way as the scenario returns, is accepted by two tests, so which side of the take a request is on would decide, and
  the scheduler draws that line, not the test. It also adds a way to fail that the README does not know.
- **A request the loop has not taken is dropped**, as today, and as the run drops what its queue holds as it ends.
  The run ends because whoever runs it interrupts it; a scenario that returns is a test that says it is done, and
  the README promises that what it sent is applied whole.
- **A subscription's message applied as it is sent**, with no call waiting, as the run applies it. Simpler, and it
  breaks "nothing happens unless the test does it": a `hearNext` interrupted would change the state later, by
  itself. Rejected.
- **A command that goes on when its `run` is interrupted**, as the run never cancels one: no cancellation in the
  ledger, and the rehearsal fails on it as under way. It changes what the tests of an interrupted `run` see of the
  command's release. Not spiked.

## Open questions

- **Three conditions fail only under the scheduler of the tests**, which serves the search alone, so no mutation may
  name those tests as its killers. Each is a region nothing may interrupt. Answered by the author before step 5, after
  a second reading of the code by a session that wrote none: they are forms held by their construction, with no
  mutation. None holds code of the program, so no gate stops in it: a gate in a command's release lets the
  interruption arrive still inside `restore`. The take and the fork became one primitive, which leaves no window to
  test; a call that left, and the answer, the settling and the offer, are transitions in the thunk of an offer; the
  answer offered outside `restore` rests on the documentation of `uninterruptibleMask`. The checks beside them have
  their mutations. "One thunk" in `docs/invariants.md` says so.
- **What the ledger keeps of the messages sent, of the calls waiting and of those that left**: answered before step
  4. An opened start keeps the calls waiting on it and the messages it sent, as lists in order, and `asked`, which
  they do not give: a call that asked and left leaves both empty. `gone` went, since the loop tells the calls waiting
  on a start stopped, which then has nothing they could still hear. The ledger keeps the calls offered and not yet
  made to wait (`asking`), which a call takes itself out of as it ends, so that the loop makes one that left wait on
  nothing and start nothing (`Ledger.opening`, `Ledger.ask`); nothing is kept of a call once it has ended. A call is
  its identity, as a handle is: numbered, it would need a map from the number to it in the shell.
- **The answer of a command and its settling are one thunk with the offer** in `main`, where the spike settled
  before it: a scenario that returns in between would find the command no longer under way, its answer refused. Like
  the three above, no test without the scheduler reaches it, and it was answered with them.
- **Five conditions fail nothing.** Two have their tests: the one above, and "a hearNext that left before the loop
  took its step starts nothing, and hear plays its key", with a gate that keeps the loop in a release while it
  leaves. Two got theirs at step 5, each a gate that a fiber of the test's opens once it has seen what the end did, so
  that the end without its check waits for itself: "a fiber the scenario did not join is offered nothing once it
  returned", "a scenario that failed stops the loop at once, its step under way included". The last went: a cancelled
  command fails the rehearsal whether or not its answer is applied.
- **A `hearNext` that leaves while the loop starts its subscription** leaves the start opened with no call hearing
  it, as it stays while its key does: the step is not split by whoever asked for it, and nothing of the program has
  run, the subscription waiting for an ask. Accepted at step 4.
- Out of this note: the engine's finding (an interruption told by a fiber id the program can make), which is a
  local change of `diesIn`, and a defect of `makeModel` under `drive`, which is a decision of contract.
