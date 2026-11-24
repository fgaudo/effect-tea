# @fgaudo/effect-tea — guide for coding agents

The guide, [`site/guide/`](site/guide), is the user documentation and the specification. This file holds the rules
of every change. [`docs/invariants.md`](docs/invariants.md) says how the engine keeps its invariants,
[`docs/premises.md`](docs/premises.md) what they rest on, and [`docs/rejected.md`](docs/rejected.md) what was weighed
and rejected: the three are kept true of the code. The records of [`docs/records/`](docs/records) are history. Each
rule has one place, and other places link to it.

Read the skill of the task first, in `.agents/skills/`: [`change-api`](.agents/skills/change-api/SKILL.md) for an
export; [`change-engine`](.agents/skills/change-engine/SKILL.md) for the engine (`src/core.ts`, `shell.ts`,
`engine.ts`, `run.ts`, `compose.ts`, `dispatch.ts`, `input.ts`, `log.ts`), a testing tool (`src/testing/`), their
tests, `tools/mutations/` or `test/scheduled.test_scheduler.ts`; [`add-example`](.agents/skills/add-example/SKILL.md)
for an example or a bridge; [`upgrade-effect`](.agents/skills/upgrade-effect/SKILL.md) for a newer Effect or a
dependency; [`release`](.agents/skills/release/SKILL.md) for the changelog, the version, a release or the site;
[`premise-review`](.agents/skills/premise-review/SKILL.md) for a review of the premises; and
[`guide-reader`](.agents/skills/guide-reader/SKILL.md) for a reader's check of the documentation.

## Deciding

The owner leaves the decisions of the project to the agent that does the work, and keeps the few listed below. A
decision is not put to the owner because it is hard, or because it breaks something: the agent takes it by the values
of this section, says it in one line in the report of its step and in the commit, and the owner may undo it. So agents
that read this section, and the precedents it names, decide alike.

### The values, in order

When two of them pull apart, the higher one wins. When the lower one would lose much, look first for a third design,
changing an invariant, a premise or the API if that is what it takes. Look for one also where nothing pulls apart:
when a task shows a more elegant way to solve a problem, or a better form of the API, explore it. Take it where the
task reaches it, and otherwise write it in the roadmap as a lead, for a step to weigh.

1. **Correct.** Every behaviour is defined, and nothing fails in silence.
2. **Misuse is impossible by construction.** Only a misuse that leaves the library's behaviour undefined needs a
   refusal: one that only exposes users to their own bugs is allowed. A refusal comes from the types or the shape of
   the API first; where they cannot give one, from a defect as the program is made (`make`); last, from a rule that
   nothing checks, listed in "Guarantees", under "What is left to you". Three things are axioms, never checked: the
   functions of a program are pure, a user's values are immutable (none that a user gives the library, or takes from
   it, is mutated once made, nested objects included), and a model holds no function.
3. **The public API is small, clear and symmetric.** Few concepts. One word for each concept, and one concept for each
   word: the guide's glossary is the dictionary. A name says what the thing is to a user, the same role has the same
   form, and a thing is done one way. Users judge the library by its API first.
4. **The design is coherent and pure.** A concept is treated alike wherever it appears, and has a module of its own.
5. **The implementation is simple.** Fewer mechanisms, less code, fewer premises (`docs/premises.md`).
6. **It is fast enough.** A cost in memory or in time that grows with no need is a bug, and counts as 1. Anything else
   is optimized only once it is measured, and never at the cost of 3.
7. **It is cheap to keep.** Documents, tests, tools and procedures serve the values above. One that costs more than it
   protects is cut, and a rule added removes or merges another, or says why it cannot.

### What may change

Everything but this section may change when the change ranks higher by its values: an invariant, a premise, a promise
of the guide, a rule of this file or of a skill, a name or a shape of the API, with a breaking change where it takes
one (`release`). Before 1.0 a break costs little: the API is made right now, and its breaking changes go out together,
so that users upgrade once. The owner's own decisions are no exception: one of a record or of `docs/rejected.md`
binds an agent as an agent's would, and is changed with no consent asked. What does not change is the model of the
library, The Elm Architecture: a state made anew only by a pure `update`, from a message, with the commands it returns;
a view of the state; subscriptions read from the state; and effects run by the engine alone, never by the program's
functions. A change that leaves it makes another library.

