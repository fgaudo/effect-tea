# A step that does nothing, and what the tests say of it

**Status:** proposed, 14 November 2026. Nothing of it is done: no file of the library, of its tests or of its examples
has changed. It records a review of the invariants by three models (Fable 5.2 twice, Opus 5.5 once), an earlier
discussion in an application that uses the library (26 October 2026), and two spikes, each on a worktree of its own,
on Effect 4.1.4 and Bun 1.4.4, which are not kept: "What it rests on" says what each one showed, and what was
checked again and what was only reported.

## Context

A handler of `onEvent` answers with a step, and its type has no `reject`: an event that does not apply is answered
`{ state }` (README, "Rejections and defects"; `pages` does so when About is asked for while it is open). The
question whether a handler should be allowed to reject came up more than once, and the review raised it again as the
one place where "`reject` means the same everywhere" does not hold across a parent and its children.

What the status quo costs, as the code has it:

- **A view's message whose only effect is such an event is applied, and does nothing.** `onIgnored` does not hear
  it; `onApplied` does, with `before === after` and no commands. `dispatchViolations` counts it as accepted.
- **`Missing` asks the view for a message that would do nothing.** The check reads only whether `update` rejects,
  so `pages` lists the Clock's messages under About as `withheld`, an option meant for what `update` would act on
  and the view hides on purpose.
- **A control a parent makes dead goes unseen.** In a program without children the author writes `reject`, and
  `Rejected` makes the model stop showing the control. A parent can only answer `{ state }`, so the same mistake
  passes every check of the tool made to find it.

A rejection does cross the boundary upwards: a child's own message that the child rejects, or one for a child that is
not there, is the parent's rejection (`updateAt` in `compose.ts`). Only what a parent decides in `onEvent` cannot be
one.

## What was weighed: `reject` in `onEvent`

The proposal: a handler may return `reject`. Where the event came out of a child's own message, routed by the parent
(`updateAt`), the whole message is rejected, the child's change of state, its commands and what earlier handlers of
the step did included. Where it came out of an external message the parent's own `update` gave the child (`tell`), it
is a `CompositionDefect`, as a child rejecting an external message is.

An event reaches a handler by both ways, and the argument that a parent would take back a judgement it made holds for
the second alone: in the first the parent's `update` is not called, and `onEvent` is the first code of the parent to
see anything. So the proposal is not refused for that. It is refused for what the first spike showed:

| Case | What happened | What an author expects? |
| --- | --- | --- |
| The child raises an event and leaves its state as it is (`pages`) | the message is rejected | yes |
| The child changes its own state and raises an event (a menu that closes and asks for a page) | the child's change is dropped: the menu stays open | no |
| Two events, the second handler rejects | what the first handler did is dropped too | consistent, and silent |
| A grandparent rejects | the grandchild's change is dropped across two levels | as the second |
| An event from a command's answer, or a subscription's message | ignored as a late answer is; `onIgnored` hears it | yes |
| The parent's own `update` tells the child | a `CompositionDefect` naming the child | yes |
| Children by id | as the second | no |

Three things decide it:

- **A child could no longer rely on its own transitions.** A step its `update` accepts would take effect only if
  every ancestor that handles its events agrees, so a test of the child alone would say "closes the menu" of a
  program that does not. "`reject` means the message does not apply in the state" would become "in the state of
  every ancestor".
- **The tool would blame the child.** Where the child is drawn while the parent rejects, `dispatchViolations` reports
  `Rejected` for the child's own control, which the child's view cannot avoid: it does not see the parent's state.
- **One answer, two outcomes the handler cannot tell apart.** A handler does not know what caused its event. The
  same `reject` would be an ignored message by one way and a defect by the other, and no type says which.

The proposal cost little to write (some thirty lines of `compose.ts`, no test of the suite broken), which is no
argument for it. `andThen` and `forEach` take no rejection as a next step, and the defect of `tell` has to ask the
child's `update` again to say who rejected.

