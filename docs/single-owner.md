# A run that needs no test of the order of yields

**Status:** accepted, November 2026, and done: the eight steps of its plan are. The decision was revised on 13
November 2026, after four more spikes: steps 4 to 8 below replace the steps 4 to 6 first written.
"Context" is the investigation as it was written, when no file of the library, of its tests or of its documents had
changed: where it says "today", it is the code before step 1. It asks whether the run and the testing tools can be
made, by construction, not to need the tests under `test/scheduled.ts`, which decide where every fiber yields. Every
spike ran on a copy of the repository, on Effect 4.1.4 and Bun 1.4.4, and was deleted: "What it rests on" says what
each one showed.

## Context

Effect does not promise the order in which its fibers yield, as most runtimes do not. `test/scheduled.ts` models
that order from Effect's source (`currentOpCount`, a resumption that runs on the stack of the fiber that completes
it), in two modes, `'inline'` and `'queued'`, neither of which reaches every order of the other. A runtime whose tests
need such a model rests on what its dependency does not promise.

After `docs/shared-core.md` the dependence is small. It is in two places:

- **five tests under `prioritizedSchedules`, each the only killer of a mutation** (`mutations/mutations.ts`): "a
  renderer is not called once a subscription of init has died" and "a run interrupted as it starts the renderer stops
  it, and keeps its defects" (`run.test.ts`); "run calls no runCommand once a command has died", "model calls no
  makeModel once a command has died" and "runAll runs what is pending, though another call takes the last command"
  (`rehearse.test.ts`);
- **the search** of `src/interleaving.test.ts`, which no mutation names.

The hypothesis was three rules: one fiber, the loop, makes every decision that reads the run's state; every promise
is said in the loop's order; a fiber and how it stops are one primitive of Effect. The findings below correct the
first, confirm the other two, and say where they stop.

### What makes a check need a schedule

AGENTS.md's rule "one thunk" already holds at each of the four checks the scheduled tests kill: the check and the
call are one synchronous function. So the fiber that decides is not what is missing. The mutation that takes the
check out is invisible to a deterministic test for one of two reasons, and neither is about who decides:

- **The thunk is deferred.** It is the first step of a fiber forked for it, which starts when the scheduler says: the
  renderer's (`Effect.forkChild` in `run.ts`), and that of `rehearse`'s `run`, inside the `Effect.raceFirst` of
  `orDead`. With the check taken out, the order Effect's scheduler gives still interrupts that fiber before its first
  step, so the test passes.
- **The check is shadowed.** An earlier check of the same register, in an earlier thunk, answers first in every order
  a test with no schedule reaches: `deadOr` in front of `rehearse`'s `run` and `model`. The second check matters only
  when a death falls between the two.

The engine's check before `runCommand` is neither, which is why two tests with a gate kill its mutation: it is the
first step of a fiber, but `FiberSet.run` starts that fiber at once, on the loop's stack, as its JSDoc says ("By
default, the effect starts immediately").

The fifth test, of the renderer's fork, has the form of the third rule. The fourth, of `runAll`, kills a mutation
that takes no check out: it writes a second read of `pending` apart from the take, a form the ledger already rules
out.

### The README's promises, sentence by sentence

Each promise of "Guide", "Running", "Guarantees" and "Testing" is of one of four kinds. Most are already of the first
three.

- **Of the loop's order.** "After every change of state the keys are compared by value", with what follows of a new,
  a kept and a missing key; "An ended subscription is not restarted until its key goes away and comes back"; "ignores
  it, logs it at the debug level, tells `onIgnored`, and keeps the state"; "The run waits for `onApplied` and
  `onIgnored` before it takes the next message"; "Each one starts in a fiber of its own once its step is applied";
  "Outdated clicks are harmless"; "A message that returns the very same state draws no new frame"; and, of
  `rehearse`, "Messages that arrive together, from fibers of the test's, are applied one at a time".
- **Local to one fiber.** "A command has a scope of its own. What it acquires is released when it ends, before its
  message reaches `update`"; "A subscription never ends in silence"; "A command, a subscription or the renderer dies
  when its effect ends with a defect", with what is released after and what runs before; "dies with a
  `ProgramDefect` that says where"; a self-interruption is a defect; "Logs do not pile up in a span"; "a model is made
  only for the frames the renderer reads".
