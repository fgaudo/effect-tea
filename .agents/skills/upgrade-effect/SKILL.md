---
name: upgrade-effect
description: How @fgaudo/effect-tea depends on Effect: the peer range is the patches of the version the library is developed with, and an upgrade raises both together; what to do when an API it needs is in a newer Effect, unstable or deprecated, and how to upgrade the development dependencies (Effect, the language service, TypeScript, TypeDoc). Use when an Effect API is missing, unstable or deprecated, or when upgrading a dependency.
---

# Upgrade Effect and the dependencies

## The peer range

`peerDependencies.effect` (`~4.1.5`) is the version of `devDependencies.effect` with a tilde, and the lockfile holds
exactly that version. No older Effect is supported, and no later minor: what Effect does not document may change in a
minor, and the premises rest on some of it, so a new minor is supported only by an upgrade and a release. A renderer's
range is a caret from the version its bridge is developed with (`^19.3.1`, `^3.6.4`): a tilde would refuse the whole
package to an application on a later minor.

The daily jobs are the alarms. `.github/workflows/effect-latest.yml` runs the typecheck and the tests at the newest
patch the range accepts; at the newest minor of Effect 4, when later, with ten runs of the search and an issue,
`Effect <version> passes the tests` or `… fails the tests`; and at the newest build of Effect's `main` on pkg.pr.new,
with an issue for a build that fails. `.github/workflows/renderers-latest.yml` runs the bridges' tests and premises at
the newest renderer the range accepts. The oldest TypeScript supported is Effect's (5.9), which the README states and
`tools/smoke/smoke.ts` checks.

## A premise that falls inside the range

A published version keeps its range. When the daily job fails at a version the range accepts, on a premise's test:

1. Release a patch whose range leaves that version out (`>=4.1.5 <4.1.7`), with a `Changed` entry that names it.
2. Tell the owner which versions of the library accept the broken Effect, for `npm deprecate`, which the owner runs.
3. Then fix it by an upgrade (below) to a version the library holds on.

When the alarm on Effect's `main` names a premise's test, the patch that leaves the version out is prepared before
Effect releases it. A request to Effect, which the owner opens ("Deciding" in `AGENTS.md`), asks for the general rule
of an API or a family of modules, never the library's case alone, nor again what Effect declined (the "intentionally
not broadened" list of Effect-TS/effect#10683).

## An API of a newer Effect

An API that Effect has only since a later version (its `@since` in `node_modules/effect/dist/<Module>.d.ts`) calls for
an upgrade, not a workaround.

## Upgrading Effect

1. `bun add --dev effect@~4.<minor>.<patch> @effect/platform-bun@~4.<minor>.<patch>`.
2. Set `peerDependencies.effect` to the same tilde range, and the version in the README's "Installation".
3. Read what changed in Effect's source in the modules the premises name and in the runtime (`internal/effect.ts`).
4. Read what the JSDoc of each API the library uses promises now that it did not: a premise it documents leaves
   `docs/premises.md` with its test, or keeps only the part still not promised. What the new `ai-docs` and
   effect.website say of a premise is named in it. A guard that the new guarantee makes unneeded is a lead for a
   simplification ("Deciding"), with the guarantee quoted in the commit and its mutation removed (`change-engine`).
5. A raised peer range is a `Changed` entry that names the new minimum ([`release`](../release/SKILL.md)).
6. Each tool that uses an unstable module of Effect (`effect/cli`, `effect/process`) is fixed in the same commit, until
   `bun run typecheck` passes and it runs as before.

A move to a new major checks every premise again, and reads what the major changed of each API the library uses: what
Effect documented is listed nowhere, so its migration notes are the list. An upgrade of React or snabbdom does the
same for the bridges' premises, and updates the versions their opening comments name.

## Deprecated APIs

A deprecated API that the library uses is replaced by what the deprecation names (fast-check's `waitNext(1)` for
`waitOne()`), at the latest by the upgrade that deprecates it.

## Upgrading the development dependencies

- `@effect/tsgo` is pinned exactly. `prepare` patches the workspace's TypeScript with it (`effect-tsgo patch`, through
  `bunx`), so that `tsc` and VS Code run the Effect language service; `bun install` runs it again after an upgrade.
  `oxlint-tsgolint` runs Oxlint's type-aware rules.
- `typescript` 7 at the root. `site/` has its own `typescript` 6, for TypeDoc alone: when TypeDoc supports 7, move it
  to the root and drop the site's TypeScript.
- After any upgrade: `bun install`, `bun run typecheck`, `bun run lint`, `bun run test`, and
  `cd site && bun install && bun run build` without warnings. Commit `bun.lock` and `site/bun.lock` with the
  `package.json` files: the documentation workflow installs both with `--frozen-lockfile`.
