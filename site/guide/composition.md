---
title: Composition
---

# Composition

## In short

This page shows how to make a program out of other programs. A part of a program that is a program of its own
becomes a child (see [splitting a program](./structuring-a-program.md#splitting-a-program)).

- A child is any program.
- A parent declares its children with `withChildren`, before `make`. For each child, the parent says, from its own
  state, when the child is there and what it starts from.
- The library keeps the children. It starts a child when the parent's state lists it, and drops the child when the
  state no longer lists it. The parent's functions are given the parent's own state alone.
- The library does the routing: the parent's messages, commands and subscriptions include each child's.
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
  About: child(About.about, { there: (state) => state.about })
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

What the compiler refuses of a parent, and each defect of one, is in the doc comments of the API: of `program` and
of what it returns, of `forwardTo` and of `CompositionDefect`.

### When a child is there

A parent declares each child by name, in `withChildren`, with functions of the parent's own state.

- **`child(program)` is always there.**
- **`child(program, { there })`** is there in the states where `there` holds. Its model is an `Option`.
- **A program that has flags starts from them.** `child(program, { flags })` is always there, and `flags` gives its
  flags in each state. `child(program, { there })` is there in the states where `there` gives `Some` of them, and
  its model is an `Option`.
- **`key`** gives a value from the parent's state, for a child without flags: `child(program, { key })`.
- **A child that the state no longer lists is dropped.** Its state is gone, its subscriptions stop, and a message for
  it is rejected. A child that a later state lists again starts again, from its `init`.
- **Other flags, or another value of `key`, are another child**, which starts again. They are compared by value, with
  `Equal`. So make them of what `Equal` compares by value: strings, numbers, and arrays and plain objects of them. A
  function made anew in `flags` or `key` is another value at each step, and the child starts again each time, with no
  error (see [what is left to you](./guarantees.md#what-is-left-to-you)).
- **`listening`** says in which states the child's subscriptions run. Without it, they run whenever the child is
  there. In the example above, `listening` stops the clock's ticks while About is open, and the clock keeps its state.
- **`tell`** gives, from the parent's state, an external message that the child is told:
  `childById(row, { ids, tell: (state) => ({ _tag: 'LockChanged', locked: isLocked(state) }) })`. The child is told
  it as it starts, and again only where the state gives another value, by `Equal`, than it last told the child (see
  [what you can rely on](./guarantees.md#what-you-can-rely-on), and
  [a child that must wait for its parent](./events-and-external-messages.md#a-child-that-must-wait-for-its-parent)).
  What the library does with a state that another program made is in
  [what is left to you](./guarantees.md#what-is-left-to-you).

### How a parent and its children start

- **A parent's `init` is a step of its own state**: `init: { state, commands }`. The library starts each child that
  this state lists, from the child's `init`, with the child's first commands. So the program that `make` gives starts
  from the parent's whole state, with the children's first commands among its own.
- **A step that lists a child anew starts it** in the same way, once the step is taken.
- **A child is given what it starts from by its flags.** A first step lists no `tell`. A child declared with `tell` is
  told what it gives as it starts, in the first state too, once every child has its first commands.
- **A parent with flags of its own** names them with its other types, `program<{ state: State; flags: Flags }>()`. Its
  `init` is then a function of them: `init: (flags) => ({ state, commands })`.
- **The order of the starts.** The children that one state lists anew start in the order of their names in
  `withChildren`, then in the order in which `ids`, or `flags`, lists their ids. Each start takes the next number,
  from 1. A test reads these numbers (see [the number of an instance](./testing.md#the-number-of-an-instance)).

### The parent's own pieces

- **`makeModel: (state, children) => …`** makes the parent's model from its own state and its children's models.
  `children.Clock()` is the model of a child that is always there, `children.About()` an `Option` of the model of a
  child that may not be there, and `children.Row(id)` the model of a child by id.
- **`update: (message, children) => (state) => …`** takes the parent's own messages, and its own state. Here
  `children` holds no model: it holds what each child declares as its `output`, as it does in `external`, `onEvent`,
  `output` and `subscriptions` (see [outputs](./events-and-external-messages.md#outputs)). A step of the parent lists
  in `tell` what it tells its children (see [external messages](./events-and-external-messages.md#external-messages)).

### What the library derives

- **The parent's state** is its own state and the children that the library keeps. `StateOf<typeof app>` names it. A
  test makes one with `stateOf`, or by folding messages from `init` (see
  [the number of an instance](./testing.md#the-number-of-an-instance)).
- **Each start of a child is an instance**, with a number of its own. A child started again is another instance.
- **The parent's messages** are its own, plus `{ _tag: <child>, message }` for each child, and
  `{ _tag: <child>, id, message }` for children by id. `MessageOf<typeof app>` names them. The program that `make`
  gives has the `update` of any program, `(message) => (state) => …`, over all of them and the whole state. A test
  calls it so.
- **A child's commands, and the keys of its subscriptions, are wrapped as its messages are**, with `command` or `key`
  in place of `message`, and with the instance that asked: `{ _tag: <child>, instance, command }`. The answer of a
  command names that instance too. So an answer reaches the instance that asked for it, or is rejected, and a child
  started again starts its subscriptions again (see [guarantees](./guarantees.md#what-you-can-rely-on)). A message of
  the child's view names an instance only where its dispatch is given one (see
  [children's views](#childrens-views)): otherwise it reaches the instance that is there.
- **A child's model is kept.** `children.Clock()` is the same object while the child keeps the very same state. So a
  renderer can skip redrawing it (see `thunk` in [`pages`](../../examples/pages/view.ts)).

### Children's views

- **A child's view gets a dispatch of its own**: `forwardTo(dispatch, 'Clock')`, which wraps each message of the
  child as the parent receives it. A grandchild's dispatch is made from its parent's:
  `forwardTo(forwardTo(dispatch, 'Home'), 'Products')`.
- **That dispatch is the same function in every draw**, for the same dispatch, name, id and instance. So a view
  [memoized](./glossary.md#what-the-user-sees) on its model and its dispatch is drawn again only when its model
  changes. A lambda that wraps the message, `(message) => dispatch({ _tag: 'Clock', message })`, sends the same
  messages. But it is a new function in every draw, so a view memoized on it is drawn every time.

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

- **A dispatch may name the instance of its child.** In `makeModel`, `children.About.instance()` is the number of the
  child's instance, read as its model is: an `Option` for a child that may not be there, and
  `children.Row.instance(id)` for a row. Given in place of the name, as
  `forwardTo(dispatch, { _tag: 'About', instance })`, with the `id` for children by id, it makes each message name
  that instance, as an answer does. Once the child has started again, such a message is rejected. When to give it is
  in [advice](#advice).

### Children by id

For children by id, such as the rows of a list, use `childById` in place of `child` (see
[`list`](../../examples/list/list.ts)). Whether a row is a child at all is in
[splitting a program](./structuring-a-program.md#splitting-a-program).

- **`ids` lists the ids of the children that are there**: `childById(Stopwatch.stopwatch, { ids: (state) => state.ids })`.
  For a program with flags, `flags` lists each id with its flags:
  `{ flags: (state) => state.rows.map((row) => [row.id, row.flags] as const) }`.
- **A row is read by its id.** `children.Row(id)` is its model, `children.Row.output(id)` its output, and
  `forwardTo(dispatch, 'Row', id)` its dispatch. `listening` takes the id too: `(state, id) => …`.
- **Ids are compared by value**, with `Equal`, as flags and keys are. An id can be a string, a number, or a tuple or a
  struct of them. An id listed twice is a defect.
- **Ids that come back.** A row removed in one step, and listed again at the same id in a later step, is another
  instance. It starts again, from its `init`, and the old row's answers are rejected. A click on a view drawn for the
  old row reaches the new one, unless the ids are never reused, or the view's dispatch names its instance (see
  [children's views](#childrens-views)).

## Advice

**Where the screen may show an older draw, give a child's view the number of its instance, in its dispatch and as its
key.** A handler may then run on a view older than the state (see
[what a bridge does](./writing-a-bridge.md#what-a-bridge-does)), and its message would reach a child that has started
again since. A dispatch that names the instance has that message rejected. But a renderer gives an element that it
keeps the handlers of its latest draw, so a click on what the screen still shows may run a handler of the new
instance. A key that is the number, `key` in snabbdom and in React, draws the new instance as other elements, and the
old ones keep the old handlers. Neither is needed where each state is drawn before the next event, as with the
package's bridges in a browser. [`react-native`](../../examples/react-native/views.tsx) gives both to a page started at
each visit.

## A function over any program

This section explains, and adds no rule.

You may want a function that takes any program and makes a parent of it, such as a dialog around any content. Try the
dialog first as a child beside the content: the parent of both is then a program like any other.

Where the function is what you want, write it as an overload: the doc comments of `child`, `childById` and
`withChildren` say what does not compile for a type parameter. What a child needs from its parent, an
`onEvent`, flags or a `runCommand`, depends on the child's types, and the compiler cannot decide it there. So the
function's signature names the types, and its body makes the parent from a program whose types are all `unknown`. The
compiler checks the body. It does not check that the signature says what the body makes.

```ts
type Visibility = Readonly<{ _tag: "Opened" }> | Readonly<{ _tag: "Closed" }>
type Dialog<S> = Kept<Readonly<{ open: boolean }>, { readonly Content: Opt.Option<Instance<S>> }>
type DialogModel<M> = Readonly<{ open: boolean; button: Visibility; content: M }>
type InDialog<Msg> = Visibility | Readonly<{ _tag: "Content"; message: Msg; instance?: number }>

export function inDialog<S, M, Msg>(
  content: Program<{ state: S; model: M; message: Msg }>
): Program<{ state: Dialog<S>; model: DialogModel<M>; message: InDialog<Msg> }>
export function inDialog(content: Program<{ state: unknown; model: unknown; message: unknown }>) {
  const dialog = program<{ state: Readonly<{ open: boolean }>; message: Visibility }>()
  return dialog.withChildren({ Content: dialog.child(content) }).make({
    init: { state: { open: false } },
    update: (message) => () => ({ state: { open: message._tag === "Opened" } }),
    makeModel: (state, children) => ({
      open: state.open,
      button: state.open ? { _tag: "Closed" as const } : { _tag: "Opened" as const },
      content: children.Content()
    })
  })
}
```
