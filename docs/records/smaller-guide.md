# A guide that teaches, and doc comments that specify

**Status:** decided on 25 November 2026 by a session of Fable 5.2, as step 73 of [`ROADMAP.md`](../../ROADMAP.md),
after the owner asked for a guide that a reader can take in. Tried on two pages, "Composition" and "Structuring a
program". The other pages follow in steps 74 to 78, once the owner has read the two.

## Why

The guide was 18 pages, 34,025 words and 572 items of lists. It grew by three rules of `AGENTS.md` together: it was
the manual and the specification at once, so each behaviour that a test checks was a sentence of it; a doc comment
and the skill said each detail again (231 lines of `@see The guide, "<page>", "<section>"`); and a review that found
the guide silent added a sentence. A reader met hundreds of rules, and five of "Splitting a program" were not true in
general.

## Decided

- **Three places, each with one job.** The guide teaches: a concept, an example, and the few rules that a user keeps
  or builds on. The doc comment of an export specifies it, with its types. "Guarantees" alone lists what holds of a
  run, and what is left to the user. A promise stands in one of them (`AGENTS.md`, "What belongs here").
- **One test for each sentence of the guide**: it stays only where a user who has read it would write their program
  otherwise. The others go to the doc comment of an export (what the compiler, or the message of a defect, says as it
  happens), become unspecified (a corner that no user builds on), are cut for a link, or become advice, in a section
  "Advice" that binds nothing.
- **A doc comment names a page, not a section**: `@see The guide, "<page>".` A section named was a second index of
  the guide, which broke at each heading reworded. The comment now holds the rule itself, so the hover needs no
  section. `bun run comments` still checks a section where an older comment names one, until step 78.
- **"Do and don't" is no part of the form.** It said the rules of its page again. Where a pair of code teaches, it
  stands with its advice.
- **A ceiling of words for each page written again**, held by `bun run comments` (`ceilings`): a review that would add
  a sentence finds the type, the defect's message or the doc comment first.
- **The list "What does not compile" of "Composition" is gone from the guide**, and with it the `refuses` of the 24
  mutations that named its items: each check of the types still has its mutation (`change-engine`), and the list was a
  second index of them.

## What the trial gave

| Page                    | Words before | Words after | Sentences | Guide | Doc comment | Unspecified | Cut | Advice or explanation | Its example |
| ----------------------- | ------------ | ----------- | --------- | ----- | ----------- | ----------- | --- | --------------------- | ----------- |
| "Composition"           | 3,616        | 1,807       | 202       | 100   | 33          | 7           | 46  | 15                    | 1           |
| "Structuring a program" | 2,136        | 1,836       | 121       | 22    | 0           | 0           | 25  | 72                    | 2           |

A sentence is a sentence of prose, a row of a table or a block of code, of the page as it was. "Cut" is what another
sentence or another page says, or what says nothing of its own.

- **Specification halves, and advice does not.** "Composition" lost half its words, most of them to doc comments that
  already said them. "Structuring a program" lost a seventh: advice that gives its reason, and the case where it does
  not hold, takes the words that the "Do and don't" and the repeats gave back. A third of the guide's size, as step 73
  estimated, holds for the pages of specification, not for this one.
- **Few promises are withdrawn.** Seven sentences, of two kinds: what a parent does once a cast has let through what
  the types refuse (a child with commands and no `runCommand`, with keys and no `listen`, with events and no handler,
  told with no `external`), and what it does with a state written by hand that does not hold its children. The
  engine still makes a `CompositionDefect` of the first, for its own invariant ("every such break is a
  `CompositionDefect`", `docs/invariants.md`), so their tests and mutations stay. The two tests of the second went.
  A sentence cut as what another one says is no promise withdrawn: that a row removed and listed again in one step
  is kept follows from the children being those that the state lists.
- **Five sentences of "Splitting a program" were set right**, as step 73 listed them: why not to split by kind, what a
  parent reads of a child, a fact kept for one child, a part that may be a child though its parent locks it, and what
  a child's `output` gives of a text.

## Left to the later steps

Each is written on its step, in `ROADMAP.md`.
