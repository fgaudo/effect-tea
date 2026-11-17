---
name: guide-reader
description: How a reader's check of the documentation of @fgaudo/effect-tea is done: a subagent that has never seen the code builds a program for a requirement of its own, in a project of its own where the package is installed, from what the package ships alone (in a package check all of it, found as an agent at work finds it, with nothing that names it; in a closed check the guide, the tutorial and the declarations, with only the bridges of the examples), and reports every gap, with where it found each answer; then what becomes of its report. Use when the author asks for a reader's check of the guide, or of pages of it, of the tutorial, of the skill, or of the package.
---

# A reader's check of the documentation

A reader who has not seen the code builds a program from what a user of the package has, and what the reader gets
wrong is what that lacks. The package ships what a user reads, at the version installed (`files` in
[`package.json`](../../../package.json)): the guide ([`site/guide/`](../../../site/guide)), the tutorial
([`site/tutorial/`](../../../site/tutorial)), the examples ([`examples/`](../../../examples)), the skill for coding
agents that leads to them ([`skills/effect-tea/SKILL.md`](../../../skills/effect-tea/SKILL.md)), the declarations with
their doc comments, which an editor shows on hover, and the README and the changelog. The site publishes the same
guide, tutorial and doc comments, for the latest release. `docs/` is for whoever changes the library, not for its
users, and the reader never opens it, nor the package's `src/`, which is the implementation.

The guide is the specification ([`AGENTS.md`](../../../AGENTS.md), "What belongs here"): a rule the reader could only
learn from the code of an example is a gap too, since what the guide does not say it does not promise. So the report
says, for each thing the reader needed, where it found it.

The reader works in a project of its own outside the repository, so that the code and the documents of the repository
are out of its reach by where it stands, not only by its rules. A check is of one of two modes, which differ only in
what of `examples/` the reader reads:

- **Package**: all of it, as a user's agent does, and found as it finds it: the brief names no file of the
  documentation, so the reader's path through the package shows whether the README's "For coding agents" and the
  declarations lead to the skill and the guide. It checks too whether what the package ships is enough, and whether
  the skill leads to what the reader needs. It is the mode for the tutorial, whose pages are built on the code of
  `examples/timer/` and link to it, and for the skill. A reader that knows it checks documentation looks harder than
  an agent at work: one that does not find the skill is a finding, one that does is only a sign.
- **Closed**: only the bridges and what they give a user's tests, which a user copies as they are, since the library
  ships no renderer: `examples/bridges/snabbdom.ts`, `examples/bridges/react.ts`, `examples/bridges/snabbdom-testing.ts`
  and `examples/bridges/snabbdom-preload.ts`. It does not imitate a user, who has the examples: it checks the guide as
  the specification. A rule that a reader of the package would copy from an example without noticing shows instead as a
  guess, or as what the compiler or a test told it. It is the mode for pages of the guide.

The two may run on one requirement, a closed check of the guide and a check of the package: the difference of their
reports is what the guide leaves to the examples.

## Before it starts

1. Ask the author whether the reader is a subagent, unless the author has just asked for one.
2. Choose the pages the check is for, or all of the guide and the tutorial, and the mode: closed for pages of the
   guide, package where the tutorial or the skill is among them, unless the author says otherwise.
