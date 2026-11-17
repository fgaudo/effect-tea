---
title: Coming from Elm or React
---

# Coming from Elm or React

## In short

This page maps what you already know to what the library calls it. It is a summary, and promises nothing of its own:
each line links the page that rules.

## From Elm

The loop is the one you know. Most names carry over, and one does not: Elm's `Model` is the **state** here, and the
**model** is something else.

| In Elm                                                 | Here                                                                                                        | See                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `Model`                                                | The state                                                                                                   | [update](./update.md)                                         |
| `Msg`                                                  | A message                                                                                                   | [update](./update.md)                                         |
| `update : Msg -> Model -> ( Model, Cmd Msg )`          | `update(message)(state)` returns a step, `{ state, commands?, events? }`, or `reject`                       | [update](./update.md)                                         |
| `Cmd Msg`, which a test cannot look into               | A command: a value of your own type, which `runCommand` turns into an Effect, and a test compares by value  | [commands](./commands.md)                                     |
| A `Task`, a port                                       | An Effect in `runCommand`, with the services provided around `run`                                          | [commands](./commands.md)                                     |
| `subscriptions : Model -> Sub Msg`                     | `subscriptions(state)` returns them by key: a new key starts one, a missing key stops it                    | [subscriptions](./subscriptions.md)                           |
| `view : Model -> Html Msg`                             | Two steps: `makeModel(state)` makes a model that holds the messages, and a view draws it with your renderer | [model](./model.md), [view](./view.md)                        |
| `init : flags -> ( Model, Cmd Msg )`                   | `init`: a step, or a function of the flags                                                                  | [anatomy of a program](./anatomy-of-a-program.md)             |
| `Html.map`, `Cmd.map` and `Sub.map`, by hand           | `program`: a parent says where each child lives, and the library routes                                     | [composition](./composition.md)                               |
| A child's `update` that returns a value for its parent | An event the child raises, which the parent handles in `onEvent`                                            | [composition](./composition.md#events-and-external-messages)  |
| `onInput`, a message for each key                      | An input: the view writes over a value of the state, and no `update` of the program's sees it               | [inputs the user types into](./inputs-the-user-types-into.md) |

What is new:

- **`reject`.** An `update` in Elm usually returns the model unchanged for a message that does not apply. Here it
  says so, and a test can tell a rejection from a step that keeps the state (see
  [rejections and defects](./rejections-and-defects.md)).
- **`defect`.** A message that cannot arrive is a bug, and ends the run, where a branch that returns the model
  unchanged would hide it (see [rejections and defects](./rejections-and-defects.md)).
- **The model, between the state and the view.** It holds each control's message as data, so a test checks the
  controls against `update` without drawing anything (see [testing](./testing.md)).

What you lose: the compiler does not keep `update` pure. That `update`, `makeModel` and `subscriptions` are pure, and
states never mutated, is left to you (see [guarantees](./guarantees.md#what-is-left-to-you)).

## From React

You keep React to draw, and JSX to write views. What changes is where the state and the effects live: in one program,
outside the components.

| In React                                       | Here                                                                                       | See                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `useState`, `useReducer`, a store              | The program's state. The renderer keeps no state beside it                                 | [view](./view.md)                                             |
| A reducer and its actions                      | `update` and its messages. `update` also returns commands, and may `reject`                | [update](./update.md)                                         |
| `useEffect` that fetches or saves              | A command `update` returns, run by `runCommand`                                            | [commands](./commands.md)                                     |
| `useEffect` that listens, with a cleanup       | A subscription under a key: started when the state lists the key, stopped when it does not | [subscriptions](./subscriptions.md)                           |
| A component                                    | A view: a plain function of its model. With the examples' bridge it uses no hooks          | [view](./view.md)                                             |
| A handler that decides what to do              | A handler that sends a message the model holds: `onClick(model.save, dispatch)`            | [model](./model.md)                                           |
| Props down, callbacks up                       | A child's model down, its events up                                                        | [composition](./composition.md)                               |
| A controlled `<input>`, `value` and `onChange` | An input, drawn by the bridge over an uncontrolled `<input>`, with no `value` prop         | [inputs the user types into](./inputs-the-user-types-into.md) |
| A test that renders a component                | A test of `update` and of the model, without a DOM                                         | [testing](./testing.md)                                       |

What stays the platform's: a hover, an animation, or the focus that the platform keeps by itself is no state of the
program's (see [structuring a program](./structuring-a-program.md#model-and-view)).

What the examples' bridge to React leaves out: a component with state or effects of its own, Suspense, a subtree
`memo` skips, and a portal (see [what is left out](./writing-a-bridge.md#what-is-left-out)). The bridge is a file to
copy and to own, [`examples/bridges/react.ts`](../../examples/bridges/react.ts), and
[`counter-react`](../../examples/counter-react) and
[`form-react`](../../examples/form-react) are drawn with it.
