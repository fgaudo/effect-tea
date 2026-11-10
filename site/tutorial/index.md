---
title: Tutorial
children:
  - ./1-first-program.md
  - ./2-commands-and-subscriptions.md
  - ./3-children.md
  - ./4-testing.md
---

# Tutorial

This tutorial builds one application, a list of timers, in four short steps. Each step is a program of the
example [`examples/timer`](https://github.com/fgaudo/effect-tea/tree/main/examples/timer), and every block of code
on these pages is taken from its files, which are typechecked and tested with the library. The finished
application runs [in the browser](https://fgaudo.github.io/effect-tea/examples/timer/).

The tutorial shows how the pieces fit; the [Guide](https://fgaudo.github.io/effect-tea/#guide) is the
specification, and each page links to the rules it uses there.

1. [A first program](./1-first-program.md): how long a timer lasts, set with "+" and "−". State, `update`,
   `reject`, the model, a view, `run`.
2. [Commands and subscriptions](./2-commands-and-subscriptions.md): the timer itself, which ticks while it runs
   and rings a bell when it finishes.
3. [Children](./3-children.md): many timers, each the program of step 2 as it is, under a parent.
4. [Testing](./4-testing.md): `update`, the view and a scenario, tested without a runtime.

## Before you start

You need TypeScript and the basics of [Effect](https://effect.website) v4: an `Effect`, `pipe`, `Data.TaggedEnum`
and a service. Install the library with its peer dependency:

```sh
bun add @fgaudo/effect-tea effect
```

The library draws nothing: a view is a function of its model, and a small bridge draws it with a renderer. The
tutorial draws with [snabbdom](https://github.com/snabbdom/snabbdom), through the examples' bridge,
[`examples/snabbdom.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/snabbdom.ts), which you can copy:
`renderInto` draws each frame, `onClick` sends a message from a click, and `messagesSentBy` finds, in a test, what
a view sends.
