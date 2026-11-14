---
title: Testing
---

# Testing

Most of a program is pure, so most of its tests need no runtime. The tests of the timer, in
[`examples/timer/timer.test.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/timer/timer.test.ts), use
`bun:test`, [fast-check](https://fast-check.dev) for states, and the tools of `@fgaudo/effect-tea/testing`:

{@includeCode ../../examples/timer/timer.test.ts#imports}

## Any valid state

The tests check their rules for any state the timer can be in, so they start from an arbitrary that produces
only valid states, every phase among them, and from the messages a user could send:

{@includeCode ../../examples/timer/timer.test.ts#states}

## `update`

`applyAll(update)` applies messages one after the other, and fails the test when `update` rejects one of them. A
rejection is asserted with `isRejected`, a defect with `InvariantDefect`, and the commands by value, since they are
data:

{@includeCode ../../examples/timer/timer.test.ts#update}

`subscriptionsOf(timer)(state)` says what the program listens to in a state:

{@includeCode ../../examples/timer/timer.test.ts#subscriptions}

## The model

The run does not check that the model holds only what `update` accepts. A test does, for any state. It reads the
messages a model holds with a function of its own, a case of the model at a time
([`examples/timer/reader.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/timer/reader.ts)):

{@includeCode ../../examples/timer/reader.ts#reader}

and gives them to `dispatchViolations`: each message the model holds must be accepted, and act once when sent twice
unless it is meant to repeat (`repeatable`), and each of the messages a user could send that `update` accepts must
be among those the model holds. That last check is what finds a reader that forgot a field of the model.

{@includeCode ../../examples/timer/timer.test.ts#model}

That the view draws what its model holds is not checked here: it is checked with the renderer's own tools (see
[testing](https://fgaudo.github.io/effect-tea/#testing)).

## A scenario

`rehearse` acts on the program as a user does, through what the current model shows, but nothing runs by itself:
the test says when a subscription's message is heard (`hear`) and when a command runs (`run`), through the
program's `runCommand`, with the services the test provides. It fails when a command is still pending at the end,
since its answer would still arrive.

{@includeCode ../../examples/timer/timer.test.ts#rehearse}

## A parent

A parent is a program like any other: `timers.update`, `timers.makeModel` and `timers.init` are tested with the
same tools. Its messages for a child are wrapped, `{ _tag: 'Timer', id, message }`, and so are its commands and
the keys of its children's subscriptions, which is what `subscriptionsOf`, `rehearsal.run` and `rehearsal.hear`
see. The tests of
[`examples/timer/timers.test.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/timer/timers.test.ts)
name its messages:

{@includeCode ../../examples/timer/timers.test.ts#messages}

and check its own rules, each timer's state, and the keys of the timers that tick:

{@includeCode ../../examples/timer/timers.test.ts#update}

`dispatchViolations` checks the parent's model the same way, with candidates for every timer, each wrapped with its
id. The parent's reader calls the timer's, which is why that one lies in a module of its own, and wraps what it
returns as the parent receives it:

{@includeCode ../../examples/timer/timers.test.ts#reader}

## Where next

- The other tools, `simulate` for a flow with its commands answered at once and `drive` for the running program,
  are in [testing](https://fgaudo.github.io/effect-tea/#testing), with what each fails on and what it ignores.
- [Guarantees](https://fgaudo.github.io/effect-tea/#guarantees) says what the library promises, and what is left to
  the program.
- The other [examples](https://fgaudo.github.io/effect-tea/#examples) show what the timer does not: an input the
  user types into, a failure as a message, events between a parent and its children.
