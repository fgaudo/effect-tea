---
name: change-engine
description: How a change of the engine of @fgaudo/effect-tea or of a testing tool is made: the invariants and the premises to read first, what to list before writing it, the deterministic test and the mutation a check leaves, how a lead of the search of interleavings is weighed, and the checks to run. Use before changing src/core.ts, shell.ts, engine.ts, run.ts, compose.ts, dispatch.ts, log.ts or anything under src/testing/, their tests, tools/mutations/ or test/scheduled.test_scheduler.ts.
---

# Change the engine or a testing tool

The engine is `core.ts`, `shell.ts`, `engine.ts`, `run.ts`, `compose.ts`, `dispatch.ts` and `log.ts`; the
testing tools are `src/testing/`. How the engine keeps each guarantee is
[`docs/invariants.md`](../../../docs/invariants.md), and what it rests on
[`docs/premises.md`](../../../docs/premises.md).

## Before the change

1. Read `docs/invariants.md` whole, the rule of `docs/premises.md` and the premises of what the change touches (by the
   names they cite), and [`docs/rejected.md`](../../../docs/rejected.md): a design listed there is not proposed again
   without what its "Reopen if" names.
2. List the premises the change rests on. Each is checked before the change is written, as `docs/premises.md` says.
3. List the points where another fiber can run between a check and the act it guards (`docs/invariants.md`, "A check
   of what another fiber may change, and the act it guards, are one thunk"). Each leaves a test that fails without the
   check, deterministic, of the core or with a gate, and a mutation that takes the check out.
4. A tool that plays a program runs it on the engine: it decides at most when a command runs, when a subscription's
   message is heard and what fails the test, and makes no step, no scope of a subscription or a command, and no site of
   a defect (`docs/invariants.md`, "The testing tools behave like the engine").

## Tests

Each kind of test (`AGENTS.md`, "Tests") lies in one place: the pure pieces in the test file of their module
(`compose.test.ts` holds those of a `Step`); the search in `src/interleaving.test.ts`; the contracts in
`src/testing/contract.test.ts`; the boundary of the run in `run.test.ts`, `engine.test.ts` and `start.test.ts`, of a
tool in its own file of `src/testing/`, of a premise in `test/premises.test.ts`, of the scheduler of the tests in
`test/scheduled.test.ts`, and of the memory guard in `test/memory-guard.test.ts`; the types beside the tests of their
function. A test that needs more of `bun:test` on Node adds it to `test/node/bun-test.test_shim.ts`, and one that asks
for a collection calls `test/gc.test_helper.ts`, never `Bun.gc`. See each new test fail without what it checks, and
name the premises listed and the tests seen to fail in the report of the change.

### Mutations

Each check an invariant rests on has a mutation in `tools/mutations/mutations.ts` that takes it out, with the tests
that must fail under it (`bun run mutations`, or `--jobs=<n>`). So has every site of `diesIn`, `scopedIn` and
`recordThrown`, in the engine and in each tool. A new check adds its mutation; a test renamed or removed, or code
rewritten, updates the list, which the script refuses otherwise. `--discover <name>` lists every test that fails under
one, and the files that the memory guard ends under it ("ran away"): such a file's listener is fixed to stop once
done. After a change that rewrites code without changing what it does (a format, a rename), the list is rewritten to
match, and `--against=<rev>`, with the commit before, fails on a mutation that no longer changes the same code.

A killer fails alone, not only beside the others of its file. A property of fast-check is a killer only when it fails
under the mutation on each of a hundred runs, which the script does not check. A form the structure rules out (a
second read of `pending` apart from `Ledger.take`) has no mutation, and is held by the test of the transition that
rules it out (`ledger.test.ts`, `core.test.ts`); nor has a region nothing may interrupt (`docs/invariants.md`).

A mutation of the engine whose check holds a part of an item of the guide's "What you can rely on" names that item in
its `guarantees`, by its bold title without its final period; one of a tool or a bridge names none. `bun run comments`
fails on a title the list lacks and on an item no mutation names, and `bun run guarantees` prints the index. It is a
tripwire: an item reworded, or given a sentence, is weighed by hand, for which check holds it and which test fails
without it.

### Mutations of the types

Each check of the types of `program.ts` and `compose.ts` has a mutation that lets through what it refuses. Its killers
are tests of the types, named with `"typecheck"` (`["src/compose.test.ts", "<test>", "typecheck"]`): such a test fails
when `tsc`, run once on the copy, reports a diagnostic in its lines, and none may be there without the mutation. A
killer is a test of the check, the one that refuses what the check refuses, written as a user writes. A kill is checked
under TypeScript 7.0 alone, as in the CI. A check whose removal changes nothing that compiles has no mutation: it is
listed, with why, at the head of the mutations of the types. A mutation of a check that holds an item of "What does
not compile", in "Anatomy of a program" and "Composition", names it in its `refuses`, by its page and the words it
starts with, which `bun run comments` checks as it checks `guarantees`.

### A lead of the search

`bun run interleavings` searches from a seed drawn on each run. A lead is checked under
`test/scheduled.test_scheduler.ts` in both its modes. A failure under `'inline'` is an order that Effect's own
scheduler gives, but for where it preempts. One under `'queued'` alone rests on a fiber resumed later than Effect
resumes it: still a finding, since that resumption is a premise of the tests alone. A finding goes in `ROADMAP.md`
with its seed and path until a fix leaves a deterministic test of it, and is fixed by its form (`docs/premises.md`).

## In the same commit

- `docs/invariants.md` where the change alters how an invariant is kept, and `docs/premises.md` where it adds, drops or
  moves a premise.
- The guide, where a promise changes (`AGENTS.md`, "The guide promises only its rules"), and the doc comments that name
  the section.
- A changelog entry, where a consumer can notice the change ([`release`](../release/SKILL.md)).

## Checks

`bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:node` and `bun run interleavings`;
`bun run mutations` after a change of a file it mutates.
