# What the invariants rest on

An invariant holds only while what it rests on does: the purity of the program's code, states never mutated, and
the behaviour of Effect's runtime and of the JavaScript engine. What the program must do is the README's ("What is
left to you"). What Effect and the JavaScript engine must do is listed here, each with what checks it, as the rule
after the list says. A change that rests on a new premise adds it here, with what checks it.

The invariants themselves are in [`invariants.md`](invariants.md).

- **`HashMap` compares keys with `Equal`, structurally for arrays and records**, so a key made anew
  for each state, as a parent's lifted keys are, keeps its subscription: "a key equal by value keeps its
  subscription running, untouched" (`engine.test.ts`), "a child whose state changes, under the same key, keeps
  its subscription running" (`compose.test.ts`). `Equal` keeps its results and hashes by reference, so a key or an
  id is never mutated, as states are not. A `MutableHashMap` compares the key it is given with those already in
  it, that key first, so that what `dispatchTo`'s `FinalizationRegistry` callback looks up, outside any run, finds
  only pairs compared while the view made the dispatches: "lets go of collected dispatches without comparing ids
  again" (`dispatch.test.ts`). Both are read only in the source.
- **`HashMap` calls a key's `Equal` and `Hash` only within the call it is given the key in**, synchronously, and
  never later, so that `reconcile` compares keys all inside `'subscriptions'`: "a key whose Equal throws dies in
  subscriptions" (`run.test.ts`), and so do `simulate` and `rehearse`, which compare them as it does: "… on a key
  whose Equal throws against the key of the state before" (`contract.test.ts`). `FiberMap` compares its keys in a
  fiber's observer as well, which is why the run keeps its fibers by their start, never by their key. Both are read
  only in the source.
- **`Fiber.interruptAs` waits for the interrupted fiber to end**, its release included, which is what makes the
  gone keys released before any key starts: "a key that changes stops the old subscription and starts the new
  one", "keys that go away together release their subscriptions together, not one after the other"
  (`engine.test.ts`). Documented.
- **`Effect.acquireRelease` lets nothing interrupt its acquisition, and runs its release when its scope closes,
  however it closes**, which is how the run forks the renderer and sets how its end stops it with nothing between
  to leave the renderer to the end of the fiber the run is in, which would interrupt it as a child, unawaited, and
  how it stops the loop, then interrupts and awaits the renderer, however the run ends, before the engine's other
  fibers, acquired earlier in
  the same scope: "a renderer that dies while an interrupted run releases it is in the cause", "a renderer that
  dies as a run that died elsewhere releases it is in the cause" (`run.test.ts`). Documented.
- **A fiber forked with `Effect.forkChild` where its parent is uninterruptible can still be interrupted**, which is
  how the run forks the renderer inside that acquisition and still stops it: "a run interrupted by whoever runs it is
  no defect", "a renderer that dies while an interrupted run releases it is in the cause" (`run.test.ts`) never end
  with a renderer that inherits it (`{ uninterruptible: 'inherit' }`). Not documented, and seen in those tests.
- **`Fiber.interruptAs` completes only once the interrupted fiber has**, which is how the end of the run stops the loop
  before it stops the renderer, and before it reads the fibers to interrupt: "a message the renderer sends as the run
  releases it does not reach update" (`run.test.ts`). Documented.
- **A fiber forked with `FiberSet.run` where its parent is uninterruptible can still be interrupted**, which is how
  the engine forks its loop and keeps it for `stop` in one region nothing interrupts, and still stops it: "a message
  update rejects is ignored, and the program goes on", "the end of the engine lets its loop end before it interrupts
  its commands" (`engine.test.ts`), and every other test that ends an engine, never end with a loop that inherits it.
  Not documented: read in the source (`FiberSet.run` forks with `forkUnsafe`, interruptible whatever its parent),
  and seen in those tests.
- **A scope runs its finalizers in the reverse order they were added**, which is how the end of the engine, added
  after its `FiberSet` and its `FiberMap` were made, stops their fibers with the run's mark before they close, and
  reports what those die of as they release: "a command that joins a fiber the fiber of the run interrupted, as the
  run ends, is a defect in the command" (`run.test.ts`), "the end of the engine interrupts its commands and its
  subscriptions at once", "what a command dies of as the end of the engine interrupts it is what the end dies of"
  (`engine.test.ts`) fail with the sets made after it. Not documented, and seen in those tests.
- **`Effect.onExit` runs its cleanup however the effect ends, and puts what the cleanup fails with after the cause
  of the effect**, which is how each fiber of the engine records what it dies of, interrupted or not. Interrupted: "a defect in what a subscription
  the run stopped releases ends the run", "a subscription stopped as whoever runs the run interrupts it, which dies
  as it releases, is in the cause"; dying of itself: "a command that dies while an interrupted run releases the
  renderer ends the run with it", "a command that dies while a run that died elsewhere releases the renderer is in
  the cause" (`run.test.ts`); and how `rehearse` records each defect of the program in whichever fiber, an interrupted one
  included, merging no causes there: "a defect of what a subscription releases fails it, in a fiber of the test's
  that nobody joins", "a defect of what a command the scenario interrupts releases fails it, alone"
  (`rehearse.test.ts`), "rehearse fails, as the run dies, on a command that dies in a fiber nobody joins"
  (`contract.test.ts`); and how `scopedIn` keeps what its own effect died of, to wrap apart what the release dies
  of: "a release that dies with a defect already recorded elsewhere fails it with a second one" (`rehearse.test.ts`).
  That the cleanup runs, and that the causes are merged, is documented; their order is read only in the source.
- **A fiber interrupted while interruptible runs no failure handler**, which is how `diesIn` tells an interruption
  by the run from one the program makes: "a run interrupted by whoever runs it is no defect", "a subscription
  stopped inside an uninterruptible region is no defect" (`run.test.ts`); and beside a defect of its release, which is
  how `diesIn` turns a self-interruption into a defect even after a defect, never one by the run: "a defect in what
  a subscription the run stopped releases ends the run", "a subscription stopped as whoever runs the run interrupts
  it, which dies as it releases, is in the cause" (`run.test.ts`) fail with a handler that runs on them.
- **A fiber that fails as it is interrupted keeps its own reasons and gets those it received added, and
  `Effect.interruptible`, entered by an interrupted fiber where it is uninterruptible, fails with exactly those it
  received**, which is how `diesIn` tells a self-interruption from the run's interruption that meets it, both in
  the cause, by the fibers that made them: "a renderer that interrupts itself as whoever runs the run interrupts it
  is a defect in the renderer", and the same of a command and of a subscription the run stops (`run.test.ts`), and of
  `rehearse`: "rehearse fails with a defect of a command interrupting itself as whoever runs it interrupts it", and
  the same of a subscription (`contract.test.ts`), whose gate waits on that very failure. Read only in the source (`exitFailCause` and `causeAddInterrupts` in
  `internal/core.ts`), and seen in those tests.
- **An interruption made with `Fiber.interruptAs` carries the annotations it is given on its reason, and the runtime
  keeps them as it annotates the reason further**, which is how `diesIn` tells the run's interruption from one the
  program makes with the same fiber id, by the mark the run puts on each of its own (`Stopped` in `core.ts`, `stopping`
  in `engine.ts`): "a renderer that joins a fiber the fiber of the run interrupted, as the run ends, is a defect in the
  renderer" fails without the mark, and "a subscription stopped inside an uninterruptible region, which then enters a
  traced function, is no defect" (`run.test.ts`) with a copy of the reason that drops it, as one compared by identity
  does; and so do the testing tools: "rehearse fails with a defect of a command joining, as its run is stopped, a
  fiber its caller interrupted", the same as its end stops it, "rehearse fails with a defect of a subscription
  interrupting itself as the fiber that stops it" (`contract.test.ts`). That `Cause.annotate` keeps the keys a reason
  has is documented; that `interruptAs` puts its annotations on the reason is not, and seen in those tests.
- **An unbounded `Queue` takes an offer at once, and a shut one refuses it without interrupting**: "a dispatch runs
  with Effect.runSync from a plain callback, and after the run has ended too", and "dispatches run one after the
  other in one callback, before the run takes any, are all applied in order" (`run.test.ts`). It wakes its taker
  through the scheduler of the fiber that made it, so a dispatch never runs `update` in its caller's stack:
  "running a dispatch from a plain callback returns before update has seen the message" (`run.test.ts`). That
  the scheduler is the run's own is read only in the source: "a dispatch run from a plain callback wakes the
  program on the scheduler the run started with" (`run.test.ts`).
- **A start's generation, not only its key, says whether its messages still apply**: "a message left by an earlier
  start of a key that came back does not reach update" (`engine.test.ts`), and "what a subscription leaves in the
  queue after its key went away does not reach update" (`run.test.ts`). `rehearse` never gives `arrive` such a
  message: its ledger forgets a start in the transition that stops it ("a start whose key went away is stopped and
  forgotten, and the calls waiting on it are told", `ledger.test.ts`). This one rests on nothing of Effect: it is the
  engine's own rule, tested where the fibers' order would otherwise hide it.
- **Every fiber of a run asks the `Scheduler` it is given before each step, and every task it makes goes to that
  scheduler's dispatcher, or resumes inline where the scheduler of the tests makes it yield first**, so that
  `test/scheduled.ts` decides where each fiber yields and which runs next, needing nothing of the platform's: "driven
  by hand, every fiber resumes through the scheduler, that of the test clock included", "fibers a Deferred resumes
  inline run in the order the test picks", "a fiber that yielded and is interrupted waits for its turn, as one resumed
  inline does" (`test/effect-scheduler.test.ts`), and the rules of the scheduler built on them
  (`test/scheduled.test.ts`). Read in the source (`runLoop` in `internal/effect.ts`), and seen in those tests. Only
  the search of `interleaving.test.ts` rests on it, and no mutation's killer does: a model of the scheduler gone
  wrong costs a false alarm, or a missed one, never a test that passes where it should fail.
- **`SubscriptionRef.changes` replays the latest state to a new subscriber**, so a renderer that subscribes late,
  or skips frames, still draws the last state: "a renderer slower than the program gets only the latest frame"
  (`run.test.ts`).
- **Effect calls each `Logger` synchronously, in the fiber that logs**, so that what it throws is a defect of
  that fiber, which `diesIn` wraps where the log is written: "a Logger that throws on the log of an accepted
  message is one defect, in the log", "a Logger that throws on what a command logs is a defect in the command"
  (`run.test.ts`). That it runs in the fiber that logs is read only in the source.
- **A `WeakRef` is cleared before the `FinalizationRegistry` callback of its target runs**, and a `WeakMap` lets go
  of a value with its key: the tests of `dispatchTo` (`dispatch.test.ts`) and "a child's model is let go with its
  state" (`compose.test.ts`), under a collection the test asks for (`test/gc.ts`), on Bun and on Node.
- **A `Queue` gives its items in the order they were offered, and a fiber that awaits a `Deferred` is interrupted
  alone, never the fiber that completes it**, which is how `rehearse` applies one message at a time, as the run's
  loop takes them, the fibers of the test's offering a step to one loop of its own (`loop.ts`) and awaiting its
  result, and how an interrupted caller never splits a step: "two messages that arrive together, one stopping a
  subscription, are both applied", "a command run while a message waits for a release leaves pending once", "send
  selects on the model of the state its message is applied to", "a send interrupted while its message stops a
  subscription leaves the state that stopped it" (`rehearse.test.ts`), "runs its steps one at a time, in the order
  they were offered", "does a step whole though whoever asked for it is interrupted" (`loop.test.ts`). Documented.
- **What `Effect.uninterruptibleMask` runs outside `restore` cannot be interrupted**, which is how `drive` stops and
  awaits its run when whoever runs it interrupts it: "drive interrupted by whoever runs it" (`drive.test.ts`); and how
  the end of `rehearse` takes the scenario's exit however it ends, an interruption by whoever runs it included, and
  stops what it started before it reads what its fibers died of, the defects first: "interrupted by whoever runs it, it
  fails on a defect of what a subscription releases", "a defect of a release still under way when the scenario returns
  fails it", "a defect the scenario catches fails it all the same, first, and once" (`rehearse.test.ts`). It is also
  how the fiber of a command in `rehearse` offers its answer to the loop once its effect has answered, nothing
  interrupting it in between: a region that holds no code of the program, which no test reaches and no mutation names
  ("one thunk" in `invariants.md`). Documented.
- **A fiber forked with `Effect.forkIn` is interrupted when its scope closes, and not when the fiber that forked it
  ends, and the close waits for it to end, its release included**, which is how `rehearse` keeps its loop, and a
  subscription that `hearNext` started for as long as its key stays, whichever fiber of the test's asked for them: "a
  subscription first heard in a fiber that has ended since keeps running while its key stays", "a subscription it
  started is released when whoever runs the rehearsal interrupts it"; and how its end reaches a release under way in
  a step its loop was interrupted in, whose key has already left the state: "it returns once a release under way when
  the scenario returns has ended, its key already gone", "a defect of a release still under way when the scenario
  returns fails it" (`rehearse.test.ts`). That it is interrupted when its scope closes is documented
  (`Effect.forkIn`); that it is not when the fiber that forked it ends is not, and "a subscription first heard in a
  fiber that has ended since" fails without it; that the close waits is not either, and the last two fail with a
  close that does not wait.
- **`Effect.acquireUseRelease` lets nothing interrupt its acquisition, and runs its release however its use ends,
  once the acquisition has succeeded, while its use can be interrupted**, which is how `rehearse`'s `run` takes its
  command, calls `runCommand` and forks the effect it returned with nothing in between for an interruption to fall
  into, and how an interrupted `run` cancels the command and stops its fiber, waiting for its release: "when a run
  interrupted while its command runs leaves the command unanswered", "the command is released before the interrupted
  call returns" (`rehearse.test.ts`). The first two are documented; that the use can be interrupted is read only in
  the source, and both tests fail with a use made uninterruptible.
- **`Effect.scoped` closes the scope once the effect has ended, and what an effect inside it does on its exit runs
  before the release**, which is how `scopedIn` records the defect of a command, a subscription or the renderer before
  its release lets another fiber die: "a renderer that dies before a command is the first defect of the cause", "a
  command that dies before another, which its release lets die, is the first defect of the cause", "a subscription that
  dies before another, which its release lets die, is the first defect" (`run.test.ts`), "a command that dies before
  another, which its release lets die, fails it first", "a subscription that dies before another, which its release
  lets die, fails it first" (`rehearse.test.ts`). Documented.
- **An effect ends with a defect only once what it wraps around its own code (`Effect.ensuring`, an `Effect.scoped`
  of its own) has run, and `Effect.catchCause` around it recovers from the defect**, which is why the README counts a
  defect from the end of the effect, and the engine learns of it no earlier: "a command that dies under a release of
  its own dies once it has released, applying messages meanwhile", and the same of a subscription and of a renderer,
  "a command that catches the defect of a scope of its own answers, and the run goes on", and the same of a
  subscription and of a renderer (`run.test.ts`), "simulate applies, as the run does, the answer of a command that
  catches the defect of a scope of its own", and the same of `rehearse` (`contract.test.ts`). Documented.
- **`Channel.toPull` keeps what a channel acquires, in scopes of its own too, in the scope it is given, and releases
  none of it as the pull fails**, which is how `runSubscription` leaves a subscription's channel to release what it
  holds as the scope of `scopedIn` closes, once its defect is recorded, and how the loop applies nothing meanwhile: "a
  subscription dying in a scope of its channel, before one its release lets die, is the first defect", "a subscription
  dying in a scope of its channel lets no message apply as the channel releases" (`run.test.ts`), "a subscription
  dying in a scope of its channel, before one its release lets die, fails it first" (`rehearse.test.ts`). That it
  takes the scope it is run in, and its pull is used while that scope is open, is documented; that a failing pull
  releases nothing is not, and the three fail with `Channel.runForEach`, which closes a scope of its own before the
  defect leaves it.
- **`Effect.raceFirst` ends with the first of its effects to end, and interrupts the other, and waits for it to end,
  its release included**, which is how a call of `rehearse`'s that waits for a subscription or a command fails as soon
  as another fiber dies: "a hearNext waiting on its subscription fails as soon as another fiber of the test's dies", "a
  run waiting for its command fails as soon as another fiber of the test's dies" (`rehearse.test.ts`); and how a `run`
  whose command dies fails with what the command dies of as it releases, too: "a run whose command dies, then dies
  again as it slowly releases, fails with both" (`rehearse.test.ts`), which fails with a race that does not wait; and
  how `drive` ends a scenario that goes on after a defect of `makeModel`: "drive ends on the defect a scenario that
  goes on caught" (`contract.test.ts`). That it interrupts the other is documented; that it waits for it is not.

A premise about what code does when it runs is checked before the change that rests on it is written, and never
only reasoned:

- **Documented, on a stable API**: the documentation is enough, since a stable API keeps its promise within the
  major. For Effect, it is the JSDoc of its declarations in the version of the lockfile, where the peer range starts;
  for the JavaScript engine, the ECMAScript specification. That a bug of the dependency where it promises is caught
  by no test is a risk the rule accepts.
- **Not documented** (read only in the source, or seen in a run): a test that fails without it. For Effect, what is
  not promised may change in a minor version: an upgrade of Effect runs every such test before it raises the peer
  range. For the JavaScript engine, the test runs on Bun, whose engine is JavaScriptCore, and on Node, whose engine
  is V8 (`bun run test:node`, every test of `src/` and `test/` but the search): what a browser could do otherwise
  goes under "Premises that no test reaches yet".

What the dependencies of development do (fast-check, happy-dom, the renderers of the examples) is no premise of the
library, and the rule leaves it out, with two exceptions. The bridges, `examples/snabbdom.ts` and
`examples/react.ts`, are copied by users: their premises about the renderer follow the rule at the version of the
lockfile, each bridge's opening comment names the versions it was checked with, and what they rest on of the DOM is
documented by its specification (WHATWG), since their tests run on happy-dom, which no browser is; one that is not
goes under "Premises that no test reaches yet". A bridge that becomes a package of its own makes its renderer a peer,
whose range starts at the version it is developed with, as Effect's does. And a test resting on what a dependency of
development does is still held to failing without what it checks.

A premise that the rule cannot check yet holds the change up: it waits, or a guard of the library's makes the premise
unneeded, and the premise goes under "Premises that no test reaches yet". A move to a new major of Effect, or of a
bridge's renderer, checks every premise on it again, the documented ones included.

A review of the premises reports a finding only once it is reproduced by a test that fails, or ruled out by the check
the rule above asks of the premise: a reading of the code alone, or of a dependency's source, gives a lead, and the
review turns it into a test or drops it. A review is due before a release, and before 1.0, over the changes of the
engine and of the testing tools since the last review, in a session that wrote none of them: it follows
[`premise-review`](../.agents/skills/premise-review/SKILL.md). A change is not held up for it: between two reviews, what
keeps a known bug from coming back is the rule of fixes that follows, and the tests it leaves.

A finding is fixed by its form, not only by the sequence that found it. The fix names the form (a cleanup skipped, or
an exit discarded, as a scope closes; a step applied by two actors at once; a window between two fibers that nobody
watches), looks for it in every place of the engine and of the testing tools that ends a run, applies a message or
releases what a fiber holds, and leaves a test at each place the form can reach.

## Premises that no test reaches yet

A lead no test can reach yet is listed here, with what would decide it.

None today. The last, the loop forked and not yet known to `stop` (the sixth review, November 2026), went once
the fork and its assignment were made one region nothing interrupts (`make` in `engine.ts`).
