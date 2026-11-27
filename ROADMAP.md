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
  types `id` as `any`, with no error; outside `withChildren`, as `unknown`. With TypeScript 5.9, 6.0 and 7.0, and with
  the one signature of step 114: a test of the types under `withChildren`, with the options in that order, shows it.
- Under jest's types, `expect(…).toThrow(InvariantDefect)` does not compile, since the constructor is private: a test
  of `examples/react-native` takes the error with a `try` and `toBeInstanceOf`. Under `bun:test` it compiles. A test
  of the types with `@types/jest` would show it.
- `childById` with one list for every program: `ids`, and `flags: (state, id) => FlagsOf<P>`, required exactly when the
  program has flags, in place of the two lists and `ByIdForm`. `flags` would then be in `childById` what it is in
  `child`, the flags of a child. Probed by the review that steps 115 to 117 come from, with a signature declared and no
  body, with TypeScript 5.9, 6.0 and 7.0: the `Id`, inferred from `ids` alone, types the `id` of `listening` and of
  `flags`, and `flags` is refused for a program without flags, and required for one with. Against it: a step of the
  parent's own would read and compare the flags of each child listed, where the very same list skips them today
  (`rejected.md`, "A declared `tell` that takes the id of a child", refused for such a cost), and a parent that keeps
  its children in an array would look each id up in it, a cost that grows with the square of their number. A measure
  of both forms at 1,000 and 10,000 children, with the state as an array and as a `HashMap`, would show it.

## Next, in order

Steps 115 to 117 come from a review of the API of `program`, which the owner asked of Fable 5.2 on 27 November 2026 and
decided with it the same day. Its probes were throwaway files, typechecked beside the examples with TypeScript 5.9.3,
6.0.3 and 7.0.2, with the same result under each: a step that rests on one says what was probed, and what was not.
The steps run in the order of their numbers, and each decides its points by "Deciding": a step that decides against
its point writes its entry of [`rejected.md`](docs/rejected.md), and is done. With them the owner added a sentence to
the third value of `AGENTS.md`: small is counted in concepts, not in exports. Their changes go out with those of steps
111 to 114, in 0.11.0.

### 115. `child`, `childWhen` and `childById` as functions of the package

**Model and effort.** Opus 5.5, `high`: the types of three exports, and an inference of TypeScript that their form
rests on.

**Depends on** no other step.

**Why.** `program<T>()` returns the functions that declare children beside the two ways to make a program. So a program
without children is handed what only a parent uses, and a parent takes a line that destructures them, bound to a state
that their calls do not show. They are returned by `program<T>()` only so that their options know the parent's state
(`rejected.md`, "`child`, `childById`, `input` and `inputById` as free functions"), which was reasoned and not probed.
The probe found that, in the call of `withChildren`, they read that state from the type that `withChildren` expects.

**How.** By [`change-api`](.agents/skills/change-api/SKILL.md) and
[`change-engine`](.agents/skills/change-engine/SKILL.md).

- `child`, `childWhen` and `childById` are exports of the package. Each keeps its one signature, with the parent's
  state as a type parameter in place of `T`: `<State, P>(program, …options) => Child<State, P, 'always'>`, and
  `<State, Id, P>` for `childById`. `program<T>()` returns `make` and `withChildren`, and nothing else:

  ```ts
  export const app = program<{ state: Own }>()
    .withChildren({ Clock: child(Clock.clock, { listening: (state) => Opt.isNone(state.about) }) })
    .make({ init: { state: { about: Opt.none() } }, makeModel: (_, children) => children.Clock() })
  ```

- **Probed**, with signatures declared and no body. In the call of `withChildren`, the `state` of an option is the
  parent's with no annotation, for `child`, `childWhen` and `childById`, of a program with flags and of one without,
  with the options chosen by a conditional over `P` as they are today. The `id` of a `listening` written after `ids` is
  the id. The literal of a `tell` keeps its tags where its type is the conditional of `Telling`, and loses them where
  it is a function type alone.
