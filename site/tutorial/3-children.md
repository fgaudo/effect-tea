---
title: Children
---

# Children

One timer is not much of a kitchen. The application shows a list of them: "Add a timer" adds one, and "Remove" takes
one away.

Here is the good news: the timer of step 2 does not change by a line. Any program can be a child as it is. What you
write on this page is only the parent, the list.

The code is [`examples/timer/timers.ts`](../../examples/timer/timers.ts).

## The parent's state

The parent keeps each timer's state with its id, and the next id to give. Adding and removing are the parent's own
messages:

{@includeCode ../../examples/timer/timers.ts#state}

Ids are never reused, so that a removed timer's id never comes back to another one. Otherwise a message meant for the
old timer could reach the new one (see [children by id](../guide/composition.md#children-by-id)).

## Declaring the children

A parent does not route messages by hand. It declares its children, and the library does the routing (see
[composition](../guide/composition.md)).

`composition<{ state }>()` gives the functions to declare them with. `childById` declares children by id, and asks
three things:

- where each one lives in the parent's state: `get` and `set`, by id;
- which of them may listen: `subscribed`;
- which program they are: `Timer.timer`.

{@includeCode ../../examples/timer/timers.ts#compose}

What the parent gets from the declaration:

- **Starting a child:** `children.Timer.init(id)` is a timer's first step, its state and its commands. The parent's
  own `init` is a function of `children` for this.
- **Its messages:** its own, plus `{ _tag: 'Timer', id, message }` for each timer's. `MessageOf` names them.
- **Its commands:** each timer's, as `{ _tag: 'Timer', id, command }`, run by the timer's `runCommand`.
- **Its subscriptions:** each running timer's `'ticks'`, under `['Timer', id, 'ticks']`.
- **Its children's models:** `children.Timer(state, id)` in `makeModel`, the same object while the timer's state
  is.

A timer that is not there is `None` in `get`. So a click on a removed timer, from a frame drawn before, is rejected:
the rule of step 1, with nothing more to write.

Notice what the parent does not do: it never reads a timer's state to decide. It only adds and removes (see
[splitting a program](../guide/structuring-a-program.md#splitting-a-program)).

## The view

Each timer is drawn by `timerView`, the view of step 2, with a dispatch of its own. `forwardTo` makes that dispatch:
it wraps the timer's messages as the parent receives them.

It is the same function in every frame. So snabbdom's `thunk` draws again only the timer whose model changed, and ten
timers ticking do not redraw each other (see [children's views](../guide/composition.md#childrens-views)):

{@includeCode ../../examples/timer/view.ts#timers}

## What you have

A list of independent timers, each ticking only while it runs, and a parent of some fifty lines that knows nothing of
phases, ticks or bells.

Next, [a name for each timer](./4-inputs.md).
