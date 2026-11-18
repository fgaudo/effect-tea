---
title: Running
---

# Running

## In short

This page shows how you start a program, what the run gives your renderer, and what to do when the run dies.

`run(program, render, options?)` starts the program and hands `render` a stream of frames. A renderer slower than the
program only gets the latest frame. The run ends when the renderer ends. A defect anywhere ends the run too. The run
dies, and reporting the crash is the job of the app around the run.

## Rules

**Only a program without events runs.** There is no parent to handle the events.

**A frame's `dispatch` is the very same function in every frame.** So a view memoized on its dispatch is not drawn
again because of the dispatch.

**A slow renderer skips frames.** It only gets the latest frame. So a renderer that waits for the next animation frame
before it takes another frame draws at most once per screen refresh, as
[`examples/bridges/snabbdom.ts`](../../examples/bridges/snabbdom.ts) does.

### Options

- **`flags`**: what the program starts from, for example the product a notification opened the app for. `flags` is
  required exactly when the program has flags.
- **`describeMessage`**, **`describeCommand`**: how messages and commands appear in the logs. By default, only their
  tags appear, never their data: `Home › Products › Deleted`. The run calls these two functions only while debug logs
  are enabled (`References.MinimumLogLevel`), so they cost nothing otherwise. How a string and a parent's wrapping
  appear is under [Precisely](#precisely).
- **`onApplied`**: hears every accepted message, for devtools or session recording. For each message, `onApplied`
  hears:
  - where the message came from (`origin`: a dispatch, a command, or a subscription with its key);
  - the state before the message and the state after it;
  - the `revision` of the state after the message;
  - the commands decided for the message.

  The first state is revision 0, and each new state is the next revision. When `update` returns the very state it was
  given, the same object, the message leaves the revision as it was.
- **`onIgnored`**: hears every message that `update` rejected, with where the message came from and the state it did
  not apply in. `onIgnored` only watches: the message stays ignored. Use `onIgnored` for devtools, or to count the taps
  that did nothing.

**The run waits for `onApplied` and `onIgnored`.** The run takes the next message only after them, so that they hear
every message in order. The run also waits for `onApplied` before the message's frame and before its commands. So a
slow `onApplied` or `onIgnored` holds up the whole program. A defect in one of them ends the run, as any other defect
does.

**Give slow work to a queue.** An `onApplied` or an `onIgnored` with slow work to do, such as a devtools that sends
each step away, gives that work to a queue:

1. The option offers what it hears to an unbounded queue, which takes it at once.
2. A fiber of whoever runs the program takes each item from the queue.

That fiber is raced with the run. So the fiber ends with the run, and a defect in the fiber ends the run. What is still
in the queue when the run ends is not reported.

```ts
const app = Effect.gen(function*() {
  const heard = yield* Queue.unbounded<Applied<State, Message, Command>>()
  const report = Queue.take(heard).pipe(Effect.flatMap(sendToDevtools), Effect.forever)
  const running = run(program, render, { onApplied: (applied) => Effect.asVoid(Queue.offer(heard, applied)) })
  yield* Effect.raceFirst(running, report)
})
```

### Logs

The run logs only at the debug level. It logs:

- each message;
- a rejected message;
- subscriptions starting, stopping and ending.

Effect's default minimum level, `Info`, hides all these logs. The debug logs of subscriptions show their keys. A key
may hold data (an id, the text of a search).

### Starting from another state

A program starts where its `init` says. To start the program elsewhere, give `run` the program with another first
step: `{ ...program, init: { state } }`, with the step's commands, if any.

- The state may be one saved by `onApplied`, or one kept across a reload in development.
- In a test, give the program to `drive` and `rehearse` the same way.
- A session recorded with `onApplied` plays again the same way, with `applyAll` in a test.

### When a defect happens

A defect anywhere ends the run, which dies with a `ProgramDefect`:

- **Its `cause` is the defect itself**: an `InvariantDefect` for one thrown with `defect`.
- **Its `where` says where it happened**, which only the run knows:

  | `where`           | Where the defect happened                                                                                              |
  | ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
  | `'init'`          | In `init`, for a program that starts from flags.                                                                       |
  | `'update'`        | In `update`, `onEvent` included. The message it was given is in `on`, by its tags, as the logs describe it by default. |
  | `'subscriptions'` | In `subscriptions`, the `Equal` and `Hash` of its keys included.                                                       |
  | `'subscription'`  | In a subscription. Its `key` is there as it is, as the logs show it.                                                   |
  | `'command'`       | In a command.                                                                                                          |
  | `'render'`        | In the renderer, the view and `makeModel` included.                                                                    |
  | an option's name  | In that option.                                                                                                        |
  | `'log'`           | In one of the run's own debug logs (a `Logger` that throws).                                                           |

  When the program logs something itself, a defect in that log is in the place the program logs from.

From the defect on, the run applies no message. Every defect is in the cause, each with where it happened.

**The run never recovers from a defect, and does not log it.** Reporting the defect, and choosing what the user sees
next, are the job of the app around the run. The screen keeps the last frame: show a crash screen, or run the program
again.

**In a browser, start the run with `Effect.runFork`**, which reports nothing itself. An interruption of the fiber that
`Effect.runFork` returns (on `pagehide`, for example) ends the run too. That interruption is not a crash:

```ts
Effect.runFork(
  run(app, render, options).pipe(
    Effect.tapCause((cause) =>
      Cause.hasInterruptsOnly(cause) ? Effect.void : reportCrash(cause)
    ),
  ),
)
```

**The app around the run chooses what leaves the device.** The `cause` is whatever was thrown. The `key` of a
`ProgramDefect` is the program's own value, as it is, and may hold data. The `id` of a `CompositionDefect` is also the
program's own value, as it is, and may hold data.

## Do and don't

Each pair sums up a rule of this page. The rule itself is above.

| Do                                                                      | Don't                                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Report the crash in the app around the run.                             | Expect the run to log a defect, or to recover from it.                                |
| Give the slow work of `onApplied` or `onIgnored` to an unbounded queue. | Do slow work in `onApplied` or `onIgnored`. It holds up the whole program.            |
| In a browser, start the run with `Effect.runFork`.                      | Report an interruption of the run's fiber as a crash.                                 |
| Choose what of the `cause` leaves the device.                           | Expect a `key` or an `id` to hold no data. Each is the program's own value, as it is. |

## Precisely

### How messages and commands appear in the logs

- A message or a command that is a string is its own tag, and appears whole. Data goes in a field of a tagged value.
- A parent's wrapping is followed only to a tagged value. So the message of a child whose messages are strings appears
  by the child's name alone: `{ _tag: 'Counter', message: 'Increment' }` appears as `Counter`. A string in a field
  named `message` may be the program's own data.

### How a command, a subscription or the renderer dies

1. It dies when its effect ends with a defect.
2. What it wraps around its own code (`Effect.ensuring`, `Effect.onExit`, an `Effect.scoped` of its own) is part of its
   effect. Such a wrapper runs before the effect ends, and may still catch the defect.
3. What it acquired in the scope the run gives it (`Effect.acquireRelease`, `Effect.addFinalizer`, what a channel adds
   to it) is released after that.
4. If that release dies, what the release dies of becomes a defect once the scope has released all it holds. Until
   then, the run goes on.

### What the run still does after a defect

- From the defect on, the run applies no message: the run does not call `update`.
- A message that the run does not apply starts no command and no subscription, and `onApplied` does not hear the
  message. So a session recorded with `onApplied` ends, at the latest, with the step that was under way at the defect.
- That is a bound on what the run still does: at most the step under way. The bound is nothing `update` can count on.
  For `update`, a command that died is a command that has not answered yet.
- A message for which the run called `update` before the defect goes on until the run stops applying messages.
  - The run may stop applying messages before the message's frame.
  - The message may still start its commands and the subscriptions of its new keys.
  - And `onApplied` may have heard a step whose frame is never drawn and whose commands never start.
- Once a command or a subscription has started, what the command or the subscription does is the program's business,
  until the run interrupts it.
- The same holds for what the renderer does. This also holds in a run that died as it started, for example when a
  subscription of `init` dies. A frame that the renderer pulls meanwhile still makes its model, since `makeModel` is
  pure and calling `makeModel` changes nothing in the program.

### How the run ends

When the run ends, because of a defect or of an interruption, it stops in this order:

1. It stops applying messages.
2. It stops the renderer.
3. It stops its commands and its subscriptions.

What is sent meanwhile is not applied. This includes what the renderer sends as it releases what it holds.

### The defects in the cause

- A defect met while the run ends joins the cause. Every defect is in it, each with where it happened.
- The cause lists the defects in the order they happened. That order is how the run is made today, and it is not a
  promise. Rely on each defect being in the cause, not on its place in the cause.
