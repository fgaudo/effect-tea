# What the invariants rest on

An invariant of [`invariants.md`](invariants.md) holds only while what it rests on does: the purity of the program's
code, values never mutated, and what Effect and the JavaScript engine do. What the program must do is the guide's
("What is left to you"). What Effect, the JavaScript engine or a bridge's renderer do without promising it is listed
here, each with its own test, by [the rule](#the-rule) below: what a stable API documents is no premise.

## The premises

Each premise names what rests on it, what its dependency documents of it, and its test, in `test/premises.test.ts`
unless it says otherwise, named after it, with what it fails with. One on Effect names its kind too, **by the model**
or **open** ([the rule](#the-rule)), with the reason, and whether it was asked of Effect.

The testing tools take no premise of a fork of their own: `drive` runs the run; `rehearse` runs the engine through the
handle the run makes (`partsOf` in `run.ts`), and `simulate` builds it (`Engine.build`): both run its thunk, its
jobs, its fibers and its end. So each rests on what the engine rests on, and on what `testing/stage.ts` adds, named
below by `answering`. `simulate` runs no subscription, so the premise of a subscription's channel (one channel run
afresh) is none of its own.

- **A fiber that waits on a `Deferred` runs on the stack of whoever completes it, until it waits again**, a fiber or
  plain code. No guarantee rests on it, only killers of mutations: those of "died wakes a fiber inside a step", "drive
  wakes its waits inside the step" and "a call of drive's scenario made during a step acts inside it", which tell a wake
  inside the step only where it is resumed there; those of "an end that whoever runs the program makes during a step
  begins inside it", where whoever runs it, so resumed by a listener, interrupts the run, whose end then runs on the
  same stack (`Fiber.interrupt` runs a fiber that waits where it is interrupted, read in the source, `interruptUnsafe`);
  and those of `rehearse` refusing a command's answer and a subscription's message once it has ended. Should it fall,
  `bun run mutations` reports those mutations as survivors, and the library stays correct. Read in the source
  (`Deferred.doneUnsafe` resumes each waiter on the caller's stack, `internal/effect.ts`). Its test fails with the
  `Deferred` completed by a fiber of its own. Open, and not asked: when a waiter resumes is a turn of the scheduler, and
  the JSDoc promises none, as it says of a fork ("without promising a scheduler turn").
- **Code that a fiber runs on the stack of the fiber that forks it sees the forked fiber as its own**, through
  `Effect.withFiber`, `Fiber.getCurrent` and `Effect.fiber` alike, from its first step on, and it is the very `Fiber`
  that the fork returns and that a `FiberSet` or a `FiberMap` keeps; and no stable API gives a fiber the one that
  forked it. So the mark of a stop, which names the fiber it stops (`stopping`), names the fiber that `dying` in
  `shell.ts` reads as its own, on whichever stack it dies: "Only the run, and whoever runs it, interrupt them" rests on
  it. So the root of a fiber the run forks (`rootedIn`) knows that an unmarked interruption is the program's, never one
  of the fiber of effects or of whoever runs the program; and `answering` in `testing/stage.ts` reads the fiber of a
  command in its first step, which `FiberSet.run` runs on the stack of the fiber of effects. Agreed by the owner on 19
  November 2026. That `Fiber.getCurrent` gives the fiber that runs is documented; that it is the forked one on its
  forker's stack, and the object the fork returned, is read in the source. Its tests, for `Effect.forkChild` with
  `startImmediately`, `FiberSet.run` and `FiberMap.run`, fail where it sees the forker, or a `Fiber` that is not the
  one the fork returned and the container gives, read and iterated, in its first steps or once it resumes on a stack
  of its own. By the model, and not asked: the JSDoc says that
  `Effect.fiber` gives "the fiber currently executing the effect", that a fork "returns its handle", and that a fiber
  forked so "runs synchronously" before the fork returns, so the fiber that executes the forked effect is the forked
  one, on whoever's stack, and Effect has one value for a fiber, its `Fiber`, which it compares by identity itself. A
  fall could not go unseen: each stop by the run would be a defect, in every run that ends. That no API gives the
  forker is no behaviour that can fall: one added would be a lead for a simpler root.
- **What the cleanup of `Effect.onExit` fails with comes after the cause of the effect**: so each fiber of the engine,
  in the run and in the tools, records what it dies of in order, interrupted or not, merging no causes. That the
  cleanup runs however the effect ends, and that the causes are merged, is documented; their order is read only in the
  source. Its tests are of an effect that dies and of one that is interrupted. Open, and not asked: how the failures
  of cleanups combine is among what Effect-TS/effect#10683 declined. It holds no promise: the guide leaves the order
  of the defects unspecified.
- **`Scope.close` dies with every defect its finalizers die of, none merged by `Equal`**, those of the scopes forked
  from it included: so `scopedIn` records each defect of a release as a defect of its site. `Effect.scoped` is no such
  close: it joins with `Cause.combine`, which keeps one of two reasons equal by `Equal` (documented). The JSDoc of
  `Scope.close` says how the finalizers run, not what the close dies of, which is read in the source
  (`scopeCloseFinalizers`, `exitAsVoidAll`). Its tests are of two finalizers closed with a success and with a defect,
  and of one in a scope forked from it. Not asked. That the close dies of the defect of the one finalizer that died is
  by the model: the close runs the finalizer, and an effect that runs one that dies, dies of it, unless it says that it
  recovers. What it dies of where several died is open, how the failures of cleanups combine being among what
  Effect-TS/effect#10683 declined, and holds no promise: of several releases of one command or one subscription that
  die, the guide promises that the run dies, and leaves unspecified which of their defects are in the cause ("Running",
  "The defects in the cause").
- **A fiber that fails as it is interrupted keeps its own reasons and gets those it received added**: so `diesIn`
  tells a self-interruption from the run's stop that meets it, each by its own reason. Which reasons it fails with is
  read in the source (`exitFailCause`, `causeAddInterrupts`). Its test interrupts a fiber that then interrupts itself,
  where it is uninterruptible. Not asked. That the fiber keeps a defect of its own is by the model: an interruption
  that meets a failure takes nothing from it, as the JSDoc says of `Effect.awaitAllChildren` ("both the original
  failure and the interruption are retained in the cause"). That it keeps an interruption of its own beside those it
  received is open, and holds no promise: the guide leaves unspecified whether a fiber that interrupts itself as the
  run stops it dies of a defect.
- **`Effect.interruptible`, entered by an interrupted fiber where it is uninterruptible, fails each time with those it
  received.** No guarantee rests on it, and no code of the library: only gates of tests, by which a fiber of a test's
  program waits, uninterruptible, until it has received an interruption, or two, or reads who stopped it
  (`untilReceived` in `engine.test.ts` and `testing/rehearse.test.ts`, `receivedFrom` in `run.test.ts`), or enters
  `Effect.interruptible` again once `untilInterrupted` caught one (`run.test.ts`, `testing/contract.test.ts`). Should it
  fall, those tests fail, and the library stays correct: `untilReceived` dies once it has given up, so that no test
  goes on in an order that a count of yields made, and the other gates, which have no bound, wait until the test's
  timeout. Until step 106, of 26 November 2026, the engine asked each
  fiber the same question, and a promise rested on the answer ([`rejected.md`](rejected.md), "Asking a fiber which
  interruptions it received"). That a pending interruption takes effect as the fiber enters `Effect.interruptible` is
  documented; that one already caught makes it fail again, and with which reasons, is read in the source. Its test
  enters the region twice with one interruption, and again with two. Open, and not asked.
- **Every fiber of a run asks the `Scheduler` it is given before each step, and every task it makes goes to that
  scheduler's dispatcher, or resumes inline where the scheduler of the tests makes it yield first**: so
  `test/scheduled.test_scheduler.ts` decides where each fiber yields and which runs next, and the search and the
  scheduler that `bridges/bridge.test_suite.ts` holds rest on it. Read in the source (`runLoop`), with four details of
  the loop that the scheduler reads: a fiber asks first at a `currentOpCount` of 1 in each run of its loop; one told to
  yield schedules its resumption as the very next task, which asks nothing at its first step; one whose run ends with
  children runs its loop again in the same task and interrupts them there; and one that begins on the stack of another
  gives it back as it yields, in the same task. Its tests are a file of their own, `test/effect-scheduler.test.ts`,
  named after each. No killer of a mutation rests on it: a scheduler gone wrong costs a false alarm, or a missed one.
  Open, and not asked: how the loop asks its scheduler is the runtime's own.
- **One channel runs afresh each time it is run, one run after another or several at once**: so a `listen` that gives
  the same value for every start, as `listen: () => ticks` in the guide and the examples, starts it anew each time its
  key comes back. The library's code makes no channel that runs twice: the form the guide gives rests on it. Taken in
  step 57 over asking every `listen` for a new channel ([`rejected.md`](rejected.md)). The JSDoc does not say whether a
  value runs more than once; that each run makes its state anew is read in the source (`toTransform`). Its tests, of
  `Channel.fromIterator` with `Channel.concatWith`, `Channel.forever` and `Stream.toChannel` under `Channel.unwrap`,
  fail with an iterator made once for all runs. By the model, and not asked: a value of Effect describes a
  computation, and each run of it is another, as the JSDoc of `Channel.failSync` supposes ("computed each time the
  channel runs").
- **A collection reclaims what nobody holds, and a `FinalizationRegistry` then calls back for each target it
  reclaimed**: so the cache of `forwardTo` forgets the ids nobody shows (`forgotten` in `dispatch.ts`), and a child's
  model is let go. ECMAScript requires neither. Its test, on Bun and on Node, fails with a callback that never runs.
- **A `Queue` keeps nothing of a value taken from it**: so the queue of the jobs, which lives as long as the run, lets
  go of the jobs done. The JSDoc says what is taken, not what is kept. Agreed by the owner on 21 November 2026. Its
  test, on Bun and on Node, fails with a `MutableList.take` that keeps what it takes. By the model, and not asked: a
  fall would be a leak, which Effect fixes as a bug.
- **Effect keeps nothing of a fiber that has ended, nor of what its scope released**: so a command or a subscription
  that ended leaves nothing in a run that goes on, once its `FiberSet` or `FiberMap` has removed it, as their JSDoc
  says. Agreed by the owner on 21 November 2026. Its test, on Bun and on Node, fails with a fiber kept as it is made.
  By the model, and not asked, as that of a `Queue`.
- **snabbdom reuses an `<input>` with no key in the same place**: so a controlled element of the bridge to snabbdom
  keeps its focus, caret and selection while the program changes its value. snabbdom's README describes the reuse of
  keyed elements only. Its test, in `bridges/snabbdom.test.ts`, fails with a key of its own for the second input.
- **snabbdom calls a module's `update` hook on every element `h` draws again, one `h` is given no data for
  included**: so the bridge's module of the controlled elements (`controlledModule`) forgets an element drawn without a
  `value` or a `checked`. snabbdom skips the hooks of a vnode whose `data` is `undefined`, and `h` gives every vnode
  data: both are read in its source. Its test, in `bridges/snabbdom.test.ts`, fails with a vnode made with no data.
- **snabbdom calls a listener with its node as `this` and as its second argument, a list of them in order, and the
  listeners of a `thunk` with the thunk, which `copyToThunk` gives the data, the children and the text of the node its
  function draws**: so `messagesSentBy` (`bridges/snabbdom-testing.ts`) finds without a DOM what a view sends, calling
  each listener as snabbdom would. snabbdom's README says only that a listener gets its event: the rest is read in its
  source (`eventlisteners.js`, `thunk.js`). Its test, in `bridges/snabbdom-testing.test.ts`, draws trees of thunks,
  lists, comments and text with snabbdom, calls each listener by an event, and fails with a thunk drawn as its
  function's node.
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
[`AGENTS.md`](../AGENTS.md)), and the report of the change names it, with its kind, what rests on it and its test.

- **Documented, on a stable API**: no premise, and not listed. For Effect, the JSDoc of its declarations at the version
  of the lockfile; for the JavaScript engine, the ECMAScript specification; for what the bridges rest on of the DOM,
  its specification (WHATWG). Of a behaviour documented in part, only the part not promised is listed. What Effect says
  on effect.website or in `node_modules/effect/ai-docs` is no promise: a premise it describes stays listed, and names
  what it says.
- **What changes nothing that the library promises, and that no test, tool or killer of a mutation rests on**: no
  premise, and not listed, whatever the dependency does of it. An `Equal` or a `Hash` of the program is pure, as each
  of its functions is ("Deciding" in [`AGENTS.md`](../AGENTS.md)), and does not throw ("Guarantees", "What is left to
  you"). So when Effect calls one, and where what one throws would go, change nothing for a program that keeps those
  rules: nothing of the library is built for either, and neither is listed.
- **Not documented**: a premise, listed here with a test that fails without it, written before the change, and never
  made unneeded by code of the library's written for it alone (an explicit `Effect.interruptible`, a scope closed by
  hand), which would look redundant and let what it stood in for change unseen. For the JavaScript engine, the test
  runs on Bun (JavaScriptCore) and on Node (V8). One on Effect is of one of two kinds:
  - **By the model**: it follows from what Effect documents and from the model of its API, so that no version could do
    otherwise without breaking programs written as Effect teaches. Its entry gives the argument in a sentence. A fall
    would be a bug of Effect's, as a fall of what it documents would be, so it may hold a promise of the guide. It is
    not asked of Effect, whose answer in Effect-TS/effect#10878 left out what follows from the shape of an API.
  - **Open**: Effect could do otherwise and be right, as where it declined a rule (Effect-TS/effect#10683: callbacks
    that throw, `run` on a closed container, when a loser is interrupted, how the failures of cleanups combine). It
    holds no promise of the guide: only what the guide leaves unspecified, which the engine keeps as it is, or a test,
    a tool of development or a killer of a mutation. A promise that would rest on one is kept by another design, or
    narrowed. A premise whose argument does not fit a sentence is open. Nothing rests on what Effect does with a
    callback that throws: a function that may throw (the program's, a test's, or one that throws a defect of the
    library's) is called, and an iterable of the program's or a test's is iterated, by a loop of the library's or a
    method of an array, never by a function of Effect's over data (`Arr`, `Opt`, `HashMap`).
- **The range of Effect is a caret from the lockfile's version**: no promise rests on what Effect may change within a
  major, and a patch may change what a minor may, so a narrower range kept nothing out. The daily jobs run the tests at
  the newest Effect the range accepts, and at what Effect has merged and not released (`upgrade-effect`, which says
  what follows a premise that falls).
- **A premise's test is its own**: it checks the dependency and nothing of the library, in `test/premises.test.ts`, in
  a file of its own in `test/` where it needs a harness, or, for a bridge's renderer, in the bridge's test file. So a
  test of a premise that fails names the premise that fell, and a premise dropped takes its test with it.
- A guarantee says what it promises in the library's terms, never in those of a function of Effect (the order of the
  defects is no promise, since a user would rely on what `Cause.squash` returns). What keeps a guarantee may rest on a
  premise by the model, as the defect of a release does. What an open premise holds is kept by the engine and left by
  the guide. Unspecified: the order of the defects; a fiber that interrupts itself as the run stops it, which is a
  defect; and several releases of one command or one subscription that die, each of whose defects is in the cause, two
  equal by `Equal` too ("Running", "The defects in the cause").
  [`premises-and-range.md`](records/premises-and-range.md) sorted what fell with each premise of 23 November 2026.
- What the dependencies of development do is no premise, but for the bridges' renderers: the bridges are entries of
  the package, each names in its opening comment the versions it was checked with, and a daily job
  (`.github/workflows/renderers-latest.yml`) runs their premises' tests at the newest version the range accepts.
- A premise the rule cannot check yet holds the change up: it waits, or a guard of the library's makes it unneeded,
  and it goes under "Premises that no test reaches yet". A move to a new major of Effect or of a renderer checks every
  premise again.

## Reviews and fixes

A review of the premises ([`premise-review`](../.agents/skills/premise-review/SKILL.md)) is due before a release,
over the changes of the engine, the tools and the bridges since the last one, and over all of the code before the
library is made known and before 1.0, by a session that wrote none of them. It reports a finding only once a test
reproduces it, or the rule rules it out: a reading of the code, or of a dependency's source, is a lead.

The rule of fixes: a bug that escaped is a bug of the search first. Its fix names the cell it was in, an actor at a
moment, of the table of [`invariants.md`](invariants.md), "Who may act, and when", and adds what would have found it:
the generator that the search lacked for that cell, or the row of `src/testing/contract.test.ts`, checked by the
property of a step, and not only the test of its sequence. An actor or a moment that the table lacks is added to it,
with every cell it opens. The fix then looks for the same entry in every place of the engine, of the tools and of the
bridges that ends a run, applies a message or releases what a fiber holds, and leaves a test at each place it can
reach. Two kinds of bug are of no cell, and are fixed by their form: a cost in memory or in time that grows with the
messages, and a tool that does otherwise than what it imitates.

## Premises that no test reaches yet

A lead that no test can reach yet, with what would decide it.

- **An interruption never reaches the fiber that starts the effects between the fork of the fiber of effects and its
  assignment**, which is how `stop` knows of every fiber of effects. The fork and its assignment are one region nothing
  interrupts (`effects` in `engine.ts`), so nothing rests on it: an interruption lands there only under the scheduler of
  the tests, which no test of a check runs under. A test that interrupts that fiber right after `FiberSet.run` returns,
  without that scheduler, would decide it: the region would go, and the premise would join the list.
