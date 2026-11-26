---
title: Subscriptions
---

# Subscriptions

## In short

This page shows how a program listens to the world for as long as its state wants: a clock that ticks while a timer
runs, or a download that stops when the user leaves the page.

A subscription is what the program listens to, or work it keeps going, while its state wants it: a clock, the size of
the window, a download. The program's `subscriptions(state)` lists the keys of its subscriptions, as data, in an array.
Its `listen(key)` makes the subscription of a key: an Effect `Channel` of messages. When the state changes, a new key
starts its subscription, and a missing key stops its subscription.

## An example

The timer ticks every second only while it runs (`examples/timer/timer.ts`). The subscription is a `Channel` that
sends `Ticked` once a second, forever:

{@includeCode ../../examples/timer/timer.ts#subscriptions}

The program names the type of its keys, `key: 'ticks'`, among its types. It lists the key `'ticks'` while the timer
runs, and nothing otherwise. Its `listen` makes the subscription of that key:

```ts
subscriptions: (state) => state.phase._tag === 'Running' ? ['ticks'] : [],
listen: () => ticks,
```

## Rules

**Keys are compared by value, after every change of state:**

- a new key starts its subscription;
- a kept key leaves it running;
- a missing key stops it, and what it sent from then on is dropped (see
  [guarantees](./guarantees.md#what-you-can-rely-on));
- a key listed twice is listed once.

**A subscription is made from its key alone.** `listen` takes the key, and does not see the state. So the key carries
everything that its subscription needs, as a command carries everything that `runCommand` needs. A string does for a
subscription that needs nothing, as the timer's `'ticks'`, and a key that carries data is a case of a
`Data.TaggedEnum`. The ball of [`bounce`](../../examples/bounce/bounce.ts) moves by steps of a length that its flags
give, and its key carries that length:

```ts
type Key = Data.TaggedEnum<{ Steps: { dt: number } }>
const Key = Data.taggedEnum<Key>()

subscriptions: (state) => flying(state) ? [Key.Steps({ dt: state.dt })] : [],
listen: ({ dt }) => steps(dt),
```

A new value of the key starts the subscription anew.

**A parent lists its own keys from its own state and its children's outputs**, those of the children of that state
(see [outputs](./events-and-external-messages.md#outputs)). A back button listens while a page says it can go back:

```ts
subscriptions: (state, children) => (children.Page.output().canGoBack ? ['back'] : []),
```

**A subscription never ends in silence.** Either it never ends, as a clock, or it ends with **one last message**, its
end value, as a download that says it is done. An ended subscription is not restarted until its key goes away and
comes back.

**Work that should stop is a subscription.** A download, or a search while the user types, can be a subscription. Keep
its key in the state while the work is wanted. When the key goes away, because the user cancels or leaves the page,
the subscription is interrupted, and what it holds is released. A command, which cannot be cancelled, is for work
whose answer must arrive even if the state has moved on (see [commands](./commands.md)).

## Advice

- **Split in three a connection that stays open while a value it uses changes**, such as a feed whose filter the user
  picks. A filter in the key would start the subscription anew at each change, and open the connection again.
  - The connection is a **service**: a layer provided to `run` opens it when the run starts, and closes it when the
    run ends.
  - A **subscription**, under a key that stays the same, listens to what the service receives.
  - A **command** sends the service the new value, when `update` decides that the value changed.

  ```ts
  // The service: one connection for the whole run.
  class Feed extends Context.Service<Feed, {
    readonly items: Channel.Channel<Item, never, never>
    readonly filter: (filter: string) => Effect.Effect<void>
  }>()('Feed') {}

  // While the feed is open, one subscription listens, whatever the filter.
  subscriptions: (state) => state.feed._tag === 'Open' ? ['feed'] : [],
  listen: () =>
    Channel.unwrap(Effect.map(Effect.service(Feed), (feed) =>
      Channel.map(feed.items, (item) => Message.Received({ item }))
    )),

  // A new filter is a command: the connection stays open.
  runCommand: (command) =>
    Effect.flatMap(Effect.service(Feed), (feed) => feed.filter(command.filter)).pipe(
      Effect.as(Opt.none()),
    ),
  ```

## More examples

This section explains, and adds no rule. A subscription is written with Effect's own combinators.

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

The whole program is in [`volume`](../../examples/volume/volume.ts).

**A source of callbacks as a subscription.** A source that calls back with each value, and returns what stops it,
becomes a `Stream` with `Stream.callback`. Give the source's stop as the release of an `Effect.acquireRelease`: it runs
when the stream ends, by the end of the source, because its key went away, or because the run ended. `Queue.endUnsafe`
ends the stream, and `Channel.mapDone` says what that end means:

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
