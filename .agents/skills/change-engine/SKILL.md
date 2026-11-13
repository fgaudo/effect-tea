---
name: change-engine
description: How a change of the engine of @fgaudo/effect-tea or of a testing tool is made: the invariants and the premises to read first, what to list before writing it, the deterministic test and the mutation a check leaves, how a lead of the search of interleavings is weighed, and the checks to run. Use before changing src/core.ts, engine.ts, run.ts, compose.ts, dispatch.ts, log.ts or anything under src/testing/, their tests, mutations/ or test/scheduled.ts.
---

# Change the engine or a testing tool

The engine is `core.ts`, `engine.ts`, `run.ts`, `compose.ts`, `dispatch.ts` and `log.ts`; the testing tools are
`src/testing/`. What a user may rely on is the README's "Guarantees"; how the engine keeps each one, and what a
change must not undo, is [`docs/invariants.md`](../../../docs/invariants.md); what they rest on of Effect and of the
JavaScript engine, each with what checks it, is [`docs/premises.md`](../../../docs/premises.md).

## Before the change

1. Read `docs/invariants.md` whole, and in `docs/premises.md` the rule after the list and the premises of what the
   change touches (found by the names they cite: `reconcile`, `diesIn`, `scopedIn`, `dispatchTo`, `modelsOf`).
2. List the premises the change rests on. Each is checked before the change is written, and never only reasoned:
   the documentation of a stable API, or a test that fails without it, as the rule of `docs/premises.md` says. A new
   one is added there, with what checks it; one that cannot be checked yet holds the change up.
3. List the points where another fiber can run between a check and the act it guards ("one thunk" in
   `docs/invariants.md`). Each leaves a test that fails without the check, deterministic, of the core or with a gate,
   and a mutation that takes the check out, naming that test.
4. When the engine or one tool changes, keep the others in step: `src/testing/contract.test.ts` gives the same
   program and inputs to each tool and to the run.

## Tests

The five kinds of test, and where each lies, are in `AGENTS.md` ("Tests"). See each new test fail without what it
checks before the change is committed.

### Mutations

**Each check an invariant rests on has a mutation** in `mutations/mutations.ts` that takes it out, with the tests
that must fail under it: `bun run mutations` applies them one at a time to a copy of the repository (`.mutants/`),
runs those tests alone, and fails when one passes under its mutation, or fails without it. So a test that fails
without its check is run again, not only seen once. A new check adds its mutation; a test of one renamed or
removed, or the code it replaces rewritten, updates the list, which the script refuses otherwise (a name that runs
no test, or a text not found exactly once); `bun run mutations --discover <name>` lists every test that fails
under one. A test that fails only beside others of its file is no killer: the list names those that fail alone. It
runs before a release (`release`), and after a change of a file it mutates. A mutation takes a check out: one that
writes a form the structure rules out (a second read of `pending` apart from `Ledger.take`) restores a bug that no
code of the program could reach, and no deterministic test can kill it. Such a form is held by the test of the
transition that rules it out (`ledger.test.ts`, `core.test.ts`), and has no mutation.

### A lead of the search

`bun run interleavings` (`src/interleaving.test.ts`) is a search, from a seed drawn on each run. A lead it finds is
checked under `test/scheduled.ts` in both of its modes of resumption. A failure under `'inline'` is an order
Effect's own scheduler gives, but for where it preempts, and so reachable when the program runs. One under
`'queued'` alone (the default) rests on a fiber resumed by a `Deferred` or a `Fiber.join` waiting for its turn,
where Effect 4.1.4 resumes it at once on the stack of the fiber that completes it: still a finding, since that
inline resumption is read only in the source, unless it is added as a premise with a test that fails without it.
A finding is listed in `ROADMAP.md` with its seed and path until a fix leaves a deterministic test of it; no
mutation names it among its killers.

A finding is fixed by its form, not only by the sequence that found it, as `docs/premises.md` says after the rule of
a review.

## In the same commit

- `docs/invariants.md`, where the change alters how an invariant is kept or the names it cites, and
  `docs/premises.md`, where it adds, drops or moves a premise or renames a test one names.
- The README, where a promise changes: it is a specification, and its prose changes as `AGENTS.md` says.
- A changelog entry, where a consumer can notice the change ([`release`](../release/SKILL.md)).

## Checks

`bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:node` and `bun run interleavings`;
`bun run mutations` after a change of a file it mutates.
