---
title: Inputs
---

# Inputs

Each timer gets a name the user types: "Tea", "Pasta". The timer of step 2 stays as it is: a named timer is a
program of its own that holds it as a child, beside the name. Its code is
[`examples/timer/named.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/timer/named.ts).

## An input

A click is something that happened, which `update` decides on. The text of a field is a value the user gives. The
program declares a place in its state for it, an **input**, and the library stores what the view writes there, or
rejects it: no `update` of the program's sees it. The name is a plain string of the state:

{@includeCode ../../examples/timer/named.ts#state}

## Declaring it

A program with inputs is made with `composition`, as a parent is. Here it declares the timer as a child at `timer`,
and the input `Name` at `name`, both with an optic into its state:

{@includeCode ../../examples/timer/named.ts#compose}

What it gets from the declaration:

- **Its messages:** the timer's, as `{ _tag: 'Timer', message }`, and `{ _tag: 'Name', message }` for a write into
  the name, `{ _tag: 'Written', was, value }`: `value` written over `was`, the name the view drew.
- **The input's rule, the library's:** a write is stored while the name holds, by `Equal`, the value it was written
  over, and rejected otherwise.
- **No `update` of its own:** the named timer has no message of its own to decide on.

The model holds the name as it is, for the view to draw the input from and to write over (see
[inputs the user types into](../guide/inputs-the-user-types-into.md)).

## The view

The view draws the name with the bridge's `shows`, over a native `<input>`, through the input's own dispatch from
`forwardTo`. The bridge writes what is typed over what the element showed, and gives the element the program's value
only once the state has moved on without it. The element needs no key: the bridge keeps it, and its focus, while the
program changes what it shows (see
[the element on screen](../guide/inputs-the-user-types-into.md#the-element-on-screen)).

{@includeCode ../../examples/timer/view.ts#named}

## The list

The list of
[`examples/timer/named-timers.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/timer/named-timers.ts) is
the one of step 3, with `Named.named` in place of `Timer.timer`. A write into a timer's name reaches it as its clicks
do, `{ _tag: 'Timer', id, message }`, and a key typed into a timer already removed, from a frame drawn before, is
rejected as a click is. Its view, `namedTimersView`, draws each timer with `namedView`.

The name is a named timer's own: the list never reads it. Values the parent reads, such as the count of each item of a
stock-take, which it totals and submits, are the parent's own state, an input by id that it declares with `inputById`
(see [inputs by id](../guide/composition.md#inputs-by-id), and the example
[`examples/stocktake`](https://github.com/fgaudo/effect-tea/tree/main/examples/stocktake)).

## Running it

[`examples/timer/main.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/timer/main.ts) runs the list of
named timers in the page, with a bell that beeps. The services of every command are provided around `run`:

{@includeCode ../../examples/timer/main.ts#bell}

Next, [testing it](./5-testing.md).
