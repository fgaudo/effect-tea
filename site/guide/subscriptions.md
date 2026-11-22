---
title: Subscriptions
---

# Subscriptions

## In short

This page shows how a program listens to the world for as long as its state wants: a clock that ticks while a timer
runs, or a download that stops when the user leaves the page.

A subscription is what the program listens to, or work it keeps going, while its state wants it: a clock, the size of
the window, a download. The program's `subscriptions(state)` returns its subscriptions in a `HashMap`, by key. Each
subscription is an Effect `Channel` of messages. When the state changes, a new key starts its subscription, and a
missing key stops its subscription.

## An example

The timer ticks every second only while it runs (`examples/timer/timer.ts`). The subscription is a `Channel` that
sends `Ticked` once a second, forever:

{@includeCode ../../examples/timer/timer.ts#subscriptions}

The program lists the subscription under the key `'ticks'` while the timer runs. Otherwise, it lists nothing:

```ts
subscriptions: (state) => state.phase._tag === 'Running' ? HashMap.make(['ticks', ticks]) : HashMap.empty(),
```

## Rules

**Keys are compared by value, after every change of state:**

- a new key starts its subscription;
- a kept key leaves it running;
- a missing key stops it.

**A subscription never ends in silence.** Either it never ends, or it ends with **one last message**, its end value.

- A clock never ends: its end value is `never`.
- A download ends with a message that says it is done.

**An ended subscription is not restarted** until its key goes away and comes back.

**The type says all of it.** A subscription is a `Channel` whose end value is a message. A subscription is written with
Effect's own combinators, as the clock of [`pages`](../../examples/pages/clock.ts) and the stopwatch of
[`list`](../../examples/list/stopwatch.ts) are.

**Pick a subscription or a command by what the work is for:**

| Use a…           | for                                                                                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **subscription** | messages from a source for as long as a state wants them (a clock while a page is open, the size of the window), or work that stops when the state no longer wants it (a download) |
| **command**      | a one-off effect whose answer must arrive even if the state has moved on                                                                                                           |

**Work that should stop is a subscription.** A download, or a search while the user types, can be a subscription. Keep
the subscription's key in the state while the work is wanted.

- When the key goes away (the user cancels, or leaves the page), the subscription is interrupted, and what it holds is
  released.
- When the work ends by itself, its last message says so.

**A subscription sees the state only through its key.** Whatever the subscription depends on goes into its key. A new
value of the key starts the subscription anew. Starting anew is cheap for a timer whose interval changes.

**A value that stays the same while the key is kept can stay out of the key.** A child's own id is such a value: the
child's `init` sets the id once. While a key is kept, its subscription keeps running. A new subscription that
`subscriptions` returns under the kept key is not used. Under a parent, the keys of a child by id are already under the
child's id.

**A connection that stays open is split three ways.** Some things should stay open while a value they use changes. An
example is a connection whose filter the user picks. Split such a thing in three:

- the connection is a **service**. A layer provided to `run` opens the connection when the run starts, and closes
  it when the run ends. So subscriptions and commands only use the connection;
- a **subscription** under a key that stays the same listens to what the service receives;
- a **command** sends the service the new value, when `update` decides that the value changed.

```ts
// The service: one connection for the whole run.
class Feed extends Context.Service<Feed, {
  readonly items: Channel.Channel<Item, never, never>
  readonly filter: (filter: string) => Effect.Effect<void>
}>()('Feed') {}

// While the feed is open, one subscription listens, whatever the filter.
subscriptions: (state) =>
  state.feed._tag === 'Open'
    ? HashMap.make([
      'feed',
      Channel.unwrap(Effect.map(Effect.service(Feed), (feed) =>
        Channel.map(feed.items, (item) => Message.Received({ item }))
      )),
    ])
    : HashMap.empty(),

// A new filter is a command: the connection stays open.
runCommand: (command) =>
  Effect.flatMap(Effect.service(Feed), (feed) => feed.filter(command.filter)).pipe(
    Effect.as(Opt.none()),
  ),
```

## Do and don't

Each pair sums up a rule of this page. The rule itself is above.

| Do                                                                                          | Don't                                                                                                   |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Put into the key whatever the subscription depends on.                                      | Leave out of the key a value that changes while the key is kept. The new value is not used.             |
| Let a subscription that ends say so with one last message.                                  | Expect an ended subscription to start again while its key is kept.                                      |
| Make a connection that stays open a service, and send it a new value with a command.        | Put the filter of an open connection in the subscription's key. A new key starts the subscription anew. |
| Use a subscription for work that stops when the state no longer wants it.                   | Use a command for that work. A command cannot be cancelled.                                             |
| Use a command for a one-off effect whose answer must arrive even if the state has moved on. | Use a subscription for that effect. A missing key stops it.                                             |

## Precisely

**What a stopped subscription sent.** A missing key stops its subscription. The run also drops the messages that the
subscription sent and that `update` has not seen, from the moment the key is gone, before the subscription has been
stopped.

**A `Stream` as a subscription.** A `Stream` becomes a subscription with `Stream.toChannel`, `Channel.flattenArray` and
`Channel.mapDone`. `Channel.mapDone` is where you say what the end of the stream means. A drag sends each move of the
pointer, then one last message when the user lets go:

```ts
const dragging: Subscription<Message, Pointer> = Channel.unwrap(
  Effect.map(Effect.service(Pointer), (pointer) =>
    Stream.toChannel(pointer.moves).pipe(
      Channel.flattenArray,
      Channel.map((at) => Message.Moved({ at })),
      Channel.mapDone(() => Message.DragEnded())
    ))
)
```

The whole program is in [`volume`](../../examples/volume/volume.ts). The scanner feed of
[`stocktake`](../../examples/stocktake/stocktake.ts) ends the same way, with a message that says the scanner is gone.

**A source of callbacks as a subscription.** A source that calls back with each value, and returns what stops it,
becomes a `Stream` with `Stream.callback`. Give the source's stop as the release of an `Effect.acquireRelease`: it runs
when the stream ends, by the end of the source or because its key went away or the run ended. `Queue.endUnsafe` ends
the stream, and `Channel.mapDone` says what that end means:

```ts
const scans: Subscription<Message, Scanner> = Channel.unwrap(
  Effect.map(Effect.service(Scanner), (scanner) =>
    Stream.callback<string>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => scanner.listen((code) => Queue.offerUnsafe(queue, code), () => Queue.endUnsafe(queue))),
        (stop) => Effect.sync(stop)
      )
    ).pipe(
      Stream.toChannel,
      Channel.flattenArray,
      Channel.map((code) => Message.Scanned({ code })),
      Channel.mapDone(() => Message.ScannerGone())
    ))
)
```

The `main.ts` of [`volume`](../../examples/volume/main.ts) and of [`bounce`](../../examples/bounce/main.ts) make their
streams this way.
