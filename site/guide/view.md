---
title: View
---

# View

## In short

A view turns the model into what the user sees. This page shows how a view draws the model and sends messages back
to the program.

A view is a function `(model, dispatch) => Node`. It gets the model, and returns a `Node` of the renderer's tree. The
view's controls send the program's messages with `dispatch`. The run gives the renderer the model of the current state,
and tells it of each new state. The renderer draws the model.

## An example

The first view of the timer's tutorial, drawn with snabbdom (`examples/timer/view.ts`):

{@includeCode ../../examples/timer/view.ts#duration}

`View` is the snabbdom bridge's type for such a function. A handler of the view calls `dispatch` itself, with a message
the model holds: `on: { click: () => dispatch(model.more) }`.

## Rules

- **`dispatch` takes the program's messages.** Sending a message is a call that returns nothing. It needs no services.
- **A handler calls it as it is.** A handler of any renderer, a plain callback, calls `dispatch(message)`. Effect code
  calls it in an `Effect.sync`: `Effect.sync(() => dispatch(message))`.
- **Sending applies the message.** When a handler returns, `update` has seen the handler's message, and the model is
  the new one. What the message starts, its commands and its subscriptions, runs later, in the run's own fiber, with
  the run's services.
  - A message sent while another is being applied is applied right after it, before the outer call returns. Two kinds
    of code send one then: a renderer's listener, which the run tells of a new state, and code that a function of the
    program wakes. Such a call may return before its message is applied.
  - The program runs on the stack of whoever sends the message: a slow `update` holds the handler that sent it (see
    [what is left to you](./guarantees.md#what-is-left-to-you)).
- **What the program draws comes from its model.** The library gives the model of the current state. The bridge reads
  it and draws it. Nothing else of the program is supported or advised. What the screen shows of the program comes
  from one of two places:
  - the model, which the view draws;
  - the platform: a hover, the focus or an animation that the platform keeps by itself.

  An element with a value of its own, such as a text field, shows the value of its model. For the length of its own
  event, it shows what the user typed into it (see
  [inputs the user types into](./inputs-the-user-types-into.md)).
- **Each bridge says what it draws beside the model.** The guarantees are of the program (see
  [guarantees](./guarantees.md)). What a bridge adds of the screen is its own promise:
  - The bridge to snabbdom draws the model, and nothing else. It keeps no state beside the program's state: what it
    keeps of a controlled element is the value its model gave it (see
    [a controlled element](./writing-a-bridge.md#a-controlled-element)). It draws each model whole, never in parts. It
    draws a message that a handler of the view sends at once, before the handler returns. It draws a new state that
    comes from anywhere else at the next animation frame.
  - The bridge to React is hosted by a React application. The application's components may keep state of their own,
    and React draws it beside the model. React draws the model of the current state when it renders, as React
    schedules it. A part that the application suspends, under a Suspense boundary, is shown later, with the model of
    the state current then.
  - The program's testing tools see only the program. What the application's components draw is the application's
    to test.

How a bridge is written, and what the bridges of the examples do and leave out, is in
[writing a bridge](./writing-a-bridge.md).

## Do and don't

Each pair sums up a rule of this page. The rule itself is above.

| Do                                                                 | Don't                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Draw the program from its model alone.                             | Draw it from a copy of its state that a component keeps.           |
| Expect `update` to have seen the message when the handler returns. | Expect `update` to see the message only after the handler returns. |
