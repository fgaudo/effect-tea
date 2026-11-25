# What the invariants rest on

An invariant of [`invariants.md`](invariants.md) holds only while what it rests on does: the purity of the program's
code, values never mutated, and what Effect and the JavaScript engine do. What the program must do is the guide's
("What is left to you"). What Effect, the JavaScript engine or a bridge's renderer do without promising it is listed
here, each with its own test, by [the rule](#the-rule) below: what a stable API documents is no premise.

## The premises

Each premise names what rests on it, what its dependency documents of it, and its test, in `test/premises.test.ts`
unless it says otherwise, named after it, with what it fails with.

The testing tools take no premise of a fork of their own: `drive` runs the run; `rehearse` runs the engine through the
handle the run makes (`partsOf` in `run.ts`), and `simulate` builds it (`Engine.build`): both run its thunk, its
jobs, its fibers and its end. So each rests on what the engine rests on, and on what `testing/stage.ts` adds, named
below by `answering`. `simulate` runs no subscription, so the premises of a subscription's channel (`Channel.toPull`,
one channel run afresh, `Stream.callback`) are none of its own.

- **`HashMap` calls a key's `Equal` and `Hash` only within the call it is given the key in**, synchronously, never
  later: so `reconcile` compares keys all inside `'subscriptions'`, in the thunk that makes a state, in the run and in
  the tools. `FiberMap` compares its keys in a fiber's observer as well, which is why the run keeps its fibers by their
  start. Both are read only in the source. The second test, "the watch of that test sees a FiberMap call a key's Equal
  after the call, in a fiber's observer", is what the first fails with. Asked in Effect-TS/effect#10877.
