# A step that does nothing, and what the tests say of it

**Status:** decided in part by the owner, 15 November 2026, after a review by Fable 5.2: points 1, 2, 3 and 5 of
"Decision" are done, and point 4, `Inert`, is **deferred**, not rejected ("What was decided"). The rest of this record
is the proposal as it was, 14 November 2026, with what it rests on: a review of the invariants by three models (Fable
5.2 twice, Opus 5.5 once), an earlier discussion in an application that uses the library (26 October 2026), and two
spikes, each on a worktree of its own, on Effect 4.1.4 and Bun 1.4.4, which are not kept. Its words were aligned with
the contract of the model ([`boundary.md`](boundary.md), item 1), and read again after the port of the plain input
([`registers.md`](registers.md)): "Since the port" says what that changed.

## What was decided

On 15 November 2026, by the owner:

- **Done**: `onEvent` does not reject (1); a step does nothing when it leaves the same state by `Equal`, with no
  commands and no events (2), one predicate in `dispatchViolations` for `ActsTwice` and `Missing`; `Missing` leaves
  out a candidate whose step does nothing (3), so `pages` lost its `withheld` for the Clock's About; the README says
  why a handler has no `reject`, and that `onApplied` hears such a message with the very same state only where the
  handler returns the one it was given (5, worded so, since the tool compares by `Equal` and `before === after` is
  identity).
- **`withheld` kept, with an example**: the clock of `pages` has a format, ISO or Unix, which would change on the
  page under About, so its test withholds it there. It is the use the README names, a page that another covers, and
  `withheld` keeps one meaning: left out on purpose though it would act.
- **`list` over an empty list**: `update` rejects `StopAllClicked`, and the model leaves it out, as an `Option`,
  since "missing" is all the screen tells apart there. The parent's own state tells it, which is what the README's
  rule asks.
- **`rehearse`**: does not fail on a `send` whose step does nothing. The run applies it and `onApplied` hears it, so
  `rehearse` follows the run; its failure on a rejection reports what `update` said, while doing nothing is a
  judgement of the model, which has its place in `dispatchViolations` and its exemptions there.
- **`Inert` deferred.** The review found it would flag what the library itself admits: a message answered `{ state }`
  once its intent is met is the documented guard against a double tap (`Closed` in `dispatch-violations.test.ts`, a
  "select" of the current tab), and a broadcast from a parent (`forEach` over its children, as "Stop all" with every
  stopwatch stopped) is an alarm the parent cannot avoid without reading its children. Over the examples it found one
  real case, the empty list, now fixed without it; 819 of 2,000 states of `list` were flagged, 433 over an empty list
  and 386 with entries all stopped (Fable's measure, not run again). It is weighed again with what `Inert` finds in an
  application, and with "`dispatchViolations` knows where the inputs are" (`registers.md`, "To explore"), which
  would spare it an exemption for writes.
- **The comment of `dispatchViolations`** no longer says that an instance of a class without `Equal` compares by
  reference: `Equal.equals`'s documentation at 4.1.4 says how plain objects, arrays, maps, sets and dates compare,
  and that functions compare by reference, and says nothing of other instances, so the comment names functions alone.

## Context

A handler of `onEvent` answers with a step, and its type has no `reject`: an event that does not apply is answered
`{ state }` (README, "Rejections and defects"; `pages` does so when About is asked for while it is open). The
question whether a handler should be allowed to reject came up more than once, and the review raised it again as the
one place where "`reject` means the same everywhere" does not hold across a parent and its children.

What the status quo costs, as the code has it:

- **A view's message whose only effect is such an event is applied, and does nothing.** `onIgnored` does not hear
  it; `onApplied` does, with `before === after` and no commands. `dispatchViolations` counts it as accepted.
- **`Missing` asks the model for a message that would do nothing.** The check reads only whether `update` rejects,
  so `pages` lists the Clock's messages under About as `withheld`, an option meant for what `update` would act on
  and the model withholds on purpose.
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
  `Rejected` for the child's own control, which the child's model cannot avoid: it is made of the child's state
  alone.
- **One answer, two outcomes the handler cannot tell apart.** A handler does not know what caused its event. The
  same `reject` would be an ignored message by one way and a defect by the other, and no type says which.

The proposal cost little to write (some thirty lines of `compose.ts`, no test of the suite broken), which is no
argument for it. `andThen` and `forEach` take no rejection as a next step, and the defect of `tell` has to ask the
child's `update` again to say who rejected.

## Decision

Proposed, and decided in part ("What was decided"). Composition stays as it is, and the testing tool learns to see
a step that does nothing.

1. **`onEvent` does not reject.** An event is part of a step its child has already accepted; an intent that is
   already met is answered `{ state }`.
2. **A step does nothing when it leaves the same state, by `Equal`, and has no commands and no events.** It is the
   rule `ActsTwice` already applies to a message sent twice, so the tool keeps one meaning of "changes nothing". By
   identity, two programs that behave alike would be judged differently by how they build their state, and a
   needless copy of the state would silence the check.
3. **`Missing` leaves out a candidate whose step does nothing.** A control that would do nothing is no control
   missing from the screen. `pages` loses its `withheld`, which goes back to meaning one thing.
4. **`Inert`, a new violation: a message the model holds whose step does nothing**, judged on the first send (the
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
| "`update` accepts it, and the model does not hold it" (`Missing`) | `withheld`: withheld on purpose |
| "The model holds it, and it does nothing" (`Inert`) | `inert`: on purpose |

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
  The test of `form-react` is gone since: it had become a copy of `form`'s.
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

## Since the port

What the plain input changed of the above, read in the code at `7074b7a` and not run:

- **No input asks for an exemption.** `NameChanged` is gone from `form` and `form-react`: the name is an input,
  `write(was, value)` goes through the input's dispatch, and `form`'s test gives `dispatchViolations` only the
  messages its model holds, Save and nothing typed. The 4 and 7 states of 2,000 have no counterpart.
- **A write of the value held leaves the very value** (`written`, in `input.ts`), so it draws no frame, and the open
  question of `Field.typed` is closed. Such a write is a step that does nothing; `Inert` would judge it only if a
  test gave writes to the tool, which no example does.
- **What stands**: `withheld` in `pages` (`app.test.ts:68`), `StopAllClicked` in `list` and its empty list, the
  question of `rehearse`, a key whose message does nothing, the comment of `dispatchViolations`, and the application.
  The decision and its five points are as they were.

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

- **A test of a model against `update` fails where a control the model holds does nothing**, until the model leaves
  it out, `update` rejects it, or the test lists it as `inert`.
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
- **A key whose message does nothing.** `Inert` is of what a model holds. A subscription has the same mistake, and its
  own way to leave a control out: a state that does not list the key (a "back" button of the device, not listened
  to at the root, is left to the system). A key that is listed and whose message does nothing is found by no tool:
  no test can read from a subscription what it will send, as it reads a model, so a test would have to list the
  messages of each key (see [`declared-inputs.md`](declared-inputs.md), "What still makes sense"). Until then a
  property written by hand holds it.
- **`Field.typed`** built a new field for the text it had, so the same text drew a frame for nothing. Closed by the
  port: a write of the value held leaves the very value ("Since the port").
- **The comment of `dispatchViolations`** says an instance of a class that does not implement `Equal` compares by
  reference. The check above found otherwise for one class: to be read again when the file changes.
- **An application.** What `Inert` finds in a program larger than the examples, and how many exemptions it asks for,
  is not measured. It decides nothing of the rule, which is judged on the library's own terms, but says what it is
  worth.
