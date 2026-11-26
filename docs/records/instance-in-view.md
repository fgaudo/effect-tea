# A message of a view that names its instance

**Status:** decided on 26 November 2026, as step 92 of [`ROADMAP.md`](../../ROADMAP.md), by a session of Fable 5.2, by
the values of "Deciding" in [`AGENTS.md`](../../AGENTS.md), and read by a session of Opus 5.5 that wrote none of it.
The form was spiked on a branch and taken as it ran, with what that reading found (8). Each claim is **run**, by a
test that the text names, **read** in the sources of a package, or **reasoned**.

## The question

A message of a child's view named the place of its child, and no instance: it reached the child that was there. An
application on React Native reported that a tap may reach a child that has started again since its view was drawn
([`application-report-0.9.md`](application-report-0.9.md), point 3). The guide's answer, ids that are never reused, is
no answer for a child alone, which has no id. The engine already rejected a child's message whose `instance` is not
that of the child there, and the type of a child's message already had `instance?: number`: no view could know the
number.

## Decided

**1. `makeModel` reads the number of a child's instance**, `children.X.instance()`, as it reads a model: a value, an
`Option` for a child that may not be there, and by id. It is the one place: a step that read the number would make
two states that differ in their numbers alone behave apart, and `update`, `external`, `onEvent` and `output` are not
given it: they take the type of the outputs alone (**run**, for `update`: "a parent reads only the outputs its
children declare, and no model, outside makeModel").

**2. `forwardTo` takes an instance in place of a name**: `forwardTo(dispatch, { _tag: 'About', instance })`, with `id`
for children by id. Each message then names that instance, and the check that rejects an answer rejects it once the
child has started again (**run**: "a message of a view that names its instance is rejected once the child has started
again", and, in a run, "…drawn for an instance that is gone is ignored"). The dispatch is the same function for the
same dispatch, name, id and instance, and is held weakly, as before (**run**, in `src/dispatch.test.ts`). The search
of interleavings has a user who taps a row of a model read before, through a dispatch that names the instance drawn:
"a tap that names its instance reaches the row it was drawn for, or is rejected" (**run**: with the check taken out,
it failed after 458 scenarios).

**3. A child's instance is what its message is about.** A program without children has the same hazard between two of
its own states, and answers it with a message that holds what it is about, as the id of a row. A child cannot do so
for itself: it is any program, and nothing in its state tells one start from another. The message that crosses is the
parent's, the wrapping, and the number is what that message is about. So the instance is that same answer, given by
the library because only the library counts the starts.

**4. The dispatch names an instance only where the view gives one.** A dispatch made from a name sends messages that
reach the instance there, as before. Binding every message was weighed and not taken (below).

**5. What a dispatch cannot close, and the advice.** Which handler a renderer runs decides what a tap sends.

- **A handler of a draw older than the state**: a part that the application draws late, a bridge of a user's that
  draws late, a script that dispatches twice from one handler. Its dispatch names the old instance, and the message is
  rejected. Closed by 2.
- **A handler of the latest draw, on an element that the screen shows as it was**: a renderer keeps an element drawn
  in the same place, and gives it the handlers of its latest draw. React reads a handler from the props of the latest
  render, and snabbdom's module of listeners calls the handler of the vnode drawn last (**read**,
  `snabbdom/build/modules/eventlisteners.js`). Where the elements live in another thread, as with React Native, the
  screen may still show the old child while its elements hold the new child's handlers: the message names the new
  instance, and nothing that a dispatch holds can tell. **Reasoned**: no test without a device reaches a native view
  ([`react-native.md`](react-native.md), 2).
- So "Composition" advises both, under "Advice": the dispatch, and the number as the key of the child's view, which
  makes a child started again other elements, whose handlers are those of their own draw.

**6. In the tests.** Two equal states have equal numbers, so "the model is data" holds of a model that holds them.
`stateOf` numbers as a start does, so such a model shows those numbers. A reader wraps with the number that the model
holds, and the `candidates` of that child name it, since `Missing` compares whole messages. `messagesSentBy` records
what the view sends, as before. The table of "Testing tools" does not change: a message that names an instance that is
gone is a message that the test or the view sends, and `update` rejects it.

**7. The promise** is a sentence of the item "An answer reaches the instance that asked for it, or is rejected", in
"Guarantees", and the doc comment of `forwardTo` specifies the form.

**8. What the types refuse**, each found by the reading of the session that wrote none of it, and each **run** as a
test of `src/dispatch.test.ts`. An instance of a message whose type has no `instance`, as a message of the parent's
own that has the shape of a child's: nothing would read the number. An instance named without the id of a child by
id, or with an id where its child is alone. And a name that is a union of names, by a name or by an instance, which
compiled before this step and could send one child's message as another's: a breaking change, with its entry. An id
written in the call is taken as the name form takes it, though `const` infers it readonly.

## Weighed, and not taken

Each has its entry in [`rejected.md`](../rejected.md), with what would reopen it.

- **Every message of a child's view bound to its instance.** One way to send, and the form of a command's answer. But
  every parent would hold a number for each child in its model, and every test would name instances in the messages
  that it writes and in its `candidates`, where an application has just asked to name fewer
  (`application-report-0.9.md`, point 6). And it would not close the second case of 5, which no dispatch can.
- **The frame told by the bridge**: the bridge says which state it drew, and the run names the instances of that
  state in each message of a view. No program changes. But it holds exactly where a dispatch that names its instance
  holds, for a rule of every bridge that nothing checks, a function in every program, and a run that knows of frames.
- **The number as a parameter after the id**, `forwardTo(dispatch, 'Row', id, instance)`: `forwardTo` is given no
  program, so at run time it cannot tell `forwardTo(dispatch, 'Clock', 3)`, an instance, from
  `forwardTo(dispatch, 'Row', 3)`, an id. An object in place of the name says which it is.
- **Nothing of the library's**: a child alone declared by id, at an id that its parent counts. It works today, and
  keeps in the parent's state a second count of what `starts` counts.

## What ran

On Bun 1.4.5, TypeScript 7.0.2, Effect 4.1.5, Windows: the checks of `change-engine` and `change-api`, the smoke test
with TypeScript 5.9, 6.0 and 7.0, and the inference matrix, which gives each child's dispatch an instance too. Four
mutations hold the form: the check of the instance in `update`, which the new tests kill too; a dispatch of one
instance given for another; the instance left out of the wrapping; and the wrapping made of all that names the
instance.
