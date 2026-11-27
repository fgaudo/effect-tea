---
name: premise-review
description: How a review of the premises of @fgaudo/effect-tea is done: a reviewer that wrote none of the changes reads the invariants of docs/invariants.md, what they rest on (docs/premises.md) and the guide's "Guarantees" against the code, and reproduces what it finds with a failing test; then what becomes of its findings, its leads and what it ruled out, and how a finding is fixed, by the cell of the table of the actors that it was in. Use before a release, over the changes of the engine, of the testing tools and of the bridges since the last review; over all of the code before the library is made known and before 1.0; or when the author asks whether an invariant still holds.
---

# A review of the premises

A change of the engine, of a testing tool or of a bridge may take away a premise of an invariant of
[`docs/invariants.md`](../../../docs/invariants.md) without a test failing, until a run meets the case: commit f415d46
fixed one, a defect lost as `FiberMap` closes. This review looks for the same, by the rule of
[`docs/premises.md`](../../../docs/premises.md): a reading gives a lead, and a finding is a test that fails.

## Before it starts

1. Choose what the review reads: the invariants, premises and guarantees that the changes since the last review touch
   (`git log <the last review's commit>..main`), by the modules they changed and the names those cite, or all of them
   before the library is made known and before 1.0. A review is due before a release, not after each change.
2. The reviewer wrote none of the changes. Start it in a worktree of its own, cut from the last commit, so that its
   failing tests stay off `main` until they are read. Three reviewers read apart: the engine, the testing tools and
   the bridges. The types are no area of a review: the tests of the types and `bun run inference` hold them, for the
   forms of the guide.
3. Fill the brief's two places: what to read, and what is already known (the open problems of
   [`ROADMAP.md`](../../../ROADMAP.md), the `test.failing` cases of `src/testing/contract.test.ts`, and the premises
   that no test reaches yet, listed in `docs/premises.md`), so that the reviewer does not report them again, and
   what was rejected ([`docs/rejected.md`](../../../docs/rejected.md)), so that it does not propose one again.

## The reviewer's brief

Start the reviewer with this brief, with its two places filled in:

```text
Read AGENTS.md, docs/invariants.md and docs/premises.md first: the rules, the invariants and what they rest on bind
you. The guide's "Guarantees" (site/guide/guarantees.md), "Testing tools" for the testing tools, and "Writing a
bridge" for the bridges, say what the library promises a user.

THE KIND OF BUG: a change takes away a condition an invariant or a guarantee needs, written or unwritten, and no
test fails until a run meets the case. It often does so where a value is taken to its end (none, the same state,
a key that goes and comes back, a scope that closes), or where Effect does something its documentation does not
promise. Commit f415d46 is one found and fixed, a defect lost as FiberMap closes: read it as the example, and do
not report it again.
Most of all it does so where a second actor comes. docs/invariants.md, "Who may act, and when", holds one table of
the actors (the program's effects, the renderer, whoever runs the program, the scenario of a testing tool) by the
moments they may act at (between two tasks, at a yield of Effect's scheduler, in a job of the fiber of effects, taken
or not yet, in a callback of a step, in a wake of the finally, during the end). Read the code that keeps a row against each cell of that table: what the actor may do
there, and whether the entry it makes keeps the property of a step ("A step, and who may enter it"). A cell that
says "none yet" has no test: look there first. An actor or a moment that the table lacks is a finding of its own.
Every bug of the hunt of 27 November 2026 that a review had missed was an act made whole only against the actor its
author had in mind (commit 73aeb05, and the end of a run stopped from a listener).
Two kinds of bug are of no cell. Look for each:
- A cost in memory or in time that grows with the number of messages, or of keys, children or answers, with no need:
  a list copied at each message, a table that keeps what has ended. Found: applyAll, simulate and Stage copied their
  lists at each message.
- A tool that imitates a dependency and does otherwise than it: a testing tool that runs what the engine runs, a
  bridge's tool that does what a renderer does. Found: messagesSentBy called a listener of a thunk as snabbdom does
  not.

WHAT COUNTS: a bug of a program written as the guide teaches (AGENTS.md, "What the library owes, and to whom"), as
it runs: its orders, its interruptions, its costs. The program of your test is made of the forms that the guide and
the examples show. A form that no page shows, or a corner of JavaScript or of TypeScript under one that a page
shows, is unspecified: do not look for one, and report none, as a finding or as a lead.

WHAT TO READ: <the invariants, premises and guarantees, and the modules of src/ that keep them>.

ALREADY KNOWN, not to report again: <the open problems of ROADMAP.md, the test.failing cases of
src/testing/contract.test.ts, and the premises that no test reaches yet of docs/premises.md, one line each>. A bug
of the same form under another sequence is a new finding. ALREADY REJECTED, not to propose again: read
docs/rejected.md before you propose any fix or change of design; one you propose that is listed there says what its
entry names under "Reopen if", or what reason the entry does not answer.

HOW:
1. List what you read before you read any of it: each invariant, premise and guarantee, with the declarations of
   src/ that keep it (found by the names the invariant cites and by `grep`), and the test docs/premises.md names for it.
   Write the list as the table of your report, one row each, before step 2.
2. For each row, read the code that keeps it and its test. Write down every condition it needs to hold, the unwritten
   ones too: an order of two fibers, a scope still open, a key compared only inside one call, a state never mutated,
   one call per message. Then ask whether the code still gives each condition, in every case it opens, and whether
   the test would fail without it.
3. A suspect is a finding only once you have tried to confirm it: a test that fails, written beside the module it
   tests, through behaviour (`run`, `Engine.make`, the public functions), of a program that WHAT COUNTS takes. A
   reading of the code alone, or of Effect's
   source, gives a lead and no finding: report it as a lead, with the test that would reproduce it. Run only the
   tests you need.
4. A suspect is ruled out as docs/premises.md says: by the documentation of a stable
   API (for Effect, the JSDoc of the declarations in the version of the lockfile, where the peer range starts; for
   the JavaScript engine, the ECMAScript specification), or by a test that passes for what is not documented.
   Effect's source, effect.website, the examples of its package (`ai-docs`) and its maintainers' answers rule out
   nothing. A property of src/interleaving.test.ts rules a suspect out only under the runs it made: run it with
   `numRuns` of a thousand at least, and name the seeds.
5. While you read the code that keeps a row, note each place where it does otherwise than AGENTS.md,
   docs/invariants.md or the guide says, and each test whose name promises more than its assertions check.

RULES: fix nothing, and change no file other than the tests that reproduce a finding. Mark each such test
`test.failing`, with a name that says what should hold, so that the suite stays green until the fix. Commit the tests
on your branch, with your report as the commit's body, and push nothing. Other reviewers may run at the same time in
other worktrees: do not touch main or their branches.

YOUR REPORT, the deliverable, in this order:
- The table of step 1: each row, the code and the test, and how you read it: whole, or in part (say which part).
- Each finding, with the invariant or premise that fell, the sequence that breaks, the files and lines, the test that
  reproduces it, and where a fix could begin. Each lead, with the same, and the test that would reproduce it.
- The suspects you ruled out, each with its reason in a line: the test (with its runs and seeds), or the
  documentation, with the declaration or the section of the specification.
- Every suspect you noticed and did not check, with the sequence you suspect, and why it is left.
- Each place where the code does otherwise than AGENTS.md, docs/invariants.md or the guide says, and each test
  whose name says more than it checks, with the file and line.
Your last message says the branch, the commit and the findings in a few lines.
```

## What to do with the report

- Read the report from the branch (`git log -1 --format=%B <branch>`), its table first: a row read in part is a gap,
  and the reviewer reads it on the same branch before the report is acted on.
- Run the reviewer's tests yourself, without their `test.failing` mark, and again on the commit of `main` the branch
  was cut from. A test that fails by an error of its own setup, not at its assertion, proves nothing.
- A finding is an open problem of `ROADMAP.md`, and its test comes to `main` with its `test.failing` mark. Its fix,
  by the rule of fixes of `docs/premises.md`, removes the mark and the item in one commit, names the cell of the table
  that the bug was in, adds the generator of the search or the row of `contract.test.ts` that would have found it, and
  names the places it checked: `startWith`, the engine's finalizer, `drive`, `simulate`, `rehearse`, and any added
  since.
- A fix or a design the report proposes is read against `docs/rejected.md`; one rejected is added there.
- A suspect ruled out by a test, resting on what Effect or the JavaScript engine does without promising it, is a
  premise, added to `docs/premises.md` with its test. One ruled out by a stable API's documentation is no premise.
- A lead, or a suspect left unchecked, gets the test that would reproduce it: one that fails makes it a finding, one
  that passes rules it out. A lead no test can reach yet goes under "Premises that no test reaches yet".
- A place where the code does otherwise than `AGENTS.md`, `docs/invariants.md` or the guide says is a bug of one or
  the other.
- Do not merge the reviewer's branch whole: take what the points above bring to `main`.
