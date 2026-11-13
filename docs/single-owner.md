# A run that needs no test of the order of yields

**Status:** proposed, November 2026; steps 1 to 3 of its plan are done, and the rest waits for the open questions.
What follows is the investigation as it was written, when no file of the library, of its tests or of its documents
had changed: where it says "today", it is the code before those steps. It asks whether the run and the testing tools can be made, by construction, not to need the tests under
`test/scheduled.ts`, which decide where every fiber yields. Its spikes ran on a copy of the repository, on Effect
4.1.4 and Bun 1.4.4, and were deleted: "What it rests on" says what each one showed.

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

The engine's check before `runCommand` is neither, which is why two tests with a gate kill its mutation today: it is
the first step of a fiber, but `FiberSet.run` starts that fiber at once, on the loop's stack, as its JSDoc says ("By
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
- **Across fibers, in time.** Four sentences are worded this way. Each can be said in an order one fiber owns, with
  the same strength as the code keeps it today:
  - "Their answers reach `update` in the order they end": the order their answers are queued, which each command does
    as it ends. The same.
  - "A subscription runs exactly while its key is in the state": it starts when the loop finds its key, and is
    interrupted when the loop finds it gone. Between the new state and the interruption it runs today too, so the
    words are already the loop's order. The same.
  - "A defect met meanwhile joins the cause, which keeps the defects in the order they happened": the order they were
    recorded, each by its fiber as its effect ends, or as its scope has closed for a release. The same, since
    "Running" already says when a defect counts.
  - "From the defect on, the run applies no message, and so starts no command, while it releases what it holds: it
    calls neither `update` nor `runCommand`, nor the renderer when it has not called it yet", and `rehearse`'s "After
    a defect, `send`, `run`, `runAll`, `hear`, `hearNext` and `model` fail with it": each call is in a thunk that
    reads the register, and a death is recorded in a thunk, so "from the defect on" is an order of thunks, whichever
    fibers they run in. The same, for the calls. What the code keeps today beyond these words, and the decision below
    would give up, is under "Where by construction stops".

No sentence of the README has to become weaker.

### Where a fiber reads what another writes, and then acts

- **`engine.ts`, the command's `alive(dead, () => interpret(command))`**, in the command's fiber. The fiber starts at
  the fork, by `FiberSet.run`'s documented default. Kept as it is: its mutation has deterministic killers.
