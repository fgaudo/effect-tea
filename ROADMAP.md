# Roadmap

What is to be done now, and nothing else. Each step names its model and effort, what it depends on, and how to tell
that it is done, and its choices are made by "Deciding" in [`AGENTS.md`](AGENTS.md), without the owner. A step done
is removed, with the reason in the commit, and leaves its number unused. An item rejected goes to
[`docs/rejected.md`](docs/rejected.md), and one deferred to its "Parked, not rejected", with what would reopen it, in
the same commit. How an item came to be is in a record of [`docs/records/`](docs/records), or in the commits, not
here.

## How the steps run

One after another, in the order of "Next, in order", each in a context of its own (a workflow per step, or a session per
step), and with no question to the owner but those of "Deciding". An agent of the step's model and effort does the step.
Where the step changes what `change-engine` covers, or the types of an export, an agent that wrote none of it, on
Opus 5.5 at `high`, then runs the checks of its "Done when" and reads its diff against "Deciding" and the step, and the
step against `docs/invariants.md`; the first agent fixes what it finds, twice at most. A step of names, of documents or
of a tool of `tools/` is read so by the agent that did it. A step whose checks still fail stops the chain, with a
report. A step ends in one local commit, with its decisions in the body, and takes itself out of this file. Before each
step, the use of the owner's plan is read where a tool reports it: a step that the rest of the week cannot pay for waits
for the reset.

## Open problems

A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a deterministic
test of it. A finding of a review goes here with its `test.failing`, until its fix removes the mark and the item. A
problem whose fix is due before a step of "Next, in order" leaves this list for a step of its own there.

## Leads

What a task or a review found that no failing test shows and no user met ("How a decision is taken and kept" in
`AGENTS.md`): a line each, with what would show it, as the test of the types that would hold a lead of the types, or
the case of the inference matrix (`bun run inference --filter <case>`). None is a step of its own: they are weighed
together before a release, and one not taken then goes to `docs/rejected.md`.

- Under `withChildren`, `childById(program, { listening: (_, id) => …, ids })`, with `listening` written before `ids`,
  types `id` as `any`, with no error; outside `withChildren`, as `unknown`. With TypeScript 5.9, 6.0 and 7.0: a test of
  the types under `withChildren`, with the options in that order, shows it. Step 114 does not fix it.
- Under jest's types, `expect(…).toThrow(InvariantDefect)` does not compile, since the constructor is private: a test
  of `examples/react-native` takes the error with a `try` and `toBeInstanceOf`. Under `bun:test` it compiles. A test
  of the types with `@types/jest` would show it.

## Next, in order

Step 114 comes from the report of an application moved to 0.10.0, weighed on 27 November 2026
([`application-report-0.10.md`](docs/records/application-report-0.10.md)), by what step 111 found. It decides its
point by "Deciding": where it decides against its point, it writes its entry of [`rejected.md`](docs/rejected.md), and
is done. Its changes go out with those of steps 111 to 113, in the release after 0.10.0.

The next review of the premises reads the changes since the commit that closed step 99 (`git log --grep
"the premises reviewed since step 65"`), and the next reading of the promises those since the commit that closed step
100 (`git log --grep "the promises read since step 90"`). The review of the premises reads the premise that step 106
added by the model, that the `Fiber` a fork returns is the very one its effect sees as its own (`docs/premises.md`,
"Code that a fiber runs on the stack"), and what `Effect.interruptible` fails with, left a premise of tests alone. It
reads nothing of an `Equal` or a `Hash` of the program that throws: step 107 dropped the three premises that served
that case alone, by the rule it left in `docs/premises.md` ("What no program that keeps the guide's rules can see").

### 114. A function for each kind of child, each with one signature

**Model and effort.** Opus 5.5, `high`: the types of an export, and the engine's reading of a declaration.

**Depends on** no other step. After 113, it renames what it and step 112 wrote, and the compiler finds each place.

**Why.** `child` says whether a child is always there by an optional `there`, and the result type depends on it. One
signature cannot follow an optional key soundly (step 111, `rejected.md`, "`child` with one signature"), so `child` has
three overloads, members typed `never`, a last overload whose result is no child, and errors that depend on the order
of the overloads. `childById` has no such choice, `P` decides between `ids` and `flags`, and its two overloads are an
inference workaround, whose errors report the last one whichever option is wrong. The owner decided the step on 27
November 2026, after an opinion of Fable 5.2, which probed the forms below with TypeScript 5.9, 6.0 and 7.0.

**How.** By [`change-api`](.agents/skills/change-api/SKILL.md) and
[`change-engine`](.agents/skills/change-engine/SKILL.md).

