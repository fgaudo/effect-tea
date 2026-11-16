---
title: Structuring a program
---

# Structuring a program

The pages before this one say what the library does. These rules say how to write a program so that what it promises
holds, and its tests can check it. The library does not enforce them; the examples follow them.

## State and messages

- **Conditions live in `update`.** "Can the user save now?" is answered once, by rejecting. The view never
  repeats the check.
- **Name intents, not toggles.** `MenuOpened` and `MenuClosed`, not `MenuToggled`. An intent sent twice does
  what it did once; a toggle undoes itself.
- **One-shot actions move to a state that rejects them.** After `SaveClicked` the form is saving and rejects
  a second `SaveClicked`, so a double click saves once.
- **An operation is a state that only its completion leaves**, as the save of
  [`form`](https://github.com/fgaudo/effect-tea/tree/main/examples/form/form.ts) is. When its answer arrives, the state
  cannot have moved on, and a completion anywhere else is a `defect`.
- **One state machine per concern, no flags.** The save, the selection, the data being loaded: each is a union
  with a case per state (`Idle | Saving | Failed`), holding only what exists in it. Flags that combine
  (`isSaving`, `hasFailed`) allow combinations that cannot be; a union makes them fail to compile, and `update`
  matches on the case.
- **No derived data in the state.** What follows from it is computed in `makeModel`. A value that depends on
  time is computed there too, from a `now` that a subscription keeps in the state, as the clock of
  [`pages`](https://github.com/fgaudo/effect-tea/tree/main/examples/pages/clock.ts) does.

## Model and view

- **Show less than `update` accepts, never more.** What it leaves out on purpose, a test lists as `withheld`
  (see [testing](./testing.md)); anything else left out is a control missing from the screen, unless it would do
  nothing there.
- **A view draws, it never decides.** It matches the model's tags and formats its values (a date, a count, a
  text). It computes no condition from data (`items.length === 0`), combines no fields, and applies no rule and
  no fallback. What a view would decide, `makeModel` decides, as a case named for the state the screen tells
  apart (`Empty | Listed`, `Loading | Loaded`), never a boolean. An `Option` is such a case only when
  "missing" is all the screen tells apart.
- **The renderer draws frames, and nothing else.** A hover, an animation or the focus that the platform keeps by
  itself is no state of the program's; a state kept in a component of the renderer, beside the program's, is
  neither supported nor advised (see [view](./view.md)). What the program decides stays in its state, and reaches the
  view as its model.
- **Input is never a reason to reject.** The input keeps what the user typed whatever the program decides, and
  the library stores it (see [inputs the user types into](./inputs-the-user-types-into.md)), so no rule of the program
  rejects a value: make its validity model data, and show "Save" only for a name that is not blank. A control whose
  bounds narrow under what the user gives it is drawn by the program, and its moves are messages that `update`
  puts within the bounds it holds.

## Splitting a program

A program lives in one module until it is too large. Then it splits into children, each a program of its own:

- **By concern, never by kind.** `messages`, `state` and `update` modules would import each other in cycles.
- **What spans the children stays in the parent** (a menu, the back button). What concerns one child stays in
  the child, even how the user learns of its failure.
- **A parent never reads a child's state to decide.** What a child needs, it gets from its own services and
  subscriptions. Only a fact several children must see as one truth is the parent's, handed down as an
  external message.
- **Children that read each other's state are one child**, whatever its size. A child whose controls the parent
  would enable from its state, or whose state the parent would copy down and back up, is not one: a value the user
  writes, which the parent reads, is an input of the parent's. A parent that grows logic between two siblings
  is a sign that they are one child.