### What the owner decides

- Whatever leaves this machine: a push of commits or tags; an issue, a pull request, a release or a comment, on GitHub
  or anywhere else; a message to anyone; and publishing to npm. Commits and tags stay local, and the owner pushes them.
- What the project is: its purpose and its users, its model ("What may change"), a dependency or a peer added or
  removed, a new bridge, its licence, and 1.0.
- This section: the values, their order, and this list.

### How a decision is taken and kept

- Read the precedents first: `docs/rejected.md`, and the records that the change touches. A decision is not reopened
  without a new fact (a bug, a user's report, a change of Effect, or an argument that the precedent did not weigh),
  and the proposal names it, as the "Reopen if" of an entry asks. A decision taken before this section, on 24 November
  2026, the owner's or an agent's, was not weighed by its values: an argument from them is its new fact.
- Write the decision where the next agent will look: one line in the report of the step and in its commit. A decision
  on the API or on an invariant also gets a record of a page at most, in `docs/records/`.
- A decision that the owner undoes goes in `docs/rejected.md`, with the owner's reason: it is a precedent too.
- A question that must go to the owner is one question, with the agent's choice first, the difference said by what it
  changes for a user of the library, and whether it can be undone.

## Language and commits

All code, comments, identifiers, commit messages and `.md` files are in **English**. Commits go on `main`, linear, and
stay local ("Deciding"). One made with an AI agent ends with an `Assisted-by: <model>` trailer, never
`Co-Authored-By`. A body says only why, or what the diff and the docs do not, and lists the decisions of a step.

## What belongs here

- **Generic, and only Effect.** The library knows no application and no renderer: views are generic over their node
  type, and `effect` (v4) is the one dependency of `.` and `./testing`, as a peer. The bridges (`./snabbdom`,
  `./snabbdom/testing`, `./react`) alone know a renderer, an optional peer. Oxlint and `lib` (`ES2022`, no `DOM`) refuse
  renderers and browser APIs but in `examples/` and `bridges/`; the bridge to React declares each global it reads.
- **An API of its own**: what `src/index.ts`, `src/testing/index.ts` and the bridges export, judged by the library's
  concepts, its examples and its users in general, never by one application. Another project may be named, never as
  read or compared to decide what this library does.
- **A type is Effect's or the library's, never half of each.** Effect's is a named alias (`Subscription` is a
  `Channel`), with no function of the library's over it. The library's has a shape it documents, public where written
  by hand (a `Step`), hidden where not (`Rejected`), with the functions over it (`andThen`). A type is the library's
  only where the library must do what Effect cannot: inspect it in tests without running it, keep it the same across
  draws (`forwardTo`), or enforce what its type cannot.
- **The types of a program keep three rules, and only these.** Every correct program can be written (a concrete one: a
  function over any program is an overload over erased types). No broken combination can: pieces that cannot work
  together, and what compiles and then dies where the types could have prevented it. And what a program names is what
  its types give back, however it is written. A form may be refused, never taken wrongly. The first rule is owed to a
  program of `make`, a value typed `Program<…>` and `{ ...program, init }`, the others to every form a function takes.
  A misspelled name, a form that repeats another and a type empty but true are no gaps (`docs/rejected.md`, "The API").
- **A function earns its place by doing what Effect alone cannot**, or by being the one place where a rule of the
  library is applied (`reject`, `program`): never a name over Effect's combinators, a documented literal or an operator
  (`docs/rejected.md`, "The API"). A declaration that takes a standard type of Effect (`at`, an `Optic`) may stay.
- **Only stable APIs**: nothing `@stability unstable` of Effect, nor `unstable_` or `experimental_` of React, but what
  `tsconfig.json` lists for `tools/`, outside its files that stand for a user's code; and **nothing deprecated**, of
  any dependency, in the library, its tests or its examples. The typecheck and the lint fail on one.
