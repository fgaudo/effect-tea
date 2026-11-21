---
name: add-example
description: How to add or change an example of @fgaudo/effect-tea under examples/: the files one has, the snabbdom bridge and the helpers they share, how the examples are checked, tested and run in the browser, and their row in the README. Use when adding an example, changing one, or changing the bridge or the helpers the examples share.
---

# Add an example

The examples are complete programs, checked like the library, that show its concepts and its testing tools to
its users; the documentation site runs them in the browser. The ones to copy are
[`examples/counter`](../../../examples/counter) (one program, the cheapest tests, a view for each renderer) and
[`examples/pages`](../../../examples/pages) (a parent, children placed with optics and started from flags,
events, `forwardTo`).

## The folder

```
examples/<name>/
├─ <name>.ts        the program; a parent's children in a module each (pages/about.ts, pages/clock.ts)
├─ view.ts          its view, with snabbdom (view-snabbdom.ts and view-react.tsx in counter and form)
├─ main.ts          starts it in the browser
├─ index.html       the page that runs it
└─ <name>.test.ts   its tests, showing the testing tools on it
```

The bridges the examples share are entries of the package, `@fgaudo/effect-tea/snabbdom`,
`@fgaudo/effect-tea/snabbdom/testing` and `@fgaudo/effect-tea/react`, whose sources are in
[`bridges/`](../../../bridges), apart from the examples:

```
bridges/
├─ snabbdom.ts               the bridge the examples use: View, and drawInto for a program started
├─ snabbdom-testing.ts       messagesSentBy, how to check that a view draws what its model holds
├─ snabbdom-preload.ts       what bun test loads first (bunfig.toml), so that snabbdom loads without a DOM
├─ react.ts                  the bridge to React: View, Host, HostProps, Fork, and Draw for a program started apart
├─ snabbdom.test.ts          the snabbdom bridge's tests, in a DOM
├─ snabbdom-testing.test.ts  the tests of messagesSentBy, without a DOM
├─ react.test.ts             the React bridge's tests, React beside snabbdom over one run among them, in a DOM
└─ bridge.test_suite.ts      the tests every bridge passes
```

The first two and the fourth are what a user imports to draw and test a program with snabbdom, and to draw one with
React; the third is the line a user's tests of a snabbdom view load first, as the guide's "Testing" says (`AGENTS.md`,
"Tests"). React is used only by
[`counter`](../../../examples/counter) and [`form`](../../../examples/form), to show that a program does not change
with its renderer: each has a `view-snabbdom.ts` and a `view-react.tsx`, and its `main.ts` draws one run with both
renderers over the same handle, into the `#snabbdom` and `#react` of its page. Its test checks the snabbdom view; the
React view is checked by the bridges' tests. The bridges' tests are examples' tests like
the others, and none of the library's five kinds (`AGENTS.md`, "Tests"). `snabbdom.test.ts` and `react.test.ts` call
`bridge.test_suite.ts` with their renderer's `Bridge` (how it draws a program started, and the views of the
scenarios), beside the tests of that renderer alone.

In `examples/` itself are [`README.md`](../../../examples/README.md), which says where a user starts, and the shared
[`style.css`](../../../examples/style.css) and [`tsconfig.json`](../../../examples/tsconfig.json).

## The rules

- **An example is a consumer.** It imports the package by its name (`@fgaudo/effect-tea`,
  `@fgaudo/effect-tea/testing`, and the bridges' entries), never by a relative path. `tsc -p examples` checks it with the `bun` condition
  (the sources) and the `DOM` lib; Oxlint allows renderer imports there. Unstable APIs are not used there either:
  the typecheck refuses one, as in the library.
  The examples are published (`files` in `package.json`, all but their `tsconfig.json`), for the guide, the tutorial
  and the skill that link them, but nothing of the package imports them. snabbdom and React are optional peers, for
  the bridges alone, and `@happy-dom/global-registrator` is only a dev dependency.
- **`main.ts`** finds `#app`, starts the program with `const { app, run } = start(program)`, draws it
  with `drawInto(root, view)(app)`, and runs it with `Effect.runFork(run)`, through an `Effect.tapCause` that logs the
  failure of a dying program, unless it is only an interruption (`list/main.ts`). Those of `counter` and `form` draw
  the one handle with both renderers: snabbdom's `drawInto`, and `Draw` with that handle in a React root of its own.
- **`index.html`** has the title `<Name> · effect-tea`, the shared `../style.css`, a header with the name,
  one sentence on what it shows and a "Source" link to `https://github.com/fgaudo/effect-tea/tree/main/examples/<name>`,
  the `#app` element and `<script type="module" src="./main.ts">`.
- **The program** follows the guide: one state machine per concern, as a tagged union
  (`form/form.ts`'s `save`, `list/stopwatch.ts`'s `watch`), never flags; `reject` for a message that may
  arrive and does not apply, and a thrown error for one that cannot arrive (a completion outside the state that
  only it leaves, a tick while stopped), which the test checks as a defect.
- **The view** follows the guide, and is drawn with snabbdom: React is for `counter` and
  `form` alone, so that the examples share one bridge. snabbdom's props module never removes a prop, so a
  view sets a prop such as `disabled` in every case of an element (`counter/view-snabbdom.ts`). An input is declared in
  `make`, as the guide's "Inputs the user types into" says: the view draws a native controlled element with the value
  its model holds as its `value` (or `checked`) in `props`, gives it no key, and in its handler sends
  `{ _tag: 'Written', value }`, `value` what the element holds, through the dispatch of `forwardTo(dispatch, 'Name')`,
  with a call of its own: the bridges have no helper for a click or a key. What the bridges do not support (the guide's
  "Writing a bridge": a form's reset, a value written past React's setter, and a value the element changes by itself)
  is used by no example, nor what React's bridge adds beside the program. A control drawn by the program, a slider
  among them, has its press a message of the model and its drag a subscription (`volume`). A child's view is
  memoized with snabbdom's `thunk`, its dispatch from `forwardTo` among the arguments (`pages/view.ts`).
- **An example that needs more than the guide gives is a change of design**, and the owner is asked before it is
  written: a renderer other than the bridges' `drawInto` and `Draw`; a view that takes more than its model and its dispatch;
  something the screen shows that is kept outside the program's state (a variable of `main.ts`, a service the renderer
  reads, what a subscription or a command writes beside its messages); a new or changed rule of the guide that the
  example needs in order to be allowed. The first `bounce` did all four.
