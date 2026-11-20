# What the invariants rest on

An invariant holds only while what it rests on does: the purity of the program's code, states never mutated, and
the behaviour of Effect's runtime and of the JavaScript engine. What the program must do is the guide's ("What is
left to you"). What Effect and the JavaScript engine must do without promising it is listed here, each with the test
that checks it, as the rule after the list says: a guarantee that a stable API documents is no premise, and is not
listed. A change that rests on a new premise adds it here, with its test, and only once the owner has agreed to it.

A premise is never added without the owner's consent, under the list or under "Premises that no test reaches yet",
whether a change or a review brings it: the owner is asked before the change that rests on it is written, with the
premise, what rests on it, and its test. A premise a test can check is listed with that test, never made unneeded by
code of the library's written for it alone (an explicit `Effect.interruptible`, a scope closed by hand): such code looks
redundant, no test fails when it goes, and what it stood in for would change unseen. Without the owner's yes, the
change waits.

The invariants themselves are in [`invariants.md`](invariants.md).

- **`HashMap` calls a key's `Equal` and `Hash` only within the call it is given the key in**, synchronously, and
  never later, so that `reconcile` compares keys all inside `'subscriptions'`, in the thunk that makes a state, and so
  do `simulate` and `rehearse`, which compare them as it does: "a key whose Equal throws dies in subscriptions"
  (`run.test.ts`), "… on a key whose Equal throws against the key of the state before" (`contract.test.ts`) and "dies
  in subscriptions when a key's Equal throws, as the run does" (`rehearse.test.ts`) rest on it. `FiberMap` compares its
  keys in a fiber's observer as well, which is why the run keeps its fibers by their start, never by their key. Both are
  read only in the source. Its test: "HashMap calls a key's Equal and Hash only within the call it is given the key in",
  which fails with a `FiberMap` whose fiber, replaced under an equal key, ends after the call.
- **A fiber forked with `FiberSet.run` or `FiberMap.run` is no child of the fiber that forks it, which ends without
  waiting for it**, which is how the end of the run stops the fiber of effects first, while the commands and the
  subscriptions a job of it started run on, until the run has released the renderer and the end interrupts them
  itself (`stop` in `engine.ts`, `running` in `run.ts`): "releases the renderer before what a step started, still
  running", of a command and of a subscription (`run.test.ts`), rests on it. So does the end of `rehearse`, which stops
  its loop at once, in a job that waits for a release, and then stops with the run's mark the subscriptions a job of the
  loop had started for `hearNext`, kept in a `FiberMap`, still running: "a scenario that failed stops the loop at once,
  its job under way included" (`rehearse.test.ts`) rests on it. Not documented: read in the source (both fork with
  `forkUnsafe`, as a daemon). Its tests: "a fiber forked with FiberSet.run or FiberMap.run is no child of the fiber that
  forks it, which ends without waiting for it", of each, which fail with `Effect.forkChild` in its place.
- **`FiberSet.run` and `FiberMap.run` fork a fiber and add it in one step**, with nothing between for an interruption
  to fall into, which is how the end of the engine, interrupting the fiber of effects wherever it is and then reading
  the fibers to stop, finds a command or a subscription the fiber of effects was forking (`perform` in `engine.ts`): "a
  command whose runCommand begins the end of the engine as it is called is interrupted by that end", "a subscription
  that begins the end of the engine as it starts is interrupted by that end" (`engine.test.ts`) rest on it. The end of
  `rehearse` finds the same way a subscription the job of a `hearNext` was starting. That the fiber is
  forked, added, and started at once is documented; that nothing lies between the fork and the add is not, and is read
  in the source (`runImpl` forks with `forkUnsafe` and adds the fiber in the same synchronous step). Its tests:
  "FiberSet.run and FiberMap.run fork a fiber and add it in one step", of each, with a fiber that interrupts the one
  forking it as it starts, which fail with a fork and an add apart, a `yieldNow` between them.
- **A fiber forked with `startImmediately` runs on the stack of the fiber that forks it until it first waits**,
  which is how tests of the testing tools know, with no clock, that a call they forked is waiting, or has ended,
  before they go on (`loop.test.ts`, `rehearse.test.ts`, `contract.test.ts`), with `Effect.forkChild` and, in
  `rehearse.test.ts`, with `Effect.forkDetach` too; and how `simulate` begins a command's effect once `runCommand` has
  been called, as the run begins it with `FiberSet.run` (below), whatever interrupts the simulation then (`runOne` in
  `simulate.ts`): "begins its effect in simulate, as in the run" (`contract.test.ts`) rests on it, and fails without the
  option. Not documented: the option is in the types of both, not in their JSDoc. Its test: "a fiber forked with
  startImmediately runs on the stack of the fiber that forks it until it first waits", which fails without the option.
