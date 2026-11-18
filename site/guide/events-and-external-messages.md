---
title: Events and external messages
---

# Events and external messages

## In short

This page shows how a parent and its children talk to each other. They talk only through two things: a child raises
events for its parent, and a parent sends external messages to a child. The page [composition](./composition.md) shows
how a parent declares its children.

- A child raises an event to ask its parent for something. The parent handles the event in `onEvent`.
- A parent sends a child an external message. It is one of the messages that the child's type declares as `external`.
  The child answers it in every state.
- When the parent takes a step of its own before a child's step, combine the two steps with `andThen` or `forEach`.

## An example

A back button closes the menu that the page has open. When no menu is open, the page asks its parent to leave it. The
parent sends `BackPressed` to the page as an external message, and leaves the page when the page raises its event:

```ts
// In the page: back always means something.
case 'BackPressed':
  return state.menu._tag === 'Open'
    ? { state: { ...state, menu: { _tag: 'Closed' } } }
    : { state, events: [{ _tag: 'LeaveRequested' }] }

// In its parent: what the page asks for, in the same step.
update: (_: BackPressed, children) => children.Page.update({ _tag: 'BackPressed' }),
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

- **A parent sends an external message** to a child with `children.<child>.update`, in the parent's own `update` and
  `onEvent`.
  - An external message is one of the messages that the child's type declares as `external`. In the example above,
    `BackPressed` is one.
  - The parent decides when to send it. The child's type says that the child takes it.
  - In the child's type, `external` names some of the child's messages, for example
    `Data.TaggedEnum.Value<Message, 'Halted'>` in [`list`](../../examples/list/stopwatch.ts).
- **The child answers in every state**, with its state or with an event, never with `reject`.

### Combining steps

`children.Page.update` returns the parent's step, as a function of the parent's state. To take a step of its own
before the child's step, a parent combines the two steps:

- **`andThen`**: `andThen(leave(state), children.Home.update({ _tag: 'ProductGone', at }))`. The result has:
  - the second step's state;
  - the commands of both steps, in order, and the events of both steps, in order. Both lists are always there.

  If you take a step's `.state` by hand to make the next step, you drop that step's commands and its events.
- **`forEach`** is the `andThen` of many: one step for each item, each step made from the state that the previous step
  left. The result has:
  - the last step's state;
  - the commands of every step, in order, and the events of every step, in order. Both lists are always there.

  For example, a message to every child by id:
  `forEach({ state }, state.rows, ({ id }) => children.Row.update(id, Cleared()))`.

`andThen` and `forEach` also have a form that takes the step last, for a chain written with Effect's `pipe`:
`pipe({ state }, andThen(leave), forEach(ids, clear))`.

### A child that must wait for its parent

Sometimes an operation of the parent, such as a payment, must stop the parent's children from acting.

First, ask whether they are children at all. A part whose controls the parent would lock from its state is not a child
(see [splitting a program](./structuring-a-program.md#splitting-a-program)). A part that has commands or subscriptions
of its own may still be a child.

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
| Answer an external message in every state, with the child's state or with an event. | Answer an external message with `reject`: the rejection is a defect.      |
| Pass on only the external messages of a child, named in the parent's `external`.    | Pass on a message that the child keeps to itself: it does not compile.    |

```ts
// Don't: taking .state by hand drops the commands and the events of clear(state)
update: (_: Cleared, children) => (state) =>
  children.Watch.update({ _tag: 'Halted' })(clear(state).state),

// Do: combine the two steps with andThen
update: (_: Cleared, children) => (state) =>
  andThen(clear(state), children.Watch.update({ _tag: 'Halted' })),
```

## Precisely

- **`onEvent`** is required exactly when a child has events.
- **A parent that raises a child's event as its own** has an `Event` that includes the child's event, or this does not
  compile.
- **A parent that passes on an external message of a child** names that message in its own `external`, wrapped as the
  parent receives it: `{ _tag: 'Page', message: … }`. The message is one of the child's external messages, or this does
  not compile. A message that the child keeps to itself does not pass through its parent either.
- **A rejection of an external message is a defect.** It is a `CompositionDefect` that names the child, and names the
  message by its tags. Sending an external message to a child that is not there is such a defect too.
