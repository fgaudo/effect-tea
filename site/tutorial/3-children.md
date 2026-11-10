---
title: Children
---

# Children

The application shows a list of timers: "Add a timer" adds one, and "Remove" takes one away. Each timer is the
program of step 2, unchanged: any program can be a child as it is. Its code is
[`examples/timer/timers.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/timer/timers.ts).

## The parent's state

The parent keeps each timer's state with its id, and the next id to give. Ids are never reused, so that a
removed timer's id never comes back to another one (see
[children by id](https://fgaudo.github.io/effect-tea/#children-by-id)). Adding and removing are the parent's own
messages:

{@includeCode ../../examples/timer/timers.ts#state}

## Declaring the children

`parent<{ state }>()` gives the functions that declare children. `each` declares children by id: where each one
lives in the parent's state (`get` and `set`, by id), and which of them may listen (`subscribed`). The library does
the routing (see [composition](https://fgaudo.github.io/effect-tea/#composition)):

{@includeCode ../../examples/timer/timers.ts#compose}

What the parent gets from the declaration:

- **Starting a child:** `children.Timer.init(id)` is a timer's first step, its state and its commands; the
  parent's own `init` is a function of `children` for this.
- **Its messages:** its own, plus `{ _tag: 'Timer', id, message }` for each timer's. `MessageOf` names them.
- **Its commands:** each timer's, as `{ _tag: 'Timer', id, command }`, run by the timer's `runCommand`.
- **Its subscriptions:** each running timer's `'ticks'`, under `['Timer', id, 'ticks']`.
- **Its children's models:** `children.Timer(state, id)` in `makeModel`, the same object while the timer's state
  is.

A timer that is not there is `None` in `get`, so a click on a removed timer, from a frame drawn before, is
rejected. A parent never reads a child's state to decide: the parent here only adds and removes (see
[splitting a program](https://fgaudo.github.io/effect-tea/#splitting-a-program)).

## The view

Each timer is drawn by `timerView` with a dispatch of its own, from `dispatchTo`, which wraps the timer's messages
as the parent receives them. It is the same function in every frame, so snabbdom's `thunk` draws again only the
timer whose model changed (see [children's views](https://fgaudo.github.io/effect-tea/#childrens-views)):

{@includeCode ../../examples/timer/view.ts#timers}

## Running it

[`examples/timer/main.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/timer/main.ts) runs the list
in the page, with a bell that beeps. The services of every command are provided around `run`:

{@includeCode ../../examples/timer/main.ts#bell}

Next, [testing it](./4-testing.md).
