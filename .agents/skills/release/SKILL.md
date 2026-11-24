---
name: release
description: How @fgaudo/effect-tea is versioned and released: the changelog entry a change needs and the version it raises, the release commit and tag, the documentation site the tag deploys to GitHub Pages, what the package contains, and what is left to the author (pushing, and publishing to npm). Use when writing a changelog entry, choosing the next version, releasing, or building the documentation site.
---

# Versions, changelog and releases

The version in `package.json` is the one the next release will have, decided by the changes that make it.

## The changelog entry

[`CHANGELOG.md`](../../../CHANGELOG.md) is for whoever uses the library, and for nobody else: it holds only what
they notice when they upgrade from the last release. Its `(unreleased)` section is the net change since that release,
not a log of the work: whoever reads it upgrades once, from the last release to this one.

Before a commit, answer these in order:

1. **Does a user who upgrades notice it?** What they call, what compiles, what the run, the testing tools and the
   bridges they import do, and what the guide now promises that it did not. If not, there is no entry. Never an entry
   for tests, tooling, internals, the examples' tests, the repository's documents (`AGENTS.md`, `docs/`, the skills,
   `ROADMAP.md`), the API reports, or a rewording of the guide, the tutorial, the README or a doc comment that keeps
   the same promises. Of the documentation, only a new promise, a new page, or a section a user cites moving gets an
   entry.
2. **Did it exist in the last release?** Compare with its tag (`git show v<last>:src/index.ts`). A fix or change of
   something the unreleased section added is no fix for whoever upgrades: it edits that entry, or needs none.
3. **Does the section already cover it?** Read the whole section first. A change to what an entry describes, a rename,
   a further case of a rule, a later step of the same change, edits that entry, never adds one after it: the entry
   says the final result, the old spelling of the last release and the new one of this. Changes of one kind (the
   defects of the run, the fixes of one testing tool, the programs that no longer compile) are one entry together.
4. **Which heading?** `Added` for what is new; `Changed` for what behaves or is spelled otherwise; `Fixed` for what
   did not do what the last release promised. A program that compiled and no longer does is `**Breaking**`, under
   `Changed`, even when the types were wrong before. So is a promise of the guide that no longer holds. What the guide
   does not promise is unspecified, and has no entry when it changes (`AGENTS.md`, "The guide promises only its
   rules").

An entry is one line, at most two at 120 columns: what changes, in the user's words, with no why, no list of cases and
no example, which the guide and the doc comments hold. An entry that groups changes of one kind lists them, a few
words each, and is the one place that may run longer. A breaking entry starts with `**Breaking**:` and adds below it,
indented, `Upgrade:` with the old and the new spelling, in at most three lines. An entry for the guide names its pages
or sections. A longer entry is cut, not kept because it is true.

## The version

Versions follow [semantic versioning](https://semver.org). The first change that needs an entry after a release
opens a new `## <version> (unreleased)` section, and each change raises the version if it needs more than the
section says: a fix the patch version, a feature the minor version, a breaking change the major version. Before
1.0, a breaking change raises the minor version, and everything else, features included, the patch version. The
version never goes down. `package.json` and the changelog's section always agree.

## Releasing

1. The checks pass (`bun run typecheck`, `bun run lint`, `bun run test`, and `bun run comments`, so that the
   doc comments the package ships name sections its own guide has), every mutation is killed
   (`bun run mutations`, `change-engine`), and the site builds without warnings (below). `bun run interleavings`
   is run too: an order it finds goes in `ROADMAP.md`, and is weighed before the release.
2. In `CHANGELOG.md`, replace `(unreleased)` with the date: `## 0.6.0 (2026-10-23)`.
3. Commit that change alone, with the subject `release <version>`, and tag the commit `v<version>` (a
   lightweight tag, as the existing ones). The author pushes the commit and the tag: nothing leaves this machine but
   by the author ("Deciding" in `AGENTS.md`).
4. The tag, once pushed, runs `.github/workflows/docs.yml`, which builds the site and deploys it to GitHub Pages (it
   can also be run by hand from the repository's Actions). The site is never committed.
5. The author publishes the package: never run `npm publish` or `bun publish`.

## What the package contains

`files` in `package.json`: `dist/`, with the bridges built into `dist/bridges/`, `src/` without its tests, the guide
(`site/guide/`), the tutorial (`site/tutorial/`), the examples and the bridges without their `tsconfig.json` (nor the
bridges' `tsconfig.build.json`), the skill for coding agents (`skills/`),
`README.md` and `CHANGELOG.md`; the rest of the site is not published. A user and their agent read the documentation
there, at the version installed, and `bun run smoke` checks that it finds in the package every file it links.
`bun pm pack` shows the package as it would be published, as `fgaudo-effect-tea-<version>.tgz` at the root (ignored by
git): `prepack` builds `dist/` first. Lifecycle scripts
run without `node_modules/.bin` on the `PATH`: `tools/build.ts` resolves `tsc` itself, and `prepare` runs
`effect-tsgo` through `bunx`.

## The documentation site

[`site/`](../../../site) builds the site published at `https://fgaudo.github.io/effect-tea/`: the API reference
generated by TypeDoc from the doc comments of `src/`, with the README as its home page, the guide and the tutorial,
and each example bundled to run under `examples/<name>/`.

The guide, [`site/guide/`](../../../site/guide), one page per concept, and the tutorial,
[`site/tutorial/`](../../../site/tutorial), one page per step, are TypeDoc project documents (`projectDocuments`).
Their links to each other are relative (`../guide/running.md#…`), which TypeDoc resolves to the pages and their
sections. Their links to the repository's files are relative too (`../../examples/form/form.ts`), as the package that
ships them all resolves them. The site has no copy of the files, so `site/build.ts` builds the pages from a copy in
`site/.build/`, where such a link goes to the repository at the built commit, as the README's do. The one link to a
file the package does not ship, the test of the guarantees in "Guarantees", is to `tree/main`. The tutorial holds no
code of its own: each block is `{@includeCode}` of a `// #region` of [`examples/timer`](../../../examples/timer), and
each block of the guide's "Writing a bridge" one of the bridge
[`bridges/snabbdom.ts`](../../../bridges/snabbdom.ts), so that what they show is typechecked and
tested. A change to that example or that bridge keeps its regions, and the prose around them, true. The README's links
to the guide are to the published site's pages, since the README is no project document.

```sh
cd site && bun install && bun run build
```

builds it into `site/dist/`, and must give no warnings: a warning is a doc comment to fix
([`change-api`](../change-api/SKILL.md)). The README's relative links are rewritten to the repository at the
built commit, since the site has no copy of the files. `site/` is a package of its own, with its own TypeScript 6,
because TypeDoc does not support TypeScript 7 yet ([`upgrade-effect`](../upgrade-effect/SKILL.md)).

The README's `` ```mermaid `` blocks are diagrams. GitHub draws them itself; npm shows their source. On the
site, TypeDoc leaves them as code (`ignoredHighlightLanguages`), and `site/custom.ts`, its custom script, loaded
on every page, imports `site/mermaid.ts` only on a page that has one, bundled apart into `assets/mermaid/`.
`site/package.json` overrides `katex`, which mermaid depends on, to a version without the advisory that
`bun audit` reports, since the docs workflow stops on it. Remove the override once mermaid depends on such a
version. The site's audit ignores one advisory of minimatch, which TypeDoc depends on: its fix is in minimatch 11
alone, which TypeDoc 0.28.20 does not take, and an override to it breaks TypeDoc. The workflows' comment says when
the ignore goes.
