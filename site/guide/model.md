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

In this example, `Message` is a `Data.TaggedEnum`. The name of the draft is an input (see [inputs](./inputs.md)).
`isBlank` is a helper of the program.

```ts
type Editor = Data.TaggedEnum<{
  Saving: object
  Blank: object
  Named: { save: Message }
}>

const makeModel = ({ draft }: State): { name: string; editor: Editor } => ({
  name: draft.name,
  editor: draft._tag === "Saving"
    ? { _tag: "Saving" }
    : isBlank(draft.name)
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

- What the user types into a text field is not a message, nor is any value that an element holds or that the
  program keeps. The view writes the value into an input (see [inputs](./inputs.md), and
  [why what the user types is no message](./inputs.md#why-what-the-user-types-is-no-message)).
- A fact that comes with a value, as the end of a scroll with its offset, is a message that the model holds without
  its value: `{ _tag: 'ScrollEnded' } as const`. The view fills each field that is left with one value that the
  element or its event gives, copied as it is (see [what an element reports](./inputs.md#what-an-element-reports)).
- A view sends only the messages that the model holds. A view writes only into the inputs that the model shows. A view
  adds nothing to what it sends but the values that an element or its event gives, as given: it never builds a
  message of the program itself.
- A control that chooses among fixed values, as the digits of a keypad, holds one message for each value: a list or a
  record of messages. A function `(digit) => Message` would be a function in the model (see the next rule). The clock
  of [`pages`](../../examples/pages/clock.ts) picks its format so: each case of its model holds the message that picks
  the other format.
- Export `Message` as a type only, so that no view calls its constructors. The types do not stop a view from writing
  a message whole, as a literal: that rule is the view's to keep.
- The library does not enforce what a view keeps to above (see
  [what is left to you](./guarantees.md#what-is-left-to-you)). What the library says about a model rests on it. A test
  reads the messages of a program from its model, and fills a message held without its value with values that it
  draws (see [testing](./testing.md)). So no test sees a message that a view built itself, nor a value that a view
  computed.

**A model is data.** A model holds no function. A model compares by value with `Equal`. The models of two equal states
are equal.

- Data need not be serializable. A plain object, an array, an `Option`, a `Data` class or a `HashMap` is data: `Equal`
  compares each of them by what it holds.
- The testing tools compare the messages of a model by value, with `Equal`, and a test checks that the models of two
  equal states, built apart, are equal (see [testing](./testing.md)). A function made anew by each call of `makeModel`
  would break both.

What a model shows, and what a view may decide, is in [structuring a program](./structuring-a-program.md).

## Do and don't

Each pair sums up a rule of this page. The rule itself is above.

| Do                                                                 | Don't                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------- |
| Put every message that a view can send in the model, as a value.   | Build a message of the program in the view.                   |
| Pick the case of the model from the state, as `update` reads it.   | Show a control in a state where `update` rejects its message. |
| Let the view write what an element holds or reports into an input. | Make a message of what the user types into a text field.      |
| Let the view copy into a held message what the element gives.      | Compute in the view a value that the message carries.         |
| Keep the model data, compared by value with `Equal`.               | Put a function in the model.                                  |

```ts
// Don't: a function, made anew by each call of makeModel
const withFunction = (state: State) => ({ name: state.name, save: () => Message.SaveClicked() })

// Do: the message itself, as a value
const withMessage = (state: State) => ({ name: state.name, save: Message.SaveClicked() })
```
