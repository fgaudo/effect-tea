# What each premise holds, and the peer range of Effect

**Status:** sorted on 23 November 2026 by a session of Fable 5.2, for step 8 of [`ROADMAP.md`](../../ROADMAP.md). The
owner decided the same day ("Decided"): the two finest guarantees are described, which is done, and the range stays a
tilde, against the advice. It answers part 6 of [`architecture-review.md`](architecture-review.md). Reasoned, not run:
no premise was taken away to see what fails. Last read against the code at `476d754`. The owner undid the range on 26
November 2026 ("Since"): the sort below is of the premises of 23 November.

## In short

Of the 37 premises of [`premises.md`](../premises.md), 12 hold a guarantee of the guide's "What you can rely on", 6
only the where or the order of a defect, 9 only a testing tool or a test, 1 the scheduler of the tests, 4 what the
guide describes and does not promise, and 5 a bridge on its renderer.

No premise holds the state, the order of the messages, a parent's children, an input or a model: six of the nine
guarantees rest on none. What the premises hold is the effects and the end of a run, as the review read it: that a
defect is in the cause, that a stop by the run is no defect and an interruption by the program is one, that nothing
outlives the run, and that a span keeps no log.

## How it was sorted

Read whole: `premises.md`, `src/engine.ts`, `src/shell.ts`, `src/core.ts`, `startWith` in `src/run.ts`, the guide's
"Guarantees", and "When a defect happens" and "Precisely" in "Running". The testing tools were read only at the lines
that the premises name.

What fails without a premise is what `premises.md` says of it: its own test, and the tests of the library that it
lists. Where the sort says more than that text, it says "read in the code". A premise in two halves that fall apart is
sorted by each half, and counted once, under the half that holds more.

## The count that the step asked to check

The roadmap counted by names, and asked for a reading. There are 37 premises, and 5 are of a renderer. 16 name
`rehearse`, not 17. One names `rehearse` alone: the use of `Effect.acquireUseRelease`. That of `Channel.toPull` does
not, though the roadmap gave it as the example: its first half is `runSubscription` in `shell.ts`, which the run uses.
That of `Fiber.await` names `simulate` and `rehearse`, and no run.

So steps 18 and 19 change little here. The form of [`one-engine.md`](one-engine.md) adds no premise. Step 19 may drop
the premise of `Effect.acquireUseRelease`, and the clauses of others that name what `rehearse` does by itself today
(a `FiberMap` of its own, a command forked in the acquisition of its `run`). None of the 12 that hold a guarantee
names `rehearse` alone. The step stays before step 18.

## The sort

Each premise is named by the start of its title in `premises.md`.

### A guarantee of "What you can rely on" (12)

**Every run, or every stop.** A fall of one of these fails most of the suite, and a consumer's first run shows it.

- **A fiber forked with `FiberSet.run` or `FiberMap.run` is no child.** As a child, a command or a subscription would
  be interrupted by Effect as the fiber of effects ends, with no mark of the run's: every run that ends with one under
  way would die of "interrupted by the program". Read in the code (`rootedIn`). "Nothing ends in silence": only the
  run, and whoever runs it, interrupt them.
- **A fiber forked where nothing interrupts is interruptible all the same.** The fiber of effects is forked where
  nothing interrupts (`effects` in `engine.ts`): were it not interruptible, the end would wait for it for ever. Read in
  the code. "Nothing outlives what acquired it": the end of a run.
- **A scope runs its finalizers in the reverse order.** In the order they were added, the sets would close before the
  end stops their fibers, as the fiber -1 and with no mark: the same false defect as above. Effect's own combinators
  fail with it too.
- **A fiber interrupted while interruptible runs no failure handler.** "A run interrupted by whoever runs it is no
  defect" fails without it. "Nothing ends in silence", as above.
- **`Effect.interruptible`, entered by an interrupted fiber, fails with exactly those it received** (the second half
  of its premise), and **`Fiber.interruptAs` carries its annotations.** Without either, `diesIn` finds no interruption
  of the run's: every subscription that the run stops, its key gone, would die. Read in the code (`dying`,
  `Core.byTheRun`). "Subscriptions follow their keys", and "Nothing ends in silence".

**One guarantee, whole.**

- **An external span keeps no event.** "Logs do not pile up in a span" is this premise.

**One case of a guarantee.** Each has a test of its own, which is what tells that it fell.

- **`Scope.close` dies with every defect its finalizers die of** (its first half). A defect of what a command or a
  subscription releases would be lost. "Nothing ends in silence".
- **A thunk of `Effect.suspend` that throws makes the effect die.** A `runCommand` or a `listen` that throws before it
  returns. "Nothing ends in silence": that the run dies of it. Where it is recorded is described ("Running").
- **`Effect.onExit` runs its cleanup where nothing interrupts.** A fiber interrupted as it records what it died of
  would lose it: a subscription that dies as the run stops it. Effect's own combinators fail with it too. "Nothing ends
  in silence".
- **`FiberSet.run` and `FiberMap.run` fork a fiber and add it in one step.** A command or a subscription forked as
  the end interrupts the fiber of effects would not be among those the end stops. "Nothing outlives what acquired it".
