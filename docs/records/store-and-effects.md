# The run as a store and its effects: the spike and the plan

**Status:** spiked, 20 November 2026, by a session of Fable 5.2, on the branch `claude/spike-store-and-effects` at
`ab19927`, never to be merged. Taken by the owner the same day ("Decided", at the end), to be done in the four stages
of step 2 of [`ROADMAP.md`](../../ROADMAP.md). It answers part 2 of
[`architecture-review.md`](architecture-review.md), which says why the renderer as an effect is in doubt, and its
"Open, for the plan". It reopens "`run` split into a synchronous half and the fibers", parked on the same day (B5 of
[`synchronous-dispatch.md`](synchronous-dispatch.md), [`rejected.md`](../rejected.md)). Last read against the code at
`5da9c5a`.

## In short

A program is started by plain code, with no fiber: `start(program, options)` calls `init`, makes the first state and
its keys, and gives a handle, `{ model, subscribe, dispatch }`, with `run`, the effect that runs the program's effects.
A renderer is plain code that reads the handle. Whoever runs the program forks `run`, and ends it by interrupting it.

```ts
const app = start(counter)
drawInto(root, view)(app)
Effect.runFork(app.run)
```

The engine was rewritten in those two halves, and `run(program, render)` kept on the branch as a composition of them,
so that the tests of `main` judge the new engine as they are: every one passes, on Bun and on Node, and so do the 21
properties of the search. `drive`, `Host`, `Draw` and the bridge to snabbdom were then written over `start`.

The review's doubt about StrictMode was right, and has an answer. A program that was started cannot be run twice so
that the commands of `init` start once: the first run starts them as it is forked, its interruption interrupts them,
and a command is never started again. But `Host` can keep from starting the first run: it starts its run in a
microtask after its effect. Under StrictMode the commands of `init` then start once. Run, in happy-dom.

What it costs, beside the change of the API: a renderer that draws outside a listener needs a way to tell the run
that its draw threw, which the spike adds to the handle as `die`; and a program that was started and never run is
never stopped.

