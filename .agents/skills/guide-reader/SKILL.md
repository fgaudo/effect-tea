---
name: guide-reader
description: How a reader's check of the documentation of @fgaudo/effect-tea is done: a subagent that has never seen the code builds a program for a requirement of its own, from what a user sees alone (the guide, the tutorial, the declarations of the package, and all the examples in an open check or only the bridges in a closed one), and reports every gap, with where it found each answer; then what becomes of its report. Use when the author asks for a reader's check of the guide, or of pages of it.
---

# A reader's check of the documentation

A reader who has not seen the code builds a program from what a user of the package sees, and what the reader gets
wrong is what that lacks. A user sees what the site publishes ([`site/build.ts`](../../../site/build.ts)): the guide
([`site/guide/`](../../../site/guide)), the tutorial ([`site/tutorial/`](../../../site/tutorial)), the examples their
pages link to ([`examples/`](../../../examples)), and the API reference, the doc comments of the declarations, which
an editor also shows on hover. `docs/` is for whoever changes the library, not for its users, and the reader never
opens it, nor `src/`, `test/` or `tools/`.

The guide is the specification ([`AGENTS.md`](../../../AGENTS.md), "What belongs here"): a rule the reader could only
learn from the code of an example is a gap too, since what the guide does not say it does not promise. So the report
says, for each thing the reader needed, where it found it.

A check is of one of two modes, which differ only in what of `examples/` the reader reads:

- **Open**: all of it, as a user of the site does. It checks whether the guide and the examples together are enough,
  and is the mode for the tutorial, whose pages are built on the code of `examples/timer/` and link to it.
- **Closed**: only the bridges and the files of the tests they share, which a user copies as they are, since the
  library ships no renderer: `examples/snabbdom.ts`, `examples/react.ts`, `examples/snabbdom-testing.test_messages.ts`
  and `examples/preload.test_setup.ts`. It checks the guide as the specification: a rule that an open reader would
  copy from an example without noticing shows instead as a guess, or as what the compiler or a test told it. It is the
  mode for pages of the guide.

The two may run on one requirement, a closed check of the guide and an open one of the tutorial: the difference of
their reports is what the guide leaves to the examples.

## Before it starts

1. Ask the author whether the reader is a subagent, unless the author has just asked for one.
2. Choose the pages the check is for, or all of the guide and the tutorial, and the mode: closed for pages of the
   guide, open where the tutorial is among them, unless the author says otherwise.
3. Choose a requirement that needs every page the check is for. In an open check no example may hold it: what
   `counter`, `form`, `list`, `pages`, `timer` and `volume` do is taken, since a reader would copy them. In either
   mode, so is every requirement of an earlier check, listed here:
   - a chat room: a connection status from a server feed that ends, a draft refused when blank or offline, sends that
     may fail and are retried, a log and a composer as children, and a reconnect under a new key (2026-11-16, open).
   - a warehouse stock-take: items loaded by a command that may fail and is retried, an item per id with a typed
     count, a barcode scanner feed that ends and is listened to again, a submit refused while a count is invalid or a
     submit is in flight, and a summary once it succeeds (2026-11-16, open).
4. Run `bun run build`: the reader's compiler reads the package's declarations in `dist/`, as a user's reads them in
   `node_modules`, and a `dist/` older than `src/` shows it an API that is not the one it runs.
5. Make sure `scratch/` does not exist, since the reader writes there. Git and Biome ignore it.

## The reader's brief

Start a `general-purpose` subagent with this brief, with the requirement, the pages, the tests and the rule of the
mode filled in:

