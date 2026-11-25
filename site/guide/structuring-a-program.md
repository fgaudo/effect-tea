---
title: Structuring a program
---

# Structuring a program

## In short

The pages before this one say what the library does. This page is advice on how to shape a program: its state, its
messages, its model and its children. It binds nothing, and the library enforces none of it. Each piece of advice
gives its reason, and the case where it does not hold, where there is one. The examples follow it.

## What kind of thing is it

A design answers this question for each part of a program. The table is a summary: the page that each row links says
the rest.

| The thing                                                                                    | What it is                                                           | Where                                                                                                          |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Something happened: a click, an answer, a tick                                               | A message. `update` decides what it means                            | [update](./update.md)                                                                                          |
| A value that an element of the view holds or reports: a text, a size, the offset of a scroll | A message that the model holds without the value, and the view fills | [what an element gives](./what-an-element-gives.md)                                                            |
| Work whose answer must arrive, even if the state has moved on                                | A command                                                            | [commands](./commands.md)                                                                                      |
| Listening, or work that stops when the state no longer wants it                              | A subscription, under a key                                          | [subscriptions](./subscriptions.md)                                                                            |
| What stays open while a value it uses changes, such as a connection                          | A service, from a layer provided to `run`                            | [subscriptions](./subscriptions.md)                                                                            |
| What follows from the state                                                                  | Computed in `makeModel`, not kept in the state                       | [state and messages](#state-and-messages)                                                                      |
| What the platform keeps by itself: a hover, the focus                                        | Not a state of the program                                           | [model and view](#model-and-view), [view](./view.md)                                                           |
| A message that may arrive, and does not apply in the state                                   | `reject`                                                             | [rejections and defects](./rejections-and-defects.md)                                                          |
| A message that only a bug can bring                                                          | `defect`                                                             | [rejections and defects](./rejections-and-defects.md)                                                          |
| An expected failure of a command                                                             | A message, as the success is                                         | [commands](./commands.md)                                                                                      |
| A part whose controls the parent enables from its own state                                  | Most often not a child: the parent's own state and messages          | [splitting a program](#splitting-a-program)                                                                    |
| A value that the user types, and a parent reads                                              | A message of the program whose rules use it                          | [splitting a program](#splitting-a-program)                                                                    |
| What holds in a child, that its parent reads                                                 | The child's output                                                   | [outputs](./events-and-external-messages.md#outputs)                                                           |
| What a child asks of its parent                                                              | An event                                                             | [events and external messages](./events-and-external-messages.md)                                              |
| A fact that several children must see as one                                                 | An external message, which the parent sends down                     | [splitting a program](#splitting-a-program), [events and external messages](./events-and-external-messages.md) |

## Advice

### State and messages

- **Decide a condition once, from the state.** A question such as "Can the user save now?" has one answer: `update`
  rejects by it, and `makeModel` holds the message by it. A condition written twice comes to give two answers.
- **Let a message sent twice from one model act once.** A screen can send a message twice before it is drawn again, as
  a double click does. So name intents, not toggles: an intent sent twice does what it did once, and a toggle undoes
  itself. And let a one-shot action move to a state that rejects it: after `SaveClicked` the form is saving, and
  rejects a second one.

  ```ts
  // A toggle, which undoes itself when it is sent twice
  type Toggle = "MenuToggled"
  const toggling: Update<Menu, Toggle> = () => ({ open }) => ({ state: { open: !open } })

  // Intents, which do what they did once when they are sent twice
  type Intent = "MenuOpened" | "MenuClosed"
  const opening: Update<Menu, Intent> = (message) => () => ({ state: { open: message === "MenuOpened" } })
  ```

  It does not hold for an action meant to repeat, such as a "+1". A test marks that one `repeatable`, and
  `dispatchViolations` checks the others (see [testing tools](./testing-tools.md#dispatchviolations)).
- **Prefer one union for each concern to flags that combine.** The save, the selection and the data being loaded are
  concerns. Flags allow combinations that cannot be. A union with a case for each state, each case holding only what
  exists in it, makes those combinations fail to compile.

  ```ts
  // Flags that combine, and allow a save that is saving and has failed at once
  type SaveStatus = Readonly<{ isSaving: boolean; hasFailed: boolean; failedName: string }>

  // One union, with a case per state, and in each case only what exists in it
  type Save = Data.TaggedEnum<{
    Idle: object
    Saving: object
    Failed: { name: string }
  }>
  ```

  It does not hold for facts that do not depend on each other: two booleans whose four combinations all exist are two
  fields.
- **Compute what follows from the state, and do not keep it.** A copy kept in the state must change at each change of
  what it follows from, so `makeModel` computes it. A value that depends on time is computed there too, from a `now`
  that a subscription keeps in the state, as the clock of [`pages`](../../examples/pages/clock.ts) does. It does not
  hold for a value fixed at a moment, such as the total that the user confirmed: that is a fact of its own.

### Model and view

- **Do not reject a message by its value.** A model holds a message without its value wherever the view fills it (see
  [what an element gives](./what-an-element-gives.md#rules)). If `update` rejected some values, the model would hold a
  message that `update` rejects, against a rule (see [what is left to you](./guarantees.md#what-is-left-to-you)). So
  the state decides whether the message applies, and the value decides what it means.
  - A value that means nothing is a step that does nothing, which a test lists as `inert`.
  - What the user types is such a value. Put the validity of the text in the model, as data: show "Save" only for a
    name that is not blank.
  - A value out of the bounds that the state holds is put within them by `update`, as the move of a slider is.
- **Let the view draw, and `makeModel` decide.** A view matches the model's tags and formats the model's values. What
  it would decide, `makeModel` decides: a condition on data, fields to combine, a rule or a fallback. It decides it as
  a case named for what the screen tells apart, and as an `Option` only when "missing" is all that the screen tells
  apart. Then a test of the model sees the decision, with no renderer.

  ```ts
  // The view computes a condition from data
  const listView = (model: { items: ReadonlyArray<string> }) =>
    model.items.length === 0 ? "Nothing yet" : model.items.join(", ")

  // makeModel decides, as a case named for what the screen tells apart
  type Listing = Data.TaggedEnum<{
    Empty: object
    Listed: { items: Arr.NonEmptyReadonlyArray<string> }
  }>

  const makeListing = (items: ReadonlyArray<string>): Listing =>
    Arr.isReadonlyArrayNonEmpty(items) ? { _tag: "Listed", items } : { _tag: "Empty" }

  const listingView = (listing: Listing) => listing._tag === "Empty" ? "Nothing yet" : listing.items.join(", ")
  ```

  It does not hold for how a value is written, or where it is laid out: those are the view's.
- **Leave to the platform what it keeps by itself**: a hover, the focus, an animation that the platform runs. What the
  program decides by is state, and so is what the platform cannot keep. For the rest, either is right, and in the
  state a test sees it. What a renderer may keep beside the program is a rule of [view](./view.md#rules).
- **Move by equal steps an animation that the program decides by.** Where a bouncing ball is changes what the program
  does, so it is state. A subscription sends one message for each step, only while something moves, and the message
  carries no time: each step moves the state on by the same length. So `update` stays deterministic, and a test
  replays a motion as a list of steps (see [`bounce`](../../examples/bounce/bounce.ts)). It does not hold for an
  animation that decides nothing, which the platform keeps.

### Splitting a program

A program lives in one module until it is too large. Then it splits into children, each a program of its own (see
[composition](./composition.md)).

- **Split by concern, not by kind.** Modules named `messages`, `state` and `update` spread each concern over three
  files, and each change touches the three.
- **Keep in the parent what spans the children**, such as a menu or the back button. What concerns one child stays in
  that child, even how the user learns that the child failed.
- **Give a child what it needs, not its parent's state.** A child starts from its flags, which may be a fact that the
  parent keeps for that child alone, as `about` in [`pages`](../../examples/pages/app.ts). It gets the rest from its
  own services and subscriptions. A fact that several children must see as one truth is the parent's, and the parent
  tells it down as an external message. The other way, a parent is given no child's state: its `update` reads only what
  the child declares as its `output`, and its `makeModel` the child's model too (see
  [composition](./composition.md#the-parents-own-pieces)).
- **Make one child of children that read each other's state**, even a large one. Logic that grows in a parent between
  two siblings is a sign of it.
- **Not every part is a child.** A part whose controls the parent would enable from its own state, or whose state the
  parent would copy down and back up, is simpler as the parent's own state and messages. It does not hold for a part
  with commands or subscriptions of its own: that part may be a child, which the parent tells when to wait (see
  [a child that must wait for its parent](./events-and-external-messages.md#a-child-that-must-wait-for-its-parent)).
- **A value that the user writes belongs to the program whose rules use it**: the program that says what the text
  means, changes it, or locks it.
  - In [`stocktake`](../../examples/stocktake/stocktake.ts), that program is the parent: a scan adds to a count, and
    the sheet locks the counts and submits them. So what is typed into each count is a message of the parent, with the
    row's id (see [in each row](./what-an-element-gives.md#in-each-row)), and a row is no child.
  - Where only a child's own rules use the value, what is typed is a message of the child's own. The parent reads what
    the child concludes from it, through the child's `output`: of a count, the valid number and not the text; of a
    free note, the text itself.
  - A row that is a child is an instance, which starts again when its id goes away and comes back (see
    [children by id](./composition.md#children-by-id)). A row kept in the parent's state has none: the parent's
    `update` tells an old row from a new one by what its state keeps.
