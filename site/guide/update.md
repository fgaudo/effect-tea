---
title: Update
---

# Update

`update` takes a message, then the state, and returns `{ state, commands?, events? }`, or `reject` when the
message makes no sense in that state. Events are for a parent (see [composition](./composition.md)). On a message
that cannot arrive, whose arrival is a bug, it throws `defect(reason)`, and the run dies (see
[rejections and defects](./rejections-and-defects.md)).

- **Keep it pure.** It returns commands instead of running effects.
- **Never mutate the state**, nested objects included: return a new one. A message that returns the very same
  state draws no new frame.

How to shape the state and its messages is in [structuring a program](./structuring-a-program.md).