- **Code that a fiber runs on the stack of the fiber that forks it sees the forked fiber as its own.** A command that
  interrupts the fiber it reads from `Fiber.getCurrent`, before it first waits, would stop the fiber of effects, in
  silence. "Nothing ends in silence".

**The two finest**, which the review would move to "described, not promised".

- **A fiber that fails as it is interrupted keeps its own reasons and gets those it received added** (its first
  half). A command or a subscription that interrupts itself as the run stops it, as in a release, is a defect.
- **None merged by `Equal`** (the second half of that of `Scope.close`). Two releases that die of defects equal by
  `Equal` are two defects in the cause.

### Only the where or the order of a defect (6)

- **`HashMap` calls a key's `Equal` and `Hash` only within the call.** A defect of a key's `Equal` is in
  `'subscriptions'`, of the step that compared it ("Running", the table of `where`).
- **A fiber forked with `FiberSet.run` or `FiberMap.run` runs on the stack of the fiber that runs it.** The order of
  the defects as a run starts or ends, and that `runCommand` is called where the job decided it, which the guide
  describes.
- **A fiber of a `FiberSet` or a `FiberMap` that dies leaves the other fibers running.** What is in the cause of a
  run that dies, beside what it died of. Read in the code.
- **What the cleanup of `Effect.onExit` fails with comes after the cause of the effect.** The order of the defects,
  which is described already.
- **Effect calls each `Logger` synchronously, in the fiber that logs.** A defect of a `Logger` is in the place the
  program logs from ("Running").
- **`Channel.toPull` keeps what a channel adds to the scope it is given.** When the death of a subscription counts,
  before or after what its channel releases ("Running", "Precisely").

### Only what a testing tool does, or a test (9)

- `simulate`: **a fiber forked with `startImmediately`**, with tests of the tools.
- `drive`: **`Effect.raceFirst` waits for the effect it interrupts**, **`Effect.timeoutOption` measures with the
  `Clock` of its context**, and **the default value of `Clock.Clock`**.
- `drive` and `rehearse`: **`Effect.raceFirst` runs each side interruptible**.
- `rehearse`: **the use of `Effect.acquireUseRelease` can be interrupted**.
- `simulate` and `rehearse`: **interrupting `Fiber.await` leaves the awaited fiber running**.
- Killers of mutations alone: **a fiber that waits on a `Deferred` runs on the stack of whoever completes it**.
- A test of the engine alone: **`Effect.scoped` fails with what a finalizer of its scope dies of**.

### Only the scheduler of the tests (1)

- **Every fiber of a run asks the `Scheduler` it is given.**

### What the guide describes, and does not promise (4)

A class that the step did not name. "What is left to you" promises nothing, and neither does a "Precisely".

- "What is done does not pile up": **a collection reclaims what nobody holds** (of the JavaScript engine, not of
  Effect), **a `Queue` keeps nothing of a value taken from it**, and **Effect keeps nothing of a fiber that has
  ended**.
- "Subscriptions", "Precisely", and two examples: **`Stream.callback` closes the scope it gives its callback**.

### A bridge, on its renderer (5)

The two of snabbdom and the three of React. Their range is a caret already, decided on 20 November 2026
([`adoption.md`](adoption.md)), with a daily job of its own. They are outside this step.

## What the sort shows

- **A premise that falls takes no state with it.** At worst a run ends with a defect that is false, lost or in
  another place, something outlives a run in a narrow race, or a span keeps its logs. A program's states, and what
  its `update` saw, are the same.
- **The broad ones cannot fall unseen.** Six premises fail most of the suite. The others each have a test of their
  own, which the daily job (`.github/workflows/effect-latest.yml`) already runs at a later minor, with ten runs of the
  search.
- **What no test tells is a premise that nobody named.** The tilde answers it only by what an upgrade does: the
  reading of what Effect changed (`upgrade-effect`), and the search. Both can be done under a caret too.
- **Effect's own packages name `effect` with a caret**: `@effect/platform-bun` 4.1.4 has `effect: ^4.1.4` as its peer
  (read in `node_modules`). They share Effect's version. So an application that takes one of them at a later minor has
  Effect at that minor, which the tilde refuses: it holds back the application's Effect, not this library alone.

## The guarantees that rest on a premise

| Guarantee                                            | Its premises                          | Advised   |
| ---------------------------------------------------- | ------------------------------------- | --------- |
| Subscriptions follow their keys                      | two, by a fall that fails the suite   | kept      |
| Nothing outlives what acquired it                    | one broad, one of a narrow race       | kept      |
| Logs do not pile up in a span                        | one, which is the guarantee           | kept      |
| Nothing ends in silence: a defect ends the run       | three, each a case                    | kept      |
| Nothing ends in silence: only the run interrupts     | five broad, one of `Fiber.getCurrent` | kept      |
| … a self-interruption as the run stops the fiber     | one half                              | described |
| "Every defect is in the cause": two equal by `Equal` | one half                              | described |

