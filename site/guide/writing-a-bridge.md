---
title: Writing a bridge
---

# Writing a bridge

## In short

This page shows how to write a bridge for your renderer. The library draws nothing: a bridge connects the library to a
renderer. A bridge does three things:

- it draws the model of the current state, as it starts and once it is told of a new state;
- it lets the handlers of the view send messages, with `dispatch`;
- it draws each controlled element, such as a text field, with the value its model holds.

## An example

Most of a bridge's code is the same whatever the renderer. Only two places are the renderer's own: where it draws, and
where it lets the bridge reach an element.

The code below is the package's bridge to snabbdom, `@fgaudo/effect-tea/snabbdom`
([`bridges/snabbdom.ts`](../../bridges/snabbdom.ts)). The timer is drawn with it. You do not need to know snabbdom to
read it. Each of the two places of the renderer is named where it comes, with what the bridge to React,
`@fgaudo/effect-tea/react` ([`bridges/react.ts`](../../bridges/react.ts)), does there instead. The bridge to snabbdom is
a minimal example to start from. What else a renderer can do is left to the bridge that needs it (see
[what is left out](#what-is-left-out)).

### The handle

`start(program)` gives a `Started`, an `App` with `run` (see [running](./running.md#rules)). A bridge is plain code
over the `App`, `{ model, subscribe, dispatch, die }`, and returns what stops it. With snabbdom,
`drawInto(root, view)(app)` is that code. Whoever started the program calls what it returns, or does not: the run does
not stop a bridge. With the bridge to React, `Host` starts the program and its run, and gives React the `App`. A
program that the application starts itself hands its `App` to `Draw`.

`drawInto` draws the model of the current state:

1. as it is called;
2. in a microtask after each new state, wherever its message comes from;
3. in a microtask after each message that a handler of the view sends, whether it made a new state or not (see
   [handlers](#handlers)).

What one task sends is drawn once.

As it is called, `drawInto` empties `root`. Then `root` holds the view's top element and nothing else. `root` keeps its
place in the page, and it may have no parent.

Each draw calls the view with the model and the dispatch, unless the model is the very one it drew last, and draws
what the view returns. Then it gives each controlled element its value back (see
[a controlled element](#a-controlled-element)):

{@includeCode ../../bridges/snabbdom.ts#draw}

**The first place of the renderer** is the line that draws: `patch(tree, view(model, dispatch))`. There, snabbdom
patches the tree drawn before into the one the view returned. The first tree is a child of `root`, which the bridge puts
there as it is called. snabbdom replaces that child with the view's top element. The bridge to React reads the model
there instead, with `useSyncExternalStore(app.subscribe, app.model)` in `Draw`, and React calls the view as it renders.
When the line returns, snabbdom has drawn the model whole. React draws it as React schedules it, but for a part of it
that the application suspends. Between two draws, the bridge to snabbdom draws nothing, and React draws what the
application's components hold. What else the screen may show is in [view](./view.md#rules).

The rest is the bridge's own code:

- A model that is the very one drawn last is not drawn again. A model is made once for each state, so a rejected
  message, or one that leaves the very same state, draws no tree. The draw still gives the controlled elements their
  values back.
- A listener may be called while a patch runs. A browser may call `blur` as a patch removes the focused element, and
  `focus()` calls `blur` and `focus` at once, as an `insert` hook that focuses an element does. What such a listener
  sends is drawn after the patch under way, in a microtask of its own: no microtask runs while the patch is on the
  stack.
- With snabbdom, a view or a `makeModel` that throws as it is drawn ends the run, wherever it is drawn, the first draw
  too. A draw in a microtask runs in no call of the run, so the bridge gives what it threw to `die`. The run dies of
  it, in `'render'`, and the bridge draws nothing more. A draw that comes once the run has ended gets it back from
  `die`, and throws it out of the microtask, as an error of the page.
- With React, a view that throws is an error of the application, for its error boundaries: an error boundary above
  `Host` unmounts it, and the run is interrupted. A `makeModel` that throws is the run's: under `Host`, React draws the
  model it drew last until the run has ended, and `Host` then throws the defect to the boundary, once. `Draw` alone
  throws it as it renders, and the run that the application started dies of it too: one defect, met in two places.

A notice of a new state queues one microtask, which draws the model of the current state. Once the bridge is
stopped, a draw it asked for before is not made, since another program may draw into the same root by then:

{@includeCode ../../bridges/snabbdom.ts#notice}

The bridge listens for the notices, draws as it is called, and returns what stops it:

{@includeCode ../../bridges/snabbdom.ts#handle}

The HTML Standard runs the microtasks after each task, and after each listener that the browser calls. So the new
states of one task are drawn once, and before the browser handles the next event. The run reads the model only when
the renderer draws, so a state the renderer never draws makes no model (see [running](./running.md#rules)).

### Handlers

Sending a message is a call, which returns once the message is applied. A handler of any renderer calls `dispatch`
itself, with a message the model holds, never one the view builds. The timer's view writes it
`on: { click: () => dispatch(model.more) }` in snabbdom's `on`. With React, it is the `onClick` prop:
`onClick={() => dispatch(model.more)}`.

With snabbdom, the `dispatch` a view is given is the bridge's own. It applies the message, then asks for a draw,
whether the message made a new state or not. A rejected write makes no new state, and its element must still be given
the program's value back:

{@includeCode ../../bridges/snabbdom.ts#dispatch}

So no handler of an event that the browser dispatches runs on a view older than the state: a key is typed over what
the program has put in the element. React renders a store's new states the same way, in a microtask. What a draw in a
microtask throws ends the run: the bridge gives it to `die`, since a microtask runs in no call of the run.

### A controlled element

A text field, a textarea, a select, a checkbox and a range are each drawn as a controlled element. The view gives the
element the value its model holds, and its handler writes what the element holds, through the input's dispatch (see
[inputs the user types into](./inputs-the-user-types-into.md)):

```ts
h("input", {
  props: { value: model.name },
  on: {
    input: (event) =>
      forwardTo(dispatch, "Name")({
        _tag: "Written",
        value: (event.target as HTMLInputElement).value
      })
  }
})
```

What the user types is applied in its own event. When the handler returns, the state holds it, or has rejected it.

**The second place of the renderer** is how the bridge reaches each element drawn with a controlled prop, after each
draw. snabbdom's props module sets `value` only where it differs from the vnode drawn before. So an element that the
user typed into, and whose write the state rejected, would keep what was typed. A module of the bridge records each
element drawn with a `value` or a `checked` in `props`. After each draw, the bridge gives each one its prop back, where
the element differs from it:

{@includeCode ../../bridges/snabbdom.ts#controlled}

The bridge to React has no module. React gives a controlled element the value it was drawn with itself, as React's
documentation says of a controlled input. Another renderer needs one of the two: a renderer that keeps a controlled
element as React does, or a way to reach the element after each draw.

So the element is never replaced, and keeps its focus, its caret and its selection, while the program changes what it
shows. This holds with a renderer that keeps each element in its place, as snabbdom and React do.

## Rules

What a bridge does, from the walkthrough above:

- **It draws the model of the current state, and says what else it draws.** The bridge to snabbdom draws each model
  whole, in a microtask after each new state. It draws nothing between two draws. The bridge to React draws the model
  as React renders. Between two draws, React draws what the application's components hold, and a part that the
  application suspends is shown later. What else the screen may show is in [view](./view.md#rules).
- **A handler calls `dispatch` itself.** Sending needs no services, and returns once the message is applied.
- **The message is one the model holds**, never one the view builds.
- **A controlled element is drawn with the value its model holds**, and its handler writes what the element holds:
  `{ _tag: 'Written', value }`.
- **After each draw, the element shows the value of its model.** A bridge whose renderer sets a value only where its
  own tree changed gives each controlled element its value back after each draw, where the element differs from it.
- **Each new state is drawn before the browser handles the next event**, as React renders a store. So is each message
  that a handler sends, whether it made a new state or not. Otherwise a handler runs on a view older than the state: a
  key is typed over a value that the program has replaced since, and the write stores the old value back.
- **The renderer keeps an element drawn in the same place from one draw to the next**, as snabbdom and React do.
  Otherwise the element is made anew, and loses its focus.

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
- draws a program that was started: `drawInto` with snabbdom; with React, `Host`, which starts a program and runs it
  while it is mounted, and `Draw`, which draws a program that the application starts itself;
- draws native controlled elements as its renderer's own documentation draws them: an input needs nothing else of the
  bridge.

[`counter`](../../examples/counter) and [`form`](../../examples/form) draw their programs with the bridge to snabbdom
and with the bridge to React, one under the other. Both bridges draw the `App` of one program, which React draws with
`Draw`. A bridge to React Native would be written the same way, but the repository has none. The sections above show
how to write a bridge for any renderer, from the bridge to snabbdom.

### What is left out

The package's bridges are minimal, and examples to start from. They show how a native element is connected to the
library. They handle the base case:

- **They run `dispatch` from any event of a native element.**
- **They draw any native controlled element**: a text field, a textarea, a select, a checkbox, a range.

They leave out:

- **A value the element changes by itself**, as when a text field strips the line breaks from what is written into
  it, or when a range narrows its bounds below its value. The element shows the value it made until the next write,
  which is stored over the model's value.
- **A form's reset**, by a reset button or `form.reset()`, with either bridge. Nothing is promised of it with React. A
  program may empty a field by leaving `''` in its place.
- **With React, a value that a script writes into an element past React's own setter**, and announces with an input
  event. React sends no `onChange` for it, so it is lost.
- **An event that the program's own code dispatches before a new state is drawn**, with either bridge: a call of
  `element.click()`, `dispatchEvent` or `focus()` in the task that made the new state. Its handler runs on the view of
  before that state, and a write from it is stored over what the program put there in that task.
- **Other widgets.** A widget of a component library with `value` and `onChange` props is drawn as a controlled
  element. Where connecting a widget is too complex, prefer a widget that the program draws: its press is a message,
  and its drag a subscription. The sliders of [`examples/volume`](../../examples/volume) are drawn this way.

Any other feature of a renderer is left to the bridge that needs it.

### Their tests

Both bridges are tested in a DOM, with [happy-dom](https://github.com/capricorn86/happy-dom):
[`bridges/snabbdom.test.ts`](../../bridges/snabbdom.test.ts) and
[`bridges/react.test.ts`](../../bridges/react.test.ts) run them.

The tests they share are written once, in
[`bridges/bridge.test_suite.ts`](../../bridges/bridge.test_suite.ts). They check:

- that a click reaches the program, and is drawn once its handler returns;
- that what the user types is stored, and that the element keeps it, with its focus, its caret and its selection;
- that a second click on a button in the same task is rejected while what the first started is under way;
- that the element of an input shows what the program puts in its place, and keeps its focus;
- that a key the state rejects is taken back, and the element shows the program's value again;
- that a value that `set` changes as it stores it is shown by the element at once, which keeps its focus;
- that a textarea, a select, a checkbox and a range store what the user gives them, and show it;
- that an element drawn in turn as an input and as a plain field shows the input only while it is one.

A bridge of your own can start from them. To run them on it:

- copy the file, with the examples whose programs it draws;
- have a test file register a DOM, as those two do;
- give `bridgeTests` a `Bridge`: your `drawInto`, the views of their scenarios drawn with your renderer, and
  `drawn`, which a test awaits after each act of the user, so that your bridge has drawn what the act made.

The file holds the screen refreshes and Effect's scheduler, with `holdFrames`, `refresh` and `settle`. So the test
says when a screen refresh comes, and when the run's fibers go on.

Beside the snabbdom bridge, `@fgaudo/effect-tea/snabbdom/testing` ([`bridges/snabbdom-testing.ts`][messages]) has
`messagesSentBy`. It finds what a view sends, without a DOM. Each listener gets an event whose `target` holds the
`value` and the `checked` that the view drew. So it finds the writes of controlled elements too, each with the value
its model holds. It is one way to check that a view draws what its model holds. The library does not ask it of any
bridge (see [testing](./testing.md)). The test of each example drawn with snabbdom uses `messagesSentBy`.

[messages]: ../../bridges/snabbdom-testing.ts
