---
title: View
---

# View

A view is `(model, dispatch) => Node`, and `dispatch` takes the program's messages. Sending returns an
`Effect<number>` that needs no services and completes synchronously. It only hands the message to the run, which
handles it in its own fiber, with its own services: a handler returns before `update` has seen its message. A
renderer whose handlers are plain callbacks, like snabbdom's, runs it at once with
`Effect.runSync(dispatch(message))`, or with a runtime of its own: either is right. The number is the message's
among those dispatched, from 1, in the order the run takes them, and each frame says in `seen` how many of
them the run had taken when its state was made: a frame whose `seen` is below a message's number was made before
the run took it.

The library gives a frame, and the renderer reads it and draws it; nothing else is supported or advised. A frame is
drawn whole and at once, and what the screen shows comes from frames alone: no state kept by the renderer beside the
program's, and no frame drawn in parts or put off.

How a bridge is written, and what the examples' bridges do and leave out, is in
[writing a bridge](./writing-a-bridge.md).
