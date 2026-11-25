---
title: View
---

# View

## In short

A view turns the model into what the user sees. This page shows how a view draws the model and sends messages back
to the program.

A view is a function `(model, dispatch) => Node`. It gets the model, and returns a `Node` of the renderer's tree. The
view's controls send the program's messages with `dispatch`. The `App` of the program gives the renderer the model of
the current state, and tells it of each new state. The renderer draws the model.

## An example

The first view of the timer's tutorial, drawn with snabbdom (`examples/timer/view.ts`):

{@includeCode ../../examples/timer/view.ts#duration}

`View` is the snabbdom bridge's type for such a function. A handler of the view calls `dispatch` itself, with a message
the model holds: `on: { click: () => dispatch(model.more) }`.

## Rules

- **`dispatch` is a plain function.** A handler of any renderer calls `dispatch(message)`. Effect code calls it in an
  `Effect.sync`: `Effect.sync(() => dispatch(message))`.
- **Sending applies the message.** When a handler returns, `update` has seen the handler's message, and the model is
  the new one. What the message starts, its commands and its subscriptions, runs later, in the run. The program runs
  on the stack of the handler, so a slow `update` holds it up (see
  [what is left to you](./guarantees.md#what-is-left-to-you)).
- **What the program draws comes from its model.** Nothing else of the program is supported. What the screen shows of
  the program comes from the model, which the view draws, or from the platform: a hover, the focus or an animation
  that the platform keeps by itself. For the length of its own event, a text field shows what the user typed into it
  (see [what an element gives](./what-an-element-gives.md)).
  - A part of the page outside the bridge's `root`, such as the page's title, comes from the model too. Plain code over
    the handle that `start` gives draws it, beside the bridge: it reads `app.model()` once, then again each time
    `app.subscribe` tells it of a new state (see [running](./running.md)).
- **Each bridge says what it draws beside the model.** The guarantees are of the program, and what a bridge adds of
  the screen is its own promise (see [what a bridge does](./writing-a-bridge.md#what-a-bridge-does)). The bridge to
  snabbdom draws the model and nothing else. With the bridge to React, the application's components may keep state of
  their own, which React draws beside it, and which the program's testing tools do not see.

How a bridge is written is in [writing a bridge](./writing-a-bridge.md).
