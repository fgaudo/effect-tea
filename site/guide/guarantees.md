---
title: Guarantees
---

# Guarantees

## In short

This page lists what the library promises about a running program, so that you know what your program can count on.
The library's tests check each guarantee. The second list is what the library leaves to you. It promises nothing:
where it says how the library behaves, it describes this version (see
[what a page promises](./index.md#what-a-page-promises)). What the screen shows beside the program's model is each
bridge's to promise (see [view](./view.md#rules)).

## What you can rely on

- **One message at a time, in the order they were sent.** A message is applied in the call that sends it. A message
  sent while another is being applied, as a renderer's listener sends one, is applied right after it.
  - The step of a message is its `update`, then `onApplied` or `onIgnored`, then the listeners of the `App`, once the
    new state is current.
  - What the step does in the world follows, in the order of the states: the subscriptions it stops and then those it
    starts, and the start of its commands. So the state is ahead of its effects: when a message has been applied, its
    commands may not have started yet.
  - What a dispatch sends is applied as it is sent.
  - A subscription's message is applied as it is emitted.
  - A command's answer is applied as the command ends, once its scope has closed.
- **Outdated clicks are harmless.** A message that `update` rejects is ignored: the state stays as it was.
  - This holds however many messages came in between.
- **A parent's children are those its own state lists.** The library keeps them, and gives the parent no child's state.
  - A child that a step of the parent lists anew is started, with its first commands.
  - A child that the parent's state no longer lists is dropped: its subscriptions stop, and a message for it is
    rejected.
  - Other flags, or another key, by `Equal`, start a child again, as another instance (see
    [composition](./composition.md#when-a-child-is-there)).
- **An answer reaches the instance that asked for it, or is rejected.** Each start of a child is an instance of its
  own, and the commands of an instance name it.
  - Where that instance is no longer there, its answer is rejected, even when the child, or a child at the same id, is
    there again.
  - The subscriptions of an instance are under keys of that instance, so a child started again starts its
    subscriptions again (see [what the library derives](./composition.md#what-the-library-derives)).
- **Subscriptions follow their keys.** A subscription starts when a new state brings its key. It is interrupted when a
  new state takes its key away.
  - Both happen once that state is current, and before any start of a later state. A later message may be applied
    first.
  - A subscription that ends stays ended while its key stays, until the key goes away and comes back.
  - When the key goes away, the subscription releases what it holds.
  - From the moment the key is gone, nothing the subscription sent reaches `update`, even before it has been stopped,
    and even if the same key comes back later.
- **Nothing outlives what acquired it.** Each command and each subscription has a scope of its own.
  - What one of them acquires is released when it ends.
  - When the run ends, what it acquires is released once it has been interrupted.
  - What it acquires is never released while it still runs.
  - The next message does not wait for a release. The subscriptions and the commands of the next state do, so keep
    releases quick.
- **Logs do not pile up in a span.** What the run's fibers log is not kept by the span of whoever runs it.
  - Effect keeps each log as an event of the current span until that span ends.
  - The span of whoever runs it is still the parent of the spans that commands and subscriptions open.
- **Nothing ends in silence.** A subscription that ends sends one last message.
  - A defect anywhere in the program ends the run. The run dies with it, as a `ProgramDefect` that says where it
    happened.
  - A program that was never run reports no defect until `run` runs, and `run` then dies of it
    ([running](./running.md#rules)).
  - A listener of the `App` that throws, a `makeModel` that throws, and what a renderer gives `die` are defects too, in
    `'render'`. Once the run has ended, `die` throws back what the run's cause does not hold
    ([running](./running.md#rules)).
  - A command or a subscription that the program interrupts is a defect too: one that interrupts itself (with
    `Effect.interrupt`, or by joining an interrupted fiber), or that another fiber of the program interrupts.
  - Only the run, and whoever runs it, interrupt them.
- **A model is made only when it is read.** While a state is the current one, its model is made once, however many
  times it is read. So every read gives the very same model, and a bridge need not draw it again.
  - A model that throws is a defect in `'render'`, recorded where the model is read, once while its state is the
    current one.
- **An input stores what is written, where its place is there.** A write is stored, in the form that its input
  declares, when its place is there, and rejected otherwise.
  - This holds whatever the value is, and whatever else the state says.
  - A value whose stored form is equal, by `Equal`, to the one the place holds leaves the very same state.
  - How a view writes into an input is in [inputs](./inputs.md). Which elements the package's bridges draw is in
    [what is left out](./writing-a-bridge.md#what-is-left-out).

## What is left to you

- **Whoever starts a program runs it.** Nothing checks that `run` runs. A program that is never run still applies its
  messages, and does nothing else: no command and no subscription starts, and no defect is reported. From a defect on,
  it applies no message, and nobody is told (see [running](./running.md#rules)).
  - Leave a program unrun only where none of its effects is meant to run: on a server, to draw its first model.
  - Take `run` from what `start` gives, as `const { app, run } = start(program)`. A `run` that is never run is then a
    variable that is never used, which a linter can report. This helps, and checks nothing.
- **Commands run to their end, or to the end of the run.** The end of the run interrupts the commands under way.
  - Until then, their answer goes where it is addressed, even if the state has moved on.
  - `update` decides whether the answer still applies (see [commands](./commands.md)). For a child, the library first
    rejects an answer for an instance that is no longer there (see [what you can rely on](#what-you-can-rely-on)).
- **Nothing is bounded, and nothing times out.**
  - The run applies every message as it is sent, and queues the effects of every state, however many wait. So the
    effects may lag behind the state without a bound: a step's commands may start after messages that came after it,
    and a subscription may start, and be stopped, for a key that is already gone.
  - It starts every command, however many run.
  - It waits for each release for as long as it takes. One that never ends holds up the program, and no defect says
    so. The subscriptions one message stops are released together.
  - As it ends, the run waits for every release before it dies. So a release that never ends also holds back the
    defects that the run would die with.
  - What is done does not pile up. While the run goes on, it lets go of what a finished step used: its message and
    what `onApplied` heard of it, the state it replaced and that state's model, a command that ended, a subscription
    that was stopped or that ended, what they acquired, a listener that was removed, and a child that the parent's
    state no longer lists, with its model and its dispatch. The JavaScript engine then frees them when it chooses. What waits
    is still kept, and so is what your program holds.
- **The program runs on the stack of whoever sends the message.** `update`, `subscriptions`, the options and the
  listeners of the `App` run in the call that sends the message: a handler of the view, a command's fiber, or a
  subscription's. So does `makeModel`, when a renderer reads the model in that call, as the bridge to React may (below).
  A slow one holds up the event that sent the message, and nothing bounds it.
  - The effects of the step, its subscriptions and the start of its commands, start once that call has returned. The
    first state's start as `run` is forked: with `Effect.runFork`, on the stack of that call. This is described, and not
    promised.
  - A write is applied as a message is. So an element that reports at each of its events, as a scroll does, runs a
    step at each, in its handler (see [what an element reports](./inputs.md#what-an-element-reports)). This is
    described, and not promised.
- **A renderer is told of every new state**, in the call that made it. One that draws later reads the latest model
  when it draws.
- **A subscription that sends faster than the screen refreshes holds the run back.** The bridge to snabbdom draws once
  for each task, or listener that the browser calls, that brings a new state, and React renders a store's new states
  the same way. So the run goes no faster than one draw a task. Let such a subscription send its messages by batches,
  as a `Stream` grouped within a time does (`Stream.groupedWithin`).
- **With the bridge to React, `makeModel` may run for each new state, in the call that sends its message.** React reads
  the model as it is told of the new state, to compare it with the model before. So a slow `makeModel` holds up the
  event that sent the message too. This is described, and not promised: it is how React behaves today, and React's
  documentation does not say it.
- **The model holds what `update` accepts, all of it but what it withholds on purpose.** The run does not check it.
  - `dispatchViolations` checks it, in tests, on the messages a test reads from the model (see
    [testing tools](./testing-tools.md)).
  - That the view draws what its model holds is checked with your renderer's tools.
- **A view sends only what its model holds.** It writes only into the inputs its model shows, and never builds a
  message itself. The library does not enforce this (see [model](./model.md#precisely)).
- **What the screen shows beside the program's model.** The guarantees are of the program. Each bridge says what it
  draws beside the model. The bridge to snabbdom draws the model and nothing else: what it shows of a controlled
  element is the value its model gave it. With the bridge to React, the application's components may keep state of
  their own (see [view](./view.md#rules)).
- **With the bridge to React, the run lives as long as the effect that starts it.** That is the effect of `Host`.
  `Host` starts the program as it first renders, and starts its run after its effect. It takes the `program`, the
  `options` and the `fork` of that first render, and reads no later ones, also when it starts the program again. A new
  `key` mounts another `Host`, which takes those of its own first render.
  - React ends the effect, and `Host` interrupts the run, when it unmounts `Host`, and when `<Activity>` hides it. The
    next effect starts the program again from `init`. So do a new `key` and a remount. The first run may have started
    the commands of `init` before it is interrupted.
  - `Host` starts the run in a microtask after its effect. StrictMode runs every effect twice in development, with a
    cleanup between them. It runs them in one task, so the first effect starts nothing, and one program runs, once: the
    commands of `init` start once. This is described, and not promised: it is how React behaves today, which the
    bridge's tests check.
  - For a state that outlives a component, start the program yourself, and draw it with `Draw` (see
    [the package's bridges](./writing-a-bridge.md#the-packages-bridges)).
- **With the bridge to React, `Host` and `Draw` draw the first model on a server.** On a server, no effect runs: `Host`
  starts the program and draws its first model, and nothing of `init` starts. Nothing is promised of hydration.
- **With the bridge to React, a run that dies is thrown to the nearest error boundary.** `Host` throws it as it
  renders, while its effect runs. One that `Host` has not thrown when the effect ends, as `Host` unmounts or
  `<Activity>` hides it, or that ends after, is given to `reportError` instead, and is not thrown again. Where the
  platform has no `reportError`, as React Native, the bridge reports it as React reports an error itself: this is
  described, not promised. A `makeModel` that throws is thrown this way too, once: until the run has ended, `Host`
  draws the model it drew last. A first model that throws reaches the boundary as `Host` first renders, and the run
  never starts. What is thrown is `Cause.squash` of what the run ended with, which keeps one defect. To see the whole
  cause, wrap the run in the `fork` that you give `Host`: what the `fork` handles is not thrown or reported again.
- **The rules of [structuring a program](./structuring-a-program.md).** The library does not enforce them: the shape
  of the state, a view that draws and never decides, a value that the user writes held by the program whose rules use
  it. The one it enforces is that a parent never reads a child's state: a parent is given none.
- **A `set` changes its place, and nothing else.** An input's place given as `get` and `set` has a `set` that puts the
  value it is given where `get` reads it, exactly as it is given. The library does not check it (see
  [inputs](./inputs.md#rules)).
- **Flags and keys made of values that `Equal` compares by value.** Other flags, or another key, start a child again.
  A function made anew in `flags` or `key` is other flags each time, since `Equal` compares a function by reference.
  Nothing says so: the child starts again, and loses its state (see
  [composition](./composition.md#children-by-id)).
- **Whatever a subscription depends on is in its key.** A new value left out of the key is not used while the key is
  kept (see [subscriptions](./subscriptions.md)).
- **`update`, `external`, `makeModel`, `output` and `subscriptions` are pure, and states are never mutated.** So are
  an `init` that takes flags, the handlers of `onEvent`, the `get`, the `set` and the `store` of an input and an `at`
  that is a function of the id, and the functions that say which children are there and when they listen: `there`,
  `key`, `flags`, `ids` and `listening`. The library calls them when it chooses. A child's `external`, its `init` when
  a step of its parent starts it, its parent's handlers of `onEvent`, and the `get`, the `set` and the `store` of a
  write run in the parent's `update`. The library reuses a child's model, and its subscriptions, while the child's state is the same
  object.
- **A function of the program never interrupts the fiber it runs in.** An `init` that takes flags, and `subscriptions`
  on the first state, run in the call of `start`: in the fiber of whoever starts the program, or in no fiber at all. The
  children of a parent without flags are started in the call of `make`, their `init` with them (see
  [composition](./composition.md#precisely)). `update`,
  `subscriptions` and the options run where the message was sent: in a command's fiber, a subscription's, a fiber that
  calls the dispatch, or in no fiber at all. `makeModel` runs where the model is read. A function could reach that fiber
  (`Fiber.getCurrent`). One that interrupts the fiber of a command or of a subscription is a defect of that command or
  subscription, not of the function. The run cannot tell an interruption of another fiber from one by whoever runs the
  program, so no defect says that one happened.

## How the tests check them

The library's tests check each guarantee.

The run keeps the guarantee of the order with one synchronous step, and a queue of the messages sent during it. The
tests of the run check it.

[`src/interleaving.test.ts`][interleaving] checks it too, with most of the others. It runs them under random orders of
clicks, writes into an input (current and stale), command answers, subscription messages and ends, releases, defects,
and interruptions by the program. It checks:

- that messages are applied one at a time, each when the call that sends it returns, and that a message a listener
  sends is the next one applied;
- that outdated clicks leave the state as it was;
- that an answer reaches the row that asked for it, or is rejected, when the row has been removed and added again;
- that subscriptions follow their keys;
- that what a subscription or a command acquires does not outlive it, and that the subscriptions a state
  stops are released before any start of that state or a later one;
- that what the run logs is not kept by the span of whoever runs it, and that this span stays the parent of the spans
  opened in it;
- that nothing ends in silence;
- that a model is made only when it is read, once for each state that is read, and that a model read after a notice
  is of the latest state;
- that what is written into an input is stored exactly when its place is there, whatever it is (see
  [inputs](./inputs.md)).

It also checks that the run dies with each defect, and that from the first one on it applies no message (see
[running](./running.md)). It checks that the defects come in the order they happened. That order is how the run is
made today, and not a promise.

What a screen then shows of an input is the business of the bridges, and their tests check it in a DOM (see
[their tests](./writing-a-bridge.md#their-tests)).

[interleaving]: https://github.com/fgaudo/effect-tea/tree/main/src/interleaving.test.ts