Found on the way: a defect that `main` loses today, in silence (point 2 of the "Seven points of a review of the
design" in `ROADMAP.md`, now reached by a test).

## Three facts of Effect, checked first

Each was run with Effect 4.1.4 on Bun 1.4.5, in a probe that the branch does not keep. None is in Effect's
documentation, so none is to be built on without a premise of `premises.md`.

- **`Effect.runFork` runs the effect on the stack of whoever calls it**, until the effect first waits. So does a fiber
  that `FiberSet.run` forks, which is a premise already. A fiber that `Effect.forkChild` forks starts later.
- **A fiber that waits on a `Deferred` is resumed on the stack of whoever completes it.** `change-engine` says so, of
  the source.
- **A fiber that waits on `Queue.take` is resumed by a task that the queue gives the scheduler**, not on the stack of
  `Queue.offerUnsafe`.

## What was built

- **`src/shell.ts`.** `makeDeaths` is plain code, and no effect: its `Deferred` is made with `Deferred.makeUnsafe`. A
  register has `hold` and `release`: while it is held, a defect recorded does not complete `died`, and `release`
  completes it when one was recorded meanwhile.
- **`src/engine.ts`.** `build(config)` is plain code. It makes what the thunk reads and writes, the keys of the first
  state, and the first job. It returns `effects`, an effect that starts the fiber of effects in the scope it is run
  in: the queue, the sets of fibers, the finalizer that ends the engine, and the loop. Until `effects` runs, a message
  is applied all the same, and its job waits in an array.
  - **One offer for each dispatch.** The thunk only adds its jobs to the array. As the outermost `apply` returns, in a
    `finally`, they are offered to the queue with one `Queue.offerAllUnsafe`, and then the register is released. So
    neither the fiber of effects nor the end of the run starts inside a step.
  - **What throws outside `attempt` is recorded.** The loop of `apply` has a `catch` and a `finally` ("Found on the
    way").
  - `make`, an effect, is kept for the tests of the engine: `build`, then `effects`.
- **`src/run.ts`.** `start(program, options)` and its type `Started`, the handle with `run`. `run` is the engine's
  `effects`, then a wait for `died`, in a scope, and it ends with the defects first (`Core.endedWith`), as today.
  `run(program, render)` is the composition: the same halves, with the renderer as a fiber between them, as today.
  The handle has a fourth function, `die` ("A draw that throws", below).
- **`src/testing/drive.ts`.** `drive` starts the program, subscribes, and forks `run`. Its renderer, made only to be
  handed the `App`, and the `Deferred` that carried the handle to the scenario, are gone.
- **`bridges/react.ts`.** `Host` starts the program in the initializer of its state, so it draws the first model in
  the render that mounts it: `fallback` is gone. It forks `run` in a microtask after its effect. `Draw` gives
  `useSyncExternalStore` the handle's `model` as its server snapshot too.
- **`bridges/snabbdom.ts`.** `drawInto(root, view)(app)` is plain code, and returns what stops it. What a draw throws
  goes to `app.die`. The `Deferred` that carried it to the renderer's fiber is gone. `renderInto` is kept on the
  branch as `drawInto` in a scope, for `run(program, render)`: so the 41 tests of the bridge run on the plain form.
- **`examples/counter/main.ts` and `examples/form/main.ts`**, which draw one program with both bridges, are written
  with `start`: three lines each, where an `Effect.all` of two renderers was.
- **`src/start.test.ts`**, nine tests of the handle, and three tests of `Host` in `bridges/react.test.ts`, in place of
  the test of `fallback` and of the two of StrictMode.

Names are the spike's: `start`, `Started`, `drawInto`, `die`. The owner chooses them.

## The answers to "Open, for the plan"

### A run started twice on one handle, and StrictMode

The review asked for this first. React runs an effect, its cleanup and the effect again, on one component, and under
StrictMode it does so in one task.

- **One handle cannot be run twice so that the commands of `init` start once.** `Effect.runFork` runs on its caller's
  stack, so the first run takes the first job at once and calls `runCommand`. The cleanup interrupts that command. A
  command is never started again, by the engine's rule, and the program would wait for an answer that never comes.
  Run: with the run forked in the effect itself, the test gives `started by 1`, `interrupted in 1`, `started by 2`,
  the last on a second program, started anew, as `Host` does today.
- **A program started is run once.** A second `run` dies, with a plain `Error`: it is a mistake of whoever runs the
  program, not a defect of the program. The first run goes on. Tested.
- **`Host` starts its run in a microtask after its effect**, which the cleanup cancels. Under StrictMode the first of
  the two effects then starts nothing, and one program runs, once: `started by 1`. The same test fails without the
  microtask. An effect that runs again later, as when `<Activity>` shows `Host` again, finds a program whose run has
  ended, and starts the program anew, from `init`, as today: the two tests of `<Activity>` pass unchanged.
- **What it rests on.** That StrictMode runs the cleanup in the task of the effect, before any microtask. It is seen
  in the test alone: no page of react.dev was read for this record. If React ran it later, the first run would start
  and be interrupted, and `Host` would start the program anew: today's behaviour. So it is to be described, and not
  promised.

### An `init` that throws

The handle is made all the same. The defect is recorded in `'init'`, as today. `model()` throws it, the very
`ProgramDefect`. `subscribe` and `dispatch` do nothing. `run` dies of it at once. Tested.

The other form, a `start` that throws, was not built. It would give whoever runs the program two places to report a
crash from: around `start`, and the exit of `run`. With the handle that has died, there is one. Under `Host` the two
forms are the same: the defect reaches the nearest error boundary as `Host` renders.

A `subscriptions` that throws on the first state is recorded the same way, in `'subscriptions'`. The model is read,
nothing is applied, and `run` dies of it. Tested.

### A dispatch before `run` starts, and after it has ended

- **Before:** the message is applied, the listeners are told, and its job waits. `run` then does the first state's job
  and the jobs that waited, in the order of the states. Tested. The state is ahead of its effects from the start.
- **After:** nothing is applied, and nothing is thrown, as today. Tested.
- **Not asked, and found:** a program that was started and never run is never stopped ("Found on the way").

### A draw that throws outside a listener

The bridge to snabbdom draws in a microtask, which nothing of the run calls. Today the renderer's fiber waits on a
`Deferred` for what such a draw throws, and dies of it. With no fiber, the spike weighed three ways.

- **A door on the handle, built.** `app.die(thrown)` takes what a renderer threw for a defect in `'render'`: from then
  on the program applies nothing, and `run` dies of it. A defect of `makeModel` that `model()` threw is taken as it
  is, and stays one defect. The bridge gives `die` what its first draw throws too, so a crash is read in one place,
  the exit of `run`. It keeps today's promise: "With snabbdom, a view or a `makeModel` that throws as it is drawn ends
  the run". It costs one function on the handle, which only a renderer that draws outside a listener calls.
- **No door: the renderer's defects are its own.** A draw that throws in a microtask is then an uncaught error of the
  page, and the run goes on with a view that is drawn no more, whose handlers still send. Not built, and not advised:
  the crash of a view would be read in another place than every other crash.
- **`run(program, render)` kept**, for a renderer that is an effect. It is what the branch has, to run the tests.

With React nothing changes: a view that throws as React renders it is an error of the application, for its error
boundaries, as today.

### "Nothing outlives what acquired it" and "Nothing ends in silence"

If `run(program, render)` goes, the renderer is no fiber of the run, and both lose it.

- **"Nothing outlives what acquired it"** is of each command and each subscription. A bridge returns what stops it,
  and whoever started the program calls it, or does not: a renderer that is stopped by nothing still draws nothing
  after the end, since no state is made after it.
- **"Nothing ends in silence"**: a defect anywhere in the program ends the run. Of a renderer, the run guards what it
  calls, a listener and `makeModel`, and what the renderer gives to `die`. "A command, a subscription or the renderer
  that the program interrupts is a defect too" loses the renderer.
- **`'render'`** is then: in `makeModel`, wherever the model is read; in a renderer's listener; and what a renderer
  gives to `die`.
- **"The run ends when the renderer ends"** goes. The run ends when it is interrupted, or with a defect.
- **"How the run ends"** loses its second step, "It stops the renderer".

### `drive` over the handle

Built. `drive` starts the program, so `Driver.dispatch` is the program's from the scenario's first step.

It needed one thing that the handle does not give: to know that the run has begun. `Effect.forkChild` does not start
its fiber at once, so a scenario that ends at once ended before the run began, and three tests of the contract failed:
a subscription of `init` never started, a defect of the first model reached the scenario, and a message sent after
`drive` had ended was applied. So `startWith`, internal, takes a function that the run calls once it has started the
effects of the first state, and the scenario begins then, unless the program has died: as it began, before, once the
renderer had its handle. With it, the 115 tests of the contract and the 22 of `drive` pass unchanged.

## One wake for each dispatch

The review proposed that the thunk keeps its jobs in an array and wakes the fiber of effects once. Built, with one
change: the wake is an offer to the queue of today, not the completion of a `Deferred`.

- **A `Deferred` was tried first, and runs the effects inside the dispatch.** Effect resumes its waiter on the stack
  of whoever completes it, so the fiber of effects did the job, `describeMessage` and the start of each command
  included, before `dispatch` returned. "describeMessage and describeCommand are called only while debug logs are
  enabled, in the fiber of effects" (`engine.test.ts`) failed. The queue resumes its taker in a task of the scheduler.
  Neither is documented. So that the effects of a step do not start in the call that sent its message rests today on
  how `Queue` resumes a taker, and that test is its alarm. To decide with the stages: whether it becomes a premise.
- **Point 1 of the seven, answered: the end never begins inside a step.** The register is held while a message is
  applied, and `died` is completed as the outermost `apply` returns, after the jobs are offered. "never begins inside
  a step: a defect a listener throws ends the run once every listener of the step is told" (`start.test.ts`) fails
  without the hold: the subscription was released before the second listener was told. The end may still begin on
  the stack of the dispatch, once it has applied everything.
- **Point 2, answered: the loop has its `catch` and its `finally`.** See "Found on the way".
- **Point 3, answered for the engine only.** Nothing of the engine rests any more on where a fiber is resumed: the
  offer and the release are the last two operations of the outermost `apply`, in one place, and the hold has a
  killer. `drive` and `rehearse` keep their own orders ("writes first, completes last"), which the spike did not
  touch.

## Found on the way

- **`main` loses a defect in silence, and then applies nothing.** `applyOne` says what a defect of `update` was on with
  `describeByTag(message)`, which reads the message's tag again, outside every `attempt`. A message whose tag throws
  on that second read makes `dispatch` throw to its caller, the defect of `update` is recorded nowhere, and `applying`
  stays set: the run applies no message, and ends with no defect. Run on `main`'s engine, with a getter that throws
  on its second read: `dispatch` threw `tag threw`, the next message was not applied, and the run ended in success. A
  message with such a tag is unlikely. But the form is point 2 of the seven, which was reasoned as unreachable: "what
  threw there outside `attempt`". On the branch, what the loop catches is recorded as it is, with no site, the run
  dies of it, and nothing is thrown to the sender. The defect of `update` itself is still lost there: `recordThrown`
  should record first and read the details after. Listed in `ROADMAP.md`.
- **A program started and never run is never stopped.** `run` stops the program as it ends. A fiber interrupted before
  it began the run leaves the program as it was: its state can still change, and no effect follows. It is what made
  `drive` wait for the run to begin. `Host` unmounted before its microtask leaves such a program, which nothing holds.
- **The first state's effects start on the stack of whoever forks `run`**, as today. The spike keeps it by offering
  the jobs that waited before it forks the fiber of effects, which then takes them with `Queue.take` without
  yielding: seen, and not documented. Forked first, the fiber took them in a later task, and `Host`'s old test of
  StrictMode saw no command started by the first run. Stage 1 would do the jobs that waited in the fiber that starts
  the effects, as today's engine does the first job, and rest on nothing new.
- **One program, two renderers.** One program drawn by snabbdom and by React is three plain lines. The examples'
  `Effect.all` of two renderers, and the `Effect.never` that kept React's alive, are gone.

## What was run

On the branch, at `ab19927`: `typecheck`, `lint`, `test` (928: the 918 of `main`, the nine of `start.test.ts` and one
more of `Host`), `test:node` (721), `interleavings` (21 properties), `build` and `comments`.

- **Before any test was changed**, with `run(program, render)` over the new engine: 918 of 918 on Bun, 712 of 712 on
  Node, 21 properties. On the way there, each failure had a cause that is written above: the `Deferred` as a wake, and
  the fiber of effects forked before the jobs that waited.
- **Seen to fail without what it checks:** the test of the end, without the hold; the two tests of StrictMode, without
  the microtask; the three tests of the contract, without the wait for the run to begin.
- **Not run:** `mutations`, whose list names code that the spike rewrote; `smoke`, `api --check`, `inference`, the
  site's build. No real browser. `hydrateRoot` was not run: only `renderToString`, of `Host` and of `Draw`, which gave
  the first model and started nothing of `init`.

## What `run(program, render)` costs to keep, and to remove

The branch keeps it, as a composition. All of this section is counted or read, and nothing of it was built.

- **Kept:** the API has two ways to start a program. Everything of the renderer's fiber stays: its scope, its root, its
  site, the race of its end with `died`, `rendered` of the engine and `isModels`. So do 28 tests of `run.test.ts` that
  name the renderer, 4 of the 9 mutations of `run.ts`, and the paragraphs of `invariants.md` on the renderer. The guide
  says both ways, and when a renderer is an effect. Nothing of the review's "What it removes" goes but `drive`'s
  renderer and `fallback`.
- **Removed:** one way. What is listed above goes. The handle gains `die`, and a bridge returns what stops it.
  `run.test.ts` (about a hundred calls of `run`), the search (its renderer is an effect that sends, releases slowly
  and dies), the bridges' suite and the examples' tests and mains are ported to `start`. The guide's "Running",
  "Writing a bridge", "Testing", "Testing tools" and the glossary, the tutorial's first page and the README call
  `run(program, render)` (a search), and "Guarantees" promises what a renderer's fiber has. It breaks an export that
  0.7.1 has, with an `Upgrade:` note. 0.8.0 breaks every renderer already, since it is handed an `App` and no frames.

## What the guide would say

If taken, with `run(program, render)` removed. Each by the rule of `AGENTS.md`, one section at a time.

- **"Running".** "In short" and "The renderer gets an `App`": `start` gives the handle and `run`. New rules: a message
  sent before `run` is applied, and its effects wait; a program started is run once; one that was never run is never
  stopped. "When a defect happens": `'init'` is recorded as the program starts, and `model()` throws it; `'render'` as
  above. "How the run ends": two steps. "The end may begin inside a dispatch" becomes: on the stack of the dispatch,
  once it has applied its messages and told the listeners, and never inside a step. Still described, and not promised.
  "Work that must wait goes to the effects of the program" loses the renderer.
- **"Writing a bridge".** "The handle": a bridge is plain code over the handle, and returns what stops it. What a draw
  throws outside a listener is given to `die`. The region `handle` of the bridge is three lines.
- **"Guarantees".** As under "Nothing outlives what acquired it" above. "With the bridge to React, the run lives as
  long as the effect that starts it" says that the run starts in a microtask after the effect, and what StrictMode
  then does, described and not promised. A new line, if the owner takes it: on a server, `Host` and `Draw` draw the
  first model, and nothing of `init` starts.
- **"Testing" and "Testing tools"**: `drive`'s options are `start`'s. Nothing else of `drive` changes for a user.
- **`docs/invariants.md`**: the entries on the renderer's scope and site, on where the end begins, on the `finally` of
  `apply`, and "A thunk writes first and offers or completes last" for the engine. **`docs/premises.md`**: the premise
  of the fiber that makes the engine ("Premises that no test reaches yet") moves to the fiber that starts the effects.
  New, for the owner's consent: how StrictMode orders an effect and its cleanup, as a premise of the bridge to React;
  and, if the owner wants the effects kept out of the dispatch as a rule, how `Queue` resumes a taker.

## What it reverses in `rejected.md`

- **"`run` split into a synchronous half and the fibers"** (parked): taken, or refused with what was tried here. Its
  sentence on StrictMode, "a second half that nothing starts, with no command of `init` run twice", holds of the second
  render, and not of the second effect, which is the one that starts a run.
- **"`renderToString`, a first frame for server-side rendering"**: its last sentence names the parked split. The entry
  stands: the library exports no function for it. A server calls `start` and reads the handle.

## What is left for the owner to decide

1. **Take the split, or leave it parked.** The advice: take it. The engine is in two halves already, the tests of
   `main` pass on them as they are, and the handle is what `drive`, `Host`, `Draw` and a server each needed and built
   around.
2. **`run(program, render)`: removed, or kept as the composition.** The advice: removed, so that there is one way to
   start a program. It is the larger part of the work, and of the break ("What `run(program, render)` costs").
3. **A draw that throws outside a listener**, if `run(program, render)` goes: the door on the handle (`die`), or the
   renderer's defects left to the renderer. The advice: the door. It keeps the promise of today in one function.
4. **`Host` under StrictMode**: the run started in a microtask after the effect, so that the commands of `init` start
   once, described and not promised, with a premise on React that a test alone shows. Or the run started in the
   effect, as today: the commands of `init` start twice in development, as React's rule for effects shows. The
   advice: the microtask. A reader with an application in React meets StrictMode on the first day.
5. **An `init` that throws**: a handle that has died, as built, or a `start` that throws. The advice: the handle.
6. **Server rendering**: whether the guide promises that `Host` and `Draw` draw the first model on a server. The advice:
   promise that much, and no hydration until it is run in a browser (step 6 of `ROADMAP.md`).
7. **The defect that `main` loses** ("Found on the way"): fixed with stage 1 below, or now, apart, if the split is
   left parked. The fix is a `catch` and a `finally` in `apply`, and a `recordThrown` that records before it reads the
   details. To decide with it: the site of what the loop catches. The spike records it as it is, with no site.
8. **The names**: `start`, `Started`, `drawInto`, `die`.

If taken, the stages for `ROADMAP.md`, in order, after step 4, which changes what a job is:

1. **The engine in two halves, `start` and `drive`.** What the branch holds of `src/`, rebased on `main`, with the
   jobs that waited done by the fiber that starts the effects, the fix of point 7, `docs/invariants.md`,
   `docs/premises.md` and the mutations. `run(program, render)` stays in this stage, as the composition, so that every
   check passes at its end. Opus 5.5, `high`: the engine, and invariants to keep.
2. **The bridges, the examples and the tests over `start`**, and `run(program, render)` removed, if the owner removes
   it: `Host`, `Draw`, the bridge to snabbdom, the bridges' suite, `run.test.ts`, the search, the examples. Opus 5.5,
   `high`: the search and the tests of a boundary are rewritten, not only renamed.
3. **The guide, the doc comments, the skill, the README, the tutorial and the changelog**, section by section as
   listed above, with `bun run comments` passing. Opus 5.5, `high`: the guide is a specification.
4. **`docs/rejected.md`**, the two entries above, and this record's status. Sonnet 5.5, `medium`, from this record.

## Decided

By the owner, 20 November 2026, on the advice of the session that made the spike (Fable 5.2), to the eight questions
above. The owner took each advice as it was given, and left the names to that session.

1. **Taken.** A program is started by plain code, and `run` is the effect that runs its effects.
2. **`run(program, render)` is removed.** `start` is the one way to start a program. Stage 1 keeps it as the
   composition, so that every check passes at its end, and stage 2 removes it.
3. **The door.** A renderer gives the handle's `die` what it threw as it drew outside a listener, its first draw too.
   The run dies of it, in `'render'`.
4. **`Host` starts its run in a microtask after its effect.** Under StrictMode the commands of `init` start once. It is
   described, and not promised. That StrictMode runs the cleanup in the task of the effect becomes a premise of the
   bridge to React, with the two tests of StrictMode as its tests: the owner's consent to it is this answer.
5. **An `init` that throws gives a handle that has died**, whose `model()` throws the defect and whose `run` dies of
   it.
6. **The guide promises the first model on a server**: `Host` and `Draw` draw it, and nothing of `init` starts. It
   promises nothing of hydration, until `hydrateRoot` is run in a browser (step 6 of `ROADMAP.md`).
7. **The defect that `main` loses is fixed in stage 1**: a `catch` and a `finally` in `apply`, and a `recordThrown`
   that records before it reads the details. What the loop catches is recorded as it is, with no site, as the spike
   does.
8. **The names stay as spiked**, chosen by the session:
   - `start`, beside `run`: a program is started, then run.
   - `Started`, for what `start` gives. `App` stays the name of the three functions a renderer reads.
   - `drawInto`, for the bridge to snabbdom, beside `Draw` of the bridge to React: both draw a program that was
     started. `renderInto` named the renderer that `run` took, which goes, and no release has had it.
   - `die`, the word the guide has for a run that a defect ends.

Not asked of the owner, and left to stage 1 to ask before it writes: whether "the effects of a step do not start in
the call that sent its message" becomes a promise, with how `Queue` resumes a taker as its premise ("One wake for each
dispatch").

The stages are the four listed above, written as 2a to 2d of step 2 in `ROADMAP.md`, after its step 4, with what each
owes to these answers.
