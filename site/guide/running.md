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
drawInto(root, view)(app)
Effect.runFork(run)
```

A message is applied in the call that sends it. Its commands and its subscriptions follow in the run's own fiber. A
defect anywhere ends the run too. The run dies, and reporting the crash is the job of the app around the run. Until
`run` runs, no effect of the program runs, and no defect is reported.

## Rules

**Only a program without events starts.** There is no parent to handle the events.

**A program is started, then run.** `start` gives a `Started`, `{ app, run }`: `app`, the `App` a renderer reads, and
`run`.

- `start` calls `init`, and makes the first state. It starts no fiber, and runs no effect.
- `run` starts the subscriptions and the commands of each state, in the order of the states. It never succeeds: it
  runs until it is interrupted, or until a defect ends it.
- A message sent before `run` is applied all the same. Its effects wait for `run`.
- A program started is run once. A second `run` dies. To run the program again, start it again.
- A program that was never run is never stopped. Its state can still change, and no effect follows.
- A program that was never run reports no defect. The defect is recorded all the same: from the defect on, the
  program applies no message, so its state no longer changes. Nothing is thrown to whoever sent the message, and
  nothing ends. `run` dies of the defect once it runs. Only `model()` throws a defect of `makeModel` or of `init`, to
  whoever reads the model.
- Both hold of a program whose `run` is interrupted before it begins, too.
- Nothing checks that a program started is run (see [guarantees](./guarantees.md#what-is-left-to-you)).

**The renderer gets an `App`**, `{ model, subscribe, dispatch, die }`:

- `model()` is the model of the current state. It is made when it is read, once for each state.
- `subscribe(listener)` tells `listener` of each new state, once it is the current one, and returns what stops it. No
  listener is told of a rejected message, nor of the very same state.
- `dispatch(message)` applies the message before it returns (see [view](./view.md#rules)).
- `die(thrown)` takes what a renderer threw as it drew outside a listener, as in a microtask, where nothing of the
  run calls it. From then on, the program applies no message, and `run` dies of it, in `'render'`. A defect that
  `model()` threw, of `makeModel` or of `init`, is taken as it is, and stays one defect. Once `run` has ended, its
  cause cannot take a new defect: `die` throws back what the cause does not hold, so that it is not lost.

**The `dispatch` of the `App` is the very same function for the whole run.** So a view
[memoized](./glossary.md#what-the-user-sees) on its dispatch is not drawn again because of the dispatch.

**A renderer reads the model when it draws.** A listener is told in the call that made the new state. So a renderer
that waits for a microtask before it reads the model draws the new states of one task once, as the bridge to snabbdom
([`bridges/snabbdom.ts`](../../bridges/snabbdom.ts)) does.

### Options

- **`flags`**: what the program starts from, for example the product a notification opened the app for. `flags` is
  required exactly when the program has flags.
- **`onApplied`**: a function that hears every accepted message, for devtools or session recording. For each message,
  `onApplied` hears:
  - where the message came from (`origin`: a dispatch, a command, or a subscription with its key);
  - the state before the message and the state after it;
  - the `revision` of the state after the message;
  - the commands decided for the message.

  The first state is revision 0, and each new state is the next revision. When `update` returns the very state it was
  given, the same object, the message leaves the revision as it was.
- **`onIgnored`**: a function that hears every message that `update` rejected, with where the message came from and
  the state it did not apply in. `onIgnored` only watches: the message stays ignored. Use `onIgnored` for devtools, or
  to count the taps that did nothing.

**`onApplied` and `onIgnored` are functions, not effects.** The run calls them as it calls `update`, and they return
nothing. The types refuse one that returns a value, an effect or a promise: what it returned would be lost.

So their return type is `undefined`, not `void`: a function typed `void` may still return an effect. A function
written in the options needs no return type. A function declared apart needs one: TypeScript gives it `void`, which
the types refuse. Write `: undefined`:

```ts
const onApplied = (applied: Applied<State, Message, Command>): undefined => {
  session.push(applied)
}
```

**The run calls `onApplied` and `onIgnored` in order.** The run calls them in the step of each message, before it
applies the next one, so that they hear every message in order. The run also calls `onApplied` before the listeners of
the `App` are told, and before the message's commands start. So a slow `onApplied` or `onIgnored` holds up the whole
program, and the call that sent the message. A defect in one of them ends the run, as any other defect does.

**Give slow work to a queue.** An `onApplied` or an `onIgnored` with slow work to do, such as a devtools that sends
each step away, gives that work to a queue:

1. The option offers what it hears to an unbounded queue, with `Queue.offerUnsafe`, which takes it at once.
2. A fiber of whoever runs the program takes each item from the queue, and does the work there. That fiber is where
   to log what the option hears, too: the option runs no effect.

That fiber is raced with the run. So the fiber ends with the run, and a defect in the fiber ends the run. What is still
in the queue when the run ends is not reported.

```ts
const main = Effect.gen(function*() {
  const heard = yield* Queue.unbounded<Applied<State, Message, Command>>()
  const report = Queue.take(heard).pipe(Effect.flatMap(sendToDevtools), Effect.forever)
  const { app, run } = start(program, {
    onApplied: (applied) => {
      Queue.offerUnsafe(heard, applied)
    }
  })
  drawInto(root, view)(app)
  yield* Effect.raceFirst(run, report)
})
```

**Work that must wait goes to the effects of the program.** An option cannot hold up the run to wait for something.
What must wait, such as a command that may start only once its state is saved, is a command or a subscription that
waits: wrap `runCommand` or a subscription, and leave the options to watch.

### Logs

The run writes no log of its own. To log each message, log what `onApplied` and `onIgnored` hear, in the fiber that
takes it from the queue. Choose there what a line holds: a message may hold data.

```ts
const main = Effect.gen(function*() {
  const heard = yield* Queue.unbounded<Applied<State, Message, Command>>()
  const logging = Queue.take(heard).pipe(
    Effect.flatMap(({ message, revision }) => Effect.logDebug("Message", message._tag, { revision })),
    Effect.forever
  )
  const { app, run } = start(program, {
    onApplied: (applied) => {
      Queue.offerUnsafe(heard, applied)
    }
  })
  drawInto(root, view)(app)
  yield* Effect.raceFirst(run, logging)
})
```

Neither option hears a message that the run drops before `update`: one that a subscription sent once its key was gone.

### Starting from another state

A program starts where its `init` says. To start the program elsewhere, give `start` the program with another first
step: `{ ...program, init: { state } }`, with the step's commands, if any.

- The state may be one saved by `onApplied`, or one kept across a reload in development.
- In a test, give the program to `drive` and `rehearse` the same way.
- A session recorded with `onApplied` plays again the same way, with `applyAll` in a test.

### When a defect happens

A defect anywhere ends the run, which dies with a `ProgramDefect`:

- **Its `cause` is the defect itself**: an `InvariantDefect` for one thrown with `defect`.
- **Its `where` says where it happened**, which only the run knows:

  | `where`           | Where the defect happened                                                                               |
  | ----------------- | ------------------------------------------------------------------------------------------------------- |
  | `'init'`          | In `init`, for a program that starts from flags.                                                        |
  | `'update'`        | In `update`, `onEvent` included. The message it was given is in `on`, by its tags.                      |
  | `'subscriptions'` | In `subscriptions`, the `Equal` and `Hash` of its keys included.                                        |
  | `'subscription'`  | In a subscription. Its `key` is there as it is.                                                         |
  | `'command'`       | In a command.                                                                                           |
  | `'render'`        | In `makeModel`, wherever the model is read, in a listener of the `App`, and what a renderer gave `die`. |
  | an option's name  | In that option.                                                                                         |

  When the program logs something, a defect in that log is in the place the program logs from.

From the defect on, the run applies no message. Every defect is in the cause, each with where it happened. A program
that was never run reports its defect only once `run` runs, and dies of it then (see [rules](#rules)).

**A defect in `init` is recorded as the program starts.** `start` still gives a handle. Its `model()` throws the
defect, and its `run` dies of it. A defect in `subscriptions` on the first state is recorded as the program starts
too, and `run` dies of it.

**What throws outside the functions of the program is in the cause as it is.** The run's own code throws it, or a
message's tags as the run reads them to say what a defect was on. It has no `where`, it is no `ProgramDefect`, and it
ends the run as a defect does.

Only the run makes a `ProgramDefect`. The app around the run reads one, and a test does too. The types refuse to build
one, with `new` or with a class that extends it.

**The run never recovers from a defect, and does not log it.** Reporting the defect, and choosing what the user sees
next, are the job of the app around the run. The screen keeps what was drawn last: show a crash screen, or run the
program again.

**In a browser, start the run with `Effect.runFork`**, which reports nothing itself. An interruption of the fiber that
`Effect.runFork` returns (on `pagehide`, for example) ends the run too. That interruption is not a crash:

```ts
const { app, run } = start(program, options)
drawInto(root, view)(app)
Effect.runFork(
  run.pipe(
    Effect.tapCause((cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : reportCrash(cause))
  )
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

### How a message is named by its tags

`on` names a message by its tags, never its data: `Home › Products › Deleted`.

- A message or a command that is a string is its own tag, and appears whole. Data goes in a field of a tagged value.
- A parent's wrapping is followed only to a tagged value. So the message of a child whose messages are strings appears
  by the child's name alone: `{ _tag: 'Counter', message: 'Increment' }` appears as `Counter`. A string in a field
  named `message` may be the program's own data.

### How a command or a subscription dies

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
- A message for which the run called `update` before the defect goes on until the end stops the run's own fiber,
  where the effects of each step run.
  - The end may stop that fiber before the message's subscriptions and commands start.
  - The message may still start its commands and the subscriptions of its new keys.
  - And `onApplied` may have heard a step whose model is never drawn and whose commands never start.
- Once a command or a subscription has started, what the command or the subscription does is the program's business,
  until the run interrupts it.
- This also holds in a run that died as it started, for example when a subscription of `init` dies.
- A renderer is no part of the run, and the run does not stop it. A model that the renderer reads after the defect is
  still made, since `makeModel` is pure and calling `makeModel` changes nothing in the program.

### How the run ends

When the run ends, because of a defect or of an interruption, it stops in this order:

1. It stops applying messages, then stops its own fiber, where the effects of each step run. What that fiber had not
   done yet is not done.
2. It stops its commands and its subscriptions.

What is sent meanwhile is not applied. A renderer is not stopped by the run: whoever started the program stops it,
with what its bridge returns. A renderer that nothing stops still draws nothing new, since no state is made after the
end.

The end may begin on the stack of a dispatch whose step met the defect, once that dispatch has applied its messages
and told the listeners, and never inside a step. This is described, and not promised.

### The defects in the cause

- A defect met while the run ends joins the cause. Every defect is in it, each with where it happened.
- The cause lists the defects in the order they happened. That order is how the run is made today, and it is not a
  promise. Rely on each defect being in the cause, not on its place in the cause.
