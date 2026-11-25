---
name: add-example
description: How to add or change an example of @fgaudo/effect-tea under examples/: the files one has, the snabbdom bridge and the helpers they share, how the examples are checked, tested and run in the browser, and their row in the README. Use when adding an example, changing one, or changing the bridge or the helpers the examples share.
---

# Add an example

The examples are complete programs, checked like the library, that show its concepts and its testing tools; the site
runs them in the browser. The ones to copy are [`examples/counter`](../../../examples/counter) (one program, the
cheapest tests, a view for each renderer) and [`examples/pages`](../../../examples/pages) (a parent, children there
by its state and started from flags, events, `forwardTo`).

## The folder

```
examples/<name>/
├─ <name>.ts        the program; a parent's children in a module each (pages/about.ts, pages/clock.ts)
├─ view.ts          its view, with snabbdom (view-snabbdom.ts and view-react.tsx in counter and form)
├─ main.ts          starts it in the browser (main.tsx in counter and form)
├─ index.html       the page that runs it
└─ <name>.test.ts   its tests, showing the testing tools on it
```

The bridges are entries of the package, in [`bridges/`](../../../bridges):

```
bridges/
├─ snabbdom.ts               View, and drawInto for a program started
├─ snabbdom-testing.ts       messagesSentBy, to check that a view draws what its model holds
├─ snabbdom-preload.ts       what bun test loads first (bunfig.toml), so that snabbdom loads without a DOM
├─ react.ts                  View, Host, HostProps, Fork, and Draw for a program started apart
├─ snabbdom.test.ts          the snabbdom bridge's tests, in a DOM
├─ snabbdom-testing.test.ts  the tests of messagesSentBy, without a DOM
├─ react.test.ts             the React bridge's tests, beside snabbdom over one run, in a DOM
├─ browser.test.ts           what only a real browser shows: bun run test:browsers alone
└─ bridge.test_suite.ts      the tests every bridge passes, given each renderer's Bridge
```

What a bridge gives a user's tests (`snabbdom-testing.ts`, `snabbdom-preload.ts`) is code of the bridge, not a file of
the repository's tests. React is used only by [`counter`](../../../examples/counter) and
[`form`](../../../examples/form), to show that a program does not change with its renderer: each has a
`view-snabbdom.ts` and a `view-react.tsx`, and its `main.tsx` draws one run with both, into the `#snabbdom` and
`#react` of its page. Its test checks the snabbdom view; the React view is checked by the bridges' tests. Only the
bridges' tests in a DOM register one (happy-dom), and they run in Chromium, Firefox and WebKit too
(`bun run test:browsers`).

In `examples/` itself are [`README.md`](../../../examples/README.md), and the shared
[`style.css`](../../../examples/style.css) and [`tsconfig.json`](../../../examples/tsconfig.json).

## The rules

- **An example is a consumer.** It imports the package by its name, never by a relative path. `tsc -p examples` checks
  it with the `bun` condition and the `DOM` lib. The examples are published, for the documents that link them, but
  nothing of the package imports them; snabbdom and React are optional peers, for the bridges alone.
- **`main.ts`** finds `#app`, starts the program with `const { app, run } = start(program)`, draws it with
  `drawInto(root, { app, view })`, and runs it with `Effect.runFork(run)`, through an `Effect.tapCause` that logs the
  failure of a dying program, unless it is only an interruption (`list/main.ts`). Those of `counter` and `form` are
  `main.tsx`, and draw the handle with `drawInto` and with `<Draw app={app} view={view} />` in a React root.
- **`index.html`** has the title `<Name> · effect-tea`, the shared `../style.css`, a header with the name, one sentence
  on what it shows and a "Source" link to `https://github.com/fgaudo/effect-tea/tree/main/examples/<name>`, the `#app`
  element and `<script type="module" src="./main.ts">` (`./main.tsx` in `counter` and `form`).
- **The program** follows the guide: one state machine per concern, as a tagged union, never flags; `reject` for a
  message that may arrive and does not apply, and a thrown error for one that cannot arrive, which the test checks as
  a defect.
- **The view** follows the guide, drawn with snabbdom (React for `counter` and `form` alone). snabbdom's props module
  never removes a prop, so a view sets a prop such as `disabled` in every case (`counter/view-snabbdom.ts`). A value
  that an element holds is drawn as the guide's "What an element gives" says: a native controlled element with the
  value its model holds in `props`, no key, and a handler that sends the message that its model holds for it, filled
  with what the element holds.
  What the bridges leave out ("Writing a bridge", "What is left out") is used by no example. A control drawn by the
  program, as a slider, has its press a message of the model, and its drag a subscription (`volume`). A child's view is
  memoized with snabbdom's `thunk`, its dispatch among the arguments (`pages/view.ts`).
- **An example that needs more than the guide gives is a change of design**, decided first ("Deciding" in
  `AGENTS.md`): a renderer other than `drawInto` and `Draw`; a view that takes more than its model and its dispatch;
  something on screen kept outside the program's state; a rule of the guide the example needs in order to be allowed.
- **Messages live in the model**: a test reads them with a reader of its own, `messagesOf(model)`. A parent's reader
  calls its children's and wraps what they return; a child's reader that two tests need lies in a module of its own
  (`timer/timer.test_reader.ts`).
- **A bridge owes no `messagesSentBy`.** The snabbdom bridge has one, and each example drawn with snabbdom checks that
  `messagesSentBy(view, model)` equals `messagesOf(model)`, so the reader lists the messages in the order the view
  draws them, each held message filled with the value its model holds (`form/form.test.ts`). A change of what both
  bridges draw is made to both: the shared suite checks it.
- **The test** shows the testing tools, from the cheapest that proves the point: `applyAll` and `dispatchViolations`
  always, then `simulate`, `rehearse` or `drive`. The candidates of tagged messages are a record with an entry for each
  tag, checked with `satisfies { [Tag in Message['_tag']]: ReadonlyArray<Extract<Message, { _tag: Tag }>> }` and
  flattened, a parent's from its children's (`pages/app.test.ts`): a tag no user sends has `[]`, and a comment says who
  sends it. A new check of this kind is seen to fail on a model that shows what `update` rejects, and on a reader that
  forgets a field. A check that needs a DOM goes into the bridges' tests: `bridge.test_suite.ts` for every bridge, the
  bridge's own test for one renderer, `browser.test.ts` for what only a real browser shows. An element is compared with
  `toBe`, never inside `toEqual`, which walks what React puts on an element, and the program through it.

## Run it

```sh
bun run build
bun examples/<name>/index.html
```

Bun bundles the page, where the package resolves to `dist/`: hence the build first.

## Register it

- A row in the README's "Examples" table: what it shows, naming the concepts and the testing tools its test uses, and
  the live link `https://fgaudo.github.io/effect-tea/examples/<name>/`, which works after the next release.
- Nothing to add to the site: `site/build.ts` bundles every `examples/*/index.html`.

[`examples/timer`](../../../examples/timer) is the tutorial's application, one module per step (and `named.ts` and
`named-timers.ts` for its fourth step, "What the user types"), so that each step's code stays as its page shows it;
its `// #region` comments are the blocks the tutorial includes, as are those of
[`bridges/snabbdom.ts`](../../../bridges/snabbdom.ts). A change to either keeps them, and the pages' prose, true
([`release`](../release/SKILL.md)).
