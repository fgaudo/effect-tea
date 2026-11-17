---
title: Model
---

# Model

## In short

`makeModel(state)` turns the state into what the view reads. The model holds what the view shows, and the messages its
controls send. It is data, and compares by value with `Equal`.

## An example

In this example, `Message` is a `Data.TaggedEnum`, `name` an input (see
[inputs the user types into](./inputs-the-user-types-into.md)) and `isBlank` a helper of the program:

```ts
type Editor = Data.TaggedEnum<{
  Saving: object
  Blank: object
  Named: { save: Message }
}>

const makeModel = (state: State): { name: string; editor: Editor } => ({
  name: state.name,
  editor: state.save._tag === 'Saving'
    ? { _tag: 'Saving' }
    : isBlank(state.name)
    ? { _tag: 'Blank' }
    : { _tag: 'Named', save: Message.SaveClicked() },
})
```

## Rules

**Its shape says what the view shows.** It has a case for each state the view tells apart. Each case holds only what
makes sense in it. That includes the messages of its controls, and the values of the inputs it draws.

**Pick the case from the state, as `update` reads it.** A model that shows "Save" where `update` rejects `SaveClicked`
has a button that does nothing. The run does not check it. A test does, with the [testing](./testing.md) tools, for any
state it generates.

**Messages live in the model.** Every message a view can send is in the model it draws, as a value. A control sends
what the program fixed for it.

- What the user types into a text field is not a message. The view writes it over the value of an input the model holds
  (see [inputs the user types into](./inputs-the-user-types-into.md)).
- A view sends only what the model holds, and writes only over the values it holds. It never builds a message of the
  program itself.
- Export `Message` as a type only, and no view can build one.

**A model is data.** It holds no function. It compares by value with `Equal`: the models of two equal states are equal.

What a model shows, and what a view may decide, is in [structuring a program](./structuring-a-program.md).

## Precisely

**The rules a view keeps to are not enforced.** A view sends only what the model holds, writes only over the values it
holds, and never builds a message of the program itself. The library does not enforce these rules, and what it says
about a model rests on them. A test reads a program's messages from its model (see [testing](./testing.md)). So no test
has seen a message that a view built itself.

**Why a model holds no function.** The testing tools compare a model's messages by value with `Equal`. A test checks
this on the models of two equal states built apart (see [testing](./testing.md)). A function made anew by each
`makeModel` would break it.

**Data need not be serializable.** An `Option`, a `Data` class or a `HashMap` is data.
