# A core shared by the run and the testing tools

**Status:** decided, November 2026; steps 0 to 3 done. It follows effect-tea-persistent's decision 0292
(`docs/decisions/0292-…` there), which moves that runtime's state into a pure core, and a reading of it by Fable 5.2
for this library.

## Context

The run (`engine.ts`), `simulate` and `rehearse` apply the same semantics, written three times:

- a message is dropped when its start is gone, ignored when `update` rejects it, applied otherwise, with a new
  revision only when the state changes;
- the keys of a new state are compared with those before (`reconcile` in `engine.ts`, `listen` in `rehearse.ts` and
  in `simulate.ts`): a new key starts, a kept key stays, a gone key stops, all the gone ones before any start;
- from the first defect on, nothing of the program is called (`alive`);
- the commands of a step, and the events, follow the step (`appendStep`).

AGENTS.md says that the testing tools behave like the engine where it is deterministic. Today that is a discipline,
checked after the fact by `src/testing/contract.test.ts`, and the copies have already drifted once: `simulate` compares
the keys of a state with those before in both directions without diffing them, and a mutation of `mutations.ts`
exists only to keep that copy in step. The deterministic part is exactly what a core is: the run, `simulate` and
`rehearse` are three shells over it, one with fibers and scopes, one synchronous, one where the test is the
scheduler. The library teaches the same split to its users: `update` is a pure core, and `runCommand` its shell.

What a core does not reach is said too. A defect of a release is recorded only once the scope's close ends
(`scopedIn`), and no core learns of a death before the shell does: that window is the README's to define (ROADMAP,
"The run starts a command after a subscription's release has died"), not this note's.

## Decision

- **One module, `src/core.ts`, holds the semantics of a step.** It imports no effectful module of Effect (`Effect`,
  `Fiber`, `Scope`, `Queue`, `Deferred`): only data (`HashMap`, `Option`, `Equal`). It is internal, as `engine.ts` is.
- **Its state** is the program's state and revision, and the keys listened to, each with its start, and the starts
  (`Active`, today in `engine.ts`), and the count of starts. The register of deaths is a value of its own, written as
  each fiber ends, by whichever fiber ends, never by a step: a transition reads whether the run has died as one of its
  inputs, in the thunk it runs in.
- **A transition calls at most one function of the program, and runs in that function's site.** `arrive` calls
  `update` and runs under `diesIn('update')`; `reconcile` calls `subscriptions` and compares the keys, so it runs
  under `diesIn('subscriptions')`, where AGENTS.md wants every comparison of keys. So the defects keep their sites,
  and the shell's `Effect.sync` around a transition is the one thunk that holds a check and its act.
- **A transition returns data, which the shell performs.** `arrive` returns one of `Dropped`, `Dead`, `Ignored` (with
  the origin and the state) or `Applied` (the state before and after, the revision, the commands and the events);
  `reconcile` returns the starts that stop and those that start, each with its key, its subscription and its
  generation, and the new `Active`. The order the shell performs them in is part of the core's contract and is
  written beside it: observers, then the frame, then the stops together and awaited, then the starts, then the
  commands.
- **The start of a program is a transition too.** `init` calls `startOf(init, flags)` under `diesIn('init')`, and
  is followed by the first `reconcile`: the subscriptions of the first state start before its commands, one rule
  where `run.ts` and `rehearse` each start on their own today.
- **So is the model of a state.** `model` calls `makeModel` under `diesIn('render')`, unless the run has died, as
  `arrive` calls `update`. `rehearse` checks this today (`modelOf`) and the run does not: its renderer makes the
  model lazily (`lazyFrame` in `run.ts`), with no check. The renderer's frames make their model through it, which
  also answers the ROADMAP's "the renderer may start after the first defect" for what it calls of the program. The
  README promises the check only of `update` and `runCommand`: it says it of `makeModel` too, or says that it does
  not hold there, before this step is taken.
