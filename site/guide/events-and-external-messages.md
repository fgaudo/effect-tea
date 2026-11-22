---
title: Events and external messages
---

# Events and external messages

## In short

This page shows how a parent and its children talk to each other. They talk only through three things: a child raises
events for its parent, a parent tells a child external messages, and a parent reads what a child declares as its
output. The page [composition](./composition.md) shows how a parent declares its children.

- A child raises an event to ask its parent for something. The parent handles the event in `onEvent`.
- A parent tells a child an external message, in the `tell` of a step. The child answers it in its `external`, apart
  from `update`, in every state.
- A child may declare an `output`, a value of its state. Its parent reads it, and reads nothing else of the child.
- When the parent takes a step of its own before another step, combine the two steps with `andThen`.

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

A parent and its children talk only through events, external messages and outputs.

### Events

- **A child raises an event** to ask its parent for something, such as leaving the page in the example above. It lists
  the event in the `events` of its step.
- **The parent handles an event in `onEvent`.** `onEvent` has one handler for each child that has events, so that no event
  goes unhandled. A handler is `(event, children) => (state) => step`. For children by id, the id comes before the
  event: `(id, event, children) => (state) => step`. For a handler that does not apply, see
  [an event keeps the timing of its cause](./rejections-and-defects.md#an-event-keeps-the-timing-of-its-cause).
  - The handler's step is a step of the parent's own: it may change the parent's state, run commands, raise events and
    tell children.
  - It is pure, as `update` is. It runs in its parent's `update` (see
    [what is left to you](./guarantees.md#what-is-left-to-you)).
  - Its `children` holds the children's outputs, as the child's step left them (see [outputs](#outputs)).
  - Each event of a step is handled to its end before the next one.
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
- **A parent sends an external message** to a child by listing it in the `tell` of a step: of its own `update`,
  `external` or `onEvent`. An item is `{ _tag: <child>, message }`, and `{ _tag: <child>, id, message }` for children
  by id.
  - It takes only what the child's `external` takes. In the example above, `BackPressed` is one.
  - The parent decides when to send it. The child's type says that the child takes it.
  - **What a step tells arrives after the step.** Each item is given to the child once the step's state is taken, and
    the children that this state lists are there. So a step that lists a child anew can tell it in the same step: the
    child is started first.
  - The children are told in order, each to its end: the events of one are handled before the next one is told.
  - An item is for the instance that is there once the step is taken. A child that an earlier item of the same `tell`
    dropped or started again, through what its parent did with an event, is told nothing. This is no defect.
- **A parent passes an external message on** to a child in its own `external`:
  `external: (message) => (state) => ({ state, tell: [{ _tag: 'Page', message }] })`.

### Outputs

- **A child may declare an `output`**: a value of its state that its parent reads. It names the output's type with its
  other types, `program<{ state: State; output: Output }>()`, and gives `output: (state) => Output` to `make`.
  - An event says that something happened. An output says what holds in a state, such as whether a stopwatch runs.
  - `output` is pure, as `makeModel` is.
  - An output is not a model. A model is for the view. A parent reads no child's model outside its `makeModel`.
- **A parent reads it as `children.Row.output(id)`**, in its `update`, `external`, `onEvent`, `makeModel` and own
  `output`. It is read as a model is: a value for a child that is always there and for a listed id, and an `Option` for
  a child alone that may not be there.
  - In `update` and `external`, the outputs are of the children as they were before the step.
  - In a handler of `onEvent`, the outputs are of the children as the child's step that raised the event left them.
  - A parent's own `output` may read its children's outputs. Its own parent reads it as any other.
- **Read a condition of a child, do not copy it.** A parent that keeps a copy of what a child's state says must change
  the copy at each change of the child. This is derived data in a state (see
  [state and messages](./structuring-a-program.md#state-and-messages)). [`list`](../../examples/list/list.ts) offers
  "Stop all" only while a stopwatch runs, and tells only those that run:

```ts
case "StopAllClicked": {
  const running = Arr.filter(state.ids, (id) => children.Stopwatch.output(id).running)
  return Arr.isReadonlyArrayEmpty(running)
    ? reject
    : { state, tell: Arr.map(running, (id) => ({ _tag: "Stopwatch", id, message: { _tag: "Halted" } })) }
}
```

- **A value that the user types into a child** is read through the child's output only where the child's own rules
  use it. Then the output says what the child concludes from it, such as a valid count, not the text (see
  [splitting a program](./structuring-a-program.md#splitting-a-program)).
- **A program that has no parent** has an output that no tool reads. A test reads it as `program.output(state)`, as it
  reads `program.makeModel(state)` (see [testing](./testing.md)).

### Combining steps

A step of the parent's own may follow another step, as one step. To take a step of its own before another, a parent
combines the two steps:

- **`andThen`**: `andThen(leave(state), (state) => ({ state, tell: [{ _tag: 'Home', message: ProductGone({ at }) }] }))`.
  The result has:
  - the second step's state;
  - the commands of both steps, in order, and the events of both steps, in order. Both lists are always there;
  - what both steps tell, in order. The result has a `tell` only where a step has one.

  If you take a step's `.state` by hand to make the next step, you drop that step's commands, its events and what it
  tells.
- **To tell many children**, list one item for each in one `tell`. For example, a message to every child by id:
  `{ state, tell: Arr.map(state.ids, (id) => ({ _tag: 'Row', id, message: Cleared() })) }`.

`andThen` also has a form that takes the step last, for a chain written with Effect's `pipe`:
`pipe({ state }, andThen(leave), andThen(clearRows))`.

### A child that must wait for its parent

Sometimes an operation of the parent, such as a payment, must stop the parent's children from acting.

First, ask whether they are children at all. A part whose controls the parent would lock from the parent's own state
is not a child (see [splitting a program](./structuring-a-program.md#splitting-a-program)). A part that has commands or
subscriptions of its own may still be a child.

If the parts are children, the operation is a fact that all the children see as one. The parent hands this fact down:

- The parent tells each child an external message when the operation starts, and another when it ends. For children
  by id, one `tell` lists an item for each id.
- The child keeps the fact in its state.
- While the fact holds, the child's `update` rejects what the child's view sends. The child's `update` still takes the
  answers of the child's commands.
- While the fact holds, the `get` of the child's inputs returns `None`, so their writes are rejected. The child's model
  shows no controls.

## Do and don't

Each pair sums up a rule of this page. The rule itself is above.

| Do                                                                                  | Don't                                                                             |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Combine the parent's step and another step with `andThen`.                          | Take a step's `.state` by hand: you drop that step's commands, events and `tell`. |
| Answer an external message in every state, with the child's state or with an event. | Answer an external message with `reject`: it does not compile.                    |
| Pass an external message on in the parent's `external`, in the `tell` of its step.  | Tell a child a message that it keeps to itself: it does not compile.              |
| Read what holds in a child from its `output`.                                       | Copy it into the parent's state at each change: it is derived data in a state.    |

```ts
// Don't: taking .state by hand drops the commands and the events of clear(state)
update: (_: Cleared) => (state) => ({ state: clear(state).state, tell: [{ _tag: 'Watch', message: Halted() }] }),

// Do: combine the two steps with andThen
update: (_: Cleared) => (state) =>
  andThen(clear(state), (state) => ({ state, tell: [{ _tag: 'Watch', message: Halted() }] })),
```

## Precisely

- **`onEvent`** is required exactly when a child has events.
- **A parent that raises a child's event as its own** has an `Event` that includes the child's event, or this does not
  compile.
- **`external` is required exactly when the program names external messages**, as `runCommand` is when the program
  has commands. `make` refuses one when the program names none.
- **`output` is required exactly when the program names an output**, and `make` refuses one when the program names
  none. A program without children has no outputs to read: its `update`, `external` and `output` take no
  `children`.
- **The order inside a step.** A handler of `onEvent` reads the outputs after the child's step, and after the handlers
  of the child's earlier events and what they told. This is described, not promised.
- **An external message never writes into an input.** Only what is drawn writes into an input. An external message
  reaches only `external`, so it is never routed to an input, whatever its `_tag`. To fill an input from its parent, a
  child takes an external message, such as `{ _tag: 'Filled', name }`, and its `external` writes the input's place.
- **An external message to a child that is not there is a defect.** A child that is not there once the step is taken
  is the step's own mistake. It is a `CompositionDefect` that names the child, and names the message by its tags.
