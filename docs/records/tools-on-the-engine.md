# The testing tools on the engine: aligned with the run by construction

**Status:** proposed on 24 November 2026 by a session of Fable 5.2, which the owner asked how the testing tools and
the run could be aligned by construction, free to break invariants and premises. The owner asked the same day for it
to be written as steps of [`ROADMAP.md`](../../ROADMAP.md), done first: steps 49 to 55. It answers step 21 there,
which is closed. Reasoned from the code, read whole (`engine.ts`, `core.ts`, `shell.ts`, `run.ts` and every module of
`src/testing/`), and not spiked: nothing was built but a throwaway benchmark, for the one measure below, and no test
nor mutation was run. Read against the code at `ce1ffd1`.

## What was asked

The owner named a misalignment that keeps coming back between the testing tools and the engine. Step 19 put `rehearse`
on the engine ([`one-engine.md`](one-engine.md)), and the review of step 20 still found a difference in `simulate`, one
in `drive` and one in `rehearse` (`ROADMAP.md`, "Open problems"). The owner asked whether `rehearse` is aligned enough,
and how the two environments, the tests' and the run's, could be aligned by construction.

## What the reading found

A tool differs from the run only where it writes again something the run does, in the place of deciding when it
happens. Three places are left.

1. **`simulate` is a second engine, whole.** It has its own thunk (`Core.arrive` and `Core.reconcile`, each in a
   `diesIn`), its own fork of a command (`Effect.forkChild`, `scopedIn`, `rootedIn`, the record), its own stop of a
   command interrupted, and its own end, with 14 mutations. The finding of step 19, a defect of `update` lost when the
   message's tag throws, lives there: `simulate.ts` has the one site of `src/` where `diesIn` describes a message
   (searched: every other site gives no details, or a key). The engine guards the same read, in `recordThrown`.
2. **`rehearse` is the engine's for the thunk, the jobs and their order, the fibers, their roots and records, and the
   end**, as step 19 left it. Four things are still written by hand:
   - the handle: `init` called with the flags, its defect in `'init'` by `diesIn` where `run.ts` has `recordThrown`;
     the first model, made whatever the first keys did; and a listener that calls `makeModel` for each state.
     `partsOf` (`run.ts`) does all three for the run and for `drive`;
   - what a fiber runs: `scopedIn`, and the answer applied once the scope has closed, for a command;
     `runSubscription`, `scopedIn`, and the end value sent after the scope, for a start. Both are the defaults of
     `Engine.build`, written again in `answering` and `listening`;
   - a `runCommand` and a `listen` given to the engine that nothing calls, since `answering` and `listening` take the
     place of the whole body, where the rehearsal decides only when the fiber goes on, and with whose services;
   - a value of the program, or of the test, printed in the fiber of effects with no guard: the finding of step 20.
3. **What a tool does of its own.** A wait of `drive` reads `latest`, a variable, where the guide promises a sequence
   ("reads the model of each one"): the other finding of step 20. It is no difference from the engine, which wakes
   nothing on a state, but it has the same form: a rule written beside what it is about.

`applyAll`, `dispatchViolations` and `placeViolations` call the program's functions with no run, and say so: nothing
of the engine is written again in them.

## Proposed

1. **`simulate` over the engine, as a rehearsal that hears nothing.** The half of `rehearse.ts` that runs commands
   (the ledger of the commands, `answering`, `runFirst`, a message applied and what its call waits for, the end) goes
   to a module of its own, and `simulate` is that with no model: the commands run oldest first until none is pending,
   then each message of the test's, and the commands again. It takes and returns what it does today. Its mutations go,
   and so does the last `diesIn` that describes a message: the details of a defect are then a key or nothing, data
   that cannot throw.
2. **One handle.** `rehearse` takes its `App` and its engine from `partsOf`, as `drive` does through `startWith`: a
   tool told of every state that reads each one is then the same line in both.
3. **What a fiber runs, written once**, in `shell.ts`, beside `runSubscription`: the engine's defaults and the
   rehearsal call the same two functions. The config of `Engine.build` takes `runCommand` and `listen`, or what stands
   for them, never both.
4. **The rule as a boundary.** After the three, no module of `src/testing/` calls `Core.arrive`, `Core.reconcile`,
   `diesIn`, `scopedIn`, `rootedIn` or `runSubscription`, and a check says so, as Oxlint forbids a renderer's import.
   "When the engine or one tool changes, keep the others in step" becomes: a tool decides when, and what fails the
   test, never what a step, a scope or a site is. The contract (`contract.test.ts`) is then an alarm of what each tool
   decides, no longer the proof that two engines agree.
