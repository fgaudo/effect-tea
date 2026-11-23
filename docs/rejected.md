# What was tried or weighed, and rejected

**Status:** an index, begun 14 November 2026 and kept since. It lists the ideas for the library that were tried or
weighed and rejected, so that a review or a proposal reads them before it proposes one again: on 14 November a
review proposed, as untried, a flag that had been spiked and discarded the day before, because the spike was
recorded nowhere in the repository. Read it before proposing a change of design. An idea rejected is added here,
and removed from [`ROADMAP.md`](../ROADMAP.md), in the commit that rejects it.

Each entry says what the idea was, when, why it was rejected, on what evidence, and what would have to change to
reopen it. **Spiked** means code was written and run, and names where it is; **reasoned** means it was weighed by
reading and argument alone. Where a document has the full account, the entry links there and does not repeat it.
Where the reason or the evidence could not be found, the entry says so: nothing here was filled in by guess.

An entry is not a ban. It is reopened by bringing what it names under "Reopen if", or another reason it does not
answer, and saying so in the proposal.

## The engine and its guarantees

- **Leaving "Only the run, and whoever runs it, interrupt them" to the program.** Reasoned, 19 November 2026, against
  the fix that keeps it (an unmarked interruption is a defect in a fiber the run forks, at its scope and at its root).
  Moving the sentence to "What is left to you" would have kept a way to end in silence (a run that hangs, a `hearNext`
  that waits for ever, `simulate` succeeding) in a library that forbids one everywhere else, and narrowed a guarantee
  the owner had kept on 13 November (the entry below). Source: the session of 19 November 2026, with two reviews.
  _Reopen if_ a fiber the run forks can be interrupted without the run's mark by anything but the program.
- **`onApplied` and `onIgnored` as effects, each call in a fiber of its own.** Spiked, 19 November 2026: `542cb6d`, on
  `spike/strict-interruptions`, never to be merged, against the synchronous options, `c69b78f` on
  `spike/synchronous-options`. Each call forked, awaited, stopped with the mark if the loop is
  stopped meanwhile, with a root of its own: the loop then runs no effect of the program, as with functions. Measured:
  no false defect in 1,424 interruptions by whoever runs the program, after k events, under the scheduler of the tests;
  a defect in its site for every interruption by a fiber of the program; and about 28% fewer messages a second in a run
  with `onApplied` (a bench by hand), where the functions gave some 7% more than before. Three reviewers weighed it;
  the third, asked to choose with no preference given, chose the functions. The owner chose the functions as the
  cleaner form: they are what `describeMessage` and `describeCommand` were then, a step waits only for a release,
  and what must wait (a command that starts once its state is saved, a debugger that pauses) waits in a command, a
  subscription or the renderer, which whoever runs the program wraps. What is lost: an option that waits, and an
  option's logs through the run's logger. _Reopen if_ a use needs an option that waits and cannot be written as a
  wrapped `runCommand`, subscription or renderer.
- **`void` as the return type of `onApplied` and `onIgnored`**, so that a function declared apart, which TypeScript
  types `=> void`, and `console.log` would be taken without `: undefined`. Probed with `tsc`, 19 November 2026, in a
  review of the synchronous options: a function that returns an effect, as `() => Effect.log("heard")`, is assignable
  to one that returns `void`, so the types would take an effect that the run never runs, the very mistake the change
  to functions makes impossible (the `@ts-expect-error` of `unheard` in `tools/smoke/consumer.ts`). The cost of
  `undefined` is the annotation, which the guide states ("Running", "`onApplied` and `onIgnored` are functions, not
  effects"). _Reopen if_ TypeScript can refuse a function that returns a value while it takes one typed `void`.
- **The root of a fiber the run forks as its one check of an unmarked interruption.** Spiked on the same branches:
  a root alone, with the scope taking every interruption the fiber received as today, records a death by the program
  only once the scope has released what it holds, and the run applies messages meanwhile, which "from the first defect
  on, the run applies no message" forbids: the search of interleavings found it (seed `-1180227867`, path
  `819:0:0:0:0:4:3:5:5:5:3`, a renderer interrupted by the program as it releases slowly). And a root that takes any
  cause, not only one of interruptions only, gave two defects for one interruption, since Effect adds what a fiber
  received to its failure. Hence the scope and the root both, the root on interruptions only. _Reopen if_ a death
  recorded after its release keeps the order of the defects and the end of the messages.
- **A flag for each fiber, in place of the mark on the run's interruptions.** Spiked, 13 November 2026: `8b714ff`,
  on `worktree-agent-a87c5e2edacf8377a`, never to be merged. Proposed by two reviewers of the invariants as a way to
  drop three premises read only in Effect's source; it would give up only a fiber that interrupts itself as the run
  stops it. What the spike showed, as its session reported it (the counts are the spike's, not run again): the flag
  alone gives false `ProgramDefect`s in `init` when whoever runs the program interrupts it at some points, which the
  suite does not see and a script interrupting after k steps did (3 and 6 of 400 values of k); with the question to
  the fiber of what interruptions it received, the flag adds nothing, since forcing it false fails the same 25 tests;
  a self-interruption in the release of a fiber the run stops would always be lost, and the rest of that release
  skipped in silence (23 tests to drop and 2 of the mechanism, 5 to 8 mutations, an invariant of the search
  weakened); and it saves one premise (the annotations of `Fiber.interruptAs`), already held by two tests that fail
  without it, and some 15 lines. `diesIn` still asks a fiber the run does not stop whether it was interrupted. The
  owner decided: the mark stays, and the guarantee is not narrowed. Source: the session "Analisi invarianti
  progetto", 13 November 2026, and the commit. _Reopen if_ a design tells the run's stop from a self-interruption
  with no question to the fiber, and keeps a self-interruption in a stopped fiber's release a defect.
- **Promising the order of the defects.** Reasoned, 13 November 2026. The run keeps the order and its tests check
  it; the guide describes it as how the run is made today, and promises only that every defect is in the cause,
  each with where (`858b819`). The reason the owner gave: binding the library's guarantees to a specific API of
  Effect is not right, even a stable and documented one; the argument for the promise was that `Cause.squash`, which
  `Effect.runPromise` and `Effect.runSync` use, takes the first defect. The principle is in
  [`invariants.md`](invariants.md), under "Defects always die". Source: the same session. The narrower form,
  promising only that the first defect of the cause is the first that happened, was left open in that session's
  table before the owner's decision, and the decision named no exception; it rests on the same argument. _Reopen
  if_ the promise can rest on the library's own code, not on what a function of Effect makes of a cause.
- **"A dispatch never runs `update` on the caller's stack", as a guarantee.** Reasoned, 13 and 14 November 2026.
  It became a sentence of the README's "View" instead (a handler returns before `update` has seen its message,
  `c3c2783`), as the owner accepted: it rests on a premise read only in Effect's source (an unbounded `Queue` wakes
  its reader through the scheduler of the fiber that made it), held by two tests of `run.test.ts`. The
  reason given then, that by the owner's principle above no guarantee rests on such a premise, said too much: three
  guarantees do, and the rule written since in [`premises.md`](premises.md) lets them (15 November 2026). The
  sentence is a promise all the same, of the Guide, held by those tests, and stays in "View", where a view's author
  reads it. Source: the same session, and the review of the rules of 15 November. _Reopen if_ the owner wants it
  listed among the guarantees, with a property of the search for it. Reopened on 20 November 2026, and reversed: a
  dispatch applies its message on the caller's stack, so that an element with a value of its own can be drawn as a
  controlled one ([`synchronous-dispatch.md`](records/synchronous-dispatch.md), E1). The guide's "View" now says that
  `update` has seen a handler's message when the handler returns, "Guarantees" lists it, and the search checks it ("a
  dispatch has been applied when it returns"). The premise of the queue it rested on left `premises.md` with it.
- **A dispatch that records a defect with a fiber made for it, and asks the runtime which fiber it runs in.** Spiked,
  20 November 2026, on `claude/spike-sync-dispatch-b4e430` (`26b2cc1`), never to be merged; refused by the owner the
  same day, with the plan of [`synchronous-dispatch.md`](records/synchronous-dispatch.md) (E3). The spike's engine
  recorded what the program threw in the thunk by running a failing effect with `Effect.runSyncExit` in whatever fiber
  sent the message, and `model()` asked `Fiber.getCurrent()` whether it ran in the renderer's fiber. Each rested on a
  premise read only in Effect's source, with a test of the spike's own (`src/sync/premises.test.ts`), seen to pass:
  that `Effect.runSyncExit` inside a running fiber leaves that fiber the current one, and that a fiber waiting on a
  `Deferred` resumes on the stack of the fiber that completes it, before the completion returns. Neither is adopted.
  The first goes with a synchronous `record` on `Deaths` (`shell.ts`), since `Core.record` is pure already, and with a
  model's defect recorded where the model is read, its site taking it as it is (E6): no fiber is made for a defect, and
  `model()` asks nothing of the runtime. Nothing rests on the second: the engine is correct either way, and the guide
  describes, and does not promise, that the end of the run may begin inside a dispatch. The record names no condition
  to reopen the first. The second was adopted on 21 November 2026, as a premise of the tests alone (`premises.md`):
  the killers of the mutations that wake a fiber inside a step rest on it, and no guarantee does.
- **A bound on how far the effects lag behind the state.** Reasoned, 20 November 2026, in the plan of
  [`synchronous-dispatch.md`](records/synchronous-dispatch.md) (E5), the owner deciding the same day: the effects of
  the states, their subscriptions stopped and started and their commands started, may lag without a bound. A step that
  held the next message until its job had started, as the loop held the next message until the effects of its step had
  started, would need a dispatch that waits, which a function called in a handler cannot do. It is the unbounded queue
  of the messages, moved to the effects, and the guide's "What is left to you" says so. The record names no condition
  to reopen it; by its reason, one would be a dispatch that may wait.
- **A job for the fiber of effects only while debug logs are enabled**, so that a message whose step starts and stops
  nothing costs no job. Refused in the spike of [`synchronous-dispatch.md`](records/synchronous-dispatch.md), 20
  November 2026, reasoned: decided in the thunk from the run's context, it would rest on how `LogLevel.isEnabled` reads
  the level, and a job of logs alone is a small object for each message. Measured since, by hand, in its stage 1: the
  jobs are most of what the new engine spends on a message. Done otherwise, the same day, by step 4 of the roadmap,
  with the owner's yes: the run writes no log of its own (below), so the thunk offers a job only for a step that stops
  or starts a subscription or has commands, decided from the step alone, with no reading of the level.
- **The run's own debug logs**, of each message, each rejection, each message dropped before `update`, and each
  subscription that starts, stops and ends, with `describeMessage` and `describeCommand` to shape them. Removed 20
  November 2026, reasoned, with the owner's yes, on [`architecture-review.md`](records/architecture-review.md), "A run
  without logs of its own": they were a name over a composition, since `onApplied` and `onIgnored` with a queue log the
  same; every program paid a job for each message, debug logs enabled or not; and they needed two options, three sites
  of a defect, an invariant and a premise of their own. What is lost: the log of a message dropped before `update`,
  which no option hears, and the logs of a subscription that starts and stops, which an option works out from the
  keys of the two states it is given. _Reopen if_ a user needs to see what no option hears, and an option cannot be
  given it.
- **Skipping the start of a subscription whose key went away before the fiber of effects reached it.** Refused in the
  same spike, reasoned: it would be a check of what the thunk changes, made in another fiber, against "one thunk"
  ([`invariants.md`](invariants.md)), and nothing needs it, since the messages of such a start are dropped by their
  start. It costs a start and a release for nothing, which the search reaches. The record names no condition to reopen
  it.
