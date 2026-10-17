# @fgaudo/effect-tea

The Elm architecture (TEA) on [Effect](https://effect.website) v4, for any renderer.

- One **state**, changed only by a pure **`update`**.
- Effects are described, not run: **commands** (one-shot, returned as data) and **subscriptions** (listeners,
  kept by key).
- The view draws a **model**, and can only send the messages the model **offers**.

What it adds to plain Elm is a guarantee that the view and `update` agree. `update` may **reject** a message
that makes no sense in the current state. The model offers an action only if `update` would accept it, and
`dispatch` only takes offered messages. A view that sends something `update` does not accept is therefore
a compile error, not a silent bug.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Examples](#examples)
- [Concepts](#concepts): [`update`](#update-and-rejections), [offers](#the-model-offers-the-view-sends),
  [commands](#commands), [subscriptions](#subscriptions), [stale or bug](#rejections-stale-or-bug),
  [composing](#composing-programs), [running](#running), [testing](#testing)
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
  type Offer,
  type Program,
  reject,
  run,
  type Update,
} from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import { absurd } from 'effect/Function'
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

// No commands (`never`), and no services.
const counter: Program<number, Model, Message, never, never> = {
  init: { state: 0 },
  update,
  runCommand: absurd,
  subscriptions: () => HashMap.empty(),
  // `decrement` is `None` at 0: update would reject it.
  makeModel: (count, { offer }) => ({
    count,
    increment: offer('Increment'),
    decrement: offer('Decrement'),
  }),
}

const main = run(counter, (frames) =>
  frames.pipe(
    Stream.tap(({ model, dispatch }) =>
      Effect.gen(function*() {
        yield* Effect.log(model.count)
        if (model.count < 3 && Opt.isSome(model.increment)) {
          yield* dispatch(model.increment.value)
        }
      })
    ),
    Stream.take(4),
    Stream.runDrain,
  ), { onRejected: 'die' })

Effect.runFork(main) // logs 0, 1, 2, 3
```

A program is five pieces: `init`, `update`, `runCommand`, `subscriptions` and `makeModel`. The view is not
one of them:
`run` hands your renderer a stream of **frames** (`{ model, dispatch }`), and the renderer draws them however
it likes.

## Examples

[`examples/`](examples) holds complete programs, drawn with [snabbdom](https://github.com/snabbdom/snabbdom),
each with its tests. Run one with `bun examples/<name>/index.html`.

| Example                       | What it shows                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| [`counter`](examples/counter) | the quick start with a view; `applyAll`, `dispatchViolations`, `drive`                              |
| [`form`](examples/form)       | input, a command and its interpreter, with a service and `attempt`; a save only its completion ends |
| [`pages`](examples/pages)     | two pages with `embed`, events for navigation, `getSubscribed`, a child's commands; `simulate`      |
| [`list`](examples/list)       | stopwatches with `embedEach`, a subscription per running child; a test with a `TestClock`           |

`examples/snabbdom.ts` is the bridge to the renderer: `renderInto` for `run`, handlers that exist only while
their action is offered, and `messagesSentBy` for the tests.

## Concepts

### `update` and rejections

`update` takes a message, then the state, and returns a `Step` (`{ state, commands?, events? }`), or `reject`
when the message makes no sense in that state.

- **`update` is pure.** It never runs effects: it returns `commands`, data that says what to do, and the
  program's `runCommand` turns them into effects. The library also calls it to decide offers, so it must be
  cheap and free of side effects.
- **Conditions live in `update`.** "Can the user save now?" is answered once, here, by rejecting. The view
  never repeats the check.
- **Name intents, not toggles.** Prefer `MenuOpened`/`MenuClosed` to `MenuToggled`: an intent sent twice (a
  double tap, or a tap on a view that has not caught up yet) does what it did once, while a toggle undoes
  itself.
- **One-shot actions move to a state that rejects them.** After `SaveClicked` the form is saving, and rejects
  a second `SaveClicked`: sent from the same frame, it is ignored as stale, so nothing is saved twice. Actions
  meant to repeat (a "+1") stay accepted.
- **Rejecting a message that would change nothing is a choice, not a rule.** Rejecting makes the model stop
  offering it, so the view can hide or disable the control.

### The model offers, the view sends

`makeModel(state, offers)` turns the state into what the view shows. Every action is an `Offer<Message>`: an
`Option` that is `Some` exactly when `update` accepts the message in this state. `offers` asks `update` for
you, with `offer(message)`, and with `offerInput(toMessage, current)` for a message that carries what the
user types (an `InputOffer`). The library makes `offers` from the program's own `update` and the very state
it passes, so a model cannot ask the wrong `update`, or about another state. Outside the program, a test
makes the same model with `modelOf(program)(state)`.

A view is `(model, dispatch) => Node`, and `dispatch` only takes **offered** messages, a brand that only
`offers` creates. So the view attaches a handler only when there is an offer, and building a message in the
view does not compile:

```ts
dispatch({ _tag: 'SaveClicked' }) // error: not an Offered<Message>
```

Sending is an effect, `Effect<void>` with no error and no services: nothing is sent until it runs. A renderer
built on Effect runs it as it is. One whose handlers are plain callbacks, like snabbdom's, wraps it with
`dispatchUnsafe(dispatch)`, which sends at once.

- A model may offer **less** than `update` accepts (e.g. to hide an action), never more.
- **Input is never a reason to reject.** Whatever is typed is stored, and its validity becomes model data:
  "Save" is not offered for a blank name. `offerInput` asks `update` with the current value, and the answer
  holds for any value.
- **Cost:** each offer runs `update` once per drawn frame. Keep the rejecting branches cheap, and in long
  lists offer per-item actions only for the items on screen.

### Commands

A command is **data**: a value of the program's own `Command` type, usually a `Data.TaggedEnum`, that says
what `update` decided to do (`Command.Save({ name })`). The program's `runCommand(command)` is the only place
that knows how it happens: it returns an `Execution<Message, R>`, an `Effect` that produces an optional
message (`None` for effects that only act on the world). A test of `update` can then say what it decided,
`expect(commands).toEqual([Command.Save({ name: 'Ada' })])`, without running anything, and `onApplied` and
the logs see it too.

- An execution's error channel is `never`: an expected failure becomes a message, so that `update` decides
  what it means. `attempt(effect, { onSuccess, onFailure })` does that for an effect that may fail.
- Everything an execution needs is in its command: `runCommand` gets no state.
- `R` is what the executions need (services). `run` requires it, so you provide it once, around the
  program. `update` has none in its type.
- A program without commands has `never` as its `Command`, and `absurd` (`effect/Function`) as its
  `runCommand`.
- An operation in progress is a state that only its completion leaves (`isSaving` in
  [`form`](examples/form/form.ts)), and `update` rejects the completion in any other state. Commands cannot be
  cancelled, so a completion always belongs to the operation in progress; give operations an id only when
  several of a kind can overlap.
- A **defect** (`Effect.die`, a thrown exception) is a bug: the program dies. Never catch it to turn it into a
  message.

### Subscriptions

`subscriptions(state)` returns a `HashMap` from keys to **subscriptions**. A subscription is an Effect
`Channel` of messages that takes no input and cannot fail, and it **never ends in silence**: either it never
ends (its end value is `never`, as for a clock), or it ends with **one last message**, which `update` receives
like the others. A download can send its progress, end with its file, and be cancelled by dropping its key.

After every change of state, the engine compares the keys, by value:

- a key that **appears** starts its subscription;
- a key that **stays** keeps it running, untouched; one that has ended is **not** started again, since
  `update` has its last message and decides whether to drop the key;
- a key that **disappears** interrupts it; if the key comes back, it starts anew.

So what the program listens to depends on its state: in [`list`](examples/list/stopwatch.ts), a stopwatch
ticks only while it runs.

- **From a stream**, which may end, decide what its end means. To keep listening to nothing until the key
  goes away: `Stream.toChannel(stream).pipe(Channel.flattenArray, Channel.concatWith(() => Channel.never))`;
  or end with `Channel.die` if the end is a bug.
- **Failures** become messages too: retry transient errors at the source (`Stream.retry` with a `Schedule`),
  or end with a message, and let `update` drop the key and bring it back to try again.
- A **defect** ends the run, like any defect.

### Rejections: stale or bug

Every frame's `dispatch` is bound to the state the frame was drawn from. When `update` rejects a message, the
engine looks at where it came from:

| The message came from                             | Meaning                                                     | What happens                            |
| ------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| a frame whose state **accepts** it (a double tap) | the user acted on something already gone                    | ignored                                 |
| a command or a subscription                       | a completion that arrived too late                          | ignored                                 |
| a frame whose state **rejects** it too            | the model offered something `update` rejects: they disagree | a **bug**, handled as `onRejected` says |

A bug is a bug however many messages arrived in between: a subscription that ticks often cannot hide it.

### Composing programs

`embed(child, options)` lifts a child program (a page, a dialog) into its parent, and `embedEach` a
collection of them, each with an id (the cards of a list):

- `wrap` turns a child's message into the parent's; `get` and `set` read and write the child's state. When
  `get` returns `None` the child is absent, and its messages are rejected.
- `key` namespaces the child's subscription keys (with the id, for `embedEach`, so ids must compare by
  value). `getSubscribed` (`subscribed` for `embedEach`) decides which children listen: a hidden page can keep
  receiving its completions without listening to the world.
- A child never acts on its parent: it emits **events**, and `onEvent` decides. The types require `onEvent`
  exactly when the child has events.
- `wrapCommand` turns a child's command into the parent's, usually a case that holds it
  (`Command.About({ command })`); the types require it exactly when the child has commands.
- They return the child's `update` and `subscriptions` lifted into the parent, `liftCommands`, `runCommand`
  and `makeModel`. When the parent adds a child, it puts the child's initial state where it belongs, and
  starts its `init` commands through `liftCommands`. The parent's own `runCommand` hands the child's case to
  the returned `runCommand`, which runs the child's interpreter and wraps its messages. The parent's model
  holds the child's as the returned `makeModel(childState)` makes it, with the offers of the child's own
  `update`.

In the view, `mapDispatch(dispatch, wrap)` lets the child's view send through the parent's `dispatch`. Pass
it the same `wrap` given to `embed`: that is what keeps the child's offers valid for the parent. See
[`pages`](examples/pages) and [`list`](examples/list).

### Running

`run(program, render, options)` starts the program and hands `render` the stream of frames; the run ends when
`render` ends. A frame's model is made the first time it is read, so a renderer that skips frames (e.g. one
per animation frame) never pays for the others, and a message that leaves the very same state (`===`) makes
no frame. In a browser, start it with `BrowserRuntime.runMain` from `@effect/platform-browser`, as the
examples do, so that a program that dies is reported. `RunOptions`:

- **`onRejected`** (required): `'die'` fails the run with `RejectedMessage`, which is what you want while
  developing; `'ignore'` drops the message and goes on, safe since the state did not change, and then
  requires `onBug`.
- **`onBug(bug)`** hears every `Bug`, e.g. for a crash-reporting service: a `Defect` (always fatal, with
  `where` it happened) or a `Rejected` message.
- **`describeMessage`** and **`describeCommand`** say how a message and a command appear in the logs: by
  default only their `_tag`, never their data.
- **`onApplied(applied)`** hears every accepted message, with the states before and after it and the commands
  it started, before its frame is drawn: for devtools, session recordings or analytics. Keep it quick.

The run fails with the first defect. It logs with Effect's logger: `debug` for the message loop and the
subscriptions, `error` for bugs.

### Testing

`update` and `makeModel` are pure, so most tests need no runtime. `@fgaudo/effect-tea/testing` has a tool for
each level, all of them used in the examples' tests:

| Tool                                                       | Runs                                               | For                                           |
| ---------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------- |
| `applyAll(update)(messages, from)`                         | `update` only; returns the state, commands, events | the rules, message by message                 |
| `dispatchViolations(update, { repeatable? })(state, msgs)` | `update`, on what the real view can send           | the view and `update` agree, in any state     |
| `simulate(program)(messages, from)`                        | `update` and the commands, each completing at once | a flow with its services, without a runtime   |
| `drive(program, scenario, options?)`                       | the program with `run`, subscriptions included     | a user's scenario, as the program really runs |

- Commands are data, so assert them: `applyAll` returns the commands `update` returned, and `simulate` every
  command it ran. `simulate` takes `update` and `runCommand` (a program has both): the program's own, with its
  services provided, or one of the test's that answers each command and needs none.
- A rejection of one of your messages fails `applyAll` and `simulate`. Assert expected rejections with
  `isRejected(update(message)(state))`, not by comparing states.
- `dispatchViolations` reports each message that `update` rejects in `state` (`Rejected`), and each one that
  acts again when sent twice from the same frame (`ActsTwice`: a double tap would repeat a one-shot action),
  except the `repeatable` ones. Collecting what the view can send depends on the renderer (`messagesSentBy`
  in `examples/snabbdom.ts`).
- `drive` gives the scenario a `Driver`: `waitFor(select)` waits for a frame whose model `select` maps to
  `Some`; `send(select)` waits for a frame on which `select` finds an `Action` (`tap(offer)`,
  `input(offer, value)`), and does it. A rejected message is always fatal there. Wait for what the model
  shows, never for "the next frame"; a wait fails after `patience` (2 seconds), measured with the real clock,
  so that a `TestClock` can move the program's time.

## API reference

From `@fgaudo/effect-tea`:

| Export                                                   | What it is                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Program<State, Model, Message, Command, R, Event?, K?>` | `init`, `update`, `runCommand`, `subscriptions`, `makeModel`                              |
| `Update`, `Transition`, `Step`                           | `(message) => (state) => Step` or `Rejected`; a `Step` is `{ state, commands?, events? }` |
| `reject`, `Rejected`, `isRejected`                       | the rejection `update` returns, and its check                                             |
| `Execution<Message, R>`, `RunCommand`                    | `Effect<Option<Message>, never, R>`, how a command happens; `(command) => Execution`      |
| `attempt`                                                | an execution from an effect that may fail: its failure becomes a message                  |
| `Subscription`                                           | a `Channel` of messages that never ends, or ends with one last message; kept by key       |
| `Subscribe`, `Subscriptions`                             | `(state) => HashMap<K, Subscription<Message>>`, reconciled by key                         |
| `modelOf`                                                | a program's model in a state, as `run` makes it                                           |
| `Offers`                                                 | what `makeModel` receives: `offer(message)` and `offerInput(toMessage, current)`          |
| `Offer`, `InputOffer`, `Offered`                         | an optional offered message; an optional function to one; the brand                       |
| `View`, `Dispatch`, `mapDispatch`                        | `(model, dispatch) => Node`; a dispatch of offered messages; a child's dispatch           |
| `dispatchUnsafe`                                         | a dispatch that sends at once, for a renderer's plain callbacks                           |
| `embed`, `embedEach`                                     | lift a child program, or a collection of them, into a parent                              |
| `run`, `Frame`, `RunOptions`                             | run a program with a renderer; what the renderer draws; how the program runs              |
| `Applied`                                                | what `onApplied` hears: a message, the states around it, its revision and commands        |
| `RejectionOptions`                                       | `onRejected` (`'die'` or `'ignore'`) with the `onBug` it requires                         |
| `Bug`, `BugReporter`, `DefectSource`                     | what `onBug` receives; `onBug` itself; where a defect happened                            |
| `RejectedMessage`                                        | the defect the run fails with when a rejection is fatal                                   |

From `@fgaudo/effect-tea/testing`: `applyAll`, `simulate`, `Simulation`, `drive`, `DriveOptions`, `Driver`,
`Action`, `tap`, `input`, `dispatchViolations`, `DispatchViolation`.

## Development

`bun run typecheck`, `bun run lint` and `bun run test` check the package and the examples. `bun run build`
compiles `src/` into `dist/`; it also runs before `bun pm pack`. What changed in each version is in
[`CHANGELOG.md`](CHANGELOG.md).

## License

[MIT](LICENSE) © Francesco Gaudenzi
