---
title: Model
---

# Model

`makeModel(state)` turns the state into what the view reads. Its **shape** says what the view shows: a case
for each state the view tells apart, each holding only what makes sense in it, the messages of its controls
included, and the values of the inputs it draws. In this example, `Message` is a `Data.TaggedEnum`, `name` an
input (see [inputs the user types into](./inputs-the-user-types-into.md)) and `isBlank` a helper of the program:

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

- **Pick the case from the state, as `update` reads it.** A model that shows "Save" where `update` rejects
  `SaveClicked` has a button that does nothing. The run does not check it; a test does, with the
  [testing](./testing.md) tools, for any state it generates.

What a model shows, and what a view may decide, is in [structuring a program](./structuring-a-program.md).

**Messages live in the model.** Every message a view can send is in the model it draws, as a value: a control sends what
the program fixed for it. What the user types into a text field is no message: the view writes it over the value of an
input the model holds (see [inputs the user types into](./inputs-the-user-types-into.md)). A view sends only what the
model holds, writes only over the values it holds, and builds no message of the program itself: export `Message` as a
type only, and no view can build one. The library does not enforce it, and what it says of a model rests on it: a test
reads a program's messages from its model (see [testing](./testing.md)), so a message a view built is one no test has
seen.

**A model is data.** It holds no function, and compares by value with `Equal`: the models of two equal states are
equal. The testing tools compare a model's messages so, and a test checks it on the models of two equal states
built apart (see [testing](./testing.md)), which a function made anew by each `makeModel` would break. Data need not be
serializable: an `Option`, a `Data` class or a `HashMap` is data.
