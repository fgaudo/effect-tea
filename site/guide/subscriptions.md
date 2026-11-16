---
title: Subscriptions
---

# Subscriptions

`subscriptions(state)` returns a `HashMap` of **subscriptions** by key: Effect `Channel`s of messages. After
every change of state the keys are compared by value:

- a new key starts its subscription;
- a kept key leaves it running;
- a missing key stops it, and drops what it sent that `update` has not seen.

A subscription never ends in silence. Either it never ends (a clock: its end value is `never`), or it ends with **one
last message**, its end value (a download done). An ended subscription is not restarted until its key goes away and
comes back. The type says all of it: a `Channel` whose end value is a message, written with Effect's own combinators, as
the clock of [`pages`](https://github.com/fgaudo/effect-tea/tree/main/examples/pages/clock.ts) and the stopwatch of
[`list`](https://github.com/fgaudo/effect-tea/tree/main/examples/list/stopwatch.ts) are. A `Stream` becomes one with
`Stream.toChannel`, `Channel.flattenArray` and `Channel.mapDone`, which asks what its end means.

| Use a…           | for                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **subscription** | input tied to a state (a clock while a page is open, a scroll), or work that stops when the state no longer wants it (a download) |
| **command**      | a one-off effect whose answer must arrive even if the state has moved on                                                          |

**Work that should stop is a subscription.** A download, or a search while the user types, can be one: keep
its key in the state while the work is wanted. When the key goes away (the user cancels, or leaves the page)
the subscription is interrupted, and what it holds is released. When the work ends by itself, its last message
says so.

A subscription sees the state only through its key: what it depends on goes into the key, and a new value
starts it anew. That is cheap for a timer whose interval changes. For something that should stay open while a
value it uses changes, such as a connection whose filter the user picks, split it three ways:

- the connection is a **service**: a layer provided to `run` opens it when the program starts and closes it
  when the run ends, so subscriptions and commands only use it;
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
