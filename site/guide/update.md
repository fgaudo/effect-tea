---
title: Update
---

# Update

## In short

`update` decides what each message does to your program. This page shows what `update` returns, and the rules it
keeps.

`update` takes a message, then the state, and returns the next step: `{ state, commands?, events? }`.

| Field      | What it holds                   | Needed   |
| ---------- | ------------------------------- | -------- |
| `state`    | the next state                  | always   |
| `commands` | the commands that should happen | optional |
| `events`   | the events for a parent         | optional |

When the message makes no sense in that state, `update` returns `reject` instead (see
[rejections and defects](./rejections-and-defects.md)). Commands say what should happen, and `runCommand` says how
(see [commands](./commands.md)). Events are for a parent (see
[events and external messages](./events-and-external-messages.md)). How to shape the state and its messages is
advice, in [structuring a program](./structuring-a-program.md).

## An example

The duration of the timer's tutorial (`examples/timer/duration.ts`). Its `update` rejects `Less` at one minute:

{@includeCode ../../examples/timer/duration.ts#update}

## Rules

- **Keep it pure.** `update` returns commands instead of running effects.
- **It may be called at any time.** Never assume that `update` runs once per message, or only for a message that was
  sent. The testing tools call it on each message that a model holds, often twice, and on others that a test lists.
- **Never mutate the state**, nested objects included. Return a new state. A copy of the state shares its nested
  objects, so copy each one that you change:

  ```ts
  // Mutates the state: the copy shares `items` with it, and `push` changes both
  const mutating: Update<State, Message> = (message) => (state) => {
    const next = { ...state }
    next.items.push(message.item)
    return { state: next }
  }

  // A new state, with a new array
  const copying: Update<State, Message> = (message) => (state) => ({
    state: { ...state, items: [...state.items, message.item] }
  })
  ```
- **A message that cannot arrive is a defect.** `update` throws `defect(reason)`, and the run dies (see
  [rejections and defects](./rejections-and-defects.md)).
