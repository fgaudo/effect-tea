# Roadmap

What is to be done or decided now, and nothing else. Nothing here is a promise: each item is decided before it is
done, against the rules of [`AGENTS.md`](AGENTS.md). An item done is removed, with the reason in the commit. An item
rejected is removed and added to [`docs/rejected.md`](docs/rejected.md), with why and on what evidence, in the same
commit: read it before adding one. An item deferred or suspended leaves too, for "Parked, not rejected" there, with
what would reopen it. How an item came to be, and what was weighed for it, goes in a record of
[`docs/records/`](docs/records), not here: the order below comes from
[`adoption.md`](docs/records/adoption.md), the owner's decision that the library is meant to be adopted by others.

## Open problems

A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a deterministic
test of it. None is open.

## Next, in order

### 1. Release 0.8.0

**Why.** The unreleased section of `CHANGELOG.md` is long, and users get none of it until a release: the bridges as
entries of the package, the inputs, the fixed declarations.

**How.** As [`release`](.agents/skills/release/SKILL.md) says. First a review of the premises
([`premise-review`](.agents/skills/premise-review/SKILL.md)), in a session that wrote none of the changes of the engine
and of the testing tools since the last review. Then `bun run mutations` and `bun run interleavings`, and the site
built without warnings. Then the release commit and its tag. The owner publishes to npm.

**Done when** the tag `v0.8.0` is pushed.

### 2. The bridges in a real browser

**Why.** The bridges' tests run on happy-dom, which no browser is. The caret, and an IME composition while the program
changes a value under the user, were never run.

**How.** The tests of `bridges/bridge.test_suite.ts` run in a real browser too, with those two cases; the tool is to be
chosen. With React, also not run: `startTransition` or `useDeferredValue` in the application, Fast Refresh (likely to
restart the run, as `<Activity>` does), server rendering and hydration. Under `renderToString`, `Frames` throws, since
its `useSyncExternalStore` has no `getServerSnapshot`: found by the smoke test on 20 November 2026. Whether the bridge
supports server rendering is to be decided.

**Done when** the suite passes in a real browser, in the CI or by a command written down in the repository.

### 3. The changes that break the API

**Why.** A user who adopts the library asks that its API stays, and a change that breaks it costs less the fewer users
it has. The API looks close to stable, but what `docs/rejected.md` parks would change it.

**How.** Each entry of "Parked, not rejected" in `docs/rejected.md` that touches the API is weighed again with the
owner: taken now, in a 0.x release, or kept parked.

**Done when** each such entry is taken or kept parked by the owner's decision.

### 4. A view of the library's own

**Why.** A view as data over snabbdom: a node holds its message, a child's view is lifted by a node that wraps its
messages, an input's node names its input. A test then finds every message a view can send without a DOM, and no user
writes the part of a bridge that settles an input. It is the largest item.

**How.** Not decided. [`adoption.md`](docs/records/adoption.md), "A wider form", says what it would be, what it costs,
and what was weighed beside it. The owner decides whether to make it, under which name, and whether
`@fgaudo/effect-tea/snabbdom` stays beside it.

**Done when** the owner has decided, and the view is made, or the entry of `docs/rejected.md` says why not.

## Waiting for the owner

- **Whether the search reaches what only the deterministic tests kill.** Left by the session that put the element of
  an input under the search, 20 November 2026 (run):
  - The property "once everything has happened, the element shows what the last state holds for the input drawn in
    it" is the killer of no mutation of the acknowledgement or of `seen`: under them it fails on 15 to 60 of a hundred
    runs of 60 scenarios, not on each. About 1,500 scenarios would make it one, by the rate measured, for a few seconds
    more of `bun run interleavings`. To decide: whether that is worth it, the deterministic tests being their killers.
  - "A frame that has seen the last write leaves the element as if it had not" is killed by none of the three
    properties of the search: it needs a frame whose `seen` is the number of the last write after a rejection, and
    nothing after. The deterministic tests are its killers. To decide: whether the scenario is made to reach it.