- `child` declares a child always there. A second function, `childWhen` unless a better name is found, declares one
  that may not be: `there` is required, and its options are otherwise those of today. Each has one signature, whose
  only conditional is over `P`.
- The run reads the form from the function called, never from `there`.
- An option of the other form is refused by a member that says what to write, as
  `there?: "a child that may not be there is declared with childWhen"`.
- `childById` has one signature: `ids` and `flags` optional in a type that holds `Id` outside any conditional, and the
  one the program takes made required by a conditional over `P` alone, whose refusal of the other is a member that says
  what to write. A refusal typed `never` or `undefined` lost the `Id` under `withChildren` in the probe. If no form
  holds with the three compilers, its overloads stay.
- The three entries of `rejected.md` of step 111 become one, and the glossary of the guide and "Composition" name the
  new function.
- The same members, in place of the `?: never` that `make` (`update`, `external`, `output`, `runCommand`,
  `subscriptions`, `listen`), `run`, `drive` and `rehearse` read from the program's declared types, so that one way
  says what not to write: today their errors are at the option, and say that it takes `never`. Each stays `never`
  where a member breaks an inference, as `never` broke the `Id` of `childById`, or where the inference matrix or the
  smoke test changes.

**Done when** the refusals of "a child with flags is declared with them", and the four of "a child is declared in one
form, always there or not", are tests at the call; a test under `withChildren` holds the `Id` that `listening` takes;
what `misprint.ts` prints of `greeted` is one error with no overload; a test of the types holds the message of each
member that replaced a `never`; the changelog has the breaking entry with its
`Upgrade:`; and `bun run typecheck`, `lint`, `test`, `test:node`, `interleavings`, `inference`, `inference --run`,
`comments` and the smoke test, with TypeScript 5.9, 6.0 and 7.0, pass.

## For the owner

What leaves this machine, or decides what the project is ("Deciding" in `AGENTS.md`): an agent prepares it, and the
owner does it.

- **0.10.0** is committed and tagged `v0.10.0`, locally, on 27 November 2026, after the checks of point 2 of
  "Releasing" passed on it: the owner pushes the commit and the tag, which deploys the site, and publishes the package.
- **1.0.** Not before the library has been made known and used by others for at least one or two months, as the owner
  decided on 20 November 2026: only then may 1.0 be decided, with what its users have asked of the API, after a
  reading of the promises and a review of the premises over everything. Until then, releases stay at 0.x.

## Any time

None of these waits for the steps above, nor holds them up, and "proceed with the roadmap" takes none of them: the
owner left them here on 25 November 2026, while the steps of "Next, in order" are done. Each is for Opus 5.5,
`medium`, but where it says otherwise.

- **What a real browser has not run of the bridges.** The bridges' tests run in Chromium, Firefox and WebKit
  (`bun run test:browsers`, a job of the CI). Firefox runs in the CI alone: on the owner's Windows machine, Playwright's
  Firefox does not start ("side-by-side configuration is incorrect"), so the tests of hydration, transitions and Fast
  Refresh that step 70 added ran in Chromium and WebKit, and run in Firefox after the owner's push. So do all the
  bridges' tests at React 19.3.0, which step 83 made the start of the peer range and the lockfile's version. An IME is
  driven in Chromium alone, through its protocol: Playwright drives none in Firefox or WebKit, so a composition there
  is not run.
- **A benchmark that runs in the CI.** Many children, many messages per second, to keep what a message costs the event
  that sends it, and a model made only when it is read, from regressing. `bun run bench`
  (`tools/bench/subscriptions.ts`) measures a parent's subscriptions only, and `tools/bench/writes.ts`, run by hand,
  what a message that an element fills costs as a program stores its value, by its own `update`, through the `update`
  that `make` composes, and through a dispatch with its model read; neither runs in the CI. A CI machine's times
  vary, so what fails is a count that does not: how often `makeModel` runs, how many keys one message reconciles.
  What one step with many keys costs was measured by hand in step 57 ([`left-points.md`](docs/records/left-points.md),
  the last item): a start for its cases.
- **A devtools bridge over `onApplied`** (e.g. Redux DevTools), with time travel through `init: { state }` and
  replay through `applyAll`.
- **An example of hot module reloading** that keeps the state, which the guide hints at (the view lives in a
  module of its own) without showing. It says what it does with a kept state once a declaration changed, which the
  library leaves unspecified ("Guarantees", "What is left to you"): `stateOf` makes a state of the new program from an
  own state and its children's states, and is a testing tool today.
- **An example of saving each state before its commands start**, which the guide names ("Running", "Work that must
  wait goes to the effects of the program") without showing: `onApplied` offers the state to a queue, a fiber of
  whoever runs the program saves it, and a wrapped `runCommand` waits until the state its step heard is saved.
