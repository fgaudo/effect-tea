---
title: Running
---

# Running

`run(program, render, options?)` starts the program and hands `render` a stream of frames. The run ends when the
renderer ends. Only a program without events runs: there is no parent to handle them. A renderer slower than the program
only gets the latest frame, so a renderer that waits for the next animation frame before taking another draws at most
once per screen refresh, as
[`examples/snabbdom.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/snabbdom.ts) does. Options:

- **`flags`**: what the program starts from, required exactly when it has them, e.g. the product a
  notification opened the app for.
- **`describeMessage`**, **`describeCommand`**: how messages and commands appear in the logs. By default only
  their tags, never their data: `Home › Products › Deleted`. One that is a string is its own tag, and appears
  whole: data goes in a field of a tagged value. A parent's wrapping is followed only to a tagged value, so the
  message of a child whose messages are strings appears by the child's name alone, `{ _tag: 'Counter', message:
  'Increment' }` as `Counter`: a string in a field named `message` may be the program's own data. They are called
  only while debug logs are enabled (`References.MinimumLogLevel`), so they cost nothing otherwise. The debug
  logs of subscriptions show their keys, which may hold data (an id, a search's text).
- **`onApplied`**: hears every accepted message with where it came from (`origin`: a dispatch, a command, or a
  subscription with its key), the state before and after it, the `revision` of the state after it, and the
  commands it decided, for devtools or session recording. The first state is revision 0, and each new one the next:
  a message whose `update` returns the very state it was given leaves the revision as it was.
- **`onIgnored`**: hears every message `update` rejected, with where it came from and the state it did not
  apply in. It only watches: the message stays ignored. For devtools, or to count the taps that did nothing.

The run waits for `onApplied` and `onIgnored` before it takes the next message, so that they hear every message
in order, and `onApplied` before the message's frame: a slow one holds the whole program. One with slow work to
do, as a devtools that sends each step away, hands it off. It offers what it hears to an unbounded queue, which
takes it at once, and a fiber of whoever runs the program takes it from there. Raced with the run, that fiber
ends with it, and a defect in it ends the run; what is still in the queue when the run ends is not reported:

```ts
const app = Effect.gen(function*() {
  const heard = yield* Queue.unbounded<Applied<State, Message, Command>>()
  const report = Queue.take(heard).pipe(Effect.flatMap(sendToDevtools), Effect.forever)
  const running = run(program, render, { onApplied: (applied) => Effect.asVoid(Queue.offer(heard, applied)) })
  yield* Effect.raceFirst(running, report)
})
```

The run logs only at the debug level: each message, a rejected one, and subscriptions starting, stopping and
ending. Effect's default minimum level, `Info`, hides them all.

A program starts where its `init` says. To start it elsewhere, from a state saved by `onApplied` or kept across
a reload in development, give `run` the program with another first step: `{ ...program, init: { state } }`
(its commands, if any, with it), and so `drive` and `rehearse` in a test. A session recorded with `onApplied`
plays again the same way, with `applyAll` in a test.

A defect anywhere ends the run, which dies with a `ProgramDefect`:

- its `cause` is the defect itself, an `InvariantDefect` for one thrown with `defect`;
- `where` says where it happened, which only the run knows: `'init'`, for a program that starts from flags;
  `'update'` (`onEvent` included), with the message it was given as `on`, by its tags; `'subscriptions'` (the
  `Equal` and `Hash` of its keys included); `'subscription'`, with its `key` as it is, as the logs show it;
  `'command'`; `'render'` (the view and `makeModel` included); one of the options, by name; or `'log'`, for one of
  the run's own debug logs (a `Logger` that throws). What the program logs itself is in the place it logs from.

A command, a subscription or the renderer dies when its effect ends with a defect. What it acquired in the scope
the run gives it (`Effect.acquireRelease`, `Effect.addFinalizer`, what a channel adds to it) is released after that;
what it wraps around its own code (`Effect.ensuring`, `Effect.onExit`, an `Effect.scoped` of its own) is part of its
effect, runs before it ends, and may still catch the defect. What that release dies of is a defect once the scope has
released all it holds: until then, the run goes on. From the defect on, the run applies no message: it does not call
`update`. A message it does not apply starts no command and no subscription, and `onApplied` does not hear it: a
session recorded there ends with the step under way at the defect, at the latest. It is a bound on what the run
still does, at most the step under way, and nothing `update` can count on: to `update`, a command that died is one
that has not answered yet. A message whose `update` it called before goes on until the run stops applying messages,
which may be before its frame: it may still start its commands and the subscriptions of its new keys, and
`onApplied` may have heard a step whose frame is never drawn and whose commands never start. What a command or a
subscription does once started is the program's, until the run interrupts it. So is what the renderer does, in a run
that died as it started too, as when a subscription of `init` dies: a frame it pulls meanwhile still makes its model,
as `makeModel` is pure, and calling it changes nothing of the program. As it ends, of a defect or of an
interruption, the run stops applying messages first, then stops the renderer, then its commands and its
subscriptions: what is sent meanwhile, by the renderer as it releases what it holds included, is not applied. A
defect met meanwhile joins the cause: every defect is in it, each with where it happened. The cause lists them in
the order they happened, which is how the run is made today, and no promise: rely on each being there, not on its
place. The run never recovers from it, and does not log it: reporting it, and what the user sees next, are the
app's, around the run. The screen keeps the
last frame: show a crash screen, or run the program again. In a browser, start it with `Effect.runFork`, which
reports nothing itself. An interruption of the fiber it returns, on `pagehide` for one, ends the run too, and is no
crash:

```ts
Effect.runFork(
  run(app, render, options).pipe(
    Effect.tapCause((cause) =>
      Cause.hasInterruptsOnly(cause) ? Effect.void : reportCrash(cause)
    ),
  ),
)
```

What leaves the device is chosen there: the `cause` is whatever was thrown, and a `ProgramDefect`'s `key`, as a
`CompositionDefect`'s `id`, is the program's own value, as it is.