- **A fiber forked with `FiberSet.run` or `FiberMap.run` runs on the stack of the fiber that runs it until it first
  waits**, through the scope and the cleanup the engine wraps around a command and a subscription, so that `run` returns
  only once `runCommand` has been called, or the subscription's channel made, where the job decided it, before the fiber
  of effects goes on: "a command whose runCommand begins the end of the engine as it is called is interrupted by that
  end", "a subscription that begins the end of the engine as it starts is interrupted by that end" (`engine.test.ts`),
  "a command that dies as the run starts comes before what a subscription dies of as the end releases it"
  (`run.test.ts`), "the run gives what a command that dies releases its defect, in a command" and "the run gives what a
  command that interrupts itself releases a defect, in a command" (`contract.test.ts`) rest on it. Their JSDoc says that
  the effect starts immediately; that it runs on the stack of the fiber that runs it, with no yield until it first
  waits, is read in the source. Its tests: "a fiber forked with FiberSet.run or FiberMap.run runs on the stack of the
  fiber that runs it until it first waits", of each, which fail with `startImmediately: false`.
- **Code that a fiber runs on the stack of the fiber that forks it sees the forked fiber as its own**, through
  `Effect.withFiber`, `Fiber.getCurrent` and `Effect.fiber` alike, from its first step on; and no stable API gives a
  fiber the one that forked it. This is how the root of a fiber the run forks (`rootedIn` in `shell.ts`) knows that an
  interruption without the run's mark is the program's: a command, a subscription or the renderer that interrupts the
  fiber it sees interrupts its own, which then dies, never the fiber of effects or the fiber of whoever runs the
  program, which would end in silence ("A function of the program never interrupts the fiber it runs in", the guide's
  "Guarantees", is the case left to the program: the functions those fibers call themselves). Agreed by the owner on
  19 November 2026. That `Fiber.getCurrent` gives the fiber that runs is documented; that it is the forked one while
  the fork runs on the stack of its forker is read in the source (the current fiber is set as each fiber runs,
  `startImmediately` included), and that `Fiber` has no parent in its declarations. Its tests: "code that a fiber runs
  on the stack of the fiber that forks it sees the forked fiber as its own", for `Effect.forkChild` with
  `startImmediately`, `FiberSet.run` and `FiberMap.run`, which fail where it sees the forker.
