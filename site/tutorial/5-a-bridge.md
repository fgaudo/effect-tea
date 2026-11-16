---
title: A bridge
---

# A bridge

The timer is drawn through the examples' bridge to snabbdom,
[`examples/snabbdom.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/snabbdom.ts). This step reads it
from the start, to write one for another renderer or to change this one. A bridge does three things: it draws each
frame, sends messages from the handlers of the view, and settles, after each frame, the element of each text input
on screen. It is a minimal example to start from: what else a renderer can do is left to the bridge that needs it
(see [view](https://fgaudo.github.io/effect-tea/#view)).

## Frames

`run(program, render)` hands `render` a stream of frames, each `{ model, dispatch, seen }`, and the run ends when
`render` ends. `renderInto(root, view)` is that `render`: for each frame it calls the view with the model and the
dispatch, patches the tree drawn before with what the view returns, and waits for the next animation frame before it
takes another.

{@includeCode ../../examples/snabbdom.ts#frames}

The run keeps only the latest frame while the renderer is busy, so this bridge draws at most once per screen refresh,
and a model the renderer never takes is never made (see [running](https://fgaudo.github.io/effect-tea/#running)). A
frame is drawn whole and at once, by a patch that is synchronous: what the screen shows comes from frames alone. A
view that throws throws in the frame's `Effect.sync`, and the run dies with it. `showsModule` and `settle` are for
the inputs, below: without them, a bridge is this loop and its handlers.

## Handlers

Sending a message returns an `Effect<number>` that needs no services and completes synchronously: it only hands the
message to the run, which handles it in its own fiber. A plain callback runs it with `Effect.runSync`:

{@includeCode ../../examples/snabbdom.ts#handlers}

The message is one the model holds, never one the view builds: `on: onClick(model.more, dispatch)`, as the timer's
view writes it.

## A text input

A text field could be drawn as any other element, its `value` from the model and each keystroke sent as a message.
It would lose keystrokes: a frame may be older than the user's last one, made before the run took it, and writing its
value into the field takes back what was just typed. The library gives the bridge the rule for that element instead,
in two functions over what the element holds of an input, a `Shown`. The bridge keeps one for each element, with the
value the last frame drew for it:

{@includeCode ../../examples/snabbdom.ts#held}

When the user types, `typed(held, value)` gives the write to send, the new value over the one the element showed,
and `sent`, which takes the number the dispatch returned and gives what the element holds now. A view draws the field
with `shows`, through the input's own dispatch: `h('input', shows(model.name, dispatchTo(dispatch, 'Name')))`.

{@includeCode ../../examples/snabbdom.ts#shows}

The bridge reaches each element through a module of snabbdom, which hears when a frame creates, patches or removes
it, and keeps the value the frame drew for it:

{@includeCode ../../examples/snabbdom.ts#module}

After each patch, `drawn(held, value, seen)` says what the element then holds and whether it takes the frame's value,
which the bridge writes into it. A new element takes it. An element keeps what the user typed while the frame is its
own past or present: a state from before the writes the frame has not seen, or after them all. And once the state has
moved on without the element, it takes the program's value, and the writes the frame has not seen are rejected by the
library:

{@includeCode ../../examples/snabbdom.ts#settle}

So the element is never replaced, and keeps its focus while the program changes what it shows. That holds while the
element's value changes only by an edit of the user, which it reports with the whole value, or by the bridge, and
while the renderer lets the bridge reach the element after each frame, before the user can act on it (see
[inputs the user types into](https://fgaudo.github.io/effect-tea/#inputs-the-user-types-into)).

## What is left out

This bridge handles the base case alone. A form's reset, a root in a shadow tree, and a value the field changes by
itself, as it strips the line breaks of what is written into it, are left to a bridge that needs them. Another native
widget that meets the condition above would be connected by hand with `typed` and `drawn`; a widget the program
draws, whose press is a message and whose drag a subscription, is preferred wherever that is too complex, as the
sliders of [`examples/volume`](https://github.com/fgaudo/effect-tea/tree/main/examples/volume) are.

The bridge to React,
[`examples/react.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/react.ts), does the same three things:
`flushSync` draws each frame whole and at once, `Shows` draws an uncontrolled `<input>` and keeps the value of each
render from a ref callback, and the bridge settles the inputs `Shows` drew inside its root once `flushSync` returns.
Both are tested in a DOM, with happy-dom, by the tests of
[`examples/bridge.test_suite.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/bridge.test_suite.ts),
which a bridge of your own can start from.