- **Delegated to a primitive of Effect.** "Sending returns an `Effect<void>` that needs no services and completes
  synchronously" (an unbounded `Queue`); "A renderer slower than the program only gets the latest frame"
  (`SubscriptionRef.changes`); "it is interrupted, and what it holds is released" (`FiberMap.remove`); "The
  subscriptions one message stops are released together" (`Effect.forEach`, unbounded); "Nothing outlives what
  acquired it" (`Effect.scoped`); "A message once sent is applied whole, even if the fiber that sent it is
  interrupted" and `drive`'s "it interrupts the run and waits for it" (`Effect.uninterruptibleMask`).
- **Across fibers, in time.** Four sentences are worded this way. Three can be said in an order one fiber owns, with
  the same strength as the code keeps them:
  - "Their answers reach `update` in the order they end": the order their answers are queued, which each command does
    as it ends. The same.
  - "A subscription runs exactly while its key is in the state": it starts when the loop finds its key, and is
    interrupted when the loop finds it gone. Between the new state and the interruption it runs today too, so the
    words are already the loop's order. The same.
  - "A defect met meanwhile joins the cause, which keeps the defects in the order they happened": the order they were
    recorded, each by its fiber as its effect ends, or as its scope has closed for a release. The same, since
    "Running" already says when a defect counts.
  - "From the defect on, the run applies no message, and so starts no command, while it releases what it holds: it
    calls neither `update` nor `runCommand`, nor the renderer when it has not called it yet". This is the one the
    decision changes. Its first half is of the loop's order: the loop applies a message in one thunk, which reads the
    register. Its second half is not: `runCommand` and the renderer are called in fibers of their own, or in the
    middle of a step, and each needs a check of its own, in a thunk that is deferred or that splits the step.

### Where a fiber reads what another writes, and then acts

- **`engine.ts`, the loop's `Core.arrive`**, which reads the register in the thunk that calls `update`. The loop's
  own, with deterministic killers, of the core and of the engine. Kept: it is the one check of the decision.
- **`engine.ts`, the command's `alive(dead, () => interpret(command))`**, in the command's fiber. The fiber starts at
  the fork, by `FiberSet.run`'s documented default, and its mutation has deterministic killers. It is a check in the
  middle of a step: decision 2 takes it out.
