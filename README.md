# @fgaudo/effect-tea

The Elm architecture (TEA) on [Effect](https://effect.website) v4, for any renderer.

- One **state**, changed only by a pure **`update`**.
- Effects are described, not run: **commands** (one-shot, returned as data) and **subscriptions** (listeners,
  kept by key).
- The view draws a **model**, and can only send the messages the model **offers**.

What it adds to plain Elm is a guarantee that the view and `update` agree. `update` may **reject** a message
that makes no sense in the current state. The model's shape says which actions exist in each state, and
each one it offers is checked against `update` as the model is made: an offer that `update` rejects is a
defect, not a dead button. `dispatch` only takes offered messages, so a view that builds its own does not
compile. And a test can check the other direction, that nothing `update` accepts is missing from the view.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Examples](#examples)
- [Concepts](#concepts): [`update`](#update-and-rejections), [offers](#the-model-offers-the-view-sends),
  [commands](#commands), [subscriptions](#subscriptions), [stale or bug](#rejections-stale-or-bug),
  [composing](#composing-programs), [running](#running), [inputs](#inputs-the-user-types-into),
  [testing](#testing)
- [API reference](#api-reference)

## Installation

`effect` (v4) is a peer dependency. The package ships compiled JavaScript with declarations (`dist/`):
use `moduleResolution` `nodenext` or `bundler`, with the `ESNext` and `DOM` libs that Effect needs.

Under Bun, the `bun` export condition resolves to the TypeScript sources instead. A project that bundles
with `conditions: ['bun']` and type-checks with `customConditions: ["bun"]` never needs to build this
package.

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

// No commands, so no `runCommand`; no subscriptions; no services.
const counter: Program<number, Model, Message> = {
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
    Stream.tap(({ model, dispatch }) =>
      Effect.gen(function*() {
        yield* Effect.log(model.count)
        if (model.count < 3) yield* dispatch(model.increment)
      })
    ),
    Stream.take(4),
    Stream.runDrain,
  ), { onRejected: 'die' })

Effect.runFork(main) // logs 0, 1, 2, 3
```

A program is up to five pieces: `init`, `update`, `runCommand` (exactly when it has commands),
`subscriptions` (when it listens to anything) and `makeModel`. The view is not one of them: `run` hands your
renderer a stream of **frames** (`{ model, dispatch }`), and the renderer draws them however it likes.

## Examples

[`examples/`](examples) holds complete programs, drawn with [snabbdom](https://github.com/snabbdom/snabbdom),
each with its tests. Run one with `bun run build`, then `bun examples/<name>/index.html`: Bun bundles the page
for the browser, so it resolves the package to `dist/`, not to the sources.

| Example                       | What it shows                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| [`counter`](examples/counter) | the quick start with a view; `applyAll`, `dispatchViolations`, `missingOffers`, `drive`       |
| [`form`](examples/form)       | an input the user owns while typing; a service and `attempt`; a save only its completion ends |
| [`pages`](examples/pages)     | two pages with `embed`, events for navigation, `subscribed`, a child's commands; `simulate`   |
| [`list`](examples/list)       | stopwatches with `embedEach`, a subscription per running child; a test with a `TestClock`     |

`examples/snabbdom.ts` is the bridge to the renderer: `renderInto` for `run`, handlers that send an offered
message, `initialValue` for the text a new input starts with, and `messagesSentBy` for the tests.

## Concepts

### `update` and rejections

`update` takes a message, then the state, and returns a `Step` (`{ state, commands?, events? }`), or `reject`
when the message makes no sense in that state.

- **`update` is pure.** It never runs effects: it returns `commands`, data that says what to do, and the
  program's `runCommand` turns them into effects. The library also calls it to decide offers, so it must be
  cheap and free of side effects.
- **Treat state as immutable, including its nested objects.** Do not mutate the current state or anything it
  contains; return a new state when it changes. The library uses state identity to decide whether to publish
  a new frame, and `embed` and `embedEach` keep a child's model while its state object stays the same.
- **Conditions live in `update`.** "Can the user save now?" is answered once, here, by rejecting. The view
  never repeats the check.
- **Name intents, not toggles.** Prefer `MenuOpened`/`MenuClosed` to `MenuToggled`: an intent sent twice (a
  double tap, or a tap on a view that has not caught up yet) does what it did once, while a toggle undoes
  itself.
- **One-shot actions move to a state that rejects them.** After `SaveClicked` the form is saving, and rejects
  a second `SaveClicked`: sent from the same frame, it is ignored as stale, so nothing is saved twice. Actions
  meant to repeat (a "+1") stay accepted.
- **Rejecting a message that would change nothing is a choice, not a rule.** Rejecting it means that the
  model leaves the action out of that state, so the view hides or disables its control.

### The model offers, the view sends

`makeModel(state, offers)` turns the state into what the view shows. Its **shape** says which actions exist:
a union with a case for each state the view distinguishes, each case holding the actions that make sense in
it, as `Offered<Message>` values. The view never asks whether an action is available: it matches the case,
and uses what it finds.

```ts
type Editor = Data.TaggedEnum<{
  Saving: object
  Blank: { changeName: (name: string) => Offered<Message> }
  Named: {
    changeName: (name: string) => Offered<Message>
    save: Offered<Message>
  }
}>
```

`makeModel` picks a case from the state and fills its actions with `offer(message)`, or
`offerInput(toMessage, current)` for typed input. Each offer checks `update` in that state and throws
**`RejectedOffer`** if the model promises an action the state does not allow. Choose the case from the state;
choosing it by probing offers could hide a disagreement with `update`. The library supplies offers for the
program's own `update` and state. `modelOf(program)(state)` makes the same model in tests.

A view is `(model, dispatch) => Node`, and `dispatch` only takes **offered** messages, a brand that only
`offers` creates. Building a message in the view does not compile:

```ts
dispatch({ _tag: 'SaveClicked' }) // error: not an Offered<Message>
```

Sending is an effect, `Effect<void>` with no error and no services: nothing is sent until it runs. A renderer
built on Effect runs it as it is. One whose handlers are plain callbacks, like snabbdom's, wraps it with
`dispatchUnsafe(dispatch)`, which sends at once.

- A model may offer **less** than `update` accepts (e.g. to hide an action), never more: a case simply has
  no field for what it hides. `missingOffers` (see [testing](#testing)) finds what a model leaves out by
  mistake.
- **Input is never a reason to reject.** Store what is typed and make validity model data: for example, offer
  "Save" only for a nonblank name. `offerInput` checks the current value; the offer then holds for any input.
- **Nor is the state.** `update` accepts what is typed into a field in every state where the field exists:
  to disable it (e.g. while saving), the model's case for that state has no input to type into. A key typed
  just before the input was disabled is then stored, instead of staying on screen while the state lacks it
  (see [inputs](#inputs-the-user-types-into)).
- **Cost:** each offer runs `update`. Keep rejection checks cheap, and in long lists offer actions only for
  visible items. Embedded child models are reused while their state object stays the same.

### Commands

A command is **data**: a value of the program's own `Command` type, usually a `Data.TaggedEnum`, that says
what `update` decided to do (`Command.Save({ name })`). The program's `runCommand(command)` is the only place
that knows how it happens: it returns an `Execution<Message, R>`, an `Effect` that produces an optional
message (`None` for effects that only act on the world). A test of `update` can then say what it decided,
`expect(commands).toEqual([Command.Save({ name: 'Ada' })])`, without running anything, and `onApplied` and
the logs see it too.

- Expected failures become messages for `update` to handle; `attempt(effect, { onSuccess, onFailure })` does
  this for effects with an error channel. Defects (`Effect.die` or thrown exceptions) end the run.
- A command contains everything its interpreter needs; `runCommand` receives no state. Its services are
  represented by `R` and provided around `run`. A program with no commands (`Command = never`) needs no
  interpreter.
- Commands cannot be cancelled. Model an operation in progress so only its completion can leave that state;
  give operations ids when multiple instances can overlap. See [`form`](examples/form/form.ts).

### Subscriptions

`subscriptions(state)` returns a `HashMap` from keys to **subscriptions**; a program that listens to nothing
leaves it out. A subscription is an Effect `Channel` of messages that takes no input and cannot fail, and it
**never ends in silence**: either it never ends (its end value is `never`, as for a clock), or it ends with
**one last message**, which `update` receives like the others. A download can send its progress, end with its
file, and be cancelled by dropping its key.

After every change of state, the engine compares the keys, by value:

- a key that **appears** starts its subscription;
- a key that **stays** keeps it running, untouched; one that has ended is **not** started again, since
  `update` has its last message and decides whether to drop the key;
- a key that **disappears** interrupts it, and what it had sent that `update` has not received yet is dropped;
  if the key comes back, it starts anew.

Subscriptions suit ongoing input tied to state, such as the running stopwatches in
[`list`](examples/list/stopwatch.ts). Use a command when a completion must be delivered even after the
program stops listening.

- **From a stream**, decide what its end means. To keep listening after normal completion:
  `Stream.toChannel(stream).pipe(Channel.flattenArray, Channel.concatWith(() => Channel.never))`; use
  `Channel.die` if ending is a bug.
- **Failures** become messages too: retry transient errors at the source (`Stream.retry` with a `Schedule`),
  or end with a message, and let `update` drop the key and bring it back to try again.
- A **defect** ends the run, like any defect.

### Rejections: stale or bug

Every frame's `dispatch` is bound to the state the frame was drawn from. When `update` rejects a message, the
engine looks at where it came from:

| The message came from                             | Meaning                                    | What happens                            |
| ------------------------------------------------- | ------------------------------------------ | --------------------------------------- |
| a frame whose state **accepts** it (a double tap) | the user acted on something already gone   | ignored                                 |
| a command or a subscription                       | a completion that arrived too late         | ignored                                 |
| a frame whose state **rejects** it too            | the view sent a message it was not offered | a **bug**, handled as `onRejected` says |

A bug is a bug however many messages arrived in between: a subscription that ticks often cannot hide it.
Since every offer is checked as the model is made, such a message was forged with a cast, or wrapped by a
`mapDispatch` whose `wrap` differs from the one its child is embedded with.

### Composing programs

Use `embed(child, options)` for one child (a page or dialog), and `embedEach` for children identified by ids
(such as list items):

- `wrap` turns a child's message into the parent's; `get` and `set` read and write the child's state. When
  `get` returns `None` the child is absent, and its messages are rejected.
- `key` namespaces subscription keys; `embedEach` also includes the id, which must compare by value.
  `subscribed` selects which children listen, so a hidden page can still receive command completions without
  listening to the world.
- Children report **events** to the parent; `onEvent` handles them and may return events for the next parent.
  The types require it only when the child emits events. Use tagged constructors (or `as const`) to preserve
  the event union.
- `wrapCommand` maps child commands into parent commands and is required when the child has commands.
  `liftCommands` handles a child's initial commands; the returned `runCommand` delegates child commands and
  wraps their messages. See [`pages`](examples/pages) and [`list`](examples/list).

In the view, `mapDispatch(dispatch, wrap)` lifts the child's dispatch. Use the same `wrap` as `embed` so the
parent accepts the child's offered messages.

Embedded models are reused while the child's state object stays the same. This lets a renderer memoize
unchanged child views (for example, with snabbdom's `thunk`); their frame-bound dispatch remains valid.

### Running

`run(program, render, options)` starts the program and gives the renderer a stream of frames. The run ends
when the renderer ends. A slow renderer gets only the latest frame; a frame's model is made only when read,
and a message that returns the same state (`===`) makes no frame. `RunOptions`:

- **`onRejected`** (required): what a [bug rejection](#rejections-stale-or-bug) does. `'die'` fails the run
  with `RejectedMessage`, which is what you want while developing. A function drops the message and goes on,
  safe since the state did not change, and reports the `Rejection` (the message and the frame's revision),
  e.g. to a crash-reporting service: a rejection cannot be ignored without being reported.
- **`describeMessage`** and **`describeCommand`** say how a message and a command appear in the logs: by
  default only their `_tag`, never their data.
- **`onApplied(applied)`** hears every accepted message, with the states before and after it and the commands
  it started, before its frame is drawn: for devtools, session recordings or analytics. Keep it quick.

A **defect** in the program or renderer ends the run and reaches its caller. In a browser, use
`BrowserRuntime.runMain` from `@effect/platform-browser` so failures are reported, and add crash reporting
with `Effect.tapCause`:

```ts
BrowserRuntime.runMain(run(app, render, options).pipe(Effect.tapCause((cause) => reportCrash(cause))))
```

The cause arrives after the run stops its commands and subscriptions. Plain renderer callbacks, such as DOM
event handlers, run outside Effect; thrown errors go to the browser's error handler. The engine logs
message-loop and subscription activity at `debug`, and bugs at `error`.

### Inputs the user types into

A frame may be older than the user's latest keystroke. Rewriting an input from every frame can erase typed
text or move the caret, so let either the user or the program own the input value at a time:

- **While the user types, the input owns its text.** The view writes it only when the input is created, and
  the program learns it from the input's messages, which `update` always accepts.
- **When the program replaces the text** (e.g. empties the form after a save), it changes the input's key, so
  that the renderer creates a new input with the new text. The key is a revision in the state, which grows
  only when the program replaces the text.

[`examples/field.ts`](examples/field.ts) models this with `Field.typed` and `Field.replace`; the latter raises
a revision so the renderer creates a new input. `initialValue` in [`examples/snabbdom.ts`](examples/snabbdom.ts)
writes only when creating that input. [`form`](examples/form) shows both; React Native uses `defaultValue`
and `key` for the same pattern.

If the program normalizes typed text, the change appears only when the input is recreated. Prefer input
attributes such as `maxlength` and `inputmode`, or show validation feedback instead. Recreating an input
does not preserve focus.

### Testing

Most tests can exercise pure `update` and `makeModel` without a runtime. Choose a tool by what the test should
cover:

| Tool                                                       | Runs                                               | For                                           |
| ---------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------- |
| `applyAll(update)(messages, from)`                         | `update` only; returns the state, commands, events | the rules, message by message                 |
| `dispatchViolations(update, { repeatable? })(state, msgs)` | `update`, on what the real view can send           | the view and `update` agree, in any state     |
| `missingOffers(update, { withheld? })(state, sent, all)`   | `update`, on what a user could ask for             | nothing `update` accepts is missing           |
| `simulate(program)(messages, from)`                        | `update` and the commands, each completing at once | a flow with its services, without a runtime   |
| `drive(program, scenario, options?)`                       | the program with `run`, subscriptions included     | a user's scenario, as the program really runs |

- Use `applyAll` to test transitions and assert returned commands/events. A rejected test message fails; check
  an expected rejection with `isRejected(update(message)(state))`.
- Use `simulate` to test a flow including command interpretation, without a runtime. Commands complete in
  order; rejected command messages are listed in `ignored` as stale. Assert that list when a dropped
  completion would indicate a bug.
- Use `dispatchViolations` and `missingOffers` to compare the view's actions with what `update` accepts.
  `dispatchViolations` catches rejected or repeated actions; `missingOffers` catches actions the model leaves
  out. Supply the messages the renderer can send (see `messagesSentBy` in `examples/snabbdom.ts`).
- Use `modelOf(program)(state)` to validate offers in arbitrary states. Use `drive` for scenarios that need
  the real runtime and subscriptions: `waitFor` and `send` act through displayed frames, and a rejection is
  fatal. Its waits use the real clock and fail after `patience` (2 seconds).

## API reference

From `@fgaudo/effect-tea`:

| Export                                                 | What it is                                                                                |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `Program<State, Model, Message, Command, R, Event, K>` | `init`, `update`, `runCommand` (with commands), `subscriptions` (optional), `makeModel`   |
| `Update`, `Transition`, `Step`                         | `(message) => (state) => Step` or `Rejected`; a `Step` is `{ state, commands?, events? }` |
| `reject`, `Rejected`, `isRejected`                     | the rejection `update` returns, and its check                                             |
| `Execution<Message, R>`, `RunCommand`                  | `Effect<Option<Message>, never, R>`, how a command happens; `(command) => Execution`      |
| `attempt`                                              | an execution from an effect that may fail: its failure becomes a message                  |
| `Subscription`                                         | a `Channel` of messages that never ends, or ends with one last message; kept by key       |
| `Subscriptions`                                        | `(state) => HashMap<K, Subscription<Message>>`, reconciled by key                         |
| `modelOf`                                              | a program's model in a state, as `run` makes it                                           |
| `Offers`                                               | what `makeModel` receives: `offer(message)` and `offerInput(toMessage, current)`          |
| `Offered`                                              | a message `update` accepts in the model's state, the only kind `dispatch` takes           |
| `RejectedOffer`                                        | the defect `makeModel` throws when it offers a message `update` rejects                   |
| `View`, `Dispatch`, `mapDispatch`                      | `(model, dispatch) => Node`; a dispatch of offered messages; a child's dispatch           |
| `dispatchUnsafe`                                       | a dispatch that sends at once, for a renderer's plain callbacks                           |
| `embed`, `embedEach`                                   | lift a child program, or a collection of them, into a parent                              |
| `run`, `Frame`, `RunOptions`                           | run a program with a renderer; what the renderer draws; how the program runs              |
| `Applied`                                              | what `onApplied` hears: a message, the states around it, its revision and commands        |
| `OnRejected`, `Rejection`                              | `'die'`, or a function reporting a `Rejection`: a message and the revision of its frame   |
| `RejectedMessage`                                      | the defect the run fails with when a rejection is fatal                                   |

From `@fgaudo/effect-tea/testing`: `applyAll`, `simulate`, `Simulation`, `drive`, `DriveOptions`, `Driver`,
`Action`, `tap`, `input`, `dispatchViolations`, `DispatchViolation`, `missingOffers`.

## Development

`bun run typecheck`, `bun run lint` and `bun run test` check the package and the examples. `bun run build`
compiles `src/` into `dist/`; it also runs before `bun pm pack`. What changed in each version is in
[`CHANGELOG.md`](CHANGELOG.md).

## License

[MIT](LICENSE) © Francesco Gaudenzi
