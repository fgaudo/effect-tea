---
title: Structuring a program
---

# Structuring a program

## In short

The pages before this one say what the library does. These rules say how to write a program so that what it promises
holds, and its tests can check it. The library does not enforce them. The examples follow them.

## State and messages

- **Conditions live in `update`.** "Can the user save now?" is answered once, by rejecting. The view never repeats the
  check.
- **Name intents, not toggles.** Write `MenuOpened` and `MenuClosed`, not `MenuToggled`. An intent sent twice does what
  it did once. A toggle undoes itself.
- **One-shot actions move to a state that rejects them.** After `SaveClicked` the form is saving, and it rejects a
  second `SaveClicked`. So a click that arrives while it saves does nothing.
- **An operation is a state that only its completion leaves.** The save of
  [`form`](../../examples/form/form.ts) is one. When its answer arrives, the
  state cannot have moved on. A completion anywhere else is a `defect`.
- **One state machine per concern, no flags.** The save, the selection, the data being loaded: each is a union with a
  case per state (`Idle | Saving | Failed`). Each case holds only what exists in it. Flags that combine (`isSaving`,
  `hasFailed`) allow combinations that cannot be. A union makes them fail to compile, and `update` matches on the case.
- **No derived data in the state.** What follows from the state is computed in `makeModel`. So is a value that depends
  on time: it is computed from a `now` that a subscription keeps in the state. The clock of
  [`pages`](../../examples/pages/clock.ts) does this.

## Model and view

- **Show less than `update` accepts, never more.** A test lists what the model leaves out on purpose as `withheld` (see
  [testing](./testing.md)). Anything else left out is a control missing from the screen, unless it would do nothing
  there.
- **A view draws, it never decides.** It matches the model's tags and formats its values (a date, a count, a text).
  - It computes no condition from data (`items.length === 0`).
  - It combines no fields.
  - It applies no rule and no fallback.

  What a view would decide, `makeModel` decides. It does so as a case named for the state the screen tells apart
  (`Empty | Listed`, `Loading | Loaded`), never as a boolean. An `Option` is such a case only when "missing" is all the
  screen tells apart.
- **The renderer draws frames, and nothing else.** A hover, an animation or the focus that the platform keeps by itself
  is not a state of the program. A state kept in a component of the renderer, beside the program's state, is neither
  supported nor advised (see [view](./view.md)). What the program decides stays in its state, and reaches the view as
  its model.
- **Input is never a reason to reject.** The input keeps what the user typed, whatever the program decides, and the
  library stores it (see [inputs the user types into](./inputs-the-user-types-into.md)). So no rule of the program
  rejects a value. Instead, put its validity in the model, as data: show "Save" only for a name that is not blank. A
  control whose bounds narrow below what the user gives it is drawn by the program. Its moves are messages, and `update`
  puts them within the bounds it holds.

## Splitting a program

A program lives in one module until it is too large. Then it splits into children, each a program of its own:

- **By concern, never by kind.** Modules named `messages`, `state` and `update` would import each other in cycles.
- **What spans the children stays in the parent**, such as a menu or the back button. What concerns one child stays in
  the child, even how the user learns of its failure.
- **A parent never reads a child's state to decide.** A child gets what it needs from its own services and
  subscriptions. Only a fact that several children must see as one truth is the parent's. The parent hands it down as
  an external message.
- **Children that read each other's state are one child**, whatever its size. A parent that grows logic between two
  siblings is a sign that they are one child.
- **Not every part is a child.** A child whose controls the parent would enable from its state is not one. Nor is a
  child whose state the parent would copy down and back up. A value that the user writes and the parent reads is an
  input of the parent, and an input by id where the user writes one value into each row (see
  [inputs by id](./composition.md#inputs-by-id)).
