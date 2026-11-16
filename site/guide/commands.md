---
title: Commands
---

# Commands

A command is **data** that says what `update` decided, usually a `Data.TaggedEnum`: `Command.Save({ name })`.
The program's `runCommand` turns it into an Effect that may produce one message back. Tests can then assert
the decision without running it:

```ts
expect(commands).toEqual([Command.Save({ name: 'Ada' })])
```

- **An execution cannot fail.** Its type (`Execution<Message, R>`, an `Effect<Option<Message>, never, R>`) says
  so. An expected failure becomes a message, as the success does, so that `update` decides what each means:
  `Effect.match`, then `Effect.asSome`, at the end of a `pipe` or an `Effect.fn`. A defect (`Effect.die`, a
  thrown error) ends the run. An effect that only acts on the world answers `None`: `Effect.as(effect,
  Opt.none())`.

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
- **A command carries everything it needs.** `runCommand` does not see the state. Its services are provided
  around `run`.
- **A command has a scope of its own.** What it acquires (`Effect.acquireRelease`, `Effect.forkScoped`) is
  released when it ends, before its message reaches `update`, so `run` never asks for a `Scope`. What must
  outlive a command is a service provided around `run`, or a subscription. Acquired there rather than in a scope
  of the command's own, it lets a defect end the run before the release, not after (see [running](./running.md)).
- **Commands run concurrently.** Each one starts in a fiber of its own once its step is applied, with no bound
  on how many run at once, and the loop goes on without waiting for it. Their answers reach `update` in the
  order they end, not the order they started: `update` handles them in any order.
- **Commands cannot be cancelled.** Once started, a command runs to its end and its message arrives, even if
  the state has moved on: nothing the program does stops it. `update` then decides whether the answer still
  applies (see [rejections and defects](./rejections-and-defects.md)). An operation that is a state only its
  completion leaves has no outdated answer (see [structuring a program](./structuring-a-program.md)). This keeps
  commands plain data, and no change of state cuts a save in half. Only the end of the run does: it interrupts
  the commands under way, whether a defect, an interruption or a renderer that ends brings it (see
  [running](./running.md)), so a command bears being interrupted at any point. Work that should stop is a
  [subscription](./subscriptions.md).

A command's services are its operations, and the layer around `run` their handlers. This is where a program
performs effects, in the algebraic sense, and where a handler lives. `update` performs none. What a child asks
of its parent is an event: data the parent handles after the child's step, never an operation the child resumes
from.
