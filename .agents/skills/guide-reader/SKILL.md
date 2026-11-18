---
name: guide-reader
description: How a reader's check of the documentation of @fgaudo/effect-tea is done: a subagent that has never seen the code builds a program for a requirement of its own, in a project of its own where the package is installed, from what the package ships alone (in a package check all of it, found as an agent at work finds it, with nothing that names it; in a closed check the guide, the tutorial and the declarations, with only the bridges of the examples), and reports every gap, with where it found each answer; where the author asks, acceptance tests the reader never sees, written before it starts by an examiner that never sees the library, are run on its program; then what becomes of its report. Use when the author asks for a reader's check of the guide, or of pages of it, of the tutorial, of the skill, or of the package.
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
what of `examples/` and `bridges/` the reader reads:

- **Package**: all of it, as a user's agent does, and found as it finds it: the brief names no file of the
  documentation, so the reader's path through the package shows whether the README's "For coding agents" and the
  declarations lead to the skill and the guide. It checks too whether what the package ships is enough, and whether
  the skill leads to what the reader needs. It is the mode for the tutorial, whose pages are built on the code of
  `examples/timer/` and link to it, and for the skill. A reader that knows it checks documentation looks harder than
  an agent at work: one that does not find the skill is a finding, one that does is only a sign.