- **A fiber of a `FiberSet` or a `FiberMap` that dies leaves the other fibers running, and the set takes forks after
  it**, which is how a command, a subscription or the fiber of effects that dies leaves the end of the run to stop the
  engine's other fibers itself, with the run's mark, once it has released the renderer (`stop` in `engine.ts`,
  `running` in `run.ts`), so that what each of them dies of is recorded however it ends: "a command that dies while a
  run that died elsewhere releases the renderer is in the cause" (`run.test.ts`) rests on it. The JSDoc says only that a
  failure is recorded for `FiberSet.join`, and that `join` ends with the first; that the set does nothing else on it is
  read in the source (the observer of `addUnsafe` completes the set's `Deferred` alone). Its tests: "a fiber of a
  FiberSet or a FiberMap that dies leaves the other fibers running, and the set takes forks after it", of each, which
  fail with such a set.
- **A fiber forked where nothing interrupts is interruptible all the same**, by `Effect.forkChild`, `Effect.forkIn`,
  `FiberSet.run` and `FiberMap.run` alike, which is how the end stops every fiber the engine and the testing tools fork
  in such a region (the renderer in its acquisition, the fiber of effects in the region of its assignment, a command in
  the acquisition of `rehearse`'s `run`), and every fiber of a run or a tool called inside one (`invariants.md`, "one
  thunk"): "called inside an uninterruptible region, ends once its renderer returns", "a subscription stopped inside
  an uninterruptible region is no defect" (`run.test.ts`), "called inside an uninterruptible region, runs the scenario
  and stops the program" (`drive.test.ts`) and
  "called inside an uninterruptible region, hears, runs a command and ends, its loop stopped" (`rehearse.test.ts`)
  rest on it. Not documented: the option `uninterruptible`, `false` unless it is given, is in the types of `forkChild`
  and `forkIn`, not in their JSDoc, and `FiberSet` and `FiberMap` fork with that default, read in the source
  (`forkUnsafe`). Its tests: "a fiber forked where nothing interrupts is interruptible all the same", of each, which
  fail with a fork that takes the region of the fiber that forks it.
- **What the cleanup of `Effect.onExit` fails with comes after the cause of the effect**, which is how each fiber of the
  engine records what it dies of, interrupted or not. Interrupted: "a defect in what a subscription the run stopped
  releases ends the run", "a subscription stopped as whoever runs the run interrupts it, which dies as it releases, is
  in the cause"; dying of itself: "a command that dies while an interrupted run releases the renderer ends the run with
  it", "a command that dies while a run that died elsewhere releases the renderer is in the cause" (`run.test.ts`).
  And how `rehearse` records each defect of the program in
  whichever fiber, an interrupted one included, merging no causes there: "a defect of what a subscription releases
  fails it, in a fiber of the test's that nobody joins", "a defect of what a command the scenario interrupts releases
  fails it, alone" (`rehearse.test.ts`), "rehearse fails, as the run dies, on a command that dies in a fiber nobody
  joins" (`contract.test.ts`). That the cleanup runs however the effect ends, and that the causes are merged, is
  documented; their order is read only in the source. Its test: "what the cleanup of Effect.onExit fails with comes
  after the cause of the effect", of an effect that dies and of one that is interrupted.
- **`Effect.onExit` runs its cleanup where nothing interrupts, however the effect ends**, so that an interruption that
  reaches the fiber as it cleans up cannot stop the cleanup halfway, which is how each fiber of the engine and of the
  testing tools records what it dies of (`makeDeaths` in `shell.ts`), before the fiber ends: the tests of the end of a
  run and of its defects rest on it, "a subscription stopped as whoever runs the run interrupts it, which dies as it
  releases, is in the cause" and "a defect in what a subscription the run stopped releases ends the run"
  (`run.test.ts`) among them, and fail with a cleanup run interruptible, though Effect's own combinators then
  fail too. Its JSDoc says that the cleanup runs, not that an interruption cannot stop it; that it runs uninterruptible
  is read in the source (`OnExitImpl`, with the `interruptible` of `onExitPrimitive` unset). Its tests:
  "Effect.onExit runs its cleanup where nothing interrupts, however the effect ends", of an effect that is interrupted
  and of one that succeeds, its fiber interrupted as the cleanup runs, which fail with a cleanup run interruptible.
- **A scope runs its finalizers in the reverse order they were added**, which is how the end of the engine, added
  after its queue of jobs, its `FiberSet` and its `FiberMap`, stops their fibers with the run's mark before they close,
  and reports what those die of as they release, and how the run releases the renderer, acquired after the engine,
  before the engine's end (`effects` in `engine.ts`, `running` in `run.ts`): "the end of the engine interrupts its
  commands and its subscriptions at once", "what a command dies of as the end of the engine interrupts it is what the
  end dies of" (`engine.test.ts`) and "a command that joins a fiber the fiber of the run interrupted, as the run ends,
  is a defect in the command" (`run.test.ts`) rest on it, and fail with a scope that runs them in the order they were
  added,
  though Effect's own combinators then fail too. The JSDoc of `Scope.close` says only that they run in the scope's
  configured order, sequential or parallel; that sequential is the reverse of their addition is read in the source
  (`scopeCloseFinalizers`). Its tests: "a scope runs its finalizers in the reverse order they were added", of a scope
  made with `Scope.make` and closed by hand and of the scope of `Effect.scoped`, which fail with that scope.
- **`Effect.scoped` fails with what a finalizer of its scope dies of, beside what the effect ended with**, which is
  how a test of the engine sees what its end dies of: "what a command dies of as the end of the engine interrupts it is
  what the end dies of" (`engine.test.ts`) rests on it, and fails with an `Effect.scoped` whose close catches what its
  finalizers fail with. The library no longer rests on it: `scopedIn` closes its scope by hand (the next premise). The
  JSDoc of `Effect.scoped` says only that the finalizers run however the effect ends, and those of `Scope.close` and
  `Scope.use` that they are given its exit; that a finalizer's failure becomes the effect's is read in the source. Its
  tests: "Effect.scoped fails with what a finalizer of its scope dies of", of an effect that succeeds, that dies and
  that is interrupted, which fail with such a scope.
- **`Scope.close` dies with every defect its finalizers die of, none merged by `Equal`**, those of the scopes forked
  from it included, which is how `scopedIn` (`shell.ts`) sees each defect a command, a subscription or the renderer
  dies of as it releases, once its scope has closed, and records it as a defect of its site: "a renderer that dies
  while it releases what it holds ends the run with that defect", the cases of "releases that die with errors equal by
  Equal" (`run.test.ts`), "the run dies in a command on a release of a command that dies" and "the run dies of each of
  two equal defects of what a command that dies releases" (`contract.test.ts`), with their twins of `simulate` and
  `rehearse`, rest on it, and fail with a close that keeps one of two equal defects, or none. `Effect.scoped` is no such
  close: it joins what the effect ended with and what the close died of with `Cause.combine`, which keeps one of two
  reasons equal by `Equal` (documented), and so would leave one of two releases that die of equal errors. The JSDoc of
  `Scope.close` says only that the finalizers run, in the scope's order, given its exit; that the close dies with what
  each finalizer dies of, every reason kept, is read in the source (`scopeCloseFinalizers`, `exitAsVoidAll`). Its tests:
  "Scope.close dies with every defect its finalizers die of, none merged by Equal", of two finalizers closed with a
  success and with a defect, and of one in a scope forked from it.
- **A fiber interrupted while interruptible runs no failure handler**, which is how `diesIn` tells an interruption
  by the run from one the program makes: "a run interrupted by whoever runs it is no defect", "a subscription stopped
  inside an uninterruptible region is no defect" (`run.test.ts`); and beside a defect of its release, which is how
  `diesIn` turns a self-interruption into a defect even after a defect, never one by the run: "a defect in what a
  subscription the run stopped releases ends the run", "a subscription stopped as whoever runs the run interrupts it,
  which dies as it releases, is in the cause" (`run.test.ts`) fail with a handler that runs on them. Not documented:
  read in the source (a failure, as it is evaluated in `internal/core.ts`, takes no handler of an interrupted fiber
  while it is interruptible). Its test: "a fiber interrupted while interruptible runs no failure handler", on its
  interruption and beside a defect of its release, which fails with the handler inside an uninterruptible region.
- **A fiber that fails as it is interrupted keeps its own reasons and gets those it received added, and
  `Effect.interruptible`, entered by an interrupted fiber where it is uninterruptible, fails with exactly those it
  received**, which is how `diesIn` tells a self-interruption from the run's interruption that meets it, both in
  the cause, by the fibers that made them: "a renderer that interrupts itself as whoever runs the run interrupts it is
  a defect in the renderer" (`run.test.ts`), "the run dies with a defect of a command interrupting itself as whoever
  runs it interrupts it", "rehearse fails with a defect of a command interrupting itself as whoever runs it
  interrupts it", and the same of a subscription (`contract.test.ts`), whose gate waits on that very failure. Read only
  in the source (`exitFailCause` and `causeAddInterrupts` in `internal/core.ts`). Its test: "a fiber that fails as it
  is interrupted keeps its own reasons and gets those it received added", with `Effect.interruptible` entered where it
  is uninterruptible.
- **An interruption made with `Fiber.interruptAs` carries the annotations it is given on its reason, and the runtime
  keeps them as it annotates the reason further**, which is how `diesIn` tells the run's interruption from one the
  program makes with the same fiber id, by the mark the run puts on each of its own (`Stopped` in `core.ts`, `stopping`
  in `shell.ts`): "a renderer that joins a fiber the fiber of the run interrupted, as the run ends, is a defect in the
  renderer" fails without the mark, and "a subscription stopped inside an uninterruptible region, which then enters a
  traced function, is no defect" (`run.test.ts`) with a copy of the reason that drops it, as one compared by identity
  does; and so do the testing tools: "rehearse fails with a defect of a command joining, as its run is
  stopped, a fiber its caller interrupted", the same as its end stops it, "rehearse fails with a defect of a
  subscription interrupting itself as the fiber that stops it" (`contract.test.ts`). That `Cause.annotate` keeps the
  keys a reason has is documented; that `interruptAs` puts its annotations on the reason is not. Its test: "an
  interruption made with Fiber.interruptAs carries the annotations it is given on its reason", on a fiber interrupted
  where it waits, and on one that then enters a traced function.
- **Every fiber of a run asks the `Scheduler` it is given before each step, and every task it makes goes to that
  scheduler's dispatcher, or resumes inline where the scheduler of the tests makes it yield first**, so that
  `test/scheduled.test_scheduler.ts` decides where each fiber yields and which runs next, needing nothing of the
  platform's, and the rules of the scheduler built on it (`test/scheduled.test.ts`) rest on it. Read in the source
  (`runLoop` in `internal/effect.ts`). Its tests are a file of their own, for the harness they need
  (`test/effect-scheduler.test.ts`): "driven by hand, every fiber resumes through the scheduler, that of the test clock
  included", "fibers a Deferred resumes inline run in the order the test picks", "a fiber that yielded and is
  interrupted waits for its turn, as one resumed inline does". The search of `interleaving.test.ts` rests on it, and so
  does the scheduler `bridges/bridge.test_suite.ts` holds, by which the bridges' tests, not the clock, say when the
  program and the renderer go on. Two details of `runLoop` are read in the source too, and the scheduler's rules rest
  on them: a fiber asks first at a `currentOpCount` of 1 in each run of its loop, and higher after it, which `yields`
  reads as the fiber starting to run again; and a fiber told to yield schedules its resumption as the very next task,
  which asks nothing at its first step, which `yielding` and `leastBudget` read. Their tests, in the same file: "a
  fiber asks shouldYield first at a currentOpCount of 1 in each run of its loop, and higher after it", which fails with
  a run loop that does not reset the count, as three of the tests above do, and "a fiber told to yield schedules its
  resumption as the very next task, which asks nothing at its first step", which fails with a run loop that asks at a
  resumption's first step. Two more, of where a run of the loop begins, are read in the source, and `yields` rests on
  them: a fiber whose run ends with children runs its loop again in the same task, from a `currentOpCount` of 1, and
  interrupts them there, which `ended` reads as the run of the fiber let run last; and a fiber that begins its run on
  the stack of another, started or resumed inline, gives it back as it yields, in the same task, which is why `nested`
  asks it of preemption with no task ready. Their tests, in the same file: "a fiber whose run ends with children runs
  its loop again in the same task, from a currentOpCount of 1, and interrupts them there", which fails with the child
  forked as a daemon, and "a fiber that begins its run on the stack of another, started or resumed inline, gives it
  back as it yields, in the same task", which fails with a fork without `startImmediately`, and with the `Deferred`
  completed by a fiber of its own. No mutation's killer rests on it: a model of the scheduler gone wrong costs a false
  alarm, or a missed one, never a test that passes where it should fail.
- **Effect calls each `Logger` synchronously, in the fiber that logs**, so that what it throws is a defect of
  that fiber, which `diesIn` wraps where the program logs, as the guide says ("Running"): "a Logger that throws on
  what a command logs is a defect in the command" (`run.test.ts`) rests on it. That it runs in the fiber that
  logs is read only in the source. Its test: "Effect calls each Logger synchronously, in the fiber that logs", which
  fails with a logger that does its work in a fiber of its own (`Logger.batched`).
- **An external span keeps no event of the logs written under it**, which is how no span lives as long as the run,
  the fibers of the run seeing the span of whoever runs it as an external one (`withExternalSpan` in `shell.ts`):
  "what runs in a run logs nothing into the span of whoever runs it, which stays the parent of their spans"
  (`run.test.ts`) rests on it. That a log is an event of the current span (`Logger.tracerLogger`), and that a span
  opened under an external one has it as its parent (`Tracer.externalSpan`), is documented; that an external span keeps
  none is not. Its test: "an external span keeps no event of the logs written under it", which fails with a span of
  Effect's own as the parent.
- **`Channel.toPull` keeps what a channel adds to the scope it is given, and releases none of it as the pull fails,
  while a release the channel wraps around itself (`Channel.onExit`, `Channel.acquireUseRelease`, and every operator
  that makes a scope of its own) runs as its pull fails, before the failure leaves it**. The first is how
  `runSubscription` leaves a subscription's channel to release what it holds as the scope of `scopedIn` closes, once its
  defect is recorded, so that no message applies meanwhile: "a subscription dying in a scope of its channel, before one
  its release lets die, is the first defect", "a subscription dying in a scope of its channel lets no message apply as
  the channel releases" (`run.test.ts`), "a subscription dying in a scope of its channel, before one its release lets
  die, fails it first" (`rehearse.test.ts`) rest on it. The second makes such a release the subscription's own, as
  `Effect.ensuring` is a command's, which ends with its defect once the release has run, as Effect documents: the
  defect leaves the pull once the release has run, and messages apply meanwhile, which "a subscription that dies under
  an onExit of its channel dies once it has released, applying messages meanwhile", and the same in an
  `acquireUseRelease` of its channel (`run.test.ts`), rest on. That it takes
  the scope it is run in, and its pull is used while that scope is open, is documented; what a failing pull releases is
  not, and is read in the source (`fromTransformBracket` in `Channel.ts` closes its own scope as the pull fails). Its
  tests: "Channel.toPull keeps what a channel adds to the scope it is given, and releases none of it as the pull
  fails", which fails with `Channel.runForEach`, which closes a scope it makes before the defect leaves it, and "while
  a release the channel wraps around itself runs as its pull fails, before the failure leaves it", of
  `Channel.onExit`, `Channel.acquireUseRelease` and `Channel.ensuring`, which fails with a channel that adds its release
  to the scope it is given.
- **A channel that `Channel.map` and `Channel.mapDone` make runs afresh each time it is run**, one run after another
  or several at once, which is how a child's lifted subscription, kept by the child's state object for every run of
  its parent (`liftedAt` in `compose.ts`; `invariants.md`, "A child's model, and its lifted subscriptions, are kept by
  its state object"), starts anew when its key comes back under the same state, and in each of two runs that share
  the state. The JSDoc of `Channel` and of both says what a channel reads, writes and ends with, not whether one value
  can run more than once; that each run calls the transform again is read in the source (`fromTransform`). Its test:
  "a channel that Channel.map and Channel.mapDone make runs afresh each time it is run, one run after another or at
  once", which fails with a channel whose iterator is made once for all its runs.
- **`Effect.raceFirst` waits for the effect it interrupts to end, its release included**, which is how `drive`
  returns, once the run has died, only after the scenario it interrupts has released what it holds, which "returns once
  the scenario has released what it holds" (`drive.test.ts`) rests on. That it ends with the first of its effects to
  end, and interrupts the other, is documented; that it waits for it is not. Its test: "Effect.raceFirst waits for the
  effect it interrupts to end, its release included", which fails with a race that interrupts without waiting. The
  races of `rehearse` (`orDead`) rest on the documented part alone: what they interrupt waits on a `Deferred` or
  awaits a fiber, and holds nothing to release, the awaited fiber left running (below, of `Fiber.await`).
- **`Effect.raceFirst` runs each side interruptible, where nothing interrupts too**, which is how a race of the run
  (what the engine dies of against the end of the renderer, in `run.ts`), of `drive` (the scenario, once the renderer
  has the handle, against the run) and of `rehearse` (`orDead`), called where nothing interrupts, ends once one side
  has: "called inside an uninterruptible region, ends once its renderer returns", "a subscription dying in a scope of
  its channel lets no message apply as the channel releases" (`run.test.ts`), "called inside an uninterruptible
  region, runs the scenario and stops the program" (`drive.test.ts`) and "called
  inside an uninterruptible region, hears, runs a command and ends, its loop stopped" (`rehearse.test.ts`) rest on it,
  and fail with sides that take the region of the race. Its JSDoc says that the loser is interrupted, not in what
  region it runs; that each side is forked interruptible is read in the source (`raceAllFirst`). Its tests:
  "Effect.raceFirst runs each side interruptible, where nothing interrupts too", of the side that loses first and of
  the one that loses second, which fail with sides that take the region of the race.
- **The use of `Effect.acquireUseRelease` can be interrupted**, which is how `rehearse`'s `run` takes its command,
  calls `runCommand` and forks the effect it returned with nothing in between for an interruption to fall into, and
  how an interrupted `run` cancels the command and stops its fiber, waiting for its release: "when a run interrupted
  while its command runs leaves the command unanswered", "the command is released before the interrupted call
  returns" (`rehearse.test.ts`) rest on it. That nothing interrupts the acquisition, and that the release runs however
  the use ends, is documented; that the use can be interrupted is not, and is read in the source (the use is
  `restore`d inside an `uninterruptibleMask`). Its test: "the use of Effect.acquireUseRelease can be interrupted",
  which fails with a use made uninterruptible.
- **A thunk of `Effect.suspend` that throws makes the effect die with what it threw**, which is how a function of the
  program that the engine and the tools call in one (`runCommand` in `engine.ts`, the renderer in `run.ts`, the
  scenario in `drive` and in `rehearse`) dies in the site of the effect it would have returned, with what it threw: "a
  defect in runCommand ends the run, which dies with it and with where it happened", "a renderer that throws before it
  returns its effect dies in render" (`run.test.ts`), "the run dies in a command on a runCommand that throws before it
  returns an effect" (`contract.test.ts`), and, of a scenario that throws before it returns its effect, "nothing of the
  program happens once drive has ended" (`drive.test.ts`) and "what a hearNext it started holds is released"
  (`rehearse.test.ts`) rest on it. `Effect.sync` documents a throw of its thunk as a defect; `Effect.suspend` says
  nothing of one. Its test: "a thunk of Effect.suspend that throws makes the effect die with what it threw", which fails
  with a `suspend` that turns a throw into a success.
- **Interrupting `Fiber.await` leaves the awaited fiber running**, which is how the run, interrupted as it races the
  death of a fiber with the end of the renderer (`running` in `run.ts`), leaves the renderer to its release, which
  stops the engine before it interrupts the renderer: "a message the renderer sends as the run releases it does not
  reach update" (`run.test.ts`) rests on it. So do `simulate`, which awaits each command's fiber (`runOne`) and,
  interrupted, stops the command itself with the run's mark, and `rehearse`, which awaits the command its `run` took
  (`runFirst`) and, interrupted, cancels it in the ledger before it stops the fiber: "simulate fails with a defect of a
  command joining, as it is stopped, a fiber its caller interrupted" (`contract.test.ts`), "a run interrupted once its
  command has answered applies the answer, or fails the rehearsal" and "a run interrupted before the effect of its
  command begins fails the rehearsal" (`rehearse.test.ts`) rest on it. Both await the fiber rather than join it, since
  what interrupting a `Fiber.join` does to the fiber is no more documented. That `Fiber.await` waits for the fiber's
  exit is documented; what its interruption does to the fiber is not. Its test: "interrupting Fiber.await leaves the
  awaited fiber running", which fails with an await that interrupts the fiber as it is interrupted.
- **`Effect.timeoutOption` measures with the `Clock` of its context**, which is how `drive` measures its patience with
  the real clock under a `TestClock`, by giving the wait the default `Clock`: "a wait longer than the patience fails,
  measured with the real clock even under a TestClock" (`drive.test.ts`) rests on it. Its JSDoc names no clock. Its
  test: "Effect.timeoutOption measures with the Clock of its context", under a `TestClock` that the test adjusts,
  which fails with a timeout that waits with `setTimeout`.
- **The default value of `Clock.Clock` keeps real time where a `TestClock` is the context's clock**, which is the
  other half of how `drive` measures its patience with the real clock: the clock it provides (`drive.ts`) is
  `Clock.Clock.defaultValue()`, and the same tests rest on it, which fail with that line removed. Neither the JSDoc of
  `Clock.Clock` nor that of `Context.Reference` says what the default value is. Its test: "the default value of
  Clock.Clock keeps real time where a TestClock is the clock of the context", which fails, by the test's own timeout,
  with the `TestClock` as the clock it sleeps on.
- **A collection reclaims what nobody holds, and a `FinalizationRegistry` then calls back for each target it
  reclaimed**, which is how the cache of `forwardTo` forgets the entries of ids nobody shows any more
  (`forgotten` in `dispatch.ts`), so that they do not pile up for as long as the run lasts (`invariants.md`, "A
  child's dispatch is the same while anyone holds it"): "entriesLeft" in `dispatch.test.ts` rests on it, and so do the
  tests of `compose.test.ts` that ask for a collection to reclaim a child's model. ECMAScript requires neither: a
  collection is never required, and a cleanup callback may never be called. Its test: "a collection reclaims what
  nobody holds, and a FinalizationRegistry then calls back for each target it reclaimed", on Bun and on Node, which
  fails with a callback that never runs.
- **snabbdom reuses an `<input>` with no key in the same place**, which is how a controlled element drawn by the
  bridge to snabbdom (`bridges/snabbdom.ts`), which needs no key, stays the same element, with its focus, caret and
  selection, while the program changes its value: the shared tests of the lid, the steps and the lock
  (`bridges/bridge.test_suite.ts`) rest on it. snabbdom's README describes the reuse of keyed elements only. Its test,
  in `snabbdom.test.ts`: "snabbdom reuses an <input> with no key in the same place", which fails with a key of its own
  for the second input.
- **snabbdom calls a module's `update` hook on every element `h` draws again, one `h` is given no data for
  included**, which is how the bridge's module of the controlled elements (`controlledModule` in `bridges/snabbdom.ts`)
  forgets an element drawn without a `value` or a `checked` in `props`, so that it is not given back a value it no
  longer shows: "drawn in the same place without a value, keeps what is typed into it through later draws"
  (`snabbdom.test.ts`) rests on it. snabbdom skips the `update` hooks of a vnode whose `data` is `undefined`, and `h`
  gives every vnode data of its own: both are read in its source, and its README says only that `update` runs as an
  element is updated. Its test, in `snabbdom.test.ts`: "snabbdom calls a module's update hook on every element h draws
  again, one h is given no data for included", which fails with a vnode made with no data (`vnode`).
- **A controlled input keeps what is typed, its caret and its selection when a store read with `useSyncExternalStore`
  is updated during its `onChange`**, which is how the bridge to React (`bridges/react.ts`) draws a text field as
  React's documentation draws a controlled one, with the model of the run's state as `value`, read by `Draw` with
  `useSyncExternalStore(app.subscribe, app.model)`: the shared tests of a text typed in its middle, in `react.test.ts`,
  rest on it. Agreed to by the owner on 20 November 2026. react.dev ("<input>") states it of a state variable, not of
  a store. Its test, in `react.test.ts`: "a controlled input keeps what is typed, its caret and its selection when a
  store read with useSyncExternalStore is updated during its onChange", which fails with the store updated a microtask
  later: React then takes back the key as the event ends, and shows it again with the caret at the end.

A premise about what code does when it runs is checked before the change that rests on it is written, and never
only reasoned:

- **Documented, on a stable API**: the documentation is enough, since a stable API keeps its promise within the
  major, and it is no premise: it is not listed here. For Effect, it is the JSDoc of its declarations in the version
  of the lockfile, where the peer range starts; for the JavaScript engine, the ECMAScript specification. That a bug
  of the dependency where it promises is caught by no test is a risk the rule accepts. Of a behaviour documented in
  part, only the part not promised is listed, with the rest named in a line.
- **Not documented** (read only in the source, or seen in a run): a premise, listed here, and a test that fails without
  it. For Effect, what is not promised may change in a minor version, and the peer range accepts only the patches of
  the version of the lockfile (`AGENTS.md`, "What belongs here"): an upgrade of Effect runs every such test before it
  raises the peer range, and a daily job of the CI (`.github/workflows/effect-latest.yml`) runs them at the newest
  patch the peer range accepts, which a consumer may already have, and at a later minor, which it does not, with ten
  runs of the search and an issue that tells the owner of the result. For the JavaScript engine, the test runs on Bun,
  whose engine is JavaScriptCore, and on Node, whose engine is V8 (`bun run test:node`, every test of `src/` and
  `test/` but the search): what a browser could do otherwise goes under "Premises that no test reaches yet".
- **A premise's test is its own**: a test in `test/premises.test.ts`, named after the premise, that checks what Effect
  or the JavaScript engine does and nothing of the library, or a file of its own in `test/` where it needs a harness,
  as `test/effect-scheduler.test.ts` does for the scheduler of the tests. A test of the library that the premise's
  fall would break too stays a test of what the library promises, and is not named as the premise's: so a test of a
  premise that fails names the premise that fell, and a premise a change drops takes its own test with it and leaves
  the library's. A premise of a bridge on its renderer has its test in the bridge's test file, where the DOM is
  (`AGENTS.md`, "Tests"), apart from the bridge's own and checking the renderer alone.

A guarantee of the guide says what it promises in the library's own terms, never in those of what a function of
Effect makes of a value: the order of the defects in a cause is no promise, since what a user would rely on is what
`Cause.squash` returns ([`rejected.md`](rejected.md)). What keeps a guarantee may rest on a premise listed here, as
those of the span and of a self-interruption do: the premise's test, which the daily job runs at the
newest Effect the peer range accepts, is what tells that it fell.

What the dependencies of development do (fast-check, happy-dom, the renderers of the examples) is no premise of the
library, and the rule leaves it out, with two exceptions. The bridges, `bridges/snabbdom.ts` and
`bridges/react.ts`, are entries of the package: their premises about the renderer follow the rule at the version of
the lockfile, each bridge's opening comment names the versions it was checked with, and what they rest on of the DOM is
documented by its specification (WHATWG), since their tests run on happy-dom, which no browser is; one that is not
goes under "Premises that no test reaches yet". Each renderer is an optional peer, whose range starts at the version
its bridge is developed with and accepts the later minors of its major, as `AGENTS.md` says: the daily job
(`.github/workflows/renderers-latest.yml`) runs the premises' tests at the newest version the range accepts. And a test resting on what a dependency of
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

- **An interruption never reaches the fiber that starts the effects between the fork of the fiber of effects and its
  assignment**, which is how `stop` knows of every fiber of effects that runs: interrupted between them, that fiber
  would close its scope with a fiber of effects the end does not stop first, nor wait for. It comes from the sixth
  review (November 2026), of the loop the fiber of effects replaced, when the fiber that made the engine forked it. The
  fork and its assignment are one region nothing interrupts (`effects` in `engine.ts`), so nothing rests on it. No
  deterministic test reaches that point: an interruption from outside lands there only under the scheduler of the tests,
  which no test of a check runs under (`invariants.md`, "one thunk"). It would be decided by a test that interrupts the
  fiber that starts the effects right after `FiberSet.run` returns, without that scheduler. With it, the region would go
  and the premise would join the list.
