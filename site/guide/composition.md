---
title: Composition
---

# Composition

## In short

A child is any program. A parent declares its children, and its inputs, with `composition`, and says where each child
lives in its state. The library does the routing. A parent and its children talk only through events and external
messages.

## An example

An app of two pages, a clock and an about page, adapted from
[`pages`](../../examples/pages/app.ts):

```ts
const { child, compose } = composition<{ state: State }>()

const state = Optic.id<State>()

export const app = compose({
  init: (children) => ({
    state: { clock: children.Clock.init.state, maybeAbout: Opt.none() },
    commands: children.Clock.init.commands,
  }),
  children: {
    Clock: child(Clock.clock, {
      at: state.key('clock'),
      // Hidden under About, the clock keeps its state but stops ticking.
      subscribed: (state) =>
        Opt.isNone(state.maybeAbout) ? Opt.some(state.clock) : Opt.none(),
    }),
    // Closed, About is not there: the optic focuses nothing.
    About: child(About.about, { at: state.key('maybeAbout').compose(Optic.some()) }),
  },
  onEvent: {
    // About starts from the time the Clock showed, its flags; a double click opens it once.
    Clock: (event, children) => (state) => {
      if (Opt.isSome(state.maybeAbout)) return { state }
      const about = children.About.init({ openedAt: event.at })
      return {
        state: { ...state, maybeAbout: Opt.some(about.state) },
        commands: about.commands,
      }
    },
    About: () => (state) => ({ state: { ...state, maybeAbout: Opt.none() } }),
  },
  // Only the page on top is drawn.
  makeModel: (state, children) => ({
    page: Opt.isNone(state.maybeAbout)
      ? { _tag: 'Clock' as const, model: children.Clock(state) }
      : { _tag: 'About' as const, model: children.About(state) },
  }),
})
```

## Declaring children

For each child, and for itself, a parent declares:

- **Where the child lives: `at`.** It is an optic into the parent's state, Effect's `Optic`:
  `Optic.id<State>().key('clock')`. For a child that may not be there, add `.compose(Optic.some())`. In place of an
  optic, give the two functions an optic is, `get` and `set`.
- **When the child is not there.** Where the optic focuses nothing, or `get` returns `None`, the child is not there.
- **When its subscriptions run: `subscribed`.** By default, they run whenever the child is there.
- **How it starts.** A parent's `init` is a function of `children`, so that a child that is there from the start is
  started like any other. `children.Clock.init` holds the child's state and its commands, lifted. Reading
  `Clock.clock.init.state` instead would leave its commands behind.
- **A child with `flags`** is started from them: `children.About.init({ openedAt })`, and `init(id, flags)` for
  children by id.
- **What the parent draws: `makeModel`**, from its state and its children's models.
- **Its own messages, commands and subscriptions,** if it has any: `update`, `runCommand` and `subscriptions`. Its
  `update` takes `children` too. It may reject its own messages, as any `update` does. Its commands need the services
  that its `runCommand` and its children's commands need. Its subscriptions need the services that its own
  `subscriptions` and its children's need. Nothing names them.
- **Its own types, by name: `composition<{ state: State }>()`.** Besides `state`, they name the parent's own commands
  (`command`), the events it raises (`event`), and which of its messages a parent of its own may send it (`external`),
  if it has any. Nothing given to `compose` reveals them: a type that it does not name is a type that it does not have,
  and a parent that raises an event it did not name does not compile.
- **The parent's own flags,** if it has any, are declared with its other types:
  `composition<{ state: State; flags: Flags }>()`. Its `init` then returns the function that starts it:
  `init: (children) => (flags) => ({ state, commands })`.