- **Whether a dispatch applies its message at once.** Proposed on 20 November 2026 by a session of Fable 5.2, asked
  how to settle the bridges with a free hand over the premises, the invariants, the API and the goals. Spiked
  since (below), and nothing of it is on `main`. The owner took the direction the same day, after the spike, and asked
  for a plan of the implementation: the next step is that plan, not written yet.
  - **The diagnosis.** A dispatch only queues its message, and `update` hears it later, in the run's fiber (the guide,
    "View", "Sending only hands the message to the run"). An element with a value of its own needs the state to change
    during its event: React's documentation says that a controlled input updates its value synchronously in `onChange`
    (react.dev, `<input>`, "Caveats" and "My input caret jumps to the beginning on every keystroke", read that day).
    What the library has for the element of an input follows from that one premise: `seen`, the number a dispatch
    returns, a frame for each dispatched message, `Shown`, `edited`, `drawn`, `Shows` over an uncontrolled `<input>`,
    and bridges that settle a native text field alone.
  - **The proposal.** When a dispatch returns, `update` has heard the message and the state is the new one. The pure
    half of a step is one synchronous thunk; its effects (the subscriptions stopped and started, the commands started,
    the logs) follow in a fiber, in the order of the states. A renderer is given the current model, a notice of each
    change and the dispatch, and no stream of frames: it draws a widget as its own documentation says a controlled one
    is drawn, a text field, a select, a checkbox or a component of a library alike. `input`, `inputById` and `Written`
    stay, as the program's own. Gone: `edited`, `drawn`, `Shown`, `Frame.seen`, the numbered dispatch, `Shows`,
    `shows`, the bridges' handlers, and what the guide promises of an element.
  - **What it changes of "Guarantees".** The next message no longer waits for the slowest release: the effects of the
    next state do, so a key that comes back still finds its old subscription released. "A handler returns before
    `update` has seen its message" is reversed. A message of a stopped subscription is dropped by its start, as today.
  - **Run first**, in `scratch/sync-store/probe.test.ts`, outside git and not kept, on happy-dom with React 19.3.1 and
    Bun 1.4.5, a program with three inputs drawn as controlled elements through `useSyncExternalStore`. With its
    `update` applied in the dispatch: a text field keeps what is typed in its middle, and its caret; a select and a
    checkbox hold. With the same `update` applied a microtask later, and with `run` as it is, drawn by `Frames`: React
    takes back what was typed as the event ends, then shows it with the caret moved to the end.
  - **Spiked**, the same day, by a session of Opus 5.5, in two phases, on the branch
    `claude/spike-sync-dispatch-b4e430` (cut from `ee45648`, at `26b2cc1`), never to be merged. Its record is on that
    branch alone, `docs/records/synchronous-dispatch.md`: read it there, with what the guide and `docs/invariants.md`
    would say. Additive, in `src/sync/`, `bridges/sync/` and `examples/sync/`. Run again by the session that briefed
    it: `typecheck`, `lint`, `bun run test` (1,013), `bun run test:node` (736), and the search ported to the new run
    (21 properties, four runs, no lead).
    - **The engine**, about 330 lines where `engine.ts` has 445, with `core.ts` and `shell.ts` unchanged: every
      guarantee restated holds, with no `test.failing`.
    - **The bridge to React**: 69 lines of code where `bridges/react.ts` has 192, five exports where it has eleven:
      `Host`, and `Draw` over `useSyncExternalStore`. A text field, a textarea, a select, a checkbox, a range, a
      component with state of its own, `memo`, Suspense, a portal and a shadow root pass. Six of the nine premises of
      `hosted-react.md` are gone.
    - **The bridge to snabbdom is no simpler**: 106 lines of code where `bridges/snabbdom.ts` has 91. It compares each
      controlled prop with the element after a draw, draws a handler's message at once, and draws any other notice at
      the next animation frame.
    - **In the built-in browser of the desktop app**, on the spike's page of the form, with keys sent as a user's: both
      fields keep what is typed in their middle, and the caret, and Save empties both. An IME composition was not run.
  - **What the spike found against it.**
    - `update`, the options and the renderer's listeners run on the stack of whoever sends the message.
    - The end of the run may begin inside a dispatch: a waiter on `died` resumes on the stack that records the defect.
    - The effects may lag behind the state without a bound, and a dispatch sent while another is applied returns
      before its message is applied.
    - Two premises read only in Effect's source are flagged, and neither is adopted: the first goes with a synchronous
      `record` in `shell.ts`, and nothing rests on the second.
    - A view takes `was` from the model it was drawn with, so a second write before a draw is rejected. That is why
      the snabbdom bridge draws in each handler, and why, with React, a source outside React that writes twice before
      a render loses its second write.
    - React sends no `onChange` for a value that a script writes past its setter, and a form's reset is still left out
      with snabbdom.
  - **A second step, apart**: an input as a value of the library's in the model, its value and its name together,
    which a view writes with `dispatch(write(model.name, text))`. It reopens "Handles of the inputs in `makeModel`"
    (`docs/rejected.md`): with no bridge that settles an element, its cost there, "both bridges", is gone. The spike's
    views build `Written` by hand in each handler, which this would end.
  - **To decide, in the plan**: the seven points the record leaves for the engine and the six for
    the bridges; whether `was` stays once a dispatch applies at once, and when a bridge to snabbdom draws, which the
    spike shows to be one question; whether 0.8.0 (item 1) is released before, since it would publish the entries and
    the exports that this removes; and item 4, whose first reason, that no user writes the part of a bridge that
    settles an input, would be gone.

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