```text
You are a reader checking a library's documentation by building a program from it alone, as a new user would. The
repository is <the repository's path>. The library is @fgaudo/effect-tea, an Elm-style architecture over Effect v4.

RULES, strict:
- You may read README.md and everything under site/guide/ and site/tutorial/. Start with site/guide/index.md, then
  <the pages checked>.
- <the rule of the mode, below>
- You may read the package's declarations, dist/index.d.ts, dist/testing/index.d.ts and the .d.ts files they import:
  their doc comments are the API reference a user reads. You may read node_modules/effect, Effect's own sources and
  JSDoc, and the compiler's messages, as a user would.
- You may not open, grep or list anything under docs/, src/, test/ or tools/, nor AGENTS.md, ROADMAP.md, CHANGELOG.md
  or .agents/. A path of src/ in a stack trace may be read as a user reads a stack trace, not the file it names.
- Write only inside a new directory scratch/<name>/. Modify no other file, commit nothing, and run no git command that
  changes anything.
- Import the library only as a user does: @fgaudo/effect-tea and @fgaudo/effect-tea/testing, never by a path. Run
  `bun test scratch/<name>`. Typecheck with `bunx tsc --noEmit -p scratch/<name>`, with a tsconfig.json there that
  extends ../../tsconfig.json and includes ["."]; a view or a bridge that needs the DOM adds "DOM" to its lib. You may
  copy a bridge of examples/, as a user would.

THE REQUIREMENT: <the requirement, as numbered points a business would write>

WHAT TO WRITE: the program, and tests of its main scenarios with the library's testing tools <say which: simulate,
rehearse, drive, and a run under a renderer where a page checked needs one>. Make it compile and pass. Where the
documentation does not say enough, guess as a user would, then let the compiler and the tests tell you.

YOUR REPORT, the deliverable: every thing you needed to know, with where you found it: (1) in the guide or the
tutorial, with the page and section; (2) only in the code of an example, with the file; (3) only in a declaration's
doc comment; (4) nowhere, so that you guessed. For each of (2), (3) and (4), say what you needed, what you guessed,
and what the compiler or a test told you. Then the gaps, each with the page and section you were reading: (a) what
was wrong in the documentation, (b) what was missing, (c) what was unclear and you resolved. Say whether the program
compiles and how many tests pass, list the files you wrote, and list any behaviour of the library that surprised
you, as possible bugs. Say too if you read anything the rules forbid.
```

The rule of an open check:

```text
You may read everything under examples/, which the guide and the tutorial link to.
```

The rule of a closed check:

```text
Of examples/, you may read only the bridges and the files of the tests they share: examples/snabbdom.ts,
  examples/react.ts, examples/snabbdom-testing.test_messages.ts and examples/preload.test_setup.ts. Use them as a
  user who copies them does, by what they export, and count what you learn from their code under (2), with the file.
  Every other file of examples/ is forbidden, though the guide and the tutorial link to it: where a page sends you to
  one, say in the report which page, what you needed from the file, and how you did without it.
```

## What to do with the report

- Check each possible bug against `src/`, `docs/invariants.md` and the guide before acting on it. A defect of the code
  is fixed as any other, with its test (`change-engine`, `change-api`). A choice of the API that the reader found
  awkward is a question for the author, and goes in [`ROADMAP.md`](../../../ROADMAP.md), under "Ideas, to be
  decided", with what would decide it, after [`docs/rejected.md`](../../../docs/rejected.md) is read for it.
- Put each gap of (a) and (b), and each rule of (2), (3) and (4) a user relies on, into the page of the guide or the
  tutorial where the reader looked for it. The guide is a specification: a sentence added promises what the code and
  the tests already keep, and is checked against `src/` and its tests, or with the compiler, before it is committed,
  since a reader's guess may have passed by luck. A promise that no test keeps yet gets its test first. A changed
  section of the guide is checked one sentence at a time against the old one (`AGENTS.md`, "What belongs here").
- Reread the doc comments that name each section changed (`@see`), then run `bun run comments`, `bun run typecheck`,
  `bun run lint` and `bun run test`. A change a consumer can notice in the guide's promises has a changelog entry
  (`release`).
- Commit the documents alone, never `scratch/`. Ask the author before deleting `scratch/`.
- Name the requirement in step 3's list of requirements taken, with its date and its mode, in the same commit.