5. **The two findings that are a tool's own, by their form.** In `drive`, a wait reads the models in order from the
   place it has read to, so no wake skips one. In `rehearse`, the fiber of effects tells a call data, and the call's
   own fiber makes the error and prints the value.

## The measure

What step 21 asked before `simulate` goes over the engine: a fiber of effects and a scope for each simulation, where a
property may run thousands. Measured by a proxy, the same flow played with `rehearse` and a model that is the state,
so an upper bound: a rehearsal also keeps the hearings of the ledger, parks a fiber for each start and makes a model.
On the owner's machine, with Bun 1.4.5 and Effect 4.1.5: the median of five runs of 2,000 flows in one fiber, after
300.

| Flow                                 | `simulate` | By the proxy | Times |
| ------------------------------------ | ---------- | ------------ | ----- |
| 1 message, no command                | 11 µs      | 62 µs        | 5.7   |
| 10 messages, no command              | 24 µs      | 110 µs       | 4.5   |
| 100 messages, no command             | 223 µs     | 563 µs       | 2.5   |
| 10 messages, a command each          | 104 µs     | 320 µs       | 3.1   |
| 100 messages, a command each         | 1,049 µs   | 2,474 µs     | 2.4   |
| 10 messages, a command each, 1 key   | 86 µs      | 349 µs       | 4.0   |
| 10 messages, a command each, 50 keys | 191 µs     | 900 µs       | 4.7   |

So the proxy costs some 50 µs more for each simulation, 3 µs more for each message, 11 µs more for each command, and
9 µs more for each key: the fiber that a rehearsal parks for a start, where a simulation's start would end at once. A
property of a thousand simulations of ten commands goes from 0.1 s to 0.3 s. The row of one key shows what the runs
vary by: `simulate` is no faster with a key than without.

The script was not kept. Its program has a state `{ n, saved }`, a message that changes `n`, one that also starts a
command, answered at once with a third, and `makeModel` as the identity. Its rehearsal is `runAll`, then, for each
message, `send(() => Opt.some(message))` and `runAll`.

## Alternatives

Weighed by the session, and reasoned only. The owner was shown the first. The other three were not put to the owner:
they are noted for whoever writes steps 50 and 52.

- **`simulate` as a fold with no run**, as `applyAll` is: `update` and `runCommand` called as plain functions, a
  defect thrown as it is, and no subscriptions read. It is aligned by construction too, and the fastest. It takes back
  the promise that `simulate` fails with the `ProgramDefect` the run dies with (the guide's "Defects of the program"),
  and the descriptions of "`simulate`, as the run dies". Advised against, and kept as what step 52 falls back to if
  the owner refuses the cost of the form.
- **A seam that says only when**, in the place of `answering`: the engine would call `runCommand` itself, in the
  command's fiber, once a wait that the tool gives has ended. That call is then in another thunk than the `run` that
  checked the register and the end, against "a function of the program is called where the call is decided"
  ([`invariants.md`](../invariants.md), "one thunk"), and `rehearse` promises that no command runs after a defect.
- **A performer that the caller runs, for `simulate`**: the jobs that wait done in the simulation's own fiber, with no
  fiber of effects. It is a second way to do a job, with its own wait for the commands to end, which the rehearsal's
  `runAll` already is.
- **`send` returning what its message came to**, in the place of `stepped` and of the two variables through which the
  rehearsal reads it. The ledger is written before the job of the step is offered ("a thunk writes first and offers
  last"): written from a value that `send` returns, it would be written after the offer, and rest on the queue
  resuming the fiber of effects later, which nothing promises.

Not weighed: the lead of the types of `simulate`, whose state is read from what `update` returns (`ROADMAP.md`, "Open
problems"). It is about what `simulate` infers from the pieces it is given, not about what it runs.

## Decided

The owner asked on 24 November 2026 for the proposal to be written as steps, and done first.

- **Step 21 is closed**: `simulate` runs over the engine. Step 52 measures the form itself before it writes it, and
  asks the owner again if it costs more than the proxy.
- **No promise of the guide changes.** The rule that the tools are kept in step is said again in step 54, in words
  that the owner is asked for; and which cases of the contract stay is the owner's, there.
- **The order** is by what a test meets today, then by what each step rests on: `ROADMAP.md` says it.
