---
title: Children
---

# Children

A kitchen needs more than one timer. You will build a list of timers: "Add a timer" adds one, and "Remove" takes one
away. You will learn how a parent declares its children, and what the library then does for the parent.

Here is the good news: the timer of step 2 does not change at all. Any program can be a child as it is. On this page
you write only the parent, the list.

The code is [`examples/timer/timers.ts`](../../examples/timer/timers.ts).

## The parent's state

The parent's own state is the ids of its timers, in their order, and the next id to give. It does not keep the
timers' states: the library keeps them. Adding and removing are the parent's own messages:

{@includeCode ../../examples/timer/timers.ts#state}

Ids are never reused, so that a removed timer's id never goes to another timer. Otherwise a click on a view drawn for
the old timer could reach the new one (see [children by id](../guide/composition.md#children-by-id)).

## Declaring the children

A parent does not route messages by hand. It declares its children, and the library does the routing (see
[composition](../guide/composition.md)).

`program<{ … }>()` gives the functions that declare children. `childById` declares children by id, and asks two
things:

- which program they are: `Timer.timer`;
- which of them are there: `ids`, a function of the parent's own state.

`withChildren` takes the children by name, and gives the `make` of the parent:

{@includeCode ../../examples/timer/timers.ts#compose}

What the parent gets from the declaration:

- **Its children, kept:** a timer whose id the state lists anew is started, from its `init`, with its first commands.
  A timer whose id the state no longer lists is dropped. The parent's `init` is a step of its own state, and the
  library starts the timer it lists.
- **Its messages:** its own, plus `{ _tag: 'Timer', id, message }` for each timer's. `MessageOf` names them.
- **Its commands:** each timer's, as `{ _tag: 'Timer', id, instance, command }`, run by the timer's `runCommand`. The
  `instance` names the start of the timer that asked (see
  [what the library derives](../guide/composition.md#what-the-library-derives)).
- **Its subscriptions:** each running timer's `'ticks'`, under `['Timer', id, instance, 'ticks']`.
- **Its children's models:** `children.Timer(id)` in `makeModel`. It is the same object while the timer's state is
  the same object.

A timer that is not there takes no message. So a click on a removed timer, from a model drawn before, is rejected: the
rule of step 1, with nothing more to write.

Notice what the parent does not do: it is given no timer's state. It only adds and removes (see
[splitting a program](../guide/structuring-a-program.md#splitting-a-program)).

## The view

Each timer is drawn by `timerView`, the view of step 2, with a dispatch of its own. `forwardTo` makes that dispatch:
it wraps the timer's messages as the parent receives them.

That dispatch is the same function in every draw. So snabbdom's `thunk` draws again only the timer whose model
changed, and ten timers ticking do not redraw each other (see
[children's views](../guide/composition.md#childrens-views)):

{@includeCode ../../examples/timer/view.ts#timers}

## What you have

A list of independent timers, each ticking only while it runs, and a parent of some fifty lines that knows nothing of
phases, ticks or bells.

Next, [a name for each timer](./4-inputs.md).
