# Roadmap

What is to be done or decided now, and nothing else. Nothing here is a promise: each item is decided before it is
done, against the rules of [`AGENTS.md`](AGENTS.md). An item done is removed, with the reason in the commit. An item
rejected is removed and added to [`docs/rejected.md`](docs/rejected.md), with why and on what evidence, in the same
commit: read it before adding one. An item deferred or suspended leaves too, for "Parked, not rejected" there, with
what would reopen it. How an item came to be, and what was weighed for it, goes in a record of
[`docs/records/`](docs/records), not here: the order below comes from
[`adoption.md`](docs/records/adoption.md), the owner's decision that the library is meant to be adopted by others, but
for item 1, which the owner put before the release on the same day
([`synchronous-dispatch.md`](docs/records/synchronous-dispatch.md), R2).

## Open problems

A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a deterministic
test of it. None is open.

## Next, in order

### 1. A dispatch that applies its message at once

**Why.** A dispatch only queues its message, and `update` hears it later. An element with a value of its own needs the
state to change during its event. What the library has for the element of an input follows from that one premise:
`seen`, the number a dispatch returns, `Shown`, `edited`, `drawn`, and bridges that settle a native text field alone.
Spiked on 20 November 2026, and decided by the owner the same day, with every answer of its plan.

**How.** As the plan of [`docs/records/synchronous-dispatch.md`](docs/records/synchronous-dispatch.md) says, in stages,
on `main`. The new engine, the new testing tools and the new bridges are written beside the old ones, in `src/next/`
and `bridges/next/`, and swapped in one commit. Stages 0 and 1 are done: the decisions, and the engine with its run,
in `src/next/`. **The next step is stages 2 and 3, at once**: the testing tools and the bridges. Then a spike of an
input as a value of the library's in the model, which the owner decides on before the swap; the swap (4); and a
reader's check of the documentation (5).

**Done when** the swap is committed, every check of its stage passed, and the reader's check is done.

### 2. Release 0.8.0

**Why.** The unreleased section of `CHANGELOG.md` is long, and users get none of it until a release: the bridges as
entries of the package, the inputs, the fixed declarations. It comes after item 1, which removes exports that no
release has had yet.

**How.** As [`release`](.agents/skills/release/SKILL.md) says. First a review of the premises
([`premise-review`](.agents/skills/premise-review/SKILL.md)), in a session that wrote none of the changes of the engine
and of the testing tools since the last review. Then `bun run mutations` and `bun run interleavings`, and the site
built without warnings. Then the release commit and its tag. The owner publishes to npm.

**Done when** the tag `v0.8.0` is pushed.

### 3. The bridges in a real browser

**Why.** The bridges' tests run on happy-dom, which no browser is. The caret, and an IME composition while the program
changes a value under the user, were never run. It comes after item 1, which replaces both bridges, and whose plan
leaves it one more case: what is typed with snabbdom between a notice and its draw.

**How.** The tests of `bridges/bridge.test_suite.ts` run in a real browser too, with those two cases; the tool is to be
chosen. With React, also not run: `startTransition` or `useDeferredValue` in the application, Fast Refresh (likely to
restart the run, as `<Activity>` does), server rendering and hydration. Under `renderToString`, `Frames` throws, since
its `useSyncExternalStore` has no `getServerSnapshot`: found by the smoke test on 20 November 2026. Whether the bridge
supports server rendering is to be decided.

**Done when** the suite passes in a real browser, in the CI or by a command written down in the repository.

### 4. The changes that break the API

**Why.** A user who adopts the library asks that its API stays, and a change that breaks it costs less the fewer users
it has. The API looks close to stable, but what `docs/rejected.md` parks would change it.

**How.** Each entry of "Parked, not rejected" in `docs/rejected.md` that touches the API is weighed again with the
owner: taken now, in a 0.x release, or kept parked.

**Done when** each such entry is taken or kept parked by the owner's decision.

### 5. A view of the library's own

**Why.** A view as data over snabbdom: a node holds its message, a child's view is lifted by a node that wraps its
messages, an input's node names its input. A test then finds every message a view can send without a DOM, and no user
writes the part of a bridge that settles an input. It is the largest item. It is weighed again after item 1, whose
bridges settle no input, so that reason goes (R3 of its record).

**How.** Not decided. [`adoption.md`](docs/records/adoption.md), "A wider form", says what it would be, what it costs,
and what was weighed beside it. The owner decides whether to make it, under which name, and whether
`@fgaudo/effect-tea/snabbdom` stays beside it.

**Done when** the owner has decided, and the view is made, or the entry of `docs/rejected.md` says why not.

## Waiting for the owner

- **Whether the search reaches what only the deterministic tests kill.** Left by the session that put the element of
  an input under the search, 20 November 2026 (run). Item 1 removes `seen` and what an element holds of an input: both
  points go with its swap, unless they are decided before.
  - The property "once everything has happened, the element shows what the last state holds for the input drawn in
    it" is the killer of no mutation of the acknowledgement or of `seen`: under them it fails on 15 to 60 of a hundred
    runs of 60 scenarios, not on each. About 1,500 scenarios would make it one, by the rate measured, for a few seconds
    more of `bun run interleavings`. To decide: whether that is worth it, the deterministic tests being their killers.
  - "A frame that has seen the last write leaves the element as if it had not" is killed by none of the three
    properties of the search: it needs a frame whose `seen` is the number of the last write after a rejection, and
    nothing after. The deterministic tests are its killers. To decide: whether the scenario is made to reach it.

## Any time

None of these waits for the items above, nor holds them up.

- **The README says what the library is and for whom, and names Foldkit**, as the owner's decision of 20 November
  2026 asks ([`adoption.md`](docs/records/adoption.md)): one reader starts a new application, the other has one
  already, most often in React.
- **A benchmark that runs in the CI.** Many children, many messages per second, to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`tools/bench/subscriptions.ts`) measures a parent's subscriptions only, and
  `tools/bench/writes.ts`, run by hand, what a write into an input and a bridge's frame cost; neither runs in the CI.
  To be designed: what is measured, and against what it fails, since a CI machine's times vary.
- **A devtools bridge over `onApplied`** (e.g. Redux DevTools), with time travel through `init: { state }` and
  replay through `applyAll`.
- **An example of routing**: flags from the URL, `popstate` as a subscription, navigation as a command.
- **An example of hot module reloading** that keeps the state, which the guide hints at (the view lives in a
  module of its own) without showing.
- **An example of saving each state before its commands start**, which the guide names ("Running", "Work that must
  wait goes to the effects of the program") without showing: `onApplied` offers the state and its revision to a
  queue, a fiber of whoever runs the program saves it, and a wrapped `runCommand` waits until the state its step
  heard is saved.

## Low priority

- **1.0.** Not before the library has been made known and used by others for at least one or two months, as the owner
  decided on 20 November 2026: only then may 1.0 be decided, with what its users have asked of the API. Until then,
  releases stay at 0.x.
