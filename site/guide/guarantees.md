---
title: Guarantees
---

# Guarantees

What you can rely on:

- **One message at a time, in the order they were queued.** The run takes the next message only once the step
  of the one before is over: its `update`, then `onApplied` or `onIgnored`, its frame, the subscriptions it
  stops and starts, and the start of its commands. What a dispatch sends is queued as it is sent, a subscription's
  message as it is emitted, and a command's answer as the command ends.
- **Outdated clicks are harmless.** A message `update` rejects is ignored: the state stays as it was, however
  many messages came in between.
- **Subscriptions follow their keys.** A subscription starts when a new state brings its key, and is interrupted
  when a new state takes it away: both once that state is published for the renderer, before the run takes the
  next message. One that ends stays ended while its key stays, until the key goes away and comes back. When the
  key goes away, the subscription releases what it holds, and nothing it sent reaches `update` afterwards, even
  if the same key comes back later.
- **Nothing outlives what acquired it.** Each command, each subscription and the renderer has a scope of its
  own. What it acquires is released when it ends or, when the run ends, once it has been interrupted, never
  while it still runs. The subscriptions one message stops are released together, and the next message waits
  for the slowest release, so keep them quick.
- **Logs do not pile up in a span.** What the run's fibers log is not kept by the span of whoever runs it
  (Effect keeps each log as an event of the current span until the span ends). That span is still the parent
  of the spans that commands and subscriptions open.
- **Nothing ends in silence.** A subscription that ends sends one last message. A defect anywhere ends the
  run, which dies with it, as a `ProgramDefect` that says where it happened. A command, a subscription, the
  renderer or an option that interrupts itself (with `Effect.interrupt`, or by joining an interrupted fiber) is
  a defect too: only the run, and whoever runs it, interrupt them.
- **Frames cost only what is drawn.** A message that returns the very same state draws no new frame, and a
  model is made only for the frames the renderer pulls.
- **An input stores what is written over the value it holds.** A write is stored when its place holds, by
  `Equal`, the value it was written over, whatever it is and whatever else the state says, and rejected otherwise.
  For the element that shows an input, `drawn` keeps the element as it is while the frame is the element's own past
  or present, and gives it the frame's value once the state has moved on without it: what that makes of a screen,
  and for which elements and renderers, is in [inputs the user types into](./inputs-the-user-types-into.md).
- **A frame says what it has seen.** Each message a dispatch sends is numbered, from 1, in the order the run takes
  it, and a frame's `seen` is how many of them the run had taken when the frame's state was made, rejected ones
  included, and no message of a command or a subscription. A message that makes no new state draws no frame, so
  the last frame may have seen fewer than were dispatched: never wait for it to see them all.

What is left to you:

- **Commands run to their end, or to the end of the run**, which interrupts those under way. Until then their
  answer goes where it is addressed, even if the state has moved on. `update` decides whether it still applies
  (see [commands](./commands.md), and ids that come back in [children by id](./composition.md#children-by-id)).
- **Nothing is bounded, and nothing times out.** The run queues every message as it is sent, however many wait,
  and starts every command, however many run. It waits for `onApplied`, for `onIgnored` and for each release for
  as long as they take: one that never ends holds the program, and no defect says so. As it ends, the run waits
  for every release before it dies, so one that never ends holds the defects the run would die with too.
- **A slow renderer skips frames**: it gets only the latest one.
- **The model holds what `update` accepts, all of it but what it withholds on purpose.** The run does not check
  it: `dispatchViolations` does, in tests, on the messages a test reads from the model (see
  [testing](./testing.md)). That the view draws what its model holds is checked with your renderer's tools.
- **`update`, `makeModel` and `subscriptions` are pure, and states are never mutated.** The library reuses a
  child's model, and its subscriptions, while its state is the same object.

The library's tests check each guarantee. That of the order is the run's one loop over one queue, checked by the tests
of the run. [`src/interleaving.test.ts`](https://github.com/fgaudo/effect-tea/tree/main/src/interleaving.test.ts) checks
the other eight under random orders of clicks, writes into an input, current and stale, command answers, subscription
messages and ends, releases, defects and self-interruptions: that outdated clicks leave the state as it was, that
subscriptions follow their keys, that what a subscription, a command or the renderer acquires does not outlive it and
the next message waits for the slowest release, that what the run logs is not kept by the span of whoever runs it, which
stays the parent of the spans opened in it, that nothing ends in silence, that a model is made only for the frames
pulled and the very same state draws no new frame, that what is written into an input is stored exactly when it was
written over the value its place holds (see [inputs the user types into](./inputs-the-user-types-into.md)), and that a
frame has seen the dispatched messages taken before its state was made, and none after. It checks too that the run dies
with each defect, in the order it happened as the run is made today, and from the first one on applies no message (see
[running](./running.md)). What `drawn` makes of an element is checked by the tests of the rule itself, as data; what a
screen then shows is the bridges', checked in a DOM (see [inputs the user types into](./inputs-the-user-types-into.md)).
