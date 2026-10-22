# Changelog

Versions follow [semantic versioning](https://semver.org): before 1.0, a breaking change raises the minor
version, and everything else, features included, the patch version.

## 0.5.1 (unreleased)

### Added

- A program may start from `flags`, as in Elm, given by whoever starts it: declared in its type
  (`Program<{ …; flags: Flags }>`, `parent<{ …; flags: Flags }>()`), they make `init` a function of them,
  `init: (flags) => ({ state, commands })`, and a parent's `init: (children) => (flags) => …`. A parent starts
  such a child with `children.<child>.init(flags)` (`init(id, flags)` for children by id), `run` and `drive` take
  the root's in their options (`flags`), and `rehearse` takes them or a step to start `from`. `FlagsOf` reads them
  back from a program. A page can then start from what it was opened for, rather than from a state that waits
  for it.

## 0.5.0 (2026-10-22)

### Changed

- A parent's `init` is a function of its `children`, as `update` and `onEvent` are, so that a child there from the
  start is started with `children.<child>.init`, its commands lifted. Reading the child program's `init.state`
  left its commands behind, with no error. Write `init: () => ({ … })` where you wrote `init: { … }`, and start
  each child there from the start with its handle's `init` (`state` and `commands`).

## 0.4.0 (2026-10-22)

### Changed

- `onRejectedInput`'s function gets the `RejectedInput` itself, the very defect `'die'` raises, so that it can go
  to a crash-reporting service as an error. `InputRejection` is gone: replace `InputRejection<Message>` with
  `RejectedInput`.
- `RejectedInput` and `RejectedOffer` hold the program's message in `rejected` (typed as the program's in
  `onRejectedInput`), no longer in `message`: an error's `message` is now a string that names only the message's
  tags, as a report's title expects, where it was the message itself (shown as `[object Object]`). Read
  `rejection.rejected` where you read `rejection.message`.

### Added

- `rehearse(program, scenario, { from })`, a testing tool between `simulate` and `drive`: it acts on what the
  current model offers, as `drive` does, but without a runtime, and each command waits until the test runs it
  (`run`, `runAll`), so that a test decides what the user does while a command is under way and when its answer
  arrives. A subscription's message is one the test says was heard (`hear`), while its key is in the state. It
  fails on a command still pending at the end.
- `Action`, `tap` and `input` serve `rehearse` as well as `drive`.
- `subscriptionsOf(program)(state)`, what a program listens to in a state, by key, as `run` reconciles it: empty
  for a program without `subscriptions`, so that a test reads them as it reads a model with `modelOf`. A child's
  subscriptions are under `[<child>, key]`, or `[<child>, id, key]` for children by id, as the README now says.

### Fixed

- A parent made a new state of its own for a child's message that left the child's state as it was, so that the
  very same state drew a new frame, made a new revision and reconciled the subscriptions again. It now keeps its
  state, while the child's commands and events still go through.
- The README says what a rejection holds (the message, with what the user typed) and that the debug logs of
  subscriptions show their keys. It no longer suggests turning a stream that ends into a subscription that never
  does, and shows how to keep a connection open while a value it uses changes: a service, a subscription under a
  key that stays the same, and a command.

## 0.3.1 (2026-10-22)

### Added

- `attempt({ onSuccess, onFailure })`, with the handlers alone, returns the function that takes the effect, to
  end a `pipe` or an `Effect.fn`: `Effect.fn('Save')(function*() { … }, attempt({ onSuccess, onFailure }))`.

### Fixed

- Each command and each subscription has a scope of its own. What they acquired with the `Scope` service
  (`Effect.acquireRelease`, `Effect.forkScoped`, `Stream.fromEffect` of a scoped effect) was kept in the run's
  scope: released only when the run ended, after a command had answered or a subscription's key had gone
  away, and even before the command or subscription still running then was interrupted. A command's scope now
  closes before its message reaches `update`, a subscription's when it ends or its key goes away. `simulate`
  gives each command its own scope as well. `run`, `simulate` and `drive` therefore no longer require a
  `Scope` for the program's services; the renderer has one of its own too. A fiber that a command forks with
  `forkScoped` now stops when the command ends: work that should go on is a subscription.
