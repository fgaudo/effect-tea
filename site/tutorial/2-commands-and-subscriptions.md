---
title: Commands and subscriptions
---

# Commands and subscriptions

The duration becomes a timer: once its minutes are set, it starts, may pause and resume, and finishes. It ticks
every second while it runs, and rings a bell when the time is up. Its code is
[`examples/timer/timer.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/timer/timer.ts), and the rules
of step 1 carry over: "+" and "−" now apply only while the timer is being set.

## One state machine

Where the timer is, is one value with a case for each phase, holding only what exists in it. Flags such as
`isRunning` and `isPaused` would allow combinations that cannot be; a union cannot hold them (see
[state and messages](https://fgaudo.github.io/effect-tea/#state-and-messages)).

{@includeCode ../../examples/timer/timer.ts#state}

## Commands

`update` never runs an effect. When the timer finishes, it returns a **command**, data that says what to do,
and the program's `runCommand` turns it into an Effect. Ringing needs a bell, a service the program declares and
whoever runs it provides. Ringing gives `update` nothing to learn, so its execution answers `None`; a command that
has an answer, such as a save, answers with one message (see
[commands](https://fgaudo.github.io/effect-tea/#commands)).

{@includeCode ../../examples/timer/timer.ts#command}

An execution cannot fail: its type says so. A command that can fail turns its failure into a message, as
[`examples/form`](https://github.com/fgaudo/effect-tea/tree/main/examples/form/form.ts) does with a save.

## Update

Each message applies in some phases and is rejected in the others. A tick is different: the timer listens to
the clock only while it runs (below), so a tick in any other phase cannot arrive, and its arrival is a bug.
`update` throws `defect(reason)` on it, and the run dies instead of hiding it (see
[rejections and defects](https://fgaudo.github.io/effect-tea/#rejections-and-defects)).

{@includeCode ../../examples/timer/timer.ts#update}

The last tick moves the timer to `Finished` and returns the command with the new state, in one step.

## Subscriptions

A **subscription** is what the program listens to. `subscriptions(state)` returns them in a `HashMap`, by key,
and after every change of state the run compares the keys: a new key starts its subscription, a kept key leaves
it running, and a key that went away stops it, and drops what it sent that `update` has not seen (see
[subscriptions](https://fgaudo.github.io/effect-tea/#subscriptions)).

The timer has the key `'ticks'` only while it runs. Pausing removes it, so the clock stops; resuming brings it
back, and a new clock starts. The clock is an Effect `Channel` that sends `Ticked` every second and never ends:

{@includeCode ../../examples/timer/timer.ts#subscriptions}

## Model and program

The model has a case for each phase the screen tells apart, each with the messages of its controls:

{@includeCode ../../examples/timer/timer.ts#model}

The program now declares its commands and its services, and has `runCommand` and `subscriptions`:

{@includeCode ../../examples/timer/timer.ts#program}

Its view, `timerView` in
[`examples/timer/view.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/timer/view.ts), draws each case
as the duration's view did, and formats the seconds left as `m:ss`.

Next, [many timers](./3-children.md).
