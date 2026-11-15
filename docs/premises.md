# What the invariants rest on

An invariant holds only while what it rests on does: the purity of the program's code, states never mutated, and
the behaviour of Effect's runtime and of the JavaScript engine. What the program must do is the README's ("What is
left to you"). What Effect and the JavaScript engine must do without promising it is listed here, each with the test
that checks it, as the rule after the list says: a guarantee that a stable API documents is no premise, and is not
listed. A change that rests on a new premise adds it here, with its test.

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
- **A fiber forked with `Effect.forkChild` where its parent is uninterruptible can still be interrupted**, which is
  how the run forks the renderer inside that acquisition and still stops it: "a run interrupted by whoever runs it is
  no defect", "a renderer that dies while an interrupted run releases it is in the cause" (`run.test.ts`) never end
  with a renderer that inherits it (`{ uninterruptible: 'inherit' }`). Not documented, and seen in those tests.
- **A fiber forked with `FiberSet.run` where its parent is uninterruptible can still be interrupted**, which is how
  the engine forks its loop and keeps it for `stop` in one region nothing interrupts, and still stops it: "a message
  update rejects is ignored, and the program goes on", "the end of the engine lets its loop end before it interrupts
  its commands" (`engine.test.ts`), and every other test that ends an engine, never end with a loop that inherits it.
  Not documented: read in the source (`FiberSet.run` forks with `forkUnsafe`, interruptible whatever its parent),
  and seen in those tests.
- **`FiberSet.run` and `FiberMap.run` fork a fiber and add it in one step**, with nothing between for an interruption
  to fall into, which is how the end of the engine, interrupting the loop wherever it is and then reading the fibers
  to stop, finds a command or a subscription the loop was forking: "a command whose runCommand begins the end of the
  engine as it is called is interrupted by that end", "a subscription that begins the end of the engine as it starts
  is interrupted by that end" (`engine.test.ts`) fail with a fork and an add apart. Not documented: the JSDoc says the
  fiber is forked and added, with no word on a step between, and seen in those tests (the seventh review of the
  premises, November 2026). The end of `rehearse` finds the same way a subscription its loop was starting for
  `hearNext`, whose fiber runs no code of the program before it waits to be asked, so that no test of `rehearse` can
  begin the end there: those two hold it.
- **A fiber forked with `FiberSet.run` is no child of the fiber that forks it, which ends without waiting for it**,
  which is how the end of `rehearse` stops its loop at once, in a step that waits for a release, and then stops with
  the run's mark the subscriptions the loop had started for `hearNext`, still running: "a scenario that failed stops
  the loop at once, its step under way included" (`rehearse.test.ts`) never ends with a subscription forked as a
  child of the loop. Not documented: read in the source (`FiberSet.run` forks with `forkUnsafe`, as a daemon), and
  seen in that test.
- **A fiber forked with `startImmediately` runs on the stack of the fiber that forks it until it first waits**,
  which is how tests of the testing tools know, with no clock, that a call they forked is waiting, or has ended,
  before they go on (`loop.test.ts`, `rehearse.test.ts`, `contract.test.ts`): "runs on the stack of the fiber that
  forks it until it first waits" (`loop.test.ts`), which fails without the option. Not documented: the option is in
  the type of `Effect.forkChild`, not in its JSDoc.
- **A scope runs its finalizers in the reverse order they were added**, which is how the end of the engine, added
  after its `FiberSet` and its `FiberMap` were made, stops their fibers with the run's mark before they close, and
  reports what those die of as they release: "a command that joins a fiber the fiber of the run interrupted, as the
  run ends, is a defect in the command" (`run.test.ts`), "the end of the engine interrupts its commands and its
  subscriptions at once", "what a command dies of as the end of the engine interrupts it is what the end dies of"
  (`engine.test.ts`) fail with the sets made after it. Not documented, and seen in those tests.
- **What the cleanup of `Effect.onExit` fails with comes after the cause of the effect**, which is how each fiber of the
  engine records what it dies of, interrupted or not. Interrupted: "a defect in what a subscription the run stopped
  releases ends the run", "a subscription stopped as whoever runs the run interrupts it, which dies as it releases, is
  in the cause"; dying of itself: "a command that dies while an interrupted run releases the renderer ends the run with
  it", "a command that dies while a run that died elsewhere releases the renderer is in the cause" (`run.test.ts`); and
  how `rehearse` records each defect of the program in whichever fiber, an interrupted one included, merging no causes
  there: "a defect of what a subscription releases fails it, in a fiber of the test's that nobody joins", "a defect of
  what a command the scenario interrupts releases fails it, alone" (`rehearse.test.ts`), "rehearse fails, as the run
  dies, on a command that dies in a fiber nobody joins" (`contract.test.ts`); and how `scopedIn` keeps what its own
  effect died of, to wrap apart what the release dies of: "a release that dies with a defect already recorded elsewhere
  fails it with a second one" (`rehearse.test.ts`). That the cleanup runs however the effect ends, and that the causes
  are merged, is documented; their order is read only in the source.
- **A fiber interrupted while interruptible runs no failure handler**, which is how `diesIn` tells an interruption
  by the run from one the program makes: "a run interrupted by whoever runs it is no defect", "a subscription
  stopped inside an uninterruptible region is no defect" (`run.test.ts`); and beside a defect of its release, which is
  how `diesIn` turns a self-interruption into a defect even after a defect, never one by the run: "a defect in what
  a subscription the run stopped releases ends the run", "a subscription stopped as whoever runs the run interrupts
  it, which dies as it releases, is in the cause" (`run.test.ts`) fail with a handler that runs on them. Not
  documented: read in the source (a failure, as it is evaluated in `internal/core.ts`, takes no handler of an
  interrupted fiber while it is interruptible), and seen in those tests.
- **A fiber that fails as it is interrupted keeps its own reasons and gets those it received added, and
  `Effect.interruptible`, entered by an interrupted fiber where it is uninterruptible, fails with exactly those it
  received**, which is how `diesIn` tells a self-interruption from the run's interruption that meets it, both in
  the cause, by the fibers that made them: "a renderer that interrupts itself as whoever runs the run interrupts it
  is a defect in the renderer", and the same of a command and of a subscription the run stops (`run.test.ts`), and of
  `rehearse`: "rehearse fails with a defect of a command interrupting itself as whoever runs it interrupts it", and
  the same of a subscription (`contract.test.ts`), whose gate waits on that very failure. Read only in the source
  (`exitFailCause` and `causeAddInterrupts` in `internal/core.ts`), and seen in those tests.
- **An interruption made with `Fiber.interruptAs` carries the annotations it is given on its reason, and the runtime
  keeps them as it annotates the reason further**, which is how `diesIn` tells the run's interruption from one the
  program makes with the same fiber id, by the mark the run puts on each of its own (`Stopped` in `core.ts`, `stopping`
  in `shell.ts`): "a renderer that joins a fiber the fiber of the run interrupted, as the run ends, is a defect in the
  renderer" fails without the mark, and "a subscription stopped inside an uninterruptible region, which then enters a
  traced function, is no defect" (`run.test.ts`) with a copy of the reason that drops it, as one compared by identity
  does; and so do the testing tools: "rehearse fails with a defect of a command joining, as its run is stopped, a
  fiber its caller interrupted", the same as its end stops it, "rehearse fails with a defect of a subscription
  interrupting itself as the fiber that stops it" (`contract.test.ts`). That `Cause.annotate` keeps the keys a reason
  has is documented; that `interruptAs` puts its annotations on the reason is not, and seen in those tests.
- **An unbounded `Queue` takes an offer at once, and a shut one refuses it without interrupting**: "a dispatch runs
  with Effect.runSync from a plain callback, and after the run has ended too", and "dispatches run one after the
  other in one callback, before the run takes any, are all applied in order" (`run.test.ts`). That an offer to a
  queue that is done returns `false` is documented (`Queue.offer`); that one to an unbounded queue completes
  synchronously is said only in the comment of an example (`Queue.unbounded`), and seen in those tests. It wakes its
  taker through the scheduler of the fiber that made it, so a dispatch never runs `update` in its caller's stack:
  "running a dispatch from a plain callback returns before update has seen the message" (`run.test.ts`). That
  the scheduler is the run's own is read only in the source: "a dispatch run from a plain callback wakes the
  program on the scheduler the run started with" (`run.test.ts`). The numbering of the dispatched messages rests on
  documented parts alone: `Effect.sync` evaluates its thunk as the effect runs, `Queue.offerUnsafe` adds the message
  synchronously, and the queue hands its messages in the order they were offered. `Queue.offer` is `offerUnsafe` in a
  `suspend` for an unbounded queue (read in the source), so the dispatch that offers with it wakes the loop as before.
- **Every fiber of a run asks the `Scheduler` it is given before each step, and every task it makes goes to that
  scheduler's dispatcher, or resumes inline where the scheduler of the tests makes it yield first**, so that
  `test/scheduled.ts` decides where each fiber yields and which runs next, needing nothing of the platform's: "driven
  by hand, every fiber resumes through the scheduler, that of the test clock included", "fibers a Deferred resumes
  inline run in the order the test picks", "a fiber that yielded and is interrupted waits for its turn, as one resumed
  inline does" (`test/effect-scheduler.test.ts`), and the rules of the scheduler built on them
  (`test/scheduled.test.ts`). Read in the source (`runLoop` in `internal/effect.ts`), and seen in those tests. Only
  the search of `interleaving.test.ts` rests on it, and no mutation's killer does: a model of the scheduler gone
  wrong costs a false alarm, or a missed one, never a test that passes where it should fail.
- **A `Stream.map` after `Stream.buffer` runs only for the elements the consumer pulls, in the consumer's fiber**,
  so a frame's model is made for the frames the renderer pulls, never for a state the sliding buffer dropped, and a
  defect of `makeModel` is the renderer's: "a model is made only for the frames the renderer pulls, never for a state
  the buffer dropped" (`run.test.ts`, which makes 4 models for 2 frames with the map before the buffer), "the run dies
  in render on a makeModel that throws" (`contract.test.ts`). The JSDoc of `Stream.buffer` says only that a slower
  consumer lets the producer go ahead; the rest is seen in those tests.
- **Effect calls each `Logger` synchronously, in the fiber that logs**, so that what it throws is a defect of
  that fiber, which `diesIn` wraps where the log is written: "a Logger that throws on the log of an accepted
  message is one defect, in the log", "a Logger that throws on what a command logs is a defect in the command"
  (`run.test.ts`). That it runs in the fiber that logs is read only in the source.
- **An external span keeps no event of the logs written under it**, which is how no span lives as long as the run,
  the fibers of the run seeing the span of whoever runs it as an external one (`withExternalSpan` in `shell.ts`):
  "what runs in a run logs nothing into the span of whoever runs it, which stays the parent of their spans"
  (`run.test.ts`). That a log is an event of the current span (`Logger.tracerLogger`), and that a span opened under an
  external one has it as its parent (`Tracer.externalSpan`), is documented; that an external span keeps none is not,
  and seen in that test.
- **A `WeakRef` is cleared before the `FinalizationRegistry` callback of its target runs**, and a `WeakMap` lets go
  of a value with its key: the tests of `dispatchTo` (`dispatch.test.ts`) and "a child's model is let go with its
  state" (`compose.test.ts`), under a collection the test asks for (`test/gc.ts`), on Bun and on Node.
- **The use of `Effect.acquireUseRelease` can be interrupted**, which is how `rehearse`'s `run` takes its
  command, calls `runCommand` and forks the effect it returned with nothing in between for an interruption to fall
  into, and how an interrupted `run` cancels the command and stops its fiber, waiting for its release: "when a run
  interrupted while its command runs leaves the command unanswered", "the command is released before the interrupted
  call returns" (`rehearse.test.ts`). That nothing interrupts the acquisition, and that the release runs however the
  use ends, is documented; that the use can be interrupted is read only in the source, and both tests fail with a use
  made uninterruptible.
- **`Channel.toPull` keeps what a channel adds to the scope it is given, and releases none of it as the pull fails,
  while a release the channel wraps around itself (`Channel.onExit`, `Channel.acquireUseRelease`, and every operator
  that makes a scope of its own) runs as its pull fails, before the failure leaves it**. The first is how
  `runSubscription` leaves a subscription's channel to release what it holds as the scope of `scopedIn` closes, once its
  defect is recorded, and how the loop applies nothing meanwhile: "a subscription dying in a scope of its channel,
  before one its release lets die, is the first defect", "a subscription dying in a scope of its channel lets no message
  apply as the channel releases" (`run.test.ts`), "a subscription dying in a scope of its channel, before one its
  release lets die, fails it first" (`rehearse.test.ts`). The second makes such a release the subscription's own, as
  `Effect.ensuring` is a command's, which ends with its defect once the release has run, as Effect documents: the defect
  leaves the pull once the release has run, and messages apply meanwhile: "a subscription that dies under an onExit of
  its channel dies once it has released, applying messages meanwhile", and the same in an `acquireUseRelease` of its
  channel (`run.test.ts`). That it takes the scope it is run in, and its pull is used while that scope is open, is
  documented; what a failing pull releases is not, and is read in the source (`fromTransformBracket` in `Channel.ts`
  closes its own scope as the pull fails). The first three fail with `Channel.runForEach`, which closes a scope of its
  own before the defect leaves it, and the last two with a channel that adds its release to the scope it is given.
- **`Effect.raceFirst` waits for the effect it interrupts to end, its release included**, which is how `drive`
  returns, once the run has died, only after the scenario it interrupts has released what it holds: "returns once the
  scenario has released what it holds" (`drive.test.ts`), which fails with a race that does not wait. That it ends
  with the first of its effects to end, and interrupts the other, is documented; that it waits for it is not. The races
  of `rehearse` (`orDead`) rest on the documented part alone: what they interrupt waits on a `Deferred` or joins a
  fiber, and holds nothing to release.

A premise about what code does when it runs is checked before the change that rests on it is written, and never
only reasoned:

- **Documented, on a stable API**: the documentation is enough, since a stable API keeps its promise within the
  major, and it is no premise: it is not listed here. For Effect, it is the JSDoc of its declarations in the version
  of the lockfile, where the peer range starts; for the JavaScript engine, the ECMAScript specification. That a bug
  of the dependency where it promises is caught by no test is a risk the rule accepts. Of a behaviour documented in
  part, only the part not promised is listed, with the rest named in a line.
- **Not documented** (read only in the source, or seen in a run): a premise, listed here, and a test that fails without
  it, unless a guard of the library's makes it unneeded. For Effect, what is not promised may change in a minor version:
  an upgrade of Effect runs every such test before it raises the peer range, and a daily job of the CI
  (`.github/workflows/effect-latest.yml`) runs them at the newest Effect the peer range accepts, which a consumer may
  already have. For the JavaScript engine, the test runs on Bun, whose engine is JavaScriptCore, and on Node, whose
  engine is V8 (`bun run test:node`, every test of `src/` and `test/` but the search): what a browser could do otherwise
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
bridge's renderer, checks every premise on it again, and reads what the major changed of each API the library uses:
what it documented, listed nowhere here, may be promised no more.

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
