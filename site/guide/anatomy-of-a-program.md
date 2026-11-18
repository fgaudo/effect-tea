---
title: Anatomy of a program
---

# Anatomy of a program

## In short

This page shows the pieces of a program and how they connect. The other pages of the guide describe each piece in
detail, so start here.

A program is a plain object, made with `program`. It has up to five pieces:

- `init` says where the program starts.
- `update` says how each message changes the state.
- `makeModel` says what the view draws.
- `runCommand` is there when the program has commands.
- `subscriptions` is there when the program listens to something.

The view is not part of the program.

The pieces connect in a loop. Each message that `update` accepts makes the next state. A message that `update` rejects
leaves the state as it was. What the user types takes another path. The view writes it into an input declared in
`make`, and the library stores it without calling `update` (see
[inputs the user types into](./inputs-the-user-types-into.md)).

```mermaid
flowchart LR
  init -->|first state| state([state])
  init -->|commands| runCommand
  update -->|next state, unless it rejects| state
  update -->|commands| runCommand
  runCommand -->|at most one message| update
  state --> makeModel
  makeModel -->|model| view
  view -->|message| update
  view -->|Written over the model's value| input[an input]
  input -->|stored if its place holds that value| state
  state --> subscriptions[subscriptions, by key]
  subscriptions -->|messages| update
```

## An example

The first program of the timer's tutorial is a duration in minutes (`examples/timer/duration.ts`). Here are its state
and its messages:

{@includeCode ../../examples/timer/duration.ts#state}

Its `update` is on the page [update](./update.md). Here is the program itself:

{@includeCode ../../examples/timer/duration.ts#program}

## Rules

| Piece           | What it does                                                                               | Needed               |
| --------------- | ------------------------------------------------------------------------------------------ | -------------------- |
| `init`          | the first state and the commands to start with, or a function of its flags that makes them | always               |
| `update`        | `(message) => (state) =>` the next state, commands and events, or `reject`                 | when it has messages |
| `makeModel`     | `(state) =>` what the view draws, with the messages it sends                               | always               |
| `runCommand`    | how each command happens, as an Effect                                                     | when it has commands |
| `subscriptions` | what it listens to in each state                                                           | when it listens      |

- **Its types are named first, then it is made**: `program<{ state: State; message: Message }>().make({ … })`. Besides
  `state`, the types may name these:

  | Name       | What it names                              |
  | ---------- | ------------------------------------------ |
  | `message`  | the program's messages                     |
  | `command`  | the program's commands                     |
  | `event`    | the events the program raises              |
  | `external` | which of its messages a parent may send it |
  | `flags`    | the program's flags                        |
  | `model`    | the program's model                        |

  A type that the program does not name is a type that the program does not have. So:

  - A program that names no messages has no `update`.
  - A program that raises an event it did not name does not compile.

  A model that is named is checked. A model that is not named is inferred from `makeModel`. The services are never
  named. They are inferred from `runCommand` and `subscriptions`.

- **Its type lists the types it is made of.** A program's type is `Program<{ state; model; message }>`. It also lists
  `command`, `commandServices`, `subscriptionServices`, `event`, `external` and `flags` when the program has them.
  `make` returns this type, and a function that takes a program names this type.
- **Its state is always an object**: `{ count }` rather than `count`. So any program can become a child as it is (see
  [composition](./composition.md)).
- **The view is not part of it.** `run` hands your renderer a stream of **frames**, each `{ model, dispatch, seen }`.
  The renderer draws the frames however it likes (see [view](./view.md)).
- **A program that cannot start the same way every time declares `flags`**, as in Elm. For example, a page that shows
  the product it was opened for declares flags.

## Precisely

**What does not compile.** A program does not compile in these cases:

- Its state is a number or a string.
- Its state is a type without fields, such as `{}`. Such a type holds a number too. A state without fields is an
  `object`.
- Its `external` messages are not among its `message`s.

**`runCommand` is required exactly when the program has commands.** So every command has a `runCommand` that
interprets it.

**A test makes a model as `run` does.** `run` makes the model of a frame with `program.makeModel(state)`. A test can
call `program.makeModel` the same way, on any state.

**What a program listens to.** `subscriptionsOf(program)(state)` is what the program listens to in `state`, by key.
It is what `run` reconciles. For a program without `subscriptions`, it is empty. A parent lists the subscriptions of
each child under `[<child>, key]`. For children by id, the parent lists them under `[<child>, id, key]` (see
[composition](./composition.md)).

**A program with flags.** Its `init` is a function of the flags: `init: ({ id }) => ({ state, commands })`. Whoever
starts the program gives the flags:

- A parent gives them to its child (see [composition](./composition.md)).
- `run` gives them to the root (see [running](./running.md)).
