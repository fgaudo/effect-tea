---
title: View
---

# View

## In short

A view turns the model into what the user sees. This page shows how a view draws the model and sends messages back
to the program.

A view is a function `(model, dispatch) => Node`. It gets the model, and returns a `Node` of the renderer's tree. The
view's controls send the program's messages with `dispatch`. The run gives the renderer frames, and the renderer draws
the frames.

## An example

The first view of the timer's tutorial, drawn with snabbdom (`examples/timer/view.ts`):

{@includeCode ../../examples/timer/view.ts#duration}

`View` is the snabbdom bridge's type for such a function. `onClick` is the bridge's handler for a click. The handler
sends the message with `Effect.runSync` (`examples/bridges/snabbdom.ts`):

```ts
const send = <Message>(dispatch: Dispatch<Message>, message: Message): number => Effect.runSync(dispatch(message))
```

## Rules

- **`dispatch` takes the program's messages.** Sending a message returns an `Effect<number>`. This effect needs no
  services, and it completes synchronously.
- **A handler may run it either way.** A renderer whose handlers are plain callbacks, like snabbdom's, runs the effect
  at once with `Effect.runSync(dispatch(message))`. A handler may also run the effect with a runtime of its own. Both
  ways are right.
- **Sending only hands the message to the run.** The run handles the message in its own fiber, with its own services,
  on the scheduler that the run started with. So a handler returns before `update` has seen the handler's message.
- **The renderer draws frames, and nothing else.** The library gives a frame. The renderer reads the frame and draws
  it. Nothing else is supported or advised. What the screen shows comes from frames alone. The renderer keeps no state
  beside the program's state.
- **A frame is drawn whole and at once.** No frame is drawn in parts, and no frame is postponed.

How a bridge is written, and what the bridges of the examples do and leave out, is in
[writing a bridge](./writing-a-bridge.md).

## Do and don't

Each pair sums up a rule of this page. The rule itself is above.

| Do                                                            | Don't                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Draw each frame whole and at once.                            | Draw a frame in parts, or postpone a frame.                        |
| Draw what the screen shows from frames alone.                 | Keep a state in a component, beside the program's state.           |
| Expect `update` to see the message after the handler returns. | Expect `update` to have seen the message when the handler returns. |

## Precisely

**The number a dispatch returns.** The number is the position of the message among the messages dispatched. The
numbers start from 1. They follow the order in which the run takes the messages.

**A frame's `seen`.** Each frame says in `seen` how many of the dispatched messages the run had taken when the frame's
state was made. So, when the `seen` of a frame is below the number of a message, the frame was made before the run
took that message.