- **`engine.ts`, `if (dead()) break` in `reconcile`**. The loop's own, or that of the fiber that makes the engine. The
  check and the fork are not one thunk, and the README promises nothing of the fork ("a subscription that state lists,
  is the program's"). In the middle of a step too: decision 2.
- **`engine.ts`, `alive(dead, () => describeMessage(message))`**, for a message dropped before `update`, while debug
  logs are enabled. An open question.
- **`engine.ts`, `scopedIn`'s `deaths.has`**. A read by identity of a register that only grows, to wrap once a defect
  the same fiber recorded. It guards no call of the program. A set of `scopedIn`'s own would make it local to the
  fiber: an open question, which no test under a schedule depends on.
- **`engine.ts`, the end of the run**, which reads `fibers` and `subscriptionFibers` in the fiber that closes the
  scope, while the loop may still fork. Commit 784d681 found no fiber missed under prioritized schedules, and no
  deterministic test holds it. Decision 4.
- **`run.ts`, the renderer's `alive(deaths.dead, () => render(frames))`**, deferred. Decision 3.
- **`run.ts`, the fork of the renderer and how the run stops it**. One acquisition since step 3.
- **`run.ts` and the renderer's frames**: the renderer reads a state the loop wrote and dispatches from it. The README
  already answers it without any order: a message of the view may arrive in any state, and is rejected where it does
  not apply.
- **`rehearse.ts`, `run` and `model`**: one check each, in the thunk that calls the program, since steps 1 and 2.
- **`rehearse.ts`, `runAll`**: one transition, `Ledger.take`, which finds a command or none. Already by construction.
- **`rehearse.ts`, `orDead`**: races a wait with `died`. It guards no call of the program, and both its uses have
  deterministic killers. Kept.
- **`rehearse.ts`, `hearNext`**: `Ledger.ask`, `Ledger.hear` (which marks the end of a start) and `Ledger.leave`, each one transition
  in one thunk, from the fiber of the test's that calls. Tested as data in `ledger.test.ts`. Kept: moving them into
  the loop would change nothing a test can see.
- **`rehearse.ts`, `state`, `pending`, `events`, `ignored`**: reads of a value the loop replaced whole. No act.
- **`simulate.ts`**: one fiber. **`drive.ts`**: the run and the scenario, forked and stopped inside one
  `uninterruptibleMask`, with a deterministic test ("drive interrupted by whoever runs it").

## Decision

Proposed. What the run owes after a defect is to stop, to report every defect and to release what it holds. The
program owes the rest: an effect that cannot fail, an order between two effects said through a message, a command
that may be interrupted at any point, as the end of the run interrupts it. `update` is pure and learns of the world
through messages alone, so a command that died is, to it, one that has not answered yet: a step applied after a
defect of another fiber cannot be told from one applied before it. A check in the middle of a step protects nothing a
correct program needs, and splits the step: the state is written and the commands `onApplied` heard of never start.

So the run keeps one check, where the loop decides, and stops the loop first as it ends. Four rules of the run, then
three that steps 1 to 3 already applied.

1. **One check, where the loop decides to apply a message.** `Core.arrive` reads the register in the thunk that calls
   `update`: from the defect on, the run applies no message. The core holds it, the run and `rehearse` share it, and
   its mutation has deterministic killers.
2. **No check in the middle of a step.** A step under way when a defect is recorded is the loop's until the end of
   the run interrupts it: it may still start its commands and the subscriptions of its new keys. The checks before
   `runCommand` and in `reconcile` go.
3. **`render` is called once, as the run starts.** No check stands before it: a run that died while it started, as a
   subscription of `init` died, calls the renderer and interrupts it, as it interrupts any effect it started.
4. **The end of the run stops the loop first.** It interrupts the loop and waits for it, then interrupts the
   renderer, then the commands and the subscriptions, all at once. Nothing forks a fiber while the end reads the
   run's fibers, and what is sent while the run ends is not applied.
5. **A function of the program is called where the call is decided**, never as the first step of a fiber forked for
   it, unless the fork is documented to start at once. `rehearse`'s `run` checks, takes and calls `runCommand` in one
   thunk, and races the effect it returns (step 2).
6. **One check for each call.** No earlier check of the same register stands in front of it in another thunk: it
   would answer in its place in every order a deterministic test reaches (steps 1 and 2).
7. **A fiber and how it stops are one primitive**, `Effect.acquireRelease(fork, stop)` (step 3).

And one of policy: **a mutation takes a check out, and a form is held by its construction.** A mutation that writes a
second reader apart from an act, as `runAll`'s does, restores a bug the structure rules out (`Ledger.take` finds none
in the transition that would take). No deterministic test can kill it, since no code of the program lies between the
two reads. It goes, with its test (step 7).

The hypothesis's first rule, in its letter, is dropped: see "Alternatives".

### The README's sentence

A draft, to be checked sentence by sentence against the one it replaces:

> From the defect on, the run applies no message: it does not call `update`. A step under way may still start its
> commands and the subscriptions of its new keys, until the run stops it. The run stops applying messages first, then
> interrupts the renderer, the commands and the subscriptions, waits for them to release what they hold, and dies with
> every defect, in the order they happened.

"So starts no command", "nor `runCommand`" and "nor the renderer when it has not called it yet" go. "A message whose
`update` it called before goes on to its frame" goes too: the end of the run may interrupt that step.

### What a consumer could notice

- **A step under way when a defect is recorded may start its commands and its new subscriptions.** Before, it
  started none.
- **`render` is called in a run that died as it started**, and its effect is interrupted as the run ends.
- **A message sent while the run ends is not applied**, one the renderer sends as it is released included. Before,
  the loop went on while the renderer released what it held.
- **A step under way when the run ends may be interrupted before its frame.** Before, it went on for as long as the
  renderer took to release what it held.
- In `rehearse`, since step 2, `runCommand` is called in the thunk that takes the command, and no longer in a fiber
  of `orDead`'s. Nothing changes for a `runCommand` that builds an effect.

