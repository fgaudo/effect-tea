# A write without `was`: the spike

**Status:** spiked, 20 November 2026, by a session of Opus 5.5, on the branch `claude/spike-write-without-was` at
`c806767`, never to be merged. Waiting for the owner's decision (step 1 of [`ROADMAP.md`](../../ROADMAP.md)). It answers
"What the spike must show" of [`architecture-review.md`](architecture-review.md), part 1, which says why `was` is in
doubt. Last read against the code at `9efe8d1`.

## In short

A write carries its value alone, and is stored wherever its place is there. The bridge to snabbdom draws in a
microtask after each notice, as React renders a store, and no longer at the next animation frame: so no handler of an
event the browser dispatches runs on a view older than the state, and a key is always typed over what the program put
there. Every check of the repository passes on the branch but `bun run comments`, which fails only on the two sections
of the guide the spike names and does not write. In Chromium, no key was lost and no write was rejected, on screen and
hidden.

What it costs: a subscription that sends far more often than the screen refreshes is drawn once for each task, and
holds the run back, as React does. And a user's own tests of a snabbdom view in a DOM await a microtask after an event.

Without the new bridge, `was` cannot go. In the same page, the bridge of `main` (an animation frame) with writes
without `was` lost an update that another renderer had made: the stale write that R1 of
[`synchronous-dispatch.md`](synchronous-dispatch.md) feared. The two changes are one.

## What was built

- **`src/input.ts`.** `Written<A>` is `{ _tag: 'Written', value }`. `written` stores the value, and a value equal to
  the one held, by `Equal`, leaves the very same value. A place that is not there is rejected by the routing, before
  `written` is called, as before.
- **`bridges/snabbdom.ts`.** One way to draw, in a microtask:
  - A notice queues one microtask, which draws the model of the current state. The notices of one task are drawn once.
  - The dispatch the view is given applies the message, then asks for a draw too, whether the message made a new state
    or not: a rejected write makes no notice, and the element must be given its value back.
  - What a draw throws completes a `Deferred` with the defect, which the renderer's fiber awaits.
  - Once the renderer is released, a draw it asked for before is not made: a second run may draw into the same root.
  - Gone: the animation frame, `noticed`, `wake` and `until`, the draw inside each handler, and the guard of a draw
    asked for while a patch runs (`drawing` and `again`). No microtask runs while a patch is on the stack, so a message
    a listener sends during a patch is drawn after it, in a microtask of its own.
- **Tests.** `src/input.test.ts`: a write after the parent replaced the place is stored into the place as it is then.
  The search (`src/interleaving.test.ts`): "a write into the field is stored exactly when its place is there, whatever
  it is", and the coverage "a write to a place that is gone" in place of "a stale write"; 21 properties pass. The
  bridges' shared suite awaits each draw (`drawn` returns a promise). The snabbdom bridge's own tests say when it
  draws: in a microtask, the notices of one task once, no screen refresh asked for, a listener's message after the
  patch, and a draw asked for before the run ends not made after it (new). The examples' tests lose their tests of a
  stale write.
- **Mutations.** 211, all killed: the two of `was` and the thirteen of the old bridge go, and nine for the new bridge
  come.
- **`tools/bench/writes.ts`** loses its cases of `was` a copy, and its section of rejected writes.
- **A probe page**, `examples/spike-write/`, on the branch only: one run of a note drawn by the new bridge, by the
  bridge of `main` (copied as `main-bridge.ts`) and by React; a subscription that appends `·` to the very text typed
  every 300 ms; a field whose `set` stores capitals; two writes in one handler; and a measure of a subscription that
  sends often. Served with `bun --port=3417 examples/spike-write/index.html` after `bun run build`.

## The way the bridge to snabbdom takes

The review offered two ways. The spike takes the first, drawn in a microtask rather than at once.

- **At every notice, in a microtask.** The HTML Standard runs the microtasks after each task, and after each callback
  it calls once the stack is empty, a listener of an event the browser dispatches among them. A notice queues its draw,
  so the draw comes before the browser handles the next event. React renders a store's notice the same way, in a
  microtask. A draw at once, inside the notice, was not taken: it would patch for each message of a burst, and inside
  the engine's listeners.