- **Its inputs,** if it has any: `inputs: { Name: input({ at }) }`, where `at` is an optic to a value of its own state
  (see [inputs the user types into](./inputs-the-user-types-into.md)), and `inputById` for inputs by id (see
  [inputs by id](#inputs-by-id)). An input is placed in the same ways as a child: with `at`, or with `get` and `set`.
  An input by id is placed in the same ways, as functions of the id. An input is not a child: its value is part of the
  parent's own state, and the parent's `update` and `makeModel` read it like the rest of the state. A program with
  inputs and no children is made with `composition` too, and leaves `children` out.

### What the library derives from it

- **The parent's messages** are its own, plus `{ _tag: <child>, message }` for each child
  (`{ _tag: <child>, id, message }` for children by id), and
  `{ _tag: <input>, message: { _tag: 'Written', was, value } }` for each input (`{ _tag: <input>, id, message }` for
  inputs by id).
- **The parent's commands** are its own, plus each child's, wrapped likewise and run by the child's `runCommand`.
- **The parent's subscriptions** are its own, plus each child's under `[<child>, key]` (`[<child>, id, key]` for
  children by id).

`MessageOf<typeof app>` names the parent's messages. More on each is in [commands](./commands.md),
[subscriptions](./subscriptions.md) and [children's views](#childrens-views).

- **A child's model is kept.** `children.About(state)` in `makeModel` is the child's model. It is the same object while
  the child's state is the same object. So a renderer can skip redrawing it (see `thunk` in
  [`pages`](../../examples/pages/view.ts)). A number or a string has no
  identity by which a model could be kept: this is why a program's state is always an object.
- **A test reads a child's subscriptions by key.** `HashMap.has(subscriptionsOf(app)(state), ['Clock', 'ticks'])`
  tells a test whether the Clock ticks.
- **Its inputs' rule.** A write is stored while the input's place holds, by `Equal`, the value it was written over. It
  is rejected otherwise. Every other step leaves an input as that step wrote it.

### Precisely

**`runCommand`** is required exactly when the parent has commands of its own.

**What does not compile:**
- a message of the parent's own that takes the name of a child or of an input;
- an input that takes the name of a child;
- an input whose optic, alone or by id, points into a state other than the program's;
- a subscription of the parent's own that writes into an input;
- a command's answer that writes into an input, the parent's or a child's, and one that gives a child a message that is
  the child's own business;
- a child with commands and no `runCommand` (a program written without `Program<…>` can be one).

A command's answer is a message of the parent's own, or an external message of a child.

**What is a defect** (a `CompositionDefect`):
- a child with commands and no `runCommand` that gets there through a cast: the defect comes when its command runs;
- a child with events and no handler in `onEvent` that gets there through a cast: the defect comes when it raises one;
- a child whose state is not an object, which only a cast gets there: the defect comes when its model or its
  subscriptions are made;
- a subscription key of the parent's own that is the key of a child's subscription;
- a `subscribed` that lists one id twice;
- asking for the model of a child that is not there.

## Events and external messages

A parent and its children talk only through events and external messages.

- **A child raises an event** to ask its parent for something, like leaving the page.
- **The parent handles it in `onEvent`**, which has one handler per child that has events, so that no event goes
  unhandled. A handler is `(event, children) => (state) => step`. For children by id, the id comes before the event:
  `(id, event, children) => (state) => step`.
- **An event to pass on.** When the parent has nothing to say about an event, and its own parent handles it, the parent
  raises it as its own: `onEvent: { Products: (event) => (state) => ({ state, events: [event] }) }`.
- **A parent sends an external message** to a child with `children.<child>.update`, in its own `update` and `onEvent`.
  It is one of the messages the child's type declares as `external` (e.g. a back button). The parent decides when to
  send, and the child's type says it takes the message. In the child's type, `external` names some of the child's
  messages, for example `Data.TaggedEnum.Value<Message, 'Halted'>` in [`list`](../../examples/list/stopwatch.ts).
- **The child answers in every state**, with its state or with an event, never with `reject`.

A back button closes what the page has open, or the page asks to be left:

```ts
// In the page: back always means something.
case 'BackPressed':
  return state.menu._tag === 'Open'
    ? { state: { ...state, menu: { _tag: 'Closed' } } }
    : { state, events: [{ _tag: 'LeaveRequested' }] }

// In its parent: what the page asks for, in the same step.
update: (_: BackPressed, children) => children.Page.update({ _tag: 'BackPressed' }),
onEvent: { Page: () => (state) => ({ state: leavePage(state) }) },
```

`children.Page.update` returns the parent's step, as a function of its state. To take a step of its own before the
child's step, a parent combines the two:

- **`andThen`**: `andThen(leave(state), children.Home.update({ _tag: 'ProductGone', at }))`. The result has the second
  step's state, and both steps' commands and events, in order, both lists always there. If you take a step's `.state`
  by hand to make the next step, you drop its commands and its events.
- **`forEach`** is the `andThen` of many: one step for each item, each made from the state the previous one left. The
  result has the last step's state, and every step's commands and events, in order, both lists always there. For
  example, a message to every child by id:
  `forEach({ state }, state.rows, ({ id }) => children.Row.update(id, Cleared()))`.

Both also have a form that takes the step last, for a chain written with Effect's `pipe`:
`pipe({ state }, andThen(leave), forEach(ids, clear))`.

**A child that must wait for its parent.** Sometimes an operation of the parent, such as a payment, must stop its
children from acting. First ask whether they are children at all: a part whose controls the parent would lock from
its state is not one (see [splitting a program](./structuring-a-program.md#splitting-a-program)). A part that has
commands or subscriptions of its own may still be one. Then the operation is a fact that all the children see as
one, and the parent hands it down:
- it sends each child an external message when the operation starts, and another when it ends (with `forEach` for
  children by id);
- the child keeps the fact in its state;
- while the fact holds, the child's `update` rejects what its view sends, but still takes the answers of its
  commands;
- the `get` of its inputs returns `None`, so their writes are rejected, and its model shows no controls.

### Precisely

- **`onEvent`** is required exactly when a child has events.
- **A parent that raises a child's event as its own** has an `Event` that includes the child's, or this does not
  compile.
- **A rejection of an external message is a defect**: a `CompositionDefect` that names the child, and names the
  message by its tags. So is sending an external message to a child that is not there.

## Children's views

- **A child's view gets a dispatch of its own.** It sends the child's own messages: `forwardTo(dispatch, 'Clock')`
  wraps them as the parent receives them.
- **That dispatch is the same function in every frame.** It is the same every time it is asked for with the same
  dispatch, name and id. So a view memoized on its model and its dispatch is drawn again only when its model changes.

```ts
const view: View<Model, Message> = (model, dispatch) =>
  model.page._tag === 'Clock'
    ? thunk('main', 'clock', clockView, [
      model.page.model,
      forwardTo(dispatch, 'Clock'),
    ])
    : thunk('main', 'about', aboutView, [
      model.page.model,
      forwardTo(dispatch, 'About'),
    ])
```

- **Use `forwardTo` for every child**, memoized or not, and there is nothing to remember. A lambda that wraps the
  message, `(message) => dispatch({ _tag: 'Clock', message })`, sends the same messages. But it is a new function in
  every frame: a view memoized on it is drawn every time.
- **A grandchild's dispatch is made from its parent's**: `forwardTo(forwardTo(dispatch, 'Home'), 'Products')`. A view
  usually writes it in two steps, each view taking the dispatch its parent gave it.

## Children by id

For children by id, such as the rows of a list, use `childById` instead of `child`:

- **`get` and `set` take the id** (or `at` is a function of it).
- **`subscribed` lists the rows that listen.** It is required, because the library cannot list the ids in the state.
  A row that it leaves out runs no subscription. So list every row, as `list` does, unless some rows must not listen.
- **`children.Row(state, id)` is a row's model**, and `forwardTo(dispatch, 'Row', id)` its dispatch.
- **Ids are compared by value,** with `Equal`, wherever they go (subscription keys, dispatches): strings, numbers, or
  tuples and structs of them.

See [`list`](../../examples/list/list.ts).

**A row the parent must read is not a child.** Say the parent totals what the user types into each row, refuses to
submit while one is blank, or locks the rows while it saves. Then those values belong to the parent: make them
[inputs by id](#inputs-by-id), and keep the rest of the row in the parent's state too. A parent never reads a child's
state (see [splitting a program](./structuring-a-program.md#splitting-a-program)).

**Mind ids that come back.** A command's answer goes to the id it was started for. It reaches whichever row has that id
when it arrives. So if a row is removed and another is added with its id, the new row may get the old row's answer.
Use ids that are never reused, or put in the message which row it is for, so that the new row's `update` rejects the
old answer. Subscriptions do not need this: a row that is removed stops them.

## Inputs by id

A value the user types into each row, such as the count of each item, is an input by id: use `inputById` instead of
`input`, and give the place of each id as `childById` takes it. Rows kept in a record by id are reached with an optic of
the id:

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
- **It is stored at the place of its id**, by [its inputs' rule](#what-the-library-derives-from-it). Where the optic
  of its id focuses nothing, or `get` returns `None`, as for a row that is not there, the write is rejected.

**Lock the rows while an operation runs.** A `get` that returns `None` gives a write no place, and the write is
rejected. So a parent locks every row by giving no place while it saves, and its model shows no editor. `stocktake`
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

The parent's own messages for a row, such as a choice from a list, are rejected by its `update` in the same states.

An input by id is not a child either. Its values are part of the parent's own state, and the parent's `update` reads
them to total or submit them, while it never reads the state of a child (see
[splitting a program](./structuring-a-program.md#splitting-a-program)).

See [`stocktake`](../../examples/stocktake/stocktake.ts).
