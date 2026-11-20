---
title: Events and external messages
---

# Events and external messages

## In short

This page shows how a parent and its children talk to each other. They talk only through two things: a child raises
events for its parent, and a parent sends external messages to a child. The page [composition](./composition.md) shows
how a parent declares its children.

- A child raises an event to ask its parent for something. The parent handles the event in `onEvent`.
- A parent sends a child an external message. The child answers it in its `external`, apart from `update`, in every
  state.
- When the parent takes a step of its own before a child's step, combine the two steps with `andThen` or `forEach`.

## An example

A back button closes the menu that the page has open. When no menu is open, the page asks its parent to leave it. The
parent sends `BackPressed` to the page as an external message, and leaves the page when the page raises its event:

```ts
// In the page: back always means something.
external: (_: BackPressed) => (state) =>
  state.menu._tag === 'Open'
    ? { state: { ...state, menu: { _tag: 'Closed' } } }
    : { state, events: [{ _tag: 'LeaveRequested' }] },

// In its parent: what the page asks for, in the same step.
update: (_: BackPressed, children) => children.Page.external({ _tag: 'BackPressed' }),
onEvent: { Page: () => (state) => ({ state: leavePage(state) }) },
```

## Rules

A parent and its children talk only through events and external messages.

### Events

- **A child raises an event** to ask its parent for something, such as leaving the page in the example above.
- **The parent handles an event in `onEvent`.** `onEvent` has one handler for each child that has events, so that no event
  goes unhandled. A handler is `(event, children) => (state) => step`. For children by id, the id comes before the
  event: `(id, event, children) => (state) => step`. For a handler that does not apply, see
  [an event keeps the timing of its cause](./rejections-and-defects.md#an-event-keeps-the-timing-of-its-cause).
- **An event to pass on.** Sometimes the parent has nothing to say about an event, and the parent's own parent handles
  it. Then the parent raises the event as its own:
  `onEvent: { Products: (event) => (state) => ({ state, events: [event] }) }`.

### External messages

- **A child answers its external messages in every state.** The child's type names its external messages, as
  `external`. The child has a function `external`, apart from `update`. It takes the message, then the state, and
  returns the next step, as `update` does.
  - It returns a step, never `reject`: the child answers in every state, with its state or with an event.
  - It is pure, as `update` is. It runs in its parent's `update` (see
    [what is left to you](./guarantees.md#what-is-left-to-you)).
  - An external message reaches only `external`. What the child's view, its commands and its subscriptions send are
    its messages, and they reach `update`. In [`list`](../../examples/list/stopwatch.ts), only the list halts a
    stopwatch.
  - A message that both the child's view and its parent send is named twice, in `message` and in `external`. Then its
    `update` and its `external` call one function.
- **A parent sends an external message** to a child with `children.<child>.external`, in the parent's own `update`,
  `external` and `onEvent`.
  - It takes only what the child's `external` takes. In the example above, `BackPressed` is one.
  - The parent decides when to send it. The child's type says that the child takes it.
- **A parent passes an external message on** to a child in its own `external`. A parent's `external` takes `children`,
  as its `update` does: `external: (message, children) => children.Page.external(message)`.

### Combining steps

`children.Page.external` returns the parent's step, as a function of the parent's state. To take a step of its own
before the child's step, a parent combines the two steps:

- **`andThen`**: `andThen(leave(state), children.Home.external({ _tag: 'ProductGone', at }))`. The result has:
  - the second step's state;
  - the commands of both steps, in order, and the events of both steps, in order. Both lists are always there.

  If you take a step's `.state` by hand to make the next step, you drop that step's commands and its events.
- **`forEach`** is the `andThen` of many: one step for each item, each step made from the state that the previous step
  left. The result has:
  - the last step's state;
  - the commands of every step, in order, and the events of every step, in order. Both lists are always there.

  For example, a message to every child by id:
  `forEach({ state }, state.rows, ({ id }) => children.Row.external(id, Cleared()))`.

`andThen` and `forEach` also have a form that takes the step last, for a chain written with Effect's `pipe`:
`pipe({ state }, andThen(leave), forEach(ids, clearRow))`.

### A child that must wait for its parent

Sometimes an operation of the parent, such as a payment, must stop the parent's children from acting.

First, ask whether they are children at all. A part whose controls the parent would lock from the parent's own state
is not a child (see [splitting a program](./structuring-a-program.md#splitting-a-program)). A part that has commands or
subscriptions of its own may still be a child.

If the parts are children, the operation is a fact that all the children see as one. The parent hands this fact down:

- The parent sends each child an external message when the operation starts, and another when it ends. For children
  by id, the parent sends them with `forEach`.
- The child keeps the fact in its state.
- While the fact holds, the child's `update` rejects what the child's view sends. The child's `update` still takes the
  answers of the child's commands.
- While the fact holds, the `get` of the child's inputs returns `None`, so their writes are rejected. The child's model
  shows no controls.

## Do and don't

Each pair sums up a rule of this page. The rule itself is above.

| Do                                                                                  | Don't                                                                     |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Combine the parent's step and a child's step with `andThen` or `forEach`.           | Take a step's `.state` by hand: you drop that step's commands and events. |
| Answer an external message in every state, with the child's state or with an event. | Answer an external message with `reject`: it does not compile.            |
| Pass an external message on in the parent's `external`, with the child's handle.    | Send a child a message that it keeps to itself: it does not compile.      |

```ts
// Don't: taking .state by hand drops the commands and the events of clear(state)
update: (_: Cleared, children) => (state) =>
  children.Watch.external({ _tag: 'Halted' })(clear(state).state),

// Do: combine the two steps with andThen
update: (_: Cleared, children) => (state) =>
  andThen(clear(state), children.Watch.external({ _tag: 'Halted' })),
```

## Precisely

- **`onEvent`** is required exactly when a child has events.
- **A parent that raises a child's event as its own** has an `Event` that includes the child's event, or this does not
  compile.
- **`external` is required exactly when the program names external messages**, as `runCommand` is when the program
  has commands. `make` refuses one when the program names none.
- **An external message never writes into an input.** Only what is drawn writes into an input. An external message
  reaches only `external`, so it is never routed to an input, whatever its `_tag`. To fill an input from its parent, a
  child takes an external message, such as `{ _tag: 'Filled', name }`, and its `external` writes the input's place.
- **An external message to a child that is not there is a defect.** It is a `CompositionDefect` that names the child,
  and names the message by its tags.
