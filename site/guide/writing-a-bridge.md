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

`start(program)` gives a `Started`, `{ app, run }`: `app` is an `App`, and `run` runs the program's effects (see
[running](./running.md#rules)). A bridge is plain code over the `App`, `{ model, subscribe, dispatch, die }`, and
returns what stops it. With snabbdom, `drawInto(root, { app, view })` is that code. Whoever started the program calls
what it returns, or does not: the run does not stop a bridge. With the bridge to React, `Host` starts the program and
its run, and gives React the `App`. A program that the application starts itself hands its `App` to `Draw`, as
`<Draw app={app} view={view} />`.

When `drawInto` draws, and what it does with `root`, is in [the package's bridges](#the-packages-bridges). Each draw
calls the view with the model and the dispatch, unless the model is the very one it drew last, and draws what the view
returns. Then it gives each controlled element its value back (see [a controlled element](#a-controlled-element)):

{@includeCode ../../bridges/snabbdom.ts#draw}

**The first place of the renderer** is the line that draws: `patch(tree, view(model, dispatch))`. There, snabbdom
patches the tree drawn before into the one the view returned. The first tree is a child of `root`, which the bridge puts
there as it is called. snabbdom replaces that child with the view's top element. The bridge to React reads the model
there instead, with `useSyncExternalStore(app.subscribe, app.model)` in `Draw`, and React calls the view as it renders.
When the line returns, snabbdom has drawn the model whole. React draws it as React schedules it, but for a part of it
that the application suspends. Between two draws, the bridge to snabbdom draws nothing, and React draws what the
application's components hold. What else the screen may show is in [view](./view.md#rules).

The rest is the bridge's own code. What it does with a model drawn last, with a message sent while a patch runs, and
with a view or a `makeModel` that throws is in [the package's bridges](#the-packages-bridges). A message sent during a
patch waits for a microtask of its own, since no microtask runs while the patch is on the stack. A draw in a microtask
runs in no call of the run, so the bridge gives what it threw to `die`.

A notice of a new state queues one microtask, which draws the model of the current state. Once the bridge is
stopped, a draw it asked for before is not made, since another program may draw into the same root by then:

{@includeCode ../../bridges/snabbdom.ts#notice}

The bridge listens for the notices, draws as it is called, and returns what stops it:

{@includeCode ../../bridges/snabbdom.ts#handle}

The HTML Standard runs the microtasks after each task, and after each listener that the browser calls. So what one of
them sends until it returns is drawn once, and before the browser handles the next event. A handler that awaits returns
at its first `await`: what it sends after that is drawn apart. The run reads the model only when
the renderer draws, so a state the renderer never draws makes no model (see [running](./running.md#rules)).

### Handlers

Sending a message is a call, which returns once the message is applied. A handler of any renderer calls `dispatch`
itself, with a message the model holds, never one the view builds. The timer's view writes it
`on: { click: () => dispatch(model.more) }` in snabbdom's `on`. With React, it is the `onClick` prop:
`onClick={() => dispatch(model.more)}`.

With snabbdom, the `dispatch` a view is given is the bridge's own. It applies the message, then asks for a draw,
whether the message made a new state or not. A rejected message makes no new state, and its element must still be given
the program's value back:

{@includeCode ../../bridges/snabbdom.ts#dispatch}

So no handler of an event that the browser dispatches runs on a view older than the state: a key is typed over what
the program has put in the element. React renders a store's new states the same way, in a microtask. What a draw in a
microtask throws ends the run: the bridge gives it to `die`, since a microtask runs in no call of the run.

### A controlled element

A text field, a textarea, a select, a checkbox and a range are each drawn as a controlled element. The view gives the
element the value its model holds, and its handler sends the message that its model holds for it, filled with what the
element holds (see [what an element gives](./what-an-element-gives.md)):

```ts
h("input", {
  props: { value: model.name },
  on: {
    input: (event) => dispatch({ ...model.typed, value: (event.target as HTMLInputElement).value })
  }
})
```

What the user types is applied in its own event. When the handler returns, the state holds it, or has rejected it.

**The second place of the renderer** is how the bridge reaches each element drawn with a controlled prop, after each
draw. snabbdom's props module sets `value` only where it differs from the vnode drawn before. So an element that the
user typed into, and whose message the state rejected, would keep what was typed. A module of the bridge records each
element drawn with a `value` or a `checked` in `props`. After each draw, the bridge gives each one its prop back, where
the element differs from it:

{@includeCode ../../bridges/snabbdom.ts#controlled}

The bridge to React has no module. React gives a controlled element the value it was drawn with itself, as React's
documentation says of a controlled input. Another renderer needs one of the two: a renderer that keeps a controlled
element as React does, or a way to reach the element after each draw.

So the element is never replaced, and keeps its focus, its caret and its selection, while the program changes what it
shows. This holds with a renderer that keeps each element in its place, as snabbdom and React do.

## Rules

### What a bridge does

Every bridge does what follows. [An example](#an-example) shows how the package's bridge to snabbdom does it.

- **It draws the model of the current state, and says what else it draws.** The bridge to snabbdom draws each model
  whole, in a microtask after each new state. It draws nothing between two draws. The bridge to React draws the model
  as React renders. Between two draws, React draws what the application's components hold, and a part that the
  application suspends is shown later, with the model of the state current then. What else the screen may show is in
  [view](./view.md#rules).
- **A handler calls `dispatch` itself.** Sending needs no services, and returns once the message is applied.
- **The message is one the model holds**, never one the view builds.
- **A controlled element is drawn with the value its model holds**, and its handler sends the message that its model
  holds for it, filled with what the element holds.
- **After each draw, the element shows the value of its model.** A bridge whose renderer sets a value only where its
  own tree changed gives each controlled element its value back after each draw, where the element differs from it.
- **Each new state is drawn before the browser handles the next event**, as React renders a store. So is each message
  that a handler sends, whether it made a new state or not. Otherwise a handler runs on a view older than the state: a
  key is typed over a value that the program has replaced since, and its message carries the old value back.
  A renderer that draws after the next event, as one whose elements live in another thread, breaks this rule: a value
  that the program leaves in a field may then be replaced by a key typed before its draw. A lock by the shape of the
  state still rejects such a key, as it rejects any message that does not apply (see
  [what an element gives](./what-an-element-gives.md#rules)).
- **The renderer keeps an element drawn in the same place from one draw to the next**, as snabbdom and React do.
  Otherwise the element is made anew, and loses its focus.

### The package's bridges

The library draws nothing. A bridge to a renderer does the three things listed in [in short](#in-short). The package
has two bridges, each an entry of its own:

- `@fgaudo/effect-tea/snabbdom` ([`bridges/snabbdom.ts`](../../bridges/snabbdom.ts)), the bridge to snabbdom, with
  `messagesSentBy` in `@fgaudo/effect-tea/snabbdom/testing`;
- `@fgaudo/effect-tea/react` ([`bridges/react.ts`](../../bridges/react.ts)), the bridge to React.

A bridge needs its renderer, which you install beside the package: `snabbdom` 3.6.4 or a newer 3.x, or `react` 19.3.1
or a newer 19.x. The bridge to React imports `react` alone, and no renderer of React. What it says of a controlled
element is checked with `react-dom`. The package installs no renderer, and the rest of it needs none.

Each bridge is small, and a start for a bridge of your own: for another renderer, or for what they leave out. Each
bridge:

- names the type of its views, `View<Model, Message>`;
- draws a program that was started: `drawInto` with snabbdom; with React, `Host`, which starts a program and runs it
  while it is mounted, and `Draw`, which draws a program that the application starts itself;
- runs `dispatch` from any event of a native element;
- draws any native controlled element, a text field, a textarea, a select, a checkbox or a range, as its renderer's
  own documentation draws it: such an element needs nothing else of the bridge.

snabbdom's props module sets the props a view gives, and never removes one. So a view of the bridge to snabbdom gives
a prop it changes in every state: `disabled: false` where a button is enabled, as the view of
[`form`](../../examples/form/view-snabbdom.ts) does. Without it, a button once disabled stays disabled.

The bridge to snabbdom draws a node's `class`, `props`, `attrs`, `dataset`, `style` and `on`, with snabbdom's modules
of each. Unlike a prop, a class, an attribute or a data entry that a later vnode leaves out is removed.

[`counter`](../../examples/counter) and [`form`](../../examples/form) draw their programs with the bridge to snabbdom
and with the bridge to React, one under the other. Both bridges draw the `App` of one program, which React draws with
`Draw`. A bridge to React Native would be written the same way, but the repository has none. [An example](#an-example)
shows how to write a bridge for any renderer, from the bridge to snabbdom.

**`drawInto(root, { app, view })`, the bridge to snabbdom,** draws the model of the current state, and returns what
stops it:

- It draws as it is called, then in a microtask after each new state, wherever its message comes from, and after each
  message that a handler of the view sends, whether it made a new state or not. What a task, or a listener that the
  browser calls, sends until it returns is drawn once, before the browser handles the next event.
- As it is called, it empties `root`. Then `root` holds the view's top element and nothing else. `root` keeps its
  place in the page, and it may have no parent.
- It draws each model whole. A model that is the very one it drew last is not drawn again.
- After each draw, it gives an element drawn with a `value` or a `checked` in `props` that prop back, where the element
  differs from it. The element is not replaced, and keeps its focus, its caret and its selection.
- What a listener sends while a patch runs, as a `blur` that the patch makes, is drawn after that patch, in a microtask
  of its own.
- A view or a `makeModel` that throws as it is drawn ends the run, at the first draw too: the run dies of it, in
  `'render'`, and the bridge draws nothing more. A draw that comes once the run has ended throws it out of its
  microtask, as an error of the page.
- Once it is stopped, a draw that it asked for before is not made. The run does not stop it: whoever started the
  program does, or does not. Whether a handler of what it drew still sends its message once it is stopped is
  unspecified.

**`Host` and `Draw`, the bridge to React,** give React the `App`: `Host` starts the program and its run, and `Draw`
draws a program that the application starts itself, as `<Draw app={app} view={view} />`. They read the model with
`useSyncExternalStore`, and React draws it as React schedules it, but for a part that the application suspends.

- React gives a controlled element the value it was drawn with.
- A view that throws is an error of the application, for its error boundaries: an error boundary above `Host`
  unmounts it, and the run is interrupted.
- A `makeModel` that throws is the run's: under `Host`, React draws the model it drew last until the run has ended,
  and `Host` then throws the defect to the boundary, once. `Draw` alone throws it as it renders, and the run that the
  application started dies of it too.

**With the bridge to React, the run lives as long as the effect that starts it.** That is the effect of `Host`. `Host`
starts the program as it first renders, and starts its run after its effect. It takes the `program`, the `options` and
the `fork` of that first render, and reads no later ones, also when it starts the program again. A new `key` mounts
another `Host`, which takes those of its own first render.

- React ends the effect, and `Host` interrupts the run, when it unmounts `Host`, and when `<Activity>` hides it. The
  next effect starts the program again from `init`. So do a new `key` and a remount. The first run may have started the
  commands of `init` before it is interrupted.
- Under StrictMode, which runs every effect twice in development with a cleanup between them, whether the commands of
  `init` start once or twice is unspecified.
- For a state that outlives a component, start the program yourself, and draw it with `Draw`.

**With the bridge to React, `Host` and `Draw` draw the first model on a server.** On a server, no effect runs: `Host`
starts the program and draws its first model, and nothing of `init` starts. Nothing is promised of hydration.

**With the bridge to React, a run that dies is thrown to the nearest error boundary.** `Host` throws it as it renders,
while its effect runs. One that `Host` has not thrown when the effect ends, as `Host` unmounts or `<Activity>` hides
it, or that ends after, is given to `reportError` instead, and is not thrown again. Where the platform has no
`reportError`, as React Native, the bridge reports it as React reports an error itself. A `makeModel` that throws is
thrown this way too, once: until the run has ended, `Host` draws the model it drew last. A first model that throws
reaches the boundary as `Host` first renders, and the run never starts. What is thrown is `Cause.squash` of what the
run ended with, which keeps one defect. To see the whole cause, wrap the run in the `fork` that you give `Host`: what
the `fork` handles is not thrown or reported again.

### messagesSentBy

Beside the snabbdom bridge, `@fgaudo/effect-tea/snabbdom/testing` ([`bridges/snabbdom-testing.ts`][messages]) has
`messagesSentBy`. It finds what a view sends, without a DOM. Each listener gets an event whose `target` and
`currentTarget` are its element. The element holds the `value` and the `checked` that the view drew. So it finds what
controlled elements send too, each filled with the value its model holds.

What else a handler reads, the test gives in a third argument, `reports`. It is a function of the listener's node and
of the name of its event, and returns the fields of the element and of the event:

```ts
const reports = (node: VNode, type: string) =>
  node.sel === "div.track" && type === "pointerdown"
    ? { element: { getBoundingClientRect: () => ({ left, width }) }, event: { clientX } }
    : {}
```

- The fields of `element` are laid over what the view drew. A field may be a method that only reads, as
  `getBoundingClientRect`.
- The fields of `event` are the event's own, as `clientX`.
- A handler that reads a field that neither the view nor `reports` gives gets `undefined`.

The test draws one record of the values, and gives it to its reader and to `reports` alike (see
[the reader](./testing.md#the-reader)). `messagesSentBy` is one way to check that a view draws what its model holds.
The library does not ask it of any bridge (see [testing](./testing.md)). The test of each example drawn with snabbdom
uses `messagesSentBy`.

## What is left out

The package's bridges are minimal, and examples to start from. They show how a native element is connected to the
library, and handle the base case that [the package's bridges](#the-packages-bridges) promises. They promise nothing
of what follows, and say why:

- **A value the element changes by itself**, as when a text field strips the line breaks from the value it is given,
  or when a range narrows its bounds below its value. The element shows the value it made until the user types again,
  and `update` stores what the element sends then.
- **A form's reset**, by a reset button or `form.reset()`, with either bridge. A program may empty a field by leaving
  `''` in its state.
- **With React, a value that a script writes into an element past React's own setter**, and announces with an input
  event. React sends no `onChange` for it, so it is lost.
- **An event that the program's own code dispatches before a new state is drawn**, with either bridge: a call of
  `element.click()`, `dispatchEvent` or `focus()` in the task that made the new state. Its handler runs on the view of
  before that state. With snabbdom, the message it sends carries what the element held, and `update` stores it over what
  the program put there in that task. React sends no `onChange` for an input event while the element holds the value
  that React saw last, so the program's value stays, and is drawn.
- **Other widgets.** A widget of a component library with `value` and `onChange` props is drawn as a controlled
  element. Where connecting a widget is too complex, prefer a widget that the program draws: its press is a message,
  and its drag a subscription. The sliders of [`examples/volume`](../../examples/volume) are drawn this way.

Any other feature of a renderer is left to the bridge that needs it.

## Their tests

Both bridges are tested in a DOM, with [happy-dom](https://github.com/capricorn86/happy-dom):
[`bridges/snabbdom.test.ts`](../../bridges/snabbdom.test.ts) and
[`bridges/react.test.ts`](../../bridges/react.test.ts) run them. The same tests run in Chromium, Firefox and WebKit
too, with [`bridges/browser.test.ts`](../../bridges/browser.test.ts), which checks what only a real browser shows: a
field that keeps the focus while a save spans several screen refreshes, a text composed by an IME (in Chromium
alone), and an event that the program's own code dispatches before a new state is drawn.

The tests they share are written once, in
[`bridges/bridge.test_suite.ts`](../../bridges/bridge.test_suite.ts). They check:

- that a click reaches the program, and is drawn once its handler returns;
- that what the user types is stored, and that the element keeps it, with its focus, its caret and its selection;
- that a second click on a button in the same task is rejected while what the first started is under way;
- that a controlled element shows what the program puts in its state, and keeps its focus;
- that a key the state rejects is taken back, and the element shows the program's value again;
- that a value that `update` stores in another form is shown by the element at once, which keeps its focus;
- that a textarea, a select, a checkbox and a range store what the user gives them, and show it;
- that an element drawn in turn as a field to type into and as a plain field sends what is typed only while it is the
  first.

A bridge of your own can start from them. To run them on it:

- copy the file, with the examples whose programs it draws;
- have a test file register a DOM, as those two do;
- give `bridgeTests` a `Bridge`: your `drawInto`, the views of their scenarios drawn with your renderer, and
  `drawn`, which a test awaits after each act of the user, so that your bridge has drawn what the act made.

The file holds the screen refreshes and Effect's scheduler, with `holdFrames`, `refresh` and `settle`. So the test
says when a screen refresh comes, for a bridge that draws in one (neither of the package's does), and when the run's
fibers go on.

[messages]: ../../bridges/snabbdom-testing.ts