- **Closed**: only the bridges and what they give a user's tests, which a user copies as they are, since the library
  ships no renderer: `bridges/snabbdom.ts`, `bridges/react.ts`, `bridges/snabbdom-testing.ts`
  and `bridges/snabbdom-preload.ts`. It does not imitate a user, who has the examples: it checks the guide as
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
5. Where the author asked for acceptance tests, prepare them before the reader starts, as
   [acceptance tests the reader never sees](#acceptance-tests-the-reader-never-sees) says. Ask, unless the author has
   said: they need a run under a renderer and a second subagent, so the check costs more.

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
  site/guide/ by its title. Of examples/ and bridges/, you may read only the bridges and what they give a user's tests:
  bridges/snabbdom.ts, bridges/react.ts, bridges/snabbdom-testing.ts and
  bridges/snabbdom-preload.ts. Use them as a user who copies them does, by what they export, and count what
  you learn from their code under (2), with the file. Every other file of examples/ and bridges/ is forbidden, though
  the skill, the guide and the tutorial link to it: where one sends you to such a file, say in the report which page,
  what you needed from the file, and how you did without it.
```

## Acceptance tests the reader never sees

The reader writes the program and its tests, so it judges itself: a requirement misread, or a rule of the guide, passes
the tests of whoever misread it. Where the author asks, tests of the requirement are written before the reader starts,
by an examiner that never sees the library, and run on the reader's program once it has reported. They pass through the
page and the world alone, so they hold for a program written in any way, and name nothing of the library.

### What the requirement fixes

The tests and the program meet only in what the requirement fixes, so it fixes all of it:

- **The world, as plain TypeScript**, in a `world.ts` written with the requirement: an interface `World` of promises
  and callbacks, with no type of Effect or of the library. A call that may fail returns a promise that may reject. A
  feed takes what hears its messages and its end, and returns what stops it:
  `listen: (onMessage: (message: Price) => void, onEnd: () => void) => () => void`.
- **Where the program starts**: `main.ts` exports `mount: (root: Element, world: World) => () => Promise<void>`. It
  starts the program in `root`, and returns what stops the program and waits for it.
- **A selector for each control and each thing shown**, made of ids and classes alone: `#submit`, `#lot-<id> .bid`.
  The bridges of the examples set an element's properties, not its attributes, so a `data-*` is out of a reader's
  reach. The requirement says the text each thing shows, to the letter.
- **What cannot be done is a control that is not there, or is disabled.** The requirement does not say which: that is
  the model's business, and the tests take both alike.

Add `snabbdom` and `@happy-dom/global-registrator` to the project (step 4), and `world.ts`. The reader's brief gets
the requirement with its selectors, and these lines:

```text
THE CONTRACT: world.ts, in your project, is the world your program talks to. Do not change it. Write a main.ts that
exports `mount: (root: Element, world: World) => () => Promise<void>`: it starts the program in `root`, drawn with a
bridge of the package's examples, and returns what stops the program and waits for it. Each control and each thing
shown has the selector and the text the requirement gives it. A control the requirement says cannot be used is not
there, or is disabled. Tests you will not see are run on main.ts afterwards.
```

### The examiner

Start a second `general-purpose` subagent before the reader, in a directory of its own, outside the reader's project
and the repository. Give it `world.ts`, the harness below as `acceptance-harness.ts`, a `package.json` with
`@happy-dom/global-registrator`, `typescript` and `@types/bun` at the repository's versions, and the project's
`tsconfig.json` with `"DOM"` and `"DOM.Iterable"` in `lib`. It gets no package, and no name of the library.

```text
You write acceptance tests for a web program that someone else is writing, from its requirement alone. You will not
see the program. Your directory is <the examiner's path>.

RULES, strict:
- Read and write only inside your directory. Change neither world.ts nor acceptance-harness.ts.
- The program is reached only through acceptance-harness.ts: `start(world)` starts it in the page, with a World you
  write for the test (world.ts). Then `click` and `type` act as a user does, and `texts`, `available` and `valueOf`
  read the page. A test also reads what its World was asked.
- Wait with `until` for what you expect, after each thing you do: the page is drawn later. Never sleep for an order.
  Where a point says that nothing happens, wait first for something the same step does show, then check.
- Hold a call of the World with a promise your test settles, so that a test says what the user does meanwhile.
- A control the requirement says cannot be used may be absent or disabled: check it with `available` alone.

THE REQUIREMENT: <the requirement, with its selectors and texts>

WHAT TO WRITE: acceptance.test.ts, with `bun:test`. At least one test for each numbered point, its number first in its
name. Make it compile: `bunx tsc -p .` (main.ts is missing, which the harness imports only as a test runs). List the
points you could not test through the page and the world, and every place where the requirement let you choose.
```

The harness, which registers a DOM, starts the program, and reads the page:

```ts
import { afterAll, afterEach, beforeAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
// Without the extension, as the project's tsconfig.json resolves it.
import type { World } from './world'

beforeAll(() => GlobalRegistrator.register())

afterAll(() => GlobalRegistrator.unregister())

let stop: (() => Promise<void>) | undefined

afterEach(async () => {
  await stop?.()
  stop = undefined
  document.body.replaceChildren()
})

/** Starts the program in a new element of the page. */
export const start = async (world: World): Promise<void> => {
  // Imported here, once a DOM is registered: a renderer may read the DOM as it is loaded.
  const path = './main.ts'
  const { mount } = await import(path)
  const root = document.createElement('div')
  document.body.append(root)
  stop = mount(root, world)
}

/** Waits until `read` gives something. Only a failing test reaches the bound. */
export const until = async <A>(what: string, read: () => A | undefined | null | false): Promise<A> => {
  const end = Date.now() + 2000
  for (;;) {
    const found = read()
    if (found !== undefined && found !== null && found !== false) return found
    if (Date.now() > end) throw new Error(`Never happened: ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

/** The text of each element the selector finds, in the page's order. */
export const texts = (selector: string): ReadonlyArray<string> =>
  [...document.querySelectorAll(selector)].map((found) => (found.textContent ?? '').trim())

/** Whether the user can act on the control: it is there, and not disabled. */
export const available = (selector: string): boolean => {
  const found = document.querySelector(selector)
  return found !== null && !('disabled' in found && found.disabled === true)
}

const control = (selector: string): Element => {
  const found = document.querySelector(selector)
  if (found === null || !available(selector)) throw new Error(`The user cannot act on ${selector}`)
  return found
}

export const click = (selector: string): void => {
  control(selector).dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

export const type = (selector: string, value: string): void => {
  const found = control(selector)
  if (!(found instanceof HTMLInputElement)) throw new Error(`${selector} is no input`)
  found.value = value
  found.dispatchEvent(new Event('input', { bubbles: true }))
}

/** What an input shows. */
export const valueOf = (selector: string): string | undefined => {
  const found = document.querySelector(selector)
  return found instanceof HTMLInputElement ? found.value : undefined
}
```

### Running them

1. Read the examiner's tests before the reader starts. A place where the requirement let the examiner choose is a
   place where it would let the reader choose otherwise: say it in the requirement, and have the test follow.
2. Once the reader has reported, copy `acceptance-harness.ts` and `acceptance.test.ts` into its project, and run them
   alone: `bun test ./acceptance.test.ts`. The reader is not told what failed, and fixes nothing.
3. Weigh each failure before it counts. It is a lead, not a finding:
   - **The test is wrong, or the requirement can be read both ways.** The requirement is fixed, in step 3's list too.
     It says nothing of the documentation.
   - **The program does not meet the contract**: no `mount`, another selector, another text. It says nothing of the
     documentation either, unless the reader could not tell how to start or stop a run.
   - **The program breaks the requirement, and its own tests passed.** Read where the reader's report says it found
     the rule in question. One it guessed, or read in the documentation and took otherwise, is a gap, of (a), (b) or
     (c), and is handled as any other. One the documentation says plainly is the reader's slip: no gap, but it counts.


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
  `bun run comments`, `bun run typecheck`, `bun run lint` and `bun run test`. A new promise, a new page or a moved
  section has a changelog entry; a rewording with the same promises has none (`release`).
- Commit the documents alone. Ask the author before deleting the reader's project.
- Name the requirement in step 3's list of requirements taken, with its date and its mode, in the same commit. Where
  acceptance tests ran, add how many passed of how many, and how many failures were the program's.
