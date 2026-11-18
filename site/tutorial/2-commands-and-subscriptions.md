---
title: Commands and subscriptions
---

# Commands and subscriptions

Now the duration becomes a timer. Once its minutes are set, the timer starts, may pause and resume, and finishes. It
ticks every second while it runs, and rings a bell when the time is up.

You will learn two new things. The program acts on the world with a **command** (the bell). The world acts on the
program through a **subscription** (the clock). Neither happens inside `update`.

The code is [`examples/timer/timer.ts`](../../examples/timer/timer.ts). The
rules of step 1 carry over: "+" and "−" now apply only while the timer is being set.

## One state machine

The phase of the timer is one value, with a case for each phase. Each case holds only what exists in it: the seconds
left exist while the timer runs or is paused, and nowhere else.

Why not two flags, `isRunning` and `isPaused`? Because flags combine, and some combinations cannot be. A union cannot
hold those combinations (see [state and messages](../guide/structuring-a-program.md#state-and-messages)).

{@includeCode ../../examples/timer/timer.ts#state}

## Commands

`update` never runs an effect. When the timer finishes, `update` returns a **command**: data that says what to do.
The program's `runCommand` turns that command into an Effect.

Ringing needs a bell. The bell is a service: the program asks for it, and whoever runs the program provides it. It is
a beep in the browser, and a counter in a test.

A command may answer with one message, as a save does when it ends. Ringing gives `update` nothing to learn, so its
execution answers `None` (see [commands](../guide/commands.md)).

{@includeCode ../../examples/timer/timer.ts#command}

An execution cannot fail: its type says so. A command that can fail turns its failure into a message, as
[`examples/form`](../../examples/form/form.ts) does with a save.

## Update

Each message applies in some phases, and is rejected in the others: "Pause" means something only while the timer runs.

A tick is different. The timer listens to the clock only while it runs (below), so a tick in any other phase cannot
arrive. If a tick arrives anyway, something is broken, and hiding it would be worse. `update` throws `defect(reason)`
on it, and the run dies (see [rejections and defects](../guide/rejections-and-defects.md)).

So there are two answers to a message that does not fit. One that may arrive, and does not apply, is rejected. One
that cannot arrive at all is a defect.

{@includeCode ../../examples/timer/timer.ts#update}

Look at the last tick: it moves the timer to `Finished` and returns the command with the new state, in one step.

## Subscriptions

A **subscription** is what the program listens to. `subscriptions(state)` returns them in a `HashMap`, by key. After
every change of state the run compares the keys:

- a new key starts its subscription;
- a kept key leaves it running;
- a key that went away stops it, and drops what it sent that `update` has not seen (see
  [subscriptions](../guide/subscriptions.md)).

The timer has the key `'ticks'` only while it runs. Pausing removes the key, so the clock stops. Resuming brings the
key back, and a new clock starts. Nobody starts or stops a clock by hand: the state says when one is wanted.

The clock is an Effect `Channel` that sends `Ticked` every second and never ends:

{@includeCode ../../examples/timer/timer.ts#subscriptions}

## Model and program

The model has a case for each phase the screen tells apart, each with the messages of its controls:

{@includeCode ../../examples/timer/timer.ts#model}

The program now names its commands, and has `runCommand` and `subscriptions`. You never name the program's services:
the library reads them from `runCommand` and `subscriptions`. Here the only service is the bell.

{@includeCode ../../examples/timer/timer.ts#program}

Its view, `timerView` in
[`examples/timer/view.ts`](../../examples/timer/view.ts), draws each case
as the duration's view did, and formats the seconds left as `m:ss`.

## What you have

A timer whose every effect is visible as data: the bell is a command `update` returns, and the clock is a key the
state lists. A test can read both without ringing anything or waiting a second, as step 5 does.

Next, [many timers](./3-children.md).