- What commands, subscriptions, the renderer, `onApplied` and `onRejectedInput` logged piled up for as long as
  the run lasted, as events of a span that lives as long as the run (Effect keeps every log as an event of the
  current span, even one that has ended). The run's fibers now see the span of whoever runs it as an external
  span, which keeps no events and is still the parent of the spans they open.
- The models of children by id under a shared state object (e.g. the program's initial state) were kept for
  as long as that object lived, one for every id it was ever shown under. Only the models of the last two
  frames are kept now, enough for a renderer to skip what did not change.
- A parent used as a child by id is one program for all its instances: two of them whose children had the same
  id and state object got the same models, whose offers sent to the first one. A child's model is now kept by
  its place from the root as well.

## 0.3.0 (2026-10-21)

### Added

- `parent<{ state; command?; event?; external? }>()`, which makes a parent from declared children: `child` for
  one, `each` for children by id, and `compose`. The library routes the children's messages
  (`{ _tag: <child>, message }`, with `id` for `each`), commands, subscriptions (keyed under the child's name
  and id) and models; the parent writes only where each child lives (`get`, `set`, `subscribed`), what their
  events mean (`onEvent`, required exactly when a child has events), and its own `update`, `runCommand` and
  `subscriptions`. Its `update` and `onEvent` get handles to the children: `init` starts one, and `update`
  applies to it one of the messages its type names as `external`, returning the parent's transition. Its `makeModel` gets `children`, the children's models.
  An own message named like a child does not compile.
- `StateOf`, `ModelOf`, `MessageOf`, `CommandOf`, `EventOf`, `ExternalOf` and `ServicesOf` read a program's
  types back from it, e.g. `MessageOf<typeof app>` for a parent's messages.
- `messageOf` in `@fgaudo/effect-tea/testing`: the message an offer sends, as the root of its program receives
  it, for tests that collect what a view sends.

### Changed

- An offer is an opaque token that carries its message as the root of the program receives it, and there is
  one `dispatch` per run, the same function for every frame and every child: `Dispatch` and `Frame` lose their
  `Message` parameter (`Dispatch`, `Frame<Model>`, `View<Model, Node>`), and `dispatch` takes an offer of any
  level of the program. A renderer can therefore memoize a child's view on its model and the dispatch (e.g.
  snabbdom's `thunk`).
- Rejections are judged by the offer, no longer by the frame's state: every offer was checked when its model
  was made, so a rejected one is stale and ignored, except a value typed into an `offerInput` that `update`
  rejected in the state the offer was made in: a bug, handled as `onRejectedInput` says (the revision of an
  `InputRejection` is that state's). An offer made by another run (e.g. by `modelOf`) is a defect.
- The names of that bug say what it is: `onRejected` is `onRejectedInput`, `OnRejected` is `OnRejectedInput`,
  `Rejection` is `InputRejection`, and the defect `RejectedMessage` is `RejectedInput`.
- `Program` names its types: `Program<{ state: State; model: Model; message: Message }>`, with `command`,
  `services`, `event` and `external` when the program has them, instead of
  `Program<State, Model, Message, Command, R, Event, K>`.
- `offerInput(toMessage, current)` takes its value type from `current`, widened: a literal `current` such as `true`
  no longer narrows it to `true`, and `toMessage` still needs no annotation.
- By default the logs describe a child's message or command by the tags on its way
  (`Home › Products › Deleted`), no longer by the outermost tag alone; still never by its data.
- `drive`'s `Action`, `tap` and `input` take offers of any level (`Action`, no longer `Action<Message>`), and
  `Driver<Model>` loses its `Message` parameter.
- `embed`, `embedEach` and `mapDispatch` are removed: `parent` replaces them, and a child's offers need no
  wrapping.

To upgrade:

- Write each `Program<State, Model, Message, …>` as `Program<{ state: State; model: Model; message: Message; … }>`,
  and drop the `Message` parameter of `View`, `Dispatch` and `Frame`.
- Rename `onRejected` to `onRejectedInput` in the options of `run`, and `OnRejected`, `Rejection` and
  `RejectedMessage` to `OnRejectedInput`, `InputRejection` and `RejectedInput`.
- Replace a parent built with `embed` and `embedEach` by `parent<{ state: State; … }>()`: declare each child
  with `child(program, { get, set, subscribed? })` or `each(program, { get, set, subscribed })`, move the
  `onEvent` of each `embed` into `compose`'s `onEvent` under the child's name, and drop `wrap`, `wrapCommand`,
  `key` and `liftCommands`. Where the parent's `update` sent a child a message, use
  `children.<Child>.update(message)` and name that message in the child's type as `external`; where it started
  a child, use `children.<Child>.init`. In `makeModel`, replace each embedded `makeModel(childState)` with
  `children.<Child>(state)`. Name the parent's messages with `MessageOf<typeof parent>`.
- In views, drop `mapDispatch`: pass the run's `dispatch` to a child's view as it is.
- In tests that collect what a view sends, read each offer with `messageOf`.

## 0.2.0 (2026-10-18)

### Added

- `onApplied`, an option of `run`: hears every message `update` accepts, in order, with the states before and
  after it, its revision and how many commands it started, before its frame is drawn. For devtools, session
  recording or analytics. A defect in it ends the run, like any other.
- `simulate` in `@fgaudo/effect-tea/testing`: runs a flow without a runtime, commands included, and returns
  the final state, every accepted message, every event, and the messages of commands that `update` rejected
  (`ignored`), so that a test can catch a completion its state machine drops.
- `drive` in `@fgaudo/effect-tea/testing`: runs a program with `run`, subscriptions included, and lets a
  scenario act as its user through a `Driver` (`waitFor`, `send`, `latest`), with the actions `tap` and
  `input`. A rejected message is always fatal; a wait fails after `patience`, measured with the real clock.
- `missingOffers` in `@fgaudo/effect-tea/testing`: of the messages a user could ask for in a state, those that
  `update` accepts and the view does not send, i.e. the actions a model leaves out by mistake. `withheld`
  excludes what a model hides on purpose.
- `applyAll` also returns the `events`, in order.
- The `makeModel` of `embed` and `embedEach` keeps a child's model while the child's state is the same object,
  so that a renderer can memoize the child's view on it.
- The step that `onEvent` returns, in `embed` and `embedEach`, may emit events of the parent's own, which come
  out of the returned `update`: a child's event can now lead to an event for the parent's parent, in the same
  transition.

### Changed

- The README clarifies immutable state and gives direct guidance on choosing a testing tool, with shorter
  explanations of the advanced concepts.
- An offer is an `Offered<Message>`, no longer an `Option`: `offer(message)` returns the offered message and
  throws `RejectedOffer` when `update` rejects it, and `offerInput(toMessage, current)` returns the function
  that makes the message. Which actions exist in a state is said by the model's shape, a case for each state
  the view distinguishes, so the view never checks an `Option`, and a model that promises an action the state
  does not allow dies as it is made instead of drawing a control that does nothing. `Offer` and `InputOffer`
  are gone; `tap(message)` and `input(toMessage, value)` in `testing` take the offered values and return an
  `Action`. To upgrade, turn each model whose actions depend on the state into a union with a case per state,
  holding only the actions of that case, pick the case from the state, and, in scenarios, return
  `Opt.some(tap(...))` from `send` where the case has the action.
- `makeModel` receives the offers: `makeModel(state, { offer, offerInput })`. The library makes them from the
  program's own `update` and the very state it passes, so a model can no longer ask another `update`, or
  about another state, and `offers` is no longer exported. `modelOf(program)(state)` makes a program's model
  outside `run` (e.g. in a test), and `embed` and `embedEach` return `makeModel(childState)`, the child's
  model with the child's offers, for the parent's model. To upgrade, take `{ offer, offerInput }` as
  `makeModel`'s second argument instead of calling `offers(update, state)`, call the `makeModel` that
  `embed` returns instead of the child's, and replace `program.makeModel(state)` with
  `modelOf(program)(state)`.
- Commands are data. `update` returns values of the program's own `Command` type, and a new piece of the
  program, `runCommand`, turns each one into an `Execution<Message, R>` (the effect that used to be called
  `Command`). Tests assert the commands themselves instead of counting them, and `onApplied` receives them:
  `Applied.commands` is the list, no longer a count, and `describeCommand` says how they appear in the logs.
  `Step` and `Update` lose their services (`Step<State, Command, Event>`, `Update<State, Message, Command,
  Event>`), which only `runCommand` needs; `Program` gains a `Command` parameter
  (`Program<State, Model, Message, Command, R, Event, K>`). `embed` and `embedEach` take a `wrapCommand`
  when the child has commands, and return the child's `runCommand` with its messages wrapped, for the
  parent's interpreter. `simulate` takes the program (or its `update` and `runCommand`), so a test can pass
  an interpreter of its own, and its result lists the commands it ran. To upgrade: declare a command union,
  move each command's effect into `runCommand` (a program without commands has none, see below),
  return the union's values from `update`, rename `Command` to `Execution`, add `wrapCommand` to
  the `embed` of a child with commands and delegate to the `runCommand` it returns, and pass the program to
  `simulate`.
- `Dispatch` returns an `Effect<void>` instead of sending at once, so a view or renderer built on Effect sends
  with `yield* dispatch(message)`. `dispatchUnsafe(dispatch)` is the callback that sends at once, for a
  renderer whose handlers are plain functions. To upgrade, wrap the dispatch your renderer's callbacks call
  with `dispatchUnsafe`, and yield it where you called it inside an Effect. `Action`s in `testing` return
  the effect too.
- `embed` and `embedEach` return `liftCommands` instead of `init`. `init(step)` returned the child's state
  as it was given, with its commands wrapped: the parent only needs the commands. To upgrade, put the child's
  initial state in the parent's state yourself, and replace `init(step).commands` with
  `liftCommands(step.commands)` (`liftCommands(id, step.commands)` for `embedEach`).
- A renderer slower than the program gets only the latest frame, instead of every frame in turn: a burst of N
  messages was drawn N times. The README explains why a view should not write the model's text into an input
  the user is typing into ("Inputs the user types into"), and the rule that `update` accepts typing in every
  state where the field exists.
- Defects are no longer reported through an option: the run fails with them, wherever they happen, and whoever
  runs it reports them. `onBug` heard only the defects of `update`, the commands, the subscriptions and
  `onApplied`, not those of `makeModel`, the view, the renderer or `subscriptions`. `onRejected` is `'die'` or
  the function that reports a rejection while the program goes on, in place of `'ignore'` with `onBug`; `Bug`,
  `BugReporter`, `DefectSource` and `RejectionOptions` are gone, and `Rejection` and `OnRejected` are new.
  `RunOptions` and `DriveOptions` lose their `K` parameter. To upgrade, report defects with `Effect.tapCause`
  around `run`, replace `{ onRejected: 'ignore', onBug }` with `{ onRejected: (rejection) => ... }`, and drop
  `onBug` where `onRejected` is `'die'`.
- When a subscription's key goes away, what it had sent that `update` has not received yet is dropped:
  nothing arrives from it after the message that stopped it. Before, such messages reached `update`, and how
  many depended on how the fibers were scheduled. A message that must not be lost belongs to a command.
- A program has a `runCommand` exactly when it has commands, and `subscriptions` only when it listens to
  something: the types require `runCommand` when `Command` is not `never`, and reject it otherwise.
  `Program`'s `Command` and `R`, and `Update`, `Step` and `Transition`'s `Command`, default to `never`, so a
  program without commands nor services is a `Program<State, Model, Message>`. `simulate` follows the same
  rule. To upgrade, remove `runCommand: absurd` and `subscriptions: () => HashMap.empty()`, and read a
  program's subscriptions from the function you give it rather than from the program.
- `Subscribe` is renamed `Subscriptions`, the type of a program's `subscriptions`, and the former
  `Subscriptions` (the `HashMap` it returns) is no longer exported. To upgrade, rename `Subscribe` to
  `Subscriptions`, and write `HashMap<K, Subscription<Message, R>>` where you used the old `Subscriptions`.
- `embed`'s `getSubscribed` is renamed `subscribed`, as in `embedEach`.
- Every accepted message is logged at `debug`, also when it leaves the state as it was and starts nothing.
- `DriveOptions` is `RunOptions` without `onRejected`, plus `patience`.

## 0.1.0 (2026-10-17)

First release.
