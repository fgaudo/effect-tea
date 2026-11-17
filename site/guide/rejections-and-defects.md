---
title: Rejections and defects
---

# Rejections and defects

## In short

A message that `update` cannot take in a state is one of two things. Either it may arrive, and does not apply there:
`update` returns `reject`, and the run ignores it. Or it cannot arrive: it is a bug, `update` calls `defect(reason)`,
and the run dies.

To tell them apart, ask whether the message could reach that state while the code of the program and the code of the
library are both right. If a fast finger, a slow frame or another device is enough, it is a `reject`. If only a bug can
bring it there, it is a `defect`.

|                       | `reject`                                                                                    | `defect(reason)`                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **For a message…**    | that may arrive, and does not apply in this state                                           | that cannot arrive: a bug                                                                                      |
| **For example**       | a tap on a frame the state has moved past; the answer of a command for a row since replaced | a completion outside the state only its completion leaves; a subscription's message in a state without its key |
| **What the run does** | ignores it, logs it at the debug level, tells `onIgnored`, and keeps the state              | dies with a `ProgramDefect` that says where, whose `cause` is an `InvariantDefect` holding the reason          |

## An example

The timer's `update` (`examples/timer/timer.ts`) rejects a click that does not apply in the state, and dies on a tick
outside `Running`. A tick cannot arrive there: the subscription's key is listed only while the timer runs, and the run
drops what a stopped subscription sent (see [what "cannot arrive" rests on](#what-cannot-arrive-rests-on)):

{@includeCode ../../examples/timer/timer.ts#update}

## Rules

**`reject` changes nothing.** A second click, or an answer that arrives once the state has moved on, leaves the state
as it was.

**`defect` makes a bug loud.** [`form`](../../examples/form/form.ts) throws it
on a save that completes while nothing is saving. A rejection there would hide the bug.
- The run dies as it dies with any defect (an `Effect.die`, a thrown error: broken code).
- The `InvariantDefect` lets a crash report tell a broken rule of the program from any other error.
- `defect` is an expression, for a branch of a ternary or a `Match`.
- It is for the synchronous functions: `init`, `update`, `onEvent`, `makeModel`, `subscriptions`. Inside an Effect,
  `Effect.die` stays.

**What the view draws never rules a message out.** A tap may come from a frame drawn before. It may come from two
fingers in one frame, or from a control still on screen while it animates away. So a message of the view may arrive in
any state. It is rejected where it does not apply, whatever the model showed. And it is applied where it applies,
whichever frame it was sent from. If a message must not apply to a later state, it says what it was for, so that
`update` rejects it there.

**A message that arrives too late is judged by whoever knows what it was for.** Nothing is cancelled when the state
moves on: not a command under way, not what a subscription sent before its key went away, not a frame already drawn. A
message of the view, as above, is rejected by `update` where it does not apply. Apart from messages of the view, three
kinds of message may arrive for a state that has left them behind. Each is settled by whoever knows what it was for:

- **A subscription's message once its key is gone** is dropped by the run before `update`, even if the key has come
  back since. The run stopped that subscription. `onIgnored` does not hear it, and the run logs it at the debug level.
- **A command's answer for what has since changed** reaches `update`, which rejects it. Only the program knows what the
  answer was for, so its message says what it was for (see ids that come back in
  [children by id](./composition.md#children-by-id)).
- **A write over a value the program has since replaced** is rejected by the library, from the state and the message
  alone. The library can do this because the input's place is declared to it (see
  [inputs the user types into](./inputs-the-user-types-into.md)).

None of them is a defect. They are the price of commands that cannot be cancelled, of keys that come and go, and of
frames older than the state.

**Checking the model is left to your tests.** Whether the model holds only what applies, and all of it, is for the
tests (see [testing](./testing.md)).

## Precisely

### What "cannot arrive" rests on

"Cannot arrive" is a promise of the program's state, kept by the run:

- The state says that only a completion leaves an operation, and a command answers once.
- When the state stops listing a key, the run drops what that subscription sent.

Nothing else makes that promise. What the view draws never does, as the rules above say. Neither does an event.

### An event keeps the timing of its cause

A child that raises an event for a click raises it whenever the click comes. So the parent's `onEvent` cannot rule it
out from its own state either.

A handler answers with a step, and its type has no `reject`. A handler that does not apply answers `{ state }`, as
[`pages`](../../examples/pages/app.ts) does when About is asked for while it
is open. A rejection there would take back a step that the child has accepted, including the child's own change of
state. And a child tested alone would then promise what the program does not.

Such a message is applied, and does nothing:

- `onApplied` hears it with no commands;
- `onApplied` hears it with the state it came to: the very same state, the same object, when the handler returns the
  one it was given.

A completion promises something about the child's state, not about its parent's state. An event raised for a
completion rules out a state of the parent only where the parent's own state promises it too.
