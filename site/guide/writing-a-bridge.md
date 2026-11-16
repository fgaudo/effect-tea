---
title: Writing a bridge
---

# Writing a bridge

## In short

The library draws nothing: a bridge connects it to a renderer. A bridge does three things. It draws each frame, sends
messages from the handlers of the view, and settles, after each frame, the element of each text input on screen. This
page shows how to write one for your renderer.

## An example

Most of a bridge's code is the same whatever the renderer. Only two places are the renderer's own: where it draws, and
where it lets the bridge reach an element.

The code below is the examples' bridge to snabbdom,
[`examples/snabbdom.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/snabbdom.ts), which the timer is
drawn with. You need not know snabbdom to read it. Its two places are named where they come, with what the bridge to
React, [`examples/react.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/react.ts), does there instead.
It is a minimal example to start from. What else a renderer can do is left to the bridge that needs it (see
[what is left out](#what-is-left-out)).

### Frames

`run(program, render)` hands `render` a stream of frames, each `{ model, dispatch, seen }`. The run ends when `render`
ends. A bridge's `renderInto(root, view)` is that `render`. For each frame, it calls the view with the model and the
dispatch, draws what the view returns, and waits for the next animation frame before it takes another.

{@includeCode ../../examples/snabbdom.ts#frames}

**The first place of the renderer** is the line that draws: `patch(previous, view(model, dispatch))`. There, snabbdom
patches the tree drawn before into the one the view returned. The bridge to React calls
`flushSync(() => root.render(view(model, dispatch)))` there instead. Whatever the renderer, the frame is drawn whole,
and at once. When the line returns, the screen shows the frame, and nothing else changes it but the next one.

The rest is the bridge's:

- The run keeps only the latest frame while the renderer is busy. So waiting for the next animation frame draws at
  most once per screen refresh, and a model the renderer never takes is never made (see [running](./running.md)).
- A view that throws throws in the frame's `Effect.sync`, and the run dies with it.
- `showsModule` and `settle` are for the inputs, below. Without them, a bridge is this loop and its handlers.

### Handlers

Sending a message returns an `Effect<number>`. It needs no services and completes synchronously: it only hands the
message to the run. The run handles it in its own fiber. A plain callback of any renderer runs it with
`Effect.runSync`:

{@includeCode ../../examples/snabbdom.ts#handlers}

What `onClick` returns is the renderer's way to attach a listener: `{ click }` in snabbdom's `on`, and React's
`onClick` prop in the other bridge. The message is one the model holds, never one the view builds. The timer's view
writes it `on: onClick(model.more, dispatch)`.

### A text input

A text field could be drawn as any other element: its `value` from the model, and each keystroke sent as a message.
It would lose keystrokes. A frame may be older than the user's last keystroke, made before the run took it. Writing
that frame's value into the field takes back what was just typed.

Instead, the library gives the bridge the rule for that element. The rule is two functions over what the element holds
of an input, a `Shown`. The bridge keeps one for each element, with the value the last frame drew for it:

{@includeCode ../../examples/snabbdom.ts#held}

When the user types, `typed(held, value)` gives two things:

- the write to send: the new value, over the one the element showed;
- `sent`, which takes the number the dispatch returned, and gives what the element holds now.

The listener is the element's own `input` event, attached as the renderer attaches any. Here `shows` gives it to
snabbdom, with the value to show. A view draws the field with it:
`h('input', shows(model.name, dispatchTo(dispatch, 'Name')))`.

{@includeCode ../../examples/snabbdom.ts#shows}

**The second place of the renderer** is how the bridge learns, after each frame, which elements show an input, and
with what value. snabbdom calls a module of the bridge as it creates, patches or removes an element:

{@includeCode ../../examples/snabbdom.ts#module}

The bridge to React has no module. `Shows`, the component that draws its field, keeps the value of each render from a
ref callback. The bridge finds the fields `Shows` drew among the elements of its root. Another renderer needs one way
or the other, as long as it gives the elements before the user can act on them.

The rest is the bridge's again. After each frame, `drawn(held, value, seen)` says what the element then holds, and
whether it takes the frame's value. The bridge writes the value it takes into the element:

- A new element takes it.
- An element keeps what the user typed while the frame is its own past or present: a state from before the writes the
  frame has not seen, or after them all.
- Once the state has moved on without the element, the element takes the program's value. The library rejects the
  writes the frame has not seen, unless the input's place holds again the value they were written over (see
  [two limits](./inputs-the-user-types-into.md#two-limits)).

{@includeCode ../../examples/snabbdom.ts#settle}

So the element is never replaced, and keeps its focus while the program changes what it shows. That holds while
(see [inputs the user types into](./inputs-the-user-types-into.md)):

- the element's value changes only by an edit of the user, which it reports with the whole value, or by the bridge;
- the renderer lets the bridge reach the element after each frame, before the user can act on it.

The renderer must also keep an element drawn in the same place from one frame to the next, as snabbdom and React do.
Otherwise there is no element to settle.

## Rules

What a bridge does, from the walkthrough above:

- **It draws each frame whole, and at once.** Nothing but the next frame changes what the screen shows.
- **A plain callback sends a message with `Effect.runSync`.** Sending needs no services and completes synchronously.
- **The message is one the model holds**, never one the view builds.
- **When the user edits an input's element, `typed` gives the write to send**, and `sent` what the element holds once
  the dispatch returns the write's number.
- **After each frame, the bridge settles the element of each input with `drawn`.** The element is then never
  replaced, and keeps its focus, while two conditions hold: its value changes only by an edit of the user, which it
  reports with the whole value, or by the bridge; and the renderer lets the bridge reach it after each frame, before
  the user can act on it.
- **The renderer keeps an element drawn in the same place from one frame to the next**, or there is no element to
  settle.

## Precisely

### The examples' bridges

The library ships no renderer. A bridge to one does three things: it draws each frame, runs `dispatch` in the handlers,
and settles, after each frame, the element of each input on screen (see
[inputs the user types into](./inputs-the-user-types-into.md)).

The examples have two:

- [`examples/snabbdom.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/snabbdom.ts), the bridge to
  snabbdom;
- [`examples/react.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/react.ts), the bridge to React.

Each is small enough to copy, and worth copying for your own. Each names the type of its views, `View<Model, Message>`.
Each has `renderInto` for `run`, handlers, and the element of each input: `shows` with snabbdom, `Shows` with React.

[`counter-react`](https://github.com/fgaudo/effect-tea/tree/main/examples/counter-react) and
[`form-react`](https://github.com/fgaudo/effect-tea/tree/main/examples/form-react) draw the programs of
[`counter`](https://github.com/fgaudo/effect-tea/tree/main/examples/counter) and
[`form`](https://github.com/fgaudo/effect-tea/tree/main/examples/form) with the bridge to React. React Native's bridge
is written the same way. The sections above show how to write one for any renderer, from the bridge to snabbdom.

### What is left out

The examples' bridges are minimal examples to start from. They show how a native element is connected to the library.
They handle the base case alone:

- **They run `dispatch` from three events**: a click, a press of the pointer, and the `input` event of a native text
  `<input>`.
- **They settle native text fields alone.** A native text `<input>` is the only element of an input they settle.
- **The base case** is a field whose value changes only by the user's edits and by the bridge.

They leave out:

- **A value the text field changes by itself**, as it strips the line breaks of what is written into it. They do not
  handle it, and whether a bridge that starts from them could is left open.
- **A form's reset**, by a reset button or `form.reset()`, with either bridge. A program may empty a field by leaving
  `''` in its place.
- **A root or an input in a shadow tree**, with either bridge.
- **With React**: a component with state or effects of its own, Suspense, a subtree `memo` skips, and a portal.
- **With React, a run whose root is inside another run's.** For it, the bridge would need to know the run each input
  belongs to, as a context of its own would tell it.
- **Other native widgets.** One that meets the condition of `typed` and `drawn` (see
  [inputs the user types into](./inputs-the-user-types-into.md)) would be connected by hand with them. Wherever
  connecting one is too complex, a widget the program draws is preferred: its press is a message, and its drag a
  subscription. The sliders of [`examples/volume`](https://github.com/fgaudo/effect-tea/tree/main/examples/volume) are
  drawn this way.

Any other feature of a renderer is left to the bridge that needs it.

### Their tests

Both bridges are tested in a DOM, with [happy-dom](https://github.com/capricorn86/happy-dom):
[`examples/snabbdom.test.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/snabbdom.test.ts) and
[`examples/react.test.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/react.test.ts) run them.

The tests they share are written once, in
[`examples/bridge.test_suite.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/bridge.test_suite.ts). They
check:

- how often a bridge draws;
- that a click reaches the program;
- that what the user types survives the frames drawn meanwhile;
- that the element of an input shows what the program puts in its place.

A bridge of your own can start from them. To run them on it, a test file registers a DOM, as those two do, and gives
`bridgeTests` a `Bridge`: your `renderInto`, and the views of their scenarios drawn with your renderer.

Beside the snabbdom bridge, [`examples/snabbdom-testing.test_messages.ts`][messages] has `messagesSentBy`. It finds
what a view sends, without a DOM. It is one way to check that a view draws what its model holds. The library asks that
of no bridge (see [testing](./testing.md)). The test of each example drawn with snabbdom uses it.

[messages]: https://github.com/fgaudo/effect-tea/tree/main/examples/snabbdom-testing.test_messages.ts
