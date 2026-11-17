---
title: Glossary
---

# Glossary

## In short

The words the guide uses, each in a line, with the page that defines it. This page is a summary: the page it links
rules where a line here says less.

## A program and its pieces

| Word        | What it is                                                                                               | Defined in                                        |
| ----------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Program** | A plain object: `init`, `update` and `makeModel`, with `runCommand` and `subscriptions` when it has them | [anatomy of a program](./anatomy-of-a-program.md) |
| **State**   | What the program knows. Always an object, replaced and never mutated                                     | [anatomy of a program](./anatomy-of-a-program.md) |
| **Message** | What `update` is given: a click the model holds, a command's answer, what a subscription sends           | [update](./update.md)                             |
| **Step**    | What `update` returns for a message it accepts: `{ state, commands?, events? }`                          | [update](./update.md)                             |
| **Flags**   | What a program starts from, when it cannot start the same way every time                                 | [anatomy of a program](./anatomy-of-a-program.md) |

## What the user sees

| Word         | What it is                                                                                          | Defined in                                                    |
| ------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Model**    | What `makeModel(state)` makes for the view: what it shows, and the messages its controls send       | [model](./model.md)                                           |
| **View**     | A function `(model, dispatch) => Node` that draws the model. It is not part of the program          | [view](./view.md)                                             |
| **Dispatch** | What a view sends a message with. It returns an `Effect<number>`, the message's number              | [view](./view.md)                                             |
| **Frame**    | What `run` hands the renderer: `{ model, dispatch, seen }`                                          | [view](./view.md)                                             |
| **Input**    | A place in the state for a value the user gives. The view writes over it, and the library stores it | [inputs the user types into](./inputs-the-user-types-into.md) |
| **Bridge**   | What connects the library to a renderer: it draws frames, sends messages, and settles inputs        | [writing a bridge](./writing-a-bridge.md)                     |

## Effects

| Word             | What it is                                                                                       | Defined in                          |
| ---------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **Command**      | Data that says what `update` decided. `runCommand` alone turns it into an Effect                 | [commands](./commands.md)           |
| **Execution**    | The Effect a command becomes: it cannot fail, and may produce one message back                   | [commands](./commands.md)           |
| **Subscription** | Input or work the program keeps while its state wants it: a `Channel` of messages, listed by key | [subscriptions](./subscriptions.md) |
| **Run**          | `run(program, render, options?)`: the program started, with a stream of frames for the renderer  | [running](./running.md)             |

## Messages that do not fit

| Word       | What it is                                                                                               | Defined in                                            |
| ---------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Reject** | What `update` returns for a message that may arrive, and does not apply in the state. The run ignores it | [rejections and defects](./rejections-and-defects.md) |
| **Defect** | What `update` throws, with `defect(reason)`, on a message that cannot arrive: a bug. The run dies        | [rejections and defects](./rejections-and-defects.md) |

## A program made of programs

| Word                 | What it is                                                                              | Defined in                                                   |
| -------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Composition**      | How a parent declares its children and its inputs, and where each lives in its state    | [composition](./composition.md)                              |
| **Child**            | Any program, declared by a parent. A child by id is one of many, as the rows of a list  | [composition](./composition.md)                              |
| **Event**            | What a child raises to ask its parent for something. The parent handles it in `onEvent` | [composition](./composition.md#events-and-external-messages) |
| **External message** | A message of a child's that its type lets a parent send it                              | [composition](./composition.md#events-and-external-messages) |

## In a test

| Word           | What it is                                                                     | Defined in                                 |
| -------------- | ------------------------------------------------------------------------------ | ------------------------------------------ |
| **Reader**     | A function of the test's own, from a model to the messages the model holds     | [testing](./testing.md#the-reader)         |
| **Candidates** | The messages a user could ask for, which a test lists for `dispatchViolations` | [testing](./testing.md#the-tools)        |
| **Withheld**   | The candidates a model leaves out on purpose                                   | [testing](./testing.md#the-tools)        |
