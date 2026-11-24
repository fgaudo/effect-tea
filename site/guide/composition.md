---
title: Composition
---

# Composition

## In short

This page shows how to make a program out of other programs. When a program grows too large, you split it into
children, each a program of its own (see [splitting a program](./structuring-a-program.md#splitting-a-program)).

- A child is any program.
- A parent declares its children with `withChildren`, before `make`. For each child, the parent says, from its own
  state, when the child is there and what it starts from.
- The library keeps the children. It starts a child when the parent's state lists it, and drops the child when the
  state no longer lists it. The parent's functions are given the parent's own state alone.
- The library does the routing: the parent's messages, commands and subscriptions include each child's (see
  [what the library derives](#what-the-library-derives)).
- A parent and its children talk only through [events, external messages and outputs](./events-and-external-messages.md).

## An example

Here is an app of two pages, a clock and an about page. It is [`pages`](../../examples/pages/app.ts):

```ts
type Own = Readonly<{ about: Opt.Option<About.Flags> }>

const { child, withChildren } = program<{ state: Own }>()

export const app = withChildren({
  // Always there. Hidden under About, the Clock keeps its state but stops ticking.
  Clock: child(Clock.clock, { listening: (state) => Opt.isNone(state.about) }),
  // There while the state gives its flags, and started from them.
  About: child(About.about, { flags: (state) => state.about })
}).make({
  init: { state: { about: Opt.none() } },
  onEvent: {
    // Opening About again while it is open changes nothing, so that a double click opens it once.
    Clock: (event) => (state) =>
      Opt.isSome(state.about) ? { state } : { state: { about: Opt.some({ openedAt: event.at }) } },
    About: () => () => ({ state: { about: Opt.none() } })
  },
  // Only the page on top is drawn.
  makeModel: (_, children) => ({
    page: Opt.match(children.About(), {
      onNone: () => ({ _tag: "Clock" as const, model: children.Clock() }),
      onSome: (model) => ({ _tag: "About" as const, model })
    })
  })
})
```

The parent's own state says only whether About is open, and with what. The clock's state, and the about page's, are
kept by the library.

## Rules

### Declaring children

A parent declares its children by name, in `withChildren`. For each child, and for itself, a parent declares what
follows. The sections below group it in four parts.

#### When a child is there

Each of these is a function of the parent's own state:

- **A child that is always there**: `child(program)`. It is there in every state of its parent.
  - `child(program, { key })` is always there too. `key` gives a value from the parent's state. Where `key` gives
    another value, by `Equal`, the child starts again: it is another child (see
    [ids are compared by value](#children-by-id) for what `Equal` compares by value).
- **When the child is not there.** `child(program, { there })` is there in the states where `there` holds, and not in
  the others. `key` may be given beside `there`. A child that may not be there has a model that is an `Option`.
  - A message for a child that is not there is rejected. This holds for a message of the child's view, sent through
    `forwardTo`, and for the answer of one of the child's commands. For children by id, it holds for a message for an
    id that is not there.
  - A message of the child's subscriptions does not reach the parent's `update` once its key is gone: the run drops it
    (see [a message that arrives too late](./rejections-and-defects.md#rules)).
  - A child that leaves, and comes back in a later step, is started again. It does not keep the state it had before
    it left.
  - Telling a child that is not there is a defect, not a rejection (see
    [events and external messages](./events-and-external-messages.md#external-messages)).
- **A child with `flags`** is declared with them: `child(About.about, { flags: (state) => state.about })`.
  - `flags` gives `Some` of the flags in the states where the child is there, and `None` in the others. So its model
    is an `Option`, also where its parent always gives flags.
  - The child starts from its flags. Other flags, by `Equal`, are another child, which starts again from them.
  - A child with flags has no `key` beside them. So it cannot start again with equal flags.
  - A program with flags is declared with them, and a program without flags is declared without them, or this does not
    compile.
- **When a child's subscriptions run: `listening`.** By default, a child's subscriptions run whenever the child is
  there. In the example above, `listening` stops the clock's subscriptions while About is open. Its state stays as it
  is.

#### How a parent and its children start

- **How a child starts.** A parent's `init` is a step of its own state: `init: { state, commands }`. The library starts
  each child that this state lists, from the child's `init`, with the child's first commands. Those commands are now
  the parent's commands.
  - `init` tells its children nothing, and raises no events. A child is given what it starts from by its flags.
  - A program without children has the same `init`: its first step, `init: { state }`.
- **A child that a step lists anew** is started in the same way, once the step is taken. A child that the step no
  longer lists is dropped: its subscriptions stop, and its late messages are rejected.
- **The parent's own flags**, if it has any, are named with its other types:
  `program<{ state: State; flags: Flags }>()`. Then the parent's `init` is the function that starts the parent:
  `init: (flags) => ({ state, commands })`. The library starts the children that its state lists.

**When the children start.** A parent without flags of its own gives its first step as a value. `make` starts the
children that this step lists as it makes the program, so a child's `init` that is a function of flags is called by
`make`. What it throws is thrown by `make`, as it is, and no run records it. Every start of the program begins from that
state. A parent with flags is started by `start`, or by its own parent, which then starts its children.

**The order of the starts.** The children that one state lists anew are started by the order of their names in
`withChildren`, then by the order of their ids. Their instances are numbered in that order: each start takes the next
number, from 1 for the first child that the parent starts.

#### The parent's own pieces

- **What the parent draws: `makeModel`.** The parent's `makeModel` makes the parent's model from its own state and its
  children's models: `makeModel: (state, children) => …`.
  - `children.Clock()` is the model of a child that is always there.
  - `children.About()` is an `Option` of the model of a child that may not be there.
  - `children.Row(id)` is the model of a child by id (see [children by id](#children-by-id)).
  - A child that declares an `output` gives it beside its model, read the same way: `children.Row.output(id)` (see
    [events and external messages](./events-and-external-messages.md#outputs)).
- **The parent's own messages, commands and subscriptions**, if it has any, are declared with `update`, `runCommand` and
  `subscriptions`:
  - The parent's `update` takes the parent's own messages, and its own state. It takes `children` too, after the
    message: `update: (message, children) => (state) => …`. Here `children` holds the outputs of the children that
    declare one, and no model.
  - A step of the parent's own may list in `tell` what it tells its children (see
    [events and external messages](./events-and-external-messages.md#external-messages)).
  - The program that `make` gives has the `update` of any program, `(message) => (state) => …`, over all the parent's
    messages and the parent's whole state (see [what the library derives](#what-the-library-derives)). A test calls
    it so.
  - The parent's `update` may reject the parent's own messages, as any `update` does.
  - The parent's commands need the services that its `runCommand` needs, and the services that its children's commands
    need.
  - The parent's subscriptions need the services that its own `listen` needs, and the services that its children's
    subscriptions need.
  - Nothing names these services. They are inferred (see [anatomy of a program](./anatomy-of-a-program.md)).
- **The parent's own types**, like those of any program, are named in `program` (see
  [anatomy of a program](./anatomy-of-a-program.md)). Each type names what is the parent's own. What the children and
  the inputs bring is added to that type.

**`runCommand`** is required exactly when the parent has commands of its own.

#### The parent's inputs

- If the parent has inputs, it declares them in `inputs`: `inputs: { Name: input({ at }) }`. Here `at` is an optic to a
  value of the parent's own state, beside which `store` may declare the form that a value is stored in (see
  [inputs](./inputs.md)). For inputs by id, use `inputById` (see [inputs by id](./inputs.md#inputs-by-id)).
  - An input is not a child. The input's value is part of the parent's own state. The parent's `update` and
    `makeModel` read that value like the rest of the state.
  - A write into an input changes the parent's own state. So a write that changes what the state lists starts or
    drops children, as a step of the parent's own does.

#### What the library derives

From these declarations, the library derives the parent's state, messages, commands and subscriptions:

- **The parent's state** is its own state and the children that the library keeps. `StateOf<typeof app>` names it:
  `Kept<Own, …>`, whose `own` is the parent's own state. The parent's functions are given `own` alone. A test makes a
  whole state with `stateOf` (see [testing](./testing.md)), or by folding messages from `init`.
- **Each start of a child is an instance**, with a number of its own: no other instance of the parent has it. A child
  started again is another instance, with another number.
- **The parent's messages** are the parent's own messages, plus:
  - `{ _tag: <child>, message }` for each child, and `{ _tag: <child>, id, message }` for children by id. The answer of
    a child's command, and a message of its subscriptions, carry the `instance` too. A message of the child's view
    names no instance, and reaches the instance that is there;
  - `{ _tag: <input>, message: { _tag: 'Written', value } }` for each input, and `{ _tag: <input>, id, message }`
    for inputs by id.
- **The parent's commands** are the parent's own commands, plus each child's commands. A child's commands are wrapped
  as its messages are, with `command` in place of `message`, and with the instance that asked:
  `{ _tag: <child>, instance, command }`, and `{ _tag: <child>, id, instance, command }` for children by id. The
  child's `runCommand` runs them.
  - **An answer reaches the instance that asked for it, or is rejected.** An answer for an instance that is no longer
    there is rejected, even when another instance of the same child, or at the same id, is there now.
- **The parent's subscriptions** are the parent's own subscriptions, plus each child's subscriptions. A child's keys
  are wrapped as its commands are, with `key` in place of `command`, and with the instance that listens:
  `{ _tag: <child>, instance, key }`, and `{ _tag: <child>, id, instance, key }` for children by id. So a child started
  again starts its subscriptions again. The parent's `listen` makes the subscription of a child's key with the child's
  own `listen`.

`MessageOf<typeof app>` names the parent's messages. More on each is in [commands](./commands.md),
[subscriptions](./subscriptions.md) and [children's views](#childrens-views).

Three more facts hold for children and inputs:

- **A child's model is kept.** `children.Clock()` in `makeModel` is the child's model. It is the same object while the
  child's state is the same object. So a renderer can skip redrawing it (see `thunk` in
  [`pages`](../../examples/pages/view.ts)). A number or a string has no identity by which a model could be kept. This
  is why a program's state is always an object.
- **A test reads a child's subscriptions by key.** `app.subscriptions(state)` lists
  `{ _tag: 'Clock', instance: 1, key: 'ticks' }` when the Clock of the first start ticks (see [testing](./testing.md)).
- **The rule of an input.** A write is stored, in the form that the input declares, wherever the input's place is
  there, and rejected where it is not. Every other step leaves an input as that step wrote it.

#### What does not compile, and what is a defect

**What does not compile:**

- a message or a command of the parent's own that can take the name of a child or of an input, and a key of the
  parent's own that can take the name of a child: by its tag, which a tag of `string` can be, or as any value, which
  a message of `unknown` can be;
- an input that takes the name of a child;
- an input whose optic, alone or by id, points into a state other than the program's;
- a subscription or a command of the parent's own that sends anything but a message of the parent's own: a message for
  a child, or a write into an input, the parent's input or a child's input;
- a `tell` of anything but a child's external message, by the child's name, with its id for children by id;
- a child's model read outside `makeModel`, and the output of a child that declares none;
- a child with flags declared without them, or a child without flags declared with them;
- children by id without `ids` or `flags`;
- a child with commands and no `runCommand`, those its `external` returns among them (a program written without
  `Program<…>` can be one);
- a child with keys and no `listen` (a program written without `Program<…>` can be one).

The parent's own subscriptions and commands send only the parent's own messages. To tell a child something, a step of
the parent's `update`, `external` or `onEvent` lists it in `tell` (see
[events and external messages](./events-and-external-messages.md#external-messages)).

**A function that makes a parent of any program.** You may want a function that takes any program and makes a parent
of it. Here is what the compiler can check there, and what it cannot.

- The child's types decide what the child needs from its parent:
  - an `onEvent`, when the child has events;
  - flags, when the child starts from them;
  - a `runCommand`, when the child has commands.
- For a type parameter, such as `P` in `<P extends AnyProgram>(p: P) => …`, the compiler cannot decide what the child
  needs. So `child`, `childById` and `withChildren` do not compile there. Nor does `make` for a state that is a type
  parameter (see [what does not compile](./anatomy-of-a-program.md#rules)).
- A wrapper around content, such as a dialog, is better as a child beside the content than as a parent of it. The
  parent of both is then a program like any other.
- You can still write a function over any program. The function's signature names the types. The function's body makes
  the parent from a program whose types are `object` and `unknown`, as below.
- The compiler checks the body. It does not check that the signature says what the body makes.

```ts
type Toggle = Readonly<{ _tag: "Opened" }> | Readonly<{ _tag: "Closed" }>
type Dialog<S> = Kept<Readonly<{ open: boolean }>, { readonly Content: Opt.Option<Instance<S>> }>
type DialogModel<M> = Readonly<{ open: boolean; content: M }>
type InDialog<Msg> = Toggle | Readonly<{ _tag: "Content"; message: Msg; instance?: number }>

export function inDialog<S extends object, M, Msg>(
  content: Program<{ state: S; model: M; message: Msg }>
): Program<{ state: Dialog<S>; model: DialogModel<M>; message: InDialog<Msg> }>
export function inDialog(content: Program<{ state: object; model: unknown; message: unknown }>) {
  const dialog = program<{ state: Readonly<{ open: boolean }>; message: Toggle }>()
  return dialog.withChildren({ Content: dialog.child(content) }).make({
    init: { state: { open: false } },
    update: (message) => () => ({ state: { open: message._tag === "Opened" } }),
    makeModel: (state, children) => ({ open: state.open, content: children.Content() })
  })
}
```

**What is a defect** (a `CompositionDefect`):

- a child with commands and no `runCommand` that reaches the program through a cast. The defect comes when one of its
  commands runs;
- a child with keys and no `listen` that reaches the program through a cast. The defect comes when one of its
  subscriptions starts;
- a child with events and no handler in `onEvent` that reaches the program through a cast. The defect comes when the
  child raises an event;
- a child whose state is not an object, which only a cast lets into the program. The defect comes when the child's model
  is made;
- children by id whose `ids` or `flags` lists one id twice. In an `init` that is a step, `make` throws it, as the module
  that makes the parent loads;
- the model or the output of a child that is not there: of an id that the parent's state does not list, or of a child
  that is always there, read from a state written by hand that does not hold it;
- telling a child that is not there once the step is taken (see
  [events and external messages](./events-and-external-messages.md#external-messages));
- telling a child that has no `external`, which only a cast lets into the program.

Only `program` makes a `CompositionDefect`. A test reads one. The types refuse to build one, with `new` or with a
class that extends it.

### Children's views

- **A child's view gets a dispatch of its own.** The child's view sends the child's own messages through it.
  `forwardTo(dispatch, 'Clock')` gives this dispatch: it wraps each message of the child as the parent receives it.
- **That dispatch is the same function in every draw.** `forwardTo` returns the same function every time it is asked
  with the same dispatch, name and id. So a view [memoized](./glossary.md#what-the-user-sees) on its model and its
  dispatch is drawn again only when its model changes.

```ts
const view: View<Model, Message> = (model, dispatch) =>
  model.page._tag === "Clock"
    ? thunk("main", "clock", clockView, [
      model.page.model,
      forwardTo(dispatch, "Clock")
    ])
    : thunk("main", "about", aboutView, [
      model.page.model,
      forwardTo(dispatch, "About")
    ])
```

- **Use `forwardTo` for every child**, memoized or not. Then you do not have to remember which views are memoized. A
  lambda that wraps the message, `(message) => dispatch({ _tag: 'Clock', message })`, sends the same messages. But the
  lambda is a new function in every draw, so a view memoized on it is drawn every time.
- **A parent's view draws its own controls around a child's view.** [`timer`](../../examples/timer/view.ts) draws a
  "Remove" button of the parent beside each timer.
- **A grandchild's dispatch is made from its parent's**: `forwardTo(forwardTo(dispatch, 'Home'), 'Products')`. A view
  usually writes it in two steps: each view takes the dispatch that its parent's view gave it.

### Children by id

For children by id, such as the rows of a list, use `childById` instead of `child`:

- **`ids` lists the ids of the children that are there**: `childById(Stopwatch.stopwatch, { ids: (state) => state.ids })`.
  For a program with flags, `flags` lists each id with its flags:
  `{ flags: (state) => state.rows.map((row) => [row.id, row.flags] as const) }`. Other flags at an id start the child
  there again.
- **`listening` says which rows listen**, as a function of the parent's state and the id. Without it, every row
  listens.
- **`children.Row(id)` is a row's model**, and `forwardTo(dispatch, 'Row', id)` is the row's dispatch.
  `children.Row.output(id)` is its output, for a row that declares one.
- **Ids are compared by value**, with `Equal`, wherever they go: in the list of ids, in subscription keys and in
  dispatches. An id can be a string, a number, or a tuple or a struct of them. Keys and flags are compared the same
  way. `Equal` compares by value what Effect documents: primitives, arrays, plain objects, `Map`, `Set`, dates,
  regular expressions, and values that implement `Equal`, as `Option` and `Data` do. It compares a function by
  reference.
- **An id listed twice is a defect** (see [what is a defect](#what-does-not-compile-and-what-is-a-defect)).

See [`list`](../../examples/list/list.ts).

**A row whose value the parent reads.** Say the parent totals what the user types into each row, or refuses to submit
while one row is blank. Who holds what is typed depends on whose rules use it (see
[splitting a program](./structuring-a-program.md#splitting-a-program)):

- Where the parent changes the value, or locks it, the value is the parent's. Make it an
  [input by id](./inputs.md#inputs-by-id), and keep the rest of the row in the parent's state too. In
  [`stocktake`](../../examples/stocktake/stocktake.ts), a scan adds to a count, and the sheet locks the counts while
  it submits them.
- Where only the row's own rules use the value, the row is a child with an input of its own. The parent reads what the
  row concludes from it through the row's `output`, such as a valid count, not the text.

**Ids that come back.** A row removed in one step, and listed again at the same id in a later step, is another
instance. It starts again, from its `init`. The old row's answers are rejected, and its subscriptions do not run on for
the new row (see [what the library derives](#what-the-library-derives)). But a message of a view names no instance: a
click on a view drawn for the old row reaches the new one. Where it must not, use ids that are never reused. A step that
removes an id and lists it again, in the same step, keeps the row as it was, with its flags.

## Do and don't

Each pair sums up a rule of this page. The rule itself is above.

| Do                                                                                     | Don't                                                             |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Say in the parent's own state which children are there, and let the library keep them. | Keep a child's state in the parent's state.                       |
| Give each child's view `forwardTo(dispatch, 'Clock')`.                                 | Wrap the message in a lambda: it is a new function in every draw. |
| Make a value that the parent changes or locks, in each row, an input by id.            | Make the row a child, and copy the parent's lock into each row.   |
| Give a child flags made of values that `Equal` compares by value.                      | Make a function anew in `flags` or `key`: the child starts again. |

```ts
// Don't: a function made anew at each call is other flags each time, and About starts again at each step
About: child(About.about, {
  flags: (state) => Opt.map(state.about, (about) => ({ ...about, format: (at: Date) => at.toISOString() }))
}),

// Do: flags made of plain values, which Equal compares by value
About: child(About.about, { flags: (state) => state.about }),
```
