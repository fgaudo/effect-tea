---
name: upgrade-effect
description: How @fgaudo/effect-tea depends on Effect: the peer range is a caret from the version the library is developed with, and an upgrade raises both together; what follows a premise that falls; what to do when an API it needs is in a newer Effect, unstable or deprecated, and how to upgrade the development dependencies (Effect, the language service, TypeScript, TypeDoc). Use when an Effect API is missing, unstable or deprecated, or when upgrading a dependency.
---

# Upgrade Effect and the dependencies

## The peer range

`peerDependencies.effect` (`^4.1.6`) is a caret from the version of `devDependencies.effect` (`~4.1.6`), and the
lockfile holds exactly that version: the oldest Effect the range accepts, which the CI runs. No older Effect is
supported. Every later Effect 4 is: but for one premise, which `docs/premises.md` names ("The rule"), no promise of the
guide rests on what Effect may change within a major, and a narrower range would hold back the Effect of an
application, whose other packages of Effect ask for one version of it. A renderer's range is a caret from the version
its bridge is developed with (`^19.3.0`, `^3.6.4`).

The daily jobs are the alarms. `.github/workflows/effect-latest.yml` runs the typecheck and the tests at the newest
patch of the lockfile's minor; at the newest minor of Effect 4, when later, with ten runs of the search; and at the
newest build of Effect's `main` on pkg.pr.new. The last two open an issue for a version or a build that fails,
`Effect <version> fails the tests` or `Effect main at <commit> fails the tests`, and none for one that passes.
`.github/workflows/renderers-latest.yml` runs the bridges' tests and premises at the newest renderer the range
accepts. The oldest TypeScript supported is Effect's (5.9), which the README states and `tools/smoke/smoke.ts` checks.

## A premise that falls

A published version keeps its range, so what follows an alarm at a version the range accepts goes by the kind of the
premise whose test failed (`docs/premises.md`, "The rule"):

- **Open**, and holding no promise: none fell. The engine, or a tool of development, does otherwise where the guide
  leaves it unspecified. An upgrade (below) to that version fixes it: the premise's test says what Effect does now, or
  the premise goes, with what the guide and `docs/invariants.md` describe of it.
- **By the model**, the open premise that holds a promise, or a test of the library that names no premise: a promise
  may have fallen.
  1. Release a patch whose range leaves that version out (`>=4.1.6 <4.3.0`), with a `Changed` entry that names it.
  2. Tell the owner which versions of the library accept the broken Effect, for `npm deprecate`, which the owner runs,
     and draft the report of the bug for Effect, which the owner opens.
  3. Then fix it by an upgrade (below) to a version the library holds on.

When the alarm on Effect's `main` names a premise's test, what follows is prepared before Effect releases it. A request
to Effect, which the owner opens ("Deciding" in `AGENTS.md`), asks for the general rule of an API or a family of
modules, never the library's case alone, nor again what Effect declined (the "intentionally not broadened" list of
Effect-TS/effect#10683), nor what follows from the model of an API (Effect-TS/effect#10878).

## An API of a newer Effect

An API that Effect has only since a later version (its `@since` in `node_modules/effect/dist/<Module>.d.ts`) calls for
an upgrade, not a workaround.

## Upgrading Effect

An upgrade raises the oldest Effect the library accepts, which every user must then have. It is made for an API or a
documented guarantee of a newer Effect that the library needs, or for a premise that fell: a version that passes the
daily jobs needs none.

1. `bun add --dev effect@~4.<minor>.<patch> @effect/platform-bun@~4.<minor>.<patch>`.
2. Set `peerDependencies.effect` to the caret of that version (`^4.<minor>.<patch>`), and the version in the README's
   "Installation".
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