- **`engine.ts`, `if (dead()) break` in `reconcile`**. The loop's own, or that of the fiber that makes the engine. The
  check and the fork are not one thunk, and the README promises nothing of the fork ("a subscription that state lists,
  is the program's"). Its mutation has a deterministic killer. Kept.
- **`engine.ts`, `scopedIn`'s `deaths.has`**. A read by identity of a register that only grows, to wrap once a defect
  the same fiber recorded. It guards no call of the program. A set of `scopedIn`'s own would make it local to the
  fiber: an open question, which no test under a schedule depends on.
- **`engine.ts`, the end of the run**, which reads `fibers` and `subscriptionFibers` in the fiber that closes the
  scope, while the loop may still fork. Commit 784d681 found no fiber missed under prioritized schedules. No
  deterministic test holds it: see "Where by construction stops".
- **`run.ts`, the renderer's `alive(deaths.dead, () => render(frames))`**, deferred. Decision 1 below.
- **`run.ts`, the fork of the renderer and the `onExit` that stops it**, under `uninterruptibleMask`. Decision 3.
- **`run.ts` and the renderer's frames**: the renderer reads a state the loop wrote and dispatches from it. The README
  already answers it without any order: a message of the view may arrive in any state, and is rejected where it does
  not apply.
- **`rehearse.ts`, `run`**: `deadOr`, then `Ledger.take`, then, in the fiber `orDead` forks, `dead()` and
  `runCommand(command)`. Shadowed and deferred. Decisions 1 and 2.
- **`rehearse.ts`, `model`**: `deadOr`, then `dead()` and `makeModel` in `modelOf`. Shadowed. Decision 2.
- **`rehearse.ts`, `runAll`**: one transition, `Ledger.take`, which finds a command or none. Already by construction.
- **`rehearse.ts`, `orDead`**: races a wait with `died`. It guards no call of the program, and both its uses have
  deterministic killers. Kept.
- **`rehearse.ts`, `hearNext`**: `Ledger.ask`, `Ledger.heard`, `Ledger.leave` and `Core.ended`, each one transition
  in one thunk, from the fiber of the test's that calls. Tested as data in `ledger.test.ts`. Kept: moving them into
  the loop would change nothing a test can see.
- **`rehearse.ts`, `state`, `pending`, `events`, `ignored`**: reads of a value the loop replaced whole. No act.
- **`simulate.ts`**: one fiber. **`drive.ts`**: the run and the scenario, forked and stopped inside one
  `uninterruptibleMask`, with a deterministic test ("drive interrupted by whoever runs it").

## Decision

Proposed. Three rules, beside AGENTS.md's "one thunk", and one of policy.

1. **A function of the program is called where the call is decided.** The thunk that holds the check calls the
   function in the fiber that decides the call, at the place in its sequence where it decides. It is never the first
   step of a fiber forked for it, unless the fork is documented to start at once, as `FiberSet.run` and
   `FiberMap.run` are. What is forked is the effect the call returned. A throw of the function is turned into
   `Effect.die` in the same thunk, so that it dies in the same site, in the scope it would have had.
   - `run.ts`: `render(frames)` is called by the fiber of the run, with the check, and the effect it returns is
     forked. A run that has died forks an effect that does nothing, as today.
   - `rehearse.ts`: `run` checks, takes and calls `runCommand` in one thunk, and races the effect it returns.
2. **One check for each call.** No earlier check of the same register stands in front of it in another thunk: it
   would answer in its place in every order a deterministic test reaches. `rehearse`'s `run` and `model` lose their
   `deadOr` in front. The check stays outside `diesIn`: inside it, the defects the check fails with were wrapped a
   second time, in `'render'`.
3. **A fiber and how it stops are one primitive.** `Effect.acquireRelease(fork, stop)`, in the scope that outlives
   the fiber's use, never a fork and, after it, the registration of how to stop it. Taking the primitive out drops
   the release, which a deterministic test sees; the window between the two is Effect's, documented ("acquisition is
   protected by an uninterruptible region"). `run.ts` forks the renderer this way, in the scope `running` already
   has: its release runs before the engine's, as the renderer is stopped first today.
4. **A mutation takes a check out. A form is held by its construction.** A mutation that writes a second reader
   apart from an act, as `runAll`'s does, restores a bug the structure rules out (`Ledger.take` finds none in the
   transition that would take). No deterministic test can kill it, since no code of the program lies between the two
   reads. It goes, with its test, or stays as the one test under a schedule: an open question.

The hypothesis's first rule, in its letter, is dropped. Nothing found needs the loop to own a decision another fiber
makes today in one thunk: `rehearse`'s callers stay as they are, a monitor of transitions, and the engine's commands
keep their check in their own fiber.

### What a consumer could notice

- **`render` is called by the fiber of the run, before the renderer's fiber exists.** A `render` that only builds an
  effect, as both bridges' do, shows no difference. One that does work before it returns its effect does it there.
  Its defect is still in `'render'`.
- **In `rehearse`, `runCommand` is called in the thunk that takes the command**, and no longer in a fiber of
  `orDead`'s. Nothing changes for a `runCommand` that builds an effect.
- Nothing else. The renderer under `acquireRelease`, and `model`'s single check, change no behaviour the suite sees.

### The five tests

| Test under a schedule | Rule | What holds the mutation instead |
| --- | --- | --- |
| a renderer is not called once a subscription of init has died | 1 | a test of `run.test.ts` with no schedule: a subscription of `init` that dies as it starts, and a `render` that counts its calls |
| a run interrupted as it starts the renderer stops it, and keeps its defects | 3 | the mutation becomes "the run does not stop the renderer", killed by at least seven tests of `run.test.ts` that exist, the first "a renderer that dies while an interrupted run releases it is in the cause" |
| run calls no runCommand once a command has died | 1, 2 | a test of `rehearse.test.ts` with no schedule: run the command that dies, then another, and count the calls |
| model calls no makeModel once a command has died | 2 | the same, with a read of `model` after the death |
| runAll runs what is pending, though another call takes the last command | 4 | none can: `ledger.test.ts` holds that a take finds none on an empty `pending`, which is the check there is |

`src/interleaving.test.ts` kills no mutation, so nothing has to replace it. Each guarantee it checks has
deterministic tests, of the core or with a gate (`docs/shared-core.md`, step 7). What only it does is look for an
order nobody thought of. Under these rules it is an alarm: an order it finds means a rule was broken, and is fixed by
the rule, not by a test under a schedule. Whether it stays is an open question. If it goes, `test/scheduled.ts`, its
two test files and its two modes go with it.

