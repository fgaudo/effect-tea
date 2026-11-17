---
title: Tutorial
children:
  - ./1-first-program.md
  - ./2-commands-and-subscriptions.md
  - ./3-children.md
  - ./4-inputs.md
  - ./5-testing.md
---

# Tutorial

You will build one small application, a list of kitchen timers, in five short steps.
[Try the finished one](https://fgaudo.github.io/effect-tea/examples/timer/) first: add a timer, give it a name, set it
to one minute, start it, and wait for the bell.

Each step is a program of the example
[`examples/timer`](https://github.com/fgaudo/effect-tea/tree/main/examples/timer). Every block of code on these pages
is taken from its files, which are typechecked and tested with the library: what you read is what runs.

The tutorial shows how the pieces fit, and why. The [Guide](../guide/index.md) is the specification, and each page
here links to the rules it uses there.

1. [A first program](./1-first-program.md): how long a timer lasts, set with "+" and "−". State, `update`,
   `reject`, the model, a view, `run`.
2. [Commands and subscriptions](./2-commands-and-subscriptions.md): the timer itself, which ticks while it runs
   and rings a bell when it finishes.
3. [Children](./3-children.md): many timers, each the program of step 2 as it is, under a parent.
4. [Inputs](./4-inputs.md): a name for each timer, typed by the user, which the library stores.
5. [Testing](./5-testing.md): `update`, the model, an input and a scenario, tested without a runtime.

## Before you start

You need TypeScript and the basics of [Effect](https://effect.website) v4: an `Effect`, `pipe`, `Data.TaggedEnum`
and a service. Nothing of the Elm architecture is assumed.

To read the code beside the pages and run it, clone the
[repository](https://github.com/fgaudo/effect-tea), then install, build, and open the finished application:

```sh
bun install
```

```sh
bun run build
```

```sh
bun examples/timer/index.html
```

Its tests, which the last step reads, run with:

```sh
bun test examples/timer
```

To write a program of your own instead, install the library with its peer dependency:

```sh
bun add @fgaudo/effect-tea effect
```

The library draws nothing: a view is a function of its model, and a small bridge draws it with a renderer. The tutorial
draws with [snabbdom](https://github.com/snabbdom/snabbdom), which you need not know: its views are a few lines each.
They go through the examples' bridge,
[`examples/snabbdom.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/snabbdom.ts), which you can copy:
`renderInto` draws each frame, `onClick` sends a message from a click, and `shows` draws an input.
[Writing a bridge](../guide/writing-a-bridge.md) reads it, and names what a bridge to React does instead.