- **Messages live in the model** (the guide's "Model"): a view builds none, and a test reads them from the
  model with a reader of its own, `messagesOf(model)`, a case of the model at a time. A parent's reader calls
  its children's and wraps what they return as the parent receives it; a child's reader that two tests need
  lies in a module of its own (`timer/timer.test_reader.ts`).
- **A bridge owes no `messagesSentBy`.** The snabbdom bridge has one beside it, in
  `snabbdom-testing.ts`, as an example of how to check that a view draws what its model holds, with its
  own tests (`snabbdom-testing.test.ts`), and the test of each example drawn with snabbdom uses it:
  `messagesSentBy(view, model)` equals `messagesOf(model)`, so the reader lists the messages in the order the view
  draws them. It gives each listener an event whose `target` holds the `value` and the `checked` of its vnode's
  `props`, so a write is found with the value its model holds: the test of a view with an input
  expects those writes beside what the reader lists (`form/form.test.ts`, `stocktake/stocktake.test.ts`). A change to
  the two renderers' bridges is made to both where both draw the same: what the shared suite checks.
- **The test** shows the testing tools on the example, from the cheapest that proves the point: `applyAll` and
  `dispatchViolations` always (with the reader, for what the model holds, and the candidates that keep the
  reader complete), then `simulate`, `rehearse` or `drive` for what needs them. The candidates of tagged messages
  are a record with an entry for each tag, checked with `satisfies { [Tag in Message['_tag']]:
  ReadonlyArray<Extract<Message, { _tag: Tag }>> }` and flattened, a parent's from its children's
  (`pages/app.test.ts`): a tag no user sends has `[]`, and the comment says who sends it. A new check of this kind is
  seen to fail on a model that shows what `update` rejects, and on a reader that forgets a field. It runs
  without a DOM: `snabbdom-preload.ts` sets `window` to `undefined` so that snabbdom loads, and only the bridges'
  tests in a DOM register happy-dom. A check that needs a DOM (how often the bridge draws, a click on a drawn button,
  what is typed into a controlled element, its caret) goes into the bridges' tests: `bridge.test_suite.ts` when every
  bridge must pass it,
  the test of the bridge the example uses when it is about that renderer alone. An element is compared with `toBe`,
  never inside `toEqual`: a failing `toEqual` walks the properties React puts on an element it drew, its fibers and
  through them the program, and took 17 seconds over two buttons, and over a form grew past 6 GB and did not end.

## Run it

```sh
bun run build
```

```sh
bun examples/<name>/index.html
```

Bun bundles the page for the browser, where the package resolves to `dist/`: hence the build first.

## Register it

- A row in the README's "Examples" table: what it shows, naming the concepts and the testing tools its test
  uses, and the live link `https://fgaudo.github.io/effect-tea/examples/<name>/`, which works after the next
  release ([`release`](../release/SKILL.md)).
- Nothing to add to the site: `site/build.ts` bundles every `examples/*/index.html`.

[`examples/timer`](../../../examples/timer) is the tutorial's application, one module per step, and two for the
step of inputs (`named.ts`, a timer with a name, and `named-timers.ts`, the list of the step before with named timers,
which `main.ts` runs), so that every step's code stays as its page shows it: its `// #region` comments are the blocks
the pages of [`site/tutorial`](../../../site/tutorial) include. So are those of
the bridge [`bridges/snabbdom.ts`](../../../bridges/snabbdom.ts), which the last page reads. A change
to either keeps them, and the pages' prose, true, and the site build shows the pages as they will be read
([`release`](../release/SKILL.md)).