- **One owner of the run's decisions, in other forms.** Spiked, 13 November 2026, on copies deleted since: a death
  queued as a message of the loop; no check at all, the loop stopped first, and the renderer stopped first; the
  death interrupting the loop; the loop calling `runCommand`. Reasoned only: `forkChild` with `startImmediately`,
  and one mode of resumption in `test/scheduled.ts`. Each, with its counts and why, is in
  [`single-owner.md`](records/single-owner.md), "Alternatives".
- **The shared core in a smaller form**: the guard alone, a core for `rehearse` alone, and the register of deaths as
  part of the step's state. Reasoned; the document records no spike of them. [`shared-core.md`](records/shared-core.md),
  "Alternatives".
- **One engine under the run and the testing tools, in other forms**: the engine generic in what performs a job, with
  a performer for the run, one for `rehearse` and one for `simulate`, and one transition of `core.ts` for the pure half
  of a step alone. Reasoned, 21 November 2026, beside the spike of the form the owner took, where the engine is given
  what the fiber of a command and the fiber of a subscription run; neither was spiked.
  [`one-engine.md`](records/one-engine.md), "The form".
- **Other caches of a parent's lifted subscriptions, for children that share one state object.** Spiked, 15 November
  2026, on `compose.ts` in the working tree and in a copy, neither kept; measured with `bun run bench`, per change of
  state for a thousand children, in objects of their own and sharing one, against 0.22 and 1.31 ms before. The cache
  kept one place for each state, so children that share one lifted again on every call; keeping every place would let
  ids pile up under a step's `init`, which lives as long as the program. Rejected, in favour of the places of the last
  call in their order (`liftedAt`): keeping only each child's own subscriptions by its state, as `modelsOf` keeps a
  model, and lifting them on every call (0.78 and 0.76 ms: a `Channel.map` for each subscription on each call); a map of
  places keyed by `[name, id]`, made again on each call (1.24 and 1.15 ms: a map for each child, and Effect's hash of an
  array key costs about 0.36 µs, a number's 0.02); and the first place kept for as long as the state lives, the others
  in maps by id for the last two calls (0.23 and 0.34 ms), which keeps two rules for one thing, keeps up to twice the
  list, and holds the ids of the last calls that shared a state once none does. The positional cache costs the common
  case about a tenth (0.26 ms), and lifts again the children after a place inserted or removed among those that share a
  state, in that call alone. Source: the session that made the change, with a review by a second model. _Reopen if_ a
  list that inserts a sharing child before the others on most changes of state is shown to matter, which the maps by id
  keep. Moot since the store, step 34 of `ROADMAP.md`, 22 November 2026: the library keeps each child in an instance of
  its own, by which its lifted subscriptions are kept, and children no longer share a state object at their places.
- **Telling `onIgnored` whether a rejected message came from the frame of the current state**, so that a rejection
  that cannot be a late tap reaches an application's telemetry as a bug. Reasoned, 16 November 2026, proposed by a
  second model (Fable 5.2) asked whether `reject` is right for the view's messages; not spiked. The run cannot tell:
  it has one dispatch, the same function in every frame, so its messages carry no frame; and a `seen` of the current
  state one below the message's number is no proof that the user saw that state, since `seen` counts no message of a
  command or a subscription and the renderer may not have drawn the last frame yet, so a late tap would be reported
  as a bug. Knowing the frame would need the bridge to pass its revision with each dispatch, a change of `Dispatch`
  and of every bridge, where [`registers.md`](records/registers.md) chose `seen` over a revision. And with it, reporting
  the message the current model holds and `update` rejects is the runtime check of the model against `update` that
  [`invariants.md`](invariants.md) rules out ("`reject` means one thing"), close to the run that reported a rejected
  offer (above). What the proposal wanted needs no frame: a message the model of a state holds and `update` rejects in
  that state is a bug from whatever frame it came, and `onIgnored` is given both, so an application may compare them
  there. For an input, the model holds only the write over the value its place holds: a write over a value since
  replaced is not among them, so is not reported, where taking any write to the input as held would report every late
  one. Source: the session that weighed it. _Reopen if_ rejections in production are shown to hide bugs the property
  tests cannot reach, and a frame's identity can reach the run without a change of `Dispatch`.
- **`run` split into a synchronous half and the fibers** (B5 of
  [`synchronous-dispatch.md`](records/synchronous-dispatch.md)), so that `Host` draws the first model in the render that
  mounts it, and a server draws it with `getServerSnapshot`. Reasoned in the spike, not built: the thunk applies at once
  and the effects of a step are jobs for a fiber, so the engine's state, its keys, its listeners and its queue of jobs
  could be made synchronously, before any fiber starts, and the fibers started later. Parked by the owner on 20
  November 2026: the first model, for a server or for `Host`'s `fallback`, is data a program gives already,
  `program.makeModel(program.init.state)`, drawn with a dispatch that does nothing ("`renderToString`", below), and a
  split is an export and a second way to start a run. Its sentence on StrictMode, that the second render would make a
  second half that nothing starts with no command of `init` run twice, held of the second render and not of the second
  effect, which is the one that starts a run. Reopened the same day, and reversed: spiked and taken by the owner
  ([`store-and-effects.md`](records/store-and-effects.md)). `start(program, options)` is plain code and gives
  `{ app, run }`: the handle a renderer reads, and the effect that runs the program's effects; `run(program, render)`
  is removed; `Host` starts its run in a microtask after its effect, so that under StrictMode the commands of `init`
  start once; and the guide promises that a server draws the first model.
- **Telling a program that was started and never run, as it runs**: a `dispatch` that throws, or a warning or a log,
  once a program applies messages and no `run` has begun. Reasoned, 21 November 2026, with a second opinion (Fable),
  the owner deciding. A program started and never run is a state the library itself makes: `Host` and `Draw` draw the
  first model on a server and run nothing, a render that React throws away leaves a program that nothing runs, and
  `Host` starts its run in a microtask after its effect. No signal tells a forgotten `run` from one left out on purpose,
  and a log would be one of the run's own ("The run writes no log of its own", `AGENTS.md`). So `start` gives
  `{ app, run }`, where it gave the `App` with `run` among its members: a `run` left out is then a variable that a
  linter reports, and leaving it out is written (`const { app } = start(…)`). The guide lists the rule under "What is
  left to you". _Reopen if_ a signal is found that tells a forgotten `run` from one left out on purpose.

- **`rehearse`, owning what the test starts, in other forms**: the loop calling `runCommand` (spiked, `cb7dfd0`),
  a request the loop has not taken failing the rehearsal (spiked, `74b271f`), a subscription's message applied as it
  is sent (reasoned), and three more reasoned only. The accepted form was `db8309a`. Each is in
  [`rehearse-owned-effects.md`](records/rehearse-owned-effects.md), "Alternatives".
- **What the tools do with a step that does nothing.** These were refused inside a proposal the owner decided in
  part on 15 November 2026 ([`inert-steps.md`](records/inert-steps.md), "What was decided"): with `onEvent` left without
  `reject`, the first three entries and the last stand rejected. `Inert` itself was deferred, taken by the owner
  on 23 November 2026, always on, and done (`inert-steps.md`, "Weighed again"): the two entries on it stand rejected
  with the others. Each is in its "Alternatives":
  - `reject` in `onEvent`, the whole message rejected. Spiked (sixteen tests over seven cases): a child could no
    longer rely on its own transitions, the tool would blame the child, and one answer would have two outcomes.
  - `reject` in `onEvent` only where the child's step changed nothing of its own, a defect otherwise. Reasoned.
  - A gate on a child, an option saying when it takes messages. Reasoned: it would reject the answers of the child's
    own commands too.
  - `Inert` by identity, not by `Equal`. Spiked: two programs that behave alike would be judged by how they build
    their state.
  - `Inert` as an option to turn on. Reasoned: a check that is off finds nothing. `Missing`'s change alone, refused
    beside it, was taken on 15 November 2026, while `Inert` was deferred.
  - A constant `unchanged`, frames with a version, a child that removes its own duplicates, events with an answer
    from the parent. Reasoned, 26 October 2026, in a discussion in an application that uses the library, not in
    this repository; the reasons are the document's, and that discussion was not read again for this index.
- **A tool that explores a program from `init`**, breadth first, by what each state offers, to a bound. Spiked, 14
  November 2026: `spike/explore` (`5476871`), never to be merged; the account is
  [`exploration.md`](records/exploration.md). Rejected by the owner the same day, as neither practicable nor useful. Its
  measures (the spike's, not run again): one timer of twenty-five minutes from `init` is 39,050 states in 0.9 s, and
  children multiply, so two would be the square (reasoned, not run): a composed program, the usual one, is walked
  only within a bound so tight that the test chooses the states again, as a generator does. What it found on the
  five examples: one control already known (`StopAllClicked` over an empty list), two behaviours that are meant and
  two false alarms of `Inert`; nothing their tests should have caught. It replaces no generator, since it does not
  reach messages from older frames, ended subscriptions or values beyond its samples; what it adds to
  `dispatchViolations` over a generator's states is `Outdated`, `Stuck` and `Ignored`, the last two often meant. And
  it would be one more tool to keep in step with the engine, with concepts of its own (`within`, `heard`,
  `answers`, nodes with the commands under way, eight findings). Not measured: what it finds when a bug is put into
  an example. _Reopen if_ a walk keeps a composed program tractable without the test choosing its states (a child
  walked alone, ids told as names), or a bug put into an example is found by it and by no test the library's tools
  already make possible.
- **A mark on a model's messages, so that a tool finds a reader that forgets one.** Reasoned, 15 November 2026,
  from the third spike of [`declared-inputs.md`](records/declared-inputs.md), whose walk found every marked message of a
  model, and from the port of the plain input ([`registers.md`](records/registers.md)), after which the question is of a
  model's fixed messages alone: an input's writes are no reader's. A test's reader is trusted as its candidates are,
  and one that forgets a fixed message is found by `Missing`, given a candidate that acts; the mark's price is the
  spike's, a constructor every model calls and the limits of identity, for a check no example needed. The owner
  judged `Missing` enough. [`boundary.md`](records/boundary.md) and `declared-inputs.md`, "Open questions". Source: the
  session that removed it from `ROADMAP.md`. _Reopen if_ a reader forgets a fixed message of a model, in an example
  or an application, and no test with `Missing` finds it.

- **A failure of a call of `rehearse` failing the rehearsal from any fiber.** Reasoned, 15 November 2026, on a
  finding of the review of that day: a rejected `send`, a `run` that matches nothing or a `hearNext` stopped while
  it waited, made in a fiber the scenario does not join, let the rehearsal succeed. The register of deaths means what
  the run died of, and `deadOr` makes every later call fail because nothing happens in a run that died: a call's
  failure leaves the program whole. A typed failure, in the error channel, is lost in a fiber nobody joins as a
  defect is. The one form that keeps the register's meaning, a second record read at the end, would fail a rehearsal
  whose scenario caught the failure with `Effect.exit` (tests of `rehearse.test.ts` observe one and go on), and
  `drive`'s timeouts, which fail the calling fiber too, would need the same. The guide says instead that a call's
  failure fails the fiber that made it. Weighed with a second opinion (Fable), the owner deciding. _Reopen if_ a
  test that forked a call and never joined it passed on a failure an application then met.
- **Every tool starting from `from` or `flags`.** Reasoned, 15 November 2026, on the same review. `simulate` is
  given pieces of a program, with no `init` (`simulate({ update, subscriptions })` is one), and folds from a step as
  `applyAll` does: giving it flags would ask for `init` to save the test a call of it. `drive` is a run, and a `from`
  there would name `{ ...program, init: { state } }`, which the guide gives for `run`. `rehearse`'s `from` was that
  spread under a name, and was removed instead (0.8.0), so that `drive` and `rehearse` start as `run` does. Left: under
  `simulate`, an `init` that throws on its flags is the test's own defect, not a `ProgramDefect` in `'init'`. _Reopen
  if_ such a defect goes untested in a program with flags.
- **`hear` refusing a write into an input**, which only a view sends, by the type of what it takes. Two forms, both
  rejected. The exact one, reasoned on 16 November 2026: a trailing `Heard` parameter of `Shape`, typing
  `subscriptions` (`Own | ChildHeard<C>` from `program`, the `message` of a `Program<…>`), taken by `hear` and
  returned by `hearNext`. It would be invariant in `Rehearsal`, which takes and returns it, so a `Rehearsal<…>`
  annotated by hand, as tests write it, breaks unless the test names it, with a new `HeardOf`; a `Program<…>`
  annotation, which gives `message`, loses the rule again; and it serves one method of one tool. The form by shape,
  shipped in 0.8.0 and removed on 22 November 2026: `hear` refused `{ _tag, message: Written }` at any depth. It
  refused right tests: an own message of that shape holding a `Written` as data, a wrapper built by a constructor of a
  parent's `Data.taggedEnum`, and any value typed as the whole message, as a helper of a test returns, with an error
  that named no rule (`application-report.md`, point 4). And it was partial: a click or a command's answer said as
  heard passes, and the test answers for what it says was heard. A heard write is applied as the run applies any
  message, stored where its place is there, so nothing is left undefined to refuse; a program's own
  subscription cannot send one, by the type `make` gives it (its own messages, kept apart from the inputs' names by
  `NoClash`). Weighed with a second opinion (Fable) each time, the
  owner deciding. _Reopen if_ `Shape` gains a type of what its subscriptions send for another reason.
- **`rehearse` and `simulate` taking the options of `drive`** (`RunOptions`), so that a rehearsal checks an observer
  and its defect, as "symmetric where its tools are" (`AGENTS.md`) asks about. Reasoned, 16 November 2026, on the item
  of `ROADMAP.md`. `RunOptions` is how a program runs (`engine.ts`): `drive` is a run and passes them on, while
  `rehearse` and `simulate` take a program without a runtime, and `flags` is the program's input, no option of a run.
  `describeMessage` and `describeCommand` shaped the run's debug logs then, which neither tool writes, and are removed
  since. `onApplied` and `onIgnored` watch ("Invariants" in `invariants.md`): they cannot change what a rehearsal
  checks of the program, and that a defect in one ends the run is the engine's promise, which `run.test.ts` keeps,
  not one an application's test checks. `simulate` runs no effect but its commands', and an observer returns one. In
  `rehearse` they would be an effect that waits inside the step the loop applies, which the end may interrupt: new
  points between a check and its act, mutations, cases of the contract and prose of the README, in the largest tool,
  for no test of a program. Weighed with a second opinion (Fable), the owner deciding. _Reopen if_ a test of a program
  needs what an observer is told; the form would then be the records as data, not callbacks: an `applied` list of
  `Applied`, and `ignored` widened to `Ignored`, which `Rehearsal.ignored` already half is (that widening breaks it).
- **A caret as the peer range of Effect** (`^4.1.4`), with the daily job as its alarm and, for a premise that falls at
  a version the range accepts, a patch release that leaves that version out. Reasoned, 23 November 2026, on step 8 of
  `ROADMAP.md`, advised by [`architecture-review.md`](records/architecture-review.md) and by the session that sorted
  the premises ([`premises-and-range.md`](records/premises-and-range.md)): no premise holds the state or the order of
  the messages, so a fall takes at worst the end of a run and its defects, and Effect's own packages name `effect` with
  a caret. The owner kept the tilde: a version published keeps its range, so such a patch reaches only whoever installs
  or updates after it, and a version that a later Effect breaks can still be installed, with a deprecation as its one
  warning. The range had been a caret from 12 to 17 November 2026 (`a7cb3df`, `fa55459`). What the owner took instead,
  to rest on less of Effect and to learn of a fall sooner, is steps 45 to 47 of `ROADMAP.md`. _Reopen if_ the premises
  that hold a guarantee are documented by Effect, or the library no longer rests on them.

## The API

- **A check of the names in `program<{ … }>()` and `Program<{ … }>`**, which refused one that is none of a program's
  types (`modl` for `model`). Added on 17 November 2026 (`738f49c`) and removed the same day, before a release, the
  owner deciding: a misspelled name is a name not given, and a program that does not name a type is correct as it is.
  The developer finds the mistake where the type is missing. The check kept none of the three rules of the types
  (`AGENTS.md`, "What belongs here"), at the cost of two twin markers, one in `program.ts` and one on `make`'s
  config, since API Extractor refuses a module's type that the package does not export. _Reopen if_ a misspelled name
  can make a broken
  program compile.
- **Checks that hold for a type parameter**, so that a function over any program (`<P extends AnyProgram>(p: P)`)
  could declare it a child and call `make` without erasing its types. Probed with `tsc` on 17 November 2026, with a
  second opinion (Opus), the owner deciding. What a child needs from its parent (`onEvent`, flags, `runCommand`) is a
  rule "exactly when" over its types, which the compiler cannot decide for a type parameter: its conditional stays
  deferred and accepts nothing. Even `Program<{ state: S; model: M; message: Msg }>` stays deferred, since every reader
  infers through the conditional of `ObjectState<S>`. Making them hold would rework `Program`, `Shape`, every `*Of`
  reader, `Handles`, `OnEventOf` and `Config`, on how the compiler treats generic types, and risk types that read
  differently by how the code is written, while a rule over a truly generic `P` still could not be decided. Such a
  function is written as an overload over erased types instead ("Composition", "Precisely"), and a frame is better a
  child beside its content. The same holds for a state that is a type parameter in `make`, refused since 18 November
  2026 so that a number cannot reach `run` through a generic function (`MakeProgram` in `compose.ts`): a type
  parameter in a field of the state compiles. _Reopen if_ a library of components over this one needs such functions
  often.
- **`DeclareChild<State>` in place of `DeclareChild<T>`**, and so for `DeclareChildById`, `DeclareInput` and
  `DeclareInputById`, which use only the state of the types a program declares. Spiked, 18 November 2026, with
  TypeScript 7.0.2, in a review of the exported types. The types are the same once resolved: typecheck, the tests and
  the matrix of inference passed. But a state written `type State = Readonly<{ … }>`, the repository's own style, loses
  its name once read out of `T` (by `Field` or by `T['state']`): the declarations of a destructured `program<…>()`
  printed `Readonly<{ … }>` inside each of the four, and the smoke test failed ("spells out the state 16 times, more
  than 12"), where `DeclareChild<{ state: State; … }>` keeps the name as the user wrote it. _Reopen if_ TypeScript keeps
  the name of an alias of an alias when it prints the type.
- **`attempt`**, which turned an effect that may fail into an execution with a message for each outcome. Removed in
  0.7.0 (`775f140`, 26 October 2026) by "A function earns its place" (`AGENTS.md`): it only named two combinators of
  Effect (`Effect.match` and `Effect.asSome`), and the type of an execution already says it cannot fail. Reasoned.
  _Reopen if_ it does what those combinators cannot.
- **`silent` and `Subscription.every`.** `AGENTS.md` names them as removed by the same rule, since `775f140`.
  Neither appears anywhere in this repository's history, so what each was, when it was removed and where are not
  found here: they may come from an application or a predecessor of the library. To be completed by whoever knows.
- **`write`, `isRejected` and `raise`.** Removed in 0.8.0, 15 November 2026, by the same rule: each was a name over
  what a user writes as it is, `write(was, value)` over the literal `{ _tag: 'Written', was, value }` (the literal has
  carried its `value` alone since 20 November 2026, [`write-without-was.md`](records/write-without-was.md)),
  `isRejected(result)` over `result === reject`, and `raise(event)(state)` over the step `{ state, events: [event] }`,
  as the wrapping of a child's message would have been (below). `write` took two arguments of one type, in an order
  nothing checked, where the literal names them. Checked with `tsc`: `=== reject` narrows a `Transition` as
  `isRejected` did, and a handler written by hand in `onEvent` is refused and inferred as `raise` was ("a parent
  raises only the events its own type includes", `compose.test.ts`), since the check is `onEvent`'s. `raise` was
  weighed with a second opinion (Opus 5.5), the owner deciding; `write` was never released. _Reopen if_ one of them
  comes to do what the literal or the operator cannot: a check as it is made, or a shape that is hidden.
- **A dispatch as an `Effect` that completes synchronously**, once a dispatch applies its message at once, in place
  of a function `(message) => void`. Weighed in the spike of
  [`synchronous-dispatch.md`](records/synchronous-dispatch.md), 20 November 2026, and refused by the owner the same day
  (E2), reasoned. An `Effect` would keep the type of 0.7.1's `Dispatch`, and with it `forwardTo` and every view, would
  compose in effect code with `yield*`, and would say by its type that it needs no services and cannot fail. It would
  cost an `Effect.runSync` and a fiber made for each event from a plain callback, and a reader would take an `Effect`
  for a step that may wait, which this one may not. With a function, a handler of any renderer calls it as it is, and
  effect code writes `Effect.sync(() => dispatch(message))`. The record names no condition to reopen it; by its
  reason, one would be a dispatch that may wait.
- **`onClick` and `onPress` in the bridges**, which ran a dispatch on a click and on a key. Removed on 20 November
  2026, before a release, by "A function earns its place" (`AGENTS.md`), the owner deciding
  ([`synchronous-dispatch.md`](records/synchronous-dispatch.md), B2): once a dispatch is a function, each is a name
  over a call that a handler writes as it is. Reasoned. _Reopen if_ one of them comes to do what a handler that calls
  `dispatch` cannot.
- **`subscriptions` optional on a program's type, with a public `subscriptionsOf` to read it**, as from 0.4.0 to
  0.7: the piece is required on `Shape` and `Program`, and a test reads `program.subscriptions(state)`. Decided on 18
  November 2026, the owner deciding, over the entry of 15 November that kept `subscriptionsOf` public because the piece
  was optional. A name whose only use was to apply the meaning of a missing piece goes by the rule of `AGENTS.md` ("A
  function earns its place") once no program on a type lacks it: `make`, which always set the piece, is the one place
  where a config without it means listening to nothing, as `update` is optional in the config of `make` and required
  on `Program`. Spiked: the `?` taken off `Shape` broke 44 lines, all in the library's own tests and 38 of them a
  program written as an object, none in `src/` and none in the examples. _Reopen if_ a program the library takes cannot
  be written with `subscriptions`, or a test of a program has no other way to read what it listens to.
- **Checking a program's external messages in `make`**, where `child` and `childById` check them today. Spiked on 17
  November 2026, with a second opinion (Fable), the owner deciding. A check in `config`, or in a rest parameter after
  it, reads the own messages in the compiler's first pass, which skips a context-sensitive `update` (one whose
  `children` or inner `(state) =>` takes its type from the signature) and gives them their default, `never`: valid
  parents stop compiling. Fable found a form that holds, a type parameter `U = unknown` inferred from `update` that
  keeps the check silent while it is `unknown`, beside a branch for a config without `update`; checked with `tsc`
  (7.0.2, and 6.0.3 and 5.9.3 on a copy). It is not adopted: a wrong `external` is already an error, where the program
  is a child, and the owner asks of the types only that every program can be written and every invalid one fails
  somewhere. The form only moves that error, at the cost of a type parameter and a union in every hover and every error
  of `make`, on an order of inference no documentation states. A check only where `message` is named was refused too:
  the rule would depend on how the types are written, and `message: never` would escape it. _Reopen if_ a program with
  a wrong `external` can compile everywhere, or the compiler documents its two passes. Reopened in part on 17 November
  2026: a parent's `external` that named a message its child keeps to itself compiled everywhere, and the child's
  rejection of it was a `CompositionDefect` (found by the matrix of inference). `make` checks that part alone
  (`ExternalPassed` in `compose.ts`), from the children, which no pass skips; an `external` that is no message at all is
  still refused where the program is a child. Since messages are named, the first pass no longer skips them either, but
  the rest of the check would still only move an error. Reopened in part again on 18 November 2026, from a review: an
  `external` that named a write into the program's own input compiled everywhere, since a write is one of its messages,
  and a parent's write over a stale value was a `CompositionDefect`; a command's answer wrote into the child's input,
  which the guide says does not compile. `make` checks that part alone too (`ExternalWritten`), from the inputs, by tag
  (Fable: a check by message missed `string`, template and non-distributed tags). That it also refuses, at `make`, an
  external with an input's tag and the wrong shape, which `child` would refuse later, is the only error it moves. Both
  checks read a tag by the names it can take (`TagsTaken`) since a review of the same day, which the matrix confirmed:
  an `external` tagged `string` gave a child a message it keeps to itself, and compiled everywhere. Moot since 20
  November 2026: external messages left the program's messages, for a function `external` of their own
  ([`external-handler.md`](records/external-handler.md)), so there is no part of the messages left to check, and
  `ExternalPassed` and `ExternalWritten` went with it.
- **An error at `make` for a `runCommand` that returns `any`** (Fable: `0 extends 1 & Ran`, "a runCommand returns
  any"), listed in `ROADMAP.md`. Reasoned, 17 November 2026, on probes with `tsc`: such services were read as `never`
  by `CommandServicesOf` and `SubscriptionServicesOf` alone (`Known` in `program.ts`), and so by a parent, while `run`
  and the testing tools, given the program itself, already asked for `unknown`. Reading them as `unknown` closes it for
  `any` and `unknown` alike, in commands and subscriptions, made or annotated; the guard would have covered one of the
  four, and moved an error that `run` gives. What neither reaches is an `any` that a program written by hand gives to a
  type it declares, or hands to `run` unannotated (`RC` gets no candidate from it, and keeps its default, `never`):
  that is TypeScript's own escape, and nothing of the library sees through it. _Reopen if_ one of those can be told
  apart from a program that needs no services.
- **`satisfies Program<…>` as the way to write a program without children**, with its services as `unknown`, in place
  of `program<…>().make(…)`. Reasoned, 17 November 2026, when every program came to be made with `program`.
  `satisfies` checks the literal and leaves it its own type: `typeof` the program reads the literal, so a command, a
  message or a service that its pieces do not show is lost, and services named `unknown` say nothing of what it needs.
  A second way of writing the same program would only confuse. _Reopen if_ a program that `make` cannot express is
  written that way.
- **`child`, `childById`, `input` and `inputById` as free functions, and `make` as `program` itself**, in place of the
  functions that `program<T>()` returns. Reasoned, 17 November 2026, the owner deciding. TypeScript does not infer
  some type arguments when others are given: `make<{ state: State }>(config)` would take the defaults of `Model`, the
  children, the inputs, the own messages and the services, not infer them. So a `make` given `T` is still
  `make<T>()(config)`, the curried call of today under another name, or it infers `T` too, and the types are no longer
  named first and checked. Free declarations would not know the parent's state: an input's `at` carries it
  (`Optic.id<State>()`), but `get`, `set`, and a child's `there`, `key`, `flags`, `ids` and `listening`, would annotate
  `state` in each function, or take its type from `withChildren` or `make`, whose children and inputs are themselves
  inferred, on an order of inference no documentation states (as the check of external messages in `make`, above). And
  a declaration of the wrong state would fail inside `make`, not where it is declared. _Reopen if_ TypeScript infers the
  type arguments that a call does not give (microsoft/TypeScript#26242).
- **A parent's children declared in the call of `make`**, as `children` of its config, or as its first argument, in
  place of `withChildren(children).make(config)`. Spiked on 22 November 2026 (`spike/tell-matrix.ts` on
  `spike/kept-children`, 24 cases, TypeScript 7.0.2), and probed again for step 34 of `ROADMAP.md` with TypeScript
  5.9.3, 6.0.3 and 7.0.2. Where the children are inferred in the call that holds `update`, the literals of a `tell` lose
  their tags (`_tag: string`), in a field of the config and as a first argument alike, and each needs `as const`: an
  error of `_tag: string` names no rule of the library. Children fixed by a call before `make` widen nothing, with each
  of the three. The owner chose the call before, on 22 November 2026 ([`kept-children.md`](records/kept-children.md),
  "Decided, under the store"), and kept `withChildren` when asked whether it is a second way to write a program: a
  program without children is written `make(config)`, a parent `withChildren(children).make(config)`, each in one way.
  `make` curried on the children for every program (`make({})(config)`) was refused with it: one entry, but a heavier
  call for the common case. _Reopen if_ TypeScript keeps the literal types of a return inferred against a contextual
  type that holds a type parameter being inferred.
- **`forEach`**, the n-ary `andThen`, a step followed by one more for each item. Removed with the store, step 34 of
  `ROADMAP.md`, 22 November 2026, the owner deciding. It was admitted for `examples/list`, whose parent told each of
  its children by id the same thing through a handle; a parent now lists what it tells in the `tell` of one step, and
  `Arr.map` over the ids makes that list. No example and no rule of the library needed it any more, and an export
  taken out later breaks its users, where one added later does not. `andThen` stays: it is the one place where the rule
  of how two steps of one program combine is applied, and it folds a `tell` as it folds the commands and the events.
  _Reopen if_ a program must fold, over items, steps that each read the state the one before left, and `andThen`
  in a reduce does not read well.
- **A child's `key` that says whether the child is there**, an `Option` as in the spike, beside `there`. Weighed in
  step 34 of `ROADMAP.md`, 22 November 2026, which the owner left to decide. With both, two functions could say that a
  child is not there, and a parent that needs no key would write `Opt.some` for one. `there` alone says it, `key` is a
  plain value compared with `Equal`, read only in the states where the child is there, and a child with flags says it
  by the `Option` of its flags, which it has to give anyway. _Reopen if_ a child that is there and one that is not need
  a key from one function, in a way `there` cannot say.
- **The last listing of children by id kept in the state**, for the shortcut of the reconciliation, as the spike kept
  it (`spike/kept-shortcut.ts`). Measured for step 34 of `ROADMAP.md`, 22 November 2026: where `ids` gives the very
  same object for the own state of before and for the new one, nothing is reconciled, with no field. A step of the
  parent's own that leaves its ids as they were costs 0.17 to 0.21 microseconds at 10, 1000 and 10000 children, and
  154 at 1000 without the shortcut. The field would be data derived from the own state, in the state. _Reopen if_ a
  common form of `ids` builds a new iterable at each call, and costs a list as long that.
- **Handlers of `update` by the case of the state**, with an answer given only to the case that asked for it, in place
  of one `update` over every message. Reasoned, 22 November 2026, from a second opinion on the design, the owner
  deciding; not spiked. `update` would no longer be one function that a test calls with any message in any state,
  which `dispatchViolations` and the testing tools rest on. And what it was for is held another way. Between programs,
  the number of an instance gives an answer only to the child that asked (step 34 of `ROADMAP.md`). Inside one
  program, the state machine holds it, once nothing but the program's own `update` replaces its state: work that stops
  with its state is a subscription under a key, whose late messages the run drops, and a command is for an answer
  that must arrive when the state has moved on. [`kept-children.md`](records/kept-children.md), "What was not taken
  from the second opinion". _Reopen if_ an answer reaches, inside one program, a state that its `update` cannot tell
  from the one that asked.
- **`renderToString`, a first frame for server-side rendering.** Reasoned, 16 November 2026, on the idea of
  `ROADMAP.md`, by "A function earns its place" (`AGENTS.md`). The first frame is data a program already gives:
  `program.makeModel(program.init.state)`, or `program.makeModel(program.init(flags).state)`, whose view a server calls
  with a dispatch that is one literal, `() => Effect.succeed(0)`. All a function would add is the `typeof` of `startOf`,
  which decides nothing a test can see; the string is the renderer's (`react-dom/server`, a serializer of snabbdom),
  which the library may not import; hydration is the bridge's, inside `renderInto`; and sending the state to the
  client is a promise of serialization, which `registers.md` ("What a model is") declined, to come with a schema of
  its own. Weighed with a second opinion (Fable), the owner deciding. _Reopen if_ a server needs the state after the
  commands of `init` have answered, a run to quiescence that returns its state: that is what Effect alone cannot do,
  and a feature other than this one. A first frame drawn on a server in an example goes with "The bridges as packages of
  their own" (`ROADMAP.md`), which decides the dependencies of the bridges. Since 20 November 2026 a dispatch is a
  function, and the literal is `() => {}`. The entry still stands: the library exports no function for it. Since the
  split of `run` was taken ("`run` split into a synchronous half and the fibers", in "The engine and its guarantees"),
  a server calls `start` and reads the handle.
- **Offers as tokens, checked against `update`** (`offer`, `offerInput`, `missingOffers`, a run that reported a
  rejected offer). Shipped in 0.3.0 (`ae4661b`) and removed in 0.6.0 (`3c3fdf9`, 23 October 2026): checking each
  offer against `update` made every page carry rules (offer only what `update` accepts, never probe offers, inputs
  never rejected at runtime) for a bug that leaves the state unchanged and that the property tests already find.
  The run then ignored every rejection, and the testing tools held the view (since item 1 of `boundary.md`, the
  model) to what `update` accepts. Shipped and used, then reasoned out. A related form, offers as data with no
  check at run time, is "What reaches `update`, declared as data", below.
- **An offer that asks `update`, and is an `Option`**: `make` gives `makeModel` a function `offer`, and
  `offer(message)` is `Some(message)` where `update` accepts the message in that state and its step does something,
  `None` otherwise, so that a condition is written in `update` alone. Reasoned, 22 November 2026, not spiked: proposed
  in a session on an application that uses the library, and weighed here on the library's examples. It is not the
  entry above: the `offer` of 0.3.0 threw on a message that `update` rejected, and the rules of that time already
  ruled out one that returns an `Option` (`AGENTS.md` before `3c3fdf9`). The commit that removed the offers kept that
  rule, which is "`reject` means one thing" in [`invariants.md`](invariants.md) today. It still holds:
  - **A model has cases, and an `Option` has two.** The editor of `examples/form` is `Saving`, `Blank` or `Named`:
    `offer` is `None` in the first two alike, so the model reads the state to pick its case all the same. It serves
    only a flat model, as that of `examples/timer/duration.ts`, where it saves one expression.
  - **It holds nothing by construction.** A model is data, so a message written by hand fits it, and the test with
    `dispatchViolations` is still needed, as the entry of an input did not close a write built by hand ("An entry of
    each input in the model, which a view writes through", below).
  - **It hides a bug that the tests find today.** Where `update` rejects by mistake, the control is missing, and
    neither `Rejected` nor `Missing` reports it, since both ask `update`. With the model read from the state,
    `Rejected` does.
  - **It costs a call of `update` for each message of each model made**, and a comparison of two states by `Equal`
    where it leaves out a message whose step does nothing, as `Inert` would report one in a test
    ([`inert-steps.md`](records/inert-steps.md)).
  - **It can die.** The types do not tell a view's message from a subscription's or a command's, and one of those,
    asked in a state that rules it out, is a defect in `makeModel`.
  - **It is three lines** over the program's own `update` and `reject`: no function of the library's ("A function
    earns its place", `AGENTS.md`).

  What it wanted is answered in the program. A condition that is a phase is a case of the state, which `update` and
  `makeModel` both match. One on a value is one function of the state, which both call (`isBlank` in
  `examples/form`). Source: the session that weighed it. _Reopen if_ a control is shown in a state where `update`
  rejects its message, in an example or an application, and no test with `dispatchViolations` finds it.
- **`describeKey`, an option for how a subscription's key appears in the logs and in a `ProgramDefect`.** Reasoned,
  13 and 14 November 2026. Proposed by a review of the invariants, since a key, a string message and a child's id
  reach a crash report as they are. Deferred on the 13th, then rejected on the 14th after a second opinion: a key is
  the identity its author chose, as a tag is, even where it holds data; reporting is the job of whoever runs the
  program, whose reporter already filters the `cause`, any thrown value the library cannot scrub, and with it `key`
  and `on`; and an option would only name code around `run`.
  An option for the logs alone leaves out the crash report; one for the
  defect too runs the program's code as the run dies, or costs at every start outside debug, makes the key differ
  from `onApplied`'s `origin`, and leaves a child's `id` undefined. The guide says instead that the key and the id
  are carried as they are, and a string message whole. Source: the sessions "Analisi invarianti progetto" and
  "Parere Fable sulle invarianti", and this one. _Reopen if_ a program needs a key that must hold private data and
  cannot be built otherwise.
- **Input through a subscription**, a keystroke sent through a key in place of a dispatch. Reasoned, November 2026,
  before the proposal of declared inputs: typed-then-Save would rest on scheduling, a typed message would be checked
  by nothing, a key that goes away drops what it sent, and the renderer would feed the run by a service.
  [`declared-inputs.md`](records/declared-inputs.md), "What was proposed".
- **What reaches `update`, declared as data** ([`declared-inputs.md`](records/declared-inputs.md)): in every state,
  each message that can reach `update` declared as data, an offer with the schema of what the outside supplies, for a
  view, a key and a command alike. Spiked three times on 14 November 2026 (`spike/declared-inputs`,
  `spike/dispatch-offers` and `spike/offer-check`, never to be merged), suspended by the owner the same day, and parked
  below until 23 November 2026. The owner rejected it then, when each parked entry that breaks the API was weighed
  while the library has few users (`declared-inputs.md`, "Weighed again"). Its first aim, a model with no function for
  what the user types, was reached by the plain input. A view builds no message by the guide's rule, with `Message`
  exported as a type only. The keys of a program are data since `listen` makes a subscription from its key. And a tool
  that explores from `init` was rejected ("A tool that explores a program from `init`", above). What was left would
  rewrite every program, with an offer of two shapes, a path, schemas in a model and declared entries, for the
  messages of a key and the answers of a command, which a test lists or stands in for today. Two parts of it were
  weighed apart the same day: what a key sends (the next entry), and a message with one value left for the element to
  give, which the owner took to a spike (`declared-inputs.md`, "Weighed again"). _Reopen if_ a message of a key or an
  answer of a command that `update` rejects is found in an application, and no test that the tools allow finds it.
- **A subscription that declares what it sends**, so that a tool judges a key's message as it judges a model's
  (`declared-inputs.md`, "What still makes sense", point 3). Parked on 15 November 2026 with the suspension above, and
  rejected by the owner on 23 November 2026. A subscription that declares its messages is a type of the library's
  own, where `AGENTS.md` keeps `Subscription` Effect's: it is already inspected by its key. Weighed on 15 November as
  a second `makeModel`, whose messages `subscriptions` would be given (reasoned): a subscription starts once for a
  key, where a view is drawn again from each model, so the messages could depend on the key alone; most carry a value
  from the world, so that model would hold functions again; and only a `Subscription` of the library's own could hold
  a channel to what it is given. What stands in its place, and was run: a test lists what each key sends, as its
  reader lists what the model holds, and gives it to `dispatchViolations` with every message `repeatable`
  ([`volume`](../examples/volume/volume.test.ts)). Since a subscription is made from its key alone, that list is a
  function of the type of the keys: a `switch` on it does not compile until it says what a new key sends
  ([`bounce`](../examples/bounce/bounce.test.ts)). Nothing checks that the list holds what the channel sends. No
  control drawn goes through a key in the examples, so it concerns only sources that exist whatever is drawn
  ([`registers.md`](records/registers.md)). _Reopen if_ a key's message that `update` rejects, or that does nothing,
  is found in an application, and such a test does not find it.
- **A value that an element reports, declared in `make` with the message made of it**: beside `inputs`, a function of
  the program from the value to a message, which a view writes into by its name as it writes into an input, and whose
  message `update` judges. Reasoned, 23 November 2026, beside a message that the model holds with one value left for
  the element to give, which the owner took to a spike (`declared-inputs.md`, "Weighed again"). It holds nothing by
  construction that the other form does not: `dispatch` takes any message that a view writes by hand, as it did when
  an entry of each input in the model was rejected (below). And it costs a third way for a view to send, with its
  name, its wrapping and its types in `make`, where the other form needs no export. _Reopen if_ the spike finds that a
  model cannot hold such a message as data, or that a view cannot fill it without building the rest of it.
- **A write, then a message, as the advised way for a fact that comes with a value**: the handler writes the value
  into an input, then sends a fixed message, and `update` reads the value from the state. The guide's "Inputs" advised
  it from 22 November 2026, and no release said it: it left on 23 November 2026, when the owner took a message that the
  model holds without its value, which the view fills ([`value-in-message.md`](records/value-in-message.md),
  "Decided"). Spiked beside it the same day (`spike/value-in-message`, never to be merged), on a feed: two steps for
  each fact in place of one, a place in the state for a value read once, a new model for a scroll end that means
  nothing, and a view that forgets the write compiles, so that `update` decides on a stale value. It still holds by
  what the guide promises, and stays the way for a message that is a class, which a spread cannot fill. _Reopen if_ a
  held message is found that a view cannot fill with what the element gives, copied as it is, where a write into an
  input can carry it.
- **Undo at every write of an input, as a recipe of the guide, an example, or a message on each write.** Spiked on 17
  November 2026, in `scratch/undo-by-subscription/undo.test.ts`, outside git and not kept, on a question of the owner:
  whether a parent can undo each write into an input it reads, since no `update` sees a write. It can, today. The
  state keeps a history and a position in it, a subscription keyed by the input's value ends at once with that value
  as a message of the parent's own, which `update` records, and `Undo` and `Redo` put a recorded value back in the
  input's place. Run through `run` on Bun:
  - **The recipe is correct under every order.** A pure search of its `update` over every arrival of the records, or
    none, to nine steps, and 150 runs with random pauses between the writes, found no history that breaks.
  - **How many writes are recorded is not promised.** Writes sent in one synchronous block are one entry, by the
    guide's own rules: a key that goes away drops what its subscription sent. Writes a microtask apart were one entry,
    and writes a task of the event loop apart were each recorded: that rests on when Effect's scheduler starts a
    subscription, a premise no test holds (`premises.md`).
  - **Two traps**, each a bug of `update` that a pure test finds: an undo or a redo changes the key too, so its own
    record must be ignored; and an undo that arrives before a write is recorded loses that write, unless it records
    the write first and then undoes it.
  - **An undo by step**, on a message of the parent's, needs no subscription and nothing of the scheduler.

  Not kept as a section of the guide: it would teach a recipe to remember, with two traps, which the owner asked an
  answer not to need (`registers.md`, "What the owner asks of an answer"), and describe a granularity that rests on
  scheduling. Not kept as an example, which users copy, for the same reasons. Nothing in the library: the one support
  that removes both traps is a message on each write, which an input with behaviour of its own would be (the `Field`
  entry below) and "What reaches `update`, declared as data" (above) would have reached. _Reopen if_ an application
  needs an undo at every write of a value its parent reads, and an undo by step is not enough.
- **An input as a `Field`, `{ value, revision }`, with `field`, `renewed` and a revision derived by value.**
  Implemented on 14 November 2026 and replaced, unreleased, on 15 November by the plain input of the ninth review
  ([`registers.md`](records/registers.md), "A plain input, and a frame that says what it has seen"). The rule of a
  revision is applied after each step of the program that holds the input, and a hierarchical composition splits that
  ownership: a child its parent starts again, a kept state brought back and a row whose id comes back gave the input a
  revision it had, and a late key was stored into the new instance, run in `src/input-swap.test.ts` of
  `worktree-agent-a02816c77ebec330c` (`4757546`). `renewed` was a recipe to remember for a slider whose bounds narrow,
  and the state stored differed from the state written. _Reopen if_ the numbering of a frame (`seen`) or the condition
  on elements and renderers it rests on fails where no revision would. Both went on 20 November 2026, with the frames,
  once a dispatch applied its message at once ([`synchronous-dispatch.md`](records/synchronous-dispatch.md)): the plain
  input stays, a view took `was` from the model it was drawn with, and the bridge to snabbdom drew a handler's message
  at once (R1 of the record). `was` went later the same day ([`write-without-was.md`](records/write-without-was.md)): a
  write carries its value alone, and the bridge draws in a microtask after each notice, so that no key is typed between
  a state and its draw. So the entry now reopens if a write of its value alone fails where a revision would not.
- **Whoever steps replaces what is below** (the seventh review) **and the channel of a replacement, declared** (the
  eighth). Spiked, 15 November 2026: `2d2e77b` on `worktree-agent-a144664c3ddf8f27a` and `45da546` on
  `worktree-agent-a04cfe354d300ce70`, never to be merged. The rule of a revision applied by whichever program steps to
  every input below it, through a channel from a child to its parent (`replacing`, with `all` in `each`, an input's
  place a lens, and a generation for what is left): they close the reset and the undo, but patch the split of
  ownership rather than remove it, need a recipe for what they leave, and widen what a parent's `make` does to a
  child's state. The owner judged the complexity of parents and children too much and asked for another way, which
  the ninth review gave. [`registers.md`](records/registers.md), "Whoever steps replaces what is below" and "The channel
  of a replacement, declared". _Reopen if_ the plain input is dropped and an input must again keep a history between two
  writes.
- **A parent that reads its children's inputs**, as an exception to "A parent never reads a child's state to decide"
  ("Structuring a program"), for a parent that totals or submits what was typed into its rows. Reasoned, 16 November
  2026, on a reader's check of the guide that wrote a stock-take: the rule admitted no way for the sheet to read the
  count typed into each item, since an input took one optic. It would be an exception to a rule the examples keep even
  where breaking it is cheap (`examples/list/list.ts`, "Every stopwatch is told, running or not"). The owner decided
  that the rule stands, and that a value the user writes, and the parent reads, is an input of the parent's, by id
  where there is one for each row. _Reopen if_ a value the parent must read cannot be an input of its own, by id or
  not.
- **A parent's `update` given its children's models**, for the same parent. Reasoned, 16 November 2026, with the
  entry above: it would be a third channel between a parent and its children, beside events and external messages,
  and a model with two readers, the view and the parent, which then decides on what is drawn. _Reopen if_ the same.
- **A write into a child's input that raises an event**, which the parent handles to learn what was typed. Reasoned,
  16 November 2026, with the entries above: the parent would keep a copy of the value, two truths of one input, and a
  function of the program for what the user types, which inputs replaced, would come back in the child's `update`.
  _Reopen if_ the same.

  The three entries above were weighed again on 22 November 2026, when the owner took `output`, a value that a child
  declares from its state and its parent reads ([`kept-children.md`](records/kept-children.md), "A value that a parent
  reads"; step 35 of `ROADMAP.md`). Each stays rejected. A parent is not given its child's state, so it reads no input
  of the child's; a model has one reader, the view; and a parent that reads keeps no copy. But a third channel between
  a parent and its children, which the second entry refused, is taken: it is `output`, which is no model. And their
  "Reopen if" is answered by it: a value that the parent must read, and that cannot be an input of its own, is one that
  the child declares. The owner then narrowed the decision of 16 November, on a session's advice, for step 36 of
  `ROADMAP.md`: a value that the user writes belongs to the program whose rules use it, the one that says what the text
  means, changes it or locks it. It is the parent's where the parent changes or locks it, as in the stock-take, and the
  child's where only the child's rules use it: the parent then reads what the child concludes from it, through
  `output`, and not the text ("Structuring a program", "A value that the user writes belongs to the program whose rules
  use it").
- **An input declared as a bare optic, and an input by id as a function of the id that gives one**
  (`inputs: { Name: at, Count: (id) => at }`, told apart by the `getResult` an optic's type declares), in place of
  `input(at)`. Implemented and committed on 16 November 2026 (`38b3ac6`, with `41d788d`), and replaced on the 17th,
  unreleased, by `input` and `inputById`, which take the places `child` and `childById` take. It needs no name, but it
  leaves an input one form of place where a child has two: a pair `{ get, set }` written as a bare literal is not
  typed, since the spike of children declared as literals (`scratch/children-literal/`, outside git, never to be
  merged) had every parameter annotated by hand and the children no longer inferred, so the pair needs a function to
  infer from; and a place that is the element of an array found by a predicate is real (`examples/list`, the stock-take,
  and an application whose pages live in a stack found by tag), where an optic alone needs a `byId` written with
  `Optic.makeOptional` and a `SchemaIssue`. With a function for each, children and inputs share one notion of place.
  _Reopen if_ a bare literal `{ get, set }` comes to be typed where it is declared, or an Effect optic to an element
  found by a predicate comes to be written as easily as `get` and `set`.
- **An exported `byId` optic**, to the element of an array that has an id, for inputs by id over rows kept in an array.
  Reasoned, 16 November 2026: a name over a composition of Effect's combinators (`Optic.makeOptional` and
  `Arr.findFirst`), which the rule of `AGENTS.md` ("A function earns its place") refuses; rows kept in a record need
  only Effect's `.at(id)`. Since `inputById` takes `get` and `set`, rows kept in an array need no optic at all. _Reopen
  if_ such an optic must do what Effect alone cannot.
- **A value changed as the library stores it** (`input({ at, normalize })`, or a `set` that stores another value than
  the one written), for upper case, a mask or a limit of length. Weighed on 18 November 2026, with the three entries
  below, on the owner's questions of how a typed value is normalized and whether the rule of a place can leave the
  optic; the owner asked to record them. A scratch probe, run on Bun, outside git and not kept: a program whose `set`
  upper-cases, with `edited` and `drawn` as a bridge calls them. After `a` is stored as `A`, the write of `ab` over
  `a`, sent before any frame, is rejected, since the place holds `A`; the frame of the first write is then taken, and
  replaces what the user typed. Reasoned from there, and not run: the rule would hold only if `written` and `drawn`
  compared values after the same function, so a bridge would need the program's function, which must be idempotent,
  and would write into the element between two keystrokes, with the caret to restore. The guide says instead where a
  value takes another form ("Inputs", "What is typed, in another form"): parsed where the program
  reads it, replaced on a message of the program, or formatted in the element before the write. _Reopen if_ a value
  must be normal in the state as it is typed, and neither a parse where it is read nor a mask in the element gives it.

  Reversed in part on 20 November 2026 ([`write-without-was.md`](records/write-without-was.md)): a write carries its
  value alone and the rule on `set` is dropped, so a `set` that stores another value than the one written is allowed.
  The probe's second write, sent before any frame, is now stored, and the bridge draws the stored value in its
  microtask. The guide lists it as the fourth way, with the caret described and not promised: it goes to the end after
  a key whose value `set` changes ("What is typed, in another form"). Whether `normalize` as an option of `input` earns
  a place is not reopened, since a `set` does it.

  Reversed on 22 November 2026 ([`stored-form.md`](records/stored-form.md)), for a reason this entry did not have: a
  `set` that stores another form cannot be told from a `set` that does more, so the rule of a `set` kept an exception
  that no check could hold. The form is a field of the input, `store`, a function of the value alone, which needs no
  law, and a `set` stores exactly what it is given. The probe of the first paragraph no longer applies, since a write
  carries its value alone.
- **A condition on an input's declaration** (`input({ at, when })`), to say in which states a write applies, in place
  of a `get` that returns `None`. Reasoned, 18 November 2026: it is that `get` under another name, an option for what a
  place already says. What it answered, a rule of the program written inside a `get`
  (`Opt.filter(sheetOf(state), isOpen)` in `examples/stocktake`), was the example's: with the counts a tagged union,
  `Open` or `Locked`, the place is an optic through the case `Open`, and the input, `update` and `makeModel` read the
  same case (the guide, "Inputs", "Inputs by id"). Tried on the example the same day: a `set` that
  writes into the locked counts does not compile, while a `get` that reads them does, and a test fails on it. _Reopen
  if_ a lock cannot be a case of the state.
- **Handles of the inputs in `makeModel`** (`inputs.Count(state, id)`, the value at the place or `None`, as
  `children.Row(state, id)` is a child's model), so that a model draws an editor only where a write has a place.
  Reasoned, with a second opinion, 20 November 2026: what `input` and `inputById` return already has the `get` of the
  place, and a model reads it when the input is declared beside `make`, so the handle is a second name over it ("A
  function earns its place", `AGENTS.md`). It is no counterpart of a child's handle either, which runs the child's
  `makeModel`, keeps its model by state object and dies on a child not there; and an input on a lens is read as
  `state.name`. Tried on `examples/stocktake` the same day: its model reads `counts.get(state, id)`, with no change of
  the API, and a test of `dispatchViolations` with the writes over the counts shown, as `held` and as `candidates`,
  fails when a count is drawn editable where it has no place, or read-only where it has one. Weighed and not proposed:
  a value of the library's own for an input in the model, its place and its value, which the view writes through
  without naming its route. It would make three rules of "What is left to you" hold by construction, at the cost of a
  type of the library's in every model, of `forwardTo` and of both bridges, as the offers and `Field` before it
  ("Offers as tokens, checked against `update`" above). That value was spiked later the same day, and rejected: the
  entry below. _Reopen if_ a program cannot name the `get` of its own place.
- **An entry of each input in the model, which a view writes through**: `make` gives `makeModel` a third parameter,
  `inputs`, whose `inputs.Name(state)` is an `Option` of an `Entry`, the value shown and, hidden, the input's name and
  id, and a view writes `dispatch(write(model.name, text))` where it builds a `Written` by hand. Spiked on 20 November
  2026, on the branch `claude/spike-input-in-model` (`17534ff`), never to be merged, as R4 of the plan of
  [`synchronous-dispatch.md`](records/synchronous-dispatch.md): the plan reopened the entry above, since no bridge
  settles an element any more. Run there: the form and the stock-take with both bridges, each check taken out by hand,
  and the declarations emitted. It works, on no new premise, and for a view that writes through its entries the rules
  of the guide on what a view writes hold by construction. Rejected by the owner the same day, on the advice of the
  session that briefed the spike:
  - **It buys little.** The types already refuse a write with a wrong name, a wrong type or no id. What the entry
    adds is `was` taken from the model, and an editor only where a write has a place. A wrong `was` is a write
    rejected in a test, and an editor with no place is `Rejected` in a test of `dispatchViolations`: the tests the
    examples already have find both.
  - **It costs** a type of the library's in every model with an input, with a hidden field that a `toEqual` prints; a
    model that can no longer be written as a literal; an `Option` to match for an input on a lens, which always
    focuses; a third parameter of `makeModel`; and a second weak cache, as `forwardTo`'s, looked up by `Hash` and
    `Equal` for each input in every `makeModel`, which runs in the event that sends the message.
  - **It closes neither a write built by hand**, since `Written` is a type a literal fits, **nor the route above the
    program**: a parent's view still chooses which child an entry is written into.

  So a view writes `{ _tag: 'Written', value }` by hand (with `was` too until 20 November 2026,
  [`write-without-was.md`](records/write-without-was.md)), over the value its model holds.
  [`input-in-the-model.md`](records/input-in-the-model.md). _Reopen if_ a view is shown to write over a value its
  model does not hold, or into another input, where the tests of its program pass.
- **A write that `update` sees and may reject**, so that what applies in a state is said in one place. Reasoned, 18
  November 2026: the element already shows what was written, so a write that `update` refused would leave the element
  unlike the state until a frame takes back what the user typed, which "Input is never a reason to reject"
  ("Structuring a program") rules out. It is the function of the program for what the user types, which inputs
  replaced, as in "A write into a child's input that raises an event" above. _Reopen if_ a program must refuse a
  write for a reason that no place of its state can say.
- **A lock derived from the model**: a write rejected when the model does not show the input's value. Reasoned, 18
  November 2026: the library would have to know which value of a model is an input's, a mark in the model, with the
  limits of identity that the third spike of [`declared-inputs.md`](records/declared-inputs.md) found (a copy is not
  recognised), and the run would check at run time what a view sends, as it checked the offers against `update`
  before they were removed ("Offers as tokens, checked against `update`" above). What would have said it without a
  mark, the declarations of "What reaches `update`, declared as data", was rejected since (above). _Reopen if_ the
  library comes to know which value of a model is an input's by another way than a mark.
- **A `set` free to change the state, promised as the code calls it**: the guide would say that the `set` of an input
  is called exactly on a write of another value that has a place, and may change any field. Reasoned, 22 November
  2026, on a report of an application's upgrade ([`application-report.md`](records/application-report.md), point 2),
  with a probe of when a `set` is called. Refused by the owner: such a `set` is an `update` under another name, which
  decides on a write where the guide says that there is nothing to decide. It cannot reject, nor ask for a command. No
  test of the model sees it. A write equal to the value held skips it, so what it does follows some writes and not
  others. And each such input would have a rule of its own, where the rule is the same for every input. It is the
  neighbour of "A write that `update` sees and may reject" above. The rule taken is of every place, a child's too: a
  `set` changes its place and nothing else. _Reopen if_ a program must decide on a write, and neither a message sent
  after the write nor a message that carries the value ([`declared-inputs.md`](records/declared-inputs.md), "Weighed
  again") can say it.
- **A place as an optic alone**, with the `get` and the `set` written by hand removed from `input` and `inputById`
  (and from `child` and `childById`, which have no place since the store, step 34 of `ROADMAP.md`), so that no `set`
  can change more than its place. Reasoned, 22 November 2026, on the owner's
  question of what a signature could hold by construction, with the declarations of `effect/Optic` 4.1.4 read. No
  signature of `set` holds the rule: a function that returns the state can change all of it. An optic composed of
  Effect's own (`key`, `tag`, `at`, `some`) keeps its place by construction, and `input({ at })` takes one already.
  But Effect has none for the element of an array that a predicate picks, the place of the inputs of the rows of the
  stock-take: a user would write `Optic.makeOptional` by hand, the same two functions with the same
  freedom, over `Result` and `SchemaIssue` where the library asks for an `Option`. The hole would move into a type of
  Effect's, and the examples of a list would be harder to write. What was taken in its place, after a spike
  ([`stored-form.md`](records/stored-form.md)), is the form of a value out of `set`, as `store`, and a check of a
  place's laws, `placeViolations`, step 37 of `ROADMAP.md`. _Reopen if_ Effect gives an optic for the element of an
  array that a predicate picks.
- **The form's place kept while it saves, with its writes `withheld`**, and a sentence of "Testing" that a place shown
  read-only on purpose is `withheld`. Reasoned, 22 November 2026, as the advice of the record
  ([`application-report.md`](records/application-report.md), point 3), which kept the first example of an input on a
  lens. Refused by the owner, for the lock by the shape of the state: the form would do what the "Don't" of its own
  page says, the sentence would be a rule that an example brings to be allowed, and a place that is kept holds only
  with a renderer that draws each state before the next event, where a lock by the shape holds with any. _Reopen if_
  a program must keep a place that its model shows read-only, for a reason that no shape of its state can say.
- **The wrapping of a child's message as a public function** (`{ _tag, id?, message }`, for `dispatchTo` and a
  test's reader to share), **and as an internal one** for the two places of `src/` that build it. Reasoned, with a
  scratch probe of `tsc` against the `list` and `pages` examples, outside the repository and deleted, 15 November
  2026. The public function adds a name over a shape the library documents as data, as `Step` is, and covers one of
  the three shapes a parent's test rebuilds (a child's command and a lifted key stay literals). The probe confirmed
  that the compiler rejects a wrong child name, a missing or mistyped id and another child's message in a literal
  typed as the parent's `Message`, and found the one check a function would add: a stray `id` on a child that is
  alone compiles when the literal is not fresh (a `const` assigned later, or the result of a `map`). Inferring the
  parent's `Message` from the parent program was found easy, so that was no reason against. The internal function
  would share only the spread: `make` and `dispatchTo` decide differently whether a child is by id, and it would
  add an import between `compose.ts` and `dispatch.ts`, which have none. The owner decided against both.
  [`boundary.md`](records/boundary.md), "A question". Source: the session that removed it from `ROADMAP.md`, with a
  review by Fable 5.2. _Reopen if_ a tool must lift a child's message without a type to lean on (as the third spike of
  [`declared-inputs.md`](records/declared-inputs.md) did), or the stray `id` is found in an application's tests.

- **Following a string in a child's wrapping, in the default description of a message.** Reasoned, 15 November
  2026, on the same review: `describeByTag` describes `{ _tag: 'Counter', message: 'Increment' }` as `Counter`. It is
  a function of the value alone, used where no program is at hand (`applyAll`, the `on` of a `ProgramDefect`), and
  it meets a leaf program's own values, which nothing of the library checks: another name for the field collides the
  same way, a rule of the types reaches only a composition's own tags, and a key that is a symbol, the one shape it
  could trust, would be imported by every parent's test and view and lost in a session saved as JSON. Following the
  string would name a program's own text, `{ _tag: 'ToastShown', message: '<text>' }`, where only tags are named.
  The guide says what it does. _Reopen if_ a wrapping the describer can tell from a
  program's own value comes for another reason.
- **`forwardTo` dual**, then named `dispatchTo`: `pipe(dispatch, forwardTo('Home'), forwardTo('Products'))` for a
  grandchild's dispatch. Spiked, 16 November 2026, in the working tree and discarded uncommitted, after a survey of the
  exports: it is the only one besides `andThen` and `forEach` that takes and gives the same type of the library's, while
  `edited`, `drawn`, `applyAll` and `dispatchViolations` give another shape, and the rest take one argument or a
  program. With `dual` told the forms apart by a predicate (`typeof` of the first argument, since the variadic id makes
  the arity ambiguous) and the id checked in the result as the name is, the form in a `pipe` typed right: nested
  children, ids that are numbers or tuples, and a missing or mistyped id, a name that is no child's and a misspelled one
  refused. But the overloads made the errors of the form written today worse, in either order, since `tsc` reports the
  last one: a missing id went from `Expected 3 arguments, but got 2` to a `Dispatch` not assignable to `string`, a
  mistyped one from `string` not assignable to `number` to `No overload matches this call`; and in a `pipe` a wrong id
  is reported as a call of something not callable, not on the id. The gain is one nesting, which the guide says a view
  usually writes in two steps. _Reopen if_ `dual`, or TypeScript, comes to report a failed call of an overloaded
  function against the overload its arguments meant.
- **Other names for `forwardTo`**, weighed when `dispatchTo` was renamed, 16 November 2026, before 0.8.0 was released.
  Reasoned, with a review by Fable 5.2. `dispatchTo(dispatch, 'Clock')` read as a call that sends, with `dispatch` the
  object of its "to", where it makes a dispatch and its target is the name; `forwardTo` reads as it works, forwarding to
  the dispatch it is given, as Elm 0.16's `Signal.forwardTo address Tag` did, in the same order. Refused: `dispatchOf`
  and `dispatchFor`, nouns that still read "dispatch" twice in each call; `childDispatch`, wrong for an input, which is
  no child; `tagged` and `wrapAs`, names of the mechanism, the first a namesake of Effect's `Data.tagged`; `child`,
  `input` and `at`, taken. The rename was made inside 0.8.0, already breaking for the same views, and would not have
  been worth a breaking release of its own. _Reopen if_ a reader of the guide finds `forwardTo` misleading where
  `dispatchTo` was not.
- **Other names for `childById` and `inputById`**, weighed when inputs by id were declared with a function and `each`
  was renamed, 17 November 2026, before 0.8.0 was released. Reasoned, the owner deciding. The guide, `AGENTS.md` and
  `invariants.md` already said "children by id" and "inputs by id", where `each` was only the function's name; the
  message carries an `id`, and its dispatch is `forwardTo(dispatch, name, id)`, which the suffix names; and the four
  names make a grid, the noun saying what and the suffix how. Refused: `each` with `eachInput`, an irregular pair that
  leaves "each what?"; `eachChild` with `eachInput`, regular, but keeping the word that reads as `forEach` over steps,
  used beside it in `forEach({ state }, rows, ({ id }) => children.Row.external(id, …))`, where `each` iterates nothing,
  and that the guide does not use; and one `each` for both, told apart by the number of its arguments, two signatures
  that overlap, not spiked, by the reason that refused `forwardTo` dual. _Reopen if_ a reader of the guide finds the
  suffix `ById` misleading.

The six entries below were weighed on 16 November 2026, for the doc comments of the API, which the pilot of `bb7ee37`
brought to quoting the guide (`AGENTS.md`, "A doc comment of the API promises only by quoting the guide"); the owner
decided each, with a second opinion (Fable) on the last two.

- **A link from a doc comment to the page of the site that holds its rule.** Spiked in the pilot, and dropped before
  its commit: the site is built again whole by each tag (`.github/workflows/docs.yml`) and keeps no older release, so
  the hover of a version installed would show, after the next release, the promises of that one. `tools/comments.ts`
  now fails on such a link. _Reopen if_ the site keeps each release at an address of its own.
- **A site that keeps each release** (`/v0.8.0/…`, kept on a branch the deploy adds to). Reasoned: it would hold, but
  on infrastructure (the layout of the deploy, a branch to keep, a permission to push), which the owner declined for
  a rule of the documentation. _Reopen if_ the site is versioned for a reason of its own.
- **Links to the guide on GitHub, at the tag of the release.** Reasoned: exact by construction, but it rests on
  hosting outside the package too, and GitHub shows the TypeDoc syntax of the guide as it is written (13 uses of
  `{@includeCode}` then, 6 of them in "Writing a bridge"). _Reopen if_ the guide no longer needs TypeDoc to read.
- **The guide in the package, linked from the comments by a relative path.** Reasoned: the same `{@includeCode}`,
  which a step of the pack would have to expand, and the hover never shows the rule itself. Whether an editor follows a
  relative link in a hover was not checked. _Reopen if_ both are checked, and a hover that only names a rule is
  enough.
- **The quotes written only into what the build makes**, not committed into `src/`. Reasoned. Into `dist/*.d.ts`
  alone, they would miss the `src/` the package ships for the `bun` condition, and shift the lines the declaration
  maps point to; the form that holds fills a copy of `src/` before `tsc` and ships that copy, which changes how the
  package is built and laid out, for text that a `--check` already keeps in step. _Reopen if_ the copy in `src/`
  costs more than that, in reviews or in conflicts.
- **Doc comments for the package's users apart from those of the implementation.** Spiked on projects of scratch,
  not kept, with the language service of TypeScript 6 (the hover in a file that imports the entry) and TypeDoc
  0.28.20:
  - a comment on a re-export, `export { run } from './run.ts'` or on its name, is ignored: the hover shows the
    declaration's;
  - a function declared again in the index, whose body calls the internal one, works for the hover and the site, but
    writes each signature twice, some of the most delicate (`run`, `program`, the dual `andThen` and `forEach`);
  - a type declared again as an alias loses its fields on the site, and its fields keep the internal comments; an
    interface that extends it keeps them too; a class cannot be declared again without losing `instanceof`;
  - `export * as`, an overload with the comment on its signature, and `{@inheritDoc}` separate nothing;
  - `@privateRemarks` is hidden by TypeDoc but shown in the hover of whoever installs the package, and two doc
    comments in a row reach the declarations both, though the hover shows the last: `tools/comments.ts` fails on each.

  Instead, the doc comment of an export is for its users, and a note on how it is implemented is a `//` comment or
  that of an internal declaration (`AGENTS.md`, "Code"). _Reopen if_ TypeScript and TypeDoc come to hide alike a part
  of a doc comment from the users of a package.

The two entries below were tried on 16 and 17 November 2026 and dropped on 17 November, the owner deciding: the doc
comments are written by hand since, in plain English, and name the sections of the guide they follow (`AGENTS.md`,
"A doc comment of the API follows the guide, in its own words").

- **Doc comments that quote the guide, word for word**, copied after `@remarks` by a script (`tools/quotes.ts`, now
  `tools/comments.ts`, which checks the comments and copies nothing). Spiked from the pilot of `bb7ee37`, and kept a
  day. Each promise was written once, and the hover of a version installed showed that version's. But the guide is
  written to be read in order, and a section copied alone is not a hover: it keeps the guide's reasons and examples,
  its lists of cases, its pointers to sections the comment does not hold ("see 'two limits'") and to the examples,
  and two sections that say one thing twice. `drawn`'s comment held 42 lines, 26 of them copied, before the entry
  below made it 103. _Reopen if_ a hover can show a short form of a section that the guide itself writes, and keep it
  in step with the version installed.
- **Every line of the guide quoted by a doc comment, or set aside with a reason** (`tools/unquoted.ts`), so that a
  promise added to the guide reached the declarations. Spiked, commits `0e1738d` to `ca9b91b`, never pushed. Sorted
  page by page, it made quoting the easy path, since setting aside needs a reason: 481 lines came into the comments
  of `src/`, and `run`'s grew from 57 lines to 136. _Reopen if_ the comments quote the guide again, and only with a
  bound on how long a comment may grow.
- **The `init` of a parent without flags called by `start`, not by `make`**, so that a defect in it is recorded as
  the program starts, as one in an `init` that takes flags is. Weighed on 21 November 2026 for api-3 of
  `docs/records/library-review.md`, by a second opinion (Fable) that probed each form, the owner deciding.
  `program<…>()` leaves no trace of the flags at run time, so `make` cannot tell what that `init` returns without
  calling it. Kept as a function, the made program's `init` is no step where its type says one, and a grandparent
  (`hasFlags` in `compose.ts`) would take it for a function of flags. Made always a function on `Program`, it breaks
  the API: `FlagsOf` reads `unknown` from a thunk, and every read of `program.init.state` changes. Made an accessor, it
  throws where `{ ...program, init: { state } }` spreads it, and a grandparent's handles need accessors too. Such an
  `init` has no input, so it throws on every import or never: no bug of it outlives the first test. The guide says
  instead that `make` calls it ("Composition", "Precisely"), and the promise of "Running" is of an `init` that takes
  flags. Since the library keeps a parent's children (22 November 2026,
  [`kept-children.md`](records/kept-children.md)), the config's `init` is one form, a step or a function of the flags,
  with children or without, and `make` calls no `init` of the parent's. What `make` calls is the `init` of each child
  that the step lists, since the made program's `init` is a step that holds their states: so the entry stands for the
  children's starts, by the same three forms (reasoned, 23 November 2026, and not run again). The guide says that
  `make` starts them ("Composition", "Precisely"). _Reopen if_ a parent's `init` takes an input that `start` gives.
- **A subscription made from its key alone, in other forms.** Weighed on 23 November 2026 beside the form the owner
  took, the owner deciding ([`subscription-from-key.md`](records/subscription-from-key.md), "For the owner").
  - **The keys listed in a `HashSet`.** Spiked, on `spike/subscription-from-key` at `40d9400`, with every test of the
    library in that form. A parent of a thousand children lists and reconciles its keys in 600 µs for each change of
    state, against 191 µs with an array and 328 µs on `main`: Effect's `HashSet` has no transient form, as
    `HashMap.mutate` is. And `HashSet.make("ticks")` is a `HashSet<string>`, so a string key needs `as const`.
  - **The key known to `make` alone**, and not among a program's types, as `K` was. Reasoned: a program's type would
    not change when it gains a subscription, and a parent's keys, `KeyOf` and the check of `listen` against every key
    would be lost.
  - **`hear` and `hearNext` taking a key of the program's type.** Run as a probe and taken back: 14 errors in
    `rehearse.test.ts`, eleven of them a `Rehearsal<…>` written by hand, which would name the key. A wrong key already
    fails the test, so the check would only move an error.
  - **A defect that names its key by its tags**, as it names a message. Reasoned: left as the entry on `describeKey`
    says, whose "Reopen if" this form brings nearer, since a key holds all that its subscription needs. The guide says
    that what must stay private goes in a service.
  - **The name `runSubscription`**, as `runCommand`. Reasoned: nothing is run by it, and the guide's word is that a
    program listens.

  _Reopen if_ a key listed twice is found to hide a mistake that a set would have refused, or a test that gives
  `hear` a wrong key passes.

## The bridges

- **Bridges that support what a renderer does beyond drawing a frame.** Decided by the owner on 16 November 2026,
  after a review of the bridges' premises found four gaps, each held by a `test.failing`: a reset the user begins
  was missed, since its microtasks run before the form resets its elements; a root in a shadow tree never heard its
  forms' resets, which are not composed; React showed the old text in an input that Suspense showed again outside a
  frame; and a text field that strips the line breaks of what the bridge writes showed a value the bridge held as
  shown. Each had a fix, in a later task, on the root node of each input, on React's reattached refs, or by reading
  back what the element took, and each fix would have brought more premises on the DOM and the renderer to check and
  review. The examples' bridges were made minimal instead: they draw each frame whole and at once, run `dispatch` in
  plain handlers (a click, a press, a native text `<input>`'s `input` event), and settle each text input with `drawn`
  after the frame, and nothing more: minimal examples of connecting a native element to the library. A value the
  element changes by itself is not handled, and whether a bridge that starts from them could is left open; another
  native widget that meets the condition of `edited` and `drawn` would be connected by hand with them, or replaced by
  one the program draws (the snabbdom bridge's `slides`, a range, went, and `volume` draws both its sliders); a form's
  reset, a shadow tree, and in React a component with state or effects, Suspense, `memo`, portals and a run inside
  another's root are left to the bridge that needs them, as the guide's "Writing a bridge" and the bridges' comments
  say. The React bridge finds the inputs to settle in its root's own elements, without the context it had: a bridge for
  a portal, or for a run inside another's root, would need to know the run each input belongs to again. Why: such
  features cost much review time for what is outside the library's concern, which is the program and its rule for an
  input's element, not each renderer's features; a bridge is an example to start from, and an application that needs
  more writes its own. The library (`edited`, `drawn`,
  inputs) did not change. _Reopen if_ the bridges become packages of their own (`records/adoption.md`), whose users
  would expect a renderer's features to work. Reopened for React on 20 November 2026: the bridge to React is hosted by
  React (`docs/records/hosted-react.md`), and its inputs, each settled by itself and found by its run's context, work
  with a component's state, Suspense, `memo`, a portal and a shadow tree. What this entry says of React above is of the
  bridge it replaced; a form's reset and a value the element changes by itself are still left out, by both bridges.
  The bridges became entries of the package the same day (`@fgaudo/effect-tea/snabbdom`, `/snabbdom/testing`,
  `/react`), with the contract as narrow as it was ([`adoption.md`](records/adoption.md)): so this entry stands, and
  _reopens_ when a user of an entry needs a feature of its renderer that it leaves out. Since a dispatch applies its
  message at once, the same day ([`synchronous-dispatch.md`](records/synchronous-dispatch.md), B1 and B3), both
  bridges draw native controlled elements and settle no input: `edited`, `drawn` and the rule of an element are gone,
  a root in a shadow tree works in both, and what they leave out is a form's reset, a value written past React's
  setter, and a value the element changes by itself, which it shows until the next write. The entry stands, as above.
- **A frame of the very same model taken at once, without waiting for the next animation frame.** Weighed in the
  review of the architecture of 20 November 2026, reasoned; rejected by the owner the same day. In both bridges a frame
  whose model is the one drawn last only settles the inputs (the snabbdom bridge patches nothing, the React bridge's
  `Frames` does not render again), and the renderer still waits for the next animation frame before it takes another.
  Taking such a frame at once would end that wait, but a bridge would then take more than one frame per screen
  refresh, and would settle its inputs once for each key of a burst. What it would save: a rejected key stays on
  screen for one refresh at most. _Reopen if_ a case shows that refresh to matter to a user, or settling the inputs
  becomes cheap enough to do on each frame. Superseded the same day by a dispatch that applies its message at once
  ([`synchronous-dispatch.md`](records/synchronous-dispatch.md), R1): there are no frames and no inputs to settle. The
  bridge to snabbdom draws a message its view sends at once, before the handler returns, a model that is the very one
  drawn last included, whose controlled elements are only given their props back; a notice from a command or a
  subscription is still drawn at the next animation frame, at most once for each refresh. The bridge to React renders
  as React schedules it. Superseded again by [`write-without-was.md`](records/write-without-was.md), on the 20th: a
  write carries its value alone, so nothing typed between a notice and its draw is rejected, and the animation frame
  of the bridge to snabbdom goes. It draws in a microtask after each notice, as one draw for a task.
- **A view of the library's own, as data over snabbdom.** Weighed with the owner on 20 November 2026, reasoned
  ([`adoption.md`](records/adoption.md), "A wider form"), and rejected by the owner on 23 November 2026, on the advice
  of the review of the architecture ([`architecture-review.md`](records/architecture-review.md), "Smaller points"). A
  node would hold its message, not a function; a child's view would be lifted by a node that wraps its messages, so
  that a view takes no dispatch; and an input's node would name its input. Why: what it was for is done another way. A
  dispatch applies its message at once, so no bridge settles an input
  ([`synchronous-dispatch.md`](records/synchronous-dispatch.md), R3 and B6); a view writes the element's value alone,
  and builds no write by hand; and `messagesSentBy` finds every message of a snabbdom view without a DOM, given what an
  element and its event report. What is left is a view that takes no dispatch, so that `forwardTo` and its cache go:
  for that, a second product to keep, with the DOM's own cases, which knows a renderer, beside the generic library,
  and a second vocabulary of views for a user to learn. _Reopen if_ a view shows a message that `messagesSentBy` cannot
  find, or a dispatch that must be the same function in every draw proves a cost to users that `forwardTo` does not
  answer.

## The checks

- **A framework of mutation testing (StrykerJS) in place of `tools/mutations/`.** Reasoned, 15 November 2026, when the
  run grew slow. Stryker generates mutants by syntactic operators and scores how many the suite kills; the list in
  `tools/mutations/mutations.ts` takes out each check an invariant rests on, names the tests that must fail under it,
  and the runner refuses a killer that ran more or fewer times than once, or fails only beside its file. A score is no
  such promise, the mutants equivalent in code over Effect would each be read by hand, and Stryker has no runner for
  `bun:test`: its command runner would run the whole suite for each mutant. The run was made parallel instead (162 s to
  44 s on 24 processors). _Reopen if_ the list is to be judged for what it misses, beside the checks it names.
- **Windows of absence awaited under the scheduler of the tests**, with `idle` (`test/scheduled.test_scheduler.ts`) in
  place of a sleep, in the tests that check that nothing happens. Reasoned, 16 November 2026, on the item of
  `ROADMAP.md`. `idle` is quiescence, and serves the search already (`interleaving.test.ts`), but no test of a check
  runs under that scheduler ("one thunk" in `invariants.md`, and `single-owner.md`): what it rests on of Effect is read
  in `runLoop`'s source and is the tests' alone, so killers under it would rest on that reading and could break on an
  upgrade of Effect. The two windows that have a witness were awaited instead, the others are the exception that
  `AGENTS.md` writes down ("A test never rests on the clock"), and the runner of the mutations runs a killer that
  passed again alone before it reports a survivor. Weighed with a second opinion (Fable), the owner deciding. _Reopen
  if_ a window of absence turns out to let a mutant survive on a run alone, or what the scheduler rests on becomes a
  premise with a test of its own.
- **The guide tied to the inference matrix**: each item of "What does not compile", in "Anatomy of a program" and
  "Composition", naming a `Violation` of `tools/inference/generate.ts`, which a tool checks. Reasoned, 23 November 2026,
  on step 16 of `ROADMAP.md`, with a second opinion (Fable) that ran 40 mutations of the types on a copy. It would catch
  only an item added without a name, the limit a second opinion of 21 November had found for the `guarantees` of the
  mutations ([`promises-and-tests.md`](records/promises-and-tests.md)). About 6 of the 13 items have no `Violation` (a
  state without fields, a key clash, an input named as a child, an own command or subscription that answers a child,
  the output of a child that declares none, a child's flags); the two lists are not all the refusals the guide states,
  which four more pages say "does not compile" of; and the CI would check a name against a matrix it never runs. The
  same tie is kept by the mutations of the types, the step that the owner took the same day: each names the item it
  holds, and `bun run comments` checks the name, against a check that fails in the tests the CI typechecks. _Reopen
  if_ the matrix runs in the CI, or the guide gathers every refusal in one list.

## Parked, not rejected

What is deferred or suspended is not rejected: it is kept here, with its document and what would reopen it, and is
out of [`ROADMAP.md`](../ROADMAP.md), which lists only what is to be done or decided now. An item reopened goes back
there; one decided against becomes an entry above.

- **Running only the mutations a diff touches** (`--changed`: those whose file, or a file of whose killers, changed):
  deferred by the owner on 15 November 2026, for the parallel run. A change elsewhere can make a check redundant, and
  the mutation of it survive, which such a selection does not run; and the files of the engine hold most of the list.
  _Reopen if_ the parallel run grows slow again; the whole run stays before a release.

- **Frames a bridge skips by the equality of models** (`registers.md`, "To explore"): with no function in a model,
  the models of two equal states are `Equal`, and a bridge could skip the drawing, as `thunk` and `memo` do by
  reference. Parked unmeasured on 15 November 2026, and measured on 16 and 17 November 2026 by
  `scratch/bench-rows/rows.ts`, outside git and not kept: one keystroke into a list of N rows that are the parent's own
  data, each with an input by id, from the input event to the end of the frame, through `run` and the snabbdom bridge
  as shipped, in happy-dom, on Bun 1.4.4 on Windows, a row of six cells, three runs that agreed. At 100, 1000 and 5000
  rows, the median per keystroke was 0.20, 1.1 and 10.4 ms with every row drawn again, 0.15, 0.5 and 4.8 ms with each
  row's model kept by the application in a `WeakMap` and drawn through `thunk` by reference, 0.30, 2.3 and 17.2 ms with
  a skip by `Equal.equals` of the row's model, and 0.19, 1.2 and 10.7 ms with the rows as children by id, whose models
  the library keeps, through `thunk`. So the skip by `Equal` cost about twice the drawing it would save, drawing every
  row again costs about 1 ms at a thousand rows, and children by id were no faster than rows of the parent's data. A
  helper of the library that keeps a row's model by identity was weighed with it and not added: a name over a
  `WeakMap`, which halves a millisecond. The measure has limits: happy-dom lays out and paints nothing, the row is
  small, and it was not run in a browser. It stays parked: the evidence is of happy-dom alone, and no decision was
  taken on it. _Reopen if_ a browser, or a heavier row, shows the drawing of an unchanged model to cost more than its
  comparison by `Equal`. Since 20 November 2026 there are no frames
  ([`synchronous-dispatch.md`](records/synchronous-dispatch.md)): a renderer draws the model of the current state, and
  the bridge to snabbdom skips a model that is the very one it drew last, by identity, as it skipped a frame. The
  measure above is of the bridge of frames, and was not run again.
