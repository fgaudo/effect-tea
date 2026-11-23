---
name: change-engine
description: How a change of the engine of @fgaudo/effect-tea or of a testing tool is made: the invariants and the premises to read first, what to list before writing it, the deterministic test and the mutation a check leaves, how a lead of the search of interleavings is weighed, and the checks to run. Use before changing src/core.ts, shell.ts, engine.ts, run.ts, compose.ts, dispatch.ts, input.ts, log.ts or anything under src/testing/, their tests, tools/mutations/ or test/scheduled.test_scheduler.ts.
---

# Change the engine or a testing tool

The engine is `core.ts`, `shell.ts`, `engine.ts`, `run.ts`, `compose.ts`, `dispatch.ts`, `input.ts` and `log.ts`; the
testing tools are `src/testing/`. What a user may rely on is the guide's "Guarantees"; how the engine keeps each one,
and what a change must not undo, is [`docs/invariants.md`](../../../docs/invariants.md); what they rest on of Effect
and of the JavaScript engine, each with what checks it, is [`docs/premises.md`](../../../docs/premises.md).

## Before the change

1. Read `docs/invariants.md` whole, and in `docs/premises.md` the rule after the list and the premises of what the
   change touches (found by the names they cite: `reconcile`, `diesIn`, `scopedIn`, `forwardTo`, `modelsOf`). Read
   [`docs/rejected.md`](../../../docs/rejected.md) too: a change of design listed there is not proposed again
   without what its entry names under "Reopen if".
2. List the premises the change rests on. Each is checked before the change is written, and never only reasoned:
   the documentation of a stable API, or a test that fails without it, as the rule of `docs/premises.md` says. For a
   new one that no stable API documents, the owner is asked before the change is written; once the owner agrees, it
   is added there with a test of its own, apart from the library's tests (`test/premises.test.ts`), and never made
   unneeded by code written for it alone. One that cannot be checked yet holds the change up.
3. List the points where another fiber can run between a check and the act it guards ("one thunk" in
   `docs/invariants.md`). Each leaves a test that fails without the check, deterministic, of the core or with a gate,
   and a mutation that takes the check out, naming that test. The thunk that applies a message runs on the sender's
   stack, and has no such point inside it; the points are between it and the fiber of effects, and in the testing
   tools between a call's thunk and its job. A thunk writes first and offers or completes last: keep that order. In the
   engine, the jobs are offered and `died` completed only as the outermost `apply` returns, and `drive` wakes its waits
   there (`settled`), which mutations hold; their killers rest on a fiber resumed on the stack of whoever completes its
   `Deferred`, a premise of the tests alone (`docs/premises.md`), and the orders of `rehearse`'s thunks have none.
4. When the engine or one tool changes, keep the others in step: `src/testing/contract.test.ts` gives the same
   program and inputs to each tool and to the run.

## Tests

The five kinds of test, and where each lies, are in `AGENTS.md` ("Tests"). See each new test fail without what it
checks before the change is committed. The premises listed, and the tests seen to fail, are reported to the owner
with the change.

### Mutations

**Each check an invariant rests on has a mutation** in `tools/mutations/mutations.ts` that takes it out, with the tests
that must fail under it: `bun run mutations` applies them one at a time to each of several copies of the repository
(`.mutants/`, half the processors of them, or `--jobs=<n>`), runs those tests alone, and fails when one passes under
its mutation, or fails without it; what each did is printed in the order of the list. So a test that fails without
its check is run again, not only seen once. Every site of `diesIn` or `scopedIn`, in the engine and in each testing
tool, has one too, as `docs/invariants.md` says under "Defects always die": a new site adds its own. A new check adds
its mutation; a test of one renamed or
removed, or the code it replaces rewritten, updates the list, which the script refuses otherwise (a name that runs
no test, or a text not found exactly once); `bun run mutations --discover <name>` lists every test that fails
under one, and the files whose run the memory guard of the tests ends ("ran away", as `AGENTS.md` says under "Tests"):
such a file loops in one call under the mutation, and its listener is fixed to stop once done. A text found exactly once may still be found in another place than the check, once the code around it was
rewritten: after a change that rewrites the code and not what it does (a format, a new version of dprint or of its
options, a rename), the list is rewritten to match, and `bun run mutations --against=<rev>`, with the commit before
the change, runs no test and fails on a mutation that does not change the same code that runs, in the same place, as
it did there. A test that fails only beside others of its file is no killer: the list names those that fail alone. Nor
is a property of fast-check that finds a failing history only on some runs, since one run of it proves nothing: the
list names a property only when it fails under the mutation on each of a hundred runs, which the script does not
check (the search of the histories, on 15 November 2026, passed 5 of 100 under the swap of the checks of `arrive`). It
runs before a release (`release`), and after a change of a file it mutates. A mutation takes a check out: one that
writes a form the structure rules out (a second read of `pending` apart from `Ledger.take`) restores a bug that no
code of the program could reach, and no deterministic test can kill it. Such a form is held by the test of the
transition that rules it out (`ledger.test.ts`, `core.test.ts`), and has no mutation. So has a region nothing may
interrupt, which holds no code of the program for a gate to stop in: its three forms are under "one thunk" in
`docs/invariants.md`, and the checks beside it keep their mutations.