### AGENTS.md's premises

- **Would go**, with `test/scheduled.ts`: "Every fiber of a run asks the `Scheduler` it is given before each step",
  read in the source. It is the only premise about the order of yields that is the tests' alone.
- **Would be reworded**: under `Effect.uninterruptibleMask`, "how the run forks the renderer and sets how its end
  stops it" becomes `Effect.acquireRelease`, documented, and loses its test under a schedule. The rest of that
  premise stays, for `drive` and `rehearse`.
- **Would be added**, documented: that `FiberSet.run` and `FiberMap.run` start their fiber at once. The gates that
  kill the engine's mutations of `runCommand` and of `reconcile` rest on it today, unlisted.
- **Remain, read only in the source, each with a deterministic test**: `HashMap`'s use of `Equal` and when it calls
  it; `FiberMap.remove` waiting for the release; the order `Effect.onExit` gives the causes; which interruptions a
  fiber received (`diesIn`); an unbounded `Queue` waking its taker through the run's scheduler; a `Logger` called in
  the fiber that logs; `Effect.forkIn` and its scope; `Channel.toPull` releasing nothing as a pull fails;
  `Effect.raceFirst` waiting for the loser. They are about what a primitive does, not about which fiber runs next,
  but for the `Queue`'s: "running a dispatch from a plain callback returns before update has seen the message" is a
  promise about a resumption, and stays one.

### Where by construction stops

