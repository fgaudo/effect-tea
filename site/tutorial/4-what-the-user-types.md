---
title: What the user types
---

# What the user types

Each timer gets a name that the user types, such as "Tea" or "Pasta". You will learn how a program receives what the
user types: as a message, which the model holds without the text, and which the view fills.

Once more the timer of step 2 stays as it is. A named timer is a program of its own, which holds the timer as a child,
beside the name.

The code is [`examples/timer/named.ts`](../../examples/timer/named.ts).

## A message the view fills

A click is something that happened, and `update` decides what it means. What the user types is too: a message,
`NameTyped`, with the text that the field holds. `update` decides what it does, and here it stores the text.

The model holds the message without the text, as it holds the message of a click: `{ _tag: 'NameTyped' } as const`.
The view fills the text that the element holds, and sends the message. So the view still sends only what its model
holds, and builds no message of its own.

A text is the first case. The mark of a checkbox, the offset of a scroll and a measured size are messages that the view
fills too: each is a value that an element holds or reports (see
[what an element gives](../guide/what-an-element-gives.md)).

The name is a plain string of the state, and `NameTyped` the message of what is typed:

{@includeCode ../../examples/timer/named.ts#state}

## Declaring it

The named timer is made with `program`, as a parent is. It declares the timer as a child that is always there, with
`child`, and names `NameTyped` as its own message. The library keeps the timer, so the named timer's own state is the
name alone:

{@includeCode ../../examples/timer/named.ts#compose}

What the named timer gets from the declaration:

- **Its messages:** `NameTyped`, its own, and the timer's, as `{ _tag: 'Timer', message }`.
- **Its `update`:** it stores the text as it is typed, whatever it is. The name of a named timer can always be typed
  into, so `update` never rejects it.
- **Its model:** the name, the message of what is typed without its text, and the timer's model.

## The view

The view draws the name as a native `<input>`, a controlled element: its `value` is the name its model holds, and its
`input` listener sends the message that the model holds, filled with what the element holds.

A message is applied in its own event. So when the listener returns, the name holds what was typed, and the bridge
draws it before the next event. The element needs no `key` of the renderer: it stays the same element, with its focus
and its caret, while the program changes what it shows (see
[the element on screen](../guide/what-an-element-gives.md#the-element-on-screen)).

{@includeCode ../../examples/timer/view.ts#named}

## The list

The list of
[`examples/timer/named-timers.ts`](../../examples/timer/named-timers.ts) is
the one of step 3, with `Named.named` in place of `Timer.timer`. Nothing else changes:

- what is typed into a timer's name reaches it as its clicks do, `{ _tag: 'Timer', id, message }`;
- a keystroke in the name of a timer already removed, from a model drawn before, is rejected as a click is;
- its view, `namedTimersView`, draws each timer with `namedView`.

The name belongs to the named timer: the list never reads it. A value that the parent reads is different. It belongs
to the program whose rules use it (see [splitting a program](../guide/structuring-a-program.md#splitting-a-program)).
An example is the count of each item of a stock-take, which the parent adds to on a scan, locks and submits. What is
typed into each count is then a message of the parent's own, with the item's id (see
[in each row](../guide/what-an-element-gives.md#in-each-row), and the example
[`examples/stocktake`](../../examples/stocktake)). Where only a child's rules use the value, the child keeps it, and the
parent reads what the child concludes from it through the child's `output` (see
[outputs](../guide/events-and-external-messages.md#outputs)).

## Running it

[`examples/timer/main.ts`](../../examples/timer/main.ts) runs the list of
named timers in the page, with a bell that beeps. The services of every command are provided around `run`:

{@includeCode ../../examples/timer/main.ts#bell}

The `tapCause` at the end reports a run that dies. An interruption is not a crash.

## What you have

The whole application: named timers that tick, pause and ring, in a few small programs that each know one thing. None
of them needs a browser to be tested. That is the last step.

Next, [testing it](./5-testing.md).
