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
sends the message with `Effect.runSync` (`bridges/snabbdom.ts`):

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
- **What the program draws comes from its frames.** The library gives a frame. The bridge reads the frame and draws
  it. Nothing else of the program is supported or advised. What the screen shows of the program comes from one of
  three places:
  - a frame, which the view draws from its model;
  - the platform: a hover, the focus or an animation that the platform keeps by itself;
  - the element of an input, which may show what the user typed after the frame was made (see
    [the element on screen](./inputs-the-user-types-into.md#the-element-on-screen)).
- **Each bridge says what it draws beside the frames.** The guarantees are of the program (see
  [guarantees](./guarantees.md)). What a bridge adds of the screen is its own promise:
  - The bridge to snabbdom draws frames, and nothing else. It keeps no state beside the program's state. What it keeps
    of the element of an input, by the library's rule, is the one exception (see
    [a text input](./writing-a-bridge.md#a-text-input)). It draws each frame whole and at once. No frame is drawn in
    parts, and no frame is postponed.
  - The bridge to React is hosted by a React application. The application's components may keep state of their own,
    and React draws it between frames. Each frame is committed at once. A part of a frame that the application
    suspends, under a Suspense boundary, is shown later, and its inputs settle as it is shown.
  - The program's testing tools see only the program. What the application's components draw is the application's
    to test.

How a bridge is written, and what the bridges of the examples do and leave out, is in
[writing a bridge](./writing-a-bridge.md).

## Do and don't

Each pair sums up a rule of this page. The rule itself is above.

| Do                                                            | Don't                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Draw the program from its frames alone.                       | Draw it from a copy of its state that a component keeps.           |
| Expect `update` to see the message after the handler returns. | Expect `update` to have seen the message when the handler returns. |

## Precisely

**The number a dispatch returns.** The number is the position of the message among the messages dispatched. The
numbers start from 1. They follow the order in which the run takes the messages.

**A frame's `seen`.** Each frame says in `seen` how many of the dispatched messages the run had taken when the frame
was made. So, when the `seen` of a frame is below the number of a message, the frame was made before the run took that
message.

**A frame for each dispatched message.** Each dispatched message that the run takes makes a frame, even one that
`update` rejects, or one that leaves the very same state. Such a frame holds the same state, with the new `seen`. So a
frame that has seen a message always comes, once the run has taken the message. A message of a command or a
subscription that makes no new state makes no frame.
