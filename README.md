# @fgaudo/effect-tea

The Elm architecture on [Effect](https://effect.website) v4, for any renderer.

[Documentation](https://fgaudo.github.io/effect-tea/): this guide, the API in full and the examples running in
the browser.

You keep one **state**. A pure **`update`** changes it in response to messages. Effects are described as
data (**commands**) or listened to (**subscriptions**), never run inside `update`. The view draws a
**model** and sends the actions the model **offers**.

What it adds to plain Elm:

- **The view and `update` cannot disagree.** `update` may **reject** a message that makes no sense in the
  current state. The model only contains the actions `update` accepts, each checked as the model is made, so
  there are no dead buttons. The view cannot build messages of its own: that does not compile.
- **Double taps are harmless.** A click on an action that the state has meanwhile left behind is ignored: a
  save that moves the form to "saving" runs once, however fast the user taps.
- **Composition is declared, not wired.** A parent says where each child lives in its state, and the library
  routes the children's messages, commands, subscriptions and models.
- **Views are cheap to memoize.** One `dispatch` serves the whole program, every frame and every child.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Examples](#examples)
- [Guide](#guide): [`update`](#update), [the model](#the-model-and-its-offers), [commands](#commands),
  [subscriptions](#subscriptions), [rejections](#when-update-rejects), [composing](#composing-programs),
  [running](#running), [inputs](#inputs-the-user-types-into), [guarantees](#guarantees), [testing](#testing)
- [API reference](#api-reference)

## Installation

```sh
bun add @fgaudo/effect-tea effect
```

`effect` (v4) is a peer dependency. The package ships JavaScript with declarations: use `moduleResolution`
`nodenext` or `bundler`. Under Bun, the `bun` export condition loads the TypeScript sources instead.

## Quick start

A counter that cannot go below zero. The "renderer" here only logs, and clicks "increment" until the count
reaches 3; [`examples/counter`](examples/counter) draws the same program with snabbdom.

```ts
import {
  type Offered,
  type Program,
  reject,
  run,
  type Update,
} from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'

type Message = 'Increment' | 'Decrement'

const update: Update<number, Message> = (message) => (count) =>
  message === 'Increment'
    ? { state: count + 1 }
    : count > 0
    ? { state: count - 1 }
    : reject // nothing to decrement

// At zero there is no `decrement`: the model's shape says so.
type Model =
  | Readonly<{ _tag: 'AtZero'; count: number; increment: Offered<Message> }>
  | Readonly<{
    _tag: 'Counting'
    count: number
    increment: Offered<Message>
    decrement: Offered<Message>
  }>

const counter: Program<{ state: number; model: Model; message: Message }> = {
  init: { state: 0 },
  update,
  // Each `offer` asks `update`: offering `Decrement` at zero would throw.
  makeModel: (count, { offer }) =>
    count > 0
      ? {
        _tag: 'Counting',
        count,
        increment: offer('Increment'),
        decrement: offer('Decrement'),
      }
      : { _tag: 'AtZero', count, increment: offer('Increment') },
}

const main = run(counter, (frames) =>
  frames.pipe(
    Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
      yield* Effect.log(model.count)
      if (model.count < 3) yield* dispatch(model.increment)
    })),
    Stream.take(4),
    Stream.runDrain,
  ), { onRejectedInput: 'die' })

Effect.runFork(main) // logs 0, 1, 2, 3
```

A program is a plain object with up to five pieces:

| Piece           | What it does                                                         | Needed               |
| --------------- | -------------------------------------------------------------------- | -------------------- |
| `init`          | the first state, and the commands to start with                      | always               |
| `update`        | `(message) => (state) =>` the next state and commands, or `reject`   | always               |
| `makeModel`     | `(state, offers) =>` what the view draws, with the actions it offers | always               |
| `runCommand`    | how each command happens, as an Effect                               | when it has commands |
| `subscriptions` | what it listens to in each state                                     | when it listens      |

Its type names its types: `Program<{ state; model; message }>`, plus `command`, `services`, `event` and
`external` when it has them. The view is not part of it: `run` hands your renderer a stream of **frames**
(`{ model, dispatch }`) to draw however it likes.

## Examples

[`examples/`](examples) holds complete programs, drawn with [snabbdom](https://github.com/snabbdom/snabbdom),
each with its tests. Try one in the browser, or run it with `bun run build`, then
`bun examples/<name>/index.html`.

| Example                       | What it shows                                                                                             | Try it                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`counter`](examples/counter) | the quick start with a view; `applyAll`, `dispatchViolations`, `missingOffers`, `drive`                   | [live](https://fgaudo.github.io/effect-tea/examples/counter/) |
| [`form`](examples/form)       | an input the user owns while typing; a service and `attempt`; a save only its completion ends; `rehearse` | [live](https://fgaudo.github.io/effect-tea/examples/form/)    |
| [`pages`](examples/pages)     | two pages with `parent`, events for navigation, `subscribed`, a child's commands; `simulate`              | [live](https://fgaudo.github.io/effect-tea/examples/pages/)   |
| [`list`](examples/list)       | stopwatches by id with `each`, a subscription per running child; a test with a `TestClock`                | [live](https://fgaudo.github.io/effect-tea/examples/list/)    |

[`examples/snabbdom.ts`](examples/snabbdom.ts) is the small bridge to the renderer, worth copying for your
own: `renderInto` for `run`, click and input handlers, and `messagesSentBy` for tests.
[`examples/snabbdom.test.ts`](examples/snabbdom.test.ts) runs it in a DOM, with
[happy-dom](https://github.com/capricorn86/happy-dom): it checks how often it draws, and that what the user
types survives the frames drawn meanwhile.

## Guide

### `update`

`update` takes a message, then the state, and returns `{ state, commands?, events? }`, or `reject` when the
message makes no sense in that state.

- **Keep it pure.** It returns commands instead of running effects. The library also calls it to check
  offers, so keep it cheap.
- **Never mutate the state**, nested objects included: return a new one. A message that returns the very same
  state draws no new frame.
- **Conditions live here.** "Can the user save now?" is answered once, by rejecting. The view never repeats
  the check.
- **Name intents, not toggles.** `MenuOpened` and `MenuClosed`, not `MenuToggled`: an intent sent twice does
  what it did once; a toggle undoes itself.
- **One-shot actions move to a state that rejects them.** After `SaveClicked` the form is saving and rejects
  a second `SaveClicked`, so a double click saves once.

### The model and its offers

`makeModel(state, { offer, offerInput })` turns the state into what the view shows. Its **shape** says which
actions exist: a case for each state the view tells apart, each holding only the actions that make sense in
it.

```ts
type Editor = Data.TaggedEnum<{
  Saving: object
  Blank: { changeName: (name: string) => Offered<Message> }
  Named: {
    changeName: (name: string) => Offered<Message>
    save: Offered<Message>
  }
}>

const makeModel = (
  state: State,
  { offer, offerInput }: Offers<Message>,
): Editor => {
  const changeName = offerInput(
    (name: string) => Message.NameChanged({ name }),
    state.name,
  )
  return state.isSaving
    ? { _tag: 'Saving' }
    : isBlank(state.name)
    ? { _tag: 'Blank', changeName }
    : { _tag: 'Named', changeName, save: offer(Message.SaveClicked()) }
}
```

- `offer(message)` makes an action. `offerInput(toMessage, current)` makes a function from what the user types
  or picks to an action: the view calls it with each value.
- Each offer asks `update`; an `offerInput` asks with `current`, and later with each value. Offering something
  it rejects throws **`RejectedOffer`** at once: a bug in the model, found the first time it is drawn rather
  than as a button that does nothing.
- Pick the case from the state. Never pick it by trying offers: that would hide the disagreement.
- A model may offer **less** than `update` accepts, never more.
- Each check is a call to `update`: in a long list, offer actions only for the rows in sight.

A view is `(model, dispatch) => Node`. `dispatch` only takes offers, so a hand-built message does not compile:

```ts
dispatch({ _tag: 'SaveClicked' }) // error: not an Offered
```

Sending returns an `Effect<void>`. A renderer whose handlers are plain callbacks, like snabbdom's, wraps the
dispatch with `dispatchUnsafe(dispatch)` to send at once.

**Input is never a reason to reject.** Store what is typed, and make its validity model data: offer "Save" only
for a name that is not blank. A typed value that `update` rejects is a [bug](#when-update-rejects).

### Commands

A command is **data** that says what `update` decided, usually a `Data.TaggedEnum`: `Command.Save({ name })`.
The program's `runCommand` turns it into an Effect that may produce one message back. Tests can then assert
the decision without running it:

```ts
expect(commands).toEqual([Command.Save({ name: 'Ada' })])
```

- `attempt(effect, { onSuccess, onFailure })` turns an effect that can fail into one that answers with a
  message either way. A defect (`Effect.die`, a thrown error) ends the run. Given the handlers alone,
  `attempt({ onSuccess, onFailure })` is the step to put at the end of a `pipe` or an `Effect.fn`:

  ```ts
  const save = Effect.fn('Save')(
    function*(name: string) {
      const storage = yield* Storage
      yield* storage.save(name)
    },
    attempt({
      onSuccess: () => Message.Saved(),
      onFailure: () => Message.SaveFailed(),
    }),
  )
  ```
- A command carries everything it needs: `runCommand` does not see the state. Its services are provided
  around `run`.
- **A command has a scope of its own.** What it acquires (`Effect.acquireRelease`, `Effect.forkScoped`) is
  released when it ends, before its message reaches `update`, so `run` never asks for a `Scope`. What must
  outlive a command is a service provided around `run`, or a subscription.
- **Commands cannot be cancelled.** Once started, a command runs to its end and its message arrives, even if
  the state has moved on: `update` then decides whether the answer still applies. Model the operation as a
  state that only its completion leaves, as [`form`](examples/form/form.ts) does. This keeps commands plain
  data, and a save is never cut in half.
- **Work that should stop is a subscription.** A download, or a search while the user types, can be one: keep
  its key in the state while the work is wanted. When the key goes away (the user cancels, or leaves the
  page) the subscription is interrupted, and what it holds is released. Its last message says it finished.

### Subscriptions

`subscriptions(state)` returns a `HashMap` of **subscriptions** by key: Effect `Channel`s of messages. After
every change of state the keys are compared by value. A new key starts its subscription; a kept key leaves it
running; a missing key stops it, and drops what it sent that `update` has not seen.

A subscription never ends in silence: either it never ends (a clock), or it ends with **one last message**.
An ended subscription is not restarted until its key goes away and comes back.

| Use a…           | for                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **subscription** | input tied to a state (a clock while a page is open, a scroll), or work that stops when the state no longer wants it (a download) |
| **command**      | a one-off effect whose answer must arrive even if the state has moved on                                                          |

To listen to a `Stream` that may complete, keep listening after its end:
`Stream.toChannel(stream).pipe(Channel.flattenArray, Channel.concatWith(() => Channel.never))`.

### When `update` rejects

A rejection is either stale or a bug. A stale one is normal: the state has moved on since the message was
sent, so it no longer applies. A bug means that the model and `update` disagree. The library tells them apart
by where the message came from:

| The message came from                                                             | What happens                                 |
| --------------------------------------------------------------------------------- | -------------------------------------------- |
| an offer the state has moved past (e.g. a double tap)                             | stale: ignored                               |
| a command or a subscription that arrived too late                                 | stale: ignored                               |
| a value typed into an `offerInput`, already rejected by the state that offered it | a **bug**: handled as `onRejectedInput` says |

A typed value rejected only when it arrives is stale: the state moved on while the user typed. An offer made by
another run (e.g. a model made with `modelOf`) is a defect whatever `update` says: it was not checked
against this run's state.

A defect (an `Effect.die`, a thrown error) is broken code, and the run ends. A rejected input is a condition
the code did not expect: the state did not change, so the program can go on, and it is the one bug that tests,
which only sample what users type, can miss. That is why only it is configurable.

### Composing programs

A child is any program. A parent declares its children with `parent`, and the library does the routing:

```ts
const { child, compose } = parent<{ state: State }>()

export const app = compose({
  init: { state: { clock: Clock.clock.init.state, maybeAbout: Opt.none() } },
  children: {
    Clock: child(Clock.clock, {
      get: (state) => Opt.some(state.clock),
      set: (state, clock) => ({ ...state, clock }),
      // Hidden under About, the clock keeps its state but stops ticking.
      subscribed: (state) =>
        Opt.isNone(state.maybeAbout) ? Opt.some(state.clock) : Opt.none(),
    }),
    About: child(About.about, {
      get: (state) => state.maybeAbout,
      set: (state, about) => ({ ...state, maybeAbout: Opt.some(about) }),
    }),
  },
  onEvent: {
    Clock: (_, children) => (state) => {
      const about = children.About.init
      return {
        state: { ...state, maybeAbout: Opt.some(about.state) },
        commands: about.commands,
      }
    },
    About: () => (state) => ({ state: { ...state, maybeAbout: Opt.none() } }),
  },
  // Only the page on top is drawn.
  makeModel: (state, { children }) =>
    Opt.isNone(state.maybeAbout)
      ? { _tag: 'Clock' as const, model: children.Clock(state) }
      : { _tag: 'About' as const, model: children.About(state) },
})
```

What the parent writes:

- **Where each child lives:** `get` and `set`. When `get` returns `None` the child is not there. `subscribed`
  says when its subscriptions run (by default, whenever it is there).
- **What its events mean:** `onEvent`, one handler per child that has events. A child raises an event to ask
  its parent for something, like leaving the page.
- **Its own messages, commands and subscriptions,** if it has any: `update`, `runCommand`, `subscriptions`.

What the library gives it:

- **`children` in `makeModel`:** `children.About(state)` is the child's model, with its own offers. It is
  reused from one frame to the next while the child's state is the same object, so a renderer can skip
  redrawing it (see `thunk` in [`pages`](examples/pages/view.ts)). Only the models of the last two frames are
  kept.
- **`children` in `update` and `onEvent`:** `init` starts a child, and `update` gives it one of the messages
  its type declares as `external` (e.g. a back button).
- **The parent's types:** its messages are its own plus `{ _tag: <child>, message }` for each child.
  `MessageOf<typeof app>` names them.
- **The parent's subscriptions:** its own, plus each child's under `[<child>, key]` (`[<child>, id, key]` for
  children by id): `HashMap.has(subscriptionsOf(app)(state), ['Clock', 'ticks'])` tells a test whether the Clock
  ticks.

For children by id, such as the rows of a list, use `each` instead of `child`: `get` and `set` take the id,
`subscribed` lists the rows that listen, and `children.Row(state, id)` is a row's model. See
[`list`](examples/list/list.ts).

Mind ids that come back. A command's answer goes to the id it was started for, to whichever row has that id
when it arrives. If a row is removed and another is added with its id, the new row may get the old row's
answer. Use ids that are never reused, or put in the message which row it is for, so that the new row's
`update` rejects the old answer. Subscriptions do not need this: a row that is removed stops them.

### Running

`run(program, render, options)` starts the program and hands `render` a stream of frames. The run ends when
the renderer ends. A renderer slower than the program only gets the latest frame, so a renderer that waits
for the next animation frame before taking another draws at most once per screen refresh, as
[`examples/snabbdom.ts`](examples/snabbdom.ts) does. Options:

- **`onRejectedInput`** (required): `'die'` fails the run with `RejectedInput`, what you want while developing.
  A function reports the rejection (e.g. to a crash-reporting service) and the program goes on.
- **`describeMessage`**, **`describeCommand`**: how messages and commands appear in the logs. By default only
  their tags, never their data: `Home › Products › Deleted`.
- **`onApplied`**: hears every accepted message with the state before and after it, for devtools or session
  recording.

A defect anywhere ends the run, which fails with it. In a browser, start it with `BrowserRuntime.runMain`
from `@effect/platform-browser`, and report crashes around it:

```ts
BrowserRuntime.runMain(
  run(app, render, options).pipe(
    Effect.tapCause((cause) => reportCrash(cause)),
  ),
)
```

### Inputs the user types into

A frame may be older than the user's last keystroke, so rewriting an input from every frame can eat what was
just typed. Let one side own the text at a time:

- **While the user types, the input owns it.** The view writes the text only when the input is created; the
  program learns it from the input's messages, which `update` accepts in every state where the input exists.
- **When the program replaces it** (e.g. clears the form after saving), it changes the input's `key`, so that
  the renderer creates a new input with the new text.

[`examples/field.ts`](examples/field.ts) packages this, and [`form`](examples/form) uses it. React Native
does the same with `defaultValue` and `key`.

### Guarantees

What you can rely on:

- **No dead buttons.** Each offer is checked against `update` when the model is made. Offering something it
  rejects throws `RejectedOffer` the first time that model is drawn.
- **Outdated clicks are harmless.** An offer the state has moved past is ignored, however many messages came
  in between. Of the rejected messages, only a typed value is a bug.
- **Subscriptions follow their keys.** A subscription runs exactly while its key is in the state. When the key
  goes away, it is interrupted and releases what it holds, and nothing it sent reaches `update` afterwards,
  even if the same key comes back later.
- **Nothing outlives what acquired it.** Each command, each subscription and the renderer has a scope of its
  own: what it acquires is released when it ends or, when the run ends, once it has been interrupted, never
  while it still runs. A subscription's release delays the next message, so keep it quick.
- **Logs do not pile up in a span.** What the run's fibers log is not kept by the span of whoever runs it
  (Effect keeps each log as an event of the current span until the span ends); that span is still the parent
  of the spans that commands and subscriptions open.
- **Nothing ends in silence.** A subscription that ends sends one last message. A defect anywhere ends the
  run, which fails with it.
- **Frames cost only what is drawn.** A message that returns the very same state draws no new frame, and a
  model is made only for the frames the renderer reads.

What is left to you:

- **Commands run to their end**, and their answer goes where it is addressed, even if the state has moved on.
  `update` decides whether it still applies (see [commands](#commands), and ids that come back in
  [composing](#composing-programs)).
- **A slow renderer skips frames**: it gets only the latest one.
- **`update` and `makeModel` are pure, and states are never mutated.** The library calls `update` to check
  offers, and reuses a child's model from one frame to the next while its state is the same object.

The library's tests check each guarantee. [`src/interleaving.test.ts`](src/interleaving.test.ts) checks
them under random orders of clicks, command answers and subscription messages.

### Testing

Most of a program is pure, so most tests need no runtime. From `@fgaudo/effect-tea/testing`:

| Tool                 | Use it to test                                                                |
| -------------------- | ----------------------------------------------------------------------------- |
| `applyAll`           | `update`'s rules: apply messages, check the state, commands and events        |
| `dispatchViolations` | that everything the view sends is accepted, and a double tap acts once        |
| `missingOffers`      | that nothing `update` accepts is missing from the view                        |
| `simulate`           | a flow with its commands answered at once, without a runtime                  |
| `rehearse`           | a user's scenario without a runtime, the test deciding when each command runs |
| `drive`              | a user's scenario on the running program, subscriptions included              |

```ts
test('counts up and down', () => {
  expect(applyAll(update)(['Increment', 'Increment', 'Decrement'], 0).state)
    .toBe(1)
})

// For any count, the real view and `update` agree both ways.
test('the view sends what update accepts, all of it', () => {
  fc.assert(fc.property(fc.nat(1_000), (count) => {
    const sent = messagesSentBy<Model, Message>(view, modelOf(counter)(count))
    expect(dispatchViolations(update, { repeatable: () => true })(count, sent))
      .toEqual([])
    expect(missingOffers(update)(count, sent, ['Increment', 'Decrement']))
      .toEqual([])
  }))
})
```

- `modelOf(program)(state)` makes a model outside `run`, so a property test can check its offers in any
  state, and `subscriptionsOf(program)(state)` says what it listens to there. `messageOf(offered)` reads the
  message an offer sends.
- `messagesSentBy` is not in the package: it comes from the example bridge
  ([`examples/snabbdom.ts`](examples/snabbdom.ts)), which renders the view and fires every handler. A
  renderer of your own needs one like it.
- `missingOffers` tries the `candidates` the test lists (what a user could ask for, with the text typed into
  each input) and returns those `update` accepts but the view does not send. `withheld` excludes what the
  model leaves out on purpose, e.g. typing while a save is in progress.
- `simulate` fails when `update` rejects one of the messages it is given. The command answers that `update`
  rejected are listed in `ignored`: assert it when one being dropped would be a bug.
- `rehearse` acts only through what the current model offers, as `drive` does, but nothing runs by itself:
  each command waits until the test runs it (`run`, `runAll`), through the program's `runCommand` with the
  services provided, and a subscription's message is one the test says was heard (`hear`), only while its key is
  in the state. So a test says what the user does while a save is under way, and when its answer arrives:

  ```ts
  rehearse(
    form,
    Effect.fnUntraced(function*(rehearsal) {
      yield* rehearsal.send(({ editor }) =>
        editor._tag === 'Saving'
          ? Opt.none()
          : Opt.some(input(editor.changeName, 'Ada'))
      )
      yield* rehearsal.send(({ editor }) =>
        editor._tag === 'Named' ? Opt.some(tap(editor.save)) : Opt.none()
      )
      expect((yield* rehearsal.model).editor._tag).toBe('Saving')
      yield* rehearsal.run((command) => command._tag === 'Save')
    }),
  )
  ```

  Rejections are judged as when the program runs, and the stale ones are listed in `ignored`. It fails when the
  model does not offer what the test sends, and when a command is still pending at the end: its answer would
  still arrive.
- `drive` acts only through what the frames offer, and fails on a rejected input or a wait longer than
  `patience` (2 seconds). Its commands run as soon as they start: to hold one, give the program a service of the
  test's that waits on a `Deferred` the scenario completes.

## API reference

Each export is documented in full in the [documentation](https://fgaudo.github.io/effect-tea/). From
`@fgaudo/effect-tea`:

| Export                                            | What it is                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Program<{ state; model; message; command?; … }>` | `init`, `update`, `runCommand` (with commands), `subscriptions` (optional), `makeModel`       |
| `StateOf`, `ModelOf`, `MessageOf`, `CommandOf`, … | a program's types, read back from it (`EventOf`, `ExternalOf`, `ServicesOf` too)              |
| `parent`                                          | `parent<{ state; … }>()`: `child`, `each` and `compose`, to make a parent of children         |
| `Update`, `Transition`, `Step`                    | `(message) => (state) => Step` or `Rejected`; a `Step` is `{ state, commands?, events? }`     |
| `reject`, `Rejected`, `isRejected`                | the rejection `update` returns, and its check                                                 |
| `Execution<Message, R>`, `RunCommand`             | `Effect<Option<Message>, never, R>`, how a command happens; `(command) => Execution`          |
| `attempt`                                         | an execution from an effect that may fail: its failure becomes a message; also data-last      |
| `Subscription`                                    | a `Channel` of messages that never ends, or ends with one last message; kept by key           |
| `Subscriptions`                                   | `(state) => HashMap<K, Subscription<Message>>`, reconciled by key                             |
| `modelOf`                                         | a program's model in a state, as `run` makes it, with offers no run applies                   |
| `subscriptionsOf`                                 | what a program listens to in a state, by key, as `run` reconciles it                          |
| `Offers`                                          | what `makeModel` receives: `offer(message)` and `offerInput(toMessage, current)`              |
| `Offered`                                         | an action `update` accepts in the model's state, the only kind `dispatch` takes               |
| `RejectedOffer`                                   | the defect `makeModel` throws when it offers a message `update` rejects                       |
| `View`, `Dispatch`                                | `(model, dispatch) => Node`; the run's one dispatch, for offers of any level                  |
| `dispatchUnsafe`                                  | a dispatch that sends at once, for a renderer's plain callbacks                               |
| `run`, `Frame`, `RunOptions`                      | run a program with a renderer; what the renderer draws; how the program runs                  |
| `Applied`                                         | what `onApplied` hears: a message, the states around it, its revision and commands            |
| `OnRejectedInput`, `InputRejection`               | `'die'`, or a function reporting an `InputRejection`: a message and the revision of its offer |
| `RejectedInput`                                   | the defect the run fails with when a rejected input is fatal                                  |

From `@fgaudo/effect-tea/testing`: `messageOf`, `applyAll`, `simulate`, `Simulation`, `rehearse`, `Rehearsal`,
`RehearseOptions`, `drive`, `DriveOptions`, `Driver`, `Action`, `tap`, `input`, `dispatchViolations`,
`DispatchViolation`, `missingOffers`.

## Development

`bun run typecheck`, `bun run lint` and `bun run test` check the package and the examples; `bun run build`
compiles it. `bun install` and `bun run build` in [`site/`](site) build the documentation site into `site/dist/`.
Changes are in [`CHANGELOG.md`](CHANGELOG.md); rules for contributors and coding agents are in
[`AGENTS.md`](AGENTS.md).

## License

[MIT](LICENSE) © Francesco Gaudenzi
