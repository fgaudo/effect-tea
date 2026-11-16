---
title: Composition
---

# Composition

A child is any program. A parent declares its children, and its inputs, with `composition`, and the library
does the routing:

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

- **Where each child lives:** an optic into the parent's state, `at` (Effect's `Optic`: `Optic.id<State>()
  .key('clock')`, with `.compose(Optic.some())` for a child that may not be there), or the two functions an
  optic is, `get` and `set`. Where the optic focuses nothing, or `get` returns `None`, the child is not there.
- **When its subscriptions run:** `subscribed` (by default, whenever it is there).
- **How it starts:** a parent's `init` is a function of `children`, so that a child there from the start is
  started like any other. `children.Clock.init` holds its state and its commands, lifted; reading
  `Clock.clock.init.state` would leave its commands behind. A child with `flags` is started from them:
  `children.About.init({ openedAt })`, and `init(id, flags)` for children by id.
- **The parent's own flags**, if it has any, are declared as its other types,
  `composition<{ state: State; flags: Flags }>()`. Its `init` then returns the function that starts it:
  `init: (children) => (flags) => ({ state, commands })`.
- **What it draws:** `makeModel`, from its state and its children's models.
- **Its inputs,** if it has any: `inputs: { Name: input(at) }`, where `at` is an optic to a value of its own
  state (see [inputs the user types into](./inputs-the-user-types-into.md)). An input is no child: its value is the
  parent's own state, which its `update` and `makeModel` read as the rest. A program with inputs and no children
  is made with `composition` too, and leaves `children` out.
- **Its own messages, commands and subscriptions,** if it has any: `update`, `runCommand` (required exactly when
  it has commands of its own), `subscriptions`. Its `update` takes `children` too, and may reject its own
  messages as any `update` does.

What the library derives from it:

- **The parent's messages:** its own plus `{ _tag: <child>, message }` for each child, and
  `{ _tag: <input>, message: { _tag: 'Written', was, value } }` for each input. `MessageOf<typeof app>` names them. An
  own message that takes a child's or an input's name does not compile, nor does an input that takes a child's, nor an
  own subscription that writes into an input. A command's answer is an own message, or an external message of a
  child's: one that writes into an input, the parent's or a child's, does not compile, nor does one that gives a child
  its own business.
- **Its inputs' rule:** a write is stored while the input's place holds, by `Equal`, the value it was written over,
  and rejected otherwise; every other step leaves an input as it wrote it.
- **The parent's commands:** its own plus each child's, wrapped likewise and run by the child's `runCommand`.
  A child with commands and no `runCommand`, which a program written without `Program<…>` can be, does not
  compile; one that gets there through a cast is a defect when its command runs (a `CompositionDefect`).
- **The parent's subscriptions:** its own, plus each child's under `[<child>, key]` (`[<child>, id, key]` for
  children by id). `HashMap.has(subscriptionsOf(app)(state), ['Clock', 'ticks'])` tells a test whether the
  Clock ticks.
- **The children's models:** `children.About(state)` in `makeModel` is the child's model. It is the same object while
  the child's state is the same object, so a renderer can skip redrawing it (see `thunk` in
  [`pages`](https://github.com/fgaudo/effect-tea/tree/main/examples/pages/view.ts)). A number or a string has no
  identity to keep a model by: this is why a program's state is always an object. Asking for the model of a child that
  is not there is a defect (a `CompositionDefect`).

## Events and external messages

A parent and its children talk only through events and external messages.

- **A child raises an event** to ask its parent for something, like leaving the page. `onEvent` has one handler
  per child that has events, and is required exactly when one has, so that no event goes unhandled. An event
  the parent has nothing to say about, and its own parent handles, it raises as its own:
  `onEvent: { Products: (event) => (state) => ({ state, events: [event] }) }`, with the id before the event for
  children by id. Its `Event` then includes the child's, or this does not compile.
- **A parent sends an external message** to a child with `children.<child>.update`, in its own `update` and
  `onEvent`: one of the messages the child's type declares as `external` (e.g. a back button). The parent
  decides when to send, and the child's type says it takes the message. The child answers in every state, with
  its state or with an event, never with `reject`. A rejection there is a defect (a `CompositionDefect`, naming
  the child, and the message by its tags), as is sending to a child that is not there.

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

`children.Page.update` returns the parent's step, as a function of its state. To take a step of its own before
a child's, a parent adds them up:

- **`andThen`**: `andThen(leave(state), children.Home.update({ _tag: 'ProductGone', at }))`. The result has the
  second step's state, and both steps' commands and events, in order. Taking a step's `.state` by hand to make
  the next one drops its commands and its events.
- **`forEach`** is the `andThen` of many: one step for each item, each made from the state the previous one
  left, e.g. a message to every child by id,
  `forEach({ state }, state.rows, ({ id }) => children.Row.update(id, Cleared()))`.

Both take the step last as well, for a chain written with Effect's `pipe`:
`pipe({ state }, andThen(leave), forEach(ids, clear))`.

## Children's views

A child's view sends the child's own messages, through a dispatch of its own: `dispatchTo(dispatch, 'Clock')`
wraps them as the parent receives them. It is the same function in every frame, so a view memoized on its
model and its dispatch is drawn again only when its model changes:

```ts
const view: View<Model, Message> = (model, dispatch) =>
  model.page._tag === 'Clock'
    ? thunk('main', 'clock', clockView, [
      model.page.model,
      dispatchTo(dispatch, 'Clock'),
    ])
    : thunk('main', 'about', aboutView, [
      model.page.model,
      dispatchTo(dispatch, 'About'),
    ])
```

A lambda that wraps the message, `(message) => dispatch({ _tag: 'Clock', message })`, sends the same messages,
but it is a new function in every frame: a view memoized on it is drawn every time. Use `dispatchTo` for every
child, memoized or not, and there is nothing to remember.

A grandchild's dispatch is made from its parent's: `dispatchTo(dispatchTo(dispatch, 'Home'), 'Products')`. A
view usually writes it in two steps, each view taking the dispatch its parent gave it.

## Children by id

For children by id, such as the rows of a list, use `each` instead of `child`:

- `get` and `set` take the id (or `at` is a function of it);
- `subscribed` lists the rows that listen;
- `children.Row(state, id)` is a row's model, and `dispatchTo(dispatch, 'Row', id)` its dispatch.

Ids are compared by value, with `Equal`, wherever they go (subscription keys, dispatches): strings, numbers, or
tuples and structs of them. See [`list`](https://github.com/fgaudo/effect-tea/tree/main/examples/list/list.ts).

**Mind ids that come back.** A command's answer goes to the id it was started for, to whichever row has that id
when it arrives. If a row is removed and another is added with its id, the new row may get the old row's
answer. Use ids that are never reused, or put in the message which row it is for, so that the new row's
`update` rejects the old answer. Subscriptions do not need this: a row that is removed stops them.
