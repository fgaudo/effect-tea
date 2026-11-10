---
title: A first program
---

# A first program

The first program sets how many minutes a timer lasts: "+" adds a minute, "−" takes one away, never below one.
Its code is [`examples/timer/duration.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/timer/duration.ts).

## State and messages

The **state** is everything the program knows, and a **message** is something that happened to it, here a click on
either button:

{@includeCode ../../examples/timer/duration.ts#state}

The state is always an object, `{ minutes }` rather than a number, so that any program can later become a child
as it is (see [anatomy of a program](https://fgaudo.github.io/effect-tea/#anatomy-of-a-program)).

## Update

`update` takes a message, then the state, and returns the next state, as `{ state }`. When a message does not
apply in the state, it returns `reject` instead: "−" at one minute.

{@includeCode ../../examples/timer/duration.ts#update}

`update` is pure: it never runs an effect and never changes the state it is given. The run ignores a rejected
message and keeps the state as it was, so a click that comes late, from a screen drawn before, is harmless (see
[rejections and defects](https://fgaudo.github.io/effect-tea/#rejections-and-defects)).

## Model and program

The view does not read the state. It draws a **model** that `makeModel` makes from it, with the messages its
controls send. At one minute the model has no `less`: the view cannot offer what `update` rejects.

{@includeCode ../../examples/timer/duration.ts#program}

A program is a plain object, and its type names its types: `Program<{ state; model; message }>`. `init` is the
state it starts from (see [model](https://fgaudo.github.io/effect-tea/#model)).

## View

A view is `(model, dispatch) => node`. It draws the model and sends what the model holds through `dispatch`; it
decides nothing on its own:

{@includeCode ../../examples/timer/view.ts#duration}

## Running it

`run(duration, renderInto(root, durationView))` starts the program and hands the renderer a stream of frames,
each a model and the `dispatch` to send its messages with. `renderInto` draws each frame into the element `root`.
In a browser, the run is started with `BrowserRuntime.runMain` from `@effect/platform-browser`, as
[step 3](./3-children.md) does, so that a run that dies is reported (see
[running](https://fgaudo.github.io/effect-tea/#running)).

Next, [the timer itself](./2-commands-and-subscriptions.md).
