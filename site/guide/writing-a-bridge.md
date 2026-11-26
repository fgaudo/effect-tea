---
title: Writing a bridge
---

# Writing a bridge

## In short

This page shows how to write a bridge for your renderer, and what the package's two bridges do. The library draws
nothing: a bridge connects the library to a renderer. A bridge does three things:

- it draws the model of the current state, as it starts and once it is told of a new state;
- it lets the handlers of the view send messages, with `dispatch`;
- it draws each controlled element, such as a text field, with the value its model holds.

## An example

Most of a bridge's code is the same whatever the renderer. Only two places are the renderer's own: where it draws, and
where it lets the bridge reach an element. The code below is the package's bridge to snabbdom
([`bridges/snabbdom.ts`](../../bridges/snabbdom.ts)), a minimal example to start from. You do not need to know
snabbdom to read it. Each of the two places is named where it comes, with what the bridge to React
([`bridges/react.ts`](../../bridges/react.ts)) does there instead.

### The handle

A bridge is plain code over the `App` that `start` gives, `{ model, subscribe, dispatch, die }` (see
[running](./running.md#rules)), and returns what stops it. With snabbdom, `drawInto(root, { app, view })` is that code.
Each draw calls the view with the model and the dispatch, unless the model is the very one it drew last, draws what the
view returns, and gives each controlled element its value back (see [a controlled element](#a-controlled-element)):

{@includeCode ../../bridges/snabbdom.ts#draw}

**The first place of the renderer** is the line that draws: `patch(tree, view(model, dispatch))`. There, snabbdom
patches the tree drawn before into the one the view returned. The bridge to React reads the model there instead, with
`useSyncExternalStore(app.subscribe, app.model)` in `Draw`, and React calls the view as it renders.

A notice of a new state queues one microtask, which draws the model of the current state. A draw in a microtask runs
in no call of the run, so the bridge gives what it threw to `die`. Once the bridge is stopped, a draw it asked for
before is not made, since another program may draw into the same root by then:

{@includeCode ../../bridges/snabbdom.ts#notice}

The bridge listens for the notices, draws as it is called, and returns what stops it:

{@includeCode ../../bridges/snabbdom.ts#handle}

The HTML Standard runs the microtasks after each task, and after each listener that the browser calls. So what one of
them sends until it returns is drawn once, and before the browser handles the next event. A handler that awaits returns
at its first `await`: what it sends after that is drawn apart.

### Handlers

A handler of any renderer calls `dispatch` itself, with a message the model holds:
`on: { click: () => dispatch(model.more) }` in snabbdom's `on`, `onClick={() => dispatch(model.more)}` with React.
With snabbdom, the `dispatch` a view is given is the bridge's own. It applies the message, then asks for a draw,
whether the message made a new state or not, since the element of a rejected message must still be given the
program's value back:

{@includeCode ../../bridges/snabbdom.ts#dispatch}

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

**The second place of the renderer** is how the bridge reaches each element drawn with a controlled prop, after each
draw. snabbdom's props module sets `value` only where it differs from the vnode drawn before. So an element that the
user typed into, and whose message the state rejected, would keep what was typed. A module of the bridge records each
element drawn with a `value` or a `checked` in `props`. After each draw, the bridge gives each one its prop back, where
the element differs from it:

{@includeCode ../../bridges/snabbdom.ts#controlled}

The bridge to React has no module: React gives a controlled element the value it was drawn with itself. Another
renderer needs one of the two: a renderer that keeps a controlled element as React does, or a way to reach the element
after each draw.

## Rules

### What a bridge does

Every bridge does what follows. [An example](#an-example) shows how the package's bridge to snabbdom does it.

- **It draws the model of the current state, and says what else it draws.** What else the screen may show is in
  [view](./view.md#rules).
- **A handler calls `dispatch` itself**, with a message the model holds, never one the view builds. Sending needs no
  services, and returns once the message is applied.
- **A controlled element is drawn with the value its model holds**, and its handler sends the message that its model
  holds for it, filled with what the element holds.
- **After each draw, the element shows the value of its model.** A bridge whose renderer sets a value only where its
  own tree changed gives each controlled element its value back after each draw, where the element differs from it.
  React Native keeps it late (see [what is left out](#what-is-left-out)).
- **Each new state is drawn before the browser handles the next event**, as React renders a store. So is each message
  that a handler sends, whether it made a new state or not. Otherwise a handler runs on a view older than the state: a
  key is typed over a value that the program has replaced since, and its message carries the old value back. A
  renderer whose elements live in another thread breaks this rule, as React Native does. There, lock by the shape of
  the state: it rejects such a key, as it rejects any message that does not apply (see
  [what an element gives](./what-an-element-gives.md#rules)).
- **The renderer keeps an element drawn in the same place from one draw to the next**, as snabbdom and React do.
  Otherwise the element is made anew, and loses its focus, its caret and its selection.

### The package's bridges

The package has two bridges, each an entry of its own, and each small, a start for a bridge of your own:

- `@fgaudo/effect-tea/snabbdom`, with `drawInto`, and `messagesSentBy` in `@fgaudo/effect-tea/snabbdom/testing`,
  which your bridge need not have;
- `@fgaudo/effect-tea/react`, with `Host`, which starts a program and runs it while it is mounted, and `Draw`, which
  draws a program that the application starts itself, as `<Draw app={app} view={view} />`.

A bridge needs its renderer, which you install beside the package: `snabbdom` 3.6.4 or a newer 3.x, or `react` 19.3.0
or a newer 19.x. The bridge to React imports `react` alone, and no renderer of React: it draws with React DOM, and with
React Native, a `TextInput` as React Native's documentation draws a controlled one. Each bridge names the type of its
views, `View<Model, Message>`, runs `dispatch` from any event of a native element, and draws any native controlled
element as its renderer's own documentation draws it.

[`counter`](../../examples/counter) and [`form`](../../examples/form) draw their programs with both bridges, one under
the other, and [`react-native`](../../examples/react-native) draws them on React Native.

**snabbdom never removes a prop.** So a view of the bridge to snabbdom gives a prop it changes in every state:
`disabled: false` where a button is enabled, as the view of [`form`](../../examples/form/view-snabbdom.ts) does.
Without it, a button once disabled stays disabled. A class, an attribute or a data entry that a later vnode leaves out
is removed.

**With the bridge to React, the run lives as long as the effect that starts it.** That is the effect of `Host`. React
ends it, and `Host` interrupts the run, when it unmounts `Host`, and when `<Activity>` hides it. The next effect starts
the program again from `init`. For a state that outlives a component, start the program yourself, and draw it with
`Draw`.

**With the bridge to React, a run that dies is thrown to the nearest error boundary**, as `Host` renders. One that
`Host` can no longer throw, as it unmounts, is reported instead: with `reportError` where there is one, as in a
browser. What is thrown is `Cause.squash` of what the run ended with, which keeps one defect. To see the whole cause,
wrap the run in the `fork` that you give `Host`.

**With the bridge to React, `Host` and `Draw` draw the first model on a server**, where no effect runs, and nothing of
`init` starts. `hydrateRoot` keeps the elements the server drew, where the client draws the same model. `Host` makes
its first model as the server did, from `init` and the flags of its first render, and forks its run once React has
hydrated it. With `Draw`, the program you started must still have the state the server drew.

**With the bridge to React, a new state is drawn at once, in a transition too.** React renders a store's change in no
transition, even inside `startTransition`.

## What is left out

The package's bridges promise nothing of what follows:

- **A value the element changes by itself**, as when a text field strips the line breaks from the value it is given,
  or when a range narrows its bounds below its value. The element shows the value it made until the user types again,
  and `update` stores what the element sends then.
- **With React Native, what a `TextInput` shows until its native view takes the value of its model.** A key that the
  state rejects may show until then.
- **A form's reset**, by a reset button or `form.reset()`. A program may empty a field by leaving `''` in its state.
- **With React, a value typed into what a server drew, before React hydrates it.** React gives the element the value
  of the first model, and sends no `onChange`.
- **With React, a value that a script writes into a text field with `element.value = …`**, and announces with an
  input event. React's setter on the element takes it for a value React gave, and sends no `onChange`, so it is lost.
- **An event that the program's own code dispatches before a new state is drawn**: a call of `element.click()`,
  `dispatchEvent` or `focus()` in the task that made the new state. Its handler runs on the view of before that state.
  With snabbdom, the message it sends carries what the element held, and `update` stores it over what the program put
  there in that task. With React, the program's value stays, and is drawn.
- **Other widgets.** A widget of a component library with `value` and `onChange` props is drawn as a controlled
  element. Where connecting a widget is too complex, prefer a widget that the program draws: its press is a message,
  and its drag a subscription. The sliders of [`examples/volume`](../../examples/volume) are drawn this way.

Any other feature of a renderer is left to the bridge that needs it.

## Their tests

Both bridges are tested in a DOM, with [happy-dom](https://github.com/capricorn86/happy-dom), and in Chromium, Firefox
and WebKit, by the tests that they share, written once in
[`bridges/bridge.test_suite.ts`](../../bridges/bridge.test_suite.ts). They check the rules of
[what a bridge does](#what-a-bridge-does): a click drawn once its handler returns, a value typed and kept with its
focus, a key that the state rejects taken back, and each controlled element.

A bridge of your own can start from them. To run them on it:

- copy the file, with the examples whose programs it draws;
- have a test file register a DOM, and hold its screen refreshes with `holdFrames`, which the tests run as they
  paint, as [`bridges/snabbdom.test.ts`](../../bridges/snabbdom.test.ts) does;
- give `bridgeTests` a `Bridge`: your `drawInto`, the views of their scenarios drawn with your renderer, and
  `drawn`, which a test awaits after each act of the user, so that your bridge has drawn what the act made.

The bridge to React is tested on React Native too, under jest, with the views of
[`examples/react-native`](../../examples/react-native), by `bun run test:react-native`.
