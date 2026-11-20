---
title: Inputs
---

# Inputs

Each timer gets a name that the user types, such as "Tea" or "Pasta". You will learn what an input is, and how the
library keeps what the user types.

Once more the timer of step 2 stays as it is. A named timer is a program of its own, which holds the timer as a child,
beside the name.

The code is [`examples/timer/named.ts`](../../examples/timer/named.ts).

## An input

A click is something that happened, and `update` decides what it means. The text of a field is different: it is a
value the user gives, and there is nothing to decide.

So the program declares a place in its state for the text, an **input**. The view writes there, and the library
stores what the view writes, or rejects the write. No `update` of the program sees the write.

The name is a plain string of the state:

{@includeCode ../../examples/timer/named.ts#state}

## Declaring it

A program with inputs is made with `program`, as a parent is. Here the named timer declares the timer as a child at
`timer`, and the input `Name` at `name`, both with an optic into its state:

{@includeCode ../../examples/timer/named.ts#compose}

What the named timer gets from the declaration:

- **Its messages:** the timer's, as `{ _tag: 'Timer', message }`, and `{ _tag: 'Name', message }` for a write into
  the name. A write is `{ _tag: 'Written', was, value }`: `value` written over `was`, the name the view drew.
- **The input's rule, the library's:** a write is stored while the name holds, by `Equal`, the value it was written
  over, and rejected otherwise.
- **No `update` of its own:** the named timer has no message of its own to decide on.

Why does a write say what it was written over? So that a keystroke from an old screen cannot overwrite a name the
program has changed since. It is the late click of step 1 again, for text.

The model holds the name as it is. The view draws the input from it, and writes over it (see
[inputs the user types into](../guide/inputs-the-user-types-into.md)).

## The view

The view draws the name as a native `<input>`, a controlled element: its `value` is the name its model holds, and its
`input` listener writes what is typed over that name, through the input's own dispatch from `forwardTo`.

A write is applied in its own event. So when the listener returns, the name holds what was typed, and the bridge has
drawn it. The element needs no `key` of the renderer: it stays the same element, with its focus and its caret, while
the program changes what it shows (see
[the element on screen](../guide/inputs-the-user-types-into.md#the-element-on-screen)).

{@includeCode ../../examples/timer/view.ts#named}

## The list

The list of
[`examples/timer/named-timers.ts`](../../examples/timer/named-timers.ts) is
the one of step 3, with `Named.named` in place of `Timer.timer`. Nothing else changes:

- a write into a timer's name reaches it as its clicks do, `{ _tag: 'Timer', id, message }`;
- a keystroke in the name of a timer already removed, from a model drawn before, is rejected as a click is;
- its view, `namedTimersView`, draws each timer with `namedView`.

The name belongs to the named timer: the list never reads it. A value that the parent reads is different. An example
is the count of each item of a stock-take, which the parent totals and submits. Such a value is the parent's own state:
an input by id, which the parent declares with `inputById` (see
[inputs by id](../guide/inputs-the-user-types-into.md#inputs-by-id), and the example
[`examples/stocktake`](../../examples/stocktake)).

## Running it

[`examples/timer/main.ts`](../../examples/timer/main.ts) runs the list of
named timers in the page, with a bell that beeps. The services of every command are provided around `run`:

{@includeCode ../../examples/timer/main.ts#bell}

The `tapCause` at the end reports a run that dies. An interruption is not a crash.

## What you have

The whole application: named timers that tick, pause and ring, in a few small programs that each know one thing. None
of them needs a browser to be tested. That is the last step.

Next, [testing it](./5-testing.md).
