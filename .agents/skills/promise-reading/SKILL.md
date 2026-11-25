---
name: promise-reading
description: How the promises of @fgaudo/effect-tea are read against its tests, and the rules of its guide against its examples: readers that change no file list each sentence that says what the library does (under the "Rules" of a page, under "What you can rely on", in the doc comment of an export) and find the test that would fail if it were false, then each rule that a program keeps and each piece of advice, and look for the example that breaks it; then what becomes of a promise that no test holds, of a sentence false of the code, and of an example that breaks a rule. Use before a release, over what changed since the last reading, before the release of 1.0 over all of it, or when the author asks whether the tests hold what the guide promises.
---

# A reading of the promises against the tests

The library promises what stands in four places ([`site/guide/index.md`](../../../site/guide/index.md), "What a page
promises"): the "Rules" of a page of the guide, "What you can rely on" in "Guarantees", the doc comment of an export,
and the types. A test checks each promise (`AGENTS.md`, "What belongs here"), and no tool can say that one does: a
promise is a sentence, and what holds it is the body of a test. So a change may add a promise with no test, or take
away the test of one, and every check passes. The examples have the same gap from the other side: they follow the
rules that the guide gives a program, and nothing checks that they do.

This reading looks for both. Its method was run once before it was a skill
([`promises-and-tests.md`](../../../docs/records/promises-and-tests.md)), on the guide alone as it was on 21 November
2026: of 488 sentences, 65 had no test, or one of a part only, and one was false.

## What is read

The reading has two halves, and each has two sides:

- **What the library does, against the tests**: the sentences of promise, and the tests of `src/`, `test/`,
  `bridges/` and `examples/`.
- **What a program must do, against the examples**: the rules that a program keeps and the advice, and the code that
  a user copies, which is `examples/` and each block written in place in the guide and in the README. No tool checks
  those blocks against the rules.

**A reading before a release reads what changed since the last one, each side against the whole of the other**: a
sentence that changed against every test, and a test that changed against every sentence. A sentence and a test that
both stand as they were read are still a pair, unless they were matched wrongly then. Only a reading of everything
finds such a match: it is due before the release of 1.0, and where the last reading cannot be named. A line of
[`ROADMAP.md`](../../../ROADMAP.md), "Next, in order", names the commit of the last reading, and the release that the
next one is due before.

```sh
last=<the commit of the last reading>
git diff $last..main -- site/guide                                   # the guide's sentences
git diff $last..main -- src bridges ':!*.test.ts' ':!*.test_*.ts'    # the doc comments, among the code
git diff $last..main -- api                                          # what the types accept and refuse
git diff $last..main -- '*.test.ts' '*.test_*.ts' tools/mutations/mutations.ts
git diff $last..main -- examples README.md skills site/tutorial      # what a user copies, and what sums up the guide
```

What has changed, on each side:

- **A sentence of promise** that is new, worded otherwise, or moved. A sentence that the diff removes is looked for
  where it went: a doc comment, another page, or nowhere. One that went nowhere is a promise withdrawn, and has its
  changelog entry ([`release`](../release/SKILL.md)), or gets it.
- **A line of the API's reports** that is removed or narrowed. It is a refusal, which perhaps no sentence states: its
  test of the types is looked for as a sentence's is. The reports are read by their diff alone, in a reading of
  everything too, from the commit or the tag that the roadmap's line names: each check of the types that was there
  before has its mutation ([`change-engine`](../change-engine/SKILL.md)).
- **A test** that is removed, or that lost an assertion, and a mutation removed. The sentence that it held is looked
  for among the promises, and then another test of that sentence. A test may hold a sentence by how the program that
  it runs is written, as a test of an example does: where that program changed, the test is matched again.
- **A rule that a program keeps, or a piece of advice**, read against every example and block; and **an example or a
  block**, read against every rule.

## Before it starts

1. Run the diffs, and choose: the changes, or everything. A diff that holds most of the guide is a reading of
   everything.
2. The readers are subagents that change no file, so they need no worktree. Split the first half by the pages of the
   guide: a reader takes a page, with the doc comments of `src/` and `bridges/` that name it
   (`@see The guide, "<page>".`), each read whole by the reader of the page that it names first. "Guarantees" has a
   reader of its own. A doc comment that names no page and a test that changed go to the reader of the page whose
   words they use, and the diff of the API's reports stays with the session. The second half has one reader, or one
   for each few examples in a reading of everything.
3. Fill the briefs' places: what to read, and what is already known, so that a reader does not report it again: the
   gaps that `ROADMAP.md` lists.

## The brief of a reader of the promises

```text
You read what a library promises against its tests, and you change no file. Read AGENTS.md first, "What belongs
here", from "Three places say what the library does" to "A finding of a review": it says where a promise stands, and
what is unspecified. Then site/guide/index.md, "What a page promises".

WHAT TO READ: <the pages of site/guide/, and the doc comments of src/ and bridges/ that name them, by file and
export. In a reading of changes: the diff of each, where you read whole each rule, item or comment that a changed
line is in, and the tests removed or changed, each with the question of which sentence it held>. For step 5 alone,
read what sums up each page too: its rows of site/guide/glossary.md, its line of site/guide/index.md, and its part
of the tutorial (site/tutorial/) and of skills/effect-tea/SKILL.md.

A SENTENCE OF PROMISE says what the library, a testing tool or a bridge does as a program runs, or what the compiler
refuses or infers for a program. It stands under the "Rules" of a page, under "What you can rely on" in
site/guide/guarantees.md, or in the doc comment of something that src/index.ts, src/testing/index.ts or a bridge
exports: check that it does. In those places a sentence may say what a user's program must do instead: that is A
RULE THE PROGRAM KEEPS, which you list apart, with no test. A sentence that is both is in both lists. List neither
of: a definition, a reason, the code of an example, a sentence that says again one of the same page or comment, a
consequence of a sentence already listed, what Effect, a renderer or a browser does, and what a sentence says is
unspecified. "What is left to you", in site/guide/guarantees.md, adds no promise: a sentence of it that says what the
library does is promised by the page that its item links, and is a note of step 5 where that page does not say it.

ALREADY KNOWN, not to report again: <the gaps that ROADMAP.md lists, one line each>.

HOW:
1. List the sentences before you look for any test: a row each, with its page and rule, or its file and export, and
   the sentence, cut short. A sentence that promises two things is two rows.
2. For each row, find the test that would fail if the sentence were false, in src/, test/, bridges/ or examples/.
   Decide it from the body of the test, what it runs and what it asserts, never from its name: a test that runs the
   code and asserts nothing that the sentence rules does not count, and a test that asserts through a helper is read
   with its helper. Search every test file by the names that the sentence uses, not only the tests of its module.
   Give the file, the name of the test, and the assertion.
3. A promise of what does not compile needs a `@ts-expect-error` in a test file, and one of what is inferred an
   `expectTypeOf`. For an item of "What you can rely on", `bun run guarantees` prints the tests that kill the
   mutations of its checks: look there first. It is an index of the item, and each sentence of the item still needs
   a test of its own.
4. A sentence with no such test is a gap, of one of four kinds. NO TEST. PART: a test checks a part of it, and you
   name the part that none checks, often one case of several that the sentence names (a command and not a
   subscription, a child and not a child by id). SEARCH ALONE: only src/interleaving.test.ts checks it, which runs
   apart from `bun run test`. SMOKE ALONE: only tools/smoke/ does, which is no test of the library. A test that only the
   browsers run (bridges/browser.test.ts, bridges/fast-refresh.test.ts) does hold a sentence about a browser. Mark a
   gap NEGATIVE where the sentence says what the library never does, or that only one thing does it: a test holds
   such a sentence for the cases that it tries, and you name those that a user would try and no test does.
5. Note as you read: a sentence that the code or a test shows to be false; a sentence that two places say with a
   difference (a page and a doc comment, a page and the glossary, the tutorial or skills/effect-tea/SKILL.md), with
   both quoted; and a sentence outside the three places that says what the library does, and that no rule says (in
   an "In short", an "Advice", the prose of an example).

YOUR REPORT, in this order: the table of step 1, each row with its test or its gap; the rules that the program keeps;
the gaps, each with its kind, the tests you read for it, and the test that would hold it; the notes of step 5, each
with its file and line; the sentences that you could not sort, each with why; and what you did not read.
```

## The brief of a reader of the examples

```text
You read the rules that a guide gives a user's program against the code that its library ships for users to copy,
and you change no file. Read AGENTS.md first, "What belongs here", from "Three places say what the library does" to
"A finding of a review". Then site/guide/index.md, "What a page promises" and "How a page is laid out".

THE RULES: <every sentence under the "Rules" of a page of site/guide/ that says what a program must do, every item of
"What is left to you" in site/guide/guarantees.md, and every piece of a section "Advice". In a reading of changes:
those that changed, listed here>. Under "Rules", a sentence that says what the library does is a rule here too,
where a program written as if it were not so is wrong: an `update` that takes its answers in the order of its
commands.

THE CODE: <examples/, its tests too, and each block of code written in place in site/guide/ and README.md, a sketch
that does not compile too; a `{@includeCode}` is a region of an example. In a reading of changes: the files that
changed, listed here, read against every rule>. A block that a comment marks as what not to write breaks its rule on
purpose: check that it does, and that the page gives the rule.

HOW:
1. List the rules before you read the code: a row each, with its page, and what code that broke it would look like.
2. For each rule, look for the code that breaks it: first by `grep` for what a break would name, then by reading
   each program, view and test whole, since a break often names nothing (a flag in a state, a view that decides).
3. Advice binds no user, and the examples follow it all the same. Report code that leaves a piece of advice as you
   report a break, and say whether it is the case that the advice itself names as where it does not hold, or that
   the advice names none.
4. Read each comment of the code that gives a reason. Name the rule or the advice that it rests on, and say where a
   user reads it today: a page of the guide or of the tutorial, or the doc comment of an export, those of bridges/
   among them. A comment that names a section of a page names one that is there. A comment that gives a rule of the
   library that none of those places gives is a finding: an example never brings the rule that allows it.

YOUR REPORT, in this order: the table of step 1, each row with the breaks you found, by file and line, or with the
files you read and found none in; the comments of step 4, each with its rule; and what you did not read.
```

## What to do with the reports

- Read each table first: a page, a comment or an example that a reader read in part is a part left unread, and is
  read before the report is acted on.
- Check each gap before it counts: search the tests for it yourself, in the files that the reader did not name. Six
  gaps of the first reading had a test that its reader had not found.
- Settle a match that you doubt by the code: in a worktree, change the code so that the sentence is false, and run
  the test named, which must fail. A check that an invariant rests on has its mutation for this
  ([`change-engine`](../change-engine/SKILL.md)).
- **A promise that no test holds** is weighed first as a sentence (`AGENTS.md`, "A sentence stays in the guide only
  where…"): in doubt, a behaviour is unspecified. One that stays gets its test, beside its module, of one of the
  kinds of `AGENTS.md`, "Tests", and seen to fail once as above. A part that none checks is a case added to the test
  that has the others; a sentence that the search or the smoke test alone checks gets a test of its own. A negative
  gets the test of a case only where a user would try that case: what the library never does is otherwise held by
  the test of what it does. A promise that goes is withdrawn: its sentence is cut, or says in a few words that it is
  unspecified, with a `**Breaking**` entry where the last release made the promise (`release`).
- **A sentence false of the code** is a bug of one of the two. Where it is the code's, it is an open problem of
  `ROADMAP.md`, with its `test.failing`, and is fixed as any other. Where it is the sentence's, the promise changes as
  `AGENTS.md` says one does: one sentence at a time, checked against the old one, with its changelog entry.
- **Two places that differ**: the place where the promise stands rules, which is the doc comment for what an export
  refuses and throws, the page for a rule, and "Guarantees" for what holds of a run. The other is set to it, or cut
  for a link.
- **A sentence that says more than the rules**, outside the three places, is cut, or worded so that it explains. One
  that a reader could not sort is worded until it can be, or moved to the section that it belongs to.
- **Code that breaks a rule** is fixed ([`add-example`](../add-example/SKILL.md)). Where the example is right, and
  the rule says too much, the rule is what changes, decided first (`add-example`, "An example that needs more than
  the guide gives"). Code that leaves a piece of advice is fixed too, or the advice names its case.
- **A comment of an example** whose rule changed is written again. One that brings a rule gives it up to the doc
  comment or the page that should hold it.
- What the reading's own step does not close is a step of `ROADMAP.md`, which lists each gap left by its sentence.
  The commit that ends a reading says, in its body, how many sentences were read, the gaps of each kind, and what
  became of each. The line of `ROADMAP.md` then names that commit by its subject, as `git log --grep` finds it.
