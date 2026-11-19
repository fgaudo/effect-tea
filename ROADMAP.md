# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done, with the reason in the commit. An item rejected is removed and added to
[`docs/rejected.md`](docs/rejected.md), with why and on what evidence, in the same commit: read it before adding one.
An item deferred or suspended leaves too, for "Parked, not rejected" there, with what would reopen it: this list
holds only what is to be done or decided now.

## Open problems

A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a deterministic
test of it. None is open.

## Possible improvements

In the order they would be taken, as a review of the architecture set it on 20 November 2026. Each item says what it
is, why, how it would be done, and what "done" is. Items 3, 4 and 6 wait for a decision of the owner; the others need
none.

### 1. The element of an input, as data, under the search

**Why.** `src/interleaving.test.ts` checks the rule of a write and what a frame has seen, each alone. What the two
make of an element on screen is checked only by the scenarios of `bridges/bridge.test_suite.ts`, written by hand, in a
DOM. The two faults closed on 19 November 2026 (an element reused for another input, an input whose place the state
no longer holds) were found by a review, not by the search. Until the search holds an element, "the rule of an input
is complete" is reasoned, not run.

**How.** A change of the tests alone: read [`change-engine`](.agents/skills/change-engine/SKILL.md) first.

- **An element as data, in the scenario's renderer** (`runScenario`). For each input the scenario's model draws, the
  renderer keeps what a bridge keeps: a `Shown`, `undefined` until the first frame settles it, and the text the
  element shows. After each frame it settles each element with `drawn(held, value, frame.seen)`, as
  `bridges/snabbdom.ts` does, and records an event of it (the text shown, `taken`, the frame's `seen`).
- **The user types into the element, not over the frame.** Today `typing` writes over `model.note`, the frame's value.
  With an element, the write is made by `edited(held, text)`, over what the element shows, which may be ahead of the
  frame; it is sent through `forwardTo(dispatch, 'Note')`, and `sent` is given the number the dispatch returned. The
  event of it holds that number and the text. The writes of `stale`, from an older frame, stay as they are: they are
  writes the element did not make.
- **The program of the search gains what the two faults needed.** A place that is not always there (an optic that may
  focus nothing, or a `get` that gives `None`), so that a write is sent to a place the state no longer holds. And a
  second input that the model draws in the same element in some states, so that an element holds a write of one input
  when a frame gives it another. The list is to be kept small: how is the session's choice, and it says which.
- **Two properties.**
  - _The element keeps what was typed until a frame has seen it._ After an edit numbered `n`, no settle with a `seen`
    below `n` changes the text the element shows.
  - _Once everything has happened, the element shows what its place holds._ Where nothing died, after `idle`, the text
    of each element is the value of the input the last frame drew in it, as the last state holds it.
- **The test "the scenarios reach…" names what the new properties need**: an element ahead of its frame, a write of
  the element rejected, an element given another input, a write to a place that is gone.
- **Each property is seen to fail** with the check it rests on taken out by hand: a rejected dispatched message that
  publishes no frame, a `seen` that leaves a rejected message out, a `drawn` that takes a frame that has not seen the
  last write. What is seen is reported.

**Done when** the two properties pass under `bun run interleavings`, each was seen to fail as above, and `typecheck`,
`lint`, `test`, `test:node` and `mutations` pass. `docs/invariants.md` (its first paragraph, and "A write is stored
over the value it names") and the guide's "Guarantees", "How the tests check them", say what the search checks: they
are changed in the same commit, the guide by its own rule, one sentence checked against the old one.

### 2. The properties of an input and of `seen`, as killers of their mutations

**Why.** The property "the last frame has seen every dispatched message taken" (`interleaving.test.ts`, added on 19
November 2026 with the acknowledgement of every dispatched message) is the killer of no mutation: it was not run a
hundred times under the mutations that take the acknowledgement out, as `change-engine` asks of a property before the
list names it. The deterministic tests of `engine.test.ts` and `run.test.ts` are their killers meanwhile. The two
properties of item 1 will be in the same place.

**How.** Taken with item 1, or right after it. For each of the three properties, and each mutation of
`tools/mutations/mutations.ts` that takes out a check it rests on, run the property alone a hundred times under the
mutation. Name it among that mutation's killers only if it fails on each of the hundred.

**Done when** each property is a killer in the list, or the item of `docs/invariants.md` says why it is none, with the
count of the hundred runs.

### 3. The value of an input, read in `makeModel` through its declaration

**Why.** A program says where an input is (`get`, or `at`), and says again in `makeModel` in which states the view
draws it. `examples/stocktake` computes `editable` apart from the `get` of `Count`, and a test keeps the two in step.
A child has no such second saying: `children.Row(state, id)` is its model.

**The proposal.** `makeModel` is given handles of the inputs, as it is given those of the children:
`inputs.Count(state, id)` is the value the place holds, or `None` where the input has no place. A model then holds an
input only where a write has a place. For an input that is always there, `state.name` says as much: the gain is for
places that come and go.

**How.** An API change that the owner decides: read [`change-api`](.agents/skills/change-api/SKILL.md) first.

1. Read [`docs/records/registers.md`](docs/records/registers.md) whole: the review read its last chapters and
   `docs/rejected.md`, and found the idea in neither, but not the chapters before "A plain input".
2. Spike it on a branch, never to be merged: the handles in `compose.ts` and `program.ts`, and `stocktake`, `form` and
   `timer` ported. Open, for the spike: a third argument of `makeModel` or the same object as the children's; whether
   an input at an optic that always focuses gives the value itself, not an `Option`; whether `update` is given them.
3. Run `bun run inference` and the smoke test on it, and compare `stocktake` before and after.
4. The owner decides on the spike. Refused, it goes to `docs/rejected.md` with the spike's commit.

**Done when** it is in the API with its guide, doc comments, changelog and API report, or in `docs/rejected.md`.

### 4. The bridges as packages of their own

**Why.** `@fgaudo/effect-tea-snabbdom` and `@fgaudo/effect-tea-react`: the library stays free of renderers, and users
stop copying `bridges/snabbdom.ts` and `bridges/react.ts`. A fix of a bridge, as those of 16 and 19 November 2026,
does not reach a copy, and what a screen shows of an input is promised through code that no version names. The caret
and an IME composition were never run in a real browser.

**The proposal.** The contract stays as narrow as it is today (a frame drawn whole and at once, a native text field,
and the list of the guide's "What is left out"): the packages add no feature of a renderer.
[`docs/rejected.md`](docs/rejected.md), "The bridges", says what the owner declined on 16 November 2026, and reopens
on this.

**How.** After item 1, whose element as data is the bridges' contract in a form a test holds.

1. The owner decides: whether, the names, one repository with workspaces or several, and what each package promises.
2. The bridges move to packages with `@fgaudo/effect-tea` and their renderer as peers, each with its tests; the
   examples and `tools/smoke/` import them.
3. The tests of `bridges/bridge.test_suite.ts` run in a real browser too, with the caret and an IME composition when
   the program changes a value under the user.
4. The guide's "Writing a bridge" stays, for a renderer the packages do not cover; `release` learns of the packages.

**Done when** the packages are published with the library, or the entry of `docs/rejected.md` says why not.

### 5. A benchmark that runs in the CI

Many children, many messages per second, to keep "frames cost only what is drawn" from regressing. `bun run bench`
(`tools/bench/subscriptions.ts`) measures a parent's subscriptions only, and `tools/bench/writes.ts`, run by hand,
what a write into an input and a bridge's frame cost; neither runs in the CI. To be designed: what is measured, and
against what it fails, since a CI machine's times vary.

### 6. A frame a bridge does not draw again still waits for the next animation frame

In both bridges, a frame of the very same model only settles the inputs, and could be taken at once. Kept, so that a
bridge takes at most one frame per screen refresh, whatever it draws. Weighed in the review of 20 November 2026,
reasoned: left as it is. A rejected key stays on screen for one refresh at most, and a bridge that took such frames at
once would settle its inputs once for each key of a burst. The owner has not decided: agreed, it goes to
`docs/rejected.md`.

## Ideas, to be decided

- **A devtools bridge over `onApplied`** (e.g. Redux DevTools), with time travel through `init: { state }` and
  replay through `applyAll`.
- **An example of routing**: flags from the URL, `popstate` as a subscription, navigation as a command.
- **An example of hot module reloading** that keeps the state, which the guide hints at (the view lives in a
  module of its own) without showing.
- **An example of saving each state before its commands start**, which the guide names ("Running", "Work that must
  wait goes to the effects of the program") without showing: `onApplied` offers the state and its revision to a
  queue, a fiber of whoever runs the program saves it, and a wrapped `runCommand` waits until the state its step
  heard is saved. The options are functions since 19 November 2026; this is the form of an option that once waited.
- **What 1.0 needs**: the API looks close to stable; what `docs/rejected.md` parks would change it, and is weighed
  before freezing it.
