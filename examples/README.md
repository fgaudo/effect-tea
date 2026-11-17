# Examples

Complete programs of `@fgaudo/effect-tea`, each with its tests. The [README](../README.md#examples) lists what each one
shows, with a link to try it in the browser.

## Where to start

- [`counter/`](counter): one program and the cheapest tests. Read it first. Its run is drawn twice, by snabbdom and by
  React, through `together`: a program with one renderer gives `run` that renderer alone, as
  [`timer/`](timer) does.
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
for each renderer, and their `main.ts` draws one run with both: the program and its tests do not change with the
renderer. Both give `run` the two renderers through [`together.ts`](together.ts), which makes one renderer of two. The
other examples are drawn with snabbdom alone, by a `view.ts`.

## The bridges

The library ships no renderer. A view is drawn through a bridge, a small file that you copy into your project and own.
The bridges are in [`bridges/`](bridges):

| File                                                   | What it is                                                                  | You need it to                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------- |
| [`snabbdom.ts`](bridges/snabbdom.ts)                   | The bridge to snabbdom: `renderInto`, `onClick`, `onPress` and `shows`.     | draw a program with snabbdom                  |
| [`snabbdom-testing.ts`](bridges/snabbdom-testing.ts)   | `messagesSentBy`: what a view sends for a model, found without a DOM.       | test that a view draws what its model holds   |
| [`snabbdom-preload.ts`](bridges/snabbdom-preload.ts)   | Loaded before the tests, so that snabbdom loads without a DOM.              | test a snabbdom view without a DOM            |
| [`react.ts`](bridges/react.ts)                         | The same bridge for React: `renderInto`, `onClick`, `onPress` and `Shows`.  | draw a program with React                     |

The other files of `bridges/` serve this repository. `snabbdom.test.ts` and `react.test.ts` test each bridge in a DOM.
`bridge.test_suite.ts` holds the tests that every bridge passes. Read them when you write a bridge of your own, with the
guide's ["Writing a bridge"](../site/guide/writing-a-bridge.md). How the examples' tests use `messagesSentBy` is in its
["Testing"](../site/guide/testing.md).

## Run one

The page imports the package by its name, which the browser takes from `dist/`, so build it first:

```sh
bun run build
```

```sh
bun examples/counter/index.html
```

```sh
bun test examples/counter
```