### The five tests

| Test under a schedule | What holds its mutation instead |
| --- | --- |
| a renderer is not called once a subscription of init has died | nothing: the check goes, and its mutation with it (rule 3) |
| a run interrupted as it starts the renderer stops it, and keeps its defects | done, step 3: "the run does not stop the renderer", killed by thirteen tests with no schedule |
| run calls no runCommand once a command has died | done, step 2: a test of the same name with no schedule |
| model calls no makeModel once a command has died | done, step 1: a test of the same name with no schedule |
| runAll runs what is pending, though another call takes the last command | none can: `ledger.test.ts` holds that a take finds none on an empty `pending`, which is the check there is |

`src/interleaving.test.ts` kills no mutation, so nothing has to replace it. Each guarantee it checks has
deterministic tests, of the core or with a gate (`docs/shared-core.md`, step 7). What only it does is look for an
order nobody thought of. Its property "from the first defect on, the run applies no message and starts no command"
becomes "applies no message". Whether the search stays is an open question. If it goes, `test/scheduled.ts`, its two
test files and its two modes go with it.

### The mutations

- **Go**, with their checks: "runCommand is called after the first defect", "the run calls render after the first
  defect", "reconcile starts subscriptions after the first defect".
- **Stays**: "update is called after the first defect", with its two killers.
- **Comes**: "the end of the run stops the renderer before the loop", killed by a test with no schedule, "a message
  the renderer sends as the run releases it does not reach update".

### AGENTS.md's premises

- **Goes**: that `FiberSet.run` and `FiberMap.run` start their fiber at once. Its three tests are of the checks
  rule 2 takes out.
- **Would go**, with `test/scheduled.ts`: "Every fiber of a run asks the `Scheduler` it is given before each step",
  read in the source. It is the only premise about the order of yields that is the tests' alone.
- **Reworded**, step 3: under `Effect.uninterruptibleMask`, how the run forks the renderer and sets how its end stops
  it became `Effect.acquireRelease`, documented.
- **Remain, read only in the source, each with a deterministic test**: `HashMap`'s use of `Equal` and when it calls
  it; `FiberMap.remove` waiting for the release; the order `Effect.onExit` gives the causes; which interruptions a
  fiber received (`diesIn`); an unbounded `Queue` waking its taker through the run's scheduler; a `Logger` called in
  the fiber that logs; `Effect.forkIn` and its scope; `Channel.toPull` releasing nothing as a pull fails;
  `Effect.raceFirst` waiting for the loser. They are about what a primitive does, not about which fiber runs next,
  but for the `Queue`'s: "running a dispatch from a plain callback returns before update has seen the message" is a
  promise about a resumption, and stays one.

### Where by construction stops

- **The end of the run.** With the loop stopped and awaited first, no fiber forks while the end reads the run's
  fibers: the fiber that makes the engine is the one that closes its scope, and the fork of the loop and its
  assignment are one region nothing interrupts, so `stop` always knows of it. Argued when this was written; since the
  sixth review (November 2026) each part of the engine's end has a test with no schedule that fails without it, and a
  mutation: "the end of the engine lets its loop end before it interrupts its commands", "… interrupts its commands
  and its subscriptions at once", "what a command dies of as the end of the engine interrupts it is what the end
  dies of" (`engine.test.ts`).
- **A mutation of form**, as `runAll`'s: the rule of policy.
- **What is delegated to Effect.** That `acquireRelease` leaves no window is read in its documentation and tested by
  nothing of the library's, as AGENTS.md's rule on documented premises accepts.
- **What nobody has thought of.** The rules say where a window cannot be. Only a search finds one where they were not
  applied.

## Plan

Each step leaves `bun run typecheck`, `bun run lint`, `bun run test` and `bun run mutations` green, and is a commit.
Steps 1 to 3 change nothing a consumer sees and are done. Steps 4 and 5 change what the README promises, and are
done, in one commit: with the loop stopped first, the two tests that killed the mutation of the check before
`runCommand` pass without it, since the end interrupts the loop while it waits, so step 4 alone left that check held
by no test.

