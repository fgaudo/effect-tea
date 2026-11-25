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

**An execution cannot fail.** Its type says so: `Execution<Message, R>` is an `Effect<Option<Message>, never, R>`. A
defect (`Effect.die`, a thrown error) ends the run.

**An expected failure becomes a message, as the success does.** Then `update` decides what each message means. Write
this with `Effect.match`, then `Effect.asSome`, at the end of a `pipe` or an `Effect.fn`:

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

**A command carries everything it needs.** `runCommand` does not see the state. The services of a command are
provided around `run`.

**Commands run concurrently.** The run starts the commands of a step once the step is applied, and goes on without
waiting for them. Their answers reach `update` in the order in which the commands end, not the order in which they
started, so `update` handles them in any order.

**What must outlive a command belongs in a service, or in a subscription.** A command has a scope of its own: what it
acquires is released when it ends, before its message reaches `update` (see
[guarantees](./guarantees.md#what-you-can-rely-on)). So `run` never asks for a `Scope`.

**Commands cannot be cancelled.** Once started, a command runs to its end, and its message arrives, even if the state
has moved on. Only the end of the run stops it, whatever brings that end, and a command that the program interrupts
is a defect (see [guarantees](./guarantees.md#what-you-can-rely-on)). This keeps commands plain data, and no change
of state cuts a save in half.

- So a command must accept being interrupted at any point.
- When the answer arrives, `update` decides whether the answer still applies (see
  [rejections and defects](./rejections-and-defects.md), and for an operation that is a state of its own,
  [what "cannot arrive" rests on](./rejections-and-defects.md#what-cannot-arrive-rests-on)).

**Work that should stop is a [subscription](./subscriptions.md).**

## Advice

- **Retry within the execution**, before the failure becomes a message: for example, `Effect.retry({ times: 2 })`
  before `Effect.match`. Then `update` gets one answer, after the last try.

## Services, handlers and events

This section explains, and adds no rule.

The services of a command are its operations: `storage.save` in the example above is one. The layer provided around
`run` holds their handlers: the code that does the save. A command only calls the operation, and `update` performs no
effect.

When a child asks its parent for something, the child raises an event. An event is data, which the parent handles
after the child's step: never an operation that the child resumes from (see
[events and external messages](./events-and-external-messages.md)).
