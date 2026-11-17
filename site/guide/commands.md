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

**Commands run concurrently.** Their answers reach `update` in the order they end, not the order they started. So
`update` handles them in any order.

**Commands cannot be cancelled.** Once started, a command runs to its end, and its message arrives, even if the state
has moved on. Nothing the program does stops it. Only the end of the run does: it interrupts the commands under way. So
a command must bear being interrupted at any point. `update` then decides whether the answer still applies (see
[rejections and defects](./rejections-and-defects.md)). Where an operation is a state that only its completion leaves,
its answer is never outdated (see [structuring a program](./structuring-a-program.md)).

**Work that should stop is a [subscription](./subscriptions.md).**

## Precisely

### How commands run

Each command starts in a fiber of its own once its step is applied. There is no bound on how many run at once. The
loop goes on without waiting for it.

### Why a command cannot be cancelled

This keeps commands plain data, and no change of state cuts a save in half. The end of the run interrupts the commands
under way, whether a defect, an interruption or a renderer that ends brings it (see [running](./running.md)).

### A command's scope

A command has a scope of its own. What it acquires (`Effect.acquireRelease`, `Effect.forkScoped`) is released when it
ends, before its message reaches `update`. So `run` never asks for a `Scope`.

What must outlive a command is a service provided around `run`, or a subscription. Acquired there rather than in a
scope of the command's own, it lets a defect end the run before the release, not after (see [running](./running.md)).

### Services, handlers and events

A command's services are its operations, and the layer around `run` their handlers. This is where a program performs
effects, in the algebraic sense, and where a handler lives. `update` performs none.

What a child asks of its parent is an event: data the parent handles after the child's step, never an operation the
child resumes from.
