---
title: Composition
---

# Composition

## In short

This page shows how to make a program out of other programs. When a program grows too large, you split it into
children, each a program of its own (see [splitting a program](./structuring-a-program.md#splitting-a-program)).

- A child is any program.
- A parent declares its children, and its inputs, with `program`. For each child, the parent says where the child lives
  in the parent's state.
- The library does the routing: the parent's messages, commands and subscriptions include each child's (see
  [what the library derives](#what-the-library-derives)).
- A parent and its children talk only through [events and external messages](./events-and-external-messages.md).

## An example

Here is an app of two pages, a clock and an about page. It is adapted from [`pages`](../../examples/pages/app.ts):

```ts
const { child, make } = program<{ state: State }>()

const state = Optic.id<State>()

export const app = make({
  init: (children) => ({
    state: { clock: children.Clock.init.state, maybeAbout: Opt.none() },
    commands: children.Clock.init.commands
  }),
  children: {
    Clock: child(Clock.clock, {
      at: state.key("clock"),
      // Hidden under About, the clock keeps its state but stops ticking.
      subscribed: (state) => Opt.isNone(state.maybeAbout) ? Opt.some(state.clock) : Opt.none()
    }),
    // Closed, About is not there: the optic focuses nothing.
    About: child(About.about, { at: state.key("maybeAbout").compose(Optic.some()) })
  },
  onEvent: {
    // About starts from the time the Clock showed, its flags; a double click opens it once.
    Clock: (event, children) => (state) => {
      if (Opt.isSome(state.maybeAbout)) return { state }
      const about = children.About.init({ openedAt: event.at })
      return {
        state: { ...state, maybeAbout: Opt.some(about.state) },
        commands: about.commands
      }
    },
    About: () => (state) => ({ state: { ...state, maybeAbout: Opt.none() } })
  },
  // Only the page on top is drawn.
  makeModel: (state, children) => ({
    page: Opt.isNone(state.maybeAbout)
      ? { _tag: "Clock" as const, model: children.Clock(state) }
      : { _tag: "About" as const, model: children.About(state) }
  })
})
```

## Declaring children

For each child, and for itself, a parent declares what follows. The sections below group it in four parts.

### Where a child lives

- **Where the child lives: `at`.** `at` is an optic into the parent's state, an `Optic` of Effect:
  `Optic.id<State>().key('clock')`. For a child that may not be there, add `.compose(Optic.some())`. In place of an
  optic, you can give the two functions that an optic is: `get` and `set`.
  - Give an optic where the place is a path into the state: a field, a case of a tagged union, a key of a record.
  - Give `get` and `set` where the place must be found: an element of an array that a predicate picks, such as a
    page found by its tag in a stack of pages. No path leads to such an element, because its index changes as the
    array does.
- **When the child is not there.** In a state where the child's optic focuses nothing, or where its `get` returns
  `None`, the child is not there.
  - A message for a child that is not there is rejected. This holds for a message of the child's view, sent through
    `forwardTo`, and for the answer of one of the child's commands. For children by id, it holds for a message for an
    id that is not there.
  - A message of the child's subscriptions does not reach the parent's `update` once its key is gone: the run drops it
    (see [a message that arrives too late](./rejections-and-defects.md#rules)).
  - An external message that the parent gives, through `children.About.external`, to a child that is not there is a
    defect, not a rejection (see
    [events and external messages](./events-and-external-messages.md#precisely)).
- **When a child's subscriptions run: `subscribed`.** By default, a child's subscriptions run whenever the child is
  there. In the example above, `subscribed` stops the clock's subscriptions while About is open.
  - `subscribed` is a function of the parent's state. It returns `Opt.some` of the child's state in the states where
    the child's subscriptions run, and `Opt.none()` in the others.

### How a parent and its children start

- **How a child starts.** A parent's `init` is a function of `children`. So a child that is there from the start is
  started like any other child.
  - `children.Clock.init` holds the child's first state and its first commands, lifted: the commands are now the
    parent's commands.
  - Reading `Clock.clock.init.state` instead would leave the child's commands behind.
  - A program without children has no `children` to start. Its `init` is its first step: `init: { state }`.
- **A child with `flags`** is started from its flags: `children.About.init({ openedAt })`. For children by id, write
  `init(id, flags)`.
- **The parent's own flags**, if it has any, are named with its other types:
  `program<{ state: State; flags: Flags }>()`. Then the parent's `init` returns the function that starts the parent:
  `init: (children) => (flags) => ({ state, commands })`. Without children, `init` is that function:
  `init: (flags) => ({ state, commands })`.

### The parent's own pieces

- **What the parent draws: `makeModel`.** The parent's `makeModel` makes the parent's model from its state and its
  children's models.
- **The parent's own messages, commands and subscriptions**, if it has any, are declared with `update`, `runCommand` and
  `subscriptions`:
  - The parent's `update` takes `children` too, after the message: `update: (message, children) => (state) => …`. It
    takes the parent's own messages.
  - The program that `make` gives has the `update` of any program, `(message) => (state) => …`, over all the parent's
    messages (see [what the library derives](#what-the-library-derives)). A test calls it so.
  - The parent's `update` may reject the parent's own messages, as any `update` does.
  - The parent's commands need the services that its `runCommand` needs, and the services that its children's commands
    need.
  - The parent's subscriptions need the services that its own `subscriptions` need, and the services that its
    children's subscriptions need.
  - Nothing names these services. They are inferred (see [anatomy of a program](./anatomy-of-a-program.md)).
- **The parent's own types**, like those of any program, are named in `program` (see
  [anatomy of a program](./anatomy-of-a-program.md)). Each type names what is the parent's own. What the children and
  the inputs bring is added to that type.

### The parent's inputs

- If the parent has inputs, it declares them in `inputs`: `inputs: { Name: input({ at }) }`. Here `at` is an optic to a
  value of the parent's own state (see [inputs the user types into](./inputs-the-user-types-into.md)). For inputs by
  id, use `inputById` (see [inputs by id](./inputs-the-user-types-into.md#inputs-by-id)).
  - An input is placed in the same ways as a child: with `at`, or with `get` and `set`.
  - An input by id is placed in the same ways, as functions of the id.
  - An input is not a child. The input's value is part of the parent's own state. The parent's `update` and
    `makeModel` read that value like the rest of the state.
  - A program with inputs and no children leaves `children` out.

### What the library derives

From these declarations, the library derives the parent's messages, commands and subscriptions:

- **The parent's messages** are the parent's own messages, plus:
  - `{ _tag: <child>, message }` for each child, and `{ _tag: <child>, id, message }` for children by id;
  - `{ _tag: <input>, message: { _tag: 'Written', value } }` for each input, and `{ _tag: <input>, id, message }`
    for inputs by id.
- **The parent's commands** are the parent's own commands, plus each child's commands. A child's commands are wrapped
  as its messages are, with `command` in place of `message`: `{ _tag: <child>, command }`, and
  `{ _tag: <child>, id, command }` for children by id. The child's `runCommand` runs them.
- **The parent's subscriptions** are the parent's own subscriptions, plus each child's subscriptions, under the key
  `[<child>, key]`. For children by id, the key is `[<child>, id, key]`.

`MessageOf<typeof app>` names the parent's messages. More on each is in [commands](./commands.md),
[subscriptions](./subscriptions.md) and [children's views](#childrens-views).

Three more facts hold for children and inputs:

- **A child's model is kept.** `children.About(state)` in `makeModel` is the child's model. It is the same object while
  the child's state is the same object. So a renderer can skip redrawing it (see `thunk` in
  [`pages`](../../examples/pages/view.ts)). A number or a string has no identity by which a model could be kept. This
  is why a program's state is always an object.
- **A test reads a child's subscriptions by key.** `HashMap.has(app.subscriptions(state), ['Clock', 'ticks'])`
  tells a test whether the Clock ticks.
- **The rule of an input.** A write is stored wherever the input's place is there, and rejected where it is not. Every
  other step leaves an input as that step wrote it.

### Precisely

**`runCommand`** is required exactly when the parent has commands of its own.

**When the parent's `init` is called.** A parent without flags of its own has its `init` called once, by `make`, as
it makes the program. Every start of the program begins from that step. What the `init` throws is thrown by `make`, as
it is, and no run records it. A parent with flags gets from its `init` the function of the flags, which `start` calls.

**What does not compile:**

- a message or a command of the parent's own that can take the name of a child or of an input: by its tag, which a
  tag of `string` can be, or as any value, which a message of `unknown` can be;
- an input that takes the name of a child;
- an input whose optic, alone or by id, points into a state other than the program's;
- a subscription or a command of the parent's own that sends anything but a message of the parent's own: a message for
  a child, or a write into an input, the parent's input or a child's input;
- a child with commands and no `runCommand`, those its `external` returns among them (a program written without
  `Program<…>` can be one).

The parent's own subscriptions and commands send only the parent's own messages. To tell a child something, the
parent's `update`, `external` or `onEvent` sends it an external message (see
[events and external messages](./events-and-external-messages.md#external-messages)).

**A function that makes a parent of any program.** You may want a function that takes any program and makes a parent
of it. Here is what the compiler can check there, and what it cannot.

- The child's types decide what the child needs from its parent:
  - an `onEvent`, when the child has events;
  - flags, when the child starts from them;
  - a `runCommand`, when the child has commands.
- For a type parameter, such as `P` in `<P extends AnyProgram>(p: P) => …`, the compiler cannot decide what the child
  needs. So `child`, `childById` and `make` do not compile there. Nor does `make` for a state that is a type parameter
  (see [what does not compile](./anatomy-of-a-program.md#precisely)).
- A wrapper around content, such as a dialog, is better as a child beside the content than as a parent of it. The
  parent of both is then a program like any other.
- You can still write a function over any program. The function's signature names the types. The function's body makes
  the parent from a program whose types are `object` and `unknown`, as below.
- The compiler checks the body. It does not check that the signature says what the body makes.

```ts
type Dialog<S> = Readonly<{ open: boolean; content: S }>
type DialogModel<M> = Readonly<{ open: boolean; content: M }>
type Toggle = Readonly<{ _tag: "Opened" }> | Readonly<{ _tag: "Closed" }>
type InDialog<Msg> = Toggle | Readonly<{ _tag: "Content"; message: Msg }>

export function inDialog<S extends object, M, Msg>(
  content: Program<{ state: S; model: M; message: Msg }>
): Program<{ state: Dialog<S>; model: DialogModel<M>; message: InDialog<Msg> }>
export function inDialog(content: Program<{ state: object; model: unknown; message: unknown }>) {
  const dialog = program<{ state: Dialog<object>; message: Toggle }>()
  return dialog.make({
    init: (children) => ({ state: { open: false, content: children.Content.init.state } }),
    children: { Content: dialog.child(content, { at: Optic.id<Dialog<object>>().key("content") }) },
    update: (message) => (state) => ({ state: { ...state, open: message._tag === "Opened" } }),
    makeModel: (state, children) => ({ open: state.open, content: children.Content(state) })
  })
}
```

**What is a defect** (a `CompositionDefect`):

- a child with commands and no `runCommand` that reaches the program through a cast. The defect comes when one of its
  commands runs;
- a child with events and no handler in `onEvent` that reaches the program through a cast. The defect comes when the
  child raises an event;
- a child whose state is not an object, which only a cast lets into the program. The defect comes when the child's model
  or its subscriptions are made;
- a subscription key of the parent's own that is the key of a child's subscription;
- a `subscribed` that lists one id twice, for a child that listens to something in that state;
- asking for the model of a child that is not there;
- an external message to a child that is not there (see
  [events and external messages](./events-and-external-messages.md#precisely)).

Only `program` makes a `CompositionDefect`. A test reads one. The types refuse to build one, with `new` or with a
class that extends it.

## Children's views

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
- **A grandchild's dispatch is made from its parent's**: `forwardTo(forwardTo(dispatch, 'Home'), 'Products')`. A view
  usually writes it in two steps: each view takes the dispatch that its parent's view gave it.

## Children by id

For children by id, such as the rows of a list, use `childById` instead of `child`:

- **`get` and `set` take the id** (or `at` is a function of the id).
  - Rows kept in an array are found with `get` and `set`, as `list` does. Rows kept in a record by id are reached
    with an optic of the id (see [where a child lives](#where-a-child-lives)).
    [Inputs by id](./inputs-the-user-types-into.md#inputs-by-id) shows both forms.
- **`subscribed` lists the rows that listen.** It is required, because the library cannot list the ids in the state. A
  row that `subscribed` leaves out runs no subscription. So list every row, as `list` does, unless some rows must not
  listen.
- **`children.Row(state, id)` is a row's model**, and `forwardTo(dispatch, 'Row', id)` is the row's dispatch.
- **Ids are compared by value**, with `Equal`, wherever they go: in subscription keys and in dispatches. An id can be a
  string, a number, or a tuple or a struct of them.

See [`list`](../../examples/list/list.ts).

**A row the parent must read is not a child.** Say the parent totals what the user types into each row. Or the parent
refuses to submit while one row is blank, or locks the rows while it saves. Then those values belong to the parent. Make
them [inputs by id](./inputs-the-user-types-into.md#inputs-by-id), and keep the rest of the row in the parent's state
too. A parent never reads a child's state (see [splitting a program](./structuring-a-program.md#splitting-a-program)).

**Ids that come back.** A command's answer goes to the id that the command was started for. When the answer arrives, it
reaches the row that has that id at that moment. So if a row is removed, and another row is added with the same id, the
new row may get the old row's answer. A row's subscriptions are kept by their keys, `[<child>, id, key]`, compared after
each change of state (see [subscriptions](./subscriptions.md#rules)). When a step removes a row, its subscriptions stop.
But when one step removes a row and adds another with the same id, the keys stay: the old row's subscriptions run on for
the new row, and one that has ended does not start again. To prevent both, use ids that are never reused. For an answer,
you can instead put in the message which row it is for, so that the new row's `update` rejects the old answer.

## Do and don't

Each pair sums up a rule of this page. The rule itself is above.

| Do                                                                                 | Don't                                                                                  |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Start a child with `children.Clock.init`, and use its state and its commands.      | Read `Clock.clock.init.state`: it leaves the child's commands behind.                  |
| Give each child's view `forwardTo(dispatch, 'Clock')`.                             | Wrap the message in a lambda: it is a new function in every draw.                      |
| Make a value that the user types into a row, and the parent reads, an input by id. | Make the row a child, and read the child's state from the parent.                      |
| Use ids that are never reused, or say in the message which row it is for.          | Reuse a removed row's id in the step that removes it, or when an answer omits its row. |
| List in `subscribed` every row that must listen.                                   | Leave out of `subscribed` a row that must listen: it runs no subscription.             |

```ts
// Don't: the child's own init leaves its commands behind
init: () => ({
  state: { clock: Clock.clock.init.state, maybeAbout: Opt.none() },
}),

// Do: start the child through children, and keep its commands
init: (children) => ({
  state: { clock: children.Clock.init.state, maybeAbout: Opt.none() },
  commands: children.Clock.init.commands,
}),
```
