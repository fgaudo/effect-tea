---
title: Model
---

# Model

## In short

The model is what your view reads. This page shows what goes into a model, and why the model holds the messages of the
view.

`makeModel(state)` turns the state into the model. The model holds what the view shows, and the messages that the
view's controls send. The model is data, and it compares by value with `Equal`.

## An example

In this example, `Message` is a `Data.TaggedEnum`. `name` is an input (see
[inputs the user types into](./inputs-the-user-types-into.md)). `isBlank` is a helper of the program.

```ts
type Editor = Data.TaggedEnum<{
  Saving: object
  Blank: object
  Named: { save: Message }
}>

const makeModel = (state: State): { name: string; editor: Editor } => ({
  name: state.name,
  editor: state.save._tag === "Saving"
    ? { _tag: "Saving" }
    : isBlank(state.name)
    ? { _tag: "Blank" }
    : { _tag: "Named", save: Message.SaveClicked() }
})
```

## Rules

**Its shape says what the view shows.** The model has a case for each state that the view tells apart. Each case holds
only what makes sense in that case. This includes the messages of the case's controls, and the values of the inputs
that the view draws in that case.

**Pick the case from the state, as `update` reads it.** Suppose that a model shows "Save" in a state where `update`
rejects `SaveClicked`. Then the "Save" button does nothing. The run does not check this. A test checks it, with the
[testing tools](./testing-tools.md), for any state that the test generates.

**Messages live in the model.** Every message that a view can send is in the model that the view draws, as a value. A
control sends the message that the program fixed for it.

- What the user types into a text field is not a message. The view writes the text into an input whose value the
  model holds (see [inputs the user types into](./inputs-the-user-types-into.md)). The program cannot fix such a
  message as a value, since the text is known only when the user types it (see
  [why what the user types is no message](./inputs-the-user-types-into.md#why-what-the-user-types-is-no-message)).
- A view sends only the messages that the model holds. A view writes only into the inputs that the model shows. A view
  never builds a message of the program itself.
- A control that chooses among fixed values, as the digits of a keypad, holds one message for each value: a list or a
  record of messages. A function `(digit) => Message` would be a function in the model (see the next rule). The clock
  of [`pages`](../../examples/pages/clock.ts) picks its format so: each case of its model holds the message that picks
  the other format.
- Export `Message` as a type only. Then no view can build a message.

**A model is data.** A model holds no function. A model compares by value with `Equal`. The models of two equal states
are equal.

What a model shows, and what a view may decide, is in [structuring a program](./structuring-a-program.md).

## Do and don't

Each pair sums up a rule of this page. The rule itself is above.

| Do                                                               | Don't                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| Put every message that a view can send in the model, as a value. | Build a message of the program in the view.                   |
| Pick the case of the model from the state, as `update` reads it. | Show a control in a state where `update` rejects its message. |
| Let the view write what the user types into an input.            | Make a message of what the user types into a text field.      |
| Keep the model data, compared by value with `Equal`.             | Put a function in the model.                                  |

```ts
// Don't: a function, made anew by each call of makeModel
const withFunction = (state: State) => ({ name: state.name, save: () => Message.SaveClicked() })

// Do: the message itself, as a value
const withMessage = (state: State) => ({ name: state.name, save: Message.SaveClicked() })
```

## Precisely

**The rules a view keeps to are not enforced.** A view keeps three rules:

- It sends only the messages that the model holds.
- It writes only into the inputs that the model shows.
- It never builds a message of the program itself.

The library does not enforce these rules. What the library says about a model rests on them. A test reads the messages
of a program from its model (see [testing](./testing.md)). So no test has seen a message that a view built itself.

**Why a model holds no function.** The testing tools compare the messages of a model by value, with `Equal`. A test
checks this on the models of two equal states, built apart (see [testing](./testing.md)). A function made anew by each
call of `makeModel` would break this comparison.

**Data does not have to be serializable.** A plain object, an array, an `Option`, a `Data` class or a `HashMap` is
data: `Equal` compares each of them by what it holds.
