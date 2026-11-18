---
title: Structuring a program
---

# Structuring a program

## In short

The pages before this one say what the library does. This page says how to write a program so that what the program
promises holds, and so that its tests can check it. The library does not enforce these rules. The examples follow
them.

## State and messages

- **Conditions live in `update`.** A question such as "Can the user save now?" is answered once, by rejecting. The
  view never repeats the check.
- **Name intents, not toggles.** Write `MenuOpened` and `MenuClosed`, not `MenuToggled`. An intent sent twice does
  what it did once. A toggle sent twice undoes itself.
- **A one-shot action moves to a state that rejects it.** After `SaveClicked`, the form is saving. In that state, the
  form rejects a second `SaveClicked`. So a click that arrives while the form saves does nothing.
- **An operation is a state that only its completion leaves.** The save of [`form`](../../examples/form/form.ts) is
  such a state. When the answer of the save arrives, the state cannot have moved on. A completion in any other state
  is a `defect`.
- **One state machine per concern, no flags.** The save, the selection and the data being loaded are examples of
  concerns. Each concern is a union with a case per state (`Idle | Saving | Failed`). Each case holds only what exists
  in that case. Flags that combine (`isSaving`, `hasFailed`) allow combinations that cannot be. A union makes those
  combinations fail to compile, and `update` matches on the case.
- **No derived data in the state.** What follows from the state is computed in `makeModel`. A value that depends on
  time is computed in `makeModel` too, from a `now` that a subscription keeps in the state. The clock of
  [`pages`](../../examples/pages/clock.ts) does this.

## Model and view

- **Show less than `update` accepts, never more.** A test lists, as `withheld`, what the model leaves out on purpose
  (see [testing tools](./testing-tools.md)). Anything else that the model leaves out is a control missing from the
  screen, unless that control would do nothing there.
- **A view draws, it never decides.** A view matches the model's tags and formats the model's values (a date, a count,
  a text).
  - It computes no condition from data (`items.length === 0`).
  - It combines no fields.
  - It applies no rule and no fallback.

  What a view would decide, `makeModel` decides. `makeModel` decides it as a case named for the state that the screen
  tells apart (`Empty | Listed`, `Loading | Loaded`), never as a boolean. An `Option` is such a case only when
  "missing" is all that the screen tells apart.
- **The renderer draws frames, and nothing else.** A hover, an animation, or the focus that the platform keeps by
  itself is not a state of the program. A state kept in a component of the renderer, beside the program's state, is
  neither supported nor advised (see [view](./view.md)). What the program decides stays in the program's state, and
  reaches the view as the model.
- **Input is never a reason to reject.** The input keeps what the user typed, whatever the program decides, and the
  library stores it (see [inputs the user types into](./inputs-the-user-types-into.md)). So no rule of the program
  rejects a value. Instead, put the validity of the value in the model, as data. For example, show "Save" only for a
  name that is not blank. A control whose bounds narrow below what the user gives it is drawn by the program. The
  moves of that control are messages, and `update` puts each move within the bounds that the state holds when the move
  arrives.

## Splitting a program

A program lives in one module until the program is too large. Then the program splits into children. Each child is a
program of its own. Split a program this way:

- **Split by concern, never by kind.** Modules named `messages`, `state` and `update` would import each other in cycles.
- **What spans the children stays in the parent**, such as a menu or the back button. What concerns one child stays in
  that child, even how the user learns that the child failed.
- **A parent never reads a child's state to decide.** A child gets what it needs from its own services and
  subscriptions. A fact belongs to the parent only when several children must see the fact as one truth. The parent
  sends that fact down to the children as an external message.
- **Children that read each other's state are one child**, whatever the size of that child. When a parent grows logic
  between two siblings, this is a sign that the two siblings are one child.
- **Not every part is a child.** These parts are not children:
  - a part whose controls the parent would enable from the parent's own state;
  - a part whose state the parent would copy down and back up.

  A value that the user writes and the parent reads is an input of the parent. Where the user writes one value into
  each row, the value is an input by id (see [inputs by id](./inputs-the-user-types-into.md#inputs-by-id)).

## Do and don't

Each pair sums up a rule of this page.

| Do                                                                     | Don't                                                             |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Answer "Can the user save now?" once, in `update`, by rejecting.       | Repeat the check in the view.                                     |
| After a one-shot action, move to a state that rejects that action.     | Accept a second `SaveClicked` while the form saves.               |
| Compute what follows from the state in `makeModel`.                    | Keep derived data in the state.                                   |
| Split a program by concern.                                            | Split it into modules named `messages`, `state` and `update`.     |
| Give a child what it needs through its own services and subscriptions. | Let a parent read a child's state to decide.                      |
| Make one child of children that read each other's state.               | Keep them as two children, with logic between them in the parent. |

Name intents, not toggles:

```ts
// Don't: a toggle, which undoes itself when it is sent twice
type Toggle = 'MenuToggled'
const toggling: Update<Menu, Toggle> = () => ({ open }) => ({ state: { open: !open } })

// Do: intents, which do what they did once when they are sent twice
type Intent = 'MenuOpened' | 'MenuClosed'
const opening: Update<Menu, Intent> = (message) => () => ({ state: { open: message === 'MenuOpened' } })
```

One state machine per concern, no flags:

```ts
// Don't: flags that combine, and allow a save that is saving and has failed at once
type Flags = Readonly<{ isSaving: boolean; hasFailed: boolean; failedName: string }>

// Do: one union, with a case per state, and in each case only what exists in it
type Save = Data.TaggedEnum<{
  Idle: object
  Saving: object
  Failed: { name: string }
}>
```

A view draws, it never decides:

```ts
// Don't: the view computes a condition from data
const listView = (model: { items: ReadonlyArray<string> }) =>
  model.items.length === 0 ? 'Nothing yet' : model.items.join(', ')

// Do: makeModel decides, as a case named for the state that the screen tells apart
type Listing = Data.TaggedEnum<{
  Empty: object
  Listed: { items: Arr.NonEmptyReadonlyArray<string> }
}>

const makeListing = (items: ReadonlyArray<string>): Listing =>
  Arr.isReadonlyArrayNonEmpty(items) ? { _tag: 'Listed', items } : { _tag: 'Empty' }

const listingView = (listing: Listing) => listing._tag === 'Empty' ? 'Nothing yet' : listing.items.join(', ')
```