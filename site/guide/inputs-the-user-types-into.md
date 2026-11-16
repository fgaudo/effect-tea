---
title: Inputs the user types into
---

# Inputs the user types into

A value the user gives an input (a text) is no message of the program: the program declares where it goes, `inputs: {
Name: input(at) }` in `compose` (see [declaring children](./composition.md#declaring-children)), at a plain value of its
state, and the view writes over the value its model holds, `{ _tag: 'Written', was: model.name, value: text }`, through
`dispatchTo(dispatch, 'Name')`. No `update` of the program's sees it: the library stores what is written, whatever it
is, in every state where the input's place holds, by `Equal`, the value it was written over, and rejects it in any
other, since the state has moved on without the input that wrote it. The program changes an input by leaving another
value in its place, `name: ''`, and an input keeps nothing of its own: the state stored is the state the program wrote,
which a test compares whole.

Only what is drawn writes into an input. A subscription and a command answer with messages of the program, whose
`update` puts the value in the input's place, or keeps it in the state until it chooses to.

A frame may be older than the user's last keystroke, so rewriting an input from every frame can eat what was just typed.
A bridge keeps the element of each input, and asks the library what to make of it. When the user edits it, `typed(held,
value)` gives the write to send, over what the element showed, and, from the number its dispatch returns, what the
element then holds. After each frame, `drawn(held, value, seen)` gives what the element then holds, `shown`, and whether
it takes the frame's value, `taken`, which the bridge then writes into it: the element stays as it is while the frame is
the element's own past or present, and takes the frame's value once the state has moved on without it. So the element is
never replaced, and keeps its focus while the program changes what it shows. The examples' bridges show it, to copy, in
[`form`](https://github.com/fgaudo/effect-tea/tree/main/examples/form) and
[`form-react`](https://github.com/fgaudo/effect-tea/tree/main/examples/form-react), with snabbdom and with React.

With a bridge that settles them with `drawn`, the element of an input never takes back what the user typed since the
frame, and shows the program's value once the state has moved on without it. That holds for elements and renderers that
meet one condition: an element's value changes only by an edit of the user, which it reports with the whole value, or by
the bridge; and the renderer, after each frame and before the user can act on it, lets the bridge reach the element of
each input with the frame's value and `seen`. A native text field meets it, but for what changes its value with no edit
reported: a reset of its form, and a value written into it that it sanitizes, such as one with a line break, which the
examples' bridges do not handle (see [view](./writing-a-bridge.md#the-examples-bridges)); so does a renderer that draws
each frame at once. A widget, native or not, that changes its own value does not, as a range does when its bounds
narrow, and is outside what is promised here unless its bridge reports each such change as an edit; or it is replaced by
one the program draws, which is no input: a press is a message of the model, and a drag the messages of a subscription
keyed by the state of dragging, as the sliders of
[`volume`](https://github.com/fgaudo/effect-tea/tree/main/examples/volume) are. The bridges' tests check it, in a DOM.

A message names a place, which leaves two limits, neither of which corrupts the state: a write over a value that
came back, the same text after a reset or an undo, is stored, as what the user typed over what they saw; and a
message drawn for an old instance of a child reaches the new one, where `update` decides.
