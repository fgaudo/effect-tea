---
title: Events and external messages
---

# Events and external messages

## In short

This page shows how a parent and its children talk to each other. They talk only through three things: a child raises
events for its parent, a parent tells a child external messages, and a parent reads what a child declares as its
output. The page [composition](./composition.md) shows how a parent declares its children.

- A child raises an event to ask its parent for something. The parent handles the event in `onEvent`.
- A parent tells a child an external message, in the `tell` of a step, or of the child's declaration. The child
  answers it in its `external`, apart from `update`, in every state.
- A child may declare an `output`, a value of its state. Its parent reads it, and reads nothing else of the child.
- To make two steps one, combine them with `andThen`.

## An example

A back button closes the menu that the page has open. When no menu is open, the page asks its parent to leave it. The
parent tells `BackPressed` to the page as an external message, and leaves the page when the page raises its event:

```ts
// In the page: back always means something.
external: (_: BackPressed) => (state) =>
  state.menu._tag === 'Open'
    ? { state: { ...state, menu: { _tag: 'Closed' } } }
    : { state, events: [{ _tag: 'LeaveRequested' }] },

// In its parent: tell the page, and do what the page asks for, in the same step.
update: (_: BackPressed) => (state) => ({ state, tell: [{ _tag: 'Page', message: { _tag: 'BackPressed' } }] }),
onEvent: { Page: () => (state) => ({ state: leavePage(state) }) },
```

## Rules

A parent and its children talk only through events, external messages and outputs, and the parent's `makeModel` is
given its children's models.

### Events

- **A child raises an event** to ask its parent for something, such as leaving the page in the example above. It lists
  the event in the `events` of its step.
- **The parent handles an event in `onEvent`**, which has one handler for each child that has events, so that no event
  goes unhandled. A handler is `(event, children) => (state) => step`, and `(id, event, children) => (state) => step`
  for children by id.
  - Its step is a step of the parent's own: it may change the parent's state, run commands, raise events and tell
    children. For a handler that does not apply, see
    [an event keeps the timing of its cause](./rejections-and-defects.md#an-event-keeps-the-timing-of-its-cause).
  - The events of a step are handled in order, each to its end.
- **An event to pass on.** A parent that has nothing to say about an event raises it as its own, for its own parent to
  handle: `onEvent: { Products: (event) => (state) => ({ state, events: [event] }) }`. Its `Event` must include the
  child's event, or this does not compile.

### External messages

- **A child answers its external messages in every state**, with its state or with an event. Its type names them, as
  `external`, and its function `external`, apart from `update`, takes the message, then the state, and returns the
  next step.
  - An external message reaches only `external`. What the child's view, its commands and its subscriptions send are
    its messages, and they reach `update`. In [`list`](../../examples/list/stopwatch.ts), only the list halts a
    stopwatch.
  - A message that both the child's view and its parent send is named in both, `message` and `external`. Its `update`
    and its `external` can then call one function.
- **A parent sends an external message** to a child by listing it in the `tell` of a step: of its own `update`,
  `external` or `onEvent`. An item is `{ _tag: <child>, message }`, and `{ _tag: <child>, id, message }` for children
  by id.
  - **What a step tells arrives after the step.** Each item is given to the child once the step's state is taken, and
    the children that this state lists are there. So a step that lists a child anew can tell it in the same step: the
    child is started first.
  - The children are told in order, each to its end: the events of one are handled before the next one is told.
- **A parent passes an external message on** to a child in its own `external`:
  `external: (message) => (state) => ({ state, tell: [{ _tag: 'Page', message }] })`.

### Outputs

- **A child may declare an `output`**: a value of its state that its parent reads. It names the output's type with its
  other types, `program<{ state: State; output: Output }>()`, and gives `output: (state) => Output` to `make`. An
  event says that something happened. An output says what holds in a state, such as whether a stopwatch runs.
- **A parent reads it as `children.Row.output(id)`**, as it reads a model: a value for a child that is always there and
  for a listed id, and an `Option` for a child alone that may not be there. It reads it in its `update`, `external`,
  `onEvent`, `makeModel`, own `output` and own `subscriptions`.
  - In `update` and `external`, the outputs are of the children as they were before the step.
  - In a handler of `onEvent`, the outputs are of the children as the child's step that raised the event left them,
    and as the handlers of that step's earlier events, with what they told, left them.

### Combining steps

A program combines two steps as one with `andThen`, such as a parent's own step and one that tells a child:
`andThen(leave(state), (state) => ({ state, tell: [{ _tag: 'Home', message: ProductGone({ at }) }] }))`. The result
has the second step's state, and the commands, the events and what is told of both steps, in order.

**Do not take a step's `.state` by hand to make the next step**: you drop that step's commands, its events and what it
tells.

```ts
// Don't: taking .state by hand drops the commands and the events of clear(state)
update: (_: Cleared) => (state) => ({ state: clear(state).state, tell: [{ _tag: 'Watch', message: Halted() }] }),

// Do: combine the two steps with andThen
update: (_: Cleared) => (state) =>
  andThen(clear(state), (state) => ({ state, tell: [{ _tag: 'Watch', message: Halted() }] })),
```

To tell many children, list one item for each in one `tell`, as a message to every child by id:
`{ state, tell: Arr.map(state.ids, (id) => ({ _tag: 'Row', id, message: Cleared() })) }`.

## Advice

- **Read a condition of a child, do not copy it.** A parent that keeps a copy of what a child's state says must change
  the copy at each change of the child: it is derived data in a state (see
  [state and messages](./structuring-a-program.md#state-and-messages)). [`list`](../../examples/list/halting.ts) offers
  "Stop all" only while a stopwatch runs, and tells only those that run:

  ```ts
  const running = runningOf(state, children)
  return Arr.isReadonlyArrayEmpty(running)
    ? reject
    : { state, tell: Arr.map(running, (id) => ({ _tag: "Stopwatch", id, message: { _tag: "Halted" } })) }
  ```

  It does not hold for a value fixed at a moment, such as what the child said when the user confirmed: that is a fact
  of the parent's own.

### A child that must wait for its parent

Sometimes an operation of the parent, such as a payment, must stop the parent's children from acting.

First, ask whether they are children at all. A part whose controls the parent would lock from the parent's own state
is most often not a child, but the parent's own state and messages (see
[splitting a program](./structuring-a-program.md#splitting-a-program)). A part that has commands or subscriptions of
its own may still be a child.

If the parts are children, the operation is a fact that all the children see as one. The parent declares it with
`tell`, which gives an external message of the child from the parent's state. Each child is told it as it starts,
and again only where the state gives another value (see [what you can rely on](./guarantees.md#what-you-can-rely-on)).
[`cart`](../../examples/cart/cart.ts) locks its rows from the payment on:

```ts
Row: childById(Row.row, {
  ids: (state) => state.ids,
  tell: (state) => ({ _tag: "LockChanged", locked: isLocked(state) })
})
```

- The child keeps the fact in its state, from its `external`.
- While the fact holds, the child's `update` rejects what the child's view sends. The child's `update` still takes the
  answers of the child's commands.
- While the fact holds, the child's model shows no controls.

A fact of each child alone, such as which row is chosen, is told by hand, since `tell` takes no id: in the `tell` of
each step that changes it, and of each step that starts a child while it holds. A first step lists no `tell`, so a
child of the first state is given the fact by its flags.
