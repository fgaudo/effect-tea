# Changelog

Versions follow [semantic versioning](https://semver.org): before 1.0, a breaking change raises the minor
version.

## 0.2.0 (unreleased)

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
- `applyAll` also returns the `events`, in order.
- The `makeModel` of `embed` and `embedEach` keeps a child's model while the child's state is the same object,
  so that a renderer can memoize the child's view on it.
- The step that `onEvent` returns, in `embed` and `embedEach`, may emit events of the parent's own, which come
  out of the returned `update`: a child's event can now lead to an event for the parent's parent, in the same
  transition.

### Changed

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
  move each command's effect into `runCommand` (`absurd` from `effect/Function` for a program without
  commands), return the union's values from `update`, rename `Command` to `Execution`, add `wrapCommand` to
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

## 0.1.0 (2026-10-17)

First release.
