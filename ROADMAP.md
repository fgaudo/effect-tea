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

Found in a review of the premises, 19 November 2026, each held by a `test.failing` case:

- **An element waits for a frame that a rejected write never draws.** `drawn` keeps an element while a frame is its
  own past: it waits for a frame that has seen the write, though `docs/invariants.md` says nothing may wait for `seen`,
  and `docs/records/registers.md` that `drawn` does not. A write rejected because its place is gone draws no frame,
  so a key the last frame has not seen stays on screen against the state, until another state comes, and a write over
  it is rejected in turn. Two cases, held by `test.failing` cases of `bridges/bridge.test_suite.ts`, in both bridges:
  - **a reused element**, "an input in the place of another input", with the `steps` views: snabbdom and React reuse
    an unkeyed `<input>` in the same place, and the field goes dead;
  - **a place the state no longer holds**, "an input whose place the state no longer holds", with the `lock` views:
    the same input, through the same dispatch, drawn open and locked, which a reused element does not explain.

  Weighed so far, none decided, each asked of the owner first since it changes a rule of the guide:
  - **a frame for each message taken that makes no new state**, the same state with the new `seen` and the same model
    (`run.ts` kept by the identity of the state), so that the last frame has seen every message taken and the wait
    becomes valid: it reopens "A frame published for every message of the view" (`docs/records/registers.md`), and
    changes "the very same state draws no new frame" (`interleaving.test.ts`), the guarantee "A message that makes no
    new state draws no frame", `simulate`, `rehearse` and `drive`, and the mutations;
  - **its narrow form, a frame only for a rejected message**: the engine knows no inputs (`docs/invariants.md`), so
    it would hold for every rejection; a key typed between the frame and the rejection is still lost;
  - **an element drawn with another dispatch is new** (`undefined` to `drawn`), kept by the bridges alone: it closes
    the reused element, not the lock, and a view whose dispatch changes in every frame would take back what is typed.
    It may go beside the first. `docs/rejected.md` parks the revision per place "if the numbering of a frame fails
    where no revision would": the dispatch gives the same, so it stays parked, but the decision says so.

  Proposed after an analysis the same day, spiked in the working tree and not kept, not decided:
  - **What goes wrong.** `drawn` bets on a write the frame has not seen: the frame's value equals what the write was
    written over, so the write will be stored, and a frame that has seen it will follow. The bet holds only while the
    value a frame gives an element is the value of the place the element writes into, which nothing checks: a renderer
    that reuses the element breaks it (the steps), and so does a view that draws an input where the state holds no
    place (the lock). When the bet is lost the write is rejected, and nothing tells the element.
  - **The run acknowledges every dispatched message**, the first of the list above, in full: a dispatched message that
    makes no new state publishes the same state with the new `seen`. A frame then says exactly which dispatched
    messages its state is the result of, the last frame has seen every one the run has taken, and "never wait for
    `seen`" becomes a promise that it comes. A message of a command or a subscription that makes no new state still
    draws no frame. **Run:** two lines of `engine.ts`; the four `test.failing` cases pass, no other test of
    `bun run test` fails (865), and the two properties of the search that state the old rule fail, as they must ("a
    frame has seen the dispatched messages taken before its state was made, and none after", "a model is made once for
    each frame the renderer pulls, and the very same state draws no frame").
  - **`drawn` by order alone**, which the first allows: a frame that has not seen all the element's writes leaves the
    element as it is, and one that has seen them gives it the frame's value. No bet is left, so an element keeps no
    `was`: a `Shown` is a value and the number of its last write, and the rule has two cases after a new element, not
    three. The cost: where the state moved on under a key the run has not taken, the element shows the program's value
    one frame later, once the key is rejected. **Run:** the four cases pass; "is rejected once the input on screen is
    emptied, which offers no save" fails on its first assertion, the emptying before the run takes the key, in both
    bridges, and so do five tests of `drawn` in `src/input.test.ts` that state the old rule. That the rest of that
    test holds is **reasoned**.
  - **An element drawn with another dispatch is new** is not needed beside them: it would save one frame of the first
    input's text in the second, and keeps its trap, a dispatch made anew in every frame.
  - Not done: `run.ts` keeping the model of the very same state, so that a bridge skips the draw of such a frame and
    only settles its inputs ("Frames cost only what is drawn"); the guide ("Guarantees", "View", "Settling an
    element", "Writing a bridge"), the doc comments of `Frame`, `Dispatch`, `Shown`, `edited` and `drawn`,
    `docs/invariants.md`, the mutations, the two properties of the search and a new one (the last frame has seen every
    dispatched message taken), the changelog.

## Possible improvements

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`tools/bench/subscriptions.ts`) measures a parent's subscriptions only, and
  `tools/bench/writes.ts`, run by hand, what a write into an input and a bridge's frame cost; neither runs in the CI.

## Ideas, to be decided

- **Bridges as packages of their own** (`@fgaudo/effect-tea-snabbdom`, `@fgaudo/effect-tea-react`): the library
  stays free of renderers, and users stop copying `bridges/snabbdom.ts` and `bridges/react.ts`.
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
