---
title: Guarantees
---

# Guarantees

## In short

This page lists what the library promises about a running program, so that you know what your program can count on.
The library's tests check each guarantee. The second list is what the library leaves to you.

## What you can rely on

- **One message at a time, in the order they were queued.** The run takes the next message only once the step of the
  one before is over.
  - The step of a message is its `update`, then `onApplied` or `onIgnored`, its frame, the subscriptions it stops and
    starts, and the start of its commands.
  - What a dispatch sends is queued as it is sent.
  - A subscription's message is queued as it is emitted.
  - A command's answer is queued as the command ends.
- **Outdated clicks are harmless.** A message that `update` rejects is ignored: the state stays as it was.
  - This holds however many messages came in between.
- **Subscriptions follow their keys.** A subscription starts when a new state brings its key. It is interrupted when a
  new state takes its key away.
  - Both happen once that state is published for the renderer, and before the run takes the next message.
  - A subscription that ends stays ended while its key stays, until the key goes away and comes back.
  - When the key goes away, the subscription releases what it holds.
  - After that, nothing it sent reaches `update`, even if the same key comes back later.
- **Nothing outlives what acquired it.** Each command, each subscription and the renderer has a scope of its own.
  - What one of them acquires is released when it ends.
  - When the run ends, what it acquires is released once it has been interrupted.
  - What it acquires is never released while it still runs.
  - The subscriptions one message stops are released together.
  - The next message waits for the slowest release, so keep releases quick.
- **Logs do not pile up in a span.** What the run's fibers log is not kept by the span of whoever runs it.
  - Effect keeps each log as an event of the current span until that span ends.
  - The span of whoever runs it is still the parent of the spans that commands and subscriptions open.
- **Nothing ends in silence.** A subscription that ends sends one last message.
  - A defect anywhere ends the run. The run dies with it, as a `ProgramDefect` that says where it happened.
  - A command, a subscription or the renderer that the program interrupts is a defect too: one that interrupts itself
    (with `Effect.interrupt`, or by joining an interrupted fiber), or that another fiber of the program interrupts.
  - Only the run, and whoever runs it, interrupt them.
- **Frames cost only what is drawn.** A message that returns the very same state draws no new frame. A model is made
  only for the frames the renderer pulls.
- **An input stores what is written over the value it holds.** A write is stored when its place holds the value it was
  written over, and rejected otherwise.
  - The two values are compared by `Equal`.
  - This holds whatever the value is, and whatever else the state says.
  - For the element that shows an input, `drawn` keeps the element as it is while the frame is the element's own past
    or present.
  - Once the state has moved on without it, `drawn` gives the element the frame's value.
  - What that makes of a screen, and for which elements and renderers, is in
    [inputs the user types into](./inputs-the-user-types-into.md).
- **A frame says what it has seen.** A frame's `seen` is how many dispatched messages the run had taken when the
  frame's state was made.
  - Each message a dispatch sends is numbered, from 1, in the order the run takes it.
  - `seen` includes rejected ones.
  - `seen` counts no message of a command or a subscription.
  - A message that makes no new state draws no frame. So the last frame may have seen fewer messages than were
    dispatched: never wait for it to see them all.

## What is left to you

- **Commands run to their end, or to the end of the run.** The end of the run interrupts the commands under way.
  - Until then, their answer goes where it is addressed, even if the state has moved on.
  - `update` decides whether the answer still applies. See [commands](./commands.md), and ids that come back in
    [children by id](./composition.md#children-by-id).
- **Nothing is bounded, and nothing times out.**
  - The run queues every message as it is sent, however many wait.
  - It starts every command, however many run.
  - It waits for each release for as long as it takes. One that never ends holds up the program, and no defect says
    so.
  - As it ends, the run waits for every release before it dies. So a release that never ends also holds back the
    defects that the run would die with.
- **A slow renderer skips frames.** It gets only the latest one.
- **The model holds what `update` accepts, all of it but what it withholds on purpose.** The run does not check it.
  - `dispatchViolations` checks it, in tests, on the messages a test reads from the model (see
    [testing tools](./testing-tools.md)).
  - That the view draws what its model holds is checked with your renderer's tools.
- **A view sends only what its model holds.** It writes only over the values its model holds, and never builds a
  message itself. The library does not enforce this (see [model](./model.md#precisely)).
- **The renderer keeps no state beside the program's state**, except what a bridge keeps of the element of an input
  (see [view](./view.md#rules)).
- **The rules of [structuring a program](./structuring-a-program.md).** The library does not enforce them: the shape
  of the state, a view that draws and never decides, a parent that never reads a child's state to decide.
- **Whatever a subscription depends on is in its key.** A new value left out of the key is not used while the key is
  kept (see [subscriptions](./subscriptions.md)).
- **`update`, `makeModel` and `subscriptions` are pure, and states are never mutated.** The library reuses a child's
  model, and its subscriptions, while the child's state is the same object.
- **A function of the program never interrupts the fiber it runs in.** `init`, `update`, `makeModel`, `subscriptions`
  and the options run in a fiber of the run, or of whoever runs it, which they could reach (`Fiber.getCurrent`). The
  run cannot tell that interruption from one by whoever runs the program, so no defect says it happened.

## How the tests check them

The library's tests check each guarantee.

The run keeps the guarantee of the order with one loop over one queue. The tests of the run check it.

[`src/interleaving.test.ts`][interleaving] checks the other eight. It runs them under random orders of clicks, writes
into an input (current and stale), command answers, subscription messages and ends, releases, defects, and
interruptions by the program. It checks:

- that outdated clicks leave the state as it was;
- that subscriptions follow their keys;
- that what a subscription, a command or the renderer acquires does not outlive it, and that the next message waits
  for the slowest release;
- that what the run logs is not kept by the span of whoever runs it, and that this span stays the parent of the spans
  opened in it;
- that nothing ends in silence;
- that a model is made only for the frames pulled, and that the very same state draws no new frame;
- that what is written into an input is stored exactly when it was written over the value its place holds (see
  [inputs the user types into](./inputs-the-user-types-into.md));
- that a frame has seen the dispatched messages taken before its state was made, and none after.

It also checks that the run dies with each defect, and that from the first one on it applies no message (see
[running](./running.md)). It checks that the defects come in the order they happened. That order is how the run is
made today, and not a promise.

What `drawn` makes of an element is checked by the tests of the rule itself, as data. What a screen then shows is the
business of the bridges, and their tests check it in a DOM (see
[inputs the user types into](./inputs-the-user-types-into.md)).

[interleaving]: https://github.com/fgaudo/effect-tea/tree/main/src/interleaving.test.ts
