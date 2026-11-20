# Examples

Complete programs of `@fgaudo/effect-tea`, each with its tests. Read one to see how a program is written and tested,
run one in your browser, and draw your own with the package's bridges. The [README](../README.md#examples) lists what each
example shows, with a link to try it in the browser.

## Where to start

- [`counter/`](counter): one program and the cheapest tests. Read it first. Its run is drawn twice, by snabbdom and by
  React, over the same `App`. A program with one renderer gives `run` that renderer alone, as [`timer/`](timer) does.
- [`pages/`](pages): a parent and its children, placed with optics, started from flags, and talking through events.
- [`timer/`](timer): the application of the [tutorial](../site/tutorial/index.md), one module for each step.

## What an example holds

```
counter/
├─ counter.ts        the program
├─ view-snabbdom.ts  its view, drawn with snabbdom
├─ view-react.tsx    the same view, drawn with React
├─ main.ts           starts it in the browser
├─ index.html        the page that runs it
└─ counter.test.ts   its tests, with the testing tools of @fgaudo/effect-tea/testing
```

A parent has a module for each child too (`pages/about.ts`, `pages/clock.ts`). Only `counter/` and `form/` have a view
for each renderer. Their `main.ts` draws one run with both renderers: the program and its tests do not change with the
renderer. Both examples give `run` one renderer that runs the two together, each over the `App` of the run, React's
through `Draw`. The other examples are drawn with snabbdom alone, by a `view.ts`.

## The bridges

The library draws nothing. A view is drawn through a bridge, an entry of the package, with its renderer installed
beside it (`snabbdom`, or `react` and `react-dom`). The bridges' sources are in [`bridges/`](../bridges):

| Import                                | Source                                                  | What it is                                                            | You need it to                              |
| ------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------- |
| `@fgaudo/effect-tea/snabbdom`         | [`snabbdom.ts`](../bridges/snabbdom.ts)                 | The bridge to snabbdom: `View` and `renderInto`.                      | draw a program with snabbdom                |
| `@fgaudo/effect-tea/snabbdom/testing` | [`snabbdom-testing.ts`](../bridges/snabbdom-testing.ts) | `messagesSentBy`: what a view sends for a model, found without a DOM. | test that a view draws what its model holds |
| `@fgaudo/effect-tea/react`            | [`react.ts`](../bridges/react.ts)                       | The bridge to React: `View`, `Host` and `Draw`.                       | draw a program in a React application       |

[`snabbdom-preload.ts`](../bridges/snabbdom-preload.ts) is what Bun loads before the tests of this repository, so that
snabbdom loads without a DOM: a test of a snabbdom view without a DOM needs the same line.

The other files of `bridges/` serve this repository. `snabbdom.test.ts` and `react.test.ts` test each bridge in a DOM.
`bridge.test_suite.ts` holds the tests that every bridge passes. Read them when you write a bridge of your own, with the
guide's ["Writing a bridge"](../site/guide/writing-a-bridge.md). How the examples' tests use `messagesSentBy` is in the
guide's ["Testing"](../site/guide/testing.md).

## Run one

The page imports the package by its name, and the browser takes the package from `dist/`. So build it first:

```sh
bun run build
```

```sh
bun examples/counter/index.html
```

```sh
bun test examples/counter
```
