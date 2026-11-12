---
name: upgrade-effect
description: How @fgaudo/effect-tea depends on Effect: the peer range starts at the version the library is developed with, and an upgrade raises both together; what to do when an API it needs is in a newer Effect, unstable or deprecated, and how to upgrade the development dependencies (Effect, the language service, TypeScript, TypeDoc). Use when an Effect API is missing, unstable or deprecated, or when upgrading a dependency.
---

# Upgrade Effect and the dependencies

## The peer range

`peerDependencies.effect` (`^4.1.4` today) is the version of `devDependencies.effect` with a caret, and the lockfile
holds exactly that version: the library supports no older Effect, so that it is checked, and what it rests on of
Effect read and tested, at one version only. The CI's `check` job runs the library at it, and the `package` job the
packed package (`bun run smoke`, with the Effect of the lockfile). The oldest TypeScript the package supports is
Effect's (5.9 for Effect 4): the README's "Installation" states it, and `smoke/smoke.ts` checks it by default. An
upgrade that raises Effect's raises both, with a changelog entry.

## An API of a newer Effect

When Effect has a direct API for what is needed, but only since a later version (its `@since` tag in
`node_modules/effect/dist/<Module>.d.ts`), do not work around it: stop and ask whether to upgrade. The direct API
is preferred, and the upgrade is the author's call.

## Upgrading Effect

1. `bun add --dev effect@^4.<minor>.<patch>`, so that `devDependencies` and the lockfile name the new version.
2. Set `peerDependencies.effect` to the same caret range, and the version in the README's "Installation".
3. Read what changed in Effect's source between the two versions, in the modules the premises of `AGENTS.md`
   ("What the invariants rest on") name and in the runtime (`internal/effect.ts`), and the JSDoc of every premise
   that rests on documentation; run every test the premises name, which `bun run test` does.
4. A raised peer range is a change a consumer can notice: a `Changed` entry in `CHANGELOG.md` that names the new
   minimum, and the version a breaking change raises ([`release`](../release/SKILL.md)).

## Unstable and deprecated APIs

- A module or function marked `@stability unstable` in Effect's declarations may change under the library's
  users: never build on one, not even as an option, and not in the examples either, since users copy them. The
  typecheck fails on one, in the library and in the examples (the Effect language service's `unstableApiUsage`).
- Nothing marked `@deprecated`, of any dependency, in the library, its tests or its examples: use what the
  deprecation names instead (fast-check's `waitNext(1)` for `waitOne()`), and replace a use found in passing.
  `bun run lint` warns about one (Oxlint's type-aware `typescript/no-deprecated`). An upgrade that deprecates
  something the library uses is the moment to replace it.

## Upgrading the development dependencies

- `@effect/tsgo` is pinned to an exact version. The `prepare` script runs its patch of the workspace's
  TypeScript (`effect-tsgo patch`, through `bunx`, since lifecycle scripts do not see `node_modules/.bin`), so
  that `tsc` and VS Code (`.vscode/settings.json`) run the Effect language service; `bun install` runs it
  again after an upgrade. `oxlint-tsgolint` is what makes Oxlint's type-aware rules run.
- `typescript` 7 at the root. `site/` is a package of its own with its own `typescript` 6, used only by TypeDoc
  to read the sources, because TypeDoc does not support TypeScript 7 yet: when it does, move TypeDoc to the root
  and drop the site's own TypeScript.
- An upgrade of Effect is checked against what the invariants rest on, as `AGENTS.md` lists it: the tests named
  there are what keeps each premise, and one read only in Effect's source is read again in the new version. A move
  to a new major checks every premise again, the documented ones included. An upgrade of React or snabbdom does the
  same for the bridges' premises, and updates the versions their opening comments name.
- After any upgrade: `bun install`, `bun run typecheck`, `bun run lint`, `bun run test`, and
  `cd site && bun install && bun run build` without warnings. Commit `bun.lock` and `site/bun.lock` with
  `package.json` and `site/package.json`: the documentation workflow installs both with `--frozen-lockfile`.
