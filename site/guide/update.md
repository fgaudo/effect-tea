---
title: Update
---

# Update

## In short

`update` takes a message, then the state, and returns the next step: `{ state, commands?, events? }`. When the message
makes no sense in that state, it returns `reject` instead. Commands say what should happen, and `runCommand` says how
(see [anatomy of a program](./anatomy-of-a-program.md)). Events are for a parent (see [composition](./composition.md)).

## An example

The duration of the timer's tutorial (`examples/timer/duration.ts`). It rejects `Less` at one minute:

{@includeCode ../../examples/timer/duration.ts#update}

## Rules

- **Keep it pure.** It returns commands instead of running effects.
- **It may be called at any time.** Never assume that it runs once per message, or only for a message that was sent.
  The testing tools call it twice on each message that a model holds, and also on other messages that a test lists.
- **Never mutate the state**, nested objects included. Return a new one.
- **A message that cannot arrive is a defect.** Its arrival is a bug: `update` throws `defect(reason)`, and the run dies
  (see [rejections and defects](./rejections-and-defects.md)).

How to shape the state and its messages is in [structuring a program](./structuring-a-program.md).

## Precisely

**The very same state.** When `update` returns the very same state it was given, the same object, the message draws no
new frame.
