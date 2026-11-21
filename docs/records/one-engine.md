# One engine under the run and the testing tools: the spike

**Status:** spiked, 21 November 2026, by a session of Fable 5.2, on the branch `spike/one-engine`, cut from `dce7ea0`,
never to be merged: `de4b7d7` is `rehearse` over the engine, and `c50bee1` is `Shape` out of the API. Taken by the
owner the same day ("Decided", at the end), to be done in steps 17 to 21 of [`ROADMAP.md`](../../ROADMAP.md). It
answers what was step 7 there, and part 5 of [`architecture-review.md`](architecture-review.md), which says why the
second engine is in doubt. Last read against the code at `dce7ea0`.

## In short

`rehearse` runs on the engine itself, and no test changes. The form is not the one the review proposed. The engine is
not made generic in what performs a job: it is given what the fiber of a command runs and what the fiber of a
subscription runs, and it keeps everything else. The rehearsal gives it a command that waits until a `run` takes it,
and a subscription that waits until a `hearNext` asks it.

The code does not get shorter. What changes is where the checks are: 22 of the 60 mutations of `rehearse.ts` take out
a check that the engine now makes alone, and `loop.ts` goes. The review's count, "a second engine as long as the first",
overstated what is written twice: most of `rehearse.ts` is what the test decides, which the engine does not have.

`Shape` can leave the API, apart from all this: the cause that `rejected.md` did not find is found.

## The form

Three things of the engine were open to a tool, and the review chose the first.

