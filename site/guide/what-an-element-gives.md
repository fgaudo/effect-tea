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
- **A message that an element fills is a plain tagged one.** A message that is a class, as a `Data.TaggedClass`, is no
  plain object: a spread of it is not an instance of the class, nor equal to one.
- **A lock is a case of the state** in which `update` rejects the message, and the model holds none. So the view draws
  no handler there, and a message sent from a model drawn before the lock is rejected, as any message is that does
  not apply.

### The element on screen

**The view draws an element that holds a value as a controlled element.** The element's value is the one its model
holds, and its handler sends the message that its model holds for it, filled with what the element holds. A message
is applied in the call that sends it, so when the handler returns, the state holds what was typed, or has rejected it.

How each bridge keeps the element so, and which elements it draws, is in
[a controlled element](./writing-a-bridge.md#a-controlled-element): [`form`](../../examples/form) draws its field with
snabbdom and with React.

### What an element reports

An element reports some values that the program cannot give back to it: the offset of a scroll, a measured size, the
point of a press.

- **A value that the program keeps is a message**, held and filled as any other. Nothing is promised of the element:
  the package's bridges give an element back its `value` and its `checked` alone (see
  [a controlled element](./writing-a-bridge.md#a-controlled-element)).
- **What is there whatever is drawn is a subscription.** A value of an element that the view draws comes from its
  handler. The size of the window, or a key pressed anywhere on the page, comes from a subscription to a service (see
  [subscriptions](./subscriptions.md)).

### In each row

A value that the user types into each row, such as the count of each item, is a message that names the row, held with
its id: `{ _tag: 'CountTyped', id }`. The view fills the text. `update` stores it in the row, and rejects it for a row
that is not there. See [`stocktake`](../../examples/stocktake/stocktake.ts).

## Advice

- **Where an element reports a value at each of its events, send it once, as the events end**, as the offset of a
  scroll when the scroll ends. Each message runs a step in the handler (see
  [what is left to you](./guarantees.md#what-is-left-to-you)). It does not hold where the program follows each value,
  as a slider's.
- **Hold a value that an element reports in the model only where the view draws by it.** A model that holds the
  offset of a scroll is a new model at each event of the scroll.
- **Keep what the user types in the case of the state where it can be typed.** The lock is then the shape of the
  state, and no condition beside it: `update` and `makeModel` read the same case. `stocktake` locks its counts while
  the sheet is submitted. `update` stores what is typed in the case `Open` alone, and the model holds
  `{ _tag: 'CountTyped', id }` for each row while the counts are `Open`, and nothing while they are `Locked`:

  ```ts
  type Counts = Data.TaggedEnum<{
    Open: { lines: ReadonlyArray<Line>; error: Opt.Option<string> }
    Locked: { lines: ReadonlyArray<Line> }
  }>
  ```

  A text field that the state locks is drawn `readOnly`, not `disabled`, so that it keeps the focus: a browser takes
  the focus from an element disabled as the screen refreshes, as the view of [`form`](../../examples/form) shows.

- **Store the text as it is typed, and say what it means where the program reads it.** The element already shows the
  text as it is typed. A function of the program says what the text means, to `update` and to `makeModel`:
  `stocktake` reads each count with `countOf`, as a whole number, nothing typed, or anything else. It does not hold
  where the program changes the text itself:
  - on another message, as the name without the spaces around it, when the user saves;
  - or at once, as the text in capitals. The element is then drawn with the text stored, and keeps its focus. Where
    the caret goes then is the browser's, and unspecified.

  A limit that the element keeps by itself, such as `maxlength`, needs nothing: the element reports the value that it
  holds. A mask changes the element's own value, and the bridges promise nothing of a value that an element changes by
  itself (see [what is left out](./writing-a-bridge.md#what-is-left-out)). The package's bridges show no mask.

## More examples

This section explains, and adds no rule.

**A fact that comes with a value**, as the end of a scroll with its offset, is held and filled as any other. `update`
decides what the offset means:

```ts
// In makeModel, in the case where the list reports the end of its scroll.
scrollEnded: { _tag: 'ScrollEnded' } as const,

// In the view: the handler of the list's `scrollend`.
scrollend: (event) => dispatch({ ...model.scrollEnded, offset: (event.currentTarget as HTMLElement).scrollTop }),
```

[`volume`](../../examples/volume/view.ts) does this for a press on a track. The view fills the `clientX` of the event,
and the `left` and the `width` of the track, and `update` computes the point.
