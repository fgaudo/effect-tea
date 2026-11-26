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

In this example, `Message` is a `Data.TaggedEnum`. What is typed into the name is a message that the model holds
without its text, `Typing` (see [what an element gives](./what-an-element-gives.md)). `canSave` is a function of the
program, which `update` calls too.

```ts
type Typing = Readonly<{ _tag: "NameTyped" }>

type Editor = Data.TaggedEnum<{
  Saving: object
  Blank: { typed: Typing }
  Named: { typed: Typing; save: Message }
}>

const makeModel = ({ draft }: State): { name: string; editor: Editor } => ({
  name: draft.name,
  editor: draft._tag === "Saving"
    ? { _tag: "Saving" }
    : canSave(draft)
    ? { _tag: "Named", typed: { _tag: "NameTyped" }, save: Message.SaveClicked() }
    : { _tag: "Blank", typed: { _tag: "NameTyped" } }
})
```

## Rules

**Messages live in the model.** Every message that a view can send is in the model that the view draws, as a value. A
control sends the message that the program fixed for it.

- A view sends only the messages that the model holds. It adds nothing to them but the values that an element or its
  event gives: what the user types, or the offset of a scroll, comes in a message that the model holds without its
  value, and the view fills (see [what an element gives](./what-an-element-gives.md)).
- A control that chooses among fixed values, as the digits of a keypad, holds one message for each value: a list or a
  record of messages. A function `(digit) => Message` would be a function in the model. The clock of
  [`pages`](../../examples/pages/clock.ts) picks its format so: each case of its model holds the message that picks
  the other format.
- Nothing enforces it (see [what is left to you](./guarantees.md#what-is-left-to-you)), and the testing tools rest on
  it: they read the messages of a program from its model. A message that a view builds is one that no test sees.

**Pick the case from the state, as `update` reads it.** A model that shows "Save" in a state where `update` rejects
`SaveClicked` draws a button that does nothing. The run does not check this: a test does, with the
[testing tools](./testing-tools.md).

**A model is data.** A model holds no function. A model compares by value with `Equal`, and the models of two equal
states are equal. Data need not be serializable: a plain object, an array, an `Option`, a `Data` class or a `HashMap`
is data. A test compares the models of two states with `Equal` (see [testing](./testing.md#the-model-of-any-state)),
and `dispatchViolations` compares the messages they hold, which a function made anew by each call of `makeModel` would
break.

## Advice

- **Give the model a case for each state that the view tells apart**, and in each case only what makes sense in it:
  the messages of its controls, and the values that it draws. Then a view cannot send a message where the model holds
  none. How much a view may decide is in [structuring a program](./structuring-a-program.md#model-and-view).
- **Export `Message` as a type only**, so that no view calls its constructors. The types do not stop a view from
  writing a message whole, as a literal.