- **The capture phase, not built.** The review would draw a pending notice from a listener in the capture phase, for
  each type of event the vnodes listen to. Reasoned: the browser inserts a key into the element before it dispatches
  `input`, so a draw at the capture of `input` gives the element back the program's value, and the key is lost. To keep
  it, the bridge would listen to the events that come before the default action (`beforeinput`, `keydown`,
  `pointerdown`, and more), a list that the bridge would keep, for what a vnode listens to and for what it does not
  (autofill, a drop). And the key would still be typed over a value the user had not seen.

Where a stale view remains: an event that the program's own code dispatches in the task of a notice, before the draw
(`element.click()`, `dispatchEvent`, `focus()`). Its handler runs on the view of before the notice. A write from it is
stored over what the program put there in that task. React has the same window.

## The form of a write

`{ _tag: 'Written', value }`, kept. Not built, reasoned:

- The tag lets `Rehearsal.hear` refuse a write by its shape (`Heard` in `src/testing/rehearse.ts`). The value alone
  could not be told from an own message.
- An input whose value is itself a tagged object would be read as a message of the program.
- The value alone would make `forwardTo(dispatch, 'Name')` a `Dispatch<string>`, which is shorter in a view. That is
  all it gains.

## What was run

On the branch: `typecheck`, `lint`, `test` (916), `test:node` (712), `interleavings` (21 properties), `mutations`
(211, all killed), `build`. `comments` fails on the two sections the doc comment of `Written` names, which the guide
does not have yet. Not run: `smoke`, `api --check`, the site's build, `inference` (no type of `program.ts` or
`compose.ts` changed shape but `Written`).

### By hand, in Chromium

In the built-in browser of the desktop app, with keys sent as a user's, one at a time. "Hidden" is the pane hidden:
`visibilityState` still says `visible`, and its animation frames came about every 670 ms. "On screen" is a display of
144 Hz.