1. Done. `rehearse`'s `model`: one check, in the thunk that calls `makeModel`, outside `diesIn('render')`. A test
   with no schedule, "model calls no makeModel once a command has died", replaced the scheduled one as the killer of
   "rehearse reads the model after the first defect".
2. Done. `rehearse`'s `run`: the check, `Ledger.take` and the call of `runCommand` in one thunk, the effect raced by
   `orDead`. A test with no schedule replaced the scheduled one as the killer of "rehearse runs a command after the
   first defect".
3. Done. The renderer under `Effect.acquireRelease` in `run.ts`. The mutation of the mask became "the run does not
   stop the renderer", with thirteen killers, twelve of `run.test.ts` and one of `contract.test.ts`. The scheduled
   test of seed 767 went.
4. Done. The end of the run stops the loop first: the engine gives the run a way to stop its loop, which the release
   of the renderer runs before it interrupts the renderer, and the engine's own end runs before it reads its fibers.
   The test "a message the renderer sends as the run releases it does not reach update" kills its mutation, "the end
   of the run stops the renderer before the loop". "A message the renderer sends as an interrupted run releases it,
   on which update dies, ends the run" went: that message is no longer applied. "Running" in the README says the
   order of the end, and that a step under way may be interrupted before its frame.
5. Done. The checks before `runCommand`, in `reconcile` and before `render` went, with their three mutations, the
   scheduled test of the renderer and "a subscription that dies as the run starts keeps the keys after it from
   starting". The three tests named "… starts none of its commands" and "… of its new keys" went too: they still
   passed, since the end interrupts the loop while it waits, and promised what the run no longer does. The README's
   sentence changed, with the changelog's unreleased entries that said the old one, the property of
   `interleaving.test.ts`, AGENTS.md's invariant "Defects always die", and its premise of `FiberSet.run`, which
   went.
6. Done. `Core.arrive` reads the register before the start of a message, so that a message taken once the run has
   died is dead, never dropped, and the engine describes a dropped message with no check of its own: `alive` went.
   A gated test, "a message of a stopped subscription, taken once a command has died, is not described", and the
   core's, kill the mutation that puts the start first. In `rehearse`, a `hearNext` whose message a key gone meanwhile
   would have dropped fails with the defect, as the README says of every call after one.
7. Done. `runAll`'s mutation went, with its test under `prioritizedSchedules`, the last test under a schedule to
   kill a mutation: `ledger.test.ts` holds the take that rules its form out.
8. Done. AGENTS.md says the three rules beside "one thunk", that no test of a check runs under a schedule, and that a
   form the structure rules out is held by the test of its transition, with no mutation. The search of
   `interleaving.test.ts` stays as an alarm, run apart, and `test/scheduled.ts` with it: it is what watches the end of
   the run, which no test held until the sixth review gave it tests with no schedule, and the premise of the
   `Scheduler` is its alone, so a model gone wrong costs a false alarm or a missed one, never a test that passes
   where it should fail.

## What it rests on

- That a function of JavaScript runs to its end before any other code, and `Effect.sync` and `Effect.suspend`
  evaluate theirs synchronously: **documented**, as in `docs/shared-core.md`.
- That `Effect.acquireRelease` protects the acquisition from interruption and runs the release when its scope closes:
  **documented**, in its JSDoc at 4.1.4, `@stability stable`.
- That the mutations of the renderer's check, of `rehearse`'s `run` and of its `model` survived a test with no
  schedule before steps 1 to 3: **checked**. Three such tests passed with each check taken out.
- That a check inside `diesIn('render')` wraps the recorded defects again: **checked**. "after a defect of the
  program, what the test asks for fails with it" failed with it there.
- That the decision keeps the suite but for what it gives up: **checked**. 468 of 471 tests passed; the three that
  failed are those step 4 and step 5 name. The typecheck passed.
- That the run applies no message after a defect, with the one check and the loop stopped first: **checked**. No
  call of `update` after the death in twelve scenarios (bursts of 1 to 200 messages before a subscription dies, a
  subscription that goes on sending, a command that dies as its step starts two more, a renderer that dies, a
  renderer that sends as it is released), under Effect's scheduler and with `MaxOpsBeforeYield` at 1; and the
  property "from the first defect on, the run applies no message" of `interleaving.test.ts` passed three runs.