- **The first step of the renderer's effect.** Today the check and the call are that fiber's first step, so its
  effect takes no step once a defect is recorded before it. With the call in the run's thunk, a defect recorded
  between the call and the fiber's start leaves the effect to begin, until the run interrupts it. The README's words
  hold either way ("nor the renderer when it has not called it yet"; "So is what the renderer does"), and a
  subscription has had this window since AGENTS.md said so ("one forked before may take its first step after the
  defect"). The spike measured it: no call after a recorded defect in either design, and a first step after it in
  317 of 2,002 prioritized schedules with the call in the run's thunk, in none today. Keeping today's strength keeps
  a test under a schedule for it, or rests on `forkChild`'s `startImmediately`, which its JSDoc does not describe.
- **A mutation of form**, as `runAll`'s: rule 4.
- **What is delegated to Effect.** That `acquireRelease` leaves no window is read in its documentation and tested by
  nothing of the library's, as AGENTS.md's rule on documented premises accepts.
- **The end of the run**, which reads the run's fibers while the loop may still fork one. A search found no order
  that misses a fiber; no construction rules one out. Interrupting and awaiting the loop before the rest would: it
  changes "all at once", and is not proposed here.
- **What nobody has thought of.** The rules say where a window cannot be. Only a search finds one where they were not
  applied.

## Plan

Each step leaves `bun run typecheck`, `bun run lint`, `bun run test` and `bun run mutations` green, and is a commit.
Steps 1 to 3 change nothing a consumer sees and need no decision: they are done. The mutation of step 3 has thirteen
killers, twelve of `run.test.ts` and one of `contract.test.ts`, and takes the place of "the renderer is stopped only
when the run succeeds" too, whose `Effect.onExit` the release replaced.

1. `rehearse`'s `model`: one check, in the thunk that calls `makeModel`, outside `diesIn('render')`. A test with no
   schedule, "model calls no makeModel once a command has died", replaces the scheduled one as the killer of
   "rehearse reads the model after the first defect".
2. `rehearse`'s `run`: the check, `Ledger.take` and the call of `runCommand` in one thunk, the effect raced by
   `orDead`. A test with no schedule replaces the scheduled one as the killer of "rehearse runs a command after the
   first defect".
3. The renderer under `Effect.acquireRelease` in `run.ts`. The mutation of the mask becomes "the run does not stop
   the renderer", its killers the tests of the end of the run that exist. The scheduled test of seed 767 goes.
   AGENTS.md's premise of `uninterruptibleMask` is reworded, and `FiberSet.run`'s immediate start is listed.
4. `render` called in the run's thunk, once the question of the renderer's first step is decided. A test with no
   schedule replaces the scheduled one. A changelog entry says where `render` is called.
5. `runAll`'s mutation, once decided: gone with its test, or kept as the one test under a schedule.
6. AGENTS.md: the three rules beside "one thunk", and the policy of mutations. `interleaving.test.ts` and
   `test/scheduled.ts`, once decided: kept as an alarm, or gone with the premise of the `Scheduler`.

## What it rests on

- That a function of JavaScript runs to its end before any other code, and `Effect.sync` and `Effect.suspend`
  evaluate theirs synchronously: **documented**, as in `docs/shared-core.md`.
- That `Effect.acquireRelease` protects the acquisition from interruption and runs the release when its scope closes:
  **documented**, in its JSDoc at 4.1.4, `@stability stable`.
- That `FiberSet.run` and `FiberMap.run` start their fiber at once: **documented**, in their JSDoc at 4.1.4.
- That today's mutations of the renderer's check, of `rehearse`'s `run` and of its `model` survive a test with no
  schedule: **checked**. Three such tests passed with each check taken out.
- That `render` called in the run's thunk keeps every test, and its check has a deterministic killer: **checked**.
  `run.test.ts` stayed green, the scheduled test included, and the test with no schedule failed with the check out.
- That the renderer under `acquireRelease` keeps every test, and that dropping it is seen: **checked**. `run.test.ts`,
  `drive.test.ts` and `contract.test.ts` stayed green, the test of seed 767 included, and at least seven tests of
  `run.test.ts` failed with a bare fork (the output read was cut there).
- That `rehearse`'s `run` and `model`, each with one check in the calling thunk, keep every test, and each check has
  a deterministic killer: **checked**. The suite of `bun run test` stayed green with the three changes together, one
  run of `bun run interleavings` too, and each test with no schedule failed with its check out.
- That a check inside `diesIn('render')` wraps the recorded defects again: **checked**. "after a defect of the
  program, what the test asks for fails with it" failed with it there.
- That the renderer's effect may take its first step after a recorded defect once `render` is called in the run's
  thunk, and never does today: **checked** under `prioritizedSchedules` (1,000 seeds at depth 3 in each mode), which
  samples the orders. Under Effect's own scheduler the scenario showed no such step in either design.
- That a `runCommand` or a `render` made with `Effect.fn` opens its span in the fiber that runs its effect, not where
  it is called: **open**. The suite's tests of spans stayed green with the engine's `runCommand` called by the loop,
  which is not proposed; no spike called an `Effect.fn` across two fibers on purpose.
- That no bridge, example or user relies on `render` being called in the renderer's fiber: **open** for users; the
  two bridges build an effect and do nothing else.
- That the end of the run misses no fiber: **read in a search** (commit 784d681), not held by a test.

## Alternatives

- **One owner in the letter: every fiber's outcome, a death included, a message in the loop's queue.** The purest
  form. A message queued before a death would still be applied, so "from the defect on" would become weaker, and the
  engine, `run.ts` and `rehearse` would all change. The spikes show the register, written in a thunk and read in a
  thunk, needs no owner.
- **The engine's `runCommand` called by the loop, as `subscriptions` is.** Spiked: the suite and three runs of the
  search stayed green, and the two gates still killed its mutation. Not needed, since `FiberSet.run` starts the fiber
  at once, and it would give commands the window the renderer gets. Worth it only for symmetry.
- **`Effect.forkChild(rendering, { startImmediately: true })`.** The renderer's check would run at the fork, on the
  run's stack, with no window between the call and the first step: today's strength, and a deterministic killer. The
  option is in `forkChild`'s type and not in its JSDoc, so it is a premise read in the source, with a test that fails
  without it. Not spiked.
- **No read of `dead` outside `alive`**, so that a check apart from its call cannot be written. It rules out a split,
  not a deferred thunk nor a shadowed check, which are what the scheduled tests are for.
- **One mode of resumption in `test/scheduled.ts`**, with the first step of a resumed fiber a decision of the
  strategy. It makes the model of Effect's scheduler cleaner, and leaves the tests resting on it.

## Open questions

- Whether the renderer's effect may take its first step after a defect recorded between its call and its start, as
  a subscription's may: step 4 rests on the answer, and the third alternative is the way to keep today's strength.
- Whether a mutation of form stays in `mutations.ts` (rule 4, step 5).
- Whether the search of `interleaving.test.ts` stays as an alarm, and `test/scheduled.ts` with it (step 6).
- Whether `scopedIn` should tell the defects its own fiber wrapped by a set of its own, rather than by the register.
- Whether the end of the run should stop the loop before the fibers it forks.
- Whether step 2 is a change a consumer can notice, and so has a changelog entry.