- **Typed while a subscription writes into the very field.** With the new bridge, hidden and on screen, 52 and then 36
  keys sent one at a time: every key was stored, in order, and no write was rejected. With React, hidden, text sent as
  one insertion at a time (the tool's `type`, one `input` event for each): all stored. Keys one at a time into React
  with the subscription running were not sent. The caret stays where the user types until the program changes the
  value: then the bridge sets the element's value, and Chromium puts the caret at the end, as it did with React.
  Reasoned, not run: the bridge of `main` does the same, since its draw sets the value too.
- **The bridge of `main`, without `was`, hidden.** Its field showed a value older than the state for one frame. Text
  typed into the React field ("KLMNOPQRST") was in the state; the first key typed into the field of `main`'s bridge
  wrote that older value back, and the text was gone from the state. With `was`, that write would have been rejected
  and taken back.
- **Two writes in one handler.** With snabbdom, and with React from a listener outside React: both stored. With `was`,
  React's second was rejected ("Waiting for the owner" in `ROADMAP.md`).
- **A `set` that stores capitals.** A key in the middle is stored in capitals and shown at once, by both bridges. Since
  the value differs from what the element holds, the bridge sets it, and the caret goes to the end: the next keys land
  there. React does the same.
- **Not run:** a text typed over a selection, an IME composition, Firefox and WebKit.

### The measure

A program of 1,000 rows, each drawn from a counter that a subscription ticks; five seconds each, on screen, with the
display at 144 Hz. "Draw" is the view and the patch, measured to the observer of the patch's mutations.

| subscription                                    | bridge          | messages/s   | draws/s    | draw    | drawing         |
| ----------------------------------------------- | --------------- | ------------ | ---------- | ------- | --------------- |
| `Effect.sleep("1 millis")`, about 137 a second  | microtask       | 136          | 136        | 1.38 ms | 188 ms/s        |
|                                                 | animation frame | 137          | 136        | 1.39 ms | 189 ms/s        |
| 50 messages in one task, every 100 ms           | microtask       | 479          | 10         | 1.70 ms | 17 ms/s         |
|                                                 | animation frame | 480          | 10         | 1.65 ms | 16 ms/s         |
| one message for each task of a `MessageChannel` | microtask       | 150 to 192   | 150 to 192 | 1.1 ms  | 172 to 209 ms/s |
|                                                 | animation frame | 614 to 1,528 | 136 to 142 | 1.2 ms  | 160 to 172 ms/s |
|                                                 | React           | 102 to 144   | 101 to 104 |         |                 |

Two runs each of the last; the others once. Below the refresh rate, and with a burst in one task, the two ways draw
alike. Far above it, the microtask draws once for each task, and the subscription sends about one message a draw: the
run is held back to the rate it can draw at, as React's is. Hidden, the timers are slowed, and the microtask bridge
went on drawing (85 draws a second, 110 ms of drawing a second) where the animation frame drew almost nothing.

## What the guide would say

Each by the rule of `AGENTS.md`: one section at a time, the same promise or the new one, checked against the code.

- **"Inputs the user types into".** "The view writes over the value its model holds" becomes: the view writes what the
  element holds, `{ _tag: 'Written', value }`. "The library stores what is written, whatever it is" loses its condition
  on `was`. "The library rejects the write in any other state" becomes: where the input's place is not there. Its row
  of "Do and don't" goes. "Why what the user types is no message": the second reason (the screen may be older than the
  state) and the third (the view builds the message) go; the first stays. "Two limits": "A write over a value that
  came back is stored" goes, as every write is stored. "Inputs by id": the write loses `was`. "What is typed, in
  another form": the rule on `set`, as the owner decides (below).
- **"Guarantees".** "An input stores what is written over the value it holds" becomes "An input stores what is
  written, where its place is there" (the name the spike's doc comment gives). What a test checks of an input, at line
  141, likewise. "Outdated clicks are harmless" no longer covers a write; that no handler of a browser's event runs on
  an older view becomes each bridge's promise.
- **"Writing a bridge".** "Handlers": a bridge draws each notice before the browser handles the next event, as React
  renders a store, and a message its view sends whether or not it made a new state. The paragraph "The draw is at once
  because a handler writes over the value its model held" goes. Its regions: `notice` in place of `wait`.
- **"Testing"** and **"Testing tools"**: the writes of their examples lose `was`; the sentence "Each write is of a value
  other than `was`" changes. A user's test of a snabbdom view in a DOM awaits a microtask after an event, as one of
  React's awaits a render: "Testing" says so.
- **"Composition"** and **the glossary**: the shape of a write.
- **The skill and the doc comments** that name these sections, and the README if its quick start writes one.
- **The changelog**: the unreleased entry that introduced `Written` with `was` is edited, as no release has had it.

`docs/invariants.md` (lines 60 to 87: the rule of a write, its property, and why the bridge draws in each handler) is
rewritten for the new rule and the new bridge. `docs/premises.md` gains no premise: what the bridge rests on is the
HTML Standard's event loop, which the tests exercise in happy-dom and the probe in Chromium.

## What it reverses in `rejected.md`

- **R1** of `synchronous-dispatch.md`, the decision that kept `was`: its reason, a key typed between a notice and its
  draw, no longer holds once no such window is left.
- **"A value changed as the library stores it"**: its probe sent a second write before any frame, which is now stored.
  A `set` that changes the value is stored and shown at once; what remains against it is the caret, which goes to the
  end. The entry is weighed again with the rule on `set`.
- **The entry that ends "reopens if a write by `was` alone fails where a revision would not"** (the plain input and
  the frames): its last sentence describes `was` and the draw in each handler.
- **"A frame of the very same model taken at once"**: its last sentences describe the animation frame of the bridge.
- **"`write`, `isRejected` and `raise`"** quotes the literal with `was`: a wording.

"A write that `update` sees and may reject" stays rejected, as the review advised.

## What is left for the owner to decide

1. **Take it, or keep `was`.** Taken, `was` goes with the animation frame of the bridge to snabbdom, in one change.
2. **The cost of a fast subscription**: the run held back to one draw a task, as with React. If taken, "What is left to
   you" of "Guarantees" could say it, with what to do: a subscription that sends faster than the screen sends its
   messages by batches, as a `Stream` grouped within a time does.
3. **The rule on `set`.** Kept, with the reason the code keeps: the element's caret goes to the end after each key whose
   value `set` changes. Or dropped, which promises that such a `set` is shown at once, with a test of it, and says where
   the caret goes.

If taken, the stages for `ROADMAP.md`, in order:

1. **The rule, the bridges and the tests**: what the branch holds, but the probe page, rebased on `main`, with
   `docs/invariants.md`. Opus 5.5, `high`: an invariant and a bridge change.
2. **The guide, the doc comments, the skill and the changelog**, section by section as listed above, with
   `bun run comments` passing. Opus 5.5, `high`: the guide is a specification.
3. **`docs/rejected.md`**: the entries listed above, and R1 marked reversed in `synchronous-dispatch.md`. Sonnet 5.5,
   `medium`, from this record.

Then "The bridges in a real browser" (step 6 of the roadmap) loses its second case: nothing typed with snabbdom is
rejected for a draw that has not come.