- That a step under way may still start its commands, and no more than its own: **checked**. In the same scenarios,
  none, one or two commands started after the death, those of the step under way; the property "… and starts no
  command" failed three runs of three.
- That the mutations hold: **checked**. `bun run mutations` killed forty of forty on the copy, the three of rule 2
  and rule 3 taken out of the list and that of rule 4 added, killed by its test with no schedule.
- That a release under way as the loop is interrupted is still awaited and reported: **checked** in one scenario (a
  step that waits for a slow release, which dies, while a command dies: both defects are in the cause).
- That the loop first breaks nothing the order was there for: **read**. The renderer was stopped first so that its
  defect was not lost (commit bc5229d), and by the order of acquisition in the scope, not so that the loop went on.
- That the end of the run misses no fiber once the loop is stopped first: **argued**, not held by a test. Before,
  it was read in a search (commit 784d681). Since the sixth review, **checked**: the loop ends before the end
  interrupts any other fiber, and a fiber the end left to the close of its set would be interrupted with no mark,
  which the tests of the engine's end and of a self-interruption as the run interrupts kill.
- That a step interrupted by the end of the run leaves nothing a consumer relies on: **open**. `onApplied` may have
  heard a step whose frame is never drawn, as it may today when whoever runs the run interrupts it.

## Alternatives

Each was spiked, but for the last two.

- **A death is a message in the loop's queue**, queued in the thunk that records it, and the loop stops as it takes
  it: one owner in the letter. 465 of 471 tests passed. What was queued before the death is applied, and starts its
  commands, so the run goes on working after a defect for as long as its queue was; one check is left, with a
  deterministic killer. `rehearse`, which refuses a request queued before a death, would differ from the run. A run
  that ends only when its loop takes the death would not end while a step waits for ever: that form was not spiked.
- **No check at all, and the loop stopped first.** 467 of 471 tests passed. Under Effect's scheduler a subscription
  that queues 20 messages and dies sees all of them applied after its death, and one that queues 100 about half: the
  loop runs before the fiber of the run interrupts it. A promise worded "may still apply a message" would hold in
  ordinary runs, not in rare ones.
- **No check at all, the renderer stopped first.** With a renderer that takes 60 ms to release what it holds, 38 to
  40 messages of a subscription that sends one each millisecond were applied after the death, and 613 of 1,000
  queued. Which end stops first is what bounds the work after a defect.
- **The death interrupts the loop**, in the thunk that records it (`Fiber.interruptUnsafe`), with `init` and the
  call of `runCommand` in the loop's fiber, and the loop stopped first. 469 of 471 tests passed, the search passed
  three runs whole, and `bun run mutations` killed forty of forty: no call of `update` nor of `runCommand` after a
  defect, with no read of the register in the engine. It rests on `interruptUnsafe`, `@stability stable`, whose
  JSDoc says to prefer the module's functions, as the unsafe methods "do not provide the same Effect-based sequencing
  guarantees"; it interrupts a step where it stands; and it leaves the renderer's clause to a check of its own.
  The strongest promise, for the most mechanism.
- **The engine's `runCommand` called by the loop, as `subscriptions` is.** Spiked before the revision: the suite and
  three runs of the search stayed green. With no check before it, the question no longer arises.
- **`Effect.forkChild(rendering, { startImmediately: true })`**, to keep the renderer's check with a deterministic
  killer. The option is in `forkChild`'s type and not in its JSDoc. Not spiked, and not needed once the check goes.
- **One mode of resumption in `test/scheduled.ts`**, with the first step of a resumed fiber a decision of the
  strategy. It makes the model of Effect's scheduler cleaner, and leaves the tests resting on it. Not spiked.

## Open questions

Answered with step 8: `rehearse` stays as it is, since nothing found needs it to change, and the engine keeps a stop
of its own in its end, which the tests of `Engine.make` reach. Answered since: `scopedIn` tells what its own effect
died of by what its fiber kept of it, not by the register, which lost the defect of a release that died with one
another fiber had recorded, handed to the program by a scenario of `rehearse`'s. Still open:

- Whether step 2 was a change a consumer can notice, and so has a changelog entry.