## Decision

Proposed. Composition stays as it is, and the testing tool learns to see a step that does nothing.

1. **`onEvent` does not reject.** An event is part of a step its child has already accepted; an intent that is
   already met is answered `{ state }`.
2. **A step does nothing when it leaves the same state, by `Equal`, and has no commands and no events.** It is the
   rule `ActsTwice` already applies to a message sent twice, so the tool keeps one meaning of "changes nothing". By
   identity, two programs that behave alike would be judged differently by how they build their state, and a
   needless copy of the state would silence the check.
3. **`Missing` leaves out a candidate whose step does nothing.** A control that would do nothing is no control
   missing from the screen. `pages` loses its `withheld`, which goes back to meaning one thing.
4. **`Inert`, a new violation: a message the view sends whose step does nothing**, judged on the first send (the
   second, from the same frame, is `ActsTwice`'s, which admits a step that does nothing). An option `inert`, of the
   message and the state, as `withheld` is, lists what does nothing on purpose. It is always on.
5. **The README says why a handler has no `reject`**, and that a tap without effect is told in `onApplied` by
   `before === after` and no commands.

Points 3 and 4 are two halves of one rule: a message that does nothing in a state is not on the screen there. With
4 alone, such a message would be `Inert` where it is shown and `Missing` where it is hidden.

`Inert` asks, and `inert` answers, as the tool's other options do:

| The tool asks | The test answers with |
| --- | --- |
| "This message acts twice" (`ActsTwice`) | `repeatable`: it is meant to |
| "`update` accepts it, and the view does not send it" (`Missing`) | `withheld`: hidden on purpose |
| "The view sends it, and it does nothing" (`Inert`) | `inert`: on purpose |

A step that does nothing is a mistake when whoever makes the model could tell, from its own state, that it would do
nothing, and showed the control all the same: a "Save" over a document the parent holds locked, a "Stop all" over an
empty list. It is meant where the model cannot tell (a parent that does not read its children's state: "Stop all"
while every stopwatch is stopped), where it depends on the value and not on the control (an input given the text it
has, which the README forbids to reject), or where the intent is met and the control must stay. The tool sees
`{ state }` in both, so it asks.

`Inert` adds nothing a program writes: `update` still answers with a rejection or a step. A value a program would
return to say "nothing, on purpose" is `{ state }` under another name, and was discarded for that.

## What it rests on

- That `reject` in `onEvent` does what the table says: **checked** by the first spike (sixteen tests over the seven
  cases, the tools and the run), run again by the session that wrote this.
- That the suite passes with it, and the typecheck and the lint: **reported** by the spike. `test:node`,
  `interleavings` and `mutations` were not run.
- That `pages` fails without its `withheld` today, and passes without it once `Missing` leaves out a step that does
  nothing: **reported** by both spikes.
- What the two rules add over the nine examples, 2,000 runs each, with the examples' options as they are:
  **reported** by the second spike, whose eleven tests of the shapes were run again, and its measure was not.
  `Missing`'s change adds no violation, as it only takes some out. `Inert` adds `StopAllClicked` in `list` (769 of
  2,000 states by identity, 756 by `Equal`) and, by `Equal` alone, `NameChanged` with the text the field has in `form`
  and `form-react` (4 and 7 of 2,000: few enough to fail a test at random, so its exemption is written at once).
- That those are not all false alarms: **read**. The spike counted every one as such. The smallest state of
  `StopAllClicked` has no entries, which the parent's own state tells, so the model could leave the control out; with
  entries, all stopped, only the children know, and the README forbids a parent to read them. The spike did not
  count the two apart.
- That a control dead by its parent's decision is `Inert`, and one whose child changed its own state is not:
  **checked**, by tests built for it in the second spike. No example has such a control.
