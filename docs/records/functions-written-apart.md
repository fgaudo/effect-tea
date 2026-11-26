# The types of a parent's function written apart

**Status:** decided on 26 November 2026, as step 97 of [`ROADMAP.md`](../../ROADMAP.md), by a session of Opus 5.5, by
the values of "Deciding" in [`AGENTS.md`](../../AGENTS.md). Each claim is **run**, by a test or a check that the text
names, or **reasoned**.

## The question

"Structuring a program" splits a program by concern, each part a function that returns a `Step`. A parent's function
written outside `make` takes its children's outputs and returns a step that tells them, and the package named neither:
`Outputs` and `Tells` were kept by `src/compose.ts`, so a program declared them again by hand
([`application-report-0.9.md`](application-report-0.9.md), point 1).

## Decided

**`OutputsOf<C>` and `TellOf<C>`, exported, read from the children `C` that `withChildren` takes, declared apart from
it: `const stopwatches = { Stopwatch: childById(…) }`, then `OutputsOf<typeof stopwatches>`.**

- **Read from the children, not from the program** (reasoned). A function given to `make` cannot be typed by what
  `make` returns: `typeof list` in its own initializer is a cycle. Read from what `withChildren` returns, the name
  would say "the outputs of the parent", which `OutputOf` already is.
- **The library's own types use them** (reasoned, value 3): `update`, `external`, `onEvent`, `output` and
  `subscriptions` take `OutputsOf<C>`, and their steps tell `TellOf<C>`. One definition, and a function written apart
  is the function `make` asks for (**run**: "a parent's functions written apart from make are typed by what its
  children output and are told", in `src/compose.test.ts`, for `update`, `external` and `onEvent`).
- **Names of the family of `StateOf`**, by the guide's words: `TellOf` gives the `Tell` of a `Step`, `OutputsOf` the
  outputs of several children, where `OutputOf` is the output of one program.
- **Written as a conditional that TypeScript resolves**, as `CommandOf` reads through a tuple since step 96. An alias
  over `C` prints as that alias, with each child's whole program for its argument, in every error and hover that names
  it (**run**: the smoke test's `misprint.ts` has an error over each, beside a parent of parents; without the
  conditional it prints a program three times and 8,969 bytes, over its bound of 7,000; with it, none, and about
  5,700 for its six errors). A tuple, as `CommandOf`'s, keeps the alias of a single type, and does not serve. The
  aliases were the types of `make` until this step, so the typecheck, the tests and the inference matrix passed
  without the conditional, which changes only how a type prints.
- **No constraint on `C`.** Given something else than children, they are `never` and `{}`, and the program that uses
  them does not compile where it tells or reads: no behaviour of the library is left undefined (value 2).
- **Not breaking.** Two exports more, and the same types under them.

## Weighed and left

- **`Tells` and `Outputs` exported as they were**: the aliases above, which print the children.
- **An `Update` of a parent**, a fifth parameter of `Update` for the children: `onEvent`, `external` and a concern's
  function that returns a `Step` need the two types anyway, so it would be a second form of the same thing.
- **`onEvent` and `external` written apart in the example**: `list` has no external messages, and its `onEvent`, which
  drops a stopwatch, is of the concern that adds them, which stays in `list.ts`. The test of the types writes all
  three apart from `make`, and the example only what its concerns give.
- **An example of its own**: `list` is split instead, its halting in `examples/list/halting.ts`, since it already reads
  its stopwatches' outputs and tells them in a step. A program that small would keep one module, and its comment says
  so.
