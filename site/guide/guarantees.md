---
title: Guarantees
---

# Guarantees

## In short

This page lists what the library promises about a running program, so that you know what your program can count on.
The library's tests check each guarantee. The second list is what the library leaves to you. What the screen shows
beside the program's model is each bridge's to promise (see [view](./view.md#rules)).

## What you can rely on

- **One message at a time, in the order they were sent.** A message is applied in the call that sends it. A message
  sent while another is being applied, as a renderer's listener sends one, is applied right after it.
  - The step of a message is its `update`, then `onApplied` or `onIgnored`, then the listeners of the `App`, once the
    new state is current.
  - What the step does in the world follows in the run's own fiber, in the order of the states: the subscriptions it
    stops and then those it starts, and the start of its commands. So the state is ahead of its effects: when a message
    has been applied, its commands may not have started yet.
  - What a dispatch sends is applied as it is sent.
  - A subscription's message is applied as it is emitted, in the subscription's fiber.
  - A command's answer is applied as the command ends, in the command's fiber, once its scope has closed.
- **Outdated clicks are harmless.** A message that `update` rejects is ignored: the state stays as it was.
  - This holds however many messages came in between.
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
  - The subscriptions one message stops are released together.
  - The next message does not wait for a release. The subscriptions and the commands of the next state do, so keep
    releases quick.
- **Logs do not pile up in a span.** What the run's fibers log is not kept by the span of whoever runs it.
  - Effect keeps each log as an event of the current span until that span ends.
  - The span of whoever runs it is still the parent of the spans that commands and subscriptions open.
- **Nothing ends in silence.** A subscription that ends sends one last message.
  - A defect anywhere in the program ends the run. The run dies with it, as a `ProgramDefect` that says where it
    happened.
  - A listener of the `App` that throws, a `makeModel` that throws, and what a renderer gives `die` are defects too, in
    `'render'`. Once the run has ended, `die` throws back what the run's cause does not hold
    ([running](./running.md#rules)).
  - A command or a subscription that the program interrupts is a defect too: one that interrupts itself (with
    `Effect.interrupt`, or by joining an interrupted fiber), or that another fiber of the program interrupts.
  - Only the run, and whoever runs it, interrupt them.
- **A model is made only when it is read.** It is made once for each state, by the state's identity. So the very same
  state has the very same model, and a bridge need not draw it again.
  - A model that throws is a defect in `'render'`, recorded where the model is read, once for each state.
- **An input stores what is written, where its place is there.** A write is stored when its place is there, and
  rejected otherwise.
  - This holds whatever the value is, and whatever else the state says.
  - A value equal, by `Equal`, to the one the place holds leaves the very same state.
  - How a view writes into an input is in [inputs the user types into](./inputs-the-user-types-into.md). Which
    elements the package's bridges draw is in [what is left out](./writing-a-bridge.md#what-is-left-out).

## What is left to you

- **Commands run to their end, or to the end of the run.** The end of the run interrupts the commands under way.
  - Until then, their answer goes where it is addressed, even if the state has moved on.
  - `update` decides whether the answer still applies. See [commands](./commands.md), and ids that come back in
    [children by id](./composition.md#children-by-id).
- **Nothing is bounded, and nothing times out.**
  - The run applies every message as it is sent, and queues the effects of every state, however many wait. So the
    effects may lag behind the state without a bound: a step's commands may start after messages that came after it,
    and a subscription may start, and be stopped, for a key that is already gone.
  - It starts every command, however many run.
  - It waits for each release for as long as it takes. One that never ends holds up the program, and no defect says
    so.
  - As it ends, the run waits for every release before it dies. So a release that never ends also holds back the
    defects that the run would die with.
- **The program runs on the stack of whoever sends the message.** `update`, `subscriptions`, the options and the
  listeners of the `App` run in the call that sends the message: a handler of the view, a command's fiber, or a
  subscription's. So does `makeModel`, when a renderer reads the model in that call, as the bridge to snabbdom does for
  what a handler of the view sends. A slow one holds up the event that sent the message, and nothing bounds it.
  - The effects of the step, its subscriptions and the start of its commands, start once that call has returned. The
    first state's start as `run` is forked: with `Effect.runFork`, on the stack of that call. This is described, and not
    promised.
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
  draws beside the model: the bridge to snabbdom keeps no state beside the program's state, except the value a model
  gave each controlled element, and with the bridge to React the application's components may keep state of their own
  (see [view](./view.md#rules)).
- **With the bridge to React, the run lives as long as the effect that starts it.** That is the effect of `Host`.
  `Host` starts the program as it first renders, and starts its run after its effect.
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
  renders, while it is mounted. Once `Host` has unmounted, it is given to `reportError` instead. A `makeModel` that
  throws is thrown this way too, once: until the run has ended, `Host` draws the model it drew last. A first model that
  throws reaches the boundary as `Host` first renders, and the run never starts. What is thrown is
  `Cause.squash` of what the run ended with, which keeps one defect. To see the whole cause, wrap the run in the `fork`
  that you give `Host`: what the `fork` handles is not thrown or reported again.
- **The rules of [structuring a program](./structuring-a-program.md).** The library does not enforce them: the shape
  of the state, a view that draws and never decides, a parent that never reads a child's state to decide.
- **Whatever a subscription depends on is in its key.** A new value left out of the key is not used while the key is
  kept (see [subscriptions](./subscriptions.md)).
- **`update`, `external`, `makeModel` and `subscriptions` are pure, and states are never mutated.** A child's
  `external` runs in its parent's `update`. The library reuses a child's model, and its subscriptions, while the
  child's state is the same object.
- **A function of the program never interrupts the fiber it runs in.** `init`, and `subscriptions` on the first state,
  run in the call of `start`: in the fiber of whoever starts the program, or in no fiber at all. `update`,
  `subscriptions` and the options run where the message was sent: in a command's fiber, a subscription's, a fiber that
  calls the dispatch, or in no fiber at all. `makeModel` runs where the model is read. A function could reach that fiber
  (`Fiber.getCurrent`). One that interrupts the fiber of a command or of a subscription is a defect of that command or
  subscription, not of the function. The run cannot tell an interruption of another fiber from one by whoever runs the
  program, so no defect says that one happened.

## How the tests check them

The library's tests check each guarantee.

The run keeps the guarantee of the order with one synchronous step, and a queue of the messages sent during it. The
tests of the run check it.

[`src/interleaving.test.ts`][interleaving] checks it too, with the other seven. It runs them under random orders of
clicks, writes into an input (current and stale), command answers, subscription messages and ends, releases, defects,
and interruptions by the program. It checks:

- that messages are applied one at a time, each when the call that sends it returns, and that a message a listener
  sends is the next one applied;
- that outdated clicks leave the state as it was;
- that subscriptions follow their keys;
- that what a subscription or a command acquires does not outlive it, and that the subscriptions a state
  stops are released before any start of that state or a later one;
- that what the run logs is not kept by the span of whoever runs it, and that this span stays the parent of the spans
  opened in it;
- that nothing ends in silence;
- that a model is made only when it is read, once for each state, and that a model read after a notice is of the
  latest state;
- that what is written into an input is stored exactly when its place is there, whatever it is (see
  [inputs the user types into](./inputs-the-user-types-into.md)).

It also checks that the run dies with each defect, and that from the first one on it applies no message (see
[running](./running.md)). It checks that the defects come in the order they happened. That order is how the run is
made today, and not a promise.

What a screen then shows of an input is the business of the bridges, and their tests check it in a DOM (see
[their tests](./writing-a-bridge.md#their-tests)).

[interleaving]: https://github.com/fgaudo/effect-tea/tree/main/src/interleaving.test.ts
