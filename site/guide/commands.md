---
title: Commands
---

# Commands

## In short

A command is **data** that says what `update` decided, usually a `Data.TaggedEnum`: `Command.Save({ name })`. The
program's `runCommand` alone turns it into an Effect that may produce one message back. Since the decision is data,
tests can assert it without running it.

## An example

The timer rings a bell when it finishes (`examples/timer/timer.ts`). Ringing only acts on the world, so its Effect
answers `None`:

{@includeCode ../../examples/timer/timer.ts#command}

A program whose `update` decides to save a name returns `Command.Save({ name })`, and a test asserts that decision
without running it:

```ts
expect(commands).toEqual([Command.Save({ name: 'Ada' })])
```

## Rules

**An execution cannot fail.** Its type says so: `Execution<Message, R>` is an `Effect<Option<Message>, never, R>`.

**An expected failure becomes a message, as the success does.** Then `update` decides what each means.

Write it with `Effect.match`, then `Effect.asSome`, at the end of a `pipe` or an `Effect.fn`:

```ts
const save = Effect.fn('Save')(
  function*(name: string) {
    const storage = yield* Storage
    yield* storage.save(name)
  },
  Effect.match({
    onSuccess: () => Message.Saved(),
    onFailure: () => Message.SaveFailed(),
  }),
  Effect.asSome,
)
```

**An effect that only acts on the world answers `None`**: `Effect.as(effect, Opt.none())`, as the bell does.

**A defect (`Effect.die`, a thrown error) ends the run.**

**A command carries everything it needs.** `runCommand` does not see the state. Its services are provided around
`run`.

**Commands run concurrently.** Their answers reach `update` in the order in which the commands end, not the order in
which they started. So `update` must handle them in any order.

**Commands cannot be cancelled.** Once started, a command runs to its end, and its message arrives, even if the state
has moved on. Nothing the program does stops it. Only the end of the run stops it: the end interrupts the commands
under way. So a command must accept being interrupted at any point. When the answer arrives, `update` decides whether it
still applies (see [rejections and defects](./rejections-and-defects.md)). When an operation is a state that only its
completion leaves, its answer is never outdated (see [structuring a program](./structuring-a-program.md)).

**Work that should stop is a [subscription](./subscriptions.md).**

## Precisely

### How commands run

Each command starts in a fiber of its own once its step is applied. There is no bound on how many run at once. The
loop goes on without waiting for it.

### Why a command cannot be cancelled

This keeps commands plain data, and it means that no change of state cuts a save in half. The end of the run
interrupts the commands under way, whatever brings that end: a defect, an interruption, or a renderer that ends (see
[running](./running.md)).

### A command's scope

A command has a scope of its own. What it acquires (`Effect.acquireRelease`, `Effect.forkScoped`) is released when it
ends, before its message reaches `update`. So `run` never asks for a `Scope`.

What must outlive a command belongs in a service provided around `run`, or in a subscription. When it is acquired
there, and not in the command's own scope, a defect ends the run before the release, not after (see
[running](./running.md)).

### Services, handlers and events

A command's services are its operations, and the layer around `run` holds their handlers. This is where a program
performs effects, in the algebraic sense, and where a handler lives. `update` performs none.

When a child asks its parent for something, it raises an event. An event is data that the parent handles after the
child's step, never an operation that the child resumes from.
