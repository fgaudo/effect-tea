---
title: Guarantees
---

# Guarantees

## In short

This page lists what the library promises about a running program, so that you know what your program can count on.
The library's tests check each guarantee. The second list is what the library leaves to you: the rules that nothing
checks, which your program keeps. It adds no promise: where it says what the library does, the page it links promises
it (see [what a page promises](./index.md#what-a-page-promises)). What the screen shows beside the program's model is
each bridge's to promise (see [view](./view.md#rules)).

## What you can rely on

- **One message at a time, in the order they were sent.** A message is applied in the call that sends it: a
  dispatch's as it is sent, a subscription's as it is emitted, and a command's answer as the command ends, once its
  scope has closed. A message sent while another is being applied, as a renderer's listener sends one, is applied
  right after it.
  - The step of a message is its `update`, then `onApplied` or `onIgnored`, then the listeners of the `App`, once the
    new state is current.
  - What the step does in the world follows, in the order of the states: the subscriptions it stops and then those it
    starts, and the start of its commands. So the state is ahead of its effects: when a message has been applied, its
    commands may not have started yet.
- **Outdated clicks are harmless.** A message that `update` rejects is ignored: the state stays as it was, however many
  messages came in between.
- **A parent's children are those its own state lists.** The library keeps them, starts each one that a step lists
  anew, with its first commands, and drops each one that the state no longer lists. It gives the parent no child's
  state. When a child is there, and when it starts again, is in [composition](./composition.md#when-a-child-is-there).
- **An answer reaches the instance that asked for it, or is rejected.** Each start of a child is an instance of its
  own, and its commands and its subscriptions name it. Where that instance is no longer there, its answer is rejected,
  even when the child, or a child at the same id, is there again. So is a message of a view whose dispatch names the
  instance (see [composition](./composition.md#childrens-views)).
- **A child was last told what its parent's state gives.** A child declared with `tell` is told its value as it
  starts, and after a step of its parent only a value that is another, by `Equal`, than the one its declaration last
  told it: a step that gives an equal value tells it nothing. What a step lists in `tell` is told apart. So
  once a step is taken, each such child was last told by its declaration the value of its parent's state (see
  [composition](./composition.md#when-a-child-is-there)).
- **Subscriptions follow their keys.** A new state starts the subscription of each key it brings, and interrupts that
  of each key it takes away, by the rules of [subscriptions](./subscriptions.md#rules).
  - Both happen once that state is current, and before any start of a later state. A later message may be applied
    first.
  - The subscriptions that one state stops release what they hold together, not one after the other.
  - From the moment the key is gone, nothing the subscription sent reaches `update`, even before it has been stopped,
    and even if the same key comes back later.
- **Nothing outlives what acquired it.** Each command and each subscription has a scope of its own. What one of them
  acquires is released when it ends, and never while it still runs. When the run ends, what it acquires is released
  once it has been interrupted.
  - The next message does not wait for a release. The subscriptions and the commands of the next state do, so keep
    releases quick.
- **Logs do not pile up in a span.** What the run's fibers log is not kept by the span of whoever runs it, which Effect
  would keep until that span ends. That span is still the parent of the spans that commands and subscriptions open.
- **Nothing ends in silence.** A subscription that ends sends one last message, and a defect anywhere in the program
  ends the run. The run dies with it, as a `ProgramDefect` that says where it happened (see
  [running](./running.md#when-a-defect-happens)).
  - A listener of the `App` that throws, a `makeModel` that throws, and what a renderer gives `die` are defects too, in
    `'render'`.
  - A command or a subscription that the program interrupts is a defect too: one that interrupts itself (with
    `Effect.interrupt`, or by joining an interrupted fiber), or that another fiber of the program interrupts. Only the
    run, and whoever runs it, interrupt them.
- **A model is made only when it is read.** While a state is the current one, its model is made once, however many
  times it is read. So every read gives the very same model, and a bridge need not draw it again.
  - A model that throws is a defect in `'render'`, recorded where the model is read, once while its state is the
    current one.

## What is left to you

- **Whoever starts a program runs it.** Nothing checks that `run` runs, and a program that is never run reports no
  defect ([running](./running.md#rules)).
  - Leave a program unrun only where none of its effects is meant to run: on a server, to draw its first model.
  - Take `run` from what `start` gives, as `const { app, run } = start(program)`. A `run` that is never run is then a
    variable that is never used, which a linter can report. This helps, and checks nothing.
- **Commands run to their end, or to the end of the run.** No change of state stops one, and `update` decides whether
  its answer still applies (see [commands](./commands.md#rules)).
- **Nothing is bounded, and nothing times out.**
  - The run applies every message as it is sent, starts every command, and queues the effects of every state, however
    many wait. So the effects may lag behind the state without a bound, and when they start is unspecified: a step's
    commands may start after messages that came after it, and a subscription may start, and be stopped, for a key that
    is already gone. This follows from one message at a time, and from subscriptions that follow their keys (see
    [what you can rely on](#what-you-can-rely-on)).
  - A message that a listener of the `App` sends is applied right after the step that told it (see
    [what you can rely on](#what-you-can-rely-on)). So a listener that answers each new state with a message that
    makes another never lets the call return, and no defect says so. Only code that calls `app.subscribe` itself, as a
    bridge does, can loop so within one call.
  - The run waits for each release for as long as it takes, as it ends too (see
    [how the run ends](./running.md#how-the-run-ends)). One that never ends holds up the program, and the defects that
    the run would die with, and no defect says so.
- **The program runs on the stack of whoever sends the message.** `update`, `subscriptions`, the options and the
  listeners of the `App` run in the call that sends the message: a handler of the view, a command's fiber, or a
  subscription's. So does `makeModel`, where a renderer reads the model in that call, as the bridge to React may. A
  slow one holds up the event that sent the message, and nothing bounds it. An element that reports at each of its
  events, as a scroll does, runs a step at each, in its handler (see
  [what an element gives](./what-an-element-gives.md#advice)).
- **A subscription that sends faster than the screen refreshes holds the run back.** The bridge to snabbdom draws once
  for each task, or listener that the browser calls, that brings a new state, and React renders a store's new states
  the same way. So the run goes no faster than one draw a task. Let such a subscription send its messages by batches,
  as a `Stream` grouped within a time does (`Stream.groupedWithin`).
- **The model holds what `update` accepts, all of it but what it withholds on purpose, and no control that does
  nothing but what it holds on purpose.** The run does not check it. `dispatchViolations` checks it in tests (see
  [testing tools](./testing-tools.md)), and your renderer's tools check that the view draws what its model holds.
- **A view sends only what its model holds**, and never builds a message itself, as [model](./model.md#rules) says. The
  library does not enforce it.
- **The advice of [structuring a program](./structuring-a-program.md).** The library enforces none of it: the shape of
  the state, a view that draws and does not decide, a value that the user writes held by the program whose rules use
  it. What it does enforce is that a parent is given no child's state (see
  [composition](./composition.md#the-parents-own-pieces)).
- **Flags, and what `key` gives, made of values that `Equal` compares by value.** Other flags, or another value of
  `key`, start a child again. A function made anew in `flags` or `key` is other flags each time, since `Equal` compares
  a function by reference. Nothing says so: the child starts again, and loses its state (see
  [composition](./composition.md#when-a-child-is-there)).
  - An `Equal` and a `Hash` that your program writes, for a key, what `key` gives, an id or flags, keep Effect's rules:
    values that `Equal` finds equal have the same `Hash`, and both give the same answer each time. Nothing checks
    them. Where one breaks them, what the library does with that value is undefined: which subscriptions and children
    it keeps, and which dispatch it gives a child.
- **A state that starts a program elsewhere is one that the program made.** A child was last told what its parent's
  state gives in the states that the program makes from its first step on. A state saved under another `tell`, as one
  kept across a reload in development, and given back as `init: { state }`, keeps what each child was told then, until
  the value changes (see [composition](./composition.md#when-a-child-is-there)).
- **What must stay private is in a service, not in a key.** A key carries what its subscription needs (see
  [subscriptions](./subscriptions.md#rules)), and is shown whole: in a defect of its subscription, and in the `origin`
  that `onApplied` and `onIgnored` hear (see [running](./running.md)).
- **`update`, `external`, `makeModel`, `output` and `subscriptions` are pure, and no value is ever mutated.** So are
  an `init` that takes flags, the handlers of `onEvent`, and the functions that say which children are there, when
  they listen and what they are told: `there`, `key`, `flags`, `ids`, `listening` and `tell`. The library calls them
  when it chooses. No value that a program or a test gives the library, or that the library gives back, is mutated
  once it is made, nested objects included: a state, a message, a command, an event, flags, a key, a model, an
  output, and what a testing tool returns.
- **A function of the program never interrupts the fiber it runs in.** It runs where the library calls it: an `init`
  that takes flags, and the first `subscriptions`, in the call of `start`; the `init` of the children of a parent
  without flags in the call of `make`; `update`, `subscriptions` and the options where the message was sent;
  `makeModel` where the model is read. That may be the fiber of whoever starts the program, a command's, a
  subscription's, one that calls the dispatch, or no fiber at all. A function could reach that fiber
  (`Fiber.getCurrent`). One that interrupts the fiber of a command or of a subscription is a defect of that command or
  subscription, not of the function (see [what you can rely on](#what-you-can-rely-on)). The run cannot tell an
  interruption of another fiber from one by whoever runs the program, so no defect says that one happened.

## How the tests check them

The library's tests check each guarantee. [`src/interleaving.test.ts`][interleaving] checks most of them at once,
under random orders of clicks, texts typed into a controlled element, command answers, subscription messages and ends,
releases, defects, and interruptions by the program. What a screen then shows of a controlled element is the business
of the bridges, and their tests check it in a DOM (see [their tests](./writing-a-bridge.md#their-tests)).

[interleaving]: https://github.com/fgaudo/effect-tea/tree/main/src/interleaving.test.ts
