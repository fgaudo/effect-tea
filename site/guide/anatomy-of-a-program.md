---
title: Anatomy of a program
---

# Anatomy of a program

A program is a plain object with up to five pieces:

| Piece           | What it does                                                                               | Needed               |
| --------------- | ------------------------------------------------------------------------------------------ | -------------------- |
| `init`          | the first state and the commands to start with, or a function of its flags that makes them | always               |
| `update`        | `(message) => (state) =>` the next state, commands and events, or `reject`                 | always               |
| `makeModel`     | `(state) =>` what the view draws, with the messages it sends                               | always               |
| `runCommand`    | how each command happens, as an Effect                                                     | when it has commands |
| `subscriptions` | what it listens to in each state                                                           | when it listens      |

- **Its type names its types:** `Program<{ state; model; message }>`, plus `command`, `services`, `event`,
  `external` and `flags` when it has them. Its `external` messages are among its `message`s, or it does not compile.
- **Its state is always an object**, `{ count }` rather than `count`, so that any program can become a child as
  it is (see [composition](./composition.md)). A program whose state is a number or a string does not compile.
- **The view is not part of it.** `run` hands your renderer a stream of **frames** (`{ model, dispatch, seen }`) to
  draw however it likes (see [view](./view.md)).
- **A program that cannot start the same way every time declares `flags`**, as in Elm, e.g. a page that shows
  the product it was opened for. Its `init` is then a function of them, `init: ({ id }) => ({ state, commands })`.
  Whoever starts the program gives them: a parent to its child (see [composition](./composition.md)), and `run` to
  the root (see [running](./running.md)).