3. Choose a requirement that needs every page the check is for. In a check of the package no example may hold it:
   what `counter`, `form`, `list`, `pages`, `stocktake`, `timer` and `volume` do is taken, since a reader would copy
   them. In either mode, so is every requirement of an earlier check, listed here. An open check read the repository's
   guide and all its examples, as a check of the package now reads them in the package.
   - a chat room: a connection status from a server feed that ends, a draft refused when blank or offline, sends that
     may fail and are retried, a log and a composer as children, and a reconnect under a new key (2026-11-16, open).
   - a warehouse stock-take: items loaded by a command that may fail and is retried, an item per id with a typed
     count, a barcode scanner feed that ends and is listened to again, a submit refused while a count is invalid or a
     submit is in flight, and a summary once it succeeds (2026-11-16, open).
   - an auction panel: lots as children by id, each with a price feed that ends when the lot closes, a typed bid
     refused when invalid, not above the price, closed or in flight, sends that may fail and are retried, an event the
     parent counts, and a region whose switch listens to each feed anew under a new key (2026-11-17, package).
   - a courier dispatch board: started from flags, couriers as children by id, each with a position feed that ends with
     the shift and is listened to anew, a typed note whose assignment is refused when blank, off shift, in flight or
     paused, sends that may fail and are retried, an event the parent counts, a pause the parent tells every child,
     and a run under snabbdom in a DOM (2026-11-17, package).
4. Make the project, from the repository's root, with the versions the repository is developed with:

   ```bash
   bun run build
   dir=$(mktemp -d)
   bun pm pack --quiet --destination "$dir"
   version() { bun -e "console.log(require('./node_modules/$1/package.json').version)"; }
   cat > "$dir/package.json" <<EOF
   { "name": "reader", "private": true, "type": "module",
     "dependencies": { "@fgaudo/effect-tea": "file:./$(cd "$dir" && ls *.tgz)", "effect": "$(version effect)" },
     "devDependencies": { "typescript": "$(version typescript)", "@types/bun": "$(version @types/bun)" } }
   EOF
   cat > "$dir/tsconfig.json" <<'EOF'
   { "compilerOptions": { "target": "ES2022", "lib": ["ES2022"], "module": "preserve",
       "moduleResolution": "bundler", "strict": true, "exactOptionalPropertyTypes": true, "noEmit": true,
       "types": ["bun"] },
     "include": ["**/*.ts"] }
   EOF
   (cd "$dir" && bun install)
   ```

   `bun run build` comes first, since the package is packed from `dist/`. The tsconfig includes `**/*.ts`, not `.`:
   the compiler finds no input under `.` in a directory whose name has a dot, as `mktemp` names it. Where a page
   checked needs a run under a renderer, add `snabbdom` and `@happy-dom/global-registrator` (or `react` and
   `react-dom`, with their types) to the devDependencies at the repository's versions, and `"DOM"` to `lib`, before
   `bun install`: the reader installs nothing.

## The reader's brief

Start a `general-purpose` subagent with this brief, with the project's path, the requirement, the tests and the rule of
the mode filled in:

```text
You are a reader checking a library's documentation by building a program from it alone, as a new user would who has
just installed it. Your project is <the project's path>, where @fgaudo/effect-tea, an Elm-style architecture over
Effect v4, is installed with effect, typescript and @types/bun.

RULES, strict:
- You may read, list and write only inside your project. Open nothing outside it, by any tool: no other directory of
  this machine, no web page, no repository of the library. The README's links lead outside: do not follow them.
- <the rule of the mode, below>
- You may not open the package's src/ nor the .js files of its dist/: that is the implementation. A path of them in a
  stack trace may be read as a user reads a stack trace, not the file it names.
- You may read node_modules/effect, Effect's own sources and JSDoc, and the compiler's messages, as a user would.
- Write your files in the project's root. Import the library only as a user does: @fgaudo/effect-tea and
  @fgaudo/effect-tea/testing. Run `bun test` and `bunx tsc -p .` there. Do not change tsconfig.json or package.json,
  and install nothing. You may copy a bridge of the package's examples/ into the project, as a user would.

THE REQUIREMENT: <the requirement, as numbered points a business would write>

WHAT TO WRITE: the program, and tests of its main scenarios with the library's testing tools <say which: simulate,
rehearse, drive, and a run under a renderer where a page checked needs one>. Where it needs a view and has no
renderer, give it a node type of your own. Make it compile and pass. Where the documentation does not say enough,
guess as a user would, then let the compiler and the tests tell you.

YOUR REPORT, the deliverable: first, every file of the package you read, in the order you first read it, each with
what led you to it (a file and its line, a listing, or a guess of yours). Then every thing you needed to know, with
where you found it: (1) in the guide or the
tutorial, with the page and section; (2) only in the code of an example, with the file; (3) only in a declaration's
doc comment, with the export; (4) only in the skill, the README or the changelog; (5) nowhere, so that you guessed.
For each of (2) to (5), say what you needed, what you guessed, and what the compiler or a test told you. If you read a
skill of the package, say where it led you to what you needed, and where it did not. Then the gaps, each with the
page, the file or the export you were reading: (a) what was wrong in the documentation, (b) what was missing, (c) what
was unclear and you resolved.
Say whether the program compiles and how many tests pass, list the files you wrote, and list any behaviour of the
library that surprised you, as possible bugs. Say too if you read anything the rules forbid.
```

