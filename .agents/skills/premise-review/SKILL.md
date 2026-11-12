---
name: premise-review
description: How a review of the premises of @fgaudo/effect-tea is done: a reviewer that did not write the change reads the invariants of AGENTS.md, what they rest on and the README's "Guarantees" against the code, and reproduces what it finds with a failing test; then what becomes of its findings, its leads and what it ruled out. Use when a change of the engine or of a testing tool adds a premise, before 1.0, or when the author asks whether an invariant still holds.
---

# A review of the premises

An invariant of [`AGENTS.md`](../../../AGENTS.md) holds only while what it rests on does: the purity of the
program's code, states never mutated, and the behaviour of Effect's runtime and of the JavaScript engine. A change
of the engine, or of a testing tool, may take a premise away without a test failing, until a run meets the case: the
review of November 2026 found that a defect while the end of the run releases a subscription or a command was lost,
since `FiberMap` and `FiberSet` discard the exits of the fibers they interrupt as they close (f415d46). This review
looks for the same. Its rule is in `AGENTS.md`, under "What the invariants rest on": a reading of the code alone
gives a lead, and a finding is reproduced by a test that fails, or ruled out by a test that passes or by Effect's
documentation in the oldest version of the peer range.

## Before it starts

1. Choose what the review reads: the invariants, premises and guarantees a change touches, by the modules it
   changed and the names those cite (`reconcile`, `diesIn`, `dispatchTo`, `modelsOf`), or all of them before 1.0.
   The author may name others.
2. The reviewer did not write the change. Start it as a session in a worktree of its own, so that its failing tests
   stay off `main` until they are read, or as a subagent where the author asks for one. Commit what the review must
   see first: a worktree is cut from the last commit. Two reviewers at once read apart: the engine (`engine.ts`,
   `run.ts`, `compose.ts`, `dispatch.ts`, `log.ts`) and the testing tools (`src/testing/`).
3. Fill the brief's two places: what to read, and what is already known (the open problems of
   [`ROADMAP.md`](../../../ROADMAP.md), the `test.failing` cases of `src/testing/contract.test.ts`, and the premises
   that no test reaches yet, listed in `AGENTS.md`), so that the reviewer does not report them again.

## The reviewer's brief

Start the reviewer with this brief, with its two places filled in:

```text
Read AGENTS.md first: its invariants, what they rest on and its rules bind you. The README's "Guarantees", and
"Testing" for the testing tools, say what the library promises a user.

THE KIND OF BUG: a change takes away a condition an invariant or a guarantee needs, written or unwritten, and no
test fails until a run meets the case. It often does so where a value is taken to its end (none, the same state,
a key that goes and comes back, a scope that closes), where a second actor comes (a fiber that ends while the run
ends, a message left in the queue, a renderer that sends from a plain callback, a testing tool that runs what the
engine runs), or where Effect does something its documentation does not promise. Commit f415d46 is one found and
fixed, a defect lost as FiberMap closes: read it as the example, and do not report it again.

WHAT TO READ: <the invariants, premises and guarantees, and the modules of src/ that keep them>.

ALREADY KNOWN, not to report again: <the open problems of ROADMAP.md, the test.failing cases of
src/testing/contract.test.ts, and the premises that no test reaches yet of AGENTS.md, one line each>. A bug of the
same form under another sequence is a new finding.

HOW:
1. List what you read before you read any of it: each invariant, premise and guarantee, with the declarations of
   src/ that keep it (found by the names the invariant cites and by `grep`), and the test AGENTS.md names for it.
   Write the list as the table of your report, one row each, before step 2.
2. For each row, read the code that keeps it and its test. Write down every condition it needs to hold, the unwritten
   ones too: an order of two fibers, a scope still open, a key compared only inside one call, a state never mutated,
   one call per message. Then ask whether the code still gives each condition, in every case it opens, and whether
   the test would fail without it.
3. A suspect is a finding only once you have tried to confirm it: a test that fails, written beside the module it
   tests, through behaviour (`run`, `Engine.make`, the public functions). A reading of the code alone, or of Effect's
   source, gives a lead and no finding: report it as a lead, with the test that would reproduce it. Run only the
   tests you need.
4. A suspect is ruled out by a test that passes, or by the documentation (the JSDoc of the declarations) of the
   oldest Effect of the peer range, `bun add --dev --exact effect@<minimum>` in a scratch copy of the repository, as
   the CI's `minimum-effect` job does. Effect's source, effect.website and its maintainers' answers rule out nothing.
   A property of src/interleaving.test.ts rules a suspect out only under the runs it made: run it with `numRuns` of a
   thousand at least, and name the seeds.
5. While you read the code that keeps a row, note each place where it does otherwise than AGENTS.md or the README
   says, and each test whose name promises more than its assertions check.

RULES: fix nothing, and change no file other than the tests that reproduce a finding. Mark each such test
`test.failing`, with a name that says what should hold, so that the suite stays green until the fix. Commit the tests
on your branch, with your report as the commit's body, and push nothing. Other reviewers may run at the same time in
other worktrees: do not touch main or their branches.

YOUR REPORT, the deliverable, in this order:
- The table of step 1: each row, the code and the test, and how you read it: whole, or in part (say which part).
- Each finding, with the invariant or premise that fell, the sequence that breaks, the files and lines, the test that
  reproduces it, and where a fix could begin. Each lead, with the same, and the test that would reproduce it.
- The suspects you ruled out, each with its reason in a line: the test (with its runs and seeds), or the
  documentation of the oldest Effect of the peer range, with the declaration.
- Every suspect you noticed and did not check, with the sequence you suspect, and why it is left.
- Each place where the code does otherwise than AGENTS.md or the README says, and each test whose name says more than
  it checks, with the file and line.
Your last message says the branch, the commit and the findings in a few lines.
```

## What to do with the report

- Read the report from the branch, `git log -1 --format=%B <branch>`, not from the last message alone, which says
  less.
- Read the report's table before its findings. A row read in part is a gap: send the reviewer back to read it, on the
  same branch, before you act on the report.
- Run the reviewer's tests yourself, without their `test.failing` mark, before you tell the author of a finding. A
  report is the reviewer's, and no proof: a test that fails by an error of its own setup, and not at its assertion,
  proves nothing. Run each again on the last commit of `main` where the branch was cut before it.
- A finding is an open problem of `ROADMAP.md` until it is fixed, and its test may come to `main` with its
  `test.failing` mark, as those of the November review did. Its fix removes the mark and the item, in one commit.
- A suspect ruled out by a test that rests on Effect or on the JavaScript engine is a premise: its test comes to
  `main`, and the premise is added to "What the invariants rest on" with it. One ruled out by the documentation needs
  nothing.
- A lead, and a suspect left unchecked, are no findings yet. Write the test that would reproduce each, here or in a
  session of its own, and run it: a test that fails makes it a finding, one that passes rules it out. A lead no test
  can reach yet goes under "Premises that no test reaches yet" in `AGENTS.md`, with what would decide it.
- A place where the code does otherwise than `AGENTS.md` or the README says is a bug of the one or of the other: the
  README is a specification, and its prose changes as `AGENTS.md` says.
- Do not merge the reviewer's branch whole: take what the points above bring to `main`, and nothing else.