- **A fiber that waits on a `Deferred` runs on the stack of whoever completes it, until it waits again**, a fiber or
  plain code. No guarantee rests on it, only killers of mutations: those of "the end of the run may begin inside a
  step" and "drive wakes its waits inside the step", which tell a wake inside the step only where it is resumed there,
  and those of `rehearse` refusing a command's answer and a subscription's message once it has ended. Should it fall,
  `bun run mutations` reports those mutations as survivors, and the library stays correct. Read in the source
  (`Deferred.doneUnsafe` resumes each waiter on the caller's stack, `internal/effect.ts`). Its test fails with the
  `Deferred` completed by a fiber of its own.
- **Code that a fiber runs on the stack of the fiber that forks it sees the forked fiber as its own**, through
  `Effect.withFiber`, `Fiber.getCurrent` and `Effect.fiber` alike, from its first step on; and no stable API gives a
  fiber the one that forked it. So the root of a fiber the run forks (`rootedIn`) knows that an unmarked interruption
  is the program's, never one of the fiber of effects or of whoever runs the program; and `answering` in
  `testing/stage.ts` reads the fiber of a command in its first step, which `FiberSet.run` runs on the stack of the
  fiber of effects. Agreed by the owner on 19 November 2026. That `Fiber.getCurrent` gives the fiber that runs is
  documented; that it is the forked one on its forker's stack is read in the source. Its tests, for
  `Effect.forkChild` with `startImmediately`, `FiberSet.run` and `FiberMap.run`, fail where it sees the forker.
- **What the cleanup of `Effect.onExit` fails with comes after the cause of the effect**: so each fiber of the engine,
  in the run and in the tools, records what it dies of in order, interrupted or not, merging no causes. That the
  cleanup runs however the effect ends, and that the causes are merged, is documented; their order is read only in the
  source. Its tests are of an effect that dies and of one that is interrupted.
- **`Scope.close` dies with every defect its finalizers die of, none merged by `Equal`**, those of the scopes forked
  from it included: so `scopedIn` records each defect of a release as a defect of its site. `Effect.scoped` is no such
  close: it joins with `Cause.combine`, which keeps one of two reasons equal by `Equal` (documented). The JSDoc of
  `Scope.close` says how the finalizers run, not what the close dies of, which is read in the source
  (`scopeCloseFinalizers`, `exitAsVoidAll`). Its tests are of two finalizers closed with a success and with a defect,
  and of one in a scope forked from it.
- **A fiber that fails as it is interrupted keeps its own reasons and gets those it received added, and
  `Effect.interruptible`, entered by an interrupted fiber where it is uninterruptible, fails with exactly those it
  received**: so `diesIn` tells a self-interruption from the run's interruption that meets it. That a pending
  interruption takes effect as the fiber enters `Effect.interruptible` is documented; which reasons it fails with is
  read in the source (`exitFailCause`, `causeAddInterrupts`). Its test enters `Effect.interruptible` where it is
  uninterruptible.
- **Every fiber of a run asks the `Scheduler` it is given before each step, and every task it makes goes to that
  scheduler's dispatcher, or resumes inline where the scheduler of the tests makes it yield first**: so
  `test/scheduled.test_scheduler.ts` decides where each fiber yields and which runs next, and the search and the
  scheduler that `bridges/bridge.test_suite.ts` holds rest on it. Read in the source (`runLoop`), with four details of
  the loop that the scheduler reads: a fiber asks first at a `currentOpCount` of 1 in each run of its loop; one told to
  yield schedules its resumption as the very next task, which asks nothing at its first step; one whose run ends with
  children runs its loop again in the same task and interrupts them there; and one that begins on the stack of another
  gives it back as it yields, in the same task. Its tests are a file of their own, `test/effect-scheduler.test.ts`,
  named after each. No killer of a mutation rests on it: a scheduler gone wrong costs a false alarm, or a missed one.
- **Effect calls each `Logger` synchronously, in the fiber that logs**: so what it throws is a defect of that fiber,
  which `diesIn` wraps where the program logs, as the guide's "Running" says. Read only in the source. Its test fails
  with `Logger.batched`, by an error of the logger. Asked in Effect-TS/effect#10877.
- **An external span keeps no event of the logs written under it**: so no span lives as long as the run
  (`withExternalSpan`). That a log is an event of the current span, and that a span opened under an external one has it
  as its parent, is documented; that an external span keeps none is not. Its test fails with a span of Effect's own as
  the parent. Asked in Effect-TS/effect#10877.
- **`Channel.toPull` keeps what a channel adds to the scope it is given, and releases none of it as the pull fails,
  while a release the channel wraps around itself (`Channel.onExit`, `Channel.acquireUseRelease`, and every operator
  that makes a scope of its own) runs as its pull fails, before the failure leaves it**. The first lets
  `runSubscription` leave a channel's releases to the scope of `scopedIn`, once its defect is recorded, so that no
  message applies meanwhile. The second makes a release the channel wraps its own, as `Effect.ensuring` is a command's.
  That it takes the scope it is run in is documented; what a failing pull releases is read in the source
  (`fromTransformBracket`). Its tests fail with `Channel.runForEach`, which closes a scope of its own first, and with a
  channel that adds its release to the scope it is given. Asked in Effect-TS/effect#10877.
- **One channel runs afresh each time it is run, one run after another or several at once**: so a `listen` that gives
  the same value for every start, as `listen: () => ticks` in the guide and the examples, starts it anew each time its
  key comes back. The library's code makes no channel that runs twice: the form the guide gives rests on it. Taken in
  step 57 over asking every `listen` for a new channel ([`rejected.md`](rejected.md)). The JSDoc does not say whether a
  value runs more than once; that each run makes its state anew is read in the source (`toTransform`). Its tests, of
  `Channel.fromIterator` with `Channel.concatWith`, `Channel.forever` and `Stream.toChannel` under `Channel.unwrap`,
  fail with an iterator made once for all runs. Not asked yet (`ROADMAP.md`, step 47).
- **A collection reclaims what nobody holds, and a `FinalizationRegistry` then calls back for each target it
  reclaimed**: so the cache of `forwardTo` forgets the ids nobody shows (`forgotten` in `dispatch.ts`), and a child's
  model is let go. ECMAScript requires neither. Its test, on Bun and on Node, fails with a callback that never runs.
- **A `Queue` keeps nothing of a value taken from it**: so the queue of the jobs, which lives as long as the run, lets
  go of the jobs done. The JSDoc says what is taken, not what is kept. Agreed by the owner on 21 November 2026. Its
  test, on Bun and on Node, fails with a `MutableList.take` that keeps what it takes.
- **Effect keeps nothing of a fiber that has ended, nor of what its scope released**: so a command or a subscription
  that ended leaves nothing in a run that goes on, once its `FiberSet` or `FiberMap` has removed it, as their JSDoc
  says. Agreed by the owner on 21 November 2026. Its test, on Bun and on Node, fails with a fiber kept as it is made.
- **`Stream.callback` gives its callback the scope the stream runs in**: for a subscription, the scope of `scopedIn`,
  which closes once the subscription ends, however it ends. With the premise of `Channel.toPull`, a release the
  callback acquires stops the source as the subscription ends: the guide's "A source of callbacks as a subscription"
  and the examples `volume` and `bounce` rest on it. Under a pull, that scope is not one of the callback's own. The
  JSDoc shows the `Scope` only in its type; the example in `ai-docs` (`03_stream/10_creating-streams.ts`) removes its
  listener "when the stream is finished", which holds under a run function and not under a pull. Agreed by the owner
  on 22 and 23 November 2026. Its tests, a pull that ends by the end of its queue and one whose fiber is interrupted,
  fail with a release added to a scope of the test's. Asked in Effect-TS/effect#10877.
- **snabbdom reuses an `<input>` with no key in the same place**: so a controlled element of the bridge to snabbdom
  keeps its focus, caret and selection while the program changes its value. snabbdom's README describes the reuse of
  keyed elements only. Its test, in `bridges/snabbdom.test.ts`, fails with a key of its own for the second input.
- **snabbdom calls a module's `update` hook on every element `h` draws again, one `h` is given no data for
  included**: so the bridge's module of the controlled elements (`controlledModule`) forgets an element drawn without a
  `value` or a `checked`. snabbdom skips the hooks of a vnode whose `data` is `undefined`, and `h` gives every vnode
  data: both are read in its source. Its test, in `bridges/snabbdom.test.ts`, fails with a vnode made with no data.
- **A controlled input keeps what is typed, its caret and its selection when a store read with `useSyncExternalStore`
  is updated during its `onChange`**: so the bridge to React draws a text field as React's documentation draws a
  controlled one, from the run's model. Agreed by the owner on 20 November 2026. react.dev states it of a state
  variable, not of a store. Its test, in `bridges/react.test.ts`, fails with the store updated a microtask later.
- **React renders a store read with `useSyncExternalStore`, updated outside its events, in a microtask**, before the
  browser's next task: so the bridge to React draws the state that an answer or a subscription made before the next
  event, as "Writing a bridge" says (`invariants.md`, "What a screen shows of a controlled element is the bridges'").
  Agreed by the owner on 21 November 2026. react.dev says that React renders again, not when. Its test, in
  `bridges/react.test.ts`, fails with the listeners told a task later.
- **StrictMode runs an effect's cleanup in the task of the effect, before any microtask**: so `Host` runs one program
  under StrictMode (`invariants.md`, "`Host` starts one run under StrictMode"); should React run it later, `Host` would
  start the program anew, which is why the guide leaves it unspecified. Agreed by the owner on 20 November 2026.
  react.dev says that StrictMode runs one more setup and cleanup, not in which task. Its test, in
  `bridges/react.test.ts`, fails with a cleanup run in a microtask.

## The rule

A premise about what code does when it runs is checked before the change that rests on it is written, and never only
reasoned. A new one is taken only where no design without it is as good (value 5 of "Deciding" in
[`AGENTS.md`](../AGENTS.md)), and the report of the change names it, with what rests on it and its test.

- **Documented, on a stable API**: no premise, and not listed. For Effect, the JSDoc of its declarations at the version
  of the lockfile; for the JavaScript engine, the ECMAScript specification; for what the bridges rest on of the DOM,
  its specification (WHATWG). Of a behaviour documented in part, only the part not promised is listed. What Effect says
  on effect.website or in `node_modules/effect/ai-docs` is no promise: a premise it describes stays listed, and names
  what it says.
- **Not documented**: a premise, listed here with a test that fails without it, written before the change, and never
  made unneeded by code of the library's written for it alone (an explicit `Effect.interruptible`, a scope closed by
  hand), which would look redundant and let what it stood in for change unseen. For Effect, the range accepts only the
  patches of the lockfile's version, and the daily jobs run the tests beyond it (`upgrade-effect`, which says what
  follows a premise that falls). For the JavaScript engine, the test runs on Bun (JavaScriptCore) and on Node (V8).
