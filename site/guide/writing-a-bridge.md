---
title: Writing a bridge
---

# Writing a bridge

## In short

This page shows how to write a bridge for your renderer. The library draws nothing: a bridge connects the library to a
renderer. A bridge does three things:

- it draws each frame;
- it sends messages from the handlers of the view;
- after each frame, it settles the element of each input on screen, such as a text field, and as the renderer shows an
  element again.

## An example

Most of a bridge's code is the same whatever the renderer. Only two places are the renderer's own: where it draws, and
where it lets the bridge reach an element.

The code below is the package's bridge to snabbdom, `@fgaudo/effect-tea/snabbdom`
([`bridges/snabbdom.ts`](../../bridges/snabbdom.ts)). The timer is drawn with it. You do not need to
know snabbdom to read it. Each of the two places of the renderer is named where it comes, with what the bridge to
React, `@fgaudo/effect-tea/react` ([`bridges/react.ts`](../../bridges/react.ts)), does there instead. The bridge to snabbdom is a
minimal example to start from. What else a renderer can do is left to the bridge that needs it (see
[what is left out](#what-is-left-out)).

### Frames

`run(program, render)` hands `render` a stream of frames, each `{ model, dispatch, seen }`. The run ends when `render`
ends. A bridge's `renderInto(root, view)` is that `render`. The bridge to React gives it as the `open()` of a store,
which `Frames` draws, and which `Host` makes and opens for you. For each frame, `renderInto`:

1. calls the view with the model and the dispatch, unless the model is the very one it drew last;
2. draws what the view returns;
3. waits for the next animation frame before it takes another frame.

{@includeCode ../../bridges/snabbdom.ts#frames}

**The first place of the renderer** is the line that draws: `patch(previous, view(model, dispatch))`. There, snabbdom
patches the tree drawn before into the one the view returned. The bridge to React publishes the frame to its store
there instead, inside `flushSync`, and `Frames` calls the view as React renders. When the line returns, the screen shows
the frame: snabbdom draws it whole and at once, and React commits it at once, but for a part of it that the application
suspends. Between two frames, the bridge to snabbdom draws nothing, and React draws what the application's components
hold. What else the screen may show is in [view](./view.md#rules).

The rest is the bridge's own code:

- The run keeps only the latest frame while the renderer is busy. So waiting for the next animation frame draws at
  most once per screen refresh, and a model the renderer never takes is never made (see [running](./running.md)).
- With snabbdom, a view that throws throws inside the frame's `Effect.sync`, and the run dies with it. With React, a
  view that throws is an error of the application, for its error boundaries: an error boundary above `Host` unmounts
  it, and the run is interrupted.
- A frame of the very same state as the frame before it holds the very same model. The run draws one for each
  dispatched message that makes no new state, with a new `seen`. The bridge does not draw it again: it only settles
  its inputs.
- `showsModule` and `settle` are for the inputs, below. Without them, a bridge is this loop and its handlers.

### Handlers

Sending a message returns an `Effect<number>`. That effect needs no services and completes synchronously, because it
only hands the message to the run. The run handles the message in its own fiber. A plain callback of any renderer runs
the effect with `Effect.runSync`:

{@includeCode ../../bridges/snabbdom.ts#handlers}

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

{@includeCode ../../bridges/snabbdom.ts#held}

When the user types, `edited(held, value)` gives two things:

- the write to send: the new value, over the one the element showed;
- `sent`, which takes the number the dispatch returned, and gives what the element holds now.

The listener is the element's own `input` event, attached as the renderer attaches any listener. Here `shows` gives
the listener to snabbdom, with the value to show. A view draws the field with `shows`:
`h('input', shows(model.name, forwardTo(dispatch, 'Name')))`.

{@includeCode ../../bridges/snabbdom.ts#shows}

**The second place of the renderer** is how the bridge learns, after each frame, which elements show an input, and
with what value. snabbdom calls a module of the bridge as it creates, patches or removes an element:

{@includeCode ../../bridges/snabbdom.ts#module}

The bridge to React has no module. `Shows`, the component that draws its field, finds its run's store by a context of
React, and reads the run's `seen` itself. It settles its own element in a layout effect, after each commit that changes
its value or `seen`, and as React shows the element again. Another renderer needs some way to do this, as long as it
gives the elements before the user can act on them.

The rest is the bridge's own code again. After each frame, and as an element is shown again, `drawn(held, value, seen)`
says what the element then holds, and whether it takes the frame's value. The bridge writes the value it takes into the
element:

- A new element takes it.
- An element keeps what the user typed while the frame has not seen all its writes.
- Once a frame has seen them all, the element takes the program's value, unless it shows it already. A frame that has
  seen them always comes, since the run makes a frame for each dispatched message. The library rejected the writes
  that the state moved on without, unless the input's place again held the value they were written over (see
  [two limits](./inputs-the-user-types-into.md#two-limits)).

{@includeCode ../../bridges/snabbdom.ts#settle}

So the element is never replaced, and keeps its focus while the program changes what it shows. This holds under the
two conditions listed in [rules](#rules), and with a renderer that keeps each element in its place, as snabbdom and
React do.

## Rules

What a bridge does, from the walkthrough above:

- **It draws each frame, and says what else it draws.** The bridge to snabbdom draws each frame whole and at once,
  and nothing between two frames. The bridge to React commits each frame at once. Between two frames, React draws what
  the application's components hold, and a part of a frame that the application suspends is shown later. What else the
  screen may show is in [view](./view.md#rules).
- **A plain callback sends a message with `Effect.runSync`.** Sending needs no services and completes synchronously.
- **The message is one the model holds**, never one the view builds.
- **When the user edits an input's element, `edited` gives the write to send**, and `sent` what the element holds once
  the dispatch returns the write's number.
- **After each frame, and as the renderer shows an element again, the bridge settles the element of each input with
  `drawn`.** The element is then never
  replaced, and keeps its focus, while two conditions hold (see
  [inputs the user types into](./inputs-the-user-types-into.md)):
  - the element's value changes only by an edit of the user, which it reports with the whole value, or by the bridge;
  - the renderer lets the bridge reach the element after each frame, and as it shows the element again, before the user
    can act on it.
- **The renderer keeps an element drawn in the same place from one frame to the next**, as snabbdom and React do.
  Otherwise there is no element to settle.

## Precisely

### The package's bridges

The library draws nothing. A bridge to a renderer does the three things listed in [in short](#in-short). The package
has two bridges, each an entry of its own:

- `@fgaudo/effect-tea/snabbdom` ([`bridges/snabbdom.ts`](../../bridges/snabbdom.ts)), the bridge to snabbdom, with
  `messagesSentBy` in `@fgaudo/effect-tea/snabbdom/testing`;
- `@fgaudo/effect-tea/react` ([`bridges/react.ts`](../../bridges/react.ts)), the bridge to React.

A bridge needs its renderer, which you install beside the package: `snabbdom` 3.6.4 or a newer 3.x, or `react` and
`react-dom` 19.3.1 or a newer 19.x. The package does not install them. The rest of the package needs neither.

Each bridge is small, and a start for a bridge of your own: for another renderer, or for what they leave out. Each
bridge:

- names the type of its views, `View<Model, Message>`;
- has a renderer for `run`, and handlers: `renderInto` with snabbdom; with React, `Host`, which runs a program while it
  is mounted, and `Frames` with `makeStore`, which draw a run that the application starts itself;
- has the element of each input: `shows` with snabbdom, `Shows` with React.

[`counter`](../../examples/counter) and [`form`](../../examples/form) draw their programs with the bridge to snabbdom
and with the bridge to React, one under the other. Both bridges draw the frames of one run, which React draws with
`Frames`. A bridge to React Native
would be written the same way, but the repository has none. The sections above show how to write a bridge for any
renderer, from the bridge to snabbdom.

### What is left out

The package's bridges are minimal, and examples to start from. They show how a native element is connected to the
library.
They handle only the base case:

- **They run `dispatch` from three events**: a click, a press of the pointer, and the `input` event of a native text
  `<input>`.
- **They settle only native text fields.** A native text `<input>` is the only element of an input they settle.
- **The base case** is a field whose value changes only by the user's edits and by the bridge.

They leave out:

- **A value the text field changes by itself**, as when the field strips the line breaks from what is written into it.
  The package's bridges do not handle it. Whether a bridge that starts from them could handle it is left open.
- **A form's reset**, by a reset button or `form.reset()`, with either bridge. A program may empty a field by leaving
  `''` in its place.
- **A root or an input in a shadow tree**, with the bridge to snabbdom.
- **With React, an input drawn under one run's `Host` or `Frames` with the dispatch of another run.** The input is
  settled with the `seen` of the nearest run.
- **Other native widgets.** A widget that meets the condition of `edited` and `drawn` (see
  [inputs the user types into](./inputs-the-user-types-into.md)) would be connected by hand with them. Where
  connecting a widget is too complex, prefer a widget that the program draws: its press is a message, and its drag a
  subscription. The sliders of [`examples/volume`](../../examples/volume) are drawn this way.

Any other feature of a renderer is left to the bridge that needs it.

### Their tests

Both bridges are tested in a DOM, with [happy-dom](https://github.com/capricorn86/happy-dom):
[`bridges/snabbdom.test.ts`](../../bridges/snabbdom.test.ts) and
[`bridges/react.test.ts`](../../bridges/react.test.ts) run them.

The tests they share are written once, in
[`bridges/bridge.test_suite.ts`](../../bridges/bridge.test_suite.ts). They check:

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

Beside the snabbdom bridge, `@fgaudo/effect-tea/snabbdom/testing` ([`bridges/snabbdom-testing.ts`][messages]) has
`messagesSentBy`. It finds what a view sends, without a DOM. It is one way to check that a view draws what its model
holds. The library does not ask it of any bridge (see [testing](./testing.md)). The test of each example drawn with
snabbdom uses `messagesSentBy`.

[messages]: ../../bridges/snabbdom-testing.ts
