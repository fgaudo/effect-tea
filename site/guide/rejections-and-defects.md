---
title: Rejections and defects
---

# Rejections and defects

## In short

Not every message applies in every state. This page shows what your `update` does with a message that does not
apply, and how to choose between `reject` and `defect`.

A message that `update` cannot take in a state is one of two things:

- The message may arrive, and does not apply in that state. `update` returns `reject`, and the run ignores the message.
- The message cannot arrive. It is a bug. `update` calls `defect(reason)`, and the run dies.

To tell the two apart, ask: could the message reach that state while the code of the program and the code of the
library are both right? If a fast finger, a slow draw or another device is enough, it is a `reject`. If only a bug can
bring the message there, it is a `defect`.

|                       | `reject`                                                                                    | `defect(reason)`                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **For a message…**    | that may arrive, and does not apply in this state                                           | that cannot arrive: a bug                                                                                      |
| **For example**       | a tap on a model the state has moved past; the answer of a command for a row since replaced | a completion outside the state only its completion leaves; a subscription's message in a state without its key |
| **What the run does** | ignores it, tells `onIgnored`, and keeps the state                                          | dies with a `ProgramDefect` that says where, whose `cause` is an `InvariantDefect` holding the reason          |

## An example

The timer's `update` (`examples/timer/timer.ts`) rejects a click that does not apply in the state, and dies on a tick
outside `Running`. A tick cannot arrive outside `Running`. The key of the subscription is listed only while the timer
runs, and the run drops what a stopped subscription sent (see
[what "cannot arrive" rests on](#what-cannot-arrive-rests-on)):

{@includeCode ../../examples/timer/timer.ts#update}

## Rules

**`defect` makes a bug loud.** [`form`](../../examples/form/form.ts) throws `defect` on a save that completes while
nothing is saving. A rejection of that save would hide the bug. `defect` is for the synchronous functions of a
program: `init`, `update`, `external`, `onEvent`, `makeModel`, `output`, `subscriptions`, and those of a child's
declaration, as `there` or `ids`. Inside an Effect, `Effect.die` stays.

**What the view draws never rules a message out.** A tap may come from a model drawn before, from two fingers before
the next draw, or from a control still on screen while it animates away. So a message of the view may arrive in any
state, from whatever model it was sent. It is rejected where it does not apply, and applied where it applies. If a
message must not apply to a later state, the message says what it was for, so that `update` rejects it there.

**Nothing is cancelled when the state moves on**: not a command under way, not a model already drawn. So a message
may arrive for a state that has left it behind.

- The answer of a command reaches the `update` of the instance that asked for it, which rejects it where it no longer
  applies: only the program knows what the answer was for, so its message says it, as the id of a row does. The
  library rejects itself an answer for an instance of a child that is gone (see
  [what the library derives](./composition.md#what-the-library-derives)).
- What a subscription sent once its key is gone never reaches `update`: the run drops it (see
  [guarantees](./guarantees.md#what-you-can-rely-on)).

None of these late messages is a defect. They are the price of commands that cannot be cancelled, and of a screen
older than the state.

### What "cannot arrive" rests on

"Cannot arrive" is a promise of the program's state, kept by the run:

- The state says that only a completion leaves an operation, and a command answers once. So the answer of an
  operation that is a state of its own, which only its completion leaves, is never outdated, and an answer outside
  that state is a defect.
- When the state stops listing a key, the run drops what that subscription sent.

Nothing else makes that promise. What the view draws never makes it, as the rules above say. An event never makes it
either.

### An event keeps the timing of its cause

A child that raises an event for a click raises the event whenever the click comes. So the parent's `onEvent` cannot
rule the event out from the parent's own state either.

A handler of `onEvent` that does not apply answers `{ state }`, as [`pages`](../../examples/pages/app.ts) does when
About is asked for while About is open: the child's step is applied, and the handler adds nothing to it. Its type has
no `reject`, which would take back a step that the child has accepted.

A completion promises something about the child's state, not about the parent's state. An event raised for a
completion rules out a state of the parent only where the parent's own state promises it too.
