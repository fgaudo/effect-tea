---
title: Inputs the user types into
---

# Inputs the user types into

## In short

This page shows how a program holds a value that the user types, such as the text of a field. Such a value comes from
the user, not from the program.

- The program declares a place in its state for such a value: an input.
- The view sends what the user writes, as a write over the value that its model holds.
- The library stores the write, or rejects it. No `update` of the program is involved.

## An example

The form declares its input `Name` at the field `name` of its state (`examples/form/form.ts`):

```ts
inputs: { Name: input({ at: Optic.id<State>().key('name') }) },
```

The form's view draws its field with the snabbdom bridge: `shows(model.name, forwardTo(dispatch, 'Name'))`
(`examples/form/view-snabbdom.ts`). The bridge makes the write with `edited`, over what the element showed (see
[the element on screen](#the-element-on-screen)).

In general, a view writes over the value its model holds, through the input's dispatch:

```ts
{ _tag: 'Written', was: model.name, value: text }
```

## Rules

- **What the user gives an input is no message of the program.** No `update` of the program sees it.
- **The program declares where it goes**: `inputs: { Name: input({ at }) }` in `make`.
  - `at` is an optic to a plain value of the program's state. In place of `at`, you can give `get` and `set` (see
    [declaring children](./composition.md#declaring-children)).
  - An optic that may focus nothing, as one composed with `Optic.some()`, declares an input that is not always there.
  - `inputById` declares an input by id, one for each row. The view writes into it through
    `forwardTo(dispatch, 'Count', id)` (see [inputs by id](#inputs-by-id)).
- **The view writes over the value its model holds**: `{ _tag: 'Written', was: model.name, value: text }`, through
  `forwardTo(dispatch, 'Name')`.
- **The library stores what is written, whatever it is**, in every state where the value in the input's place equals,
  by `Equal`, the value that the write was written over.
- **The library rejects the write in any other state.** In such a state, the state has moved on without the input that
  wrote it. A state where the input's optic focuses nothing, or where its `get` returns `None`, is one of them.
- **The program changes an input by leaving another value in its place**, such as `name: ''`.
- **An input keeps nothing of its own.** The state stored is the state that the program wrote. A test compares that
  state whole.
- **Only what is drawn writes into an input.** A subscription and a command answer with messages of the program. The
  program's `update` puts the value in the input's place, or keeps the value in the state until the program chooses to
  put it there.

### The element on screen

This section gives the rule in short. The exact rule is in [settling an element](#settling-an-element).

**A frame may be older than the user's last keystroke.** So a bridge that writes each frame's value into the element of
an input can take back what the user has just typed.

**A bridge asks the library instead.** The bridge keeps the element of each input, and asks the library what to make of
that element:

- When the user edits the element, `edited(held, value)` gives the write to send, over what the element showed. Given
  the number that the dispatch returns, `edited` also gives what the element then holds.
- After each frame, `drawn(held, value, seen)` gives what the element then holds, `shown`, and whether the element
  takes the frame's value, `taken`. When the value is taken, the bridge writes that value into the element.

**The element stays as it is while the frame is the element's own past or present.** "The element's own past or
present" means that the frame holds one of two states:

- a state from before the writes that the frame has not seen: the element's past;
- a state after all of the element's writes: the element's present.

The element takes the frame's value once the state has moved on without the element. So the element is never replaced,
and keeps its focus while the program changes what it shows.

The examples' bridges show this rule, and you can copy them: [`form`](../../examples/form) draws its input with
snabbdom and with React.

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

- **A write into an input by id names its id**: `{ _tag: 'Count', id, message: { _tag: 'Written', was, value } }`,
  through `forwardTo(dispatch, 'Count', id)`.
- **A write is stored at the place of its id**, by the rule of every input (see [the rules](#rules), and
  [the rule of an input](./composition.md#what-the-library-derives)). The write is rejected where the optic of its
  id focuses nothing, or where `get` returns `None`: for example, for a row that is not there.

**Lock the rows while an operation runs.** A `get` that returns `None` gives a write no place, and the write is
rejected. So a parent locks every row by giving no place while it saves. Its model then shows no editor. `stocktake`
does this while the sheet is submitted:

```ts
Count: inputById({
  get: (state, id: string) =>
    Opt.flatMap(Opt.filter(sheetOf(state), isOpen), (sheet) =>
      Opt.map(Arr.findFirst(sheet.lines, (line) => line.id === id), (line) => line.text)),
  set: (state, id, text) =>
    Opt.match(sheetOf(state), {
      onNone: () => state,
      onSome: (sheet) => withSheet(state, withText(sheet, id, () => text)),
    }),
}),
```

In the same states, the parent's `update` rejects the parent's own messages for a row, such as a choice from a list.

Like an input, an input by id is not a child (see [the parent's inputs](./composition.md#the-parents-inputs)). Its
values are part of the parent's own state. The parent's `update` reads them to total or submit them. The parent never
reads the state of a child (see [splitting a program](./structuring-a-program.md#splitting-a-program)).

See [`stocktake`](../../examples/stocktake/stocktake.ts).

## Do and don't

Each pair sums up a rule of this page. The rule itself is above.

| Do                                                                       | Don't                                                                             |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Write over the value the model holds: `was: model.name`.                 | Write over a value other than the one the model holds.                            |
| Let the bridge settle the element with `drawn` after each frame.         | Write each frame's value into the element: it can take back what the user typed.  |
| Answer in a subscription or a command with a message of the program.     | Write into an input from a subscription or a command.                             |
| Lock the rows while an operation runs, with a `get` that returns `None`. | Keep the rows' places while the operation runs: their writes can still be stored. |

## Precisely

### Settling an element

After each frame, a bridge settles the element of each input with `drawn(held, value, seen)`. `drawn` is given:

- `held`, what the element holds, or `undefined` for an element just made;
- `value`, the input's value in the frame;
- `seen`, the frame's own `seen`.

`drawn` gives what the element then holds, `shown`, and whether the element takes the frame's value, `taken`. When the
value is taken, the bridge writes `shown.value` into the element.

There are three cases:

- **A new element** shows the frame's very `value`. It is always taken.
- **The element's own past or present.** The frame holds, by `Equal`:
  - when the frame has not seen all the element's writes, what the element showed before the first of them;
  - when the frame has seen them all, what the element shows.

  The element stays as it is, showing the very value it held, and is not taken. Only the writes that the frame has seen
  are forgotten.
- **A state that has moved on without the element**, in any other case. The element forgets all its writes. The writes
  that the frame has not seen are rejected, unless the input's place again holds the value they were written over (see
  [two limits](#two-limits)). The element shows the frame's very `value`. It is taken, unless it is the very value that
  the element showed.

`drawn` tells which writes a frame has seen by the numbers that `sent` was given. So a bridge calls the `sent` of
`edited` once, with the number that its dispatch returned for that write. Otherwise `drawn` may replace what the user
typed.

### Which elements and renderers this holds for

With a bridge that settles them with `drawn`, the element of an input:

- never takes back what the user typed since the frame;
- shows the program's value once the state has moved on without the element.

That holds for elements and renderers that meet one condition, in two parts:

- **The element**: its value changes only by an edit of the user, which it reports with the whole value, or by the
  bridge.
- **The renderer**: after each frame, and before the user can act on it, it lets the bridge reach the element of each
  input, with the frame's value and `seen`.

What meets it, and what does not:

- **A native text field meets it**, except for what changes its value without reporting an edit:
  - a reset of its form;
  - a value written into it that it sanitizes, such as one with a line break.

  The examples' bridges do not handle these (see [what is left out](./writing-a-bridge.md#what-is-left-out)).
- **A renderer that draws each frame at once meets it.**
- **A widget that changes its own value does not**, native or not. A range input is one: it changes its own value when
  its bounds narrow. Such a widget is outside what is promised here, unless its bridge reports each such change as an
  edit.
- **Or the widget is replaced by one the program draws.** That widget is not an input: a press is a message of the
  model, and a drag is the messages of a subscription keyed by the state of dragging. The sliders of
  [`volume`](../../examples/volume) are drawn this way.

The bridges' tests check it, in a DOM.

### Two limits

A message names a place. That leaves two limits, and neither corrupts the state:

- **A write over a value that came back is stored**, for example:
  - the same text after a reset or an undo;
  - a write at the id of an input by id whose row was removed, when another row was added at that id with the value
    written over.

  Such a write is what the user typed over what they saw.
- **A message drawn for an old instance of a child reaches the new one.** There, `update` decides.
