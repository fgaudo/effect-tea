# @fgaudo/effect-tea

The Elm architecture (TEA) on [Effect](https://effect.website) v4, for any renderer.

- One **state**, changed only by a pure **`update`**.
- Effects are described, not run: **commands** (one-shot) and **subscriptions** (listeners, kept by key).
- The view draws a **model**, and can only send the messages the model **offers**.

What it adds to plain Elm is a guarantee that the view and `update` agree. `update` may **reject** a message
that makes no sense in the current state. The model offers an action only if `update` would accept it, and
`dispatch` only takes offered messages. A view that sends something `update` does not accept is therefore
a compile error, not a silent bug.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Guide](#guide)
  1. [State, messages and `update`](#1-state-messages-and-update)
  2. [The model offers, the view sends](#2-the-model-offers-the-view-sends)
  3. [Input](#3-input)
  4. [Commands](#4-commands)
  5. [Subscriptions](#5-subscriptions)
  6. [Rejections: stale or bug](#6-rejections-stale-or-bug)
  7. [Composing programs: `embed`](#7-composing-programs-embed)
  8. [Lists of programs: `embedEach`](#8-lists-of-programs-embedeach)
  9. [Running](#9-running)
  10. [Testing](#10-testing)
- [API reference](#api-reference)
- [Development](#development)

## Installation

`effect` (v4) is a peer dependency. The package ships compiled JavaScript with declarations (`dist/`):
use `moduleResolution` `nodenext` or `bundler`, with the `ESNext` and `DOM` libs that Effect needs.

Under Bun, the `bun` export condition resolves to the TypeScript sources instead. A project that bundles
with `conditions: ['bun']` and type-checks with `customConditions: ["bun"]` never needs to build this
package.

## Quick start

A counter that cannot go below zero. The "renderer" here only logs, and clicks "increment" until the count
reaches 3.

```ts
import {
  type Offer,
  offers,
  type Program,
  reject,
  run,
  type Update,
} from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Stream from 'effect/Stream'

type Message = 'Increment' | 'Decrement'

const update: Update<number, Message, never> = (message) => (count) =>
  message === 'Increment'
    ? { state: count + 1 }
    : count > 0
    ? { state: count - 1 }
    : reject // nothing to decrement

type Model = Readonly<
  { count: number; increment: Offer<Message>; decrement: Offer<Message> }
>

const counter: Program<number, Model, Message, never> = {
  init: { state: 0 },
  update,
  subscriptions: () => HashMap.empty(),
  makeModel: (count) => {
    const { offer } = offers(update, count)
    // `decrement` is `None` at 0: update would reject it.
    return {
      count,
      increment: offer('Increment'),
      decrement: offer('Decrement'),
    }
  },
}

const main = run(counter, (frames) =>
  frames.pipe(
    Stream.tap(({ model, dispatch }) =>
      Effect.log(model.count).pipe(
        Effect.andThen(Effect.sync(() => {
          if (model.count < 3 && Opt.isSome(model.increment)) {
            dispatch(model.increment.value)
          }
        })),
      )
    ),
    Stream.take(4),
    Stream.runDrain,
  ), { onRejected: 'die' })

Effect.runFork(main) // logs 0, 1, 2, 3
```

A program is four pieces: `init`, `update`, `subscriptions` and `makeModel`. The view is not one of them:
`run` hands your renderer a stream of **frames** (`{ model, dispatch }`), and the renderer draws them however
it likes.

## Guide

The examples below build a small app with [snabbdom](https://github.com/snabbdom/snabbdom). Any renderer
works the same way. Messages and states are `Data.TaggedEnum`s, but any type will do.

### 1. State, messages and `update`

`update` takes a message, then the state. It returns either a `Step` (`{ state, commands?, events? }`) or
`reject` when the message makes no sense in that state.

```ts
import { reject, type Update } from '@fgaudo/effect-tea'
import * as Data from 'effect/Data'

type State = Data.TaggedEnum<{
  Idle: {}
  Loading: { seconds: number }
  Loaded: { quote: string }
  Failed: {}
}>
const State = Data.taggedEnum<State>()

type Message = Data.TaggedEnum<{
  LoadClicked: {}
  Ticked: {}
  Loaded: { quote: string }
  LoadFailed: {}
}>
const Message = Data.taggedEnum<Message>()

const update: Update<State, Message, never> = (message) => (state) => {
  switch (message._tag) {
    case 'LoadClicked':
      return state._tag === 'Loading'
        ? reject
        : { state: State.Loading({ seconds: 0 }), commands: [loadQuote] }
    case 'Ticked':
      return state._tag === 'Loading'
        ? { state: State.Loading({ seconds: state.seconds + 1 }) }
        : reject
    case 'Loaded':
      return state._tag === 'Loading'
        ? { state: State.Loaded({ quote: message.quote }) }
        : reject
    case 'LoadFailed':
      return state._tag === 'Loading' ? { state: State.Failed() } : reject
  }
}
```

Rules that make the rest work:

- **`update` is pure.** It never runs effects; it returns them as `commands`. The library also calls it to
  decide offers (see below), so it must be cheap and free of side effects.
- **Conditions live in `update`.** "Can the user load now?" is answered once, here, by rejecting. The view
  never repeats the check.
- **Name intents, not toggles.** Prefer `MenuOpened`/`MenuClosed` to `MenuToggled`: an intent sent twice
  (a double tap, or a second tap on a view that has not caught up yet) does what it did once, while a toggle
  undoes itself.
- **One-shot actions move to a state that rejects them.** After `Submitted`, the state is `Submitting`,
  which rejects a second `Submitted`: sent from the same frame, it is ignored as stale (see
  [Rejections](#6-rejections-stale-or-bug)), so the form is never sent twice. Actions meant to repeat (a
  "+1") stay accepted.
- **Rejecting a message that would change nothing is a choice, not a rule.** Rejecting makes the model stop
  offering it, so the view can hide or disable the control; accepting it is harmless when there is nothing
  to show.

### 2. The model offers, the view sends

`makeModel` turns the state into what the view shows. Every action is an `Offer<Message>`: an `Option` that
is `Some` exactly when `update` accepts the message in this state. `offers(update, state)` asks `update` for
you.

```ts
import { type Offer, offers, type Program } from '@fgaudo/effect-tea'

type Model = Readonly<{ text: string; load: Offer<Message> }>

const makeModel = (state: State): Model => {
  const { offer } = offers(update, state)
  return {
    text: State.$match(state, {
      Idle: () => 'No quote yet',
      Loading: ({ seconds }) => `Loading… (${seconds}s)`,
      Loaded: ({ quote }) => quote,
      Failed: () => 'Could not load a quote',
    }),
    load: offer(Message.LoadClicked()), // None while loading
  }
}

export const quote: Program<State, Model, Message, never> = {
  init: { state: State.Idle() },
  update,
  subscriptions, // see "Subscriptions"
  makeModel,
}
```

A view is `(model, dispatch) => Node`. `dispatch` only accepts **offered** messages, a brand that only
`offers` creates, so the view attaches a handler only when there is an offer:

```ts
import { type Dispatch, type Offer, type View } from '@fgaudo/effect-tea'
import * as Opt from 'effect/Option'
import { h, type VNode } from 'snabbdom'

const onClick = <M>(offer: Offer<M>, dispatch: Dispatch<M>) =>
  Opt.match(offer, {
    onNone: () => ({}),
    onSome: (message) => ({ click: () => dispatch(message) }),
  })

export const view: View<Model, Message, VNode> = (model, dispatch) =>
  h('main', [
    h('p', model.text),
    h('button', {
      attrs: { disabled: Opt.isNone(model.load) },
      on: onClick(model.load, dispatch),
    }, 'Load a quote'),
  ])
```

Building a message in the view does not compile:

```ts
dispatch(Message.LoadClicked()) // error: not an Offered<Message>
```

A model may offer **less** than `update` accepts (e.g. to hide an action), never more.

**Cost:** each offer runs `update` once per frame. Keep the rejecting branches cheap (a check before any
work), and in long lists offer per-item actions only for the items on screen.

### 3. Input

Input is never a reason to reject: whatever the user types is stored, and its _validity_ becomes model data
(e.g. "submit" not offered). For messages that carry a value from the view, use `offerInput`. It returns an
`InputOffer<Value, Message>`: an optional function from the value to an offered message.

```ts
import {
  type InputOffer,
  type Offer,
  offers,
  type Program,
  reject,
  type Update,
  type View,
} from '@fgaudo/effect-tea'

export type State = Readonly<{ name: string }>

export type Message = Data.TaggedEnum<{
  NameChanged: { name: string }
  Submitted: {}
}>
const Message = Data.taggedEnum<Message>()

/** What the form tells its parent (see "Composing programs"). */
export type Event = Readonly<{ _tag: 'Saved'; name: string }>

const update: Update<State, Message, never, Event> = (message) => (state) => {
  switch (message._tag) {
    case 'NameChanged':
      return { state: { name: message.name } }
    case 'Submitted':
      return state.name.trim() === ''
        ? reject
        : { state, events: [{ _tag: 'Saved', name: state.name.trim() }] }
  }
}

export type Model = Readonly<
  {
    name: string
    changeName: InputOffer<string, Message>
    submit: Offer<Message>
  }
>

export const form: Program<State, Model, Message, never, Event> = {
  init: { state: { name: '' } },
  update,
  subscriptions: () => HashMap.empty(),
  makeModel: (state) => {
    const { offer, offerInput } = offers(update, state)
    return {
      name: state.name,
      changeName: offerInput(
        (name: string) => Message.NameChanged({ name }),
        state.name,
      ),
      submit: offer(Message.Submitted()),
    }
  },
}

// `onClick` as in the previous section.
export const view: View<Model, Message, VNode> = (model, dispatch) =>
  h('form', [
    h('input', {
      props: { value: model.name },
      on: Opt.match(model.changeName, {
        onNone: () => ({}),
        onSome: (changeName) => ({
          input: (event) =>
            dispatch(changeName((event.target as HTMLInputElement).value)),
        }),
      }),
    }),
    h('button', {
      attrs: { disabled: Opt.isNone(model.submit) },
      on: onClick(model.submit, dispatch),
    }, 'Save'),
  ])
```

`offerInput` asks `update` with the current value. Since input is never a reason to reject, the answer holds
for any value.

### 4. Commands

A `Command<Message, R>` is an `Effect` that produces an optional message (`None` for effects that only act
on the world). Its error channel is `never`: an expected failure must become a message, so that `update`
decides what it means. `attempt` does that for an effect that may fail:

```ts
import { attempt, type Command } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'

const loadQuote: Command<Message, never> = attempt(
  Effect.tryPromise(() =>
    fetch('https://example.com/quote').then((response) => response.text())
  ),
  {
    onSuccess: (quote): Message => Message.Loaded({ quote }),
    onFailure: (): Message => Message.LoadFailed(),
  },
)
```

`update` returns it in `commands` (see `LoadClicked` above). The engine runs it, then feeds its message back
to `update`.

- `R` is the context the command needs (services, layers). `run` requires it, so you provide it once
  around the whole program.
- A completion can arrive after the state has moved on. Here `Loaded` is rejected unless the state is still
  `Loading`, and a rejected completion is simply ignored. If two operations of the same kind can overlap,
  give each one an id kept in the state, and accept a completion only when its id matches.
- A **defect** (`Effect.die`, a thrown exception) is a bug: the program dies. Never catch it to turn it into
  a message.

### 5. Subscriptions

`subscriptions(state)` returns a `HashMap` from keys to **subscriptions**. A subscription is an Effect
[`Channel`](https://effect.website) of messages: values over time, with what they end with in their type.

```ts
type Subscription<Message, R> = Channel<
  Message,
  never,
  Message,
  unknown,
  unknown,
  unknown,
  R
>
//                                  messages  no error  ends with a message   └── input: none ──┘
```

**A subscription never ends in silence.** Either it never ends (its end value is `never`, as for a clock or
database changes), or it ends with **one last message**, which the engine sends to `update` like the others:
the type does not let it end without one. After every change, the engine compares the keys:

- a key that **appears** starts its subscription;
- a key that **stays** keeps its subscription running, untouched. If it has ended, it is **not** started
  again: `update` has its last message, and decides whether to drop the key;
- a key that **disappears** interrupts its subscription, which releases what it holds. If it comes back,
  the subscription starts anew.

Unlike Elm, where subscriptions never end, this lets a finite process with progress be one subscription: a
download sends its progress, ends with its file, and is canceled by dropping its key.

```ts
// The download's end value is the file: it becomes the last message.
const downloadOf = (url: string): Subscription<Message, Downloads> =>
  Channel.unwrap(
    Effect.map(Effect.service(Downloads), ({ download }) =>
      download(url).pipe(
        Channel.map((progress) => Message.Progressed({ progress })),
        Channel.mapDone((file) => Message.Downloaded({ file })),
      )),
  )
```

```ts
import { type Subscription } from '@fgaudo/effect-tea'
import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'

// A clock that ticks only while loading: every second, then again, forever.
const clock: Subscription<Message, never> = Channel.forever(
  Channel.map(
    Channel.fromEffect(Effect.sleep('1 second')),
    () => Message.Ticked(),
  ),
)

const subscriptions = (state: State) =>
  state._tag === 'Loading'
    ? HashMap.make(['clock', clock])
    : HashMap.empty<string, Subscription<Message, never>>()
```

Keys are compared by value, so they can be strings, numbers, tuples of them, or Effect data. Channels keep
their end value through `Channel.map`, `Channel.filter`, `Channel.mapEffect`, `Channel.merge`…, and
`Channel.unwrap` builds one from an effect, e.g. to read a service:

```ts
const products: Subscription<Message, ProductList> = Channel.unwrap(
  Effect.map(
    Effect.service(ProductList),
    ({ changes }) => Channel.map(changes, (list) => Message.Listed({ list })),
  ),
)
```

**From a stream.** A stream, unlike a subscription, may end: its type cannot say otherwise. So running one as
a subscription means deciding what its end means, and that decision is yours:

```ts
// Once the stream has ended, keep listening to nothing until the key goes away.
const listen = <Message, R>(
  stream: Stream.Stream<Message, never, R>,
): Subscription<Message, R> =>
  Stream.toChannel(stream).pipe(
    Channel.flattenArray,
    Channel.concatWith(() => Channel.never),
  )

// Or treat the end as a bug.
const listenForever = <Message, R>(
  stream: Stream.Stream<Message, never, R>,
): Subscription<Message, R> =>
  Stream.toChannel(stream).pipe(
    Channel.flattenArray,
    Channel.concatWith(() =>
      Channel.die(new Error('A subscribed stream ended'))
    ),
  )
```

**Failures.** A subscription cannot fail: an expected failure must become a message, so that `update` decides
what it means.

- Transient errors can be retried at the source, with `Stream.retry` (or `Channel.retry`) and a `Schedule`,
  before they ever reach `update`.
- Otherwise, turn the failure into a message, and let the state decide whether to listen again. The
  subscription waits after its last message; `update` removes its key, and brings it back to retry:

```ts
const feed: Subscription<Message, never> = listen(
  changes.pipe(
    Stream.map((change) => Message.FeedChanged({ change })),
    Stream.catch(() => Stream.make(Message.FeedFailed())),
  ),
)

subscriptions: (state) =>
  state.feed._tag === 'Listening' ? HashMap.make(['feed', feed]) : HashMap.empty()

// update
FeedFailed:   Listening → Failed    // the key goes away: the waiting subscription stops
RetryClicked: Failed → Listening    // the key comes back: a new subscription starts
```

A **defect** in a subscription (an exception, an `Effect.die`) ends the run, like any defect. To recover from
one, handle it at the source with Effect's tools (`Channel.catchDefect`, `Stream.catchCause`).

### 6. Rejections: stale or bug

Every frame's `dispatch` is bound to the state the frame was drawn from. When `update` rejects a message, the
engine looks at where it came from, and asks `update` again with the frame's own state:

| The message came from                             | Meaning                                                     | What happens                            |
| ------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| a frame whose state **accepts** it (a double tap) | the user acted on something already gone                    | ignored                                 |
| a command or a subscription                       | a completion that arrived too late                          | ignored                                 |
| a frame whose state **rejects** it too            | the model offered something `update` rejects: they disagree | a **bug**, handled as `onRejected` says |

A bug is a bug however many messages arrived between the frame and the click: a subscription that ticks
often cannot hide it. It cannot happen when every action goes through `offers`; it remains a check against
mistakes in `makeModel`, such as an offer computed from a different state. The second call to `update` only
happens for a rejected message from the view.

### 7. Composing programs: `embed`

A child program (a page, a dialog, a form) keeps its own state, messages and `update`. `embed` lifts it into
its parent:

- `wrap` turns a child message into a parent message;
- `get` and `set` read and write the child's state inside the parent's state. When `get` returns `None`, the
  child is absent and its messages are rejected;
- `key` namespaces the child's subscription keys;
- `onEvent` handles the child's `events`. A child never acts on its parent: it says what happened, and the
  parent decides. The types require `onEvent` exactly when the child has events.

Here the parent shows a list of names, and opens the form from [Input](#3-input) to add one:

```ts
import {
  embed,
  mapDispatch,
  type Offer,
  offers,
  type Program,
  reject,
  type Update,
  type View,
} from '@fgaudo/effect-tea'
import * as Form from './form.ts'

type State = Readonly<
  { names: ReadonlyArray<string>; form: Opt.Option<Form.State> }
>

type Message = Data.TaggedEnum<{
  AddClicked: {}
  GotForm: { message: Form.Message }
}>
const Message = Data.taggedEnum<Message>()

const form = embed(Form.form, {
  key: 'Form',
  wrap: (message: Form.Message) => Message.GotForm({ message }),
  get: (state: State) => state.form,
  set: (state, child) => ({ ...state, form: Opt.some(child) }),
  // The form was saved: keep the name and close the form.
  onEvent: (event) => (state) => ({
    state: { names: [...state.names, event.name], form: Opt.none() },
  }),
})

const update: Update<State, Message, never> = (message) => (state) => {
  switch (message._tag) {
    case 'AddClicked': {
      if (Opt.isSome(state.form)) return reject
      const { state: child, commands } = form.init(Form.form.init)
      return { state: { ...state, form: Opt.some(child) }, commands }
    }
    case 'GotForm':
      return form.update(message.message)(state)
  }
}

type Model = Readonly<
  {
    names: ReadonlyArray<string>
    add: Offer<Message>
    form: Opt.Option<Form.Model>
  }
>

const app: Program<State, Model, Message, never> = {
  init: { state: { names: [], form: Opt.none() } },
  update,
  subscriptions: form.subscriptions,
  makeModel: (state) => ({
    names: state.names,
    add: offers(update, state).offer(Message.AddClicked()),
    form: Opt.map(state.form, Form.form.makeModel),
  }),
}
```

In the view, `mapDispatch` lets the child's view send through the parent's `dispatch`. Pass it the same
`wrap` given to `embed`: that is what keeps the child's offers valid for the parent.

```ts
const view: View<Model, Message, VNode> = (model, dispatch) =>
  h('main', [
    h('ul', model.names.map((name) => h('li', name))),
    Opt.match(model.form, {
      onNone: () =>
        h('button', { on: onClick(model.add, dispatch) }, 'Add a name'),
      onSome: (form) =>
        Form.view(
          form,
          mapDispatch(
            dispatch,
            (message: Form.Message) => Message.GotForm({ message }),
          ),
        ),
    }),
  ])
```

With several children, merge their subscriptions with `HashMap.union`. The optional `getSubscribed` decides
when the child's subscriptions run, separately from `get`. For example, a page hidden under another one keeps
receiving the completions of its commands, but stops listening to the world.

### 8. Lists of programs: `embedEach`

`embedEach` is `embed` for a collection of children identified by an id, such as the cards of a list. Every
option takes the id too, and `subscribed(state)` lists the `[id, childState]` pairs whose subscriptions run.

```ts
import { embedEach } from '@fgaudo/effect-tea'

type State = Readonly<{ counters: ReadonlyMap<string, number> }>
type Message = Readonly<
  { _tag: 'GotCounter'; id: string; message: Counter.Message }
>

const counters = embedEach(Counter.counter, {
  key: 'Counter',
  wrap: (id: string, message: Counter.Message): Message => ({
    _tag: 'GotCounter',
    id,
    message,
  }),
  get: (state: State, id) => Opt.fromNullishOr(state.counters.get(id)),
  set: (state, id, count) => ({
    counters: new Map([...state.counters, [id, count]]),
  }),
  subscribed: (state) => state.counters.entries(),
})

const update: Update<State, Message, never> = (message) =>
  counters.update(message.id, message.message)
```

It returns `update(id, message)`, `subscriptions`, and `init(id, step)` for the parent's update that adds a
child. Ids are part of the subscription keys, so they must compare by value.

### 9. Running

`run(program, render, options)` starts the program and hands `render` the stream of frames. The run ends
when `render` ends. A snabbdom renderer patches the previous tree with each new frame:

```ts
import { type Frame, run } from '@fgaudo/effect-tea'
import {
  attributesModule,
  eventListenersModule,
  init,
  propsModule,
  type VNode,
} from 'snabbdom'

const patch = init([propsModule, attributesModule, eventListenersModule])

const render = (frames: Stream.Stream<Frame<Model, Message>>) =>
  Stream.runFold(
    frames,
    (): Element | VNode => document.getElementById('app')!,
    (previous, { model, dispatch }) => patch(previous, view(model, dispatch)),
  ).pipe(Effect.asVoid)

const main = run(app, render, {
  onRejected: 'ignore',
  onBug: (bug) => reportToCrashService(bug),
  describeMessage: (message) =>
    message._tag === 'GotForm' ? `Form/${message.message._tag}` : message._tag,
})

Effect.runFork(main)
```

A real renderer usually draws at most once per animation frame (e.g. with a sliding buffer of one frame),
like Elm does. A frame's `model` is made the first time it is read, so the frames a renderer skips cost
nothing; and a message that leaves the very same state (`===`) makes no new frame at all, only runs its
commands.

Options (`RunOptions`):

- **`onRejected`** (required) decides what a `Rejected` bug does. It has no default, because the right
  answer depends on where the app runs:
  - `'die'` fails the run with `RejectedMessage`: the bug cannot go unnoticed, which is what you want while
    developing and testing;
  - `'ignore'` drops the message and goes on, which is safe since the state did not change: the user only
    sees an action that does nothing, instead of a crashed app. `onBug` is then **required**, so the bug
    still reaches you.
- **`onBug(bug)`** is called for every bug, fatal or not, e.g. to send it to a crash-reporting service. A
  `Bug` is one of:
  - `Defect`: something blew up (an exception, an `Effect.die`). Its `cause` is the defect, and `where` is
    `Update`, `Command`, or `Subscription` with its `key`. A defect always ends the run, whatever `onRejected` says: to recover
    from one, handle it where it happens, with Effect's tools.
  - `Rejected`: a frame sent a `message` that `update` rejects in the frame's own state, whose `revision`
    it carries (see [Rejections](#6-rejections-stale-or-bug)).
- **`describeMessage`** says how a message appears in the logs. By default only its `_tag` is logged (or the
  message itself, when it is a string), never its data.

The run fails with the first defect. To show an error screen, handle the failure of `run` itself, e.g. with
`Effect.tapCause`.

The run logs with Effect's logger: `debug` for every message that changes the state or runs commands, and
for subscriptions starting, stopping and ending; `error` for bugs. Lower the minimum log level to see the `debug`
lines.

### 10. Testing

`update` and `makeModel` are pure functions, so most tests need no runtime at all.

```ts
import { isRejected } from '@fgaudo/effect-tea'
import { applyAll } from '@fgaudo/effect-tea/testing'

test('counting', () => {
  expect(applyAll(update)(['Increment', 'Increment', 'Decrement'], 0).state)
    .toBe(1)
  expect(isRejected(update('Decrement')(0))).toBe(true)
})
```

- `applyAll(update)(messages, from)` applies messages in order, and returns the final `state` and all the
  `commands`. A rejection throws, failing the test.
- Assert rejections with `isRejected`, not by comparing states.

The agreement between the view and `update` is worth checking for every state the program can be in. Render
the real view, collect every message it can send, and pass them to `dispatchViolations`:

```ts
import { dispatchViolations } from '@fgaudo/effect-tea/testing'
import * as fc from 'fast-check'

test('the view and update agree', () => {
  const check = dispatchViolations(update, {
    repeatable: (message) => message === 'Increment',
  })
  fc.assert(fc.property(arbitraryState, (state) => {
    expect(check(state, messagesSentBy(view, makeModel(state)))).toEqual([])
  }))
})
```

- `dispatchViolations(update, { repeatable? })(state, messages)` returns a `DispatchViolation` for each
  message that `update` rejects in `state` (`Rejected`: the model offered too much), and for each one that
  acts again when sent twice from the same frame (`ActsTwice`: a double tap would repeat a one-shot action).
  Acting again means a different state (by `Equal`), or commands, or events. Exclude the actions meant to
  repeat, like a "+1", with `repeatable`.
- Collecting the messages depends on the renderer, so it is yours to write: `messagesSentBy` renders the view
  with a `dispatch` that records what it receives, and fires every event handler in the tree.

## API reference

From `@fgaudo/effect-tea`:

| Export                                          | What it is                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Program<State, Model, Message, R, Event?, K?>` | `init`, `update`, `subscriptions`, `makeModel`                                                |
| `Update`, `Transition`, `Step`                  | `(message) => (state) => Step` or `Rejected`; a `Step` is `{ state, commands?, events? }`     |
| `reject`, `Rejected`, `isRejected`              | the rejection `update` returns, and its check                                                 |
| `Command<Message, R>`                           | `Effect<Option<Message>, never, R>`                                                           |
| `attempt`                                       | a command from an effect that may fail: its failure becomes a message                         |
| `Subscription`                                  | a `Channel` of messages that never ends, or ends with one last message; kept by key           |
| `Subscribe`, `Subscriptions`                    | `(state) => HashMap<K, Subscription<Message>>`, reconciled by key                             |
| `offers`                                        | asks `update` what the model may offer: `offer(message)` and `offerInput(toMessage, current)` |
| `Offer`, `InputOffer`, `Offered`, `Offers`      | an optional offered message; an optional function to one; the brand; what `offers` returns    |
| `View`, `Dispatch`, `mapDispatch`               | `(model, dispatch) => Node`; a dispatch of offered messages; a child's dispatch               |
| `embed`, `embedEach`                            | lift a child program, or a collection of them, into a parent                                  |
| `run`, `Frame`, `RunOptions`                    | run a program with a renderer; what the renderer draws; how the program runs                  |
| `RejectionOptions`                              | `onRejected` (`'die'` or `'ignore'`) with the `onBug` it requires                             |
| `Bug`, `BugReporter`, `DefectSource`            | what `onBug` receives; `onBug` itself; where a defect happened                                |
| `RejectedMessage`                               | the defect the run fails with when a rejection is fatal                                       |

From `@fgaudo/effect-tea/testing`: `applyAll`, `dispatchViolations`, `DispatchViolation`.

## Development

`bun run typecheck`, `bun run lint` and `bun run test` check the package. `bun run build` compiles `src/`
into `dist/`; it also runs before `bun pm pack`.