The rule of a check of the package, which names no file of the documentation:

```text
The package is installed in node_modules/@fgaudo/effect-tea. Find out how to use it as an agent at work in a
  user's project would: nothing here tells you where its documentation is. You may read all of the package but what
  the next rule forbids.
```

The rule of a closed check, with the pages checked filled in:

```text
The package documents itself in node_modules/@fgaudo/effect-tea. Start with its site/guide/index.md, the index of
  its guide, then <the pages checked>. You may read its README.md, CHANGELOG.md, package.json, everything under
  skills/, site/guide/ and site/tutorial/, and everything under dist/ that ends in .d.ts: the doc comments of the
  declarations are the API reference a user reads in a hover. A `@see` line of a doc comment names a page of
  site/guide/ by its title. Of examples/, you may read only the bridges and what they give a user's tests:
  examples/bridges/snabbdom.ts, examples/bridges/react.ts, examples/bridges/snabbdom-testing.ts and
  examples/bridges/snabbdom-preload.ts. Use them as a user who copies them does, by what they export, and count what
  you learn from their code under (2), with the file. Every other file of examples/ is forbidden, though the skill, the
  guide and the tutorial link to it: where one sends you to such a file, say in the report which page, what you needed
  from the file, and how you did without it.
```

## What to do with the report

- In a check of the package, read the reader's path first. A reader that never reached the skill or the guide, or
  reached them late, says what it read instead: where a user's agent looks, and what there could send it on, is a
  question for the author, since the README and the doc comments are what it reads.
- Check each possible bug against `src/`, `docs/invariants.md` and the guide before acting on it. A defect of the code
  is fixed as any other, with its test (`change-engine`, `change-api`). A choice of the API that the reader found
  awkward is a question for the author, and goes in [`ROADMAP.md`](../../../ROADMAP.md), under "Ideas, to be
  decided", with what would decide it, after [`docs/rejected.md`](../../../docs/rejected.md) is read for it.
- Put each gap of (a) and (b), and each rule of (2) to (5) a user relies on, where the reader looked for it. A page of
  the guide or the tutorial gets it as a specification: a sentence added promises what the code and the tests already
  keep, and is checked against `src/` and its tests, or with the compiler, before it is committed, since a reader's
  guess may have passed by luck. A promise that no test keeps yet gets its test first. A changed section of the guide
  is checked one sentence at a time against the old one (`AGENTS.md`, "What belongs here").
- A doc comment gets the rule a caller needs at that point, in short and in plain English, as `change-api` says; a rule
  the guide does not hold yet goes into the guide first. The skill gets a pointer, or a rule in short with the section
  that rules it: it sums up the guide and promises nothing the guide does not. A gap of the README is fixed in the
  README.
- Reread the doc comments that name each section changed (`@see`), and the rules of the skill that name it, then run
  `bun run comments`, `bun run typecheck`, `bun run lint` and `bun run test`. A change a consumer can notice in the
  guide's promises, a doc comment or the skill has a changelog entry (`release`).
- Commit the documents alone. Ask the author before deleting the reader's project.
- Name the requirement in step 3's list of requirements taken, with its date and its mode, in the same commit.
