---
title: Coming from Elm or React
---

# Coming from Elm or React

## In short

If you know Elm or React, you know many of the ideas here already. This page maps what you know to the words of this
library. It is a summary, and promises nothing of its own: each line links the page that rules.

## From Elm

The loop is the one you know, and most names carry over. One name does not: Elm's `Model` is the **state** here. The
**model** is something else: what the view reads.

| In Elm                                                 | Here                                                                                                                | See                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `Model`                                                | The state                                                                                                           | [anatomy of a program](./anatomy-of-a-program.md)                 |
| `Msg`                                                  | A message                                                                                                           | [update](./update.md)                                             |
| `update : Msg -> Model -> ( Model, Cmd Msg )`          | `update(message)(state)` returns a step, `{ state, commands?, events? }`, or `reject`                               | [update](./update.md)                                             |
| `Cmd Msg`, which a test cannot look into               | A command: a value of your own type, which `runCommand` turns into an Effect, and a test compares by value          | [commands](./commands.md)                                         |
| A `Task`, a port                                       | An Effect in `runCommand`, with the services provided around `run`                                                  | [commands](./commands.md)                                         |
| `subscriptions : Model -> Sub Msg`                     | `subscriptions(state)` lists their keys, and `listen(key)` makes each: a new key starts one, a missing key stops it | [subscriptions](./subscriptions.md)                               |
| `view : Model -> Html Msg`                             | Two steps: `makeModel(state)` makes a model that holds the messages, and a view draws it with your renderer         | [model](./model.md), [view](./view.md)                            |
| `init : flags -> ( Model, Cmd Msg )`                   | `init`: a step, or a function of the flags                                                                          | [anatomy of a program](./anatomy-of-a-program.md)                 |
| `Html.map`, `Cmd.map` and `Sub.map`, by hand           | `program`: a parent says which children are there, and the library keeps them and does the routing                  | [composition](./composition.md)                                   |
| A child's `update` that returns a value for its parent | An event the child raises, which the parent handles in `onEvent`                                                    | [events and external messages](./events-and-external-messages.md) |
| `onInput`, a message for each keystroke                | A message for each keystroke too: the model holds it without the text, and the view fills it                        | [what an element gives](./what-an-element-gives.md)               |

What is new:

- **`reject`.** In Elm, an `update` usually returns the model unchanged for a message that does not apply. Here
  `update` returns `reject`. So a test can tell a rejection from a step that keeps the state (see
  [rejections and defects](./rejections-and-defects.md)).
- **`defect`.** A message that cannot arrive is a bug. `update` throws `defect(reason)` on it, and the run dies. A
  branch that returns the model unchanged would hide the bug (see
  [rejections and defects](./rejections-and-defects.md)).
- **The model, between the state and the view.** The model holds each control's message as data. So a test checks the
  controls against `update` without drawing anything (see [testing](./testing.md)).
- **A message that an element fills.** As in Elm, what the user types is a message, and `update` stores the text. The
  model holds the message without the value, and the view copies the value from the element into it. A fact that
  comes with a value, as the end of a scroll with its offset, is another case of it (see
  [what an element gives](./what-an-element-gives.md)).

What you lose: Elm's compiler keeps `update` pure, and TypeScript's compiler does not. Two things are left to you:
keeping `update`, `makeModel` and `subscriptions` pure, and never mutating a value given to the library (see
[guarantees](./guarantees.md#what-is-left-to-you)).

## From React

You keep React to draw, and JSX to write views. What changes is where the state and the effects live. They live in one
program, outside the components.

| In React                                       | Here                                                                                                                                                 | See                                                                                                |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `useState`, `useReducer`, a store              | The program's state. A component keeps only what the program does not decide by                                                                      | [view](./view.md)                                                                                  |
| A reducer and its actions                      | `update` and its messages. `update` also returns commands, and may `reject`                                                                          | [update](./update.md)                                                                              |
| `useEffect` that fetches or saves              | A command `update` returns, run by `runCommand`                                                                                                      | [commands](./commands.md)                                                                          |
| `useEffect` that listens, with a cleanup       | A subscription under a key: started when the state lists the key, stopped when it does not                                                           | [subscriptions](./subscriptions.md)                                                                |
| A component                                    | A view: a function of its model, which `Host`, of the [package's bridge to React](../../bridges/react.ts), calls as React renders                    | [view](./view.md)                                                                                  |
| A handler that decides what to do              | A handler that sends a message the model holds: `onClick={() => dispatch(model.save)}`                                                               | [model](./model.md)                                                                                |
| Props down, callbacks up                       | Flags and external messages down, events up, and an output that the parent reads                                                                     | [composition](./composition.md), [events and external messages](./events-and-external-messages.md) |
| A controlled `<input>`, `value` and `onChange` | A controlled `<input>` too: `value` is the model's, and `onChange` sends the message that the model holds for it, filled with what the element holds | [what an element gives](./what-an-element-gives.md)                                                |
| A test that renders a component                | A test of `update` and of the model, without a DOM                                                                                                   | [testing](./testing.md)                                                                            |

Some things stay with the platform. A hover, an animation or the focus that the platform keeps by itself is not a state
of the program (see [structuring a program](./structuring-a-program.md#model-and-view)). An animation that the program
decides by is state, and moves by equal steps (see the same section).

With the package's bridge to React, React hosts the program: `<Host program={counter} view={view} />` runs it while
`Host` is mounted. The components of the view and of the application may keep state and effects of their own, beside
the program (see [view](./view.md#rules)). The run lives as long as `Host`'s effect (see
[the package's bridges](./writing-a-bridge.md#the-packages-bridges)). What the bridge leaves out is in
[what is left out](./writing-a-bridge.md#what-is-left-out). The bridge is the entry `@fgaudo/effect-tea/react`
([`bridges/react.ts`](../../bridges/react.ts)), with `react` installed beside the package. The examples
[`counter`](../../examples/counter) and [`form`](../../examples/form) are drawn with it, and with the bridge to snabbdom
too.
