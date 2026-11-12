---
name: upgrade-effect
description: How @fgaudo/effect-tea depends on Effect: the peer range and its minimum, how to check the library against the oldest Effect it supports, what to do when an API it needs is newer than the minimum, unstable or deprecated, and how to upgrade the development dependencies (Effect, the language service, TypeScript, TypeDoc). Use when an Effect API is missing, unstable or deprecated, when raising the peer minimum, or when upgrading a dependency.
---

# Upgrade Effect and the dependencies

## The peer range

`peerDependencies.effect` (`^4.0.0` today) starts at the oldest Effect 4 the library works with, so that any
application on Effect 4 can use it. `devDependencies.effect` is the version the library is developed and tested
with, usually newer: passing checks say nothing about the minimum, which is checked on its own. The CI's
`minimum-effect` job installs exactly the minimum over the lockfile and runs `tsc --noEmit` and `bun test src`, and
the `package` job checks the packed package against it (`bun run smoke --effect <minimum>`).
The oldest TypeScript the package supports is Effect's (5.9 for Effect 4): the README's "Installation" states it,
and `smoke/smoke.ts` checks it by default. An upgrade that raises Effect's raises both, with a changelog entry.

## An API the minimum lacks

When Effect has a direct API for what is needed, but only since a later version (its `@since` tag in
`node_modules/effect/dist/<Module>.d.ts`, or it fails the check against the minimum), do not work around it:
stop and ask whether to use it and raise the minimum. The direct API is preferred, and raising the minimum is
the author's call.

## Raising the minimum

1. Set `peerDependencies.effect` to the oldest version that has the API, as a caret range (`^4.<minor>.<patch>`).
2. Set the same version in the `minimum-effect` job of `.github/workflows/ci.yml`, and in the `--effect` of the
   `package` job. Run the steps of `minimum-effect` once in a scratch copy of the repository before pushing.
3. A raised minimum is a change a consumer can notice: a `Changed` entry in `CHANGELOG.md` that names the new
   minimum, and the version a breaking change raises ([`release`](../release/SKILL.md)).

## Unstable and deprecated APIs

- A module or function marked `@stability unstable` in Effect's declarations may change under the library's
  users: never build on one, not even as an option, and not in the examples either, since users copy them. The
  typecheck fails on one in the library (the Effect language service's `unstableApiUsage`); the examples still turn
  it off in `examples/tsconfig.json`, for `BrowserRuntime.runMain`, and removing it is an item of `ROADMAP.md`.
- Nothing marked `@deprecated`, of any dependency, in the library, its tests or its examples: use what the
  deprecation names instead (fast-check's `waitNext(1)` for `waitOne()`), and replace a use found in passing.
  `bun run lint` warns about one (Oxlint's type-aware `typescript/no-deprecated`). An upgrade that deprecates
  something the library uses is the moment to replace it.

## Upgrading the development dependencies

- `effect` and `@effect/platform-browser` (used by the examples) move together: `@effect/platform-browser` has
  a peer range on `effect` of its own.
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