- **The end of a subscription is an event of the core.** `ended` takes the start that sent its last message: its key
  stays among the active ones, and does not start again until it goes away and comes back. The engine keeps this
  today by keeping nothing, `rehearse` by its `ended` of each start, which `hear` and `hearNext` fail on. In the core
  the rule is stated once, and its tests draw ends among the arrivals.
- **What a fiber dies of is computed by pure functions over `Cause`.** The bodies of `diesIn` (each defect wrapped
  in a `ProgramDefect` with its site and annotations, a self-interruption or a failure the types rule out turned
  into a defect, in the place it happened) and the bookkeeping of `makeDeaths` (each defect kept once, by its
  identity, in the order the fibers died, and reported once) are functions of data: `Cause` is a module of data, as
  `HashMap` is. They move to the core, and are tested on causes built by hand; the shell keeps `catchCause`,
  `onExit` and the `Deferred` of `died`.
- **What differs between the shells is policy, and stays in them.** When commands run (at once in the run, in order
  in `simulate`, when the test says in `rehearse`), when a subscription runs (at once, never, at `hearNext`), what a
  rejection means (ignored, or a failure of the test for a message the test sends), the observers and the frames
  (the run's only). `rehearse` keys what it keeps of a start by its generation, as the run keeps its fibers, rather
  than by its key.
- **`rehearse`'s own bookkeeping is a pure module of its own**, after the shared core: `pending`, the commands under
  way and those cancelled, and for each start `opened`, `scripted`, `gone`, `waiting`, `asked`, `ended`, all written
  today by several fibers across yields. Its transitions (a step applied, a command taken, answered or interrupted, a
  message asked for or heard, a key gone) run in one thunk each. `runAll`'s check and take become one transition,
  "take the oldest pending command or finish", which fixes the ROADMAP's "`rehearse`'s `runAll` dies on a command
  another call took" by its form.
- **The core is tested on its own, by orders of its events.** fast-check draws histories of arrivals (from the view,
  commands, and subscriptions of starts current or gone), listings and deaths, and checks the rules after each:
  a message of a gone start never reaches `update`, nothing of the program is called once dead, a kept key keeps its
  start, a key that comes back gets a new one, every gone start stops before any start. These tests are a kind of
  their own in AGENTS.md's list, beside "invariants under random histories", which stays for the shells.
- **`contract.test.ts` stays**, as the check of the shells: what each does with the core's decisions.

## Plan

Each step leaves `bun run typecheck`, `bun run lint`, `bun run test` and `bun run mutations` green, and is a commit.

0. `interleaving.test.ts` leaves `bun run test` ahead of step 7, for a script of its own and a scheduled job of the
   CI, so that no step meets a suite that fails on a seed drawn at random. No mutation names it among its killers.
   Done: `bun run interleavings`, and `.github/workflows/interleavings.yml` every day.

1. `src/core.ts` with the functions over `Cause` of `diesIn` and `makeDeaths`, tested on causes built by hand. It
   touches no shell's logic, only where the functions are: the most isolated step, which settles the module. Done:
   `otherwiseDefect`, `wrapDefects` and the `Register` of deaths, with `record` and `report`, in `src/core.test.ts`.
2. `reconcile` and its tests; `simulate` on it (the smallest shell, already a fold). The mutation "simulate compares
   the keys of a state with none of the state before" goes, replaced by one of the core's. Done: `reconcile` takes the
   listing rather than `subscriptions`, which the shell calls in the same thunk, under `diesIn('subscriptions')`, so
   that its tests build listings by hand; `Active` holds the count of starts. The core's mutations are "a kept key
   starts again" and "a gone key keeps running"; `simulate`'s stays, as "simulate reconciles the keys of a state with
   none of the state before", since what it takes out is the shell's: which `Active` it reconciles against.
3. `init`, `arrive`, with the check of the register (`alive` moves into it), and `ended`; the engine on them. The
   engine's mutations of `alive`, of the generation and of the order of stops and starts point at the core, each with
   a deterministic test of the core among its killers. Done, but for three points. `init` takes the first step, which
   is data: making it from the flags (`startOf`) stays the shells', in their thunk under `diesIn('init')`, since
   `compose` makes a child's with it too. `ended` moves to step 4: the engine keeps nothing of an end, and a set of
   ended starts that only `rehearse` reads would be state the engine writes for nobody. The order of stops and starts
   is the shell's, which awaits the stops before it forks the starts, so its mutations stay on `engine.ts`; those of
   the check of the register, of the generation and of a new revision point at `arrive`, each with a test of the core
   among its killers. `applyAlive` stays for `rehearse` until step 4, with a mutation of its own. `Ignored` and
   `Applied` carry only what the core decides: the origin and the state before are the shell's, which has them.
4. `rehearse` on the core, its starts kept by generation, its `ended` the core's, which `Active` holds.
5. `rehearse`'s own bookkeeping as a pure module, and `runAll` fixed by it, with a changelog entry.
6. `model`, once the README says whether the check holds of `makeModel`: the renderer's frames and `rehearse`'s
   `model` make it through the core, with a changelog entry if the run's behaviour changes.
7. The testing policy of decision 0292: a test under `prioritizedSchedules` goes once a deterministic test kills its
   mutation; `interleaving.test.ts` leaves `bun run test` for a search job of the CI, on a schedule, from a random
   seed, and an order it finds is fixed by a test of the core, a gate (program code held by a `Deferred`) or a
   primitive. AGENTS.md's rule "one thunk" becomes "a transition of the core, or a gate where program code lies
   between".

No step changes what a consumer sees: the README stays as it is, and so does the API. A step that turns out to need
a change of either stops and asks.

## What it rests on

- That a function of JavaScript runs to its end before any other code, and `Effect.sync` evaluates its function
  synchronously: **documented**, by ECMAScript and by the JSDoc of `Effect.sync` at 4.1.4.
- That `HashMap` compares keys with `Equal` and calls them only within the call it is given them in: **already
  listed** under "What the invariants rest on", with its tests, which move with `reconcile`.
- That `Cause` is a module of data, whose `fromReasons`, `reasons`, `annotate` and `reasonAnnotations` run nothing:
  **documented**, read in step 1: the module is `@stability stable` at 4.1.4, its JSDoc calls it the data types of a
  cause and helpers that build and check them, and `fromReasons` and `annotate` return a new `Cause`.
- That every rule of the three copies today is one of the core's, and each difference between the shells is policy:
  **open**. Steps 2 and 4 check it, by the tests of `contract.test.ts` that must stay green unchanged.
- That the core's tests kill the mutations the scheduled tests kill today: **open**, checked step by step in 3 and 7.

## Alternatives

- **The guard alone, and the testing policy** (the first reading of 0292 for this library). It fixes the bugs of
  today and leaves the three copies, kept in step by a test.
- **A core for `rehearse` alone.** It fixes `runAll`, and leaves the engine's semantics in two places.
- **The register of deaths as part of the step's state**, written by a `Died` transition. Deaths are recorded by
  every fiber as it ends, the loop's included, while a step is under way: one state for both would make every end a
  write of the step's state from another fiber, the form the core is meant to remove. Kept apart, the register is
  data written by its own pure functions, and a step only reads it.

## Open questions

- Whether the README's "from the defect on, the run calls neither `update` nor `runCommand`" grows to `makeModel`
  (step 6), and what the run then gives a renderer that reads a model after a death.

- The module's name, and whether `rehearse`'s bookkeeping lies in it or in `src/testing/`.
- Whether `drive`, which runs the run itself, needs anything of it: likely not.
- How AGENTS.md's sentence "the testing tools behave like the engine" is said once the core holds it by its form.