A mutation of the engine whose check holds a part of an item of the guide's "What you can rely on" names that item in
its `guarantees`, by its bold title without the final period; one of a testing tool or of a bridge names none, since the
list is about a running program. `bun run comments` fails on a title the list does not have, and on an item no mutation
names, and `bun run guarantees` prints each item with the mutations that name it and their killers. It is an index, and
no more: a title is a judgement written by hand, an item with many checks may still have a sentence that none holds,
and the search, which checks every item, kills no mutation. So an item reworded, or given a sentence, is weighed by
hand: which check holds the new sentence, and which test fails without it.

### Mutations of the types

Each check of the types of `program.ts` and `compose.ts` has a mutation too, which makes the check let through what it
refuses: an optional piece where one is required, `any` where a state is read, a branch that refuses made `unknown`.
Its killers are tests of the types, named with `"typecheck"` (`["src/compose.test.ts", "<test>", "typecheck"]`): such
a test is not run, and fails when `tsc`, run once on the root project of the copy under the mutation, reports a
diagnostic in its lines, from its call to the line that closes it. An `@ts-expect-error` that nothing refuses any more
is one. Without the mutation, no diagnostic may be in them. `--discover` names, for a mutation that changes no code
that runs, the tests of the types whose lines hold a diagnostic, and the diagnostics outside any test, and runs no
other test. `--against` tells such mutations apart by their tokens, since the JavaScript they leave is the same.

A killer is a test of the check, not one that a broken type happens to fail: a required piece made optional fails
every test that calls it, and only the test that refuses a program without it holds the check. The check is held by
what a user writes: a place or an input that is no literal is checked where a literal would be refused as having
fields too many. A kill is checked under TypeScript 7.0 alone, as the tests of the types are in the CI.

A check whose removal changes nothing that compiles, or lets through only a piece that nothing calls, has no mutation:
it is listed, with why, at the head of the mutations of the types in `tools/mutations/mutations.ts`, since
`docs/invariants.md` lists no checks of the types. A mutation of a check that holds a part of an item of "What does
not compile", in the guide's "Anatomy of a program" and "Composition", names it in its `refuses`, by its page and the
words it starts with, as `guarantees` names an item of "What you can rely on": `bun run comments` fails on words that
start no item or more than one, and on an item no mutation names. The other pages that say "does not compile" are not
tied: the tie is a tripwire for an item added to the two lists, no more.

### A lead of the search

`bun run interleavings` (`src/interleaving.test.ts`) is a search, from a seed drawn on each run. A lead it finds is
checked under `test/scheduled.test_scheduler.ts` in both of its modes of resumption. A failure under `'inline'` is an
order Effect's own scheduler gives, but for where it preempts, and so reachable when the program runs. One under
`'queued'` alone (the default) rests on a fiber resumed by a `Deferred` or a `Fiber.join` waiting for its turn, where
Effect 4.1.5 resumes it at once on the stack of the fiber that completes it: still a finding, since that inline
resumption is a premise of the tests alone (`docs/premises.md`), and no guarantee rests on it. A finding is
listed in `ROADMAP.md` with its seed and path until a fix leaves a deterministic test of it; no mutation names it among
its killers.

A finding is fixed by its form, not only by the sequence that found it, as `docs/premises.md` says after the rule of
a review.

## In the same commit

- `docs/invariants.md`, where the change alters how an invariant is kept or the names it cites, and
  `docs/premises.md`, where it adds, drops or moves a premise or renames a test one names.
- The guide (`site/guide/`), where a promise changes: it is a specification, and its prose changes as `AGENTS.md` says;
  then the doc comments that name the section (`@see`), which are read again and follow it.
- A changelog entry, where a consumer can notice the change, after the four questions of
  [`release`](../release/SKILL.md).

## Checks

`bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:node` and `bun run interleavings`;
`bun run mutations` after a change of a file it mutates.