- **A child declared apart** from `withChildren`, as `examples/list` declares its stopwatches for `halting.ts`, has a
  `state` of `unknown` without an annotation, and does not compile: a form refused, never taken wrongly. With
  `(state: Own)` it compiles, and `withChildren` takes it. The doc comments of the three functions say so, and
  "Structuring a program" where it shows children declared apart.
- **Not probed**, and done first, before the rest: `CheckedChild<P>` beside a `State` that is inferred; what a
  consumer's declarations print (`bun run smoke`, with `misprint.ts`); and the inference matrix, with the three
  functions as uses of their own.
- **If the state does not reach an option** in the call of `withChildren`, with one of the three compilers, the
  functions are not exports. A second function, `parent<T>()`, returns them with `parentProgram`, which takes the
  children and gives the parent's `make`, and `program<T>()` returns `make` alone: `withChildren`, destructured, does
  not say what has the children. The step writes what failed in `rejected.md`.
- The types that only name the three functions (`DeclareChild`, `DeclareChildWhen`, `DeclareChildById`) stay only
  where a consumer's declarations would spell out a signature without them (`change-api`, "Report it").
- The lead of a `listening` written before `ids` is read again, in the call of `withChildren` and apart from it, and
  its line under "Leads" says what is found.
- **Weighed with the owner, and not taken.** Each gets its entry of `rejected.md`, and the entry of the free functions
  is rewritten:
  - A second function beside `program`, `parent<T>()` or `parentProgram<T>()`, while the three functions are exports.
    It would take the same types by the same signature: a program and a parent differ by the children, and the API
    forks there.
  - The functions given to a callback, `withChildren(({ child }) => ({ … }))`. Probed: it holds, with the state, the
    messages and the model of `examples/pages` the very same and the tags of a `tell` kept, and children declared
    apart are read from `ParentMaker<T, infer C>`. It is a callback for what an import does.
  - The children in the call that names the types, `program<T>(children)`. TypeScript infers no type argument once one
    is given (microsoft/TypeScript#26242), so the children fall to their constraint, and lose their names.
  - The children and the pieces in one call, as two arguments. Probed: the children fall to their constraint there
    too.
  - `program` as the name of `withChildren`, one word for two signatures, which a module that imports `program` cannot
    destructure; and `children`, the word of what a parent's pieces take last.

**Done when** tests of the types hold, for each of the three functions, and for a program with flags and one without,
that the state reaches an option in the call of `withChildren`; that a child declared apart compiles with its state
annotated and not without, and that `withChildren` takes it; and that `withChildren` refuses a child declared for
another state. `program<T>()` gives no `child`. The examples, the guide, the tutorial, the README and the skill write
the new form, and the changelog has the breaking entry with its `Upgrade:`. `bun run typecheck`, `lint`, `test`,
`test:node`, `interleavings`, `inference`, `inference --run`, `comments`, `api --check` and the smoke test, with
TypeScript 5.9, 6.0 and 7.0, pass.

### 116. A program without children and a parent, each with types and a `make` of its own

**Model and effort.** Opus 5.5, `high`: `src/compose.ts`, which keeps the invariants of a parent, and the types of
`make`.

**Depends on** 115, which changes what `program<T>()` returns.

**Why.** One `Config`, of twelve type parameters, types the pieces of a program without children and those of a
parent, and one `make` runs both. So the `update` of a program without children is typed
`(message, ...children: Reading<None>) => (state) => Transition<…, TellOf<None>>`, its `makeModel` is given a second
argument, `{}`, and the run asks whether the program is composed at eight places. The two differ by what a user
writes, so by the third value they are two, each plain: it is one mechanism fewer (value 5), and the errors and hovers
of a program without children name its own pieces alone.

**How.** By [`change-engine`](.agents/skills/change-engine/SKILL.md) and
[`change-api`](.agents/skills/change-api/SKILL.md).

- A program without children: its pieces are those of `Program` (`Shape`, in `src/program.ts`), each required exactly
  when its type is named, as today. No `Reading`, no `TellOf`, and no `children` in `makeModel`. Its `make` is a
  function of its own, which fills in what the config leaves out.
- A parent: its pieces take `children: OutputsOf<C>` as a plain last parameter, with no rest tuple, and `onEvent`,
  `NoClash` and `NoKeyClash` are its alone. Its `make` no longer asks whether it is composed.
- What makes a piece required exactly when its type is named, and refused otherwise, is written once, for both.
- Nothing that the guide or a doc comment promises changes. What a consumer can notice is read in the diff of
  `api/*.api.md`, and gets its changelog entry: a hover or an error that prints another type is not one.
- Not a goal: a lower count of the smoke test (`change-api`, "No new type for how a consumer's types print").

**Done when** `Reading` is gone, and no branch of the run asks whether a program has children; the tests pass as they
are, but for those that read a printed type; each mutation of `src/compose.ts` is still killed (`bun run mutations`);
the inference matrix reports no new lead; and `bun run typecheck`, `lint`, `test`, `test:node`, `interleavings`,
`inference`, `inference --run`, `comments`, `api --check` and the smoke test, with TypeScript 5.9, 6.0 and 7.0, pass.

### 117. An option or a piece given as `undefined` is one not given

**Model and effort.** Opus 5.5, `medium`: one rule, applied to each optional member, with a test for each.

**Depends on** 115 and 116, which write the types it changes.

**Why.** Under `exactOptionalPropertyTypes`, `child(clock, { listening: undefined })` and
`make({ …, update: undefined })` do not compile. Probed: the error is the same for a member that is refused and for
one that is not, so it comes from the option of the compiler, not from `Refused`. Without that option both compile,
and the run reads `undefined` as a member not given. So what a consumer may write depends on an option of their
compiler, and one under it cannot write `listening: hidden ? paused : undefined`. The owner asked why an optional
member refuses `undefined`.

**How.** By [`change-api`](.agents/skills/change-api/SKILL.md), and by
[`change-engine`](.agents/skills/change-engine/SKILL.md) where the run of `src/compose.ts` changes.

- Each optional member of what `make`, `child`, `childWhen` and `childById` take is typed with `| undefined`, one
  typed `Refused<…>` too. `Refused` stays as it is: it refuses a value, and says why.
- A required member takes no `undefined`, with the option of the compiler or without it: step 114 found a required
  list typed `unknown` that took one, and `make` died of a `TypeError`.
- The run reads `undefined` as a member not given, at each member: each place is read, since a spread or an
  `Object.hasOwn` tells the two apart.
- The options of `start` and of the testing tools are weighed by the same rule: taken, or left with the reason in the
  commit.
- One doc comment says the rule once, and the changelog has its entry.

**Done when** a test of the types gives each optional member `undefined`, and a test of the run shows that it does
what leaving the member out does; the inference matrix, which runs with `exactOptionalPropertyTypes` and without,
reports no new lead; and `bun run typecheck`, `lint`, `test`, `test:node`, `interleavings`, `inference`,
`inference --run`, `comments`, `api --check` and the smoke test pass.

The next review of the premises reads the changes since the commit that closed step 99 (`git log --grep
"the premises reviewed since step 65"`), and the next reading of the promises those since the commit that closed step
100 (`git log --grep "the promises read since step 90"`). The review of the premises reads the premise that step 106
added by the model, that the `Fiber` a fork returns is the very one its effect sees as its own (`docs/premises.md`,
"Code that a fiber runs on the stack"), and what `Effect.interruptible` fails with, left a premise of tests alone. It
reads nothing of an `Equal` or a `Hash` of the program that throws: step 107 dropped the three premises that served
that case alone, by the rule it left in `docs/premises.md` ("What no program that keeps the guide's rules can see").

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
