---
name: release
description: How @fgaudo/effect-tea is versioned and released: the changelog entry a change needs and the version it raises, the release commit and tag, the documentation site the tag deploys to GitHub Pages, what the package contains, and what is left to the author (pushing, and publishing to npm). Use when writing a changelog entry, choosing the next version, releasing, or building the documentation site.
---

# Versions, changelog and releases

The version in `package.json` is the one the next release will have, decided by the changes that make it.

## The changelog entry

[`CHANGELOG.md`](../../../CHANGELOG.md) holds only what a user notices on upgrading from the last release. Its
`(unreleased)` section is the net change since that release, not a log of the work.

Before a commit, answer these in order:

1. **Does a user who upgrades notice it?** What they call, what compiles, what the run, the testing tools and the
   bridges do, and what the guide now promises. Never an entry for tests, tooling, internals, the repository's documents
   (`AGENTS.md`, `docs/`, the skills, `ROADMAP.md`), the API reports, or a rewording with the same promises. Of the
   documentation, only a new promise, a new page, or a section a user cites moving gets one.
2. **Did it exist in the last release?** Compare with its tag (`git show v<last>:src/index.ts`). A change of what the
   unreleased section added edits that entry, or needs none.
3. **Does the section already cover it?** Read it whole first. A change to what an entry describes edits that entry,
   which says the final result, the old spelling and the new. Changes of one kind are one entry.
4. **Which heading?** `Added` for what is new; `Changed` for what behaves or is spelled otherwise; `Fixed` for what did
   not do what the last release promised. A program that compiled and no longer does is `**Breaking**`, under
   `Changed`, even when the types were wrong before, and so is a promise that no longer holds. What the guide does not
   promise has no entry.

An entry is one line, two at most: what changes, in the user's words, with no why and no example. One that groups
changes of one kind lists them, a few words each. A breaking entry starts with `**Breaking**:` and adds below it,
indented, `Upgrade:` with the old and the new spelling, in at most three lines. An entry for the guide names its pages.

## The version

[Semantic versioning](https://semver.org). The first change that needs an entry after a release opens a
`## <version> (unreleased)` section, and each change raises the version if it needs more than the section says. Before
1.0, a breaking change raises the minor version, and everything else the patch. The version never goes down, and
`package.json` and the changelog agree.

## Releasing

1. The checks pass (`bun run typecheck`, `bun run lint`, `bun run test`, `bun run comments`), every mutation is killed
   (`bun run mutations`), and the site builds without warnings. `bun run interleavings` runs too: an order it finds
   goes in `ROADMAP.md`, and is weighed before the release.
2. In `CHANGELOG.md`, replace `(unreleased)` with the date: `## 0.6.0 (2026-10-23)`.
3. Commit that change alone, `release <version>`, and tag it `v<version>` (a lightweight tag). The owner pushes the
   commit and the tag ("Deciding" in `AGENTS.md`); the tag deploys the site (`.github/workflows/docs.yml`).
4. The owner publishes the package: never run `npm publish` or `bun publish`.

## What the package contains

`files` in `package.json`: `dist/`, `src/` without its tests, the guide, the tutorial, the examples and the bridges
without their `tsconfig` files, the skill (`skills/`), `README.md` and `CHANGELOG.md`. `bun run smoke` checks that every
file the documentation links is in it, and `bun pm pack` shows it (`prepack` builds `dist/`). Lifecycle scripts run
without `node_modules/.bin` on the `PATH`: `tools/build.ts` resolves `tsc` itself, and `prepare` runs `effect-tsgo`
through `bunx`.

## The documentation site

[`site/`](../../../site) builds `https://fgaudo.github.io/effect-tea/`: the API reference that TypeDoc makes of the doc
comments, the README as its home page, the guide and the tutorial as project documents, and each example under
`examples/<name>/`. Built with

```sh
cd site && bun install && bun run build
```

into `site/dist/`, with no warnings: a warning is a doc comment to fix. `site/` has its own TypeScript 6, since TypeDoc
does not support TypeScript 7 yet ([`upgrade-effect`](../upgrade-effect/SKILL.md)).

- Links between the pages are relative, and so are those to the repository's files, which `site/build.ts` sends to the
  repository at the built commit. The one link to a file the package does not ship, the test of the guarantees, is to
  `tree/main`. The README links the guide on the published site.
- The tutorial holds no code of its own: each block is `{@includeCode}` of a `// #region` of
  [`examples/timer`](../../../examples/timer), and each block of "Writing a bridge" one of
  [`bridges/snabbdom.ts`](../../../bridges/snabbdom.ts). A change of either keeps its regions, and the prose, true.
- The README's `` ```mermaid `` blocks are drawn by `site/mermaid.ts`, which `site/custom.ts` imports on a page that has
  one. `site/package.json` overrides `katex` for an advisory of `bun audit`, until mermaid depends on a fixed version,
  and the site's audit ignores one advisory of minimatch, fixed only in minimatch 11, which TypeDoc 0.28.20 does not
  take: the workflows' comment says when the ignore goes.
