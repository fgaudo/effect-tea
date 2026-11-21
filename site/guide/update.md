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

When the message makes no sense in that state, `update` returns `reject` instead. Commands say what should happen, and
`runCommand` says how (see [anatomy of a program](./anatomy-of-a-program.md)). Events are for a parent (see
[events and external messages](./events-and-external-messages.md)).

## An example

The duration of the timer's tutorial (`examples/timer/duration.ts`). Its `update` rejects `Less` at one minute:

{@includeCode ../../examples/timer/duration.ts#update}

## Rules

- **Keep it pure.** `update` returns commands instead of running effects.
- **It may be called at any time.** Never assume that `update` runs once per message. Never assume that it runs only
  for a message that was sent. The testing tools call `update` on each message that a model holds, and often a second
  time. They also call it on other messages that a test lists.
- **Never mutate the state**, nested objects included. Return a new state.
- **A message that cannot arrive is a defect.** If such a message arrives, that is a bug. `update` throws
  `defect(reason)`, and the run dies (see [rejections and defects](./rejections-and-defects.md)).

How to shape the state and its messages is in [structuring a program](./structuring-a-program.md).

## Do and don't

Each pair sums up a rule of this page. The rule itself is above.

| Do                                                               | Don't                                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Return commands, and let `runCommand` say how they happen.       | Run an effect inside `update`.                                                   |
| Return a new state, and copy each nested object that you change. | Change the state you were given, or an object inside it.                         |
| Expect `update` to be called at any time.                        | Assume that `update` runs once per message, or only for a message that was sent. |
| Throw `defect(reason)` for a message that cannot arrive.         | Return `reject` for a message that only a bug can bring.                         |

```ts
// Don't: the copy shares `items` with the state, so `push` mutates the state
const mutating: Update<State, Message> = (message) => (state) => {
  const next = { ...state }
  next.items.push(message.item)
  return { state: next }
}

// Do: return a new state, with a new array
const copying: Update<State, Message> = (message) => (state) => ({
  state: { ...state, items: [...state.items, message.item] }
})
```

## Precisely

**The very same state.** When `update` returns the very same state it was given, the same object, the message makes
no new model, and no renderer is told of it, whoever sent it.