- **A premise's test is its own**: it checks the dependency and nothing of the library, in `test/premises.test.ts`, in
  a file of its own in `test/` where it needs a harness, or, for a bridge's renderer, in the bridge's test file. So a
  test of a premise that fails names the premise that fell, and a premise dropped takes its test with it.
- A guarantee says what it promises in the library's terms, never in those of a function of Effect (the order of the
  defects is no promise, since a user would rely on what `Cause.squash` returns). What keeps a guarantee may rest on a
  premise, as the span and the self-interruption do. Two cases that half a premise holds are left unspecified by the
  guide ("Running", "The defects in the cause"), and kept by the engine: a fiber that interrupts itself as the run stops
  it is a defect, and two releases of one scope that die of defects equal by `Equal` are two.
  [`premises-and-range.md`](records/premises-and-range.md) sorts what falls with each premise.
- What the dependencies of development do is no premise, but for the bridges' renderers: the bridges are entries of
  the package, each names in its opening comment the versions it was checked with, and a daily job
  (`.github/workflows/renderers-latest.yml`) runs their premises' tests at the newest version the range accepts.
- A premise the rule cannot check yet holds the change up: it waits, or a guard of the library's makes it unneeded,
  and it goes under "Premises that no test reaches yet". A move to a new major of Effect or of a renderer checks every
  premise again.

## Reviews and fixes

A review of the premises ([`premise-review`](../.agents/skills/premise-review/SKILL.md)) is due before a release and
before 1.0, over the changes of the engine and the tools since the last one, by a session that wrote none of them. It
reports a finding only once a test reproduces it, or the rule rules it out: a reading of the code, or of a
dependency's source, is a lead.

The rule of fixes: a finding is fixed by its form, not only by the sequence that found it. The fix names the form (a
cleanup skipped, or an exit discarded, as a scope closes; a step applied by two actors at once; a window between two
fibers that nobody watches), looks for it in every place of the engine and of the tools that ends a run, applies a
message or releases what a fiber holds, and leaves a test at each place the form can reach.

## Premises that no test reaches yet

A lead that no test can reach yet, with what would decide it.

- **An interruption never reaches the fiber that starts the effects between the fork of the fiber of effects and its
  assignment**, which is how `stop` knows of every fiber of effects. The fork and its assignment are one region nothing
  interrupts (`effects` in `engine.ts`), so nothing rests on it: an interruption lands there only under the scheduler of
  the tests, which no test of a check runs under. A test that interrupts that fiber right after `FiberSet.run` returns,
  without that scheduler, would decide it: the region would go, and the premise would join the list.
