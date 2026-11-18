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
| **Program** | A plain object: `init`, `update`, `makeModel`, `subscriptions`, and `runCommand` when it has commands    | [anatomy of a program](./anatomy-of-a-program.md) |
| **State**   | What the program knows. Always an object, replaced and never mutated                                     | [anatomy of a program](./anatomy-of-a-program.md) |
| **Message** | What `update` is given: a click the model holds, a command's answer, what a subscription sends           | [update](./update.md)                             |
| **Step**    | What `update` returns for a message it accepts: `{ state, commands?, events? }`                          | [update](./update.md)                             |
| **Flags**   | What a program starts from, when it cannot start the same way every time                                 | [anatomy of a program](./anatomy-of-a-program.md) |

## What the user sees

| Word                    | What it is                                                                                                                        | Defined in                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Model**               | What `makeModel(state)` makes for the view: what it shows, and the messages its controls send                                     | [model](./model.md)                                                               |
| **View**                | A function `(model, dispatch) => Node` that draws the model. It is not part of the program                                        | [view](./view.md)                                                                 |
| **Dispatch**            | What a view sends a message with. It returns an `Effect<number>`, the message's number                                            | [view](./view.md)                                                                 |
| **Frame**               | What `run` hands the renderer: `{ model, dispatch, seen }`                                                                        | [view](./view.md)                                                                 |
| **`seen`**              | How many of the dispatched messages the run had taken when the frame's state was made                                             | [view](./view.md)                                                                 |
| **Renderer**            | What draws the frames that `run` hands it, and nothing else. It keeps no state beside the program's                               | [view](./view.md)                                                                 |
| **Memoized** (view)     | A view that the renderer draws again only when one of the values it is given is a new one, as with snabbdom's `thunk`             | [running](./running.md), [composition](./composition.md#childrens-views)          |
| **Handler** (of a view) | A callback of the renderer that sends a message the model holds, as the bridge's `onClick` does                                   | [writing a bridge](./writing-a-bridge.md#handlers)                                |
| **Input**               | A place in the state for a value the user gives. The view writes over it, and the library stores it                               | [inputs the user types into](./inputs-the-user-types-into.md)                     |
| **Write**               | What the view sends into an input: `{ _tag: 'Written', was, value }`. `value` is written over `was`, the value the model holds    | [inputs the user types into](./inputs-the-user-types-into.md)                     |
| **Bridge**              | What connects the library to a renderer: it draws frames, sends messages, and settles inputs                                      | [writing a bridge](./writing-a-bridge.md)                                         |
| **Settle**              | What a bridge does with `drawn` after each frame: what the element of an input then holds, and whether it takes the frame's value | [inputs the user types into](./inputs-the-user-types-into.md#settling-an-element) |

## Effects

| Word                       | What it is                                                                                                                                        | Defined in                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Command**                | Data that says what `update` decided. `runCommand` alone turns it into an Effect                                                                  | [commands](./commands.md)                                                    |
| **Execution**              | The Effect a command becomes: it cannot fail, and may produce one message back                                                                    | [commands](./commands.md)                                                    |
| **Subscription**           | What the program listens to, or work it keeps going, while its state wants it: a `Channel` of messages, listed by key                             | [subscriptions](./subscriptions.md)                                          |
| **Key**                    | What `subscriptions(state)` lists a subscription under. Keys are compared by value: a new key starts its subscription, and a missing key stops it | [subscriptions](./subscriptions.md)                                          |
| **Services**               | The Effect services that `runCommand` and `subscriptions` use. They are inferred, never named, and provided around `run`                          | [anatomy of a program](./anatomy-of-a-program.md), [commands](./commands.md) |
| **Handler** (of a service) | The code that does a service's operations, such as the save. The layer provided around `run` holds it                                             | [commands](./commands.md#services-handlers-and-events)                       |
| **Run**                    | `run(program, render, options?)`: the program started, with a stream of frames for the renderer                                                   | [running](./running.md)                                                      |

## Messages that do not fit

| Word                  | What it is                                                                                                           | Defined in                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Reject**            | What `update` returns for a message that may arrive, and does not apply in the state. The run ignores it             | [rejections and defects](./rejections-and-defects.md) |
| **Defect**            | What `update` throws, with `defect(reason)`, on a message that cannot arrive: a bug. The run dies                    | [rejections and defects](./rejections-and-defects.md) |
| **`InvariantDefect`** | What `defect(reason)` throws, holding the reason. A crash report can tell it from any other error                    | [rejections and defects](./rejections-and-defects.md) |
| **`ProgramDefect`**   | What the run dies with on a defect. Its `where` says where the defect happened, and its `cause` is the defect itself | [running](./running.md#when-a-defect-happens)         |

## A program made of programs

| Word                       | What it is                                                                                                         | Defined in                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Composition**            | How a parent declares its children and its inputs, and where each lives in its state                               | [composition](./composition.md)                                                                              |
| **Child**                  | Any program, declared by a parent. A child by id is one of many, as the rows of a list                             | [composition](./composition.md)                                                                              |
| **`at`**                   | Where a child or an input lives in the parent's state: an Effect `Optic`, or `get` and `set` in its place          | [composition](./composition.md#declaring-children)                                                           |
| **By id**                  | One child or one input for each row, as the rows of a list. `childById` and `inputById` declare them               | [composition](./composition.md#children-by-id), [inputs by id](./inputs-the-user-types-into.md#inputs-by-id) |
| **Event**                  | What a child raises to ask its parent for something. The parent handles it in `onEvent`                            | [events and external messages](./events-and-external-messages.md)                                            |
| **Handler** (of `onEvent`) | The function of `onEvent` for one child's events: `(event, children) => (state) => step`. Its type has no `reject` | [events and external messages](./events-and-external-messages.md)                                            |
| **External message**       | A message of a child's that its type lets a parent send it                                                         | [events and external messages](./events-and-external-messages.md)                                            |
| **`CompositionDefect`**    | The defect of a broken composition, such as an external message that the child rejects                             | [composition](./composition.md), [events and external messages](./events-and-external-messages.md)           |

## In a test

| Word           | What it is                                                                                                           | Defined in                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Reader**     | A function of the test's own, from a model to the messages the model holds                                           | [testing](./testing.md#the-reader)                     |
| **Candidates** | The messages a user could ask for, which a test lists for `dispatchViolations`                                       | [testing tools](./testing-tools.md#dispatchviolations) |
| **Withheld**   | The candidates a model leaves out on purpose                                                                         | [testing tools](./testing-tools.md#dispatchviolations) |
| **Violation**  | What `dispatchViolations` returns for a check that fails: `Rejected`, `ActsTwice` or `Missing`                       | [testing tools](./testing-tools.md#dispatchviolations) |
| **Scenario**   | What a user does, played by a test: by `rehearse` without running the program, and by `drive` on the running program | [testing tools](./testing-tools.md#rehearse)           |
| **Rehearsal**  | What `rehearse` gives the scenario to act with, such as `send`, `run` and `hear`                                     | [testing tools](./testing-tools.md#rehearse)           |
