---
title: Running
---

# Running

## In short

This page shows how you start a program, what your renderer reads, and what to do when the run dies.

`start(program, options?)` starts the program by plain code, and gives two things. `app` is the handle a renderer
reads: the model of the current state, a notice of each new state, and the dispatch. `run` is the effect that runs the
program's effects. Whoever starts the program forks `run`, and ends the run by interrupting it:

```ts
const { app, run } = start(counter)
drawInto(root, { app, view })
Effect.runFork(run)
```

A message is applied in the call that sends it. Its commands and its subscriptions follow, in the run. A defect
anywhere ends the run too. The run dies, and reporting the crash is the job of the app around the run. Until `run`
runs, no effect of the program runs, and no defect is reported.

## An example

The list (`examples/list/main.ts`) starts its program in a browser, and reports the crash of its run. `Effect.runFork`
reports nothing itself. An interruption of the fiber it returns, on `pagehide` for example, ends the run too, and is no
crash:

{@includeCode ../../examples/list/main.ts#run}

## Rules

**A program is started, then run.** `start` makes the first state, and runs no effect. `run` starts the subscriptions
and the commands of each state, in the order of the states. It never succeeds: it runs until it is interrupted, or
until a defect ends it.

- A message sent before `run` is applied all the same. Its effects wait for `run`.
- A program that is never run is never stopped. Its state can still change, and no effect follows. It reports no
  defect: from a defect on, it applies no message, and `run` dies of the defect once it runs. Only `model()` throws a
  defect of `makeModel` or of `init`, to whoever reads the model. Nothing checks that a program started is run (see
  [guarantees](./guarantees.md#what-is-left-to-you)).

**The renderer gets an `App`**, `{ model, subscribe, dispatch, die }`: the model of the current state, made when it is
read; a notice of each new state, in the call that made it; the dispatch; and `die`, which takes what a renderer threw
as it drew outside a listener. The dispatch is the very same function for the whole run, so a view
[memoized](./glossary.md#what-the-user-sees) on it is not drawn again because of it. How a renderer reads them is in
[writing a bridge](./writing-a-bridge.md).

**A renderer reads the model when it draws.** A listener is told in the call that made the new state. So a renderer
that waits for a microtask before it reads the model draws once the new states that a task, or a listener that the
browser calls, made, as the bridge to snabbdom does.

**A program starts elsewhere from another first step**: `{ ...program, init: { state } }`, with the step's commands,
if any. The state is one that this program made, as one that `onApplied` saved in a run of it (see
[what is left to you](./guarantees.md#what-is-left-to-you)). A test gives such a program to `drive` and `rehearse`
the same way, and plays a session recorded with `onApplied` again with `applyAll`.

**What is done does not pile up.** While the run goes on, it lets go of what a finished step used: its message and
what `onApplied` heard of it, the state it replaced and that state's model, a command or a subscription that ended or
was stopped, what they acquired, a listener that was removed, and a child that the parent's state no longer lists. The
JavaScript engine then frees them when it chooses. What waits is still kept, and so is what your program holds.

### Options

- **`flags`**: what the program starts from, for example the product a notification opened the app for. `flags` is
  required exactly when the program has flags.
- **`onApplied`** hears every message that `update` accepts: where it came from (`origin`: a dispatch, a command, or
  a subscription with its key), the state before and after it, and its commands. It is for devtools, or to record a
  session.
- **`onIgnored`** hears every message that `update` rejects, with where it came from and the state it did not apply in.
  It only watches: the message stays ignored. It is for devtools, or to count the taps that did nothing.

**The run calls `onApplied` and `onIgnored` as it calls `update`.** They are functions, not effects, and return
nothing. The run calls them in the step of each message, before the next one, before the listeners of the `App` are
told, and before the message's commands start. So they hear every message in order, and a slow one holds up the whole
program, and the call that sent the message. A defect in one of them ends the run.

### When a defect happens

A defect anywhere in the program ends the run, which dies with a `ProgramDefect`. Its `cause` is the defect itself: an
`InvariantDefect` for one thrown with `defect`. Its `where` says where it happened, which only the run knows
(`DefectSite` lists each place), and `on` names the message of a defect in `update` by its tags, never its data. A
command or a subscription dies when its effect ends with a defect, or when what its scope releases dies, once the
scope has released all it holds.

From the defect on, the run applies no message, and every defect of the program is in the cause, each with where it
happened.

**The run never recovers from a defect, and does not log it.** Reporting the defect, and choosing what the user sees
next, are the job of the app around the run. The screen keeps what was drawn last: show a crash screen, or run the
program again.

**The app around the run chooses what leaves the device.** The `cause` is whatever was thrown. The `key` of a
`ProgramDefect` and the `id` of a `CompositionDefect` are the program's own values, as they are, and may hold data.

### What the run still does after a defect

A defect of `update`, `onApplied`, `onIgnored` or `subscriptions` stops its step before the new state is the current
one: the state stays as it was, and no listener is told of the new one. A message that the run does not apply starts
no command and no subscription, and `onApplied` does not hear it. So the run still does, at most, the step under way:

- A message for which the run called `update` before the defect may still start its commands and the subscriptions of
  its new keys, until the end stops the run. So `onApplied` may have heard a step whose model is never drawn and whose
  commands never start.
- That bound is nothing `update` can count on: for `update`, a command that died is a command that has not answered
  yet. What a command or a subscription does once it has started is the program's business, until the run interrupts
  it.
- A renderer is no part of the run, and the run does not stop it. A model that the renderer reads after the defect is
  still made, since `makeModel` is pure.

### How the run ends

When the run ends, because of a defect or of an interruption, it first stops applying messages: what is sent
meanwhile is not applied. Then it stops its commands and its subscriptions, and waits until what they acquired is
released. What the effects of a step had not started yet is not started. The rest of the order is unspecified. The end
never begins inside a step: when a step meets a defect, the end begins once the call that applied it has told the
listeners.

A renderer is not stopped by the run: whoever started the program stops it, with what its bridge returns. A renderer
that nothing stops still draws nothing new, since no state is made after the end.

**Plain code stops a run, and waits for it,** with Effect's `Fiber.interrupt`, which ends once the run has ended: its
commands and its subscriptions are stopped, and what they acquired is released.

```ts
const fiber = Effect.runFork(run)
const stop = (): Promise<void> => {
  stopDrawing()
  return Effect.runPromise(Fiber.interrupt(fiber))
}
```

### The defects in the cause

A defect met while the run ends joins the cause. The order of the defects in the cause is unspecified: rely on each
defect being in the cause, not on its place. Whether two releases of one scope that die of defects equal by `Equal` are
two defects is unspecified too, and so is whether a command or a subscription that interrupts itself while the run
stops it dies of a defect.

## Advice

**Give slow work to a queue.** A devtools that sends each step away is slow work, which would hold up each step in
`onApplied`. The option offers what it hears to an unbounded queue, with `Queue.offerUnsafe`, which takes it at once.
A fiber raced with the run takes each item, and does the work. That fiber is also where to log what the options hear,
since the run writes no log of its own and an option runs no effect: choose there what a line holds, since a message
may hold data. The fiber ends with the run, and a defect in it ends the run. What is still in the queue when the run
ends is not reported, which a devtools can afford, and a record that must be whole cannot.

```ts
const main = Effect.gen(function*() {
  const heard = yield* Queue.unbounded<Applied<State, Message, Command>>()
  const report = Queue.take(heard).pipe(Effect.flatMap(sendToDevtools), Effect.forever)
  const { app, run } = start(program, {
    onApplied: (applied) => {
      Queue.offerUnsafe(heard, applied)
    }
  })
  drawInto(root, { app, view })
  yield* Effect.raceFirst(run, report)
})
```

**Work that must wait goes to the effects of the program.** An option cannot hold up the run to wait for something.
What must wait, such as a command that may start only once its state is saved, is a command or a subscription that
waits: wrap `runCommand` or a subscription, and leave the options to watch.
