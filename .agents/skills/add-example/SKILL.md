---
name: add-example
description: How to add or change an example of @fgaudo/effect-tea under examples/: the files one has, the snabbdom bridge and the field helper they share, how the examples are checked, tested and run in the browser, and their row in the README. Use when adding an example, changing one, or changing the bridge or the helpers the examples share.
---

# Add an example

The examples are complete programs, checked like the library, that show its concepts and its testing tools to
its users; the documentation site runs them in the browser. The ones to copy are
[`examples/counter`](../../../examples/counter) (one program, one view, the cheapest tests) and
[`examples/pages`](../../../examples/pages) (a parent, children placed with optics and started from flags,
events, `dispatchTo`).

## The folder

```
examples/<name>/
├─ <name>.ts        the program; a parent's children in a module each (pages/about.ts, pages/clock.ts)
├─ view.ts          its view, with snabbdom
├─ main.ts          starts it in the browser
├─ index.html       the page that runs it
└─ <name>.test.ts   its tests, showing the testing tools on it
```

What the examples share, in `examples/`: [`snabbdom.ts`](../../../examples/snabbdom.ts), the bridge to the
renderer (`renderInto` for `run`, `onClick`, `onInput`, `initialValue`, and `messagesSentBy` for tests);
[`field.ts`](../../../examples/field.ts), a text the user types into and the program may replace;
[`style.css`](../../../examples/style.css); [`preload.ts`](../../../examples/preload.ts), which `bun test`
loads first (`bunfig.toml`); [`snabbdom.test.ts`](../../../examples/snabbdom.test.ts), the bridge's own test;
and [`tsconfig.json`](../../../examples/tsconfig.json).

## The rules

- **An example is a consumer.** It imports the package by its name (`@fgaudo/effect-tea`,
  `@fgaudo/effect-tea/testing`), never by a relative path. `tsc -p examples` checks it with the `bun` condition
  (the sources) and the `DOM` lib; Biome allows renderer imports there, and the Effect language service allows
  unstable APIs there (`unstableApiUsage` is off in `examples/tsconfig.json`: `BrowserRuntime.runMain` is one).
  The examples are not published (`files` in `package.json`), and snabbdom, `@effect/platform-browser` and
  `@happy-dom/global-registrator` are only dev dependencies.
- **`main.ts`** finds `#app` and starts the program with `BrowserRuntime.runMain(run(program, renderInto(root,
  view)))`, so that the failure of a dying program is reported.
- **`index.html`** has the title `<Name> · effect-tea`, the shared `../style.css`, a header with the name,
  one sentence on what it shows and a "Source" link to `https://github.com/fgaudo/effect-tea/tree/main/examples/<name>`,
  the `#app` element and `<script type="module" src="./main.ts">`.
- **The view** follows the README's "Guide". snabbdom's props module never removes a prop, so a view sets a
  prop such as `disabled` in every case of an element (`counter/view.ts`). An input follows "Inputs the user
  types into": `update` accepts typing in every state the input exists in, and the view writes a text only
  into a new input (`initialValue`, with a `Field`'s `revision` as the input's `key`). A child's view is
  memoized with snabbdom's `thunk`, its dispatch from `dispatchTo` among the arguments (`pages/view.ts`).
- **The test** shows the testing tools on the example, from the cheapest that proves the point: `applyAll` and
  `dispatchViolations` always (with `messagesSentBy(view, model)`, which renders the view and fires every
  handler, for what the view sends), then `simulate`, `rehearse` or `drive` for what needs them. It runs
  without a DOM: `preload.ts` sets `window` to `undefined` so that snabbdom loads, and only `snabbdom.test.ts`
  registers happy-dom. A check that needs a DOM (how often the bridge draws, a click on a drawn button, typing
  while frames are drawn) goes into `snabbdom.test.ts`.

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