- That `Equal` compares by value what a state is made of: **checked** at 4.1.4. Two values built apart with the same
  content are equal when they are plain objects, arrays, a `Date`, a `Map`, or instances of a class that does not
  implement `Equal` (one class, with one public field); two functions are not. A state holding what compares by
  reference is never the same state, so `Inert` says nothing of it, and `ActsTwice` reports its messages instead,
  unless they are `repeatable`.
- That `rehearse` cannot send a message from an older frame, so that a double tap is no case of its own there:
  **reported** by both reviewers (`send` selects from the model of the state its message is applied to), not checked
  again.

## Alternatives

- **`reject` in `onEvent`, the whole message rejected.** Above.
- **`reject` in `onEvent`, allowed only where the child's step changed nothing of its own**, a defect otherwise.
  It keeps the path that makes one answer a defect, and turns a parent's rejection into a crash the day its child
  starts closing a menu. Not spiked.
- **A gate on a child**, an option beside `subscribed` saying when it takes messages, rejected before its `update`
  as those of a child that is not there. `update` does not know where a message came from, so the gate would reject
  the answers of the child's commands too, and leave an operation that only its completion leaves. A gate for each
  message would have the parent read the child's messages. Not spiked.
- **`Inert` by identity.** Spiked. It matches the engine's own "the very same state draws no new frame", and spares
  the input its exemption, since `Field.typed` builds a new object for the same text. That is what is wrong with it:
  see point 2.
- **`Inert` as an option to turn on.** It breaks no test of a consumer's. The library has one user today, so the
  reason for it is not there, and a check that is off finds nothing.
- **`Missing`'s change alone.** It mends `pages` and finds no dead control.
- **A constant `unchanged`**, frames with a version that the run drops when outdated, a child that removes its own
  duplicates, events with an answer from the parent: weighed on 26 October and left, for reasons that still hold (a
  name for `{ state }`; a tick would drop what was just typed; the child would learn of its parent's stack; a piece
  of architecture for what an `if` does).

## What a consumer could notice

- **A view's test fails where a control it shows does nothing**, until the model leaves it out, `update` rejects it,
  or the test lists it as `inert`.
- **`'Inert'` is a new case of `DispatchViolation`**: a `switch` over its tags that was exhaustive no longer
  compiles.
- **`Missing` reports less**: a candidate whose step does nothing is no longer one. A `withheld` that listed such
  messages is no longer needed, and harms nothing.

It is a breaking change, with a changelog entry and the version `release` asks for.

## Open questions

- **`list` over an empty list.** Whether the example rejects `StopAllClicked` there and gives its model a case for
  it (`Empty | Listed`), which is what the README's rules ask and what `Inert` found, or lists it as `inert` with the
  case of every stopwatch stopped.
- **`rehearse`.** It fails on a `send` that `update` rejects, as a control that does nothing. Whether it fails on one
  whose step does nothing too: the run applies such a message, and `rehearse` follows the run, but the tools are
  meant to be asked about the same things.
- **A key whose message does nothing.** `Inert` is of what a view sends. A subscription has the same mistake, and its
  own way to leave a control out: a state that does not list the key (a "back" button of the device, not listened
  to at the root, is left to the system). A key that is listed and whose message does nothing is found by no tool:
  the tool cannot ask a subscription what it will send, as it asks a view, so a test would have to list the messages
  of each key. Until then a property written by hand holds it.
- **`Field.typed`** builds a new field for the text it has, so the same text draws a frame for nothing. Whether the
  example returns the same state there, which `Inert` would then report and the input's exemption cover.
- **The comment of `dispatchViolations`** says an instance of a class that does not implement `Equal` compares by
  reference. The check above found otherwise for one class: to be read again when the file changes.
- **An application.** What `Inert` finds in a program larger than the examples, and how many exemptions it asks for,
  is not measured. It decides nothing of the rule, which is judged on the library's own terms, but says what it is
  worth.
