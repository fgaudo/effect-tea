---
title: Inputs the user types into
---

# Inputs the user types into

## In short

Some values come from the user, not from the program: the text of a field, for one. The program declares a place in
its state for such a value, an input. The view sends what the user writes over the value its model holds, and the
library stores it, or rejects it. No `update` of the program's is involved.

## An example

The form declares its input `Name` at the `name` of its state (`examples/form/form.ts`):

```ts
inputs: { Name: input(Optic.id<State>().key('name')) },
```

The form's view draws its field with the snabbdom bridge, `shows(model.name, dispatchTo(dispatch, 'Name'))`
(`examples/form/view.ts`). The bridge makes the write with `typed`, over what the element showed (see
[the element on screen](#the-element-on-screen)).

In general, a view writes over the value its model holds, through the input's dispatch:

```ts
{ _tag: 'Written', was: model.name, value: text }
```

## Rules

- **What the user gives an input is no message of the program.** No `update` of the program's sees it.
- **The program declares where it goes**: `inputs: { Name: input(at) }` in `compose`, at a plain value of its state
  (see [declaring children](./composition.md#declaring-children)).
- **The view writes over the value its model holds**: `{ _tag: 'Written', was: model.name, value: text }`, through
  `dispatchTo(dispatch, 'Name')`.
- **The library stores what is written, whatever it is**, in every state where the input's place holds, by `Equal`,
  the value it was written over.
- **It rejects the write in any other state.** There, the state has moved on without the input that wrote it.
- **The program changes an input by leaving another value in its place**, such as `name: ''`.
- **An input keeps nothing of its own.** The state stored is the state the program wrote, and a test compares it whole.
- **Only what is drawn writes into an input.** A subscription and a command answer with messages of the program. The
  program's `update` puts the value in the input's place, or keeps it in the state until it chooses to.

### The element on screen

**A frame may be older than the user's last keystroke.** So rewriting an input from every frame can eat what was just
typed.

**A bridge asks the library instead.** It keeps the element of each input, and asks the library what to make of it:

- When the user edits the element, `typed(held, value)` gives the write to send, over what the element showed. Given
  the number its dispatch returns, it also gives what the element then holds.
- After each frame, `drawn(held, value, seen)` gives what the element then holds, `shown`, and whether it takes the
  frame's value, `taken`. When it is taken, the bridge then writes that value into the element.

**The element stays as it is while the frame is the element's own past or present.** It takes the frame's value once
the state has moved on without it. So the element is never replaced, and keeps its focus while the program changes
what it shows.

The examples' bridges show it, to copy: [`form`](https://github.com/fgaudo/effect-tea/tree/main/examples/form) with
snabbdom, and [`form-react`](https://github.com/fgaudo/effect-tea/tree/main/examples/form-react) with React.

## Precisely

### Which elements and renderers this holds for

With a bridge that settles them with `drawn`, the element of an input:

- never takes back what the user typed since the frame;
- shows the program's value once the state has moved on without it.

That holds for elements and renderers that meet one condition, in two parts:

- **The element**: its value changes only by an edit of the user, which it reports with the whole value, or by the
  bridge.
- **The renderer**: after each frame, and before the user can act on it, it lets the bridge reach the element of each
  input, with the frame's value and `seen`.

What meets it, and what does not:

- **A native text field meets it**, but for what changes its value with no edit reported:
  - a reset of its form;
  - a value written into it that it sanitizes, such as one with a line break.

  The examples' bridges do not handle these (see [what is left out](./writing-a-bridge.md#what-is-left-out)).
- **A renderer that draws each frame at once meets it.**
- **A widget that changes its own value does not**, native or not. A range does, when its bounds narrow. Such a widget
  is outside what is promised here, unless its bridge reports each such change as an edit.
- **Or the widget is replaced by one the program draws.** That one is no input: a press is a message of the model, and
  a drag the messages of a subscription keyed by the state of dragging. The sliders of
  [`volume`](https://github.com/fgaudo/effect-tea/tree/main/examples/volume) are drawn this way.

The bridges' tests check it, in a DOM.

### Two limits

A message names a place. That leaves two limits, and neither corrupts the state:

- **A write over a value that came back is stored**: the same text after a reset or an undo. It is what the user typed
  over what they saw.
- **A message drawn for an old instance of a child reaches the new one.** There, `update` decides.
