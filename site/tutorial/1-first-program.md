---
title: A first program
---

# A first program

Start small: a control that sets how many minutes a timer lasts. "+" adds a minute, "−" takes one away, never below
one. That last rule is the interesting part, and by the end of this page it holds in one place only.

The code is
[`examples/timer/duration.ts`](../../examples/timer/duration.ts).

## State and messages

The **state** is everything the program knows. A **message** is something that happened to it. Here the program knows
a number of minutes, and two things can happen, a click on either button:

{@includeCode ../../examples/timer/duration.ts#state}

The state is always an object, `{ minutes }` rather than a number. That way any program can later become a child as it
is, as the timer of step 2 does in step 3 (see [anatomy of a program](../guide/anatomy-of-a-program.md)).

## Update

`update` is where the rules live. It takes a message, then the state, and returns the next state, as `{ state }`. When
a message does not apply in the state, it returns `reject` instead. Here that is "−" at one minute:

{@includeCode ../../examples/timer/duration.ts#update}

`update` is pure: it never runs an effect, and never changes the state it is given. So you can call it in a test like
any other function.

What about `reject`? The running program ignores a rejected message and keeps the state as it was. A click can always
come late, from a screen drawn a moment before, and here such a click is harmless (see
[rejections and defects](../guide/rejections-and-defects.md)).

## Model and program

The view does not read the state. It draws a **model**, which `makeModel` makes from the state: what to show, and the
message each control sends. At one minute the model has no `less`, so the view cannot offer what `update` rejects.

If you come from Elm, mind the word: Elm's `Model` is the state here. This model is a step Elm does not have, between
the state and the view.

{@includeCode ../../examples/timer/duration.ts#program}

A program is a plain object, and its type names the types it is made of: `Program<{ state; model; message }>`. `init`
is the step it starts with: its first state, and the commands it starts, none here (see [model](../guide/model.md)).

## View

A view is `(model, dispatch) => node`. It draws the model, and sends the messages the model holds through `dispatch`.
It decides nothing on its own: whether "−" can be clicked is already in the model.

{@includeCode ../../examples/timer/view.ts#duration}

## Running it

`run(duration, renderInto(root, durationView))` starts the program and hands the renderer a stream of frames, each a
model and the `dispatch` to send its messages with. `renderInto` draws each frame into the element `root`.

In a browser, the run is started with `Effect.runFork`, with a `tapCause` that reports a run that dies.
[Step 4](./4-inputs.md) shows it for the finished application (see [running](../guide/running.md)).

## What you have

One rule, "never below one minute", written once in `update`. The model follows it, and the view only draws. In the
[finished application](https://fgaudo.github.io/effect-tea/examples/timer/), the "−" and "+" of a new timer are this
program: at one minute "−" is disabled, since the model has no `less`.

Next, [the timer itself](./2-commands-and-subscriptions.md).
