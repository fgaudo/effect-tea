---
title: Inputs the user types into
---

# Inputs the user types into

## In short

This page shows how a program holds a value that the user types, such as the text of a field. Such a value comes from
the user, not from the program.

- The program declares a place in its state for such a value: an input.
- The view sends what the user writes, as a write of the value that the element holds.
- The library stores the write where the input's place is there, and rejects it where it is not. No `update` of the
  program is involved.

## An example

The form declares its input `Name` at the field `name` of its state (`examples/form/form.ts`):

```ts
inputs: { Name: input({ at: Optic.id<State>().key('name') }) },
```

The form's view draws its field as a controlled element, with the snabbdom bridge (`examples/form/view-snabbdom.ts`).
The element's `value` is `model.name`, and its handler writes what the element holds through
`forwardTo(dispatch, 'Name')` (see [the element on screen](#the-element-on-screen)).

In general, a view writes the value that the element holds, through the input's dispatch:

```ts
{ _tag: 'Written', value: text }
```

## Rules

- **What the user gives an input is no message of the program.** No `update` of the program sees it (see
  [why](#why-what-the-user-types-is-no-message)).
- **The program declares where it goes**: `inputs: { Name: input({ at }) }` in `make`.
  - `at` is an optic to a plain value of the program's state. In place of `at`, you can give `get` and `set` (see
    [where a child lives](./composition.md#where-a-child-lives), which says when to give each).
  - An optic that may focus nothing, as one composed with `Optic.some()`, declares an input that is not always there.
  - `inputById` declares an input by id, one for each row. The view writes into it through
    `forwardTo(dispatch, 'Count', id)` (see [inputs by id](#inputs-by-id)).
- **The view writes what the element holds**: `{ _tag: 'Written', value: text }`, through
  `forwardTo(dispatch, 'Name')`.
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

**The view draws the element of an input as a controlled element.** The element's value is the one its model holds,
and its handler writes what the element holds. A write is applied in its own event. So when the handler returns, the
state holds what was typed, or has rejected it. The element is then drawn again with the value of the new model,
before the next event.

How each bridge keeps the element so, and which elements it draws, is in
[a controlled element](./writing-a-bridge.md#a-controlled-element): [`form`](../../examples/form) draws its input with
snabbdom and with React.

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
  goes then is the browser's, and is not promised: Chromium puts it at the end of the text.
- **Format the text in the element, before the write.** A limit that the element keeps by itself, such as
  `maxlength`, needs nothing: the element reports the value that it holds. A mask changes the element's own value. So
  it is outside what this page promises, as any value that an element changes by itself is (see
  [what is left out](./writing-a-bridge.md#what-is-left-out)). The package's bridges show no mask.

## Inputs by id

A value that the user types into each row, such as the count of each item, is an input by id. Use `inputById` instead
of `input`. Give the place of each id in the same ways as for a child by id (see
[children by id](./composition.md#children-by-id)): an optic that is a function of the id, or `get` and `set` that take
the id.

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
are `Locked`, `atOpen` focuses nothing. So `get` returns `None`, and `set` leaves the state as it is.

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
values are part of the parent's own state. The parent's `update` reads them to total or submit them. The parent never
reads the state of a child (see [splitting a program](./structuring-a-program.md#splitting-a-program)).

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

### A limit

A message names a place, not an instance. So a message drawn for an old instance reaches the new one at the same
place, and this does not corrupt the state:

- **A write at the id of an input by id whose row was removed is stored**, when another row was added at that id.
- **A message drawn for an old instance of a child reaches the new one.** There, `update` decides.