- **The peer range is the patches of the Effect the library is developed with** (`~4.1.5`), raised with
  `devDependencies` in one commit; an API of a newer Effect calls for an upgrade, not a workaround (`upgrade-effect`).
  Effect v4 is [`Effect-TS/effect`](https://github.com/Effect-TS/effect). A renderer's range is a caret.
- **A change a consumer can notice has a changelog entry** in the same commit (`release`).
- **The guide promises only its rules**: what stands under the "Rules" of a page, under "What you can rely on", and in
  the types, as its index says. A test checks each promise, and a change of one is breaking. The rest is unspecified,
  with no test of its own but an invariant's and no changelog entry, and so is how the engine works inside, or what a
  renderer does beyond its documentation. In doubt, a behaviour stays unspecified. A rule changes one section at a
  time, each sentence checked against the old one: no weaker, no stronger.
- **A rule of the guide is added last, and stated where it rules**: once, under the "Rules" of its page, as a case of
  the rule it falls under where there is one, and other places link to it. How one program does something goes in an
  example's code. A rule nothing checks is listed under "What is left to you", and first in the skill. An example
  never brings the rule that allows it.
- **A doc comment of the API follows the guide, in its own words**: what the export is, how it is called, and the
  rules a caller needs there, promising nothing the guide does not. It names each section it follows with a line
  `@see The guide, "<page>", "<section>".`, never a link to the site. A change of a section rereads the comments and
  the skill's rules that name it, and the reverse.
- **The package ships its documentation, at its version**: the guide, the tutorial, the examples and the skill
  [`skills/effect-tea/SKILL.md`](skills/effect-tea/SKILL.md), which sums up the guide as a doc comment does. Their
  links to the repository's files are relative, as the package holds them.
- **The guide, the doc comments and the skill are in plain English**: short sentences, common words, the guide's words.

## Invariants

[`docs/invariants.md`](docs/invariants.md) says what the engine keeps, and how: every change keeps it, an example's and
a document's too. A premise is checked before the change that rests on it, and a new one is taken only where no design
without it is as good ([`docs/premises.md`](docs/premises.md)).

## Code

- One module per concept. `core.ts` is what the run and the tools share as pure functions, `shell.ts` with effects.
- `runCommand`, `init` and `listen` are read through `runCommandOf`, `startOf` and `listenOf`. A program always has
  `subscriptions`. A program's pieces are written once, in `Shape`.
- A key is named `@fgaudo/effect-tea/<Type>[/<part>]`, a property keyed by a string `~@fgaudo/effect-tea/<Type>/<part>`.
  An exported object type writes `readonly` on each member, never `Readonly<{ … }>`, which prints in declarations.
- Effect modules are imported as namespaces, with `Arr`, `Opt` for `Array`, `Option`. A function that returns an
  `Effect.gen` is an `Effect.fnUntraced`, tests included: the library opens no spans.
- Comments say only what the code cannot: a reason, written once where its check is, an invariant the types do not
  show, a choice that would look like a mistake. A doc comment of an export holds no note on the implementation.
- No blank lines between the statements of a block. `.md` prose is wrapped at 120 columns by hand. A change of
  `dprint.json` formats the repository in a commit of its own, listed in `.git-blame-ignore-revs`.

## Tests

- `bun:test`, in a `<name>.test.ts` next to the module; a file that serves tests is `<name>.test_<kind>.ts`. A test
  goes through behaviour, never through what a module keeps to itself, and its name says what it checks.
- A test of the library is of one of five kinds: the semantics of the pure pieces; invariants under random histories
  (`bun run interleavings`, whose findings wait in `ROADMAP.md`); contracts, one program given to each tool and to the
  run (`src/testing/contract.test.ts`); the boundary of a run or of a tool, a premise's own test among them; and the
  types. A bug found is held by one of them. The tests of `src/` and `test/` run on Node too, so their TypeScript is
  erasable.
- **Each check an invariant rests on has a mutation**, and so has each check of the types of `program.ts` and
  `compose.ts` (`change-engine`).
- **A test never rests on the clock for an order**: what must come first is awaited. A clock may bound a wait that only
  a failing test reaches, be what is tested, or hold a window of absence (`docs/invariants.md`).
- **A test that loops in one call is ended by the memory guard**: a listener that sends stops once it has its answer.

## Checks

`bun run typecheck`, `bun run lint` and `bun run test`; after a change of the engine or of a testing tool,
`bun run test:node` and `bun run interleavings`; of a bridge or a view drawn with both, `bun run test:browsers`; of the
guide or a doc comment, `bun run comments`; of the API, `change-api`. The README's "Development" says what each runs.
