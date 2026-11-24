---
name: change-api
description: How to add, change or remove an export of @fgaudo/effect-tea: where the API surface is, the export conditions of the package, the tests, the doc comments and the guide that document it, its changelog entry, and how to check the change as a consumer would see it. Use when changing anything that src/index.ts or src/testing/index.ts exports, its types, its docs or its tests.
---

# Change the public API

The API is what [`src/index.ts`](../../../src/index.ts), [`src/testing/index.ts`](../../../src/testing/index.ts) and the
bridges ([`bridges/`](../../../bridges), the entries `./snabbdom`, `./snabbdom/testing` and `./react`) export. It is
judged as "What belongs here" in `AGENTS.md` says. An export removed or refused before is in
[`docs/rejected.md`](../../../docs/rejected.md), "The API": read it before proposing one.

## Shape it

- A new concept gets a module of its own, and a testing tool one under `src/testing/`, exported beside what it belongs
  with.
- The tools stay symmetric: what `drive` gets, `simulate` and `rehearse` are asked about.
- A new entrypoint needs the conditions `bun` (the source), `types` and `default` (`dist/`) in `exports`, an entry in
  `files` if it is outside `src` and `dist`, and a line in `tools/api-report.ts` and `site/typedoc.json`. A bridge's is
  built by `bridges/tsconfig.build.json`, with the `DOM` lib, and its renderer is an optional peer.

## Test it

- A `*.test.ts` next to the module, through behaviour. A new guarantee of "Guarantees" gets a property in
  `src/interleaving.test.ts`.
- A change of the signature of a function that takes a program (`start`, `drive`, `rehearse`, `simulate`, `child`,
  `childById`) or a message (a `Dispatch`, `forwardTo`, `send`, `hear`, `simulate`, `applyAll`), or of the types of
  `program.ts` or `compose.ts`, runs `bun run inference` and `bun run inference --run`. A new function that takes a
  program goes in its `uses`, one that takes a message in its `takers` (`tools/inference/generate.ts`).
- A change of the types of `program.ts` or `compose.ts` runs `bun run mutations` too. A check added gets a test of the
  types that refuses what it refuses, and a mutation ([`change-engine`](../change-engine/SKILL.md), "Mutations of the
  types").
- A testing tool's test shows it on a program, and an example's test uses it
  ([`add-example`](../add-example/SKILL.md)); the README's "Examples" table stays true.

## Document it

In the same change:

- **Doc comments** on everything the indexes export, which TypeDoc makes the API reference
  (`cd site && bun install && bun run build`, with no warnings). Each has a first line that says what it is, in one
  sentence; `@param` and `@returns`, or a comment on each field (a function made with `Effect.fnUntraced` says its
  parameters in a sentence); an `@example` of the common case; then the rules a caller needs at that point, the same
  rule as the guide's in fewer words, never a stronger one; and last its `@see` lines (`AGENTS.md`, "A doc comment of
  the API follows the guide, in its own words"). A comment past a screen says too much. A rule the guide does not hold
  yet goes into the guide first. A rule of the whole run is on `run`.
- **The guide** ([`site/guide/`](../../../site/guide)): the page of the concept, and "Testing tools" for a tool. No
  tool checks its code blocks, nor the README's: read every block that mentions what changed. The README's quick start
  must run as it is (it logs 0, 1, 2, 3):

  ````sh
  awk '/^## Quick start/{f=1} f&&/^```ts/{g=1;next} g&&/^```/{exit} g' README.md > quickstart.check.ts && bun quickstart.check.ts; rm quickstart.check.ts
  ````
- **The examples** that use it, and **`CHANGELOG.md`** ([`release`](../release/SKILL.md)).

## Report it

`api/*.api.md` is the report of the API, one for each entrypoint, written by `bun run build && bun run api` from the
declarations of `dist/` and committed with the change; the CI runs `bun run api --check`. Read its diff as a consumer:
a line removed or narrowed is a `**Breaking**:` change, and a diff the change did not mean is a change all the same.

A type the API reaches is exported by the package, or kept to its module (TS2742, TS2883, TS4023): `bun run api`
fails on one that a module exports and the package does not, on an interface or a class of a module's own, and on a
`unique symbol` key, which is a string (`~@fgaudo/effect-tea/<Type>/<part>`). What the API returns has a name that
declarations use, as `ProgramMaker` for what `program` returns.

**A type for how a consumer's types print is admitted on four conditions.** Some types exist only for how TypeScript
prints a consumer's types (`ProgramMaker` and its functions, `CheckedChild`, `Present`), and rest on behaviour of the
compiler that no documentation states. One is admitted only when all four hold: it is not exported, or it names what a
consumer's declarations would otherwise spell out in full; the smoke test has a check that fails without it, with each
supported TypeScript; the typecheck, the tests and the inference matrix pass unchanged without it; and a comment at
the type says what would print without it. One whose check fails with a new TypeScript is removed, not repaired with a
second trick. How a type prints never justifies a parameter, an overload or an export that a user must write.

## Check it as a consumer

`bun run smoke` (`tools/smoke/smoke.ts`, in the CI) checks the packed package as a consumer outside Bun sees it; it
needs Node 22.18 or newer. `--effect <version>`, `--typescript 5.9,7.0` and `--keep` change what it installs and keep
its project.

- A change to what `program` declares or derives, or to what `run` and the tools take, gets code in
  [`tools/smoke/consumer.ts`](../../../tools/smoke/consumer.ts) that uses it, and a `// @ts-expect-error` for what its
  types newly reject. A form of export a change makes possible is exported there too.
- The smoke test counts how often the consumer's declarations spell out its state, and fails on another count than the
  one its comment explains: a type of the library that repeats a consumer's types multiplies it, and is given a name.
