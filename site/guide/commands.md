---
title: Commands
---

# Commands

## In short

This page shows how your `update` asks for work in the world, such as a save, and how the answer comes back to
`update` as a message.

A command is **data** that says what `update` decided, usually a `Data.TaggedEnum`: `Command.Save({ name })`. The
program's `runCommand` alone turns it into an Effect that may produce one message back. Because the decision is data,
a test can check the decision without running it.

## An example

The timer rings a bell when it finishes (`examples/timer/timer.ts`). Ringing the bell only acts on the world, so the
bell's Effect answers `None`:

{@includeCode ../../examples/timer/timer.ts#command}

A program whose `update` decides to save a name returns `Command.Save({ name })`. A test checks that decision without
running it:

```ts
expect(commands).toEqual([Command.Save({ name: "Ada" })])
```

## Rules

**An execution cannot fail.** Its type says so: `Execution<Message, R>` is an `Effect<Option<Message>, never, R>`.

**An expected failure becomes a message, as the success does.** Then `update` decides what each message means.

Write this with `Effect.match`, then `Effect.asSome`, at the end of a `pipe` or an `Effect.fn`:

```ts
const save = Effect.fn("Save")(
  function*(name: string) {
    const storage = yield* Storage
    yield* storage.save(name)
  },
  Effect.match({
    onSuccess: () => Message.Saved(),
    onFailure: () => Message.SaveFailed()
  }),
  Effect.asSome
)
```

**A retry is part of the execution.** Put the retry before the failure becomes a message: for example,
`Effect.retry({ times: 2 })` before `Effect.match`. Then `update` gets one answer, after the last try.

**An effect that only acts on the world answers `None`**: `Effect.as(effect, Opt.none())`, as the bell does.

**A defect (`Effect.die`, a thrown error) ends the run.**

**A command carries everything it needs.** `runCommand` does not see the state. The services of a command are
provided around `run`.

**Commands run concurrently.** Their answers reach `update` in the order in which the commands end, not the order in
which they started. So `update` must handle the answers in any order.

**Commands cannot be cancelled.** Once started, a command runs to its end, and its message arrives, even if the state
has moved on. Nothing the program does stops a command. Only the end of the run stops it: the end of the run
interrupts the commands under way (see [why a command cannot be cancelled](#why-a-command-cannot-be-cancelled)).

- So a command must accept being interrupted at any point.
- When the answer arrives, `update` decides whether the answer still applies (see
  [rejections and defects](./rejections-and-defects.md)).
- When an operation is a state that only its completion leaves, the answer of that operation is never outdated (see
  [structuring a program](./structuring-a-program.md)).

**Work that should stop is a [subscription](./subscriptions.md).**

## Do and don't

Each pair sums up a rule of this page. The rule itself is above.

| Do                                                                   | Don't                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Turn an expected failure into a message with `Effect.match`.         | Return an Effect that can fail. The type of an execution refuses it.           |
| Put in the command everything that `runCommand` needs.               | Expect `runCommand` to read the state. It does not see the state.              |
| Let `update` decide whether an answer still applies when it arrives. | Expect a change of state to stop a command. Nothing the program does stops it. |
| Handle the answers of commands in any order.                         | Expect the answers in the order in which the commands started.                 |
| Make work that should stop a [subscription](./subscriptions.md).     | Make it a command, and try to cancel the command.                              |

```ts
// Don't: an execution cannot fail, so this does not compile
const save = (name: string): Execution<Message, Storage> =>
  Effect.flatMap(Effect.service(Storage), (storage) => storage.save(name)).pipe(
    Effect.as(Opt.some(Message.Saved()))
  )

// Do: the failure becomes a message, as the success does
const save = (name: string): Execution<Message, Storage> =>
  Effect.flatMap(Effect.service(Storage), (storage) => storage.save(name)).pipe(
    Effect.match({
      onSuccess: () => Message.Saved(),
      onFailure: () => Message.SaveFailed()
    }),
    Effect.asSome
  )
```

## Precisely

### How commands run

Each command starts in a fiber of its own once its step is applied. There is no bound on how many commands run at
once. The loop goes on without waiting for the command.

### Why a command cannot be cancelled

This keeps commands plain data. It also means that no change of state cuts a save in half.

The end of the run interrupts the commands under way, whatever brings that end: a defect, an interruption, or a
renderer that ends (see [running](./running.md)).

### A command's scope

A command has a scope of its own. What the command acquires (`Effect.acquireRelease`, `Effect.forkScoped`) is released
when the command ends, before its message reaches `update`. So `run` never asks for a `Scope`.

What must outlive a command belongs in a service provided around `run`, or in a subscription. When it is acquired in
the service or the subscription, and not in the command's own scope, a defect ends the run before the release, not
after (see [running](./running.md)).

### Services, handlers and events

The services of a command are its operations: `storage.save` in the example above is one. The layer provided around
`run` holds their handlers: the code that does the save. This is where a program performs effects, and where a handler
lives. A command only calls the operation, and the handler that the layer holds does the work. `update` performs no
effect.

When a child asks its parent for something, the child raises an event. An event is data. The parent handles the event
after the child's step. An event is never an operation that the child resumes from (see
[events and external messages](./events-and-external-messages.md)).
