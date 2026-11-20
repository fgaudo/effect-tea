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
is, why, how it would be done, and what "done" is. Items 1 and 3 wait for a decision of the owner; item 2
needs none.

### 1. The bridges as packages of their own

**Why.** `@fgaudo/effect-tea-snabbdom` and `@fgaudo/effect-tea-react`: the library stays free of renderers, and users
stop copying `bridges/snabbdom.ts` and `bridges/react.ts`. A fix of a bridge, as those of 16 and 19 November 2026,
does not reach a copy, and what a screen shows of an input is promised through code that no version names. The caret
and an IME composition were never run in a real browser.

**The proposal.** The contract stays as narrow as it is today (a frame drawn whole and at once, a native text field,
and the list of the guide's "What is left out"): the packages add no feature of a renderer.
[`docs/rejected.md`](docs/rejected.md), "The bridges", says what the owner declined on 16 November 2026, and reopens
on this.

**A simpler form than packages apart**, weighed on 20 November 2026, reasoned, not decided: entries of this package,
`@fgaudo/effect-tea/snabbdom` and `@fgaudo/effect-tea/react`, as `./testing` is one, with each renderer an optional
peer (`peerDependenciesMeta`). No workspace: one version and one release, and a bridge is always checked with the
library it is published with, which matters while the rule a bridge calls still changes. The package ships `bridges/`
as sources already, with a `tsconfig.json` of their own. It changes a rule of `AGENTS.md` ("`effect` (v4) is its only
dependency, as a peer"), which would hold of the root entry and of `./testing`, kept by the lint that forbids `src/`
a renderer's import; and a bridge that breaks raises the version of the whole package. Packages apart, in a
workspace, are for a bridge that needs releases of its own: an entry moves to one later by a breaking change that
only renames an import.

**How.** The element as data of `src/interleaving.test.ts` is the bridges' contract in a form a test holds.

1. The owner decides: whether, entries of this package or packages apart, the names, and what each promises.
2. The bridges move to packages with `@fgaudo/effect-tea` and their renderer as peers, each with its tests; the
   examples and `tools/smoke/` import them.
3. The tests of `bridges/bridge.test_suite.ts` run in a real browser too, with the caret and an IME composition when
   the program changes a value under the user.
4. The guide's "Writing a bridge" stays, for a renderer the packages do not cover; `release` learns of the packages.

**A wider form**, weighed with the owner on 20 November 2026, on the question whether the library should draw too;
reasoned, not decided. The package is no bridge to snabbdom but the view's own vocabulary, as data, over snabbdom's
`patch`:

- a node's handler holds a message, not a function, so a walk of the tree finds every message a view can send, with
  any test and no DOM, as `messagesSentBy` does today for snabbdom alone;
- a child's view is lifted by a node that wraps its messages, as Elm's `Html.map`, so a view is `(model) => Node` and
  takes no dispatch, and its views need no dispatch that stays the same function (`forwardTo`'s cache);
- a node of an input names its input, and the renderer keeps its element by `edited` and `drawn`: no user writes or
  copies that part.

It costs a second product to keep, with the DOM's own cases, and "views are generic over their node type"
(`AGENTS.md`) stays true only of the library, with the package apart. Foldkit, another Elm architecture over Effect,
draws this way over snabbdom ("What the library is beside Foldkit", below): this form would build again what it has.
Weighed with it and not proposed: a `patch` of the library's own, whose cases of the DOM are not what the
library is for, while snabbdom is small enough to keep a copy of; and another renderer under the bridges, where
lit-html's `render` is the one that fits beside snabbdom (drawn at once, no component), but its templates are no tree
a test can walk.

**The bridge to React, hosted by React: done**, 20 November 2026
([`docs/records/hosted-react.md`](docs/records/hosted-react.md), "Decided"). `bridges/react.ts` is the hosted bridge:
`Host` takes `program`, its options and `fork`, and `Frames` with `makeStore` draws a run the application starts
itself, as `together` does in `counter` and `form`. The guide's "View" says what each bridge draws beside the frames,
and "What is left to you" how long a run of `Host` lives and where its defect goes. The yield before the first frame,
the dropped frames of a closed renderer and the forgotten frame each have a test, and every check of the bridge a
mutation of `tools/mutations/mutations.ts`. The contract of the proposal above is the snabbdom bridge's; the React
bridge's is its own, in "View".

What is left:

- **The premises of the bridge on React**: done the same day, with the owner's consent. The premise of `flushSync`
  covers the layout effects of a commit, and those of `onUncaughtError` and `root.unmount()` went with the root the
  bridge no longer owns.
- **Not run**: a real browser, an IME composition, the caret when the program changes a value, `startTransition` or
  `useDeferredValue` in the application, Fast Refresh (likely to restart the run, as `<Activity>` does), server
  rendering and hydration.
- **Left out, as the guide's "What is left out" says**: a form's reset, a value the element changes by itself, and an
  input drawn under one run's `Host` with the dispatch of another.

**Done when** the packages are published with the library, or the entry of `docs/rejected.md` says why not.

### 2. A benchmark that runs in the CI

Many children, many messages per second, to keep "frames cost only what is drawn" from regressing. `bun run bench`
(`tools/bench/subscriptions.ts`) measures a parent's subscriptions only, and `tools/bench/writes.ts`, run by hand,
what a write into an input and a bridge's frame cost; neither runs in the CI. To be designed: what is measured, and
against what it fails, since a CI machine's times vary.

### 3. What the search of an input's element leaves without a killer

Left by the session that put the element of an input under the search, 20 November 2026 (run):

- The property "once everything has happened, the element shows what the last state holds for the input drawn in it"
  is the killer of no mutation of the acknowledgement or of `seen`: under them it fails on 15 to 60 of a hundred runs
  of 60 scenarios, not on each. About 1,500 scenarios would make it one, by the rate measured, for a few seconds more
  of `bun run interleavings`. To decide: whether that is worth it, the deterministic tests being their killers.
- "a frame that has seen the last write leaves the element as if it had not" is killed by none of the three
  properties of the search: it needs a frame whose `seen` is the number of the last write after a rejection, and
  nothing after. The deterministic tests are its killers. To decide: whether the scenario is made to reach it.

## Ideas, to be decided

- **What the library is beside Foldkit**, to be decided by the owner before item 1 and before 1.0. Foldkit
  (`github.com/foldkit/foldkit`, MIT, Effect `~4.1.0`, 0.171.0 on 20 November 2026) is a whole framework on the same
  ground: a runtime, views over snabbdom, routing, server rendering, a library of components, devtools and a CLI. Read
  in its code that day, by a subagent, in part (the files of its runtime, of its commands and of its views; no test's
  content): a click's node holds its message as data, and a text's a function from the text to a message; `update`
  runs on the stack of the dispatch, the frame reads the latest model and drains what is queued before it patches, and
  an input's value is written only where it differs from the element's, so it has no rule of a write and no `seen`; no
  rejection of a message was found, no page of guarantees, and neither fast-check nor a list of mutations among its
  dependencies; a command is cancelled by a key, on request. No statement that Effect adopts it was found, in the
  pages read, which were none of Effect's own. What this library has that was not found there: guarantees written as a
  specification and searched under random histories, `reject` with the tools that hold a model to it, a loop that
  takes one message at a time with its releases, the rule of an input, and no renderer of its own. Reasoned from
  there: not to follow it in breadth; whether the library says so, and names whom it is for, is the owner's.

  **Decided by the owner, 20 November 2026: the library is meant to be adopted by others**, not only to be the owner's
  own tool. What follows from it, by the same review, reasoned:
  - Item 1 is no longer a choice: nobody adopts code to copy.
  - The changes that break the API are taken first (what `docs/rejected.md` parks), then 1.0: a user asks
    that the API stays.
  - The README says what the library is and for whom, and names Foldkit.
  - **Open, and first: for whom.** Two readers were named. One starts a new application, and chooses between this
    library and Foldkit, which gives far more. The other has an application already, most often in React, where
    Foldkit's own page advises against a rewrite: this library has no renderer, so it can be the state of a part of
    such an application. That reader needs a bridge to React that works with what React does (components with state,
    `memo`, Suspense), which the owner declined on 16 November 2026, and the rule "the renderer draws frames, and
    nothing else" of the guide's "View" would change. Neither was weighed further.
  - **The owner, the same day: both readers.** Reasoned from there, not decided. They are two bridges, not three: a
    view of the library's own over snabbdom ("A wider form", item 1) takes the place of the snabbdom bridge. The one
    for React is hosted by React: a component uses a program through a hook, and the `render` given to `run` only
    hands the frames to a store that React reads, so the engine would not change; the rules of the guide's "View"
    that every renderer keeps today (no state beside the program's, frames and nothing else, a frame whole and at
    once) would become what each bridge promises. An input in it is spiked anew, against the four gaps of 16 November
    2026. The order proposed: the element of an input under the search, done since; a spike of the hosted React
    bridge, begun the same day on the branch `spike-hosted-react`, never to be merged; the breaking changes and 1.0;
    then the view of the library's own, the largest and the nearest to what Foldkit has.
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
