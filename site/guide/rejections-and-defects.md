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

**`reject` changes nothing.** A second click, or an answer that arrives once the state has moved on, leaves the state
as it was.

**`defect` makes a bug loud.** [`form`](../../examples/form/form.ts) throws `defect` on a save that completes while
nothing is saving. A rejection of that save would hide the bug.

- The run dies as it dies with any defect (an `Effect.die`, a thrown error: broken code). An `update` that throws an
  error of its own ends the run the same way, and the `cause` is then that error.
- The `InvariantDefect` lets a crash report tell a broken rule of the program from any other error.
- Only `defect` makes an `InvariantDefect`, so that it means only this. A program reads one, as a test or a crash
  report does. The types refuse to build one, with `new` or with a class that extends it.
- `defect` is an expression, for a branch of a ternary or a `Match`.
- `defect` is for the synchronous functions: `init`, `update`, `onEvent`, `makeModel`, `subscriptions`. Inside an
  Effect, `Effect.die` stays.

**What the view draws never rules a message out.** A tap may come:

- from a model drawn before;
- from two fingers before the next draw;
- from a control still on screen while it animates away.

So a message of the view may arrive in any state. The message is rejected where it does not apply, whatever the model
showed. The message is applied where it applies, from whatever model it was sent. If a message must not apply to a
later state, the message says what it was for, so that `update` rejects it in that later state.

**A message that arrives too late is judged by whoever knows what it was for.** Nothing is cancelled when the state
moves on:

- not a command under way;
- not what a subscription sent before its key went away;
- not a model already drawn.

A message of the view is rejected by `update` where it does not apply, as above. Two other kinds of message may arrive
for a state that has left them behind. Each kind is settled by whoever knows
what the message was for:

| A late message                                    | Who settles it                                                                      | How                                                                                                                                                                                                                                                                                 | `onIgnored`                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **A subscription's message once its key is gone** | The run. The run stops that subscription.                                           | The run drops the message before `update`, even if the key has come back since.                                                                                                                                                                                                     | Does not hear it.                      |
| **A command's answer for what has since changed** | `update`. Only the program knows what the answer was for. For a child, the library. | The answer reaches `update`, which rejects it: its message says what it was for. An answer for an instance of a child that is no longer there is rejected by the library, since it names that instance (see [what the library derives](./composition.md#what-the-library-derives)). | Hears it, as it hears every rejection. |

None of these late messages is a defect. They are the price of commands that cannot be cancelled, of keys that come and
go, and of a screen older than the state.

**Checking the model is left to your tests.** Whether the model holds only what applies, and all of it, is for the
tests (see [testing](./testing.md)).

### What "cannot arrive" rests on

"Cannot arrive" is a promise of the program's state, kept by the run:

- The state says that only a completion leaves an operation, and a command answers once.
- When the state stops listing a key, the run drops what that subscription sent.

Nothing else makes that promise. What the view draws never makes it, as the rules above say. An event never makes it
either.

### An event keeps the timing of its cause

A child that raises an event for a click raises the event whenever the click comes. So the parent's `onEvent` cannot
rule the event out from the parent's own state either.

A handler of `onEvent` answers with a step, and the handler's type has no `reject`. A handler that does not apply
answers `{ state }`, as [`pages`](../../examples/pages/app.ts) does when About is asked for while About is open. A
rejection there would take back a step that the child has accepted, including the child's own change of state. And a
child tested alone would then promise what the program does not.

Such a message is applied, and its handler adds nothing to it:

- `onApplied` hears it with the commands of the child's own step, and no others;
- `onApplied` hears it with the state it came to: the very same state, the same object or the same primitive value,
  when the child's step kept the child's state and the handler returns the one it was given.

A completion promises something about the child's state, not about the parent's state. An event raised for a
completion rules out a state of the parent only where the parent's own state promises it too.

## Do and don't

Each pair sums up a rule of this page. The rule itself is above.

| Do                                                                             | Don't                                                                                   |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Return `reject` for a message that may arrive and does not apply in the state. | Call `defect` on a message that a fast finger, a slow draw or another device can bring. |
| Call `defect(reason)` on a message that only a bug can bring.                  | Return `reject` for that message. A rejection would hide the bug.                       |
| Expect a message of the view in any state, from any model.                     | Call `defect` on a message of the view because the model did not show it.               |
| Call `defect` in `init`, `update`, `onEvent`, `makeModel` and `subscriptions`. | Call `defect` inside an Effect. There, `Effect.die` stays.                              |
| Answer `{ state }` in a handler of `onEvent` that does not apply.              | Return `reject` from a handler of `onEvent`. The handler's type has no `reject`.        |

```ts
// Don't: the type of a handler of `onEvent` has no `reject`, so this does not compile
Clock: (event) => (state) =>
  Opt.isSome(state.about) ? reject : { state: { about: Opt.some({ openedAt: event.at }) } },

// Do: a handler that does not apply answers `{ state }`
Clock: (event) => (state) =>
  Opt.isSome(state.about) ? { state } : { state: { about: Opt.some({ openedAt: event.at }) } },
```
