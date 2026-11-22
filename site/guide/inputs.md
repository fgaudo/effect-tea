---
title: Inputs
---

# Inputs

## In short

This page shows how a program holds a value that an element holds or reports: the text of a field, the mark of a
checkbox, the offset of a scroll, a measured size. Such a value comes from the element, not from the program. The text
that the user types is the first case, and the one this page shows first.

- The program declares a place in its state for such a value: an input.
- The view sends the value that the element holds or reports, as a write.
- The library stores the write where the input's place is there, and rejects it where it is not. No `update` of the
  program is involved.

## An example

The form declares its input `Name` at the name of its draft, in the case `Editing` where the name can be typed
(`examples/form/form.ts`):

```ts
inputs: { Name: input({ at: Optic.id<State>().key('draft').tag('Editing').key('name') }) },
```

While the form saves, its draft is `Saving`. The optic then focuses nothing, and a write is rejected (see
[the rules](#rules)).

The form's view draws its field as a controlled element, with the snabbdom bridge (`examples/form/view-snabbdom.ts`).
The element's `value` is `model.name`. Where the model shows an editor, its handler writes what the element holds
through `forwardTo(dispatch, 'Name')` (see [the element on screen](#the-element-on-screen)).

In general, a view writes the value that the element holds, through the input's dispatch:

```ts
{ _tag: 'Written', value: text }
```

## Rules

- **What the user gives an input is no message of the program.** No `update` of the program sees it (see
  [why](#why-what-the-user-types-is-no-message)).
- **The program declares where it goes**: `inputs: { Name: input({ at }) }` in `make`.
  - `input` and `inputById` come from `program`, as `make` does:
    `const { make, input } = program<{ state: State }>()`.
  - `at` is an optic to a plain value of the program's state, an `Optic` of Effect:
    `Optic.id<State>().key('name')`. In place of `at`, you can give the two functions that an optic is: `get` and
    `set`.
  - Give an optic where the place is a path into the state: a field, a case of a tagged union, a key of a record.
  - Give `get` and `set` where the place must be found: an element of an array that a predicate picks, such as a row
    found by its id. No path leads to such an element, because its index changes as the array does.
  - An optic that may focus nothing, as one composed with `Optic.some()`, declares an input that is not always there.
- **A `set` changes its place, and nothing else.** A `set` puts the value it is given at the place that `get` reads,
  and changes nothing else of the state, as an optic does.
  - A `set` that does more is not supported. The library need not call `set` where nothing is to be stored, as for a
    write equal to the value held. So what else a `set` did would follow some writes and not others.
  - Compute what follows a write where the state is read, in `update` and `makeModel`.
  - A `set` may store the value in another form. This is the one exception (see
    [what is typed, in another form](#what-is-typed-in-another-form)).
  - `inputById` declares an input by id, one for each row. The view writes into it through
    `forwardTo(dispatch, 'Count', id)` (see [inputs by id](#inputs-by-id)).
- **The view writes what the element holds**: `{ _tag: 'Written', value: text }`, through
  `forwardTo(dispatch, 'Name')`. An element that reports a value, as a scroll reports its offset, writes it the same
  way (see [what an element reports](#what-an-element-reports)).
- **The library stores what is written, whatever it is**, in every state where the input's place is there, whatever
  else the state says. A value equal, by `Equal`, to the one the place holds leaves the very same state.
- **The library rejects the write where its place is not there**: in a state where the input's optic focuses nothing,
  or where its `get` returns `None`.
- **The program changes an input by leaving another value in its place**, such as `name: ''`.
- **An input keeps nothing of its own.** The state stored is the state that the program wrote. A test compares that
  state whole.
- **Only what is drawn writes into an input.** A subscription and a command answer with messages of the program. The
  program's `update` puts the value in the input's place, or keeps the value in the state until the program chooses to
  put it there.

### The element on screen

**The view draws an element that holds the value of an input as a controlled element.** The element's value is the
one its model holds, and its handler writes what the element holds. A write is applied in its own event. So when the
handler returns, the state holds what was typed, or has rejected it. The element is then drawn again with the value of
the new model, before the next event.

How each bridge keeps the element so, and which elements it draws, is in
[a controlled element](./writing-a-bridge.md#a-controlled-element): [`form`](../../examples/form) draws its input with
snabbdom and with React.

### What an element reports

An element reports some values that the program cannot give back to it: the offset of a scroll, a measured size. The
place of such a value is an input too, declared and written as any other.

- **The rule of an input holds, and nothing is promised of the element.** A write is stored where its place is there,
  and rejected where it is not. A value that the program leaves in such a place is not shown: the package's bridges
  give an element back its `value` and its `checked` alone (see
  [a controlled element](./writing-a-bridge.md#a-controlled-element)).
- **What is there whatever is drawn is a subscription.** A value of an element that the view draws is a write. The size
  of the window, or a key pressed anywhere on the page, is there whatever the view draws. It comes from a subscription
  to a service (see [subscriptions](./subscriptions.md)).
- **A fact that comes with a value is a write, then a message.** The end of a scroll comes with its offset. The handler
  writes the offset, then sends the message that its model holds, and `update` reads the offset from the state. This
  holds by what [guarantees](./guarantees.md#what-you-can-rely-on) promises already. A message is applied in the call
  that sends it, so the write is stored before the message is sent. The message comes from a model that the write has
  moved past, and `update` judges it in the new state, as it judges any message.
  - This is also how a value is written once, as the scroll ends, where a write at each event costs too much (see
    [what is left to you](./guarantees.md#what-is-left-to-you)).

What a model shows of such a value is in [a value that an element reports](#a-value-that-an-element-reports).

### What is typed, in another form

The library stores what is written as it is, because the element already shows that value. A program that wants the
value in another form has four ways:

- **Parse the text where the program reads it.** The state holds the text as typed. A function of the program says
  what the text means, to `update` and to `makeModel`. `stocktake` reads each count with `countOf`: a whole number,
  nothing typed, or anything else.
- **Replace the text on a message of the program.** `update` leaves another value in the input's place: for example,
  the name without the spaces around it, when the user saves. The element is then drawn with the program's value (see
  [the element on screen](#the-element-on-screen)).
- **Change the text as it is stored, in `set`.** A `set` may store another value than the one written: for example,
  the text in capitals. The element is then drawn with the value stored, at once, and keeps its focus. Where the caret
  goes then is the browser's, and is not promised: Chromium puts it at the end of the text. This is the one exception
  to the rule of a `set` (see [the rules](#rules)). The input gives `get` and
  `set` in place of `at`:

  ```ts
  inputs: {
    Note: input({ get: (state) => Opt.some(state.note), set: (state, note) => ({ ...state, note: note.toUpperCase() }) }),
  },
  ```

- **Format the text in the element, before the write.** A limit that the element keeps by itself, such as
  `maxlength`, needs nothing: the element reports the value that it holds. A mask changes the element's own value. So
  it is outside what this page promises, as any value that an element changes by itself is (see
  [what is left out](./writing-a-bridge.md#what-is-left-out)). The package's bridges show no mask.

## Inputs by id

A value that the user types into each row, such as the count of each item, is an input by id where the program that
holds the rows uses it (see [splitting a program](./structuring-a-program.md#splitting-a-program)). Use `inputById`
instead of `input`. Give the place of each id in the same ways as for an input alone, as functions of the id: an optic
that is a function of the id, or `get` and `set` that take the id.

Rows kept in a record by id are reached with an optic of the id:

```ts
inputs: {
  Count: inputById({ at: (id: string) => Optic.id<State>().key('rows').at(id).key('count') }),
},
```

Rows kept in an array are found with `get` and `set`, which take the id:

```ts
inputs: {
  Count: inputById({
    get: (state, id: string) => Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.count),
    set: (state, id, count) => ({ rows: state.rows.map((row) => (row.id === id ? { ...row, count } : row)) }),
  }),
},
```

- **A write into an input by id names its id**: `{ _tag: 'Count', id, message: { _tag: 'Written', value } }`,
  through `forwardTo(dispatch, 'Count', id)`.
- **A write is stored at the place of its id**, by the rule of every input (see [the rules](#rules), and
  [the rule of an input](./composition.md#what-the-library-derives)). The write is rejected where the optic of its
  id focuses nothing, or where `get` returns `None`: for example, for a row that is not there.

**Lock the rows while an operation runs.** A `get` that returns `None` gives a write no place, and the write is
rejected. So a parent locks every row by giving no place while it saves. Its model then shows no editor. `stocktake`
does this while the sheet is submitted. Its counts are a tagged union, and only the case `Open` is a place to write
into:

```ts
type Counts = Data.TaggedEnum<{
  Open: { lines: ReadonlyArray<Line>; error: Opt.Option<string> }
  Locked: { lines: ReadonlyArray<Line> }
}>

const atOpen = atCounts.tag('Open')

const counts = inputById({
  get: (state, id: string) =>
    Opt.flatMap(read(atOpen)(state), ({ lines }) =>
      Opt.map(Arr.findFirst(lines, (line) => line.id === id), (line) => line.text)),
  set: (state, id, text) => atOpen.modify(withText(id, () => text))(state),
})

inputs: { Count: counts },
```

Here `atCounts` is an optic to the counts, and `read` gives what an optic focuses on, as an `Option`. While the counts
are `Locked`, `atOpen` focuses nothing. So `get` returns `None`, and the write is rejected.

**Keep what the user types in the case of the state where it can be typed.** The lock is then the shape of the state,
and no condition beside it: the input, `update` and `makeModel` read the same case. In `stocktake`, a `set` that wrote
into the locked counts would not compile. A `get` that read them would compile: a test checks that a write into a
locked row is rejected.

**The model can read the place through the input.** What `input` and `inputById` return has the `get` of the place.
Declare the input beside `make`, and `makeModel` can call that `get`. `stocktake` draws a count as editable exactly
where `counts.get(state, id)` is `Some`. Its view then shows an editor only where a write has a place. An input on an
optic that always focuses is read from the state, as `state.name`.

In the same states, the parent's `update` rejects the parent's own messages for a row, such as a choice from a list.

Like an input, an input by id is not a child (see [the parent's inputs](./composition.md#the-parents-inputs)). Its
values are part of the parent's own state. The parent's `update` reads them to total or submit them. Where a row is a
child instead, with an input of its own, the parent reads only what the row declares as its `output` (see
[outputs](./events-and-external-messages.md#outputs)).

See [`stocktake`](../../examples/stocktake/stocktake.ts).

## Do and don't

Each pair sums up a rule of this page. The rule itself is above.

| Do                                                                       | Don't                                                                             |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Answer in a subscription or a command with a message of the program.     | Write into an input from a subscription or a command.                             |
| Lock the rows while an operation runs, with a `get` that returns `None`. | Keep the rows' places while the operation runs: their writes can still be stored. |

## Precisely

### Why what the user types is no message

A text field could send a message for each keystroke, with the text in it, and `update` could store the text. An input
is there instead, for two reasons:

- **There is nothing to decide.** A click says that something happened, and `update` decides what it means. A text is
  different: the element already shows it. The one question is whether the input's place is still there. The answer
  is the same for every input. So the library keeps the rule, and a view and a test rely on the same one.
- **The model could not hold the message.** Every message that a view can send is in the model, as a value that the
  program fixed (see [model](./model.md)). A text is known only when the user types it. So the model would hold a
  function from the text to a message, and a model holds no function.

So no `update` runs when the user types. A program that must act on what is typed does not wait for a message:

- What the text says, such as whether a name is blank, `update` and `makeModel` compute from the state where they
  read it.
- Work that follows the text, such as a search while the user types, is a subscription with the text in its key. A
  new value of the key starts the subscription anew (see [subscriptions](./subscriptions.md)).

### A value that an element reports

What a model shows of a value that an element reports, as the offset of a scroll:

- **The model says where the element reports.** It does so by its case: the case in which the view gives the element
  its handler. So "a view writes only into the inputs that the model shows" holds as it is (see
  [model](./model.md)).
- **The model holds the value only where the view draws by it.** A model that holds an offset is a new model at each
  event of the scroll.
- **A test writes a value other than the one the state holds**, since the model does not show it (see
  [testing](./testing.md#the-reader)).

### A limit

A message names a place, not an instance. So a message drawn for an old instance reaches the new one at the same
place, and this does not corrupt the state:

- **A write at the id of an input by id whose row was removed is stored**, when another row was added at that id.
- **A message drawn for an old instance of a child reaches the new one.** There, `update` decides.
