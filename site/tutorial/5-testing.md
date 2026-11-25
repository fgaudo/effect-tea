---
title: Testing
---

# Testing

This is the step the others were for. Most of a program is pure, so most of its tests need no runtime: no browser,
and no clock to wait for. You will test the timer's `update` and its model, play a scenario, and then test a parent
and what the user types, with the tools of `@fgaudo/effect-tea/testing`.

The tests of the timer are in
[`examples/timer/timer.test.ts`](../../examples/timer/timer.test.ts). They use
`bun:test`, [fast-check](https://fast-check.dev) to generate states, and the tools of `@fgaudo/effect-tea/testing`:

{@includeCode ../../examples/timer/timer.test.ts#imports}

## Any valid state

A rule of the timer should hold in every state the timer can be in, not only in the two or three a test happens to
write down. So the tests start from an arbitrary that produces only valid states, every phase among them:

{@includeCode ../../examples/timer/timer.test.ts#states}

## `update`

`update` is a function, and is tested as one. `applyAll(update, messages, from)` applies messages one after the other,
and fails the test when `update` rejects one of them. Three things to notice in these tests:

- a rejection is asserted as `reject` itself;
- a defect is asserted with `InvariantDefect`;
- the commands are asserted by value, since they are data. The bell never rings here.

{@includeCode ../../examples/timer/timer.test.ts#update}

The second test runs a whole minute, sixty ticks, without waiting: a tick is only a message.

`timer.subscriptions(state)` lists the keys of what the program listens to in a state. So "the clock runs exactly while the
timer does" is one line, checked for any state:

{@includeCode ../../examples/timer/timer.test.ts#subscriptions}

## The model

Here is a bug no test of `update` can find: a button on screen that does nothing, or a button that should be there and
is not. The run does not check that the model holds only what `update` accepts. A test does, for any state, in three
parts.

**First, a reader.** It is a function of the test's own, which returns the messages a model holds, a case of the model
at a time ([`examples/timer/timer.test_reader.ts`][reader]):

[reader]: ../../examples/timer/timer.test_reader.ts

{@includeCode ../../examples/timer/timer.test_reader.ts#reader}

**Second, the candidates:** the messages a user could send, a tag at a time. The compiler checks the record against
`Message`, so a new message does not compile until the test says what a user could ask with it:

{@includeCode ../../examples/timer/timer.test.ts#candidates}

**Third, `dispatchViolations`,** which is given both. It checks that:

- each message the model holds is accepted;
- each one acts once when sent twice, unless it is meant to repeat (`repeatable`), as "+" and "−" are;
- each candidate that `update` accepts, and whose step would do something, is among those the model holds.

That last check is what finds a reader that forgot a field of the model.

{@includeCode ../../examples/timer/timer.test.ts#model}

That the view draws what its model holds is not checked here. It is checked with the renderer's own tools (see
[testing](../guide/testing.md)), as [the test of the list of timers](../../examples/timer/timers.test.ts) does. That is
why the reader lists the messages in the order the view draws them.

## A scenario

The tests so far look at one function at a time. `rehearse` plays a scenario: it acts on the program as a user does,
through what the current model shows. But nothing runs by itself. The test says when each thing happens:

- when a subscription's message is heard: `hear`;
- when a command runs: `run`. It runs through the program's `runCommand`, with the services the test provides.

So the test below can look at the timer between its last tick and its bell. A running program would not stop at that
moment.

{@includeCode ../../examples/timer/timer.test.ts#rehearse}

`rehearse` is strict, so that a scenario cannot pass by accident. It fails:

- when the test sends what the model does not show, or what `update` rejects;
- when it runs or hears what is not there;
- on a defect of the program, as the run dies of it;
- at the end, when a command is still pending or under way, or its `run` was interrupted before it answered, since
  its answer would still arrive;
- at the end, when a call of `hearNext`, which runs a subscription, still waits for its message.

## A parent

A parent is a program like any other: `timers.update`, `timers.makeModel` and `timers.init` are tested with the
same tools.

What changes is the wrapping. Its messages for a child are `{ _tag: 'Timer', id, message }`. Its commands and the keys
of its children's subscriptions also name the instance of the timer, the number of its start:
`{ _tag: 'Timer', id, instance, command }` and `{ _tag: 'Timer', id, instance, key: 'ticks' }` (see
[the number of an instance](../guide/testing.md#the-number-of-an-instance)). That is what `timers.subscriptions`,
`rehearsal.run` and `rehearsal.hear` see. The tests of
[`examples/timer/timers.test.ts`](../../examples/timer/timers.test.ts) name its messages:

{@includeCode ../../examples/timer/timers.test.ts#messages}

and check its own rules, each timer's state, and the keys of the timers that tick:

{@includeCode ../../examples/timer/timers.test.ts#update}

`dispatchViolations` checks the parent's model the same way, with candidates for every timer, each wrapped with its
id. The parent's reader calls the timer's, and wraps what it returns as the parent receives it. That is why the
timer's reader lies in a module of its own:

{@includeCode ../../examples/timer/timers.test.ts#reader}

## What the user types

What the user types is a message, which `update` decides on as any other. The tests of
[`examples/timer/named.test.ts`](../../examples/timer/named.test.ts) check that a name typed is stored:

{@includeCode ../../examples/timer/named.test.ts#update}

The model holds the message without its text, and a test fills it as the view does. The named timer's reader takes
the text to fill, and returns what is typed first, then its timer's messages, wrapped:

{@includeCode ../../examples/timer/named.test_reader.ts#reader}

The candidates of `dispatchViolations` list what is typed with the same text, so that `Missing` compares the same
message:

{@includeCode ../../examples/timer/named.test.ts#candidates}

The test fills a text other than the name that the model shows. Typing the name that the field already holds changes
nothing, which `Inert` would find:

{@includeCode ../../examples/timer/named.test.ts#violations}

In a scenario, `send` takes what is typed from the current model, filled as the view fills it, as it takes a click:

{@includeCode ../../examples/timer/named.test.ts#rehearse}

## What you have

An application that you built, and tested without a browser and without waiting a second.

## Where next

From here:

- The other tools, `simulate` for a flow with its commands answered at once and `drive` for the running program,
  are in [testing tools](../guide/testing-tools.md), and when a rejected message fails the test.
- [Guarantees](../guide/guarantees.md) says what the library promises, and what is left to
  the program.
- The other [examples](https://fgaudo.github.io/effect-tea/#examples) show what the timer does not: a failure as a
  message, events between a parent and its children.

Next, [the bridge the timer is drawn with](../guide/writing-a-bridge.md).