- **What performs a job** (the review's form): one performer for the run, one for `rehearse`, one for `simulate`. Each
  would write the order of a job again (the stops awaited together, then the starts, then the commands), and keep its
  own fibers, roots, records and end. Reasoned, not spiked: reading `engine.ts` and `rehearse.ts` side by side showed
  that this order, and the fibers, are what the two files repeat.
- **What a fiber of the program runs** (spiked): the engine starts a fiber for each command and for each start of a
  key, in the job of their step, as today. It asks the tool what that fiber runs. The run's answer is today's code:
  `runCommand` in a scope of its own, then its answer sent; the subscription in a scope of its own, each message sent.
- **The pure half of a step alone** (point 4 of the seven, `ROADMAP.md`): one transition of `core.ts` for `applyOne`
  and for `rehearse`'s `apply`. Reasoned, not spiked. It saves some 25 lines in each file and the mutations of the
  sites of `update` and `subscriptions`, twice. It needs a transition that calls two functions of the program and says
  where one threw, against "a transition calls at most one function of the program"
  ([`shared-core.md`](shared-core.md)). The spiked form makes it moot: there is one thunk.

The spiked form follows a rule the engine already has: "a function of the program is called where the call is
decided" ([`invariants.md`](../invariants.md), "one thunk"). The tool's function is called by the job, where the fiber
is forked, and what it does as it is called is part of the job. What it returns is what the fiber runs.

- **A command's**: as it is called, the command is pending, and it gets a `Deferred`. Its fiber waits on it. `run`
  takes the command, calls `runCommand` in its own thunk, as today, and gives the effect to the fiber. The fiber runs
  it in a scope of its own and applies its answer, as `answering` does today.
- **A subscription's**: as it is called, the start has begun, which `hear` waits for. Its fiber waits for the first
  ask of a `hearNext`, then runs the subscription as `listen` does today. Its messages are applied by the rehearsal, in
  the thunk that finds a call waiting, never by the engine's `send`: "a subscription's message applied as it is sent"
  stays rejected ([`rehearse-owned-effects.md`](rehearse-owned-effects.md)).

## What the engine gets

All internal, none exported, some 60 lines. The run uses none of them but through their defaults.

| Addition                            | What it is                                                              |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `listening`, `answering` (config)   | what a subscription's fiber and a command's fiber run, inside the root  |
| `stepped` (config)                  | told in the thunk: what a message came to, its events, the keys changed |
| `released` (config)                 | told in the job, once its stops have ended                              |
| `after(done)`                       | a job that only tells: `done` is called once the jobs before it are     |
| `send(message, source)`, `active()` | apply a message as a subscription's or a command's; the current keys    |
| `end()`, `ended()`                  | mark the end by plain code, and read it: `stop` already marks it        |

`after` is `rehearse`'s `done` of a job and its `finish` at once: a call returns once the jobs offered so far are done,
and a scenario that returned lets them finish. So the engine keeps its rule that a step that stops, starts and commands
nothing makes no job, and a call of `rehearse` still waits behind the jobs before it.

## What the spike shows

On `de4b7d7`, with `engine.ts` and `rehearse.ts` changed and no other file:

- **No test changed.** `bun run test`: 995 pass. `bun run test:node`: 769 pass. `bun run interleavings`: 21 pass.
  `tsc`: clean. `contract.test.ts` (130 tests) passes as it is, which step 7 names as the proof, and so does
  `rehearse.test.ts` (89 tests), with its three tests under the scheduler of the tests, a thousand schedules each.
- **Size.** Lines of code, blank lines and comments left out: `engine.ts` 300 to 360, `rehearse.ts` 532 to 575, and
  `loop.ts` (56) is no longer used. Some 50 lines more in all.
- **The mutations.** Of the 60 of `rehearse.ts`, 17 still find their text. Of the other 43:
  - 22 take out a check the rehearsal no longer makes: the sites of `update`, `subscriptions` and a later model in the
    thunk, the step that stops at a defect, the check of the register before `update`, the roots and the records of a
    command and of a subscription, the stops of a job (marked, together, awaited), the commands owed after them, and the
    end that stops every fiber at once.
  - 21 are still the rehearsal's own, on code rewritten: what a call checks before it runs a command or asks a
    subscription, how an interrupted `run` stops its command, what `hear` waits for, and the two ways a scenario ends.
- **The checks moved are held once.** For 15 of those 22, the mutation of `engine.ts` or of `shell.ts` that takes
  the same check out was applied to the spike, and the tests that killed the rehearsal's mutation were run alone. 14
  fail. The fifteenth, "the step goes
  on past a defect of subscriptions", survives by its form: without its early return the engine throws before it makes
  any job, so the test, that no command is owed, holds either way.

## Where the rules pulled apart

The first run of the spike passed 129 of the 130 tests of the contract and 84 of 89 of `rehearse.test.ts`. Each
failure was a rule of `rehearse` that the engine's form had dropped. Each came back with what the engine already had.

- **A start whose key goes away before it begins.** Whether a start has begun was read from its hearing, which the
  thunk forgets as the key goes. Kept apart, by its start.
- **The end interrupts the calls that wait before it waits for the releases.** The engine's end stops the fiber of
  effects, then every fiber, and waits. A call that waits for a job the end interrupted may hold what a release waits
  for. The rehearsal calls `stop`, interrupts its calls, then closes the scope: `stop` was already apart, for `run.ts`.
- **Every `hearNext` is a job** (E7 of [`synchronous-dispatch.md`](synchronous-dispatch.md)). The spike first asked a
  running start at the call, and a call that left before its job had started its subscription. With `after`, the ask is
  a job again.
- **What a fiber does first is not done when it is forked.** A command was pending, and a start begun, in the first
  step of its fiber. Under the scheduler of the tests that step may run later, and a `run` found nothing pending. Both
  moved to the function the job calls. So the form adds no premise: it rests on `FiberSet.run` and `FiberMap.run`
  only as the engine does today.
- **A `Queue` resumes its taker by the scheduler of whoever made it.** The asks of a start were a queue made by plain
  code, with `Effect.runSync`. They are a `Deferred` now, which plain code makes.

## What the spike does not show

- **A design.** It keeps in mutable maps what the ledger would hold as data: the fiber of each pending command, the
  asks of each start, and whether a start has begun. It reads what the thunk told through two variables. It has casts.
- **`bun run mutations`**, which refuses a list whose texts are gone, and `bun run lint`.
- **What a message costs.** `stepped` is a call or two more in the thunk, for every program. Not measured.
- **`simulate` and `drive`**, which it does not touch.
- **Three things read, not run.**
  - A rehearsal's register keeps only a `ProgramDefect`. So what the engine's `catch` records with no site, as a
    message whose tag throws while a defect is being said, is dropped, where today the call dies of it.
  - A command's fiber is found by `Effect.fiber`, in its first step. A `run` interrupted before that step waits for it.
    The spike interrupts that wait at the end. The engine could hand the fiber to the tool as it forks it.
  - The engine's end reports its defects as its scope closes, and the rehearsal reads the register itself: the spike
    drops what the close dies with.

## `simulate`

Not spiked. It is a fold of some 110 lines in the caller's fiber, over `Core.arrive` and `Core.reconcile`, with 14
mutations. Over the engine it would be the rehearsal's command that waits, run oldest first after each message: a
rehearsal that hears nothing. It would cost a fiber of effects and a scope for each simulation, where a property may
run thousands. Whether it earns its place is another question: three examples and the guide's "Testing tools" use it,
for a flow where the test decides no order. The advice is to keep it, and to weigh its form once `rehearse` is done.

## `Shape` out of the API

Apart from the engine, and spiked on `c50bee1`. `rejected.md` has "`run`, `drive` and `rehearse` taking
`Program<{ … }>` by name, and `Shape` out of the API", which failed on `rehearse` alone, for a cause not found. The
cause is the one that `Commanded` was since written for (`rehearse.ts`): a program without commands gives `Command` and
`RC` nothing to be inferred from, and the scenario's errors and services are then unknown.

- With `Commanded`, `rehearse` takes `P & Program<{ … }>` and the typecheck is clean. Without it, the same form gives
  71 errors in `rehearse.test.ts` and `contract.test.ts`.
- `start`, `drive`, `Host` and `HostProps` take `Program<{ … }>` too, and `Shape` leaves `src/index.ts`. The typecheck
  of the library, the examples and the bridges is clean, `bun run test` passes (995), and `bun run smoke` passes with
  TypeScript 5.9.3, 6.0.3 and 7.0.2, under `nodenext` and `bundler`, the bridges included.
- **What it costs.** The state of each is constrained, `State extends object`, since `Program` asks for it. A function
  generic in the state that calls one of them needs the constraint: one helper of `bridges/react.test.ts` did.
- **Why now.** `v0.7.1` does not export `Shape`: 0.8.0 would be its first release. Taken out after, it is a breaking
  change of an export that one release had.
- **The matrix of inference** finds no lead: `bun run inference`, with its default options, 27,129 cases, with
  TypeScript 5.9.3, 6.0.3 and 7.0.2.

## The plan

For the spiked form. Each stage is a step of `ROADMAP.md`, 17 to 21 in this order, and leaves `bun run typecheck`,
`lint`, `test`, `test:node`, `interleavings` and `mutations` green. The skill is
[`change-engine`](../../.agents/skills/change-engine/SKILL.md). None but the first changes what a user writes.

1. **`Shape` out of the API.** Opus 5.5, `medium`. Before the tag of 0.8.0, and independent of the rest. The four
   signatures by name, the entry of the changelog that lists the types exported, the entry of `rejected.md` removed,
   `bun run inference` and `bun run smoke`. The skill is [`change-api`](../../.agents/skills/change-api/SKILL.md).
2. **The engine's seams, with the run as their only user.** Opus 5.5, `high`. After the tag. The additions of the table
   above, each with a test of `engine.test.ts` and a mutation: where `stepped` and `released` are told, that `done` is
   called after the commands of its job, that `after` offers as the outermost call returns. `stepped` measured with
   `tools/bench/writes.ts`. `invariants.md` says what each is, and that only the testing tools give them.
3. **`rehearse` over the engine.** Opus 5.5, `high`. Depends on stage 2. The ledger holds what the spike keeps in maps,
   each as a transition with a test of `ledger.test.ts`. `loop.ts` and its test go. The 22 mutations go, and their
   killers are named by the engine's mutations where they add one. The 21, and the 6 of `loop.ts`, are written on the
   new text. The three things read above are decided there. `invariants.md` ("The testing tools behave like the
   engine") and `premises.md` say what is left by hand. Done when `contract.test.ts` and `rehearse.test.ts` pass as
   they are.
4. **A review of the premises**, of the engine and of `rehearse`, by a reviewer that wrote neither
   ([`premise-review`](../../.agents/skills/premise-review/SKILL.md)). Before the release that follows.
5. **`simulate`**, weighed again: as it is, or over the engine. Fable 5.2, `high`, to decide. Then step 8.

## For the owner

- **The form**: what a fiber runs (advised), what performs a job, the one transition, or none. Advised, though the
  code gets no shorter: the thunk, the queue of the jobs, their order, the fibers and the end are then one piece of
  code, and a change of the engine is a change of `rehearse` with nothing to keep in step. The stage that wrote that
  half again by hand, E7, added 59 mutations. Against it: the engine gets a second user, and seams that the run does
  not need.
- **When**: after 0.8.0 (advised). It changes nothing a user writes. Before it, it would undo the review of the
  premises just made of the engine and of the testing tools, and the release has 23 breaking entries already.
- **`Shape`**: out before the tag (advised), by stage 1.
- **`simulate`**: kept (advised), its form weighed at stage 5.
- **Point 4 of the seven**: answered by the form, or weighed alone if the form is refused.

## Decided

By the owner, on 21 November 2026, as advised: the spiked form, after 0.8.0; `Shape` out of the API before its tag;
`simulate` kept, its form weighed once `rehearse` is done. The two other forms are in
[`rejected.md`](../rejected.md), under "The engine and its guarantees".

## The mutations of `rehearse.ts`, by what becomes of them

Of the 60 of `tools/mutations/mutations.ts` at `dce7ea0`, by their names. The 17 that neither list names find their
text in the spike as it is.

**The engine makes the check alone** (22). Those marked were tried with the engine's own mutation, and the first
killer of each failed, but for the one the record names:

- rehearse gives what the root of a command dies of only to the run that awaits it
- rehearse takes no interruption a command gets once its scope has closed for a defect (tried)
- rehearse takes no interruption a subscription gets once its scope has closed for a defect (tried)
- rehearse does not record what the root of a subscription dies of (tried)
- the thunk of rehearse records a defect of update in subscriptions (tried)
- the thunk of rehearse records a defect of update without its message (tried)
- the thunk of rehearse records a defect of a later model in update (tried)
- the thunk of rehearse stops its step at a defect of a later model
- the thunk of rehearse makes the model before it reads the subscriptions
- the thunk of rehearse records a defect of subscriptions in update (tried)
- the thunk of rehearse offers the job of a state whose subscriptions are a defect (tried: it survives, by its form)
- rehearse dies with no site for a defect of the subscriptions of the first state (tried)
- the thunk of rehearse calls update after the first defect (tried)
- the job of rehearse stops a subscription with no mark of its own (tried)
- the job of rehearse fails on a defect of the release it awaited
- the job of rehearse stops the gone keys one after the other (tried)
- the job of rehearse tells the calls that waited on a start before its release
- a hearNext whose key went away before its job is told before the release of its start
- the thunk of rehearse owes a step's commands before its job
- rehearse leaves the subscriptions hearNext started to the close of its scope (tried)
- rehearse leaves the commands under way to the close of its scope (tried)
- the end of rehearse stops its fibers one after the other (tried)

The two that tell a call once a release has ended rest on where the engine tells `released`: that place gets a
mutation of the engine's.

**Still the rehearsal's own, on code rewritten** (21):

- rehearse interrupts a subscription that sends once it has ended
- rehearse records a defect of a key's Equal, looked up for a call, in update
- rehearse dies with no site for a defect of the first model
- rehearse stops at the keys of the first state, before its first model
- the job of a hearNext starts its subscription after the first defect
- the job of a hearNext starts its subscription once the rehearsal has ended
- rehearse runs a command after the first defect
- rehearse runs a command once it has ended
- rehearse reads the model after the first defect
- rehearse leaves the command of an interrupted run running
- rehearse stops the command of an interrupted run with no mark of its own
- the job of rehearse leaves a call waiting on a start whose key went away
- a defect of a subscription hearNext started carries the key the test gave
- rehearse lets its loop finish after a scenario that failed
- rehearse stops its loop at once after a scenario that returned
- rehearse's hearNext lets no call leave as it ends
- hear plays a start whose job has not run yet
- hear plays, after the wait for its start's job, the start it found before
- a hearNext whose key went away before its job is never told
- the job of a hearNext hears no message held for it
- the job of a hearNext runs without the services of the call