The two advised as described are no promise by the rule of `AGENTS.md`: no user would write another program if one
were false. The code, the tests, the mutations and the search keep them as they are. The guide would say them where it
says the order of the defects ("Running", "The defects in the cause"), as how the run is made today. It narrows two
sentences: "A command or a subscription that the program interrupts is a defect too" and "Every defect is in the
cause". The owner kept the first whole on 13 and 19 November 2026 (`rejected.md`), against two designs that dropped
its check. This one drops no check: it changes what the library owes if Effect changes under it.

## The range

**Its history.** `^4.1.4` since 12 November 2026 (`a7cb3df`). A range that stops at the minors tested was rejected on
15 November (`c7becaf`), for the caret and the daily job. The tilde was taken on 17 November (`fa55459`), with the job
of the later minor (`1173ddf`). The owner decided on 20 November that the library is for others to adopt.

**A caret, `^4.1.4`** (advised). The rule of `AGENTS.md` goes back to "the peer range starts at the Effect the library
is developed with", and an upgrade still raises both. With it:

- The daily job is the alarm, at the newest Effect the range accepts, the search included when that is a new minor.
- **A premise that falls at a version the range accepts is answered by a patch release that leaves that version out
  of the range**, and then by one that holds on it, or that raises the minimum. So whoever installs or updates after
  it is told of a known break, and the library never keeps code for two minors. This said more at first, that a known
  break is never installed in silence, which is false of a version already published ("Decided").
- A green minor is still a lead for an upgrade, for the reading that finds what nobody named. Nothing waits for it.

What it costs: between the day a minor of Effect is published and the release that answers a fall, a consumer on that
minor runs what no test has run. By the sort, what such a consumer risks is the end of a run and its defects.

**The tilde, as today.** No consumer runs a minor that the tests have not run, and the library is read at one version.
What it costs: each minor of Effect needs a release of the library, also a minor that changes nothing, and until then
an application cannot raise its Effect.

**Not proposed again:** a range that keeps the old minimum and is widened on each green run. It would be checked at
both ends, which `a7cb3df` removed.

## For the owner

1. **The range**: the caret with the rule for a fall (advised), or the tilde.
2. **The two finest guarantees**: described, not promised (advised), or kept as promises.

## Decided

By the owner, on 23 November 2026:

- **The two finest guarantees are described, not promised**, as advised. Done the same day: the guide says them in
  "Running", "The defects in the cause", and names them where it promises the rest ("Guarantees", "Nothing ends in
  silence", and "Running", "When a defect happens"); `invariants.md`, `premises.md` and the changelog say so. No code,
  test or mutation changed.
- **The range stays a tilde**, against the advice. The owner's reason: under a caret, a premise that falls between two
  minors leaves a package that is broken and that people can install all the same. The advice had no answer to it. A
  version published keeps its range, so the patch that leaves a version of Effect out reaches only whoever installs or
  updates after it, and `npm deprecate` warns and stops nothing. The caret is in [`rejected.md`](../rejected.md).
- **The same holds of a patch inside the tilde**, which is why what to do then is written down, in
  [`upgrade-effect`](../../.agents/skills/upgrade-effect/SKILL.md), "A premise that falls inside the range".
- **Guards against each premise were asked about, and advised against**: a guard holds only a premise that is named,
  which a test holds already, and no test fails when a guard goes, as `premises.md` says where it forbids them. The
  owner took three steps instead, 45 to 47 of [`ROADMAP.md`](../../ROADMAP.md): an alarm before a version of Effect is
  released, the guarantee that six of the twelve premises keep weighed again with a spike, and requests to Effect to
  document what is left.

## Since

On 26 November 2026 the owner undid the range: it is a caret, `^4.1.6`. What was new since "Decided":

- **Effect will not document what was left.** Its answers (Effect-TS/effect#10683, Effect-TS/effect#10878) declined
  some rules, and left out what follows from the shape of an API. So [`premises.md`](../premises.md) sorts the premises
  on Effect in two kinds: by the model, whose fall would be a bug of Effect's, and open, which Effect may change.
- **The tilde kept no broken Effect out**, since a patch may change what a minor may ("Decided", its third point), and
  it asked for a release of the library at each minor of Effect.
- **One promise rests on an open premise still.** Two more did, and were narrowed as the two finest were: an `Equal`
  or a `Hash` of the program that throws is left to the program, and of several releases of one command or one
  subscription that die, the guide promises that the run dies, not which defects are in the cause. No code, test or
  mutation changed. The one left is what `Effect.interruptible` fails with, which holds "Only the run, and whoever
  runs it, interrupt them": step 106 of [`ROADMAP.md`](../../ROADMAP.md) weighs a design without it. The tilde is in
  [`rejected.md`](../rejected.md).
- **That one went the same day, in step 106.** The mark of a stop names the fiber it stops, so the engine reads a
  stop from the cause alone and asks Effect nothing of what a fiber received: no promise rests on an open premise, and
  [`premises.md`](../premises.md) names no exception. The question stays there as a premise of tests alone, whose gates
  still ask it. "The sort" above is of the premises of 23 November, and still lists it as the engine's.
