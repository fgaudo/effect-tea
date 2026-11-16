---
title: View
---

# View

## In short

A view draws the model. It is a function `(model, dispatch) => Node`: it gets the model, and returns a `Node` of the
renderer's tree. Its controls send the program's messages with `dispatch`. The run gives the renderer frames, and the
renderer draws them.

## An example

The first view of the timer's tutorial, drawn with snabbdom (`examples/timer/view.ts`):

{@includeCode ../../examples/timer/view.ts#duration}

`View` is the snabbdom bridge's type for such a function, and `onClick` its handler for a click. The handler sends
the message with `Effect.runSync` (`examples/snabbdom.ts`):

```ts
const send = <Message>(dispatch: Dispatch<Message>, message: Message): number => Effect.runSync(dispatch(message))
```

## Rules

- **`dispatch` takes the program's messages.** Sending one returns an `Effect<number>`. That effect needs no services
  and completes synchronously.
- **A handler may run it either way.** A renderer whose handlers are plain callbacks, like snabbdom's, runs it at once
  with `Effect.runSync(dispatch(message))`. It may also run it with a runtime of its own. Either is right.
- **Sending only hands the message to the run.** The run handles the message in its own fiber, with its own services,
  on the scheduler it started with. So a handler returns before `update` has seen its message.
- **The renderer draws frames, and nothing else.** The library gives a frame, and the renderer reads it and draws it.
  Nothing else is supported or advised. What the screen shows comes from frames alone: the renderer keeps no state
  beside the program's.
- **A frame is drawn whole and at once.** No frame is drawn in parts, and no frame is put off.

How a bridge is written, and what the examples' bridges do and leave out, is in
[writing a bridge](./writing-a-bridge.md).

## Precisely

**The number a dispatch returns.** It is the message's number among those dispatched. The numbers start from 1. They
follow the order in which the run takes the messages.

**A frame's `seen`.** Each frame says in `seen` how many of the dispatched messages the run had taken when the frame's
state was made. So a frame whose `seen` is below a message's number was made before the run took that message.
