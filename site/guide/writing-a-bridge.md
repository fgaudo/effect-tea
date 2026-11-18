---
title: Writing a bridge
---

# Writing a bridge

## In short

This page shows how to write a bridge for your renderer. The library draws nothing: a bridge connects the library to a
renderer. A bridge does three things:

- it draws each frame;
- it sends messages from the handlers of the view;
- after each frame, it settles the element of each input on screen, such as a text field.

## An example

Most of a bridge's code is the same whatever the renderer. Only two places are the renderer's own: where it draws, and
where it lets the bridge reach an element.

The code below is the examples' bridge to snabbdom,
[`examples/bridges/snabbdom.ts`](../../examples/bridges/snabbdom.ts). The timer is drawn with it. You do not need to
know snabbdom to read it. Each of the two places of the renderer is named where it comes, with what the bridge to
React, [`examples/bridges/react.ts`](../../examples/bridges/react.ts), does there instead. The bridge to snabbdom is a
minimal example to start from. What else a renderer can do is left to the bridge that needs it (see
[what is left out](#what-is-left-out)).

### Frames

`run(program, render)` hands `render` a stream of frames, each `{ model, dispatch, seen }`. The run ends when `render`
ends. A bridge's `renderInto(root, view)` is that `render`. For each frame, `renderInto`:

1. calls the view with the model and the dispatch;
2. draws what the view returns;
3. waits for the next animation frame before it takes another frame.

{@includeCode ../../examples/bridges/snabbdom.ts#frames}

**The first place of the renderer** is the line that draws: `patch(previous, view(model, dispatch))`. There, snabbdom
patches the tree drawn before into the one the view returned. The bridge to React calls
`flushSync(() => root.render(view(model, dispatch)))` there instead. Whatever the renderer, the frame is drawn whole,
and at once. When the line returns, the screen shows the frame, and nothing but the next frame changes it.

The rest is the bridge's own code:

- The run keeps only the latest frame while the renderer is busy. So waiting for the next animation frame draws at
  most once per screen refresh, and a model the renderer never takes is never made (see [running](./running.md)).
- If a view throws, the view throws inside the frame's `Effect.sync`, and the run dies with it.
- `showsModule` and `settle` are for the inputs, below. Without them, a bridge is this loop and its handlers.

### Handlers

Sending a message returns an `Effect<number>`. That effect needs no services and completes synchronously, because it
only hands the message to the run. The run handles the message in its own fiber. A plain callback of any renderer runs
the effect with `Effect.runSync`:

{@includeCode ../../examples/bridges/snabbdom.ts#handlers}

What `onClick` returns is the renderer's way to attach a listener: `{ click }` in snabbdom's `on`, and React's
`onClick` prop in the other bridge. The message is one the model holds, never one the view builds. The timer's view
writes it `on: onClick(model.more, dispatch)`.

### A text input

A text field could be drawn as any other element: its `value` from the model, and each keystroke sent as a message.
But the field would lose keystrokes. A frame may be older than the user's last keystroke, because the frame may have
been made before the run took that keystroke. Writing that frame's value into the field takes back what was just typed.

Instead, the library gives the bridge the rule for that element. The rule is two functions over a `Shown`, which is
what the element holds of an input. The bridge keeps one `Shown` for each element, with the value that the last frame
drew for that element:

{@includeCode ../../examples/bridges/snabbdom.ts#held}

When the user types, `edited(held, value)` gives two things:

- the write to send: the new value, over the one the element showed;
- `sent`, which takes the number the dispatch returned, and gives what the element holds now.

The listener is the element's own `input` event, attached as the renderer attaches any listener. Here `shows` gives
the listener to snabbdom, with the value to show. A view draws the field with `shows`:
`h('input', shows(model.name, forwardTo(dispatch, 'Name')))`.

{@includeCode ../../examples/bridges/snabbdom.ts#shows}

**The second place of the renderer** is how the bridge learns, after each frame, which elements show an input, and
with what value. snabbdom calls a module of the bridge as it creates, patches or removes an element:

{@includeCode ../../examples/bridges/snabbdom.ts#module}

The bridge to React has no module. `Shows`, the component that draws its field, keeps the value of each render from a
ref callback. The bridge finds the fields that `Shows` drew among the elements of its root. Another renderer needs some
way to do this, as long as it gives the elements before the user can act on them.

The rest is the bridge's own code again. After each frame, `drawn(held, value, seen)` says what the element then holds,
and whether it takes the frame's value. The bridge writes the value it takes into the element:

- A new element takes it.
- An element keeps what the user typed while the frame is its own past or present: a state from before the writes that
  the frame has not seen, or a state after all of them.
- Once the state has moved on without the element, the element takes the program's value. The library rejects the
  writes that the frame has not seen, unless the input's place again holds the value they were written over (see
  [two limits](./inputs-the-user-types-into.md#two-limits)).

{@includeCode ../../examples/bridges/snabbdom.ts#settle}

So the element is never replaced, and keeps its focus while the program changes what it shows. This holds under the
two conditions listed in [rules](#rules), and with a renderer that keeps each element in its place, as snabbdom and
React do.

## Rules

What a bridge does, from the walkthrough above:

- **It draws each frame whole, and at once.** Nothing but the next frame changes what the screen shows.
- **A plain callback sends a message with `Effect.runSync`.** Sending needs no services and completes synchronously.
- **The message is one the model holds**, never one the view builds.
- **When the user edits an input's element, `edited` gives the write to send**, and `sent` what the element holds once
  the dispatch returns the write's number.
- **After each frame, the bridge settles the element of each input with `drawn`.** The element is then never
  replaced, and keeps its focus, while two conditions hold (see
  [inputs the user types into](./inputs-the-user-types-into.md)):
  - the element's value changes only by an edit of the user, which it reports with the whole value, or by the bridge;
  - the renderer lets the bridge reach the element after each frame, before the user can act on it.
- **The renderer keeps an element drawn in the same place from one frame to the next**, as snabbdom and React do.
  Otherwise there is no element to settle.

## Precisely

### The examples' bridges

The library ships no renderer. A bridge to a renderer does the three things listed in [in short](#in-short). The
examples have two bridges:

- [`examples/bridges/snabbdom.ts`](../../examples/bridges/snabbdom.ts), the bridge to snabbdom;
- [`examples/bridges/react.ts`](../../examples/bridges/react.ts), the bridge to React.

Each bridge is small enough to copy, and worth copying for your own. Each bridge:

- names the type of its views, `View<Model, Message>`;
- has `renderInto` for `run`, and handlers;
- has the element of each input: `shows` with snabbdom, `Shows` with React.

[`counter`](../../examples/counter) and [`form`](../../examples/form) draw their programs with the bridge to snabbdom
and with the bridge to React, one under the other. Both bridges draw the frames of one run. React Native's bridge is
written the same way. The sections above show how to write a bridge for any renderer, from the bridge to snabbdom.

### What is left out

The examples' bridges are minimal examples to start from. They show how a native element is connected to the library.
They handle only the base case:

- **They run `dispatch` from three events**: a click, a press of the pointer, and the `input` event of a native text
  `<input>`.
- **They settle only native text fields.** A native text `<input>` is the only element of an input they settle.
- **The base case** is a field whose value changes only by the user's edits and by the bridge.

They leave out:

- **A value the text field changes by itself**, as when the field strips the line breaks from what is written into it.
  The examples' bridges do not handle it. Whether a bridge that starts from them could handle it is left open.
- **A form's reset**, by a reset button or `form.reset()`, with either bridge. A program may empty a field by leaving
  `''` in its place.
- **A root or an input in a shadow tree**, with either bridge.
- **With React**: a component with state or effects of its own, Suspense, a subtree that `memo` skips, and a portal.
- **With React, a run whose root is inside another run's.** For that, the bridge would need to know which run each
  input belongs to. A context of the bridge's own would tell it.
- **Other native widgets.** A widget that meets the condition of `edited` and `drawn` (see
  [inputs the user types into](./inputs-the-user-types-into.md)) would be connected by hand with them. Where
  connecting a widget is too complex, prefer a widget that the program draws: its press is a message, and its drag a
  subscription. The sliders of [`examples/volume`](../../examples/volume) are drawn this way.

Any other feature of a renderer is left to the bridge that needs it.

### Their tests

Both bridges are tested in a DOM, with [happy-dom](https://github.com/capricorn86/happy-dom):
[`examples/bridges/snabbdom.test.ts`](../../examples/bridges/snabbdom.test.ts) and
[`examples/bridges/react.test.ts`](../../examples/bridges/react.test.ts) run them.

The tests they share are written once, in
[`examples/bridges/bridge.test_suite.ts`](../../examples/bridges/bridge.test_suite.ts). They check:

- how often a bridge draws;
- that a click reaches the program;
- what a second click on a button does before the next frame is drawn;
- that what the user types survives the frames drawn meanwhile;
- that the element of an input shows what the program puts in its place;
- that an element drawn in turn as an input and as a plain field shows the input only while it is one.

A bridge of your own can start from them. To run them on it:

- copy the file, with the examples whose programs it draws;
- have a test file register a DOM, as those two do;
- give `bridgeTests` a `Bridge`: your `renderInto`, and the views of their scenarios drawn with your renderer.

The file holds the screen refreshes and Effect's scheduler, with `holdFrames`, `settle`, `refresh` and `paint`. So the
test says when a frame is drawn, and when the run's fibers go on.

Beside the snabbdom bridge, [`examples/bridges/snabbdom-testing.ts`][messages] has `messagesSentBy`. It finds what a
view sends, without a DOM. It is one way to check that a view draws what its model holds. The library does not ask it
of any bridge (see [testing](./testing.md)). The test of each example drawn with snabbdom uses `messagesSentBy`.

[messages]: ../../examples/bridges/snabbdom-testing.ts
