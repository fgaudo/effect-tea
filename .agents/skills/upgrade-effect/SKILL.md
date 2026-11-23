---
name: upgrade-effect
description: How @fgaudo/effect-tea depends on Effect: the peer range is the patches of the version the library is developed with, and an upgrade raises both together; what to do when an API it needs is in a newer Effect, unstable or deprecated, and how to upgrade the development dependencies (Effect, the language service, TypeScript, TypeDoc). Use when an Effect API is missing, unstable or deprecated, or when upgrading a dependency.
---

# Upgrade Effect and the dependencies

## The peer range

`peerDependencies.effect` (`~4.1.4` today) is the version of `devDependencies.effect` with a tilde, and the lockfile
holds exactly that version: the library supports no older Effect, so that it is checked, and what it rests on of
Effect read and tested, at one version only. The CI's `check` job runs the library at it, and the `package` job the
packed package (`bun run smoke`, with the Effect of the lockfile). The range accepts the later patches of that minor
too, and no later minor (`AGENTS.md`, "What belongs here", says why): a new minor of Effect is supported only by an
upgrade to it and a release. A patch may still change what Effect does not document: a daily job
(`.github/workflows/effect-latest.yml`) runs the typecheck and the tests at the newest version the range accepts, and
a failure there is a lead for an upgrade. The same workflow runs them, and ten runs of the search
(`bun run interleavings`, a new seed each), at the newest minor of Effect 4 when it is later than the range, once per
version, and opens an issue with the result, `Effect <version> passes the tests` or `… fails the tests`: a green one is
the lead for this upgrade, a red one names a premise to read first.
The oldest TypeScript the package supports is Effect's (5.9 for Effect 4): the README's "Installation" states it,
and `tools/smoke/smoke.ts` checks it by default. An upgrade that raises Effect's raises both, with a changelog entry.

## A premise that falls inside the range

The range accepts the later patches of its minor, and a patch may change what Effect does not document. A version of
the library that is published keeps its range: nothing takes back a pair that it accepts. So when the daily job fails
at a version the range accepts, and what fails is a premise's test, or a test that `docs/premises.md` names under a
premise:

1. Release a patch of the library whose range leaves that version out (`>=4.1.4 <4.1.6`), with a `Changed` entry that
   names it. Whoever installs or updates the library from then on meets the conflict in their package manager.
2. Tell the owner which versions of the library accept the broken Effect, for `npm deprecate` with a message that
   names it: whoever has one of them in a lockfile learns of nothing otherwise. The owner runs it, as the owner
   publishes.
3. Then the fix, by an upgrade (below) to a version the library holds on, which takes it back into the range.

None of the three keeps the broken pair from being installed: they make it loud. What shortens the time before the
first is an alarm that comes before Effect's release (`ROADMAP.md`).

## An API of a newer Effect

When Effect has a direct API for what is needed, but only since a later version (its `@since` tag in
`node_modules/effect/dist/<Module>.d.ts`), do not work around it: stop and ask whether to upgrade. The direct API
is preferred, and the upgrade is the author's call.

## Upgrading Effect

1. `bun add --dev effect@~4.<minor>.<patch> @effect/platform-bun@~4.<minor>.<patch>`, so that `devDependencies` and
   the lockfile name the new version.
2. Set `peerDependencies.effect` to the same tilde range, and the version in the README's "Installation".
3. Read what changed in Effect's source between the two versions, in the modules the premises of
   `docs/premises.md` name and in the runtime (`internal/effect.ts`); run every test the premises name, which
   `bun run test` does.
4. Read what the JSDoc of each API of Effect the library uses promises in the new version that it did not in the
   old: a guarantee a stable API documents is no premise (`docs/premises.md`, the rule after the list). A premise it
   now documents, in whole or in part, leaves the list with its own test, or keeps only the part still not promised.
   A guard, a workaround or a check of the library's that the new guarantee makes unneeded is a lead for a
   simplification: propose it to the owner, with the guarantee quoted and the code it removes, and once taken, it
   goes with its mutation in `tools/mutations/mutations.ts` and, for a change of the engine, follows `change-engine`.
5. A raised peer range is a change a consumer can notice: a `Changed` entry in `CHANGELOG.md` that names the new
   minimum, and the version a breaking change raises ([`release`](../release/SKILL.md)).

## Unstable and deprecated APIs

- A module or function marked `@stability unstable` in Effect's declarations may change under the library's
  users: never build on one, not even as an option, and not in the examples either, since users copy them. The
  typecheck fails on one, in the library and in the examples (the Effect language service's `unstableApiUsage`).
  The tools are the exception that `AGENTS.md` states ("Only stable APIs"): what `tsconfig.json` lists for `tools/`.
- An upgrade of Effect raises `@effect/platform-bun` to the same version, in the same commit: the tools run on it,
  and it names the Effect of its own version as its peer. What Effect changed of an unstable module that a tool uses
  is read in its source, and the tool is fixed in that commit too, until `bun run typecheck` passes and each tool
  that changed runs as before.
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
- An upgrade of Effect is checked against what the invariants rest on, as `docs/premises.md` lists it: the tests named
  there are what keeps each premise, and one read only in Effect's source is read again in the new version. A move
  to a new major checks every premise again, and reads what the major changed of each API of Effect the library uses:
  what Effect documented is no premise, and is listed nowhere, so its migration notes are the list. An upgrade of
  React or snabbdom does the same for the bridges' premises, and updates the versions their opening comments name.
- After any upgrade: `bun install`, `bun run typecheck`, `bun run lint`, `bun run test`, and
  `cd site && bun install && bun run build` without warnings. Commit `bun.lock` and `site/bun.lock` with
  `package.json` and `site/package.json`: the documentation workflow installs both with `--frozen-lockfile`.
