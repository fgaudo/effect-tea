---
title: Writing a bridge
---

# Writing a bridge

The library draws nothing: a bridge connects it to a renderer, and this page shows how to write one for yours. A
bridge does three things: it draws each frame, sends messages from the handlers of the view, and settles, after each
frame, the element of each text input on screen. Most of its code is the same whatever the renderer, and only two
places are the renderer's own: where it draws, and where it lets the bridge reach an element.

The code below is the examples' bridge to snabbdom,
[`examples/snabbdom.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/snabbdom.ts), which the timer is
drawn with. You need not know snabbdom to read it: its two places are named where they come, with what the bridge to
React, [`examples/react.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/react.ts), does there instead.
It is a minimal example to start from: what else a renderer can do is left to the bridge that needs it (see
[view](#the-examples-bridges)).

## Frames

`run(program, render)` hands `render` a stream of frames, each `{ model, dispatch, seen }`, and the run ends when
`render` ends. A bridge's `renderInto(root, view)` is that `render`: for each frame it calls the view with the model
and the dispatch, draws what the view returns, and waits for the next animation frame before it takes another.

{@includeCode ../../examples/snabbdom.ts#frames}

The first place of the renderer is the line that draws: `patch(previous, view(model, dispatch))`, where snabbdom
patches the tree drawn before into the one the view returned. The bridge to React calls
`flushSync(() => root.render(view(model, dispatch)))` there. Whatever the renderer, the frame is drawn whole, and at
once: when the line returns, the screen shows the frame, and nothing else changes it but the next one.

The rest is the bridge's. The run keeps only the latest frame while the renderer is busy, so waiting for the next
animation frame draws at most once per screen refresh, and a model the renderer never takes is never made (see
[running](./running.md)). A view that throws throws in the frame's `Effect.sync`, and
the run dies with it. `showsModule` and `settle` are for the inputs, below: without them, a bridge is this loop and
its handlers.

## Handlers

Sending a message returns an `Effect<number>` that needs no services and completes synchronously: it only hands the
message to the run, which handles it in its own fiber. A plain callback of any renderer runs it with
`Effect.runSync`:

{@includeCode ../../examples/snabbdom.ts#handlers}

What `onClick` returns is the renderer's way to attach a listener, `{ click }` in snabbdom's `on`, React's
`onClick` prop in the other bridge. The message is one the model holds, never one the view builds:
`on: onClick(model.more, dispatch)`, as the timer's view writes it.

## A text input

A text field could be drawn as any other element, its `value` from the model and each keystroke sent as a message.
It would lose keystrokes: a frame may be older than the user's last one, made before the run took it, and writing its
value into the field takes back what was just typed. The library gives the bridge the rule for that element instead,
in two functions over what the element holds of an input, a `Shown`. The bridge keeps one for each element, with the
value the last frame drew for it:

{@includeCode ../../examples/snabbdom.ts#held}

When the user types, `typed(held, value)` gives the write to send, the new value over the one the element showed,
and `sent`, which takes the number the dispatch returned and gives what the element holds now. The listener is the
element's own `input` event, attached as the renderer attaches any: here `shows` gives it to snabbdom with the value
to show, and a view draws the field with it, `h('input', shows(model.name, dispatchTo(dispatch, 'Name')))`.

{@includeCode ../../examples/snabbdom.ts#shows}

The second place of the renderer is how the bridge learns, after each frame, which elements show an input and with
what value. snabbdom calls a module of the bridge as it creates, patches or removes an element:

{@includeCode ../../examples/snabbdom.ts#module}

The bridge to React has no module: `Shows`, the component that draws its field, keeps the value of each render from a
ref callback, and the bridge finds the fields `Shows` drew among the elements of its root. Another renderer needs one
way or the other, as long as it gives the elements before the user can act on them.

The rest is the bridge's again. After each frame, `drawn(held, value, seen)` says what the element then holds and
whether it takes the frame's value, which the bridge writes into it. A new element takes it. An element keeps what the
user typed while the frame is its own past or present: a state from before the writes the frame has not seen, or
after them all. And once the state has moved on without the element, it takes the program's value, and the writes
the frame has not seen are rejected by the library:

{@includeCode ../../examples/snabbdom.ts#settle}

So the element is never replaced, and keeps its focus while the program changes what it shows. That holds while the
element's value changes only by an edit of the user, which it reports with the whole value, or by the bridge, and
while the renderer lets the bridge reach the element after each frame, before the user can act on it (see
[inputs the user types into](./inputs-the-user-types-into.md)). The renderer must also
keep an element drawn in the same place from one frame to the next, as snabbdom and React do, or there is no element
to settle.

## What is left out

These bridges handle the base case alone. A form's reset, a root in a shadow tree, and a value the field changes by
itself, as it strips the line breaks of what is written into it, are left to a bridge that needs them. Another native
widget that meets the condition above would be connected by hand with `typed` and `drawn`; a widget the program
draws, whose press is a message and whose drag a subscription, is preferred wherever that is too complex, as the
sliders of [`examples/volume`](https://github.com/fgaudo/effect-tea/tree/main/examples/volume) are.

Both bridges are tested in a DOM, with happy-dom, by the tests of
[`examples/bridge.test_suite.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/bridge.test_suite.ts),
which a bridge of your own can start from.

## The examples' bridges

The library ships no renderer. A bridge to one does three things: it draws each frame, runs `dispatch` in the handlers,
and settles, after each frame, the element of each input on screen (see
[inputs the user types into](./inputs-the-user-types-into.md)).
[`examples/snabbdom.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/snabbdom.ts) and
[`examples/react.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/react.ts) are two, each small enough to
copy, and each names the type of its views, `View<Model, Message>`.
[`counter-react`](https://github.com/fgaudo/effect-tea/tree/main/examples/counter-react) and
[`form-react`](https://github.com/fgaudo/effect-tea/tree/main/examples/form-react) draw the programs of
[`counter`](https://github.com/fgaudo/effect-tea/tree/main/examples/counter) and
[`form`](https://github.com/fgaudo/effect-tea/tree/main/examples/form) with the second. React Native's bridge is written
the same way. The sections above show how to write one for any renderer, from the first.

The examples' bridges are minimal examples to start from: they show how a native element is connected to the library,
and settle native text fields alone. They run `dispatch` from a click, a press of the pointer and the `input` event of a
native text `<input>`, the only element of an input they settle, in the base case: a field whose value changes only by
the user's edits and by the bridge. A value the text field changes by itself, as it strips the line breaks of what is
written into it, they do not handle, and whether a bridge that starts from them could is left open. Another native
widget that meets the condition of `typed` and `drawn` (see
[inputs the user types into](./inputs-the-user-types-into.md)) would be connected by hand with them; a widget the
program draws is preferred wherever connecting one is too complex. Any other feature of a renderer is left to the bridge
that needs it: with either, a form's reset, by a reset button or `form.reset()` (a program may empty a field by leaving
`''` in its place), and a root or an input in a shadow tree; with React, a component with state or effects of its own,
Suspense, a subtree `memo` skips, a portal, and a run whose root is inside another run's, for which the bridge would
need to know the run each input belongs to, as a context of its own would tell it.

[`examples/snabbdom.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/snabbdom.ts) and
[`examples/react.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/react.ts) are the small bridges to the two
renderers, worth copying for your own: `renderInto` for `run`, handlers, and the element of each input (`shows` with
snabbdom, `Shows` with React). Their tests,
[`examples/snabbdom.test.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/snabbdom.test.ts) and
[`examples/react.test.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/react.test.ts), run them in a DOM,
with [happy-dom](https://github.com/capricorn86/happy-dom). The tests they share are written once, in
[`examples/bridge.test_suite.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/bridge.test_suite.ts), and
check how often a bridge draws, that a click reaches the program, that what the user types survives the frames drawn
meanwhile, and that the element of an input shows what the program puts in its place. To run them on a bridge of your
own, a test file that registers a DOM, as those two do, gives `bridgeTests` a `Bridge`: your `renderInto`, and the views
of their scenarios drawn with your renderer. Beside the snabbdom bridge,
[`examples/snabbdom-testing.test_messages.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/snabbdom-testing.test_messages.ts)
has `messagesSentBy`, which finds what a view sends without a DOM: one way to check that a view draws what its model
holds, which the library asks of no bridge (see [testing](./testing.md)), and which the test of each example drawn with
snabbdom uses.
