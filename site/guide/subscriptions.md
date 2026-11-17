---
title: Subscriptions
---

# Subscriptions

## In short

A subscription is input or work the program keeps while its state wants it: a clock, a scroll, a download. The program's
`subscriptions(state)` returns them in a `HashMap` by key, and each is an Effect `Channel` of messages. When the state
changes, a new key starts its subscription and a missing key stops it.

## An example

The timer ticks every second only while it runs (`examples/timer/timer.ts`). The subscription is a `Channel` that
sends `Ticked` once a second, forever:

{@includeCode ../../examples/timer/timer.ts#subscriptions}

The program lists it under the key `'ticks'` while the timer runs, and lists nothing otherwise:

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

**The type says all of it.** A subscription is a `Channel` whose end value is a message. It is written with Effect's own
combinators, as the clock of [`pages`](https://github.com/fgaudo/effect-tea/tree/main/examples/pages/clock.ts) and the
stopwatch of [`list`](https://github.com/fgaudo/effect-tea/tree/main/examples/list/stopwatch.ts) are.

**Pick a subscription or a command by what the work is for:**

| Use a…           | for                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **subscription** | input tied to a state (a clock while a page is open, a scroll), or work that stops when the state no longer wants it (a download) |
| **command**      | a one-off effect whose answer must arrive even if the state has moved on                                                          |

**Work that should stop is a subscription.** A download, or a search while the user types, can be one. Keep its key
in the state while the work is wanted.

- When the key goes away (the user cancels, or leaves the page), the subscription is interrupted, and what it holds is
  released.
- When the work ends by itself, its last message says so.

**A subscription sees the state only through its key.** Whatever it depends on goes into the key. A new value of the
key starts it anew. That is cheap for a timer whose interval changes.

**A connection that stays open is split three ways.** Some things should stay open while a value they use changes,
such as a connection whose filter the user picks. Split such a thing in three:

- the connection is a **service**: a layer provided to `run` opens it when the program starts and closes it when the
  run ends, so subscriptions and commands only use it;
- a **subscription** under a key that stays the same listens to what the service receives;
- a **command** sends the service the new value, when `update` decides that it changed.

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

## Precisely

**What a stopped subscription sent.** A missing key stops its subscription. It also drops the messages that the
subscription sent and that `update` has not seen.

**A `Stream` as a subscription.** A `Stream` becomes one with `Stream.toChannel`, `Channel.flattenArray` and
`Channel.mapDone`. `Channel.mapDone` is where you say what the stream's end means.
