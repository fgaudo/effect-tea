---
title: Structuring a program
---

# Structuring a program

## In short

The pages before this one say what the library does. This page says how to write a program so that what the program
promises holds, and so that its tests can check it. The library enforces only one of these rules, and the rule says
so. The examples follow them all.

## What kind of thing is it

A design answers this question for each part of a program. The table is a summary: the page that each row links rules
where the row says less.

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
| A part whose controls the parent enables from its own state                                  | Not a child: the parent's own state and messages                     | [splitting a program](#splitting-a-program)                                                                    |
| A value that the user types, and a parent reads                                              | A message of the program whose rules use it                          | [splitting a program](#splitting-a-program)                                                                    |
| What holds in a child, that its parent reads                                                 | The child's output                                                   | [outputs](./events-and-external-messages.md#outputs)                                                           |
| What a child asks of its parent                                                              | An event                                                             | [events and external messages](./events-and-external-messages.md)                                              |
| A fact that several children must see as one                                                 | An external message, which the parent sends down                     | [splitting a program](#splitting-a-program), [events and external messages](./events-and-external-messages.md) |

## Rules

### State and messages

- **Conditions live in `update`.** A question such as "Can the user save now?" is answered once, by rejecting. The
  view never repeats the check.
- **A message sent twice from one model acts once.** The second one is rejected, or changes nothing. Two cases:
  - Name intents, not toggles. Write `MenuOpened` and `MenuClosed`, not `MenuToggled`. An intent sent twice does what
    it did once. A toggle sent twice undoes itself.
  - A one-shot action moves to a state that rejects it. After `SaveClicked`, the form is saving. In that state, the
    form rejects a second `SaveClicked`. So a click that arrives while the form saves does nothing.

  An action meant to repeat, such as a "+1", is marked `repeatable`. `dispatchViolations` checks the rule (see
  [testing tools](./testing-tools.md#dispatchviolations)).
- **One state machine per concern, no flags.** The save, the selection and the data being loaded are examples of
  concerns. Each concern is a union with a case per state (`Idle | Saving | Failed`). Each case holds only what exists
  in that case. Flags that combine (`isSaving`, `hasFailed`) allow combinations that cannot be. A union makes those
  combinations fail to compile, and `update` matches on the case.
  - An operation is a state that only its completion leaves. The draft of [`form`](../../examples/form/form.ts) that
    is `Saving` is such a state. When the answer of the save arrives, the state cannot have moved on. A completion in any other state is a
    `defect`.
- **No derived data in the state.** What follows from the state is computed in `makeModel`. A value that depends on
  time is computed in `makeModel` too, from a `now` that a subscription keeps in the state. The clock of
  [`pages`](../../examples/pages/clock.ts) does this.

### Model and view

- **Show less than `update` accepts, never more.** A test lists, as `withheld`, what the model leaves out on purpose
  (see [testing tools](./testing-tools.md)). Anything else that the model leaves out is a control missing from the
  screen, unless that control would do nothing there. And a control that would do nothing is not shown: a test lists,
  as `inert`, what the model shows on purpose though it does nothing.
  - A value is never a reason to reject. A model holds a message without its value wherever the view gives the
    element its handler (see [what an element gives](./what-an-element-gives.md#rules)). It cannot pick its case by a
    value it does not have. If `update` rejected some values, the model would show more than `update` accepts. So the
    state decides whether the message applies, and the value decides what it means. A value that means nothing is a
    step that does nothing, the very state, which a test lists as `inert`.
  - What the user types is such a value. Put the validity of the text in the model, as data. For example, show "Save"
    only for a name that is not blank. A control whose bounds narrow below what the user gives it is drawn by the
    program. The moves of that control are messages, and `update` puts each move within the bounds that the state
    holds when the move arrives.
- **A view draws, it never decides.** A view matches the model's tags and formats the model's values (a date, a count,
  a text).
  - It computes no condition from data (`items.length === 0`).
  - It combines no fields.
  - It applies no rule and no fallback.
  - It computes no value that it sends. A message that it fills gets what the element or its event gives, as given
    (see [model](./model.md#rules)).

  What a view would decide, `makeModel` decides. `makeModel` decides it as a case named for the state that the screen
  tells apart (`Empty | Listed`, `Loading | Loaded`), never as a boolean. An `Option` is such a case only when
  "missing" is all that the screen tells apart.
- **What the platform keeps by itself is not a state of the program.** A hover, the focus, or an animation that the
  platform keeps by itself are examples. The rest of what the screen shows comes from the program's state, and reaches
  the view as the model. An element with a value of its own shows what the user typed into it only for the length of
  its own event (see [view](./view.md#rules)). What the program decides by,
  kept in a component of the renderer, is neither supported nor advised. What a bridge lets a component keep beside the
  program is the bridge's to say, as the bridge to React does (see [view](./view.md#rules)).

  To choose where a thing goes:
  - What the program decides by is state.
  - What the platform cannot keep by itself is state.
  - For the rest, either is right. In the state, a test sees it. [`bounce`](../../examples/bounce/bounce.ts) keeps in
    its state the part of a step that it draws by, and its `update` decides nothing by that part.
- **An animation that the program decides by is state, and moves by equal steps.** A ball that bounces until it
  rests, or the pieces of a game, are such animations: where they are changes what the program does. A subscription
  sends one message for each step, only while something moves. The message carries no time: each step moves the state
  on by the same length, `dt`. So `update` stays deterministic, and a test replays a motion as a list of steps. The
  example [`bounce`](../../examples/bounce/bounce.ts) shows how the steps are counted from the screen's refreshes, and
  how the ball is drawn between two steps, from the state.

### Splitting a program

A program lives in one module until the program is too large. Then the program splits into children. Each child is a
program of its own. Split a program this way:

- **Split by concern, never by kind.** Modules named `messages`, `state` and `update` would import each other in cycles.
- **What spans the children stays in the parent**, such as a menu or the back button. What concerns one child stays in
  that child, even how the user learns that the child failed.
- **A parent never reads a child's state to decide.** The library holds this by construction: a parent is given no
  child's state, and reads of a child only what the child declares as its `output` (see
  [outputs](./events-and-external-messages.md#outputs)). A child gets what it needs from its own services and
  subscriptions. A fact belongs to the parent only when several children must see the fact as one truth. The parent
  tells that fact down to the children as an external message.
- **Children that read each other's state are one child**, whatever the size of that child. When a parent grows logic
  between two siblings, this is a sign that the two siblings are one child.
- **Not every part is a child.** These parts are not children:
  - a part whose controls the parent would enable from the parent's own state;
  - a part whose state the parent would copy down and back up.
- **A row that is a child is an instance of its own.** When its id goes away and comes back, the row starts again from
  its `init`, the old row's answers are rejected, and its subscriptions do not run on for the new row (see
  [children by id](./composition.md#children-by-id), "Ids that come back"). A row kept in the parent's state has no
  instance: the parent's `update` tells an old row from a new one by what its state keeps.

- **A value that the user writes belongs to the program whose rules use it**: the program that says what the text
  means, changes it, or locks it.
  - In a stock-take, that program is the parent: a scan adds to a count, and the sheet locks the counts and submits
    them. So what is typed into each count is a message of the parent, with the row's id (see
    [in each row](./what-an-element-gives.md#in-each-row)), and a row is no child. See
    [`stocktake`](../../examples/stocktake/stocktake.ts).
  - Where only a child's own rules use the value, the value is the child's, and what is typed is a message of the
    child's own. The parent then reads what the child concludes from it, through the child's `output`: a valid count,
    not the text.

## Do and don't

Each pair sums up a rule of this page.

| Do                                                       | Don't                                                             |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| Split a program by concern.                              | Split it into modules named `messages`, `state` and `update`.     |
| Make one child of children that read each other's state. | Keep them as two children, with logic between them in the parent. |

Name intents, not toggles:

```ts
// Don't: a toggle, which undoes itself when it is sent twice
type Toggle = "MenuToggled"
const toggling: Update<Menu, Toggle> = () => ({ open }) => ({ state: { open: !open } })

// Do: intents, which do what they did once when they are sent twice
type Intent = "MenuOpened" | "MenuClosed"
const opening: Update<Menu, Intent> = (message) => () => ({ state: { open: message === "MenuOpened" } })
```

One state machine per concern, no flags:

```ts
// Don't: flags that combine, and allow a save that is saving and has failed at once
type SaveStatus = Readonly<{ isSaving: boolean; hasFailed: boolean; failedName: string }>

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
  model.items.length === 0 ? "Nothing yet" : model.items.join(", ")

// Do: makeModel decides, as a case named for the state that the screen tells apart
type Listing = Data.TaggedEnum<{
  Empty: object
  Listed: { items: Arr.NonEmptyReadonlyArray<string> }
}>

const makeListing = (items: ReadonlyArray<string>): Listing =>
  Arr.isReadonlyArrayNonEmpty(items) ? { _tag: "Listed", items } : { _tag: "Empty" }

const listingView = (listing: Listing) => listing._tag === "Empty" ? "Nothing yet" : listing.items.join(", ")
```
