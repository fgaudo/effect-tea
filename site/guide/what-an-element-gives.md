---
title: What an element gives
---

# What an element gives

## In short

This page shows how a program holds a value that an element holds or reports: the text of a field, the mark of a
checkbox, the offset of a scroll, a measured size. Such a value comes from the element, not from the program. The text
that the user types is the first case, and the one this page shows first.

- What the element gives is a message of the program, as a click is. `update` decides what it does.
- The model holds the message without the value, as data. The view fills the value that the element gives, and sends
  the message.

## An example

The form names a message for what is typed into its field, with the text, beside its others
(`examples/form/form.ts`):

```ts
type Own = Data.TaggedEnum<{
  NameTyped: { value: string }
  SaveClicked: object
  SaveSucceeded: { name: string }
  SaveFailed: { name: string }
}>
```

`update` stores the text in the case `Editing` of the draft, where the name can be typed, and rejects it while the form
saves:

```ts
case 'NameTyped':
  return draft._tag === 'Editing'
    ? { state: { ...state, draft: Draft.Editing({ name: message.value, failed: draft.failed }) } }
    : reject
```

Where the model shows an editor, it holds the message without the text: `typed: { _tag: 'NameTyped' }`. While the form
saves, the model shows no editor, and holds nothing to type.

The form's view draws its field as a controlled element, with the snabbdom bridge (`examples/form/view-snabbdom.ts`).
The element's `value` is `model.name`. Where the model shows an editor, its handler sends the message that the model
holds, filled with what the element holds (see [the element on screen](#the-element-on-screen)):

```ts
input: (event) => dispatch({ ...editor.typed, value: (event.target as HTMLInputElement).value }),
```

## Rules

- **What an element gives is a message of the program**, as a click is: `update` decides what it does. The model holds
  the message without the value, and the view fills it.
- **The view fills the value as the element gives it.** A message held so may leave any number of fields to the
  element. The view fills each field with one value that the element or its event gives, copied as it is: it combines
  none, compares none and converts none. What follows from them, `update` computes.
  - An object of the browser, as a `DOMRect`, is not data. The view copies the numbers it needs from it.
  - The held part needs no type of its own. With `as const`, a view that leaves out a field, or fills one with a value
    of another type, does not compile.
- **What is typed is stored by `update`**, where the program keeps it: `update` puts the text in the state, or keeps
  another form of it (see [what is typed, in another form](#what-is-typed-in-another-form)).
- **A value is never a reason to reject.** The state decides whether the message applies, and the value decides what
  it means (see [structuring a program](./structuring-a-program.md#model-and-view)).
- **A lock is a case of the state** in which `update` rejects the message, and the model holds none. So the view draws
  no handler there, and a message sent from a model drawn before the lock is rejected, as any message is that does
  not apply.

### The element on screen

**The view draws an element that holds a value as a controlled element.** The element's value is the one its model
holds, and its handler sends the message that its model holds for it, filled with what the element holds. A message
is applied in its own event. So when the handler returns, the state holds what was typed, or has rejected it. The
element is then drawn again with the value of the new model, before the next event.

How each bridge keeps the element so, and which elements it draws, is in
[the package's bridges](./writing-a-bridge.md#the-packages-bridges): [`form`](../../examples/form) draws its field with
snabbdom and with React.

### What an element reports

An element reports some values that the program cannot give back to it: the offset of a scroll, a measured size, the
point of a press.

- **A value that the program keeps is a message**, held and filled as any other. Nothing is promised of the element. A
  value that the program keeps from such a message is not shown: the package's bridges give an element back its
  `value` and its `checked` alone (see [the package's bridges](./writing-a-bridge.md#the-packages-bridges)).
  - Where a message at each event costs too much, the handler sends it once, as the scroll ends (see
    [what is left to you](./guarantees.md#what-is-left-to-you)).
- **What is there whatever is drawn is a subscription.** A value of an element that the view draws comes from its
  handler. The size of the window, or a key pressed anywhere on the page, is there whatever the view draws. It comes
  from a subscription to a service (see [subscriptions](./subscriptions.md)).
- **A fact that comes with a value is a message too.** The end of a scroll comes with its offset. The model holds the
  message without the offset. The view fills the offset that the element gives, and sends the message. `update`
  decides what the offset means:

  ```ts
  // In makeModel, in the case where the list reports the end of its scroll.
  scrollEnded: { _tag: 'ScrollEnded' } as const,

  // In the view: the handler of the list's `scrollend`.
  scrollend: (event) => dispatch({ ...model.scrollEnded, offset: (event.currentTarget as HTMLElement).scrollTop }),
  ```

  [`volume`](../../examples/volume/view.ts) does this for a press on a track. The view fills the `clientX` of the
  event, and the `left` and the `width` of the track. `update` computes the point.
- **A message that an element fills is a plain tagged one.** A message that is a class, as a `Data.TaggedClass`, is no
  plain object: a spread of it is not an instance of the class, nor equal to one.

### A value that an element reports

What a model shows of a value that an element reports, as the offset of a scroll:

- **The model says where the element reports.** It does so by its case: the case in which the view gives the element
  its handler, which holds the message without its value. So "a view sends only what its model holds" holds as it is
  (see [model](./model.md)).
- **The model holds the value only where the view draws by it.** A model that holds an offset is a new model at each
  event of the scroll.
- **A test fills a value other than the one the model shows**, or values that it draws, where the model shows none
  (see [testing](./testing.md#the-reader)).

### What is typed, in another form

The element already shows the text as it is typed. A program that wants the text in another form has four ways:

- **Parse the text where the program reads it.** `update` stores the text as typed. A function of the program says what
  the text means, to `update` and to `makeModel`. `stocktake` reads each count with `countOf`: a whole number, nothing
  typed, or anything else.
- **Replace the text on another message.** `update` leaves another text in the state: for example, the name without
  the spaces around it, when the user saves. The element is then drawn with the program's text (see
  [the element on screen](#the-element-on-screen)).
- **Store another form of what is typed.** `update` stores, for example, the text in capitals. The element is then
  drawn with the text stored, at once, and keeps its focus. Where the caret goes then is the browser's, and
  unspecified. Where the form is the text held, `update` can leave the very same state: no new model is made, and the
  element is given its value back.
- **Format the text in the element, before it is sent.** A limit that the element keeps by itself, such as
  `maxlength`, needs nothing: the element reports the value that it holds. A mask changes the element's own value. So
  it is outside what this page promises, as any value that an element changes by itself is (see
  [what is left out](./writing-a-bridge.md#what-is-left-out)). The package's bridges show no mask.

### In each row

A value that the user types into each row, such as the count of each item, is a message that names the row, held with
its id: `{ _tag: 'CountTyped', id }`. The view fills the text. `update` stores it in the row, and rejects it for a row
that is not there.

**Lock the rows while an operation runs.** `stocktake` locks its counts while the sheet is submitted. Its counts are a
tagged union, and `update` stores what is typed in the case `Open` alone:

```ts
type Counts = Data.TaggedEnum<{
  Open: { lines: ReadonlyArray<Line>; error: Opt.Option<string> }
  Locked: { lines: ReadonlyArray<Line> }
}>
```

The model holds `{ _tag: 'CountTyped', id }` for each row while the counts are `Open`, and nothing while they are
`Locked`. Its view then shows an editor only where `update` stores what is typed. In the same states, the parent's
`update` rejects the parent's own messages for a row, such as a scan.

**Keep what the user types in the case of the state where it can be typed.** The lock is then the shape of the state,
and no condition beside it: `update` and `makeModel` read the same case.

The values of the rows are part of the parent's own state. The parent's `update` reads them to total or submit them.
Where a row is a child instead, the parent reads only what the row declares as its `output` (see
[outputs](./events-and-external-messages.md#outputs)).

See [`stocktake`](../../examples/stocktake/stocktake.ts).

## Do and don't

Each pair sums up a rule of this page. The rule itself is above.

| Do                                                                              | Don't                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Hold what an element gives in the model, without its value, and fill it.        | Build the message of a value in the view.                           |
| Lock the fields while an operation runs: a case in which `update` rejects them. | Keep the fields in a case where `update` stores them while it runs. |
